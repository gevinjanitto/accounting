from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal, ROUND_DOWN
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from db import get_session
from models import (TaxRule, TaxRecord, FiscalCorrection, Income, Expense, Project, Party, Entity, CashTransaction, Journal, JournalLine,
                    Account, Document, new_id)
from common import row, audit, D, clean
from calc import f
from security import require_access, require_owner
from ledger import acc_id, post_journal, reverse_source, next_number, parse_date, bank_coa_id, profit_loss
from cash import add_cash, load_bank

router = APIRouter(prefix='/api/tax')
ZERO = Decimal('0')
CENT = Decimal('0.01')
# kind: (side, akun COA, akun beban default untuk pencatatan terutang manual)
KINDS = {
    'PPN Keluaran': ('payable', '2200', None),
    'PPN Masukan': ('credit', '1310', None),
    'PPh 23 Dipotong Customer': ('credit', '1320', None),
    'PPh 21': ('payable', '2210', '6100'),
    'PPh 23 Dipungut': ('payable', '2200', '2100'),
    'PPh 4(2) Final': ('payable', '2200', '8100'),
    'PPh 25': ('credit', '1330', None),
    'PPh Badan (PPh 29)': ('payable', '2200', '8100'),
}
DOC_BY_KIND = {'PPN Keluaran': 'Faktur Pajak', 'PPN Masukan': 'Faktur Pajak', 'PPh 23 Dipotong Customer': 'Bukti Potong'}
RECORD_FIELDS = {'kind': 'enum:' + '|'.join(KINDS), 'date': 'date!', 'entity_id': 'str', 'project_id': 'str', 'party_id': 'str',
                 'dpp': 'num', 'rate': 'num', 'amount': 'num', 'doc_type': 'str', 'doc_number': 'str', 'doc_date': 'date',
                 'due_date': 'date', 'description': 'str', 'debit_account_id': 'str'}


def q2(v):
    return D(v).quantize(CENT)


def month_end(y, m):
    return (date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1))


