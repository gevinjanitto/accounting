from collections import defaultdict
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from db import get_session
from models import Account, BankAccount, Journal, JournalLine, Period
from common import row, audit, paginate_args, D
from calc import f
from security import require_access, require_owner

router = APIRouter(prefix='/api/accounting')
ZERO = Decimal('0')
BANK_COA = {'Kas': '1100', 'Bank': '1110', 'Penampung': '1120'}
BS_GROUPS = {'1000': 'asset', '1300': 'asset', '2000': 'liability', '3000': 'equity'}
PL_GROUPS = {'4000': 'revenue', '5000': 'expense', '6000': 'expense', '7000': 'expense', '8000': 'expense'}


def parse_date(v, name='tanggal'):
    if not v:
        return None
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        raise HTTPException(422, f'Format {name} tidak valid')


async def acc_id(s, code: str) -> str:
    a = await s.scalar(select(Account).where(Account.code == code))
    if not a:
        raise HTTPException(422, f'Akun COA {code} belum ada di Master Data')
    return a.id


async def bank_coa_id(s, bank: BankAccount) -> str:
    return await acc_id(s, BANK_COA.get(bank.kind, '1110'))


async def ensure_open(s, d: date):
    code = d.strftime('%Y-%m')
    p = await s.scalar(select(Period).where(Period.code == code))
    if p and p.status == 'Closed':
        raise HTTPException(409, f'Periode {code} sudah ditutup. Buka ulang periode lewat menu Jurnal bila perlu koreksi.')


async def next_number(s, model, prefix: str) -> str:
    nums = (await s.scalars(select(model.number).where(model.number.like(f'{prefix}%')))).all()
    n = max([int(x[len(prefix):]) for x in nums if x[len(prefix):].isdigit()] + [0])
    return f'{prefix}{n + 1:04d}'


async def post_journal(s, d: date, description: str, lines: list, user, source_type=None, source_id=None,
                       kind='auto', entity_id=None, project_id=None, reason=None, reversal_of=None) -> Journal:
    """lines: list of (account_id, debit, credit, memo)."""
    await ensure_open(s, d)
    lines = [(a, D(dr), D(cr), m) for a, dr, cr, m in lines if D(dr) != 0 or D(cr) != 0]
    dr = sum((x[1] for x in lines), ZERO)
    cr = sum((x[2] for x in lines), ZERO)
    if not lines or dr != cr:
        raise HTTPException(422, f'Jurnal tidak seimbang (debit {f(dr):,.2f} ≠ kredit {f(cr):,.2f})')
    j = Journal(number=await next_number(s, Journal, f"JV-{d.strftime('%Y%m')}-"), date=d, period=d.strftime('%Y-%m'),
                description=description[:255], kind=kind, source_type=source_type, source_id=source_id, entity_id=entity_id,
                project_id=project_id, reason=reason, reversal_of=reversal_of, total=dr, created_by=user['email'] if user else None)
    s.add(j)
    await s.flush()
    for a, d_, c_, m in lines:
        s.add(JournalLine(journal_id=j.id, account_id=a, debit=d_, credit=c_, memo=m, entity_id=entity_id, project_id=project_id))
    return j


async def reverse_journal(s, j: Journal, d: date, reason: str, user) -> Journal:
    if j.status != 'Posted' or j.kind == 'reversal':
        raise HTTPException(409, 'Jurnal ini sudah dibalik atau merupakan jurnal pembalik')
    lines = (await s.scalars(select(JournalLine).where(JournalLine.journal_id == j.id))).all()
    rev = await post_journal(s, d, f'Pembalik {j.number}: {j.description}'[:255], [(l.account_id, l.credit, l.debit, l.memo) for l in lines], user,
                             source_type=j.source_type, source_id=j.source_id, kind='reversal', entity_id=j.entity_id,
                             project_id=j.project_id, reason=reason, reversal_of=j.id)
    j.status = 'Reversed'
    return rev


async def reverse_source(s, source_type: str, source_id: str, d: date, reason: str, user):
    js = (await s.scalars(select(Journal).where(Journal.source_type == source_type, Journal.source_id == source_id,
                                                Journal.status == 'Posted', Journal.kind != 'reversal'))).all()
    for j in js:
        await reverse_journal(s, j, d, reason, user)


