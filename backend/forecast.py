from collections import defaultdict
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from db import get_session
from models import Income, Expense, Project, PayrollRun, Employee, TaxRecord
from common import D
from calc import f
from security import require_access
from cash import bank_balances
from tax import ppn_position

router = APIRouter(prefix='/api')
ZERO = Decimal('0')
ACTIVE = ('Approved', 'Running', 'On Hold')


def ym(d):
    return d.strftime('%Y-%m')


def add_months(y, m, k):
    t = y * 12 + (m - 1) + k
    return t // 12, t % 12 + 1


@router.get('/forecast')
async def forecast(months: int = 6, revenue_change_pct: float = 0, expense_change_pct: float = 0, collection_pct: float = 100,
                   user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    months = min(max(months, 1), 24)
    today = date.today()
    keys = [f'{y:04d}-{m:02d}' for y, m in (add_months(today.year, today.month, k) for k in range(months))]
    first, last = keys[0], keys[-1]
    rev_k, exp_k, coll_k = Decimal(str(1 + revenue_change_pct / 100)), Decimal(str(1 + expense_change_pct / 100)), Decimal(str(collection_pct / 100))
    inflow = defaultdict(lambda: defaultdict(Decimal))
    outflow = defaultdict(lambda: defaultdict(Decimal))
    revenue = defaultdict(Decimal)

    incomes = (await s.scalars(select(Income).where(Income.status != 'Void'))).all()
    for i in incomes:
        open_amt = D(i.net_receivable) - D(i.paid_amount)
        if open_amt > 0 and i.status in ('Unpaid', 'Partial'):
            k = max(ym(i.due_date or i.date), first)
            if k <= last:
                inflow[k]['Piutang jatuh tempo'] += open_amt * coll_k
    billed = defaultdict(Decimal)
    for i in incomes:
        if i.project_id:
            billed[i.project_id] += D(i.dpp)
    for p in (await s.scalars(select(Project).where(Project.status.in_(ACTIVE)))).all():
        remaining = (D(p.contract_value) - billed[p.id]) * rev_k
        if remaining <= 0:
            continue
        end_k = ym(p.end_date) if p.end_date else last
        span = [k for k in keys if k <= max(end_k, first)] or [first]
        share = remaining / len(span)
        for k in span:
            revenue[k] += share
            inflow[k]['Sisa kontrak project'] += share * coll_k

    start3 = add_months(today.year, today.month, -3)
    from3 = f'{start3[0]:04d}-{start3[1]:02d}'
    hist = defaultdict(Decimal)
    expenses = (await s.scalars(select(Expense).where(Expense.status != 'Void'))).all()
    for e in expenses:
        k = ym(e.date)
        if from3 < k <= first and e.category not in ('Asset Acquisition',):
            hist[k] += D(e.total)
    avg_exp = (sum(hist.values(), ZERO) / 3) * exp_k
    payable = sum((D(e.total) for e in expenses if e.status == 'Unpaid'), ZERO)
    last_run = await s.scalar(select(PayrollRun).where(PayrollRun.status == 'Posted').order_by(PayrollRun.period.desc()))
    payroll = D(last_run.net) if last_run else sum((D(e.monthly_cost) for e in (await s.scalars(select(Employee).where(Employee.status == 'Aktif'))).all()), ZERO)
    payroll_basis = 'payroll terakhir' if last_run else 'biaya bulanan karyawan'
    recs = (await s.scalars(select(TaxRecord).where(TaxRecord.status != 'Void'))).all()
    for r in recs:
        if (r.side == 'payable' or r.kind == 'PPh 25') and r.status == 'Terutang' and not r.kind.startswith('PPN'):
            k = max(ym(r.due_date or r.date), first)
            if k <= last:
                outflow[k]['Pajak terutang'] += D(r.amount)
    for p in sorted({r.period for r in recs if r.kind.startswith('PPN')}):
        _, _, kk, mm = ppn_position(recs, p)
        if kk > mm:
            y, m = map(int, p.split('-'))
            k = max('%04d-%02d' % add_months(y, m, 1), first)
            if k <= last:
                outflow[k]['PPN kurang bayar'] += kk - mm
    paid_periods = set((await s.scalars(select(PayrollRun.period).where(PayrollRun.status == 'Posted'))).all())
    for idx, k in enumerate(keys):
        outflow[k]['Biaya operasional rata-rata'] += avg_exp
        if k not in paid_periods:
            outflow[k]['Gaji karyawan'] += payroll
        if idx == 0 and payable:
            outflow[k]['Utang usaha'] += payable

    opening = sum((v for _, v in (await bank_balances(s)).values()), ZERO)
    bal = opening
    rows = []
    for k in keys:
        tin, tout = sum(inflow[k].values(), ZERO), sum(outflow[k].values(), ZERO)
        rows.append({'month': k, 'opening': f(bal), 'inflow': f(tin), 'outflow': f(tout), 'net': f(tin - tout), 'closing': f(bal + tin - tout),
                     'revenue': f(revenue[k]), 'inflow_detail': {a: f(b) for a, b in inflow[k].items()},
                     'outflow_detail': {a: f(b) for a, b in outflow[k].items()}, 'deficit': bal + tin - tout < 0})
        bal += tin - tout
    return {'assumptions': {'months': months, 'revenue_change_pct': revenue_change_pct, 'expense_change_pct': expense_change_pct,
                            'collection_pct': collection_pct, 'avg_monthly_expense': f(avg_exp), 'monthly_payroll': f(payroll),
                            'payroll_basis': payroll_basis},
            'opening_balance': f(opening), 'closing_balance': f(bal), 'rows': rows,
            'min_balance': min((r['closing'] for r in rows), default=f(opening)),
            'deficit_months': [r['month'] for r in rows if r['deficit']]}
