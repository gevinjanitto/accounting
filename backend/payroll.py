from collections import defaultdict
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from db import get_session
from models import PayrollRun, PayrollLine, Employee, Timesheet, TaxRecord, CashTransaction, FixedAsset, AssetDepreciation, Expense, Journal
from common import row, audit, D, clean
from calc import f
from security import require_access
from ledger import acc_id, post_journal, reverse_source, next_number, parse_date, bank_coa_id, reverse_journal
from cash import add_cash, load_bank
from tax import rate_for, due_for

router = APIRouter(prefix='/api')
ZERO = Decimal('0')
CENT = Decimal('0.01')


def q2(v):
    return D(v).quantize(CENT)


def month_range(period):
    try:
        y, m = map(int, period.split('-'))
        start = date(y, m, 1)
    except ValueError:
        raise HTTPException(422, 'Format periode harus YYYY-MM')
    end = date(y + (m == 12), m % 12 + 1, 1)
    return start, end


async def run_detail(s, run):
    lines = (await s.scalars(select(PayrollLine).where(PayrollLine.run_id == run.id))).all()
    emps = {e.id: e for e in (await s.scalars(select(Employee))).all()}
    start, end = month_range(run.period)
    alloc = defaultdict(Decimal)
    for t in (await s.scalars(select(Timesheet).where(Timesheet.date >= start, Timesheet.date < end))).all():
        alloc[t.employee_id] += D(t.total)
    out = []
    for l in lines:
        e = emps.get(l.employee_id)
        d = row(l)
        d['employee_name'] = e.name if e else '—'
        d['employee_code'] = e.code if e else ''
        d['monthly_cost'] = f(e.monthly_cost) if e else 0
        d['allocated_to_projects'] = f(alloc[l.employee_id])
        d['unallocated'] = f(D(l.gross) - alloc[l.employee_id])
        out.append(d)
    return {**row(run), 'lines': out, 'allocated_total': f(sum((alloc[l.employee_id] for l in lines), ZERO))}


def recalc_line(l: PayrollLine):
    l.gross = q2(D(l.base_salary) + D(l.allowance) + D(l.other_income))
    l.pph21 = q2(l.gross * D(l.pph21_rate) / 100)
    l.net = l.gross - l.pph21 - D(l.deductions)


def recalc_run(run, lines):
    run.gross = sum((D(l.gross) for l in lines), ZERO)
    run.pph21 = sum((D(l.pph21) for l in lines), ZERO)
    run.deductions = sum((D(l.deductions) for l in lines), ZERO)
    run.net = run.gross - run.pph21 - run.deductions