async def openings(s, entity_id=None):
    """Saldo awal rekening dicatat sebagai Dr rekening / Cr Modal (3100)."""
    out = defaultdict(Decimal)
    stmt = select(BankAccount)
    if entity_id:
        stmt = stmt.where(BankAccount.entity_id == entity_id)
    banks = (await s.scalars(stmt)).all()
    if not banks:
        return out
    modal = await acc_id(s, '3100')
    for b in banks:
        amt = D(b.opening_balance)
        if amt:
            out[await bank_coa_id(s, b)] += amt
            out[modal] -= amt
    return out


async def balances(s, date_from=None, date_to=None, entity_id=None, project_id=None, with_opening=True):
    """Return {account_id: debit-credit} for the date range."""
    stmt = select(JournalLine.account_id, func.sum(JournalLine.debit), func.sum(JournalLine.credit)).join(Journal, Journal.id == JournalLine.journal_id)
    if date_from:
        stmt = stmt.where(Journal.date >= date_from)
    if date_to:
        stmt = stmt.where(Journal.date <= date_to)
    if entity_id:
        stmt = stmt.where(JournalLine.entity_id == entity_id)
    if project_id:
        stmt = stmt.where(JournalLine.project_id == project_id)
    out = defaultdict(Decimal)
    for a, dr, cr in (await s.execute(stmt.group_by(JournalLine.account_id))).all():
        out[a] += D(dr) - D(cr)
    if with_opening and not date_from and not project_id:
        for a, v in (await openings(s, entity_id)).items():
            out[a] += v
    return out


async def accounts_map(s):
    return {a.id: a for a in (await s.scalars(select(Account).order_by(Account.code))).all()}


def acc_row(a, amount):
    return {'account_id': a.id, 'code': a.code, 'name': a.name, 'group_code': a.group_code, 'amount': f(amount)}


async def profit_loss(s, date_from, date_to, entity_id=None, project_id=None):
    accs = await accounts_map(s)
    bal = await balances(s, date_from, date_to, entity_id, project_id, with_opening=False)
    rev, exp = [], []
    for aid, v in bal.items():
        a = accs.get(aid)
        if not a or a.group_code not in PL_GROUPS or v == 0:
            continue
        (rev if PL_GROUPS[a.group_code] == 'revenue' else exp).append((a, -v if PL_GROUPS[a.group_code] == 'revenue' else v))
    groups = defaultdict(Decimal)
    for a, v in exp:
        groups[a.group_code] += v
    total_rev = sum((v for _, v in rev), ZERO)
    total_exp = sum((v for _, v in exp), ZERO)
    direct = groups['5000']
    operating = total_rev - direct - groups['6000'] - groups['7000']
    return {
        'revenue': [acc_row(a, v) for a, v in sorted(rev, key=lambda x: x[0].code)],
        'expenses': [acc_row(a, v) for a, v in sorted(exp, key=lambda x: x[0].code)],
        'total_revenue': f(total_rev), 'total_expense': f(total_exp),
        'direct_cost': f(direct), 'gross_profit': f(total_rev - direct),
        'operational_expense': f(groups['6000']), 'depreciation': f(groups['7000']), 'operating_profit': f(operating),
        'tax_expense': f(groups['8000']), 'net_profit': f(total_rev - total_exp),
    }


