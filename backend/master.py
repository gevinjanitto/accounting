from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from db import get_session
from models import Entity, Party, Employee, Account, BankAccount, TaxCode, Period, Project, ProjectCost, Timesheet, JournalLine, CashTransaction, CostType
from common import row, clean, audit, paginate_args
from security import require_access

router = APIRouter(prefix='/api/master')

ACCOUNT_TYPES = 'Asset|Liability|Equity|Revenue|Expense|Tax'
SPECS = {
    'entities': dict(model=Entity, label='Entitas', search=['name', 'npwp'], order='name', fields={
        'name': 'str!', 'type': 'enum:CV|Pribadi|Lainnya', 'npwp': 'str', 'address': 'str', 'tax_status': 'str',
        'is_pkp': 'bool', 'default_bank_account_id': 'str', 'is_active': 'bool'}),
    'customers': dict(model=Party, kind='customer', label='Customer', search=['name', 'email', 'npwp'], order='name', fields={
        'name': 'str!', 'party_type': 'str', 'npwp': 'str', 'address': 'str', 'contact_person': 'str',
        'email': 'str', 'phone': 'str', 'is_active': 'bool'}),
    'vendors': dict(model=Party, kind='vendor', label='Vendor', search=['name', 'email', 'npwp'], order='name', fields={
        'name': 'str!', 'party_type': 'str', 'npwp': 'str', 'address': 'str', 'contact_person': 'str',
        'email': 'str', 'phone': 'str', 'is_active': 'bool'}),
    'employees': dict(model=Employee, label='Karyawan', search=['name', 'code', 'position', 'department'], order='code', fields={
        'code': 'str!', 'name': 'str!', 'position': 'str', 'department': 'str', 'base_salary': 'num',
        'allowance': 'num', 'other_cost': 'num', 'productive_hours': 'num', 'status': 'enum:Aktif|Nonaktif|Cuti'}),
    'accounts': dict(model=Account, label='Akun (COA)', search=['code', 'name'], order='code', fields={
        'code': 'str!', 'name': 'str!', 'group_code': 'enum:1000|1300|2000|3000|4000|5000|6000|7000|8000',
        'account_type': f'enum:{ACCOUNT_TYPES}', 'description': 'str', 'is_active': 'bool'}),
    'bank-accounts': dict(model=BankAccount, label='Rekening Bank/Kas', search=['name', 'bank_name', 'account_number'], order='name', fields={
        'name': 'str!', 'kind': 'enum:Bank|Kas|Penampung', 'bank_name': 'str', 'account_number': 'str', 'account_holder': 'str',
        'entity_id': 'str', 'opening_balance': 'num', 'is_active': 'bool'}),
    'tax-codes': dict(model=TaxCode, label='Kode Pajak', search=['code', 'name', 'tax_type'], order='code', fields={
        'code': 'str!', 'name': 'str!', 'tax_type': 'enum:PPN|PPh 21|PPh 23|PPh 4(2) Final|PPh 25|PPh Badan|Lainnya',
        'rate': 'num', 'base': 'str', 'effective_from': 'date', 'legal_basis': 'str', 'is_active': 'bool'}),
    'periods': dict(model=Period, label='Periode Akuntansi', search=['code', 'name'], order='code', fields={
        'code': 'str!', 'name': 'str!', 'start_date': 'date!', 'end_date': 'date!', 'status': 'enum:Open|Closed'}),
    'cost-types': dict(model=CostType, label='Jenis Cost', search=['name', 'description'], order='name', fields={
        'name': 'str!', 'description': 'str', 'is_active': 'bool'}),
}
UNIQUE = {'employees': 'code', 'accounts': 'code', 'tax-codes': 'code', 'periods': 'code', 'cost-types': 'name'}
DEFAULT_COST_TYPES = ['Freelancer', 'Server / Hosting', 'Lisensi', 'Vendor', 'Perjalanan Dinas', 'Lainnya']


async def seed_cost_types(s):
    if not await s.scalar(select(func.count()).select_from(CostType)):
        s.add_all([CostType(name=n) for n in DEFAULT_COST_TYPES])
        await s.commit()
REFS = {
    'entities': [(Project, 'entity_id')],
    'customers': [(Project, 'customer_id')],
    'vendors': [(ProjectCost, 'vendor_id')],
    'employees': [(Timesheet, 'employee_id')],
    'accounts': [(JournalLine, 'account_id')],
    'bank-accounts': [(CashTransaction, 'bank_account_id')],
}