@router.get('/payroll/runs')
async def list_runs(user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    return {'items': [row(r) for r in (await s.scalars(select(PayrollRun).order_by(PayrollRun.period.desc(), PayrollRun.number.desc()))).all()]}


class RunIn(BaseModel):
    period: str
    pay_date: str
    entity_id: str = ''
    bank_account_id: str = ''
    note: str = ''


@router.post('/payroll/runs')
async def create_run(body: RunIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    month_range(body.period)
    if await s.scalar(select(PayrollRun).where(PayrollRun.period == body.period, PayrollRun.status != 'Void')):
        raise HTTPException(409, f'Payroll periode {body.period} sudah ada')
    pay_date = parse_date(body.pay_date) or date.today()
    rate = await rate_for(s, 'PPH21', pay_date, '5')
    run = PayrollRun(number=await next_number(s, PayrollRun, f"PAY-{body.period.replace('-', '')}-"), period=body.period, pay_date=pay_date,
                     entity_id=body.entity_id or None, bank_account_id=body.bank_account_id or None, note=body.note or None, created_by=user['email'])
    s.add(run)
    await s.flush()
    lines = []
    for e in (await s.scalars(select(Employee).where(Employee.status == 'Aktif').order_by(Employee.code))).all():
        l = PayrollLine(run_id=run.id, employee_id=e.id, base_salary=D(e.base_salary), allowance=D(e.allowance), other_income=D(e.other_cost),
                        pph21_rate=rate, deductions=ZERO)
        recalc_line(l)
        lines.append(l)
        s.add(l)
    if not lines:
        raise HTTPException(422, 'Belum ada karyawan aktif di Master Data')
    recalc_run(run, lines)
    await audit(s, user, 'create', 'payroll', run.id, f'Membuat draft payroll {run.number} ({len(lines)} karyawan)', request=request)
    await s.commit()
    return await run_detail(s, run)


@router.get('/payroll/runs/{rid}')
async def get_run(rid: str, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    run = await s.get(PayrollRun, rid)
    if not run:
        raise HTTPException(404, 'Payroll tidak ditemukan')
    return await run_detail(s, run)


LINE_FIELDS = {'base_salary': 'num', 'allowance': 'num', 'other_income': 'num', 'pph21_rate': 'num', 'deductions': 'num'}


@router.put('/payroll/runs/{rid}/lines/{lid}')
async def update_line(rid: str, lid: str, payload: dict, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    run = await s.get(PayrollRun, rid)
    l = await s.get(PayrollLine, lid)
    if not run or not l or l.run_id != rid:
        raise HTTPException(404, 'Baris payroll tidak ditemukan')
    if run.status != 'Draft':
        raise HTTPException(409, 'Payroll sudah diposting')
    for k, v in clean(LINE_FIELDS, payload, partial=True).items():
        setattr(l, k, v)
    recalc_line(l)
    await s.flush()
    recalc_run(run, (await s.scalars(select(PayrollLine).where(PayrollLine.run_id == rid))).all())
    await s.commit()
    return await run_detail(s, run)


@router.delete('/payroll/runs/{rid}')
async def delete_draft(rid: str, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    run = await s.get(PayrollRun, rid)
    if not run or run.status != 'Draft':
        raise HTTPException(409, 'Hanya draft yang dapat dihapus')
    await s.execute(delete(PayrollLine).where(PayrollLine.run_id == rid))
    await s.delete(run)
    await audit(s, user, 'delete', 'payroll', rid, f'Menghapus draft payroll {run.number}', request=request)
    await s.commit()
    return {'ok': True}


class PostIn(BaseModel):
    bank_account_id: str


@router.post('/payroll/runs/{rid}/post')
async def post_run(rid: str, body: PostIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    run = await s.get(PayrollRun, rid)
    if not run or run.status != 'Draft':
        raise HTTPException(409, 'Payroll tidak ditemukan atau sudah diposting')
    bank = await load_bank(s, body.bank_account_id)
    if run.gross <= 0:
        raise HTTPException(422, 'Total gaji bruto masih 0')
    lines = [(await acc_id(s, '6100'), run.gross, 0, f'Gaji bruto {run.period}'),
             (await acc_id(s, '2210'), 0, run.pph21, f'PPh 21 dipotong {run.period}'),
             (await acc_id(s, '2120'), 0, run.deductions, 'Potongan lain (utang gaji)'),
             (await bank_coa_id(s, bank), 0, run.net, bank.name)]
    await post_journal(s, run.pay_date, f'Payroll {run.number} periode {run.period}', lines, user, 'payroll', run.id, entity_id=run.entity_id or bank.entity_id)
    await add_cash(s, run.pay_date, bank, 'out', run.net, 'payroll', user, 'payroll', run.id, await acc_id(s, '6100'),
                   entity_id=run.entity_id, description=f'Gaji bersih {run.number}')
    if run.pph21 > 0:
        s.add(TaxRecord(number=f'TXP-{run.number[4:]}', kind='PPh 21', side='payable', date=run.pay_date, period=run.period,
                        entity_id=run.entity_id or bank.entity_id, source_type='payroll', source_id=run.id, dpp=run.gross, rate=0, amount=run.pph21,
                        due_date=due_for('PPh 21', run.pay_date), status='Terutang', accrued=True, doc_type='Bukti Potong',
                        description=f'PPh 21 payroll {run.period}', created_by=user['email']))
    run.status, run.bank_account_id = 'Posted', bank.id
    await audit(s, user, 'post', 'payroll', run.id, f'Posting payroll {run.number}: bruto Rp{run.gross:,.0f}, bersih Rp{run.net:,.0f}', request=request)
    await s.commit()
    return await run_detail(s, run)


class VoidIn(BaseModel):
    reason: str


@router.post('/payroll/runs/{rid}/void')
async def void_run(rid: str, body: VoidIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    run = await s.get(PayrollRun, rid)
    if not run or run.status != 'Posted':
        raise HTTPException(409, 'Hanya payroll posted yang dapat dibatalkan')
    if not body.reason.strip():
        raise HTTPException(422, 'Alasan pembatalan wajib diisi')
    tr = await s.scalar(select(TaxRecord).where(TaxRecord.source_type == 'payroll', TaxRecord.source_id == run.id, TaxRecord.status != 'Void'))
    if tr and tr.status == 'Disetor':
        raise HTTPException(409, 'PPh 21 payroll ini sudah disetor; batalkan tidak diizinkan')
    for t in (await s.scalars(select(CashTransaction).where(CashTransaction.source_type == 'payroll', CashTransaction.source_id == run.id))).all():
        t.is_void = True
    await reverse_source(s, 'payroll', run.id, date.today(), body.reason, user)
    if tr:
        tr.status = 'Void'
    run.status, run.void_reason = 'Void', body.reason
    await audit(s, user, 'void', 'payroll', run.id, f'Membatalkan payroll {run.number}: {body.reason}', request=request)
    await s.commit()
    return {'ok': True}


# ---------- Aset tetap & penyusutan ----------
ASSET_FIELDS = {'code': 'str!', 'name': 'str!', 'category': 'str!', 'entity_id': 'str', 'acquisition_date': 'date!', 'cost': 'num',
                'residual': 'num', 'useful_life_months': 'int', 'expense_id': 'str', 'note': 'str'}


def monthly_dep(a):
    life = max(int(a.useful_life_months or 1), 1)
    return q2((D(a.cost) - D(a.residual)) / life)


async def asset_rows(s):
    deps = defaultdict(list)
    for d in (await s.scalars(select(AssetDepreciation).where(AssetDepreciation.is_void.is_(False)))).all():
        deps[d.asset_id].append(d)
    out = []
    for a in (await s.scalars(select(FixedAsset).order_by(FixedAsset.code))).all():
        acc = sum((D(d.amount) for d in deps[a.id]), ZERO)
        out.append({**row(a), 'monthly_depreciation': f(monthly_dep(a)), 'accumulated': f(acc), 'book_value': f(D(a.cost) - acc),
                    'months_done': len(deps[a.id]), 'last_period': max((d.period for d in deps[a.id]), default=None)})
    return out


@router.get('/assets')
async def list_assets(user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    items = await asset_rows(s)
    used = {a['expense_id'] for a in items if a['expense_id']}
    candidates = [{'id': e.id, 'number': e.number, 'description': e.description, 'dpp': f(e.dpp), 'date': e.date.isoformat()}
                  for e in (await s.scalars(select(Expense).where(Expense.category == 'Asset Acquisition', Expense.status != 'Void'))).all() if e.id not in used]
    return {'items': items, 'expense_candidates': candidates,
            'totals': {k: round(sum(a[k] for a in items if a['status'] != 'Dilepas'), 2) for k in ('cost', 'accumulated', 'book_value', 'monthly_depreciation')}}


@router.post('/assets')
async def create_asset(payload: dict, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    data = clean(ASSET_FIELDS, payload)
    if data['cost'] <= 0 or data['residual'] < 0 or data['residual'] >= data['cost']:
        raise HTTPException(422, 'Harga perolehan harus > 0 dan nilai sisa di bawah harga perolehan')
    if not data['useful_life_months'] or data['useful_life_months'] < 1:
        raise HTTPException(422, 'Umur manfaat minimal 1 bulan')
    if await s.scalar(select(FixedAsset).where(FixedAsset.code == data['code'])):
        raise HTTPException(409, 'Kode aset sudah dipakai')
    a = FixedAsset(**data)
    s.add(a)
    await s.flush()
    await audit(s, user, 'create', 'asset', a.id, f'Menambah aset {a.code} {a.name} Rp{a.cost:,.0f}', after=row(a), request=request)
    await s.commit()
    return row(a)


class DepIn(BaseModel):
    period: str


@router.post('/assets/depreciate')
async def depreciate(body: DepIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    month_range(body.period)
    deps = (await s.scalars(select(AssetDepreciation).where(AssetDepreciation.is_void.is_(False)))).all()
    done = {(d.asset_id, d.period) for d in deps}
    acc = defaultdict(Decimal)
    for d in deps:
        acc[d.asset_id] += D(d.amount)
    plan = defaultdict(list)
    for a in (await s.scalars(select(FixedAsset).where(FixedAsset.status == 'Aktif'))).all():
        y, mo = a.acquisition_date.year, a.acquisition_date.month
        m = monthly_dep(a)
        while f'{y:04d}-{mo:02d}' <= body.period:
            p = f'{y:04d}-{mo:02d}'
            if (a.id, p) not in done:
                amt = min(m, D(a.cost) - D(a.residual) - acc[a.id])
                if amt > 0:
                    plan[p].append((a, amt))
                    acc[a.id] += amt
            y, mo = (y + 1, 1) if mo == 12 else (y, mo + 1)
    if not plan:
        raise HTTPException(422, f'Tidak ada aset yang perlu disusutkan sampai periode {body.period}')
    numbers, total_all = [], ZERO
    for p in sorted(plan):
        todo = plan[p]
        total = sum((x[1] for x in todo), ZERO)
        _, end = month_range(p)
        j = await post_journal(s, end.fromordinal(end.toordinal() - 1), f'Penyusutan aset tetap periode {p}', [(await acc_id(s, '7100'), total, 0, f'Beban penyusutan {p}'),
                               (await acc_id(s, '1510'), 0, total, 'Akumulasi penyusutan')], user, 'depreciation', None)
        j.source_id = j.id
        for a, amt in todo:
            s.add(AssetDepreciation(asset_id=a.id, period=p, amount=amt, journal_id=j.id))
        numbers.append(j.number)
        total_all += total
    await audit(s, user, 'post', 'asset', None, f'Penyusutan s/d {body.period} ({len(plan)} periode): Rp{total_all:,.0f}', request=request)
    await s.commit()
    return {'ok': True, 'periods': sorted(plan), 'assets': len({a.id for v in plan.values() for a, _ in v}), 'total': f(total_all), 'journal': ', '.join(numbers)}


@router.post('/assets/depreciate/{period}/void')
async def void_depreciation(period: str, body: VoidIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    deps = (await s.scalars(select(AssetDepreciation).where(AssetDepreciation.period == period, AssetDepreciation.is_void.is_(False)))).all()
    if not deps:
        raise HTTPException(404, 'Tidak ada penyusutan pada periode ini')
    for jid in {d.journal_id for d in deps}:
        j = await s.get(Journal, jid)
        if j and j.status == 'Posted':
            await reverse_journal(s, j, date.today(), body.reason, user)
    for d in deps:
        d.is_void = True
    await audit(s, user, 'void', 'asset', None, f'Membatalkan penyusutan {period}: {body.reason}', request=request)
    await s.commit()
    return {'ok': True}


@router.get('/assets/{aid}/schedule')
async def schedule(aid: str, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    a = await s.get(FixedAsset, aid)
    if not a:
        raise HTTPException(404, 'Aset tidak ditemukan')
    posted = {d.period: D(d.amount) for d in (await s.scalars(select(AssetDepreciation).where(AssetDepreciation.asset_id == aid, AssetDepreciation.is_void.is_(False)))).all()}
    m = monthly_dep(a)
    y, mo = a.acquisition_date.year, a.acquisition_date.month
    book, acc, out = D(a.cost), ZERO, []
    for _ in range(int(a.useful_life_months)):
        p = f'{y:04d}-{mo:02d}'
        amt = min(m, D(a.cost) - D(a.residual) - acc)
        acc += amt
        out.append({'period': p, 'amount': f(amt), 'accumulated': f(acc), 'book_value': f(book - acc), 'posted': p in posted})
        y, mo = (y + 1, 1) if mo == 12 else (y, mo + 1)
    return {'asset': row(a), 'schedule': out}


@router.post('/assets/{aid}/dispose')
async def dispose(aid: str, body: VoidIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    a = await s.get(FixedAsset, aid)
    if not a or a.status != 'Aktif':
        raise HTTPException(404, 'Aset tidak ditemukan atau sudah dilepas')
    acc = sum((D(d.amount) for d in (await s.scalars(select(AssetDepreciation).where(AssetDepreciation.asset_id == aid, AssetDepreciation.is_void.is_(False)))).all()), ZERO)
    if a.expense_id:
        await post_journal(s, date.today(), f'Pelepasan aset {a.code} {a.name}', [(await acc_id(s, '1510'), acc, 0, 'Hapus akumulasi penyusutan'),
                           (await acc_id(s, '6000'), D(a.cost) - acc, 0, 'Rugi pelepasan aset (nilai buku)'),
                           (await acc_id(s, '1500'), 0, D(a.cost), 'Hapus harga perolehan')], user, 'asset_disposal', a.id, entity_id=a.entity_id)
    a.status, a.note = 'Dilepas', f'Dilepas: {body.reason}'[:255]
    await audit(s, user, 'update', 'asset', a.id, f'Melepas aset {a.code}: {body.reason}', request=request)
    await s.commit()
    return row(a)
