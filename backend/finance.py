from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, func, or_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from db import get_session
from models import Income, IncomePayment, Expense, CashTransaction, ProjectCost, Project, Entity, Party, Account, BankAccount, Document
from common import row, clean, audit, paginate_args, D
from calc import f, COMPONENTS, DIRECT, COST_COMPONENTS
from security import require_access
from ledger import post_journal, reverse_source, acc_id, bank_coa_id, next_number, parse_date
from cash import add_cash, load_bank

router = APIRouter(prefix='/api')
ZERO = Decimal('0')
CENT = Decimal('0.01')
CATEGORIES = ['Direct Cost', 'Labor Cost', 'Overhead', 'Administrative Expense', 'Asset Acquisition', 'Other Expense']
FISCAL = ['Deductible', 'Non-deductible', 'Temporary Difference', 'Requires Review']
DEFAULT_ACCOUNT = {'Direct Cost': '5000', 'Labor Cost': '5100', 'Overhead': '6000', 'Administrative Expense': '6500',
                   'Asset Acquisition': '1500', 'Other Expense': '6000'}
COMPONENT_ACCOUNT = {'freelancer': '5200', 'server': '5300', 'lisensi': '5300'}
INCOME_FIELDS = {'date': 'date!', 'invoice_number': 'str', 'invoice_date': 'date', 'due_date': 'date', 'entity_id': 'str!',
                 'project_id': 'str', 'customer_id': 'str', 'revenue_account_id': 'str', 'description': 'str', 'dpp': 'num',
                 'ppn_pct': 'num', 'pph_pct': 'num', 'ppn_paid_by': 'enum:client|kita', 'pph_paid_by': 'enum:client|kita', 'tax_classification': 'str!'}
EXPENSE_FIELDS = {'date': 'date!', 'entity_id': 'str', 'project_id': 'str', 'category': 'enum:' + '|'.join(CATEGORIES),
                  'account_id': 'str', 'component': 'str', 'description': 'str!', 'dpp': 'num', 'ppn_pct': 'num',
                  'payment_method': 'enum:Transfer|Tunai|Utang', 'bank_account_id': 'str', 'fiscal_treatment': 'enum:' + '|'.join(FISCAL),
                  'fiscal_reason': 'str', 'fiscal_reference': 'str', 'tax_classification': 'str!'}


def q2(v):
    return D(v).quantize(CENT)


async def doc_counts(s, linked_type, ids):
    if not ids:
        return {}
    return dict((await s.execute(select(Document.linked_id, func.count()).where(Document.linked_type == linked_type, Document.linked_id.in_(ids))
                                 .group_by(Document.linked_id))).all())


async def lookups(s):
    return ({e.id: e for e in (await s.scalars(select(Entity))).all()},
            {p.id: p.name for p in (await s.scalars(select(Party))).all()},
            {p.id: f'{p.code} · {p.name}' for p in (await s.scalars(select(Project))).all()},
            {a.id: f'{a.code} · {a.name}' for a in (await s.scalars(select(Account))).all()},
            {b.id: b.name for b in (await s.scalars(select(BankAccount))).all()})


async def validate_refs(s, data):
    if len(data.get('description') or '') > 255:
        raise HTTPException(422, 'Deskripsi maksimal 255 karakter')
    p = None
    if data.get('project_id'):
        p = await s.get(Project, data['project_id'])
        if not p:
            raise HTTPException(422, 'Project tidak ditemukan')
    if not data.get('entity_id'):
        data['entity_id'] = p.entity_id if p else await s.scalar(select(Entity.id).order_by(Entity.created_at).limit(1))
    if not data['entity_id'] or not await s.get(Entity, data['entity_id']):
        raise HTTPException(422, 'Entitas wajib dipilih')
    return p


def income_paid_by(data):
    data['ppn_paid_by'] = data.get('ppn_paid_by') or 'client'
    data['pph_paid_by'] = data.get('pph_paid_by') or 'kita'


