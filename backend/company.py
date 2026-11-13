from collections import defaultdict
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from db import get_session
from models import Income, Expense, Project, ProjectBudget, Timesheet, OverheadAllocation, OverheadPool, Document, Party, Account, Journal, JournalLine, PayrollRun
from common import D
from calc import f, pct
from security import require_access
from ledger import parse_date
from cash import cash_flow, bank_balances

router = APIRouter(prefix='/api')
ZERO = Decimal('0')
OPEX = ('Overhead', 'Administrative Expense', 'Other Expense')


def _in_range(d, dfrom, dto):
    return (not dfrom or d >= dfrom) and (not dto or d <= dto)


@router.get('/reports/company')
async def company_report(date_from: str = '', date_to: str = '', entity_id: str = '', project_id: str = '', customer_id: str = '', category: str = '',
                         user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    dfrom, dto = parse_date(date_from), parse_date(date_to)
    projects = {p.id: p for p in (await s.scalars(select(Project))).all()}

    def keep(x, is_income):
        if x.status == 'Void' or not _in_range(x.date, dfrom, dto):
            return False
        if entity_id and x.entity_id != entity_id:
            return False
        if project_id and x.project_id != project_id:
            return False
        if customer_id:
            cust = x.customer_id if is_income else (projects[x.project_id].customer_id if x.project_id in projects else None)
            if cust != customer_id:
                return False
        return True

    incomes = [i for i in (await s.scalars(select(Income))).all() if keep(i, True)]
    expenses = [e for e in (await s.scalars(select(Expense))).all() if keep(e, False) and (not category or e.category == category)]
    revenue = sum((D(i.dpp) for i in incomes), ZERO) if not category else ZERO
    cat = defaultdict(Decimal)
    bonus = ZERO
    for e in expenses:
        if e.component == 'bonus':
            bonus += D(e.dpp)
        else:
            cat[e.category] += D(e.dpp)
    if not category or category == 'Labor Cost':
        for r in (await s.scalars(select(PayrollRun).where(PayrollRun.status == 'Posted'))).all():
            if _in_range(r.pay_date, dfrom, dto) and (not entity_id or r.entity_id in (None, entity_id)) and not project_id and not customer_id:
                cat['Labor Cost'] += D(r.gross)
    opex = sum((cat[c] for c in OPEX), ZERO)
    operating = revenue - cat['Direct Cost'] - cat['Labor Cost'] - bonus - opex
    acc_groups = {a.id: a.group_code for a in (await s.scalars(select(Account))).all()}
    stmt = select(JournalLine.account_id, func.sum(JournalLine.debit - JournalLine.credit)).join(Journal, Journal.id == JournalLine.journal_id)
    if dfrom:
        stmt = stmt.where(Journal.date >= dfrom)
    if dto:
        stmt = stmt.where(Journal.date <= dto)
    if entity_id:
        stmt = stmt.where(JournalLine.entity_id == entity_id)
    if project_id:
        stmt = stmt.where(JournalLine.project_id == project_id)
    below = defaultdict(Decimal)
    for aid, v in (await s.execute(stmt.group_by(JournalLine.account_id))).all():
        if acc_groups.get(aid) in ('7000', '8000') and not category:
            below[acc_groups[aid]] += D(v)
    net = operating - below['7000'] - below['8000']

    proj_ids = [pid for pid, p in projects.items() if (not entity_id or p.entity_id == entity_id) and (not project_id or pid == project_id)
                and (not customer_id or p.customer_id == customer_id) and p.status != 'Cancelled']
    reserve = sum((D(b.amount) for b in (await s.scalars(select(ProjectBudget).where(ProjectBudget.component == 'cadangan', ProjectBudget.project_id.in_(proj_ids or ['-'])))).all()), ZERO)
    ts = [t for t in (await s.scalars(select(Timesheet).where(Timesheet.project_id.in_(proj_ids or ['-'])))).all() if _in_range(t.date, dfrom, dto)]
    pools = {p.id: p.period for p in (await s.scalars(select(OverheadPool))).all()}
    oh_alloc = sum((D(o.amount) for o in (await s.scalars(select(OverheadAllocation).where(OverheadAllocation.is_active.is_(True), OverheadAllocation.project_id.in_(proj_ids or ['-'])))).all()
                    if _in_range(date.fromisoformat(pools.get(o.pool_id, '1900-01') + '-01'), dfrom.replace(day=1) if dfrom else None, dto)), ZERO)
    cf = await cash_flow(s, dfrom, dto, entity_id or None)

    monthly = defaultdict(lambda: {'revenue': ZERO, 'expense': ZERO})
    for i in incomes:
        monthly[i.date.strftime('%Y-%m')]['revenue'] += D(i.dpp) if not category else ZERO
    for e in expenses:
        monthly[e.date.strftime('%Y-%m')]['expense'] += D(e.dpp)
    parties = {p.id: p.name for p in (await s.scalars(select(Party))).all()}
    by_project = defaultdict(lambda: {'revenue': ZERO, 'expense': ZERO})
    for i in incomes:
        by_project[i.project_id or '-']['revenue'] += D(i.dpp)
    for e in expenses:
        by_project[e.project_id or '-']['expense'] += D(e.dpp)
    return {
        'filters': {'date_from': date_from, 'date_to': date_to, 'entity_id': entity_id, 'project_id': project_id, 'customer_id': customer_id, 'category': category},
        'summary': {'revenue': f(revenue), 'direct_cost': f(cat['Direct Cost']), 'labor_cost': f(cat['Labor Cost']), 'overhead': f(cat['Overhead']),
                    'actual_bonus': f(bonus), 'operational_expense': f(opex), 'administrative_expense': f(cat['Administrative Expense']),
                    'other_expense': f(cat['Other Expense']), 'asset_acquisition': f(cat['Asset Acquisition']),
                    'operating_profit': f(operating), 'depreciation': f(below['7000']), 'tax_expense': f(below['8000']), 'net_profit': f(net),
                    'net_margin': pct(net, revenue), 'internal_reserve': f(reserve), 'cash_flow': cf['net_change']},
        'allocation_check': {'labor_allocated_to_projects': f(sum((D(t.total) for t in ts), ZERO)), 'labor_actual_company': f(cat['Labor Cost']),
                             'overhead_allocated_to_projects': f(oh_alloc), 'overhead_actual_company': f(cat['Overhead'])},
        'monthly': [{'month': m, 'revenue': f(v['revenue']), 'expense': f(v['expense']), 'profit': f(v['revenue'] - v['expense'])} for m, v in sorted(monthly.items())],
        'by_project': [{'project_id': pid, 'project': (f'{projects[pid].code} · {projects[pid].name}' if pid in projects else 'Tanpa project (umum)'),
                        'customer': parties.get(projects[pid].customer_id) if pid in projects else None,
                        'revenue': f(v['revenue']), 'expense': f(v['expense']), 'profit': f(v['revenue'] - v['expense'])} for pid, v in by_project.items()],
        'cash_flow': cf,
    }


async def financial_summary(s):
    incomes = (await s.scalars(select(Income).where(Income.status != 'Void'))).all()
    expenses = (await s.scalars(select(Expense).where(Expense.status != 'Void'))).all()
    bals = await bank_balances(s)
    total_in = sum((D(i.dpp) for i in incomes), ZERO)
    total_out = sum((D(e.dpp) for e in expenses), ZERO)
    receivable = sum((D(i.net_receivable) - D(i.paid_amount) for i in incomes), ZERO)
    payable = sum((D(e.total) for e in expenses if e.status == 'Unpaid'), ZERO)
    doc_links = set((await s.execute(select(Document.linked_type, Document.linked_id).where(Document.linked_type.in_(['income', 'expense'])))).all())
    today = date.today()
    alerts = []
    for i in incomes:
        if i.status in ('Unpaid', 'Partial'):
            overdue = bool(i.due_date and i.due_date < today)
            alerts.append({'type': 'unpaid_invoice', 'id': i.id, 'link': '/pemasukan', 'project_id': i.project_id,
                           'message': f"Invoice {i.invoice_number or i.number} {'lewat jatuh tempo' if overdue else 'belum lunas'}",
                           'project': i.description or i.number, 'amount': f(D(i.net_receivable) - D(i.paid_amount)), 'overdue': overdue})
    for kind, rows, link in (('income', incomes, '/pemasukan'), ('expense', expenses, '/pengeluaran')):
        for x in rows:
            if (kind, x.id) not in doc_links:
                alerts.append({'type': 'missing_document', 'id': x.id, 'link': link, 'project_id': x.project_id,
                               'message': f'Bukti transaksi {x.number} belum dilampirkan', 'project': x.description or x.number, 'amount': f(x.total)})
    return {'summary': {'total_income': f(total_in), 'total_expense': f(total_out), 'profit': f(total_in - total_out),
                        'bank_balance': f(sum((v for _, v in bals.values()), ZERO)), 'receivable': f(receivable), 'payable': f(payable)},
            'alerts': alerts}


@router.get('/dashboard/finance')
async def finance_dashboard(user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    data = await financial_summary(s)
    months = []
    y, m = date.today().year, date.today().month
    for _ in range(6):
        months.insert(0, f'{y:04d}-{m:02d}')
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    start = date.fromisoformat(months[0] + '-01')
    trend = {k: {'income': ZERO, 'expense': ZERO} for k in months}
    for i in (await s.scalars(select(Income).where(Income.status != 'Void', Income.date >= start))).all():
        trend.setdefault(i.date.strftime('%Y-%m'), {'income': ZERO, 'expense': ZERO})['income'] += D(i.dpp)
    for e in (await s.scalars(select(Expense).where(Expense.status != 'Void', Expense.date >= start))).all():
        trend.setdefault(e.date.strftime('%Y-%m'), {'income': ZERO, 'expense': ZERO})['expense'] += D(e.dpp)
    data['trend'] = [{'month': k, 'income': f(trend[k]['income']), 'expense': f(trend[k]['expense'])} for k in months]
    return data

