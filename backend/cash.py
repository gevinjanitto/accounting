from collections import defaultdict
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from db import get_session
from models import BankAccount, CashTransaction, Reconciliation, Account, Entity, Expense, new_id
from common import row, audit, paginate_args, D
from calc import f
from security import require_access
from ledger import post_journal, reverse_source, bank_coa_id, next_number, parse_date, acc_id

router = APIRouter(prefix='/api/cash')
ZERO = Decimal('0')
KIND_LABEL = {'income_payment': 'Penerimaan invoice', 'expense': 'Pembayaran biaya', 'transfer': 'Transfer antar rekening',
              'manual': 'Mutasi lain', 'owner_fund': 'Dana CV via pemilik',
              'payroll': 'Pembayaran gaji', 'tax_payment': 'Setoran pajak'}


async def load_bank(s, bid):
    b = await s.get(BankAccount, bid) if bid else None
    if not b:
        raise HTTPException(422, 'Rekening bank/kas wajib dipilih')
    if not b.is_active:
        raise HTTPException(422, f'Rekening {b.name} tidak aktif')
    return b


async def add_cash(s, d, bank, direction, amount, kind, user, source_type=None, source_id=None, counter_account_id=None,
                   entity_id=None, description=None, transfer_group=None):
    tx = CashTransaction(number=await next_number(s, CashTransaction, f"KB-{d.strftime('%Y%m')}-"), date=d, bank_account_id=bank.id,
                         direction=direction, amount=D(amount), kind=kind, source_type=source_type, source_id=source_id,
                         counter_account_id=counter_account_id, entity_id=entity_id or bank.entity_id, description=description,
                         transfer_group=transfer_group, created_by=user['email'])
    s.add(tx)
    await s.flush()
    return tx


async def bank_balances(s, as_of=None):
    stmt = select(CashTransaction.bank_account_id, CashTransaction.direction, func.sum(CashTransaction.amount)).where(CashTransaction.is_void.is_(False))
    if as_of:
        stmt = stmt.where(CashTransaction.date <= as_of)
    sums = defaultdict(Decimal)
    for bid, dirn, amt in (await s.execute(stmt.group_by(CashTransaction.bank_account_id, CashTransaction.direction))).all():
        sums[bid] += D(amt) if dirn == 'in' else -D(amt)
    out = {}
    for b in (await s.scalars(select(BankAccount).order_by(BankAccount.name))).all():
        out[b.id] = (b, D(b.opening_balance) + sums[b.id])
    return out