# ---------- Income ----------
async def _post_income(s, inc: Income, user):
    if inc.dpp <= 0:
        raise HTTPException(422, 'DPP harus lebih dari 0')
    inc.ppn = q2(inc.dpp * D(inc.ppn_pct) / 100)
    inc.pph = q2(inc.dpp * D(inc.pph_pct) / 100)
    ppn_kita = inc.ppn if inc.ppn_paid_by == 'kita' else ZERO
    pph_kita = inc.pph if inc.pph_paid_by == 'kita' else ZERO
    inc.total = inc.dpp + inc.ppn - ppn_kita
    inc.net_receivable = inc.total - pph_kita
    rev = inc.revenue_account_id or await acc_id(s, '4100')
    inc.revenue_account_id = rev
    lines = [(await acc_id(s, '1200'), inc.net_receivable, 0, f'Piutang {inc.invoice_number or inc.number}'),
             (await acc_id(s, '1320'), pph_kita, 0, 'PPh dipotong client (kredit pajak)'),
             (await acc_id(s, '8200'), ppn_kita, 0, 'PPN ditanggung perusahaan'),
             (rev, 0, inc.dpp, inc.description), (await acc_id(s, '2200'), 0, inc.ppn, 'PPN Keluaran (bukan pendapatan)')]
    await post_journal(s, inc.date, f'Pendapatan {inc.number}: {inc.description or inc.invoice_number or ""}', lines, user, 'income', inc.id,
                       entity_id=inc.entity_id, project_id=inc.project_id)


def income_net(inc):
    return D(inc.dpp) - (D(inc.ppn) if inc.ppn_paid_by == 'kita' else ZERO) - (D(inc.pph) if inc.pph_paid_by == 'kita' else ZERO)


def income_status(inc):
    if inc.status == 'Void':
        return 'Void'
    if inc.paid_amount <= 0:
        return 'Unpaid'
    return 'Paid' if inc.paid_amount >= inc.net_receivable else 'Partial'