def due_for(kind, d: date) -> date:
    ny, nm = (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
    if kind.startswith('PPN'):
        return month_end(ny, nm)
    if kind == 'PPh Badan (PPh 29)':
        return date(d.year + 1, 4, 30)
    return date(ny, nm, 15)


async def rate_for(s, code: str, on: date | None = None, default='0') -> Decimal:
    on = on or date.today()
    rules = (await s.scalars(select(TaxRule).where(TaxRule.code == code).order_by(TaxRule.version.desc()))).all()
    for r in rules:
        if r.effective_from <= on and (not r.effective_to or r.effective_to >= on):
            return D(r.rate)
    return D(rules[0].rate) if rules else D(default)


# ---------- Sinkronisasi dari transaksi posted ----------
async def sync_records(s):
    recs = (await s.scalars(select(TaxRecord).where(TaxRecord.source_type.in_(['income', 'expense'])))).all()
    have = {(r.source_type, r.source_id, r.kind): r for r in recs}

    def upsert(src, obj, kind, dpp, rate, amount, party):
        r = have.get((src, obj.id, kind))
        if obj.status == 'Void' or amount <= 0:
            if r and r.status != 'Void':
                r.status = 'Void'
            return
        side = KINDS[kind][0]
        if r:
            if r.status == 'Void':
                r.status = 'Terutang' if side == 'payable' else 'Kredit Pajak'
            r.dpp, r.rate, r.amount, r.date, r.period = dpp, rate, amount, obj.date, obj.date.strftime('%Y-%m')
            r.project_id, r.party_id, r.entity_id = obj.project_id, party, obj.entity_id
            return
        status = 'Terutang' if side == 'payable' else ('Menunggu Bukti Potong' if kind == 'PPh 23 Dipotong Customer' else 'Kredit Pajak')
        s.add(TaxRecord(number=f'TX-{new_id()[:8].upper()}', kind=kind, side=side, date=obj.date, period=obj.date.strftime('%Y-%m'),
                        entity_id=obj.entity_id, project_id=obj.project_id, party_id=party, source_type=src, source_id=obj.id,
                        dpp=dpp, rate=rate, amount=amount, doc_type=DOC_BY_KIND.get(kind), due_date=due_for(kind, obj.date),
                        status=status, accrued=True, description=f'{obj.number}: {obj.description or ""}'[:255], created_by='sistem'))

    for i in (await s.scalars(select(Income))).all():
        upsert('income', i, 'PPN Keluaran', D(i.dpp), D(i.ppn_pct), D(i.ppn), i.customer_id)
        upsert('income', i, 'PPh 23 Dipotong Customer', D(i.dpp), D(i.pph_pct), D(i.pph) if i.pph_paid_by == 'kita' else D(0), i.customer_id)
    for e in (await s.scalars(select(Expense))).all():
        upsert('expense', e, 'PPN Masukan', D(e.dpp), D(e.ppn_pct), D(e.ppn), e.vendor_id)
    await s.flush()


async def lookups(s):
    return ({p.id: p for p in (await s.scalars(select(Project))).all()}, {p.id: p.name for p in (await s.scalars(select(Party))).all()})


def rec_row(r, projects, parties, docs=0):
    d = row(r)
    p = projects.get(r.project_id)
    d['project_name'] = f'{p.code} · {p.name}' if p else None
    d['party_name'] = parties.get(r.party_id)
    d['documents'] = docs
    d['overdue'] = r.side == 'payable' and r.status == 'Terutang' and bool(r.due_date and r.due_date < date.today())
    return d


@router.get('/meta')
async def meta(user: dict = Depends(require_access)):
    return {'kinds': [{'kind': k, 'side': v[0], 'manual_debit_default': v[2]} for k, v in KINDS.items()],
            'statuses': ['Terutang', 'Disetor', 'Kredit Pajak', 'Menunggu Bukti Potong', 'Dikompensasi', 'Void']}


@router.get('/records')
async def list_records(kind: str = '', period: str = '', year: str = '', status: str = '', project_id: str = '', q: str = '',
                       user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    await sync_records(s)
    await s.commit()
    stmt = select(TaxRecord)
    if kind:
        stmt = stmt.where(TaxRecord.kind == kind)
    if period:
        stmt = stmt.where(TaxRecord.period == period)
    if year:
        stmt = stmt.where(TaxRecord.period.like(f'{year}-%'))
    if status:
        stmt = stmt.where(TaxRecord.status == status)
    if project_id:
        stmt = stmt.where(TaxRecord.project_id == project_id)
    if q:
        stmt = stmt.where((TaxRecord.number.ilike(f'%{q}%')) | (TaxRecord.description.ilike(f'%{q}%')) | (TaxRecord.doc_number.ilike(f'%{q}%')))
    items = (await s.scalars(stmt.order_by(TaxRecord.date.desc(), TaxRecord.number.desc()))).all()
    projects, parties = await lookups(s)
    ids = [r.id for r in items]
    counts = defaultdict(int)
    if ids:
        for lid in (await s.scalars(select(Document.linked_id).where(Document.linked_type == 'tax', Document.linked_id.in_(ids)))).all():
            counts[lid] += 1
    live = [r for r in items if r.status != 'Void']
    recap = defaultdict(lambda: {'dpp': ZERO, 'amount': ZERO, 'count': 0})
    for r in live:
        recap[r.kind]['dpp'] += D(r.dpp)
        recap[r.kind]['amount'] += D(r.amount)
        recap[r.kind]['count'] += 1
    return {'items': [rec_row(r, projects, parties, counts[r.id]) for r in items],
            'recap': [{'kind': k, 'side': KINDS[k][0], 'dpp': f(v['dpp']), 'amount': f(v['amount']), 'count': v['count']} for k, v in recap.items()],
            'total_payable': f(sum((D(r.amount) for r in live if r.side == 'payable' and r.status == 'Terutang'), ZERO)),
            'total_credit': f(sum((D(r.amount) for r in live if r.side == 'credit'), ZERO))}


@router.post('/records')
async def create_record(payload: dict, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    data = clean(RECORD_FIELDS, payload)
    kind = data['kind']
    if kind in ('PPN Keluaran', 'PPN Masukan', 'PPh 23 Dipotong Customer'):
        raise HTTPException(422, f'{kind} tercatat otomatis dari modul Pemasukan/Pengeluaran')
    side, liab, default_debit = KINDS[kind]
    amount = q2(data['amount']) if data['amount'] else q2(D(data['dpp']) * D(data['rate']) / 100)
    if amount <= 0:
        raise HTTPException(422, 'Nominal pajak harus lebih dari 0')
    debit = data.pop('debit_account_id') or None
    data.pop('amount')
    due = data.pop('due_date') or due_for(kind, data['date'])
    r = TaxRecord(**data, side=side, amount=amount, period=data['date'].strftime('%Y-%m'), source_type='manual',
                  number=await next_number(s, TaxRecord, f"TXM-{data['date'].strftime('%Y%m')}-"),
                  due_date=due, status='Terutang', created_by=user['email'])
    s.add(r)
    await s.flush()
    if side == 'payable' and (debit or default_debit):
        debit_id = debit or await acc_id(s, default_debit)
        if not await s.get(Account, debit_id):
            raise HTTPException(422, 'Akun lawan tidak ditemukan')
        await post_journal(s, r.date, f'Pajak terutang {r.number}: {kind}', [(debit_id, amount, 0, r.description or kind),
                           (await acc_id(s, liab), 0, amount, f'Utang {kind}')], user, 'tax', r.id, entity_id=r.entity_id, project_id=r.project_id)
        r.accrued = True
    await audit(s, user, 'create', 'tax', r.id, f'Mencatat {kind} {r.number} Rp{amount:,.0f}', after=row(r), request=request)
    await s.commit()
    return row(r)


class DocIn(BaseModel):
    doc_type: str = ''
    doc_number: str = ''
    doc_date: str = ''
    description: str = ''


@router.put('/records/{rid}/document')
async def set_document(rid: str, body: DocIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    r = await s.get(TaxRecord, rid)
    if not r or r.status == 'Void':
        raise HTTPException(404, 'Catatan pajak tidak ditemukan')
    before = row(r)
    r.doc_type = body.doc_type or r.doc_type
    r.doc_number = body.doc_number.strip() or None
    r.doc_date = parse_date(body.doc_date)
    if body.description:
        r.description = body.description[:255]
    if r.kind == 'PPh 23 Dipotong Customer':
        r.status = 'Kredit Pajak' if r.doc_number else 'Menunggu Bukti Potong'
    await audit(s, user, 'update', 'tax', r.id, f'Memperbarui dokumen pajak {r.number}', before=before, after=row(r), request=request)
    await s.commit()
    return row(r)


class PayIn(BaseModel):
    date: str
    bank_account_id: str
    ntpn: str = ''


@router.post('/records/{rid}/pay')
async def pay_record(rid: str, body: PayIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    r = await s.get(TaxRecord, rid)
    if not r or r.source_type not in ('manual', 'payroll'):
        raise HTTPException(404, 'Catatan pajak tidak ditemukan (PPN disetor lewat Rekonsiliasi PPN)')
    if r.status != 'Terutang':
        raise HTTPException(409, 'Pajak ini sudah disetor')
    d = parse_date(body.date)
    bank = await load_bank(s, body.bank_account_id)
    side, liab, _ = KINDS[r.kind]
    debit = await acc_id(s, liab) if (side == 'credit' or r.accrued) else await acc_id(s, '8100')
    await post_journal(s, d, f'Setor {r.kind} {r.number}', [(debit, r.amount, 0, f'NTPN {body.ntpn or "-"}'),
                       (await bank_coa_id(s, bank), 0, r.amount, bank.name)], user, 'tax_payment', r.id, entity_id=r.entity_id, project_id=r.project_id)
    await add_cash(s, d, bank, 'out', r.amount, 'tax_payment', user, 'tax_payment', r.id, debit, entity_id=r.entity_id,
                   description=f'Setor {r.kind} {r.number}')
    r.status = 'Kredit Pajak' if side == 'credit' else 'Disetor'
    r.paid_date, r.ntpn, r.bank_account_id = d, body.ntpn.strip() or None, bank.id
    if not r.doc_type:
        r.doc_type = 'Bukti Setor'
    await audit(s, user, 'pay', 'tax', r.id, f'Menyetor {r.kind} {r.number} Rp{r.amount:,.0f}', request=request)
    await s.commit()
    return row(r)


class VoidIn(BaseModel):
    reason: str


@router.post('/records/{rid}/void')
async def void_record(rid: str, body: VoidIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    r = await s.get(TaxRecord, rid)
    if not r or r.source_type != 'manual' or r.status == 'Void':
        raise HTTPException(404, 'Hanya catatan pajak manual yang dapat dibatalkan di sini')
    if not body.reason.strip():
        raise HTTPException(422, 'Alasan pembatalan wajib diisi')
    for t in (await s.scalars(select(CashTransaction).where(CashTransaction.source_type == 'tax_payment', CashTransaction.source_id == r.id))).all():
        t.is_void = True
    await reverse_source(s, 'tax_payment', r.id, date.today(), body.reason, user)
    await reverse_source(s, 'tax', r.id, date.today(), body.reason, user)
    r.status = 'Void'
    await audit(s, user, 'void', 'tax', r.id, f'Membatalkan {r.number}: {body.reason}', request=request)
    await s.commit()
    return {'ok': True}


# ---------- Rekonsiliasi ----------
async def ledger_balance(s, code, dto=None):
    a = await s.scalar(select(Account).where(Account.code == code))
    if not a:
        return ZERO
    stmt = select(JournalLine.debit, JournalLine.credit).join(Journal, Journal.id == JournalLine.journal_id).where(JournalLine.account_id == a.id)
    if dto:
        stmt = stmt.where(Journal.date <= dto)
    return sum((D(d) - D(c) for d, c in (await s.execute(stmt)).all()), ZERO)


def ppn_position(recs, period):
    out_ = [r for r in recs if r.kind == 'PPN Keluaran' and r.period == period and r.status == 'Terutang']
    in_ = [r for r in recs if r.kind == 'PPN Masukan' and r.period == period and r.status == 'Kredit Pajak']
    k, m = sum((D(r.amount) for r in out_), ZERO), sum((D(r.amount) for r in in_), ZERO)
    return out_, in_, k, m


@router.get('/reconciliation')
async def reconciliation(period: str = '', user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    await sync_records(s)
    await s.commit()
    period = period or date.today().strftime('%Y-%m')
    recs = (await s.scalars(select(TaxRecord).where(TaxRecord.status != 'Void'))).all()
    _, _, k, m = ppn_position(recs, period)
    open_payable = lambda codes: sum((D(r.amount) for r in recs if r.side == 'payable' and r.status == 'Terutang' and r.accrued and KINDS[r.kind][1] in codes), ZERO)
    open_credit = lambda kind, sts: sum((D(r.amount) for r in recs if r.kind == kind and r.status in sts), ZERO)
    checks = [
        ('2200', 'Utang pajak (PPN Keluaran + PPh terutang)', open_payable(('2200',)), -await ledger_balance(s, '2200')),
        ('2210', 'Utang PPh 21', open_payable(('2210',)), -await ledger_balance(s, '2210')),
        ('1310', 'PPN Masukan belum dikompensasi', open_credit('PPN Masukan', ('Kredit Pajak',)), await ledger_balance(s, '1310')),
        ('1320', 'Kredit PPh 23 dipotong customer', open_credit('PPh 23 Dipotong Customer', ('Kredit Pajak', 'Menunggu Bukti Potong')), await ledger_balance(s, '1320')),
        ('1330', 'PPh 25 dibayar di muka', open_credit('PPh 25', ('Kredit Pajak',)), await ledger_balance(s, '1330')),
    ]
    settled = defaultdict(lambda: {'amount': ZERO, 'date': None})
    for r in recs:
        if r.settlement_id and r.period == period and r.kind.startswith('PPN'):
            settled[r.settlement_id]['amount'] += D(r.amount) if r.kind == 'PPN Keluaran' else -D(r.amount)
            settled[r.settlement_id]['date'] = r.paid_date.isoformat() if r.paid_date else None
    missing = [r for r in recs if (r.kind in DOC_BY_KIND and not r.doc_number) or (r.status == 'Disetor' and not r.ntpn)]
    projects, parties = await lookups(s)
    return {'period': period,
            'ppn': {'keluaran': f(k), 'masukan': f(m), 'net': f(k - m), 'status': 'Kurang bayar' if k > m else ('Lebih bayar' if m > k else 'Nihil')},
            'settlements': [{'id': k, 'paid': f(max(v['amount'], ZERO)), 'date': v['date']} for k, v in settled.items()],
            'checks': [{'code': c, 'label': l, 'records': f(a), 'ledger': f(b), 'difference': f(a - b), 'matched': abs(a - b) < Decimal('1')} for c, l, a, b in checks],
            'missing_documents': [rec_row(r, projects, parties) for r in missing[:50]]}


class SettleIn(BaseModel):
    period: str
    date: str
    bank_account_id: str = ''
    ntpn: str = ''


@router.post('/ppn-settle')
async def ppn_settle(body: SettleIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    await sync_records(s)
    recs = (await s.scalars(select(TaxRecord).where(TaxRecord.status != 'Void'))).all()
    out_, in_, k, m = ppn_position(recs, body.period)
    if not out_ and not in_:
        raise HTTPException(422, f'Tidak ada PPN terbuka pada masa {body.period}')
    if m > k:
        raise HTTPException(422, f'Masa {body.period} lebih bayar Rp{m - k:,.0f}; kompensasikan ke masa berikutnya (tidak perlu setor)')
    d = parse_date(body.date)
    sid = new_id()
    lines = [(await acc_id(s, '2200'), k, 0, f'PPN Keluaran masa {body.period}'), (await acc_id(s, '1310'), 0, m, f'Kompensasi PPN Masukan {body.period}')]
    net = k - m
    bank = None
    if net > 0:
        bank = await load_bank(s, body.bank_account_id)
        lines.append((await bank_coa_id(s, bank), 0, net, f'Setor PPN NTPN {body.ntpn or "-"}'))
    await post_journal(s, d, f'Penyetoran / kompensasi PPN masa {body.period}', lines, user, 'ppn_settlement', sid)
    if bank:
        await add_cash(s, d, bank, 'out', net, 'tax_payment', user, 'ppn_settlement', sid, await acc_id(s, '2200'), description=f'Setor PPN masa {body.period}')
    for r in out_ + in_:
        r.status, r.settlement_id, r.paid_date, r.ntpn = ('Disetor' if r.kind == 'PPN Keluaran' else 'Dikompensasi'), sid, d, body.ntpn.strip() or None
    await audit(s, user, 'settle', 'tax', sid, f'Setor PPN masa {body.period}: keluaran Rp{k:,.0f}, masukan Rp{m:,.0f}, setor Rp{net:,.0f}', request=request)
    await s.commit()
    return {'ok': True, 'keluaran': f(k), 'masukan': f(m), 'paid': f(net)}


@router.post('/ppn-settle/{sid}/void')
async def void_ppn_settle(sid: str, body: VoidIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    recs = (await s.scalars(select(TaxRecord).where(TaxRecord.settlement_id == sid))).all()
    if not recs:
        raise HTTPException(404, 'Penyetoran PPN tidak ditemukan')
    if not body.reason.strip():
        raise HTTPException(422, 'Alasan pembatalan wajib diisi')
    for t in (await s.scalars(select(CashTransaction).where(CashTransaction.source_type == 'ppn_settlement', CashTransaction.source_id == sid))).all():
        if t.reconciled:
            raise HTTPException(409, 'Mutasi setoran PPN sudah direkonsiliasi bank')
        t.is_void = True
    await reverse_source(s, 'ppn_settlement', sid, date.today(), body.reason, user)
    for r in recs:
        r.status = 'Terutang' if r.kind == 'PPN Keluaran' else 'Kredit Pajak'
        r.settlement_id = r.paid_date = r.ntpn = None
    await audit(s, user, 'void', 'tax', sid, f'Membatalkan setoran PPN masa {recs[0].period}: {body.reason}', request=request)
    await s.commit()
    return {'ok': True}


# ---------- Aturan pajak berversi ----------
RULE_FIELDS = {'code': 'str!', 'name': 'str!', 'tax_type': 'str!', 'rate': 'num', 'base': 'str', 'criteria': 'str',
               'effective_from': 'date!', 'legal_basis': 'str'}


@router.get('/rules')
async def rules(user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    items = (await s.scalars(select(TaxRule).order_by(TaxRule.code, TaxRule.version.desc()))).all()
    today = date.today()
    out = []
    for r in items:
        d = row(r)
        d['in_effect'] = r.effective_from <= today and (not r.effective_to or r.effective_to >= today)
        out.append(d)
    return {'items': out}


@router.post('/rules')
async def create_rule(payload: dict, request: Request, user: dict = Depends(require_owner), s: AsyncSession = Depends(get_session)):
    data = clean(RULE_FIELDS, payload)
    data['code'] = data['code'].upper()
    prev = await s.scalar(select(TaxRule).where(TaxRule.code == data['code']).order_by(TaxRule.version.desc()))
    if prev:
        if data['effective_from'] <= prev.effective_from:
            raise HTTPException(422, f'Tanggal berlaku versi baru harus setelah {prev.effective_from.isoformat()} (versi {prev.version})')
        prev.effective_to = data['effective_from'] - timedelta(days=1)
    r = TaxRule(**data, version=(prev.version + 1) if prev else 1, created_by=user['email'])
    s.add(r)
    await s.flush()
    await audit(s, user, 'create', 'tax_rule', r.id, f'Aturan pajak {r.code} versi {r.version} ({r.rate}%) berlaku {r.effective_from}', after=row(r), request=request)
    await s.commit()
    return row(r)


# ---------- Koreksi fiskal ----------
CORR_FIELDS = {'date': 'date!', 'description': 'str!', 'direction': 'enum:Positif|Negatif', 'category': 'enum:Beda Tetap|Beda Waktu',
               'amount': 'num', 'reference': 'str'}


async def auto_corrections(s, year):
    out = []
    for e in (await s.scalars(select(Expense).where(Expense.status != 'Void'))).all():
        if e.date.year != year or e.fiscal_treatment == 'Deductible':
            continue
        cat = {'Non-deductible': 'Beda Tetap', 'Temporary Difference': 'Beda Waktu'}.get(e.fiscal_treatment)
        out.append({'id': f'exp-{e.id}', 'source': 'expense', 'date': e.date.isoformat(), 'description': f'{e.number}: {e.description}',
                    'direction': 'Positif', 'category': cat or 'Perlu review', 'amount': f(e.dpp), 'reference': e.fiscal_reason,
                    'included': cat is not None, 'auto': True})
    for i in (await s.scalars(select(Income).where(Income.status != 'Void'))).all():
        if i.date.year == year and i.tax_classification == 'PPh Final':
            out.append({'id': f'inc-{i.id}', 'source': 'income', 'date': i.date.isoformat(), 'description': f'{i.number}: penghasilan PPh Final',
                        'direction': 'Negatif', 'category': 'Beda Tetap', 'amount': f(i.dpp), 'reference': 'Penghasilan yang dikenai PPh Final',
                        'included': True, 'auto': True})
    return out


@router.get('/corrections')
async def corrections(year: int = 0, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    year = year or date.today().year
    manual = (await s.scalars(select(FiscalCorrection).where(FiscalCorrection.year == year).order_by(FiscalCorrection.date))).all()
    return {'year': year, 'auto': await auto_corrections(s, year), 'manual': [{**row(c), 'included': not c.is_void, 'auto': False} for c in manual]}


@router.post('/corrections')
async def create_correction(payload: dict, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    data = clean(CORR_FIELDS, payload)
    if data['amount'] <= 0:
        raise HTTPException(422, 'Nominal koreksi harus lebih dari 0')
    c = FiscalCorrection(**data, year=data['date'].year, created_by=user['email'])
    s.add(c)
    await s.flush()
    await audit(s, user, 'create', 'fiscal', c.id, f'Koreksi fiskal {c.direction} Rp{c.amount:,.0f}: {c.description}', after=row(c), request=request)
    await s.commit()
    return row(c)


@router.post('/corrections/{cid}/void')
async def void_correction(cid: str, body: VoidIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    c = await s.get(FiscalCorrection, cid)
    if not c or c.is_void:
        raise HTTPException(404, 'Koreksi tidak ditemukan')
    c.is_void = True
    await audit(s, user, 'void', 'fiscal', c.id, f'Membatalkan koreksi fiskal: {body.reason}', request=request)
    await s.commit()
    return {'ok': True}


# ---------- Laporan fiskal ----------
@router.get('/fiscal-report')
async def fiscal_report(year: int = 0, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    year = year or date.today().year
    await sync_records(s)
    await s.commit()
    dfrom, dto = date(year, 1, 1), date(year, 12, 31)
    pl = await profit_loss(s, dfrom, dto)
    corr = await corrections(year, user, s)
    items = [c for c in corr['auto'] + corr['manual'] if c['included']]
    pos = sum((D(c['amount']) for c in items if c['direction'] == 'Positif'), ZERO)
    neg = sum((D(c['amount']) for c in items if c['direction'] == 'Negatif'), ZERO)
    tax_exp = D(pl['tax_expense'])
    commercial_before_tax = D(pl['net_profit']) + tax_exp
    pkp_raw = commercial_before_tax + pos - neg
    pkp = max(ZERO, (pkp_raw / 1000).quantize(Decimal('1'), rounding=ROUND_DOWN) * 1000)
    rate = await rate_for(s, 'PPH-BADAN', dto, '22')
    revenue = D(pl['total_revenue'])
    fac = ZERO
    if revenue > 0 and revenue <= Decimal('50000000000'):
        fac = min(pkp, q2(Decimal('4800000000') / revenue * pkp))
    pph = q2(fac * rate / 100 / 2 + (pkp - fac) * rate / 100)
    recs = [r for r in (await s.scalars(select(TaxRecord).where(TaxRecord.period.like(f'{year}-%'), TaxRecord.status != 'Void'))).all()]
    credit23 = sum((D(r.amount) for r in recs if r.kind == 'PPh 23 Dipotong Customer' and r.status == 'Kredit Pajak'), ZERO)
    credit25 = sum((D(r.amount) for r in recs if r.kind == 'PPh 25' and r.status == 'Kredit Pajak'), ZERO)
    monthly = defaultdict(lambda: defaultdict(Decimal))
    for r in recs:
        monthly[r.period][r.kind] += D(r.amount)
    incomes = [i for i in (await s.scalars(select(Income).where(Income.status != 'Void'))).all() if i.date.year == year]
    expenses = [e for e in (await s.scalars(select(Expense).where(Expense.status != 'Void'))).all() if e.date.year == year]
    final_income = sum((D(i.dpp) for i in incomes if i.tax_classification == 'PPh Final'), ZERO)
    by_treat = defaultdict(Decimal)
    for e in expenses:
        by_treat[e.fiscal_treatment] += D(e.dpp)
    return {
        'year': year,
        'management': {'revenue': pl['total_revenue'], 'expense': pl['total_expense'], 'net_profit': pl['net_profit'], 'tax_expense': pl['tax_expense'],
                       'profit_before_tax': f(commercial_before_tax)},
        'fiscal': {'income_final': f(final_income), 'income_non_final': f(revenue - final_income),
                   'deductible': f(by_treat['Deductible']), 'non_deductible': f(by_treat['Non-deductible']),
                   'temporary': f(by_treat['Temporary Difference']), 'requires_review': f(by_treat['Requires Review']),
                   'positive_corrections': f(pos), 'negative_corrections': f(neg), 'pkp_before_rounding': f(pkp_raw), 'pkp': f(pkp),
                   'rate': f(rate), 'facility_31e_pkp': f(fac), 'pph_badan': f(pph), 'credit_pph23': f(credit23), 'credit_pph25': f(credit25),
                   'pph29': f(pph - credit23 - credit25)},
        'corrections': items,
        'monthly': [{'period': p, **{k: f(v) for k, v in kinds.items()}} for p, kinds in sorted(monthly.items())],
        'kinds': list(KINDS),
    }


# ---------- Dashboard pajak ----------
async def tax_dashboard(s):
    await sync_records(s)
    recs = (await s.scalars(select(TaxRecord).where(TaxRecord.status != 'Void'))).all()
    today = date.today()
    periods = sorted({r.period for r in recs if r.kind.startswith('PPN') and r.status in ('Terutang', 'Kredit Pajak')})
    ppn_net = ZERO
    alerts = []
    for p in periods:
        _, _, k, m = ppn_position(recs, p)
        if k - m > 0:
            ppn_net += k - m
            y, mo = map(int, p.split('-'))
            due = due_for('PPN', date(y, mo, 1))
            if due <= today + timedelta(days=10):
                alerts.append({'type': 'tax_due', 'link': '/pajak', 'message': f"PPN masa {p} {'lewat jatuh tempo' if due < today else 'jatuh tempo'} {due.isoformat()}",
                               'project': 'Setor & lapor SPT Masa PPN', 'amount': f(k - m), 'due_date': due.isoformat(), 'overdue': due < today})
    est = defaultdict(Decimal)
    for r in recs:
        if (r.side == 'payable' or r.kind == 'PPh 25') and r.status == 'Terutang' and not r.kind.startswith('PPN'):
            est[r.kind] += D(r.amount)
            if r.due_date and r.due_date <= today + timedelta(days=10):
                alerts.append({'type': 'tax_due', 'link': '/pajak', 'message': f"{r.kind} {r.number} {'lewat jatuh tempo' if r.due_date < today else 'jatuh tempo'} {r.due_date.isoformat()}",
                               'project': r.description or r.number, 'amount': f(r.amount), 'due_date': r.due_date.isoformat(), 'overdue': r.due_date < today})
    waiting = [r for r in recs if r.status == 'Menunggu Bukti Potong']
    if waiting:
        alerts.append({'type': 'tax_doc', 'link': '/pajak', 'message': f'{len(waiting)} bukti potong PPh 23 belum diterima', 'project': 'Minta bukti potong ke customer',
                       'amount': f(sum((D(r.amount) for r in waiting), ZERO))})
    items = [{'label': 'PPN kurang bayar', 'amount': f(ppn_net)}] + [{'label': k, 'amount': f(v)} for k, v in est.items()]
    return {'estimates': items, 'total': f(ppn_net + sum(est.values(), ZERO)), 'alerts': alerts}


@router.get('/dashboard')
async def tax_dashboard_ep(user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    d = await tax_dashboard(s)
    await s.commit()
    return d