@router.get('/accounts')
async def accounts(user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    bals = await bank_balances(s)
    unrec = dict((await s.execute(select(CashTransaction.bank_account_id, func.count()).where(
        CashTransaction.is_void.is_(False), CashTransaction.reconciled.is_(False)).group_by(CashTransaction.bank_account_id))).all())
    ents = {e.id: e.name for e in (await s.scalars(select(Entity))).all()}
    items = [{**row(b), 'balance': f(bal), 'entity_name': ents.get(b.entity_id), 'unreconciled': unrec.get(b.id, 0)} for b, bal in bals.values()]
    return {'items': items, 'total_balance': f(sum((bal for _, bal in bals.values()), ZERO))}


@router.get('/transactions')
async def transactions(bank_account_id: str = '', kind: str = '', q: str = '', date_from: str = '', date_to: str = '', page: int = 1, page_size: int = 25,
                       user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    stmt = select(CashTransaction)
    if bank_account_id:
        stmt = stmt.where(CashTransaction.bank_account_id == bank_account_id)
    if kind:
        stmt = stmt.where(CashTransaction.kind == kind)
    if q:
        stmt = stmt.where(or_(CashTransaction.number.ilike(f'%{q}%'), CashTransaction.description.ilike(f'%{q}%')))
    if date_from:
        stmt = stmt.where(CashTransaction.date >= parse_date(date_from))
    if date_to:
        stmt = stmt.where(CashTransaction.date <= parse_date(date_to))
    total = await s.scalar(select(func.count()).select_from(stmt.subquery()))
    page, page_size, offset = paginate_args(page, page_size)
    txs = (await s.scalars(stmt.order_by(CashTransaction.date.desc(), CashTransaction.number.desc()).offset(offset).limit(page_size))).all()
    banks = {b.id: b.name for b in (await s.scalars(select(BankAccount))).all()}
    accs = {a.id: f'{a.code} · {a.name}' for a in (await s.scalars(select(Account))).all()}
    items = [{**row(t), 'bank_name': banks.get(t.bank_account_id), 'kind_label': KIND_LABEL.get(t.kind, t.kind),
              'counter_account': accs.get(t.counter_account_id)} for t in txs]
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


class ManualIn(BaseModel):
    date: str
    bank_account_id: str
    direction: str
    amount: float
    counter_account_id: str | None = None
    kind: str = 'manual'
    entity_id: str | None = None
    description: str


@router.post('/transactions')
async def create_manual(body: ManualIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    if body.direction not in ('in', 'out') or body.kind not in ('manual', 'owner_fund'):
        raise HTTPException(422, 'Arah/jenis mutasi tidak valid')
    if body.amount <= 0:
        raise HTTPException(422, 'Nominal harus lebih dari 0')
    if not body.description.strip():
        raise HTTPException(422, 'Keterangan wajib diisi')
    d = parse_date(body.date)
    bank = await load_bank(s, body.bank_account_id)
    counter = body.counter_account_id or (await acc_id(s, '2300') if body.kind == 'owner_fund' else None)
    if not counter or not await s.get(Account, counter):
        raise HTTPException(422, 'Akun lawan (COA) wajib dipilih')
    tx = await add_cash(s, d, bank, body.direction, body.amount, body.kind, user, counter_account_id=counter,
                        entity_id=body.entity_id, description=body.description)
    tx.source_type, tx.source_id = 'cash', tx.id
    b_acc = await bank_coa_id(s, bank)
    amt = D(body.amount)
    lines = [(b_acc, amt, 0, bank.name), (counter, 0, amt, body.description)] if body.direction == 'in' else \
        [(counter, amt, 0, body.description), (b_acc, 0, amt, bank.name)]
    await post_journal(s, d, f'{KIND_LABEL[body.kind]}: {body.description}', lines, user, 'cash', tx.id, entity_id=tx.entity_id)
    await audit(s, user, 'create', 'cash', tx.id, f'Mutasi {tx.number} {body.direction} {amt:,.0f}', after=row(tx), request=request)
    await s.commit()
    return row(tx)


class TransferIn(BaseModel):
    date: str
    from_account_id: str
    to_account_id: str
    amount: float
    description: str | None = None


@router.post('/transfers')
async def transfer(body: TransferIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    if body.from_account_id == body.to_account_id:
        raise HTTPException(422, 'Rekening asal dan tujuan harus berbeda')
    if body.amount <= 0:
        raise HTTPException(422, 'Nominal harus lebih dari 0')
    d = parse_date(body.date)
    src, dst = await load_bank(s, body.from_account_id), await load_bank(s, body.to_account_id)
    group = new_id()
    desc = body.description or f'Transfer {src.name} → {dst.name}'
    out_tx = await add_cash(s, d, src, 'out', body.amount, 'transfer', user, 'transfer', group, description=desc, transfer_group=group)
    await add_cash(s, d, dst, 'in', body.amount, 'transfer', user, 'transfer', group, description=desc, transfer_group=group)
    amt = D(body.amount)
    await post_journal(s, d, desc, [(await bank_coa_id(s, dst), amt, 0, dst.name), (await bank_coa_id(s, src), 0, amt, src.name)],
                       user, 'transfer', group, entity_id=src.entity_id)
    await audit(s, user, 'create', 'cash', out_tx.id, f'Transfer {amt:,.0f} dari {src.name} ke {dst.name}', request=request)
    await s.commit()
    return {'ok': True, 'transfer_group': group}


class VoidIn(BaseModel):
    reason: str


@router.post('/transactions/{tid}/void')
async def void_tx(tid: str, body: VoidIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    tx = await s.get(CashTransaction, tid)
    if not tx or tx.is_void:
        raise HTTPException(404, 'Mutasi tidak ditemukan atau sudah dibatalkan')
    if tx.kind not in ('manual', 'owner_fund', 'transfer'):
        raise HTTPException(409, 'Mutasi dari invoice/biaya dibatalkan melalui modul Pemasukan/Pengeluaran')
    if tx.reconciled:
        raise HTTPException(409, 'Mutasi sudah direkonsiliasi dan tidak dapat dibatalkan')
    if not body.reason.strip():
        raise HTTPException(422, 'Alasan pembatalan wajib diisi')
    txs = [tx]
    if tx.transfer_group:
        txs = (await s.scalars(select(CashTransaction).where(CashTransaction.transfer_group == tx.transfer_group))).all()
        if any(t.reconciled for t in txs):
            raise HTTPException(409, 'Salah satu sisi transfer sudah direkonsiliasi')
    for t in txs:
        t.is_void = True
    await reverse_source(s, tx.source_type, tx.source_id, date.today(), body.reason, user)
    await audit(s, user, 'void', 'cash', tx.id, f'Membatalkan mutasi {tx.number}: {body.reason}', request=request)
    await s.commit()
    return {'ok': True}


@router.get('/reconcile/{bank_id}')
async def reconcile_view(bank_id: str, statement_date: str = '', user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    bank = await s.get(BankAccount, bank_id)
    if not bank:
        raise HTTPException(404, 'Rekening tidak ditemukan')
    sd = parse_date(statement_date) or date.today()
    txs = (await s.scalars(select(CashTransaction).where(CashTransaction.bank_account_id == bank_id, CashTransaction.is_void.is_(False),
                                                         CashTransaction.date <= sd).order_by(CashTransaction.date))).all()
    rec_bal = D(bank.opening_balance) + sum(((D(t.amount) if t.direction == 'in' else -D(t.amount)) for t in txs if t.reconciled), ZERO)
    book = D(bank.opening_balance) + sum(((D(t.amount) if t.direction == 'in' else -D(t.amount)) for t in txs), ZERO)
    history = (await s.scalars(select(Reconciliation).where(Reconciliation.bank_account_id == bank_id).order_by(Reconciliation.statement_date.desc()))).all()
    return {'bank': row(bank), 'statement_date': sd.isoformat(), 'reconciled_balance': f(rec_bal), 'book_balance': f(book),
            'unreconciled': [row(t) for t in txs if not t.reconciled], 'history': [row(h) for h in history]}


class ReconcileIn(BaseModel):
    bank_account_id: str
    statement_date: str
    statement_balance: float
    transaction_ids: list[str]
    note: str | None = None


@router.post('/reconcile')
async def reconcile(body: ReconcileIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    bank = await s.get(BankAccount, body.bank_account_id)
    if not bank:
        raise HTTPException(404, 'Rekening tidak ditemukan')
    sd = parse_date(body.statement_date)
    txs = (await s.scalars(select(CashTransaction).where(CashTransaction.id.in_(body.transaction_ids or ['-'])))).all()
    if any(t.bank_account_id != bank.id or t.is_void or t.reconciled or t.date > sd for t in txs):
        raise HTTPException(422, 'Ada mutasi yang tidak valid untuk rekonsiliasi ini')
    prev = (await s.scalars(select(CashTransaction).where(CashTransaction.bank_account_id == bank.id, CashTransaction.reconciled.is_(True),
                                                          CashTransaction.is_void.is_(False)))).all()
    cleared = D(bank.opening_balance) + sum(((D(t.amount) if t.direction == 'in' else -D(t.amount)) for t in list(prev) + list(txs)), ZERO)
    rec = Reconciliation(bank_account_id=bank.id, statement_date=sd, statement_balance=D(body.statement_balance), book_balance=cleared,
                         difference=D(body.statement_balance) - cleared, items=len(txs), note=body.note, created_by=user['email'])
    s.add(rec)
    await s.flush()
    for t in txs:
        t.reconciled, t.reconciliation_id = True, rec.id
    await audit(s, user, 'reconcile', 'cash', rec.id, f'Rekonsiliasi {bank.name} per {sd.isoformat()} ({len(txs)} mutasi, selisih {f(rec.difference):,.0f})', after=row(rec), request=request)
    await s.commit()
    return row(rec)


async def cash_flow(s, date_from=None, date_to=None, entity_id=None):
    stmt = select(CashTransaction).where(CashTransaction.is_void.is_(False), CashTransaction.kind != 'transfer')
    if date_from:
        stmt = stmt.where(CashTransaction.date >= date_from)
    if date_to:
        stmt = stmt.where(CashTransaction.date <= date_to)
    if entity_id:
        stmt = stmt.where(CashTransaction.entity_id == entity_id)
    txs = (await s.scalars(stmt)).all()
    asset_exp = set((await s.scalars(select(Expense.id).where(Expense.category == 'Asset Acquisition'))).all())
    equity = {a.id for a in (await s.scalars(select(Account).where(Account.group_code == '3000'))).all()}
    sec = {'operating': defaultdict(Decimal), 'investing': defaultdict(Decimal), 'financing': defaultdict(Decimal)}
    for t in txs:
        sign = D(t.amount) if t.direction == 'in' else -D(t.amount)
        if t.source_type in ('expense', 'expense_payment') and t.source_id in asset_exp:
            sec['investing']['Pembelian aset'] += sign
        elif t.kind == 'owner_fund' or t.counter_account_id in equity:
            sec['financing']['Dana pemilik / modal'] += sign
        elif t.kind == 'income_payment':
            sec['operating']['Penerimaan dari customer'] += sign
        elif t.kind == 'expense':
            sec['operating']['Pembayaran biaya & vendor'] += sign
        elif t.kind == 'payroll':
            sec['operating']['Pembayaran gaji'] += sign
        elif t.kind == 'tax_payment':
            sec['operating']['Setoran pajak'] += sign
        else:
            sec['operating']['Mutasi lain'] += sign
    out = {k: [{'label': l, 'amount': f(v)} for l, v in d.items()] for k, d in sec.items()}
    totals = {k: f(sum(d.values(), ZERO)) for k, d in sec.items()}
    opening = ZERO
    if date_from:
        bals = await bank_balances(s, date.fromordinal(date_from.toordinal() - 1))
        opening = sum((v for b, v in bals.values() if not entity_id or b.entity_id == entity_id), ZERO)
    else:
        opening = sum((D(b.opening_balance) for b in (await s.scalars(select(BankAccount))).all() if not entity_id or b.entity_id == entity_id), ZERO)
    net = sum((D(v) for v in totals.values()), ZERO)
    return {'sections': out, 'totals': totals, 'net_change': f(net), 'opening_cash': f(opening), 'closing_cash': f(opening + net)}


@router.get('/cash-flow')
async def cash_flow_ep(date_from: str = '', date_to: str = '', entity_id: str = '', user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    return await cash_flow(s, parse_date(date_from), parse_date(date_to), entity_id or None)