@router.get('/incomes')
async def list_incomes(q: str = '', status: str = '', project_id: str = '', customer_id: str = '', page: int = 1, page_size: int = 20,
                       user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    stmt = select(Income)
    if q:
        stmt = stmt.where(or_(Income.number.ilike(f'%{q}%'), Income.invoice_number.ilike(f'%{q}%'), Income.description.ilike(f'%{q}%')))
    if status:
        stmt = stmt.where(Income.status == status)
    if project_id:
        stmt = stmt.where(Income.project_id == project_id)
    if customer_id:
        stmt = stmt.where(Income.customer_id == customer_id)
    total = await s.scalar(select(func.count()).select_from(stmt.subquery()))
    page, page_size, offset = paginate_args(page, page_size)
    items = (await s.scalars(stmt.order_by(Income.date.desc(), Income.number.desc()).offset(offset).limit(page_size))).all()
    ents, parties, projects, accs, banks = await lookups(s)
    docs = await doc_counts(s, 'income', [i.id for i in items])
    ids = [i.id for i in items] or ['-']
    pays = (await s.scalars(select(IncomePayment).where(IncomePayment.income_id.in_(ids)).order_by(IncomePayment.date))).all()
    out = []
    for i in items:
        out.append({**row(i), 'entity_name': ents[i.entity_id].name if i.entity_id in ents else None, 'customer_name': parties.get(i.customer_id),
                    'project_name': projects.get(i.project_id), 'revenue_account': accs.get(i.revenue_account_id), 'documents': docs.get(i.id, 0),
                    'outstanding': f(D(i.net_receivable) - D(i.paid_amount)) if i.status != 'Void' else 0.0, 'net_income': f(income_net(i)),
                    'payments': [{**row(p), 'bank_name': banks.get(p.bank_account_id)} for p in pays if p.income_id == i.id]})
    agg = (await s.execute(select(func.sum(Income.dpp), func.sum(Income.net_receivable - Income.paid_amount), func.sum(Income.ppn)).where(Income.status != 'Void'))).one()
    return {'items': out, 'total': total, 'page': page, 'page_size': page_size, 'total_dpp': f(agg[0] or 0), 'total_outstanding': f(agg[1] or 0),
            'total_ppn': f(agg[2] or 0)}


@router.post('/incomes')
async def create_income(payload: dict, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    data = clean(INCOME_FIELDS, payload)
    income_paid_by(data)
    await validate_refs(s, data)
    inc = Income(number=await next_number(s, Income, f"INC-{data['date'].year}-"), created_by=user['email'], **data)
    s.add(inc)
    await s.flush()
    await _post_income(s, inc, user)
    inc.status = income_status(inc)
    await audit(s, user, 'create', 'incomes', inc.id, f'Pemasukan {inc.number} DPP {f(inc.dpp):,.0f}', after=row(inc), request=request)
    await s.commit()
    return row(inc)


async def load_income(s, iid):
    inc = await s.get(Income, iid)
    if not inc:
        raise HTTPException(404, 'Pemasukan tidak ditemukan')
    return inc


@router.put('/incomes/{iid}')
async def update_income(iid: str, payload: dict, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    inc = await load_income(s, iid)
    if inc.status == 'Void' or inc.paid_amount > 0:
        raise HTTPException(409, 'Pemasukan yang sudah dibayar/dibatalkan tidak dapat diubah. Batalkan pembayaran terlebih dahulu.')
    before = row(inc)
    data = clean(INCOME_FIELDS, payload)
    income_paid_by(data)
    data['entity_id'] = data.get('entity_id') or inc.entity_id
    await validate_refs(s, data)
    await reverse_source(s, 'income', inc.id, data['date'], 'Perubahan data pemasukan', user)
    for k, v in data.items():
        setattr(inc, k, v)
    await _post_income(s, inc, user)
    await audit(s, user, 'update', 'incomes', inc.id, f'Mengubah pemasukan {inc.number}', before=before, after=row(inc), request=request)
    await s.commit()
    return row(inc)


class PaymentIn(BaseModel):
    date: str
    amount: float
    bank_account_id: str
    note: str | None = None


@router.post('/incomes/{iid}/payments')
async def add_payment(iid: str, body: PaymentIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    inc = await load_income(s, iid)
    if inc.status == 'Void':
        raise HTTPException(409, 'Pemasukan sudah dibatalkan')
    amt = q2(body.amount)
    outstanding = D(inc.net_receivable) - D(inc.paid_amount)
    if amt <= 0 or amt > outstanding:
        raise HTTPException(422, f'Nominal pembayaran harus antara 1 dan sisa piutang ({f(outstanding):,.0f})')
    d = parse_date(body.date)
    bank = await load_bank(s, body.bank_account_id)
    pay = IncomePayment(income_id=inc.id, date=d, amount=amt, bank_account_id=bank.id, note=body.note)
    s.add(pay)
    await s.flush()
    tx = await add_cash(s, d, bank, 'in', amt, 'income_payment', user, 'income_payment', pay.id, await acc_id(s, '1200'),
                        entity_id=inc.entity_id, description=f'Penerimaan {inc.invoice_number or inc.number}')
    pay.cash_tx_id = tx.id
    await post_journal(s, d, f'Penerimaan {inc.number} ke {bank.name}', [(await bank_coa_id(s, bank), amt, 0, bank.name),
                       (await acc_id(s, '1200'), 0, amt, inc.invoice_number)], user, 'income_payment', pay.id, entity_id=inc.entity_id, project_id=inc.project_id)
    inc.paid_amount = D(inc.paid_amount) + amt
    inc.status = income_status(inc)
    await audit(s, user, 'create', 'income_payments', pay.id, f'Pembayaran {f(amt):,.0f} untuk {inc.number} ke {bank.name}', after=row(pay), request=request)
    await s.commit()
    return row(inc)


class VoidIn(BaseModel):
    reason: str


@router.post('/incomes/{iid}/payments/{pid}/void')
async def void_payment(iid: str, pid: str, body: VoidIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    inc = await load_income(s, iid)
    pay = await s.get(IncomePayment, pid)
    if not pay or pay.income_id != iid or pay.is_void:
        raise HTTPException(404, 'Pembayaran tidak ditemukan')
    tx = await s.get(CashTransaction, pay.cash_tx_id) if pay.cash_tx_id else None
    if tx and tx.reconciled:
        raise HTTPException(409, 'Mutasi pembayaran sudah direkonsiliasi')
    if not body.reason.strip():
        raise HTTPException(422, 'Alasan pembatalan wajib diisi')
    pay.is_void = True
    if tx:
        tx.is_void = True
    await reverse_source(s, 'income_payment', pay.id, date.today(), body.reason, user)
    inc.paid_amount = D(inc.paid_amount) - D(pay.amount)
    inc.status = income_status(inc)
    await audit(s, user, 'void', 'income_payments', pay.id, f'Membatalkan pembayaran {inc.number}: {body.reason}', request=request)
    await s.commit()
    return row(inc)


@router.post('/incomes/{iid}/void')
async def void_income(iid: str, body: VoidIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    inc = await load_income(s, iid)
    if inc.status == 'Void':
        raise HTTPException(409, 'Pemasukan sudah dibatalkan')
    if inc.paid_amount > 0:
        raise HTTPException(409, 'Batalkan seluruh pembayaran terlebih dahulu')
    if not body.reason.strip():
        raise HTTPException(422, 'Alasan pembatalan wajib diisi')
    await reverse_source(s, 'income', inc.id, date.today(), body.reason, user)
    inc.status, inc.void_reason = 'Void', body.reason
    await audit(s, user, 'void', 'incomes', inc.id, f'Membatalkan pemasukan {inc.number}: {body.reason}', request=request)
    await s.commit()
    return row(inc)


# ---------- Expense ----------
async def _post_expense(s, e: Expense, user, project):
    if e.dpp <= 0:
        raise HTTPException(422, 'DPP harus lebih dari 0')
    if e.fiscal_treatment != 'Deductible' and not (e.fiscal_reason or '').strip():
        raise HTTPException(422, 'Alasan perlakuan fiskal wajib diisi bila bukan Deductible')
    if e.component and e.component not in COST_COMPONENTS:
        raise HTTPException(422, 'Komponen biaya project tidak dikenal')
    if e.category == 'Direct Cost' and e.project_id and e.component not in DIRECT:
        raise HTTPException(422, 'Pilih komponen biaya langsung untuk project')
    if e.component == 'bonus' and e.category != 'Labor Cost':
        raise HTTPException(422, 'Komponen bonus hanya untuk kategori Labor Cost')
    if not e.project_id:
        e.component = None
    if project and e.component and project.status == 'Completed':
        raise HTTPException(409, 'Project sudah ditutup; biaya tidak dapat ditambahkan ke project')
    e.account_id = e.account_id or await acc_id(s, COMPONENT_ACCOUNT.get(e.component, DEFAULT_ACCOUNT[e.category]))
    if not await s.get(Account, e.account_id):
        raise HTTPException(422, 'Akun COA tidak ditemukan')
    e.ppn = q2(e.dpp * D(e.ppn_pct) / 100)
    e.total = e.dpp + e.ppn
    paid = e.payment_method != 'Utang'
    bank = await load_bank(s, e.bank_account_id) if paid else None
    e.bank_account_id = bank.id if bank else None
    e.status, e.paid_date = ('Paid', e.date) if paid else ('Unpaid', None)
    credit = await bank_coa_id(s, bank) if paid else await acc_id(s, '2100')
    lines = [(e.account_id, e.dpp, 0, e.description), (await acc_id(s, '1310'), e.ppn, 0, 'PPN Masukan'),
             (credit, 0, e.total, bank.name if bank else 'Utang usaha')]
    await post_journal(s, e.date, f'Biaya {e.number}: {e.description}', lines, user, 'expense', e.id, entity_id=e.entity_id, project_id=e.project_id)
    if paid:
        await add_cash(s, e.date, bank, 'out', e.total, 'expense', user, 'expense', e.id, e.account_id, entity_id=e.entity_id,
                       description=f'{e.number}: {e.description}')
    if e.project_id and e.component:
        s.add(ProjectCost(project_id=e.project_id, date=e.date, vendor_id=e.vendor_id, component=e.component, amount=e.dpp,
                          description=f'{e.number}: {e.description}'[:255], expense_id=e.id))


async def _unpost_expense(s, e: Expense, reason, user):
    txs = (await s.scalars(select(CashTransaction).where(CashTransaction.source_type.in_(['expense', 'expense_payment']),
                                                         CashTransaction.source_id == e.id, CashTransaction.is_void.is_(False)))).all()
    if any(t.reconciled for t in txs):
        raise HTTPException(409, 'Mutasi pembayaran biaya ini sudah direkonsiliasi')
    if e.project_id:
        p = await s.get(Project, e.project_id)
        if p and p.status == 'Completed' and e.component:
            raise HTTPException(409, 'Project terkait sudah ditutup')
    for t in txs:
        t.is_void = True
    d, why = (e.date, 'Perubahan data pengeluaran') if reason == 'edit' else (date.today(), reason)
    await reverse_source(s, 'expense', e.id, d, why, user)
    await reverse_source(s, 'expense_payment', e.id, d, why, user)
    await s.execute(delete(ProjectCost).where(ProjectCost.expense_id == e.id))


@router.get('/expenses')
async def list_expenses(q: str = '', status: str = '', category: str = '', project_id: str = '', page: int = 1, page_size: int = 20,
                        user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    stmt = select(Expense)
    if q:
        stmt = stmt.where(or_(Expense.number.ilike(f'%{q}%'), Expense.description.ilike(f'%{q}%')))
    if status:
        stmt = stmt.where(Expense.status == status)
    if category:
        stmt = stmt.where(Expense.category == category)
    if project_id:
        stmt = stmt.where(Expense.project_id == project_id)
    total = await s.scalar(select(func.count()).select_from(stmt.subquery()))
    page, page_size, offset = paginate_args(page, page_size)
    items = (await s.scalars(stmt.order_by(Expense.date.desc(), Expense.number.desc()).offset(offset).limit(page_size))).all()
    ents, parties, projects, accs, banks = await lookups(s)
    docs = await doc_counts(s, 'expense', [i.id for i in items])
    out = [{**row(e), 'entity_name': ents[e.entity_id].name if e.entity_id in ents else None, 'vendor_name': parties.get(e.vendor_id),
            'project_name': projects.get(e.project_id), 'account_name': accs.get(e.account_id), 'bank_name': banks.get(e.bank_account_id),
            'component_label': COMPONENTS[e.component][0] if e.component in COMPONENTS else None, 'documents': docs.get(e.id, 0)} for e in items]
    agg = (await s.execute(select(func.sum(Expense.dpp)).where(Expense.status != 'Void'))).scalar()
    unpaid = (await s.execute(select(func.sum(Expense.total)).where(Expense.status == 'Unpaid'))).scalar()
    return {'items': out, 'total': total, 'page': page, 'page_size': page_size, 'total_dpp': f(agg or 0), 'total_unpaid': f(unpaid or 0)}


@router.get('/expenses/meta')
async def expense_meta(user: dict = Depends(require_access)):
    return {'categories': CATEGORIES, 'fiscal_treatments': FISCAL, 'default_accounts': DEFAULT_ACCOUNT, 'component_accounts': COMPONENT_ACCOUNT,
            'components': [{'key': k, 'label': COMPONENTS[k][0]} for k in COST_COMPONENTS]}


async def default_account(s, data):
    # resolve default COA before any flush (expenses.account_id is NOT NULL)
    if not data.get('account_id'):
        comp = data.get('component') if data.get('project_id') else None
        data['account_id'] = await acc_id(s, COMPONENT_ACCOUNT.get(comp, DEFAULT_ACCOUNT[data['category']]))


@router.post('/expenses')
async def create_expense(payload: dict, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    data = clean(EXPENSE_FIELDS, payload)
    data['category'] = data.get('category') or 'Other Expense'
    data['payment_method'] = data.get('payment_method') or 'Transfer'
    data['fiscal_treatment'] = data.get('fiscal_treatment') or 'Deductible'
    project = await validate_refs(s, data)
    await default_account(s, data)
    e = Expense(number=await next_number(s, Expense, f"EXP-{data['date'].year}-"), created_by=user['email'], **data)
    s.add(e)
    await s.flush()
    await _post_expense(s, e, user, project)
    await audit(s, user, 'create', 'expenses', e.id, f'Pengeluaran {e.number} {f(e.total):,.0f} ({e.category})', after=row(e), request=request)
    await s.commit()
    return row(e)


async def load_expense(s, eid):
    e = await s.get(Expense, eid)
    if not e:
        raise HTTPException(404, 'Pengeluaran tidak ditemukan')
    if e.status == 'Void':
        raise HTTPException(409, 'Pengeluaran sudah dibatalkan')
    return e


@router.put('/expenses/{eid}')
async def update_expense(eid: str, payload: dict, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    e = await load_expense(s, eid)
    before = row(e)
    data = clean(EXPENSE_FIELDS, payload)
    data['category'] = data.get('category') or e.category
    data['payment_method'] = data.get('payment_method') or e.payment_method
    data['fiscal_treatment'] = data.get('fiscal_treatment') or e.fiscal_treatment
    data['entity_id'] = data.get('entity_id') or (None if data.get('project_id') else e.entity_id)
    project = await validate_refs(s, data)
    await default_account(s, data)
    await _unpost_expense(s, e, 'edit', user)
    for k, v in data.items():
        setattr(e, k, v)
    await _post_expense(s, e, user, project)
    await audit(s, user, 'update', 'expenses', e.id, f'Mengubah pengeluaran {e.number}', before=before, after=row(e), request=request)
    await s.commit()
    return row(e)


class PayIn(BaseModel):
    date: str
    bank_account_id: str


@router.post('/expenses/{eid}/pay')
async def pay_expense(eid: str, body: PayIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    e = await load_expense(s, eid)
    if e.status != 'Unpaid':
        raise HTTPException(409, 'Pengeluaran sudah dibayar')
    d = parse_date(body.date)
    bank = await load_bank(s, body.bank_account_id)
    await post_journal(s, d, f'Pelunasan utang {e.number}', [(await acc_id(s, '2100'), e.total, 0, e.description),
                       (await bank_coa_id(s, bank), 0, e.total, bank.name)], user, 'expense_payment', e.id, entity_id=e.entity_id, project_id=e.project_id)
    await add_cash(s, d, bank, 'out', e.total, 'expense', user, 'expense_payment', e.id, await acc_id(s, '2100'), entity_id=e.entity_id,
                   description=f'Pelunasan {e.number}: {e.description}')
    e.status, e.paid_date, e.bank_account_id = 'Paid', d, bank.id
    await audit(s, user, 'pay', 'expenses', e.id, f'Melunasi {e.number} dari {bank.name}', request=request)
    await s.commit()
    return row(e)


@router.post('/expenses/{eid}/void')
async def void_expense(eid: str, body: VoidIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    e = await load_expense(s, eid)
    if not body.reason.strip():
        raise HTTPException(422, 'Alasan pembatalan wajib diisi')
    await _unpost_expense(s, e, body.reason, user)
    e.status, e.void_reason = 'Void', body.reason
    await audit(s, user, 'void', 'expenses', e.id, f'Membatalkan pengeluaran {e.number}: {body.reason}', request=request)
    await s.commit()
    return row(e)