# ---------- Endpoints ----------
@router.get('/journals')
async def list_journals(q: str = '', kind: str = '', source_type: str = '', date_from: str = '', date_to: str = '', page: int = 1, page_size: int = 20,
                        user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    stmt = select(Journal)
    if q:
        stmt = stmt.where(or_(Journal.number.ilike(f'%{q}%'), Journal.description.ilike(f'%{q}%')))
    if kind:
        stmt = stmt.where(Journal.kind == kind)
    if source_type:
        stmt = stmt.where(Journal.source_type == source_type)
    if date_from:
        stmt = stmt.where(Journal.date >= parse_date(date_from))
    if date_to:
        stmt = stmt.where(Journal.date <= parse_date(date_to))
    total = await s.scalar(select(func.count()).select_from(stmt.subquery()))
    page, page_size, offset = paginate_args(page, page_size)
    js = (await s.scalars(stmt.order_by(Journal.date.desc(), Journal.number.desc()).offset(offset).limit(page_size))).all()
    accs = await accounts_map(s)
    lines = (await s.scalars(select(JournalLine).where(JournalLine.journal_id.in_([j.id for j in js] or ['-'])))).all()
    by = defaultdict(list)
    for l in lines:
        a = accs.get(l.account_id)
        by[l.journal_id].append({**row(l), 'account_code': a.code if a else '?', 'account_name': a.name if a else '?'})
    items = [{**row(j), 'lines': sorted(by[j.id], key=lambda x: (-x['debit'], x['account_code']))} for j in js]
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


class ManualLine(BaseModel):
    account_id: str
    debit: float = 0
    credit: float = 0
    memo: str | None = None


class ManualJournal(BaseModel):
    date: str
    description: str
    reason: str
    entity_id: str | None = None
    project_id: str | None = None
    lines: list[ManualLine]


@router.post('/journals')
async def create_manual_journal(body: ManualJournal, request: Request, user: dict = Depends(require_owner), s: AsyncSession = Depends(get_session)):
    if not body.reason.strip() or not body.description.strip():
        raise HTTPException(422, 'Keterangan dan alasan jurnal penyesuaian wajib diisi')
    accs = await accounts_map(s)
    if any(l.account_id not in accs for l in body.lines):
        raise HTTPException(422, 'Akun pada baris jurnal tidak ditemukan')
    if any(l.debit < 0 or l.credit < 0 or (l.debit and l.credit) for l in body.lines):
        raise HTTPException(422, 'Setiap baris hanya boleh berisi debit atau kredit (positif)')
    j = await post_journal(s, parse_date(body.date), body.description, [(l.account_id, l.debit, l.credit, l.memo) for l in body.lines], user,
                           kind='manual', source_type='manual', entity_id=body.entity_id or None, project_id=body.project_id or None, reason=body.reason)
    await audit(s, user, 'create', 'journals', j.id, f'Jurnal penyesuaian {j.number}: {body.description}', after=row(j), request=request)
    await s.commit()
    return row(j)


class ReasonIn(BaseModel):
    reason: str
    date: str | None = None


@router.post('/journals/{jid}/reverse')
async def reverse(jid: str, body: ReasonIn, request: Request, user: dict = Depends(require_owner), s: AsyncSession = Depends(get_session)):
    j = await s.get(Journal, jid)
    if not j:
        raise HTTPException(404, 'Jurnal tidak ditemukan')
    if j.kind != 'manual':
        raise HTTPException(409, 'Jurnal otomatis dikoreksi dengan membatalkan transaksi sumbernya')
    if not body.reason.strip():
        raise HTTPException(422, 'Alasan pembalikan wajib diisi')
    rev = await reverse_journal(s, j, parse_date(body.date) or date.today(), body.reason, user)
    await audit(s, user, 'reverse', 'journals', j.id, f'Membalik jurnal {j.number} → {rev.number}: {body.reason}', request=request)
    await s.commit()
    return row(rev)


@router.get('/ledger')
async def general_ledger(account_id: str, date_from: str = '', date_to: str = '', user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    a = await s.get(Account, account_id)
    if not a:
        raise HTTPException(404, 'Akun tidak ditemukan')
    dfrom, dto = parse_date(date_from), parse_date(date_to)
    opening = ZERO
    if dfrom:
        prev = await balances(s, None, date.fromordinal(dfrom.toordinal() - 1))
        opening = prev.get(a.id, ZERO)
    else:
        opening = (await openings(s)).get(a.id, ZERO)
    stmt = select(JournalLine, Journal).join(Journal, Journal.id == JournalLine.journal_id).where(JournalLine.account_id == a.id)
    if dfrom:
        stmt = stmt.where(Journal.date >= dfrom)
    if dto:
        stmt = stmt.where(Journal.date <= dto)
    run = opening
    rows = []
    for l, j in (await s.execute(stmt.order_by(Journal.date, Journal.number))).all():
        run += D(l.debit) - D(l.credit)
        rows.append({'date': j.date.isoformat(), 'journal_id': j.id, 'number': j.number, 'description': j.description, 'memo': l.memo,
                     'debit': f(l.debit), 'credit': f(l.credit), 'balance': f(run), 'status': j.status, 'kind': j.kind})
    return {'account': row(a), 'opening': f(opening), 'closing': f(run), 'rows': rows,
            'total_debit': f(sum((D(r['debit']) for r in rows), ZERO)), 'total_credit': f(sum((D(r['credit']) for r in rows), ZERO))}


@router.get('/trial-balance')
async def trial_balance(date_to: str = '', entity_id: str = '', user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    accs = await accounts_map(s)
    bal = await balances(s, None, parse_date(date_to), entity_id or None)
    rows = []
    for aid, a in accs.items():
        v = bal.get(aid, ZERO)
        if v == 0:
            continue
        rows.append({'account_id': aid, 'code': a.code, 'name': a.name, 'account_type': a.account_type,
                     'debit': f(v) if v > 0 else 0.0, 'credit': f(-v) if v < 0 else 0.0})
    td = sum((D(r['debit']) for r in rows), ZERO)
    tc = sum((D(r['credit']) for r in rows), ZERO)
    return {'rows': rows, 'total_debit': f(td), 'total_credit': f(tc), 'balanced': td == tc}


@router.get('/profit-loss')
async def profit_loss_ep(date_from: str = '', date_to: str = '', entity_id: str = '', project_id: str = '',
                         user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    return await profit_loss(s, parse_date(date_from), parse_date(date_to), entity_id or None, project_id or None)


@router.get('/balance-sheet')
async def balance_sheet(as_of: str = '', entity_id: str = '', user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    accs = await accounts_map(s)
    bal = await balances(s, None, parse_date(as_of), entity_id or None)
    sec = {'asset': [], 'liability': [], 'equity': []}
    earnings = ZERO
    for aid, v in bal.items():
        a = accs.get(aid)
        if not a or v == 0:
            continue
        if a.group_code in PL_GROUPS:
            earnings -= v
            continue
        kind = BS_GROUPS.get(a.group_code, 'asset')
        sec[kind].append(acc_row(a, v if kind == 'asset' else -v))
    for k in sec:
        sec[k].sort(key=lambda x: x['code'])
    ta = sum((D(r['amount']) for r in sec['asset']), ZERO)
    tl = sum((D(r['amount']) for r in sec['liability']), ZERO)
    te = sum((D(r['amount']) for r in sec['equity']), ZERO) + earnings
    return {'assets': sec['asset'], 'liabilities': sec['liability'], 'equity': sec['equity'], 'current_earnings': f(earnings),
            'total_assets': f(ta), 'total_liabilities': f(tl), 'total_equity': f(te), 'balanced': ta == tl + te}


@router.get('/periods')
async def periods(user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    ps = (await s.scalars(select(Period).order_by(Period.code))).all()
    counts = dict((await s.execute(select(Journal.period, func.count()).group_by(Journal.period))).all())
    return [{**row(p), 'journals': counts.get(p.code, 0)} for p in ps]


@router.post('/periods/{code}/close')
async def close_period(code: str, request: Request, user: dict = Depends(require_owner), s: AsyncSession = Depends(get_session)):
    p = await s.scalar(select(Period).where(Period.code == code))
    if not p:
        raise HTTPException(404, 'Periode tidak ditemukan')
    if p.status == 'Closed':
        raise HTTPException(409, 'Periode sudah ditutup')
    p.status = 'Closed'
    await audit(s, user, 'close', 'periods', p.id, f'Closing periode {code}', request=request)
    await s.commit()
    return row(p)


@router.post('/periods/{code}/reopen')
async def reopen_period(code: str, body: ReasonIn, request: Request, user: dict = Depends(require_owner), s: AsyncSession = Depends(get_session)):
    p = await s.scalar(select(Period).where(Period.code == code))
    if not p:
        raise HTTPException(404, 'Periode tidak ditemukan')
    if not body.reason.strip():
        raise HTTPException(422, 'Alasan membuka ulang periode wajib diisi')
    p.status = 'Open'
    await audit(s, user, 'reopen', 'periods', p.id, f'Membuka ulang periode {code}: {body.reason}', request=request)
    await s.commit()
    return row(p)