def spec_for(kind):
    sp = SPECS.get(kind)
    if not sp:
        raise HTTPException(404, 'Master data tidak dikenal')
    return sp


def base_query(sp):
    m = sp['model']
    stmt = select(m)
    if sp.get('kind'):
        stmt = stmt.where(m.kind == sp['kind'])
    return stmt


def apply_defaults(kind, data, obj=None):
    if kind == 'employees':
        vals = {k: data.get(k, getattr(obj, k, 0) if obj else 0) or 0 for k in ('base_salary', 'allowance', 'other_cost')}
        data['monthly_cost'] = vals['base_salary'] + vals['allowance'] + vals['other_cost']
        if not data.get('productive_hours') and not obj:
            data['productive_hours'] = 120
        if not data.get('status') and not obj:
            data['status'] = 'Aktif'
    if 'is_active' in data and data['is_active'] is False and obj is None and kind != 'periods':
        data['is_active'] = True
    return data


async def check_unique(s, kind, sp, data, exclude_id=None):
    field = UNIQUE.get(kind)
    if not field or field not in data:
        return
    m = sp['model']
    stmt = select(m).where(getattr(m, field) == data[field])
    if exclude_id:
        stmt = stmt.where(m.id != exclude_id)
    if await s.scalar(stmt):
        raise HTTPException(409, f'{field.upper()} "{data[field]}" sudah digunakan')


@router.get('/meta')
async def meta(user: dict = Depends(require_access)):
    return {k: {'label': v['label'], 'fields': v['fields']} for k, v in SPECS.items()}


@router.get('/{kind}')
async def list_items(kind: str, q: str = '', page: int = 1, page_size: int = 20, all: bool = False,
                     user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    sp = spec_for(kind)
    m = sp['model']
    stmt = base_query(sp)
    if q:
        stmt = stmt.where(or_(*[getattr(m, c).ilike(f'%{q}%') for c in sp['search']]))
    total = await s.scalar(select(func.count()).select_from(stmt.subquery()))
    stmt = stmt.order_by(getattr(m, sp['order']))
    if not all:
        page, page_size, offset = paginate_args(page, page_size)
        stmt = stmt.offset(offset).limit(page_size)
    items = (await s.scalars(stmt)).all()
    return {'items': [row(i) for i in items], 'total': total, 'page': page, 'page_size': page_size}


@router.post('/{kind}')
async def create_item(kind: str, payload: dict, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    sp = spec_for(kind)
    data = apply_defaults(kind, clean(sp['fields'], payload))
    if 'is_active' in sp['fields'] and payload.get('is_active') is None:
        data['is_active'] = True
    await check_unique(s, kind, sp, data)
    if sp.get('kind'):
        data['kind'] = sp['kind']
    obj = sp['model'](**data)
    s.add(obj)
    await s.flush()
    await audit(s, user, 'create', kind, obj.id, f"Menambah {sp['label']}: {data.get('name') or data.get('code')}", after=row(obj), request=request)
    await s.commit()
    return row(obj)


@router.put('/{kind}/{item_id}')
async def update_item(kind: str, item_id: str, payload: dict, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    sp = spec_for(kind)
    obj = await s.scalar(base_query(sp).where(sp['model'].id == item_id))
    if not obj:
        raise HTTPException(404, 'Data tidak ditemukan')
    before = row(obj)
    data = apply_defaults(kind, clean(sp['fields'], payload, partial=True), obj)
    await check_unique(s, kind, sp, data, item_id)
    for k, v in data.items():
        setattr(obj, k, v)
    await s.flush()
    await audit(s, user, 'update', kind, obj.id, f"Mengubah {sp['label']}: {getattr(obj, 'name', '') or getattr(obj, 'code', '')}", before=before, after=row(obj), request=request)
    await s.commit()
    return row(obj)


@router.delete('/{kind}/{item_id}')
async def delete_item(kind: str, item_id: str, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    sp = spec_for(kind)
    obj = await s.scalar(base_query(sp).where(sp['model'].id == item_id))
    if not obj:
        raise HTTPException(404, 'Data tidak ditemukan')
    for model, col in REFS.get(kind, []):
        if await s.scalar(select(func.count()).select_from(model).where(getattr(model, col) == item_id)):
            raise HTTPException(409, 'Data masih dipakai di project/transaksi. Nonaktifkan saja bila tidak dipakai lagi.')
    before = row(obj)
    await s.delete(obj)
    await audit(s, user, 'delete', kind, item_id, f"Menghapus {sp['label']}: {before.get('name') or before.get('code')}", before=before, request=request)
    await s.commit()
    return {'ok': True}
