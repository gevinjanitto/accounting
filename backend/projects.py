from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, func, or_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from db import get_session
from models import Simulation, Project, ProjectBudget, ProjectCost, Timesheet, OverheadAllocation, Entity, Party, Employee, utcnow
from common import row, clean, audit, paginate_args, D
from calc import project_summary, COMPONENTS, COST_COMPONENTS, f
from security import require_access

router = APIRouter(prefix='/api/projects')

STATUSES = ['Draft', 'Estimation', 'Quotation', 'Approved', 'Running', 'On Hold', 'Completed', 'Cancelled']
PROJECT_FIELDS = {
    'code': 'str', 'name': 'str!', 'customer_id': 'str', 'entity_id': 'str!', 'contract_number': 'str',
    'contract_value': 'num', 'contract_date': 'date', 'start_date': 'date', 'end_date': 'date',
    'status': 'enum:' + '|'.join(STATUSES[:-2] + ['Cancelled']), 'target_margin': 'num', 'tax_classification': 'str',
    'costing_method': 'enum:Hybrid|Percentage Based|Actual Cost Based', 'description': 'str',
}
COST_FIELDS = {'date': 'date!', 'vendor_id': 'str', 'component': 'enum:' + '|'.join(COST_COMPONENTS), 'amount': 'num', 'description': 'str'}
TS_FIELDS = {'employee_id': 'str!', 'date': 'date!', 'hours': 'num', 'description': 'str'}


async def next_code(s):
    year = date.today().year
    prefix = f'PRJ-{year}-'
    codes = (await s.scalars(select(Project.code).where(Project.code.like(f'{prefix}%')))).all()
    n = max([int(c[len(prefix):]) for c in codes if c[len(prefix):].isdigit()] + [0])
    while True:
        n += 1
        code = f'{prefix}{n:03d}'
        if not await s.scalar(select(Project.id).where(Project.code == code)):
            return code


async def load_project(s, pid):
    p = await s.get(Project, pid)
    if not p:
        raise HTTPException(404, 'Project tidak ditemukan')
    return p


async def project_bundle(s, p):
    budgets = (await s.scalars(select(ProjectBudget).where(ProjectBudget.project_id == p.id))).all()
    costs = (await s.scalars(select(ProjectCost).where(ProjectCost.project_id == p.id).order_by(ProjectCost.date.desc()))).all()
    ts = (await s.scalars(select(Timesheet).where(Timesheet.project_id == p.id).order_by(Timesheet.date.desc()))).all()
    allocs = (await s.scalars(select(OverheadAllocation).where(OverheadAllocation.project_id == p.id))).all()
    return budgets, costs, ts, allocs


async def summaries_for(s, projects):
    ids = [p.id for p in projects]
    if not ids:
        return {}
    group = lambda items: {pid: [i for i in items if i.project_id == pid] for pid in ids}
    b = group((await s.scalars(select(ProjectBudget).where(ProjectBudget.project_id.in_(ids)))).all())
    c = group((await s.scalars(select(ProjectCost).where(ProjectCost.project_id.in_(ids)))).all())
    t = group((await s.scalars(select(Timesheet).where(Timesheet.project_id.in_(ids)))).all())
    o = group((await s.scalars(select(OverheadAllocation).where(OverheadAllocation.project_id.in_(ids), OverheadAllocation.is_active.is_(True)))).all())
    return {p.id: project_summary(p, b[p.id], c[p.id], t[p.id], o[p.id]) for p in projects}


async def names(s):
    ents = {e.id: e.name for e in (await s.scalars(select(Entity))).all()}
    parties = {x.id: x.name for x in (await s.scalars(select(Party))).all()}
    emps = {e.id: e.name for e in (await s.scalars(select(Employee))).all()}
    return ents, parties, emps


def ensure_editable(p):
    if p.status == 'Completed':
        raise HTTPException(409, 'Project sudah ditutup (Completed); data tidak dapat diubah')


@router.get('/meta')
async def project_meta(user: dict = Depends(require_access)):
    return {'statuses': STATUSES, 'components': [{'key': k, 'label': v[0], 'category': v[1]} for k, v in COMPONENTS.items()],
            'cost_components': COST_COMPONENTS}


@router.get('')
async def list_projects(q: str = '', status: str = '', page: int = 1, page_size: int = 20,
                        user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    stmt = select(Project)
    if q:
        stmt = stmt.where(or_(Project.name.ilike(f'%{q}%'), Project.code.ilike(f'%{q}%'), Project.contract_number.ilike(f'%{q}%')))
    if status:
        stmt = stmt.where(Project.status == status)
    total = await s.scalar(select(func.count()).select_from(stmt.subquery()))
    page, page_size, offset = paginate_args(page, page_size)
    projects = (await s.scalars(stmt.order_by(Project.created_at.desc()).offset(offset).limit(page_size))).all()
    sums = await summaries_for(s, projects)
    ents, parties, _ = await names(s)
    items = [{**row(p), 'customer_name': parties.get(p.customer_id), 'entity_name': ents.get(p.entity_id), 'summary': sums[p.id]} for p in projects]
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


@router.post('')
async def create_project(payload: dict, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    data = clean(PROJECT_FIELDS, payload)
    if not await s.get(Entity, data['entity_id']):
        raise HTTPException(422, 'Entitas pemilik kontrak wajib dipilih')
    data['code'] = data.get('code') or await next_code(s)
    if await s.scalar(select(Project.id).where(Project.code == data['code'])):
        raise HTTPException(409, f"Kode project {data['code']} sudah dipakai")
    data['status'] = data.get('status') or 'Draft'
    data['costing_method'] = data.get('costing_method') or 'Hybrid'
    if payload.get('target_margin') in (None, ''):
        data['target_margin'] = Decimal('20')
    p = Project(**data)
    s.add(p)
    await s.flush()
    for comp, amt in (payload.get('budgets') or {}).items():
        if comp in COMPONENTS and D(amt) > 0:
            s.add(ProjectBudget(project_id=p.id, component=comp, amount=D(amt)))
    await audit(s, user, 'create', 'projects', p.id, f'Membuat project {p.code} - {p.name}', after=row(p), request=request)
    await s.commit()
    return row(p)


@router.get('/{pid}')
async def get_project(pid: str, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    p = await load_project(s, pid)
    budgets, costs, ts, allocs = await project_bundle(s, p)
    ents, parties, emps = await names(s)
    return {
        **row(p), 'customer_name': parties.get(p.customer_id), 'entity_name': ents.get(p.entity_id),
        'budgets': [row(b) for b in budgets],
        'costs': [{**row(c), 'vendor_name': parties.get(c.vendor_id), 'component_label': COMPONENTS[c.component][0]} for c in costs],
        'timesheets': [{**row(t), 'employee_name': emps.get(t.employee_id)} for t in ts],
        'allocations': [row(a) for a in allocs],
        'summary': project_summary(p, budgets, costs, ts, allocs),
    }


@router.put('/{pid}')
async def update_project(pid: str, payload: dict, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    p = await load_project(s, pid)
    ensure_editable(p)
    before = row(p)
    data = clean(PROJECT_FIELDS, payload, partial=True)
    if 'code' in data:
        if not data['code']:
            data.pop('code')
        elif await s.scalar(select(Project.id).where(Project.code == data['code'], Project.id != pid)):
            raise HTTPException(409, f"Kode project {data['code']} sudah dipakai")
    if 'entity_id' in data and not await s.get(Entity, data['entity_id']):
        raise HTTPException(422, 'Entitas tidak ditemukan')
    for k, v in data.items():
        setattr(p, k, v)
    await s.flush()
    await audit(s, user, 'update', 'projects', p.id, f'Mengubah project {p.code}', before=before, after=row(p), request=request)
    await s.commit()
    return row(p)


@router.delete('/{pid}')
async def delete_project(pid: str, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    p = await load_project(s, pid)
    if p.status not in ('Draft', 'Estimation', 'Quotation', 'Cancelled'):
        raise HTTPException(409, 'Hanya project Draft/Estimation/Quotation/Cancelled yang dapat dihapus')
    before = row(p)
    await s.execute(delete(OverheadAllocation).where(OverheadAllocation.project_id == pid))
    for sim in (await s.scalars(select(Simulation).where(Simulation.project_id == pid))).all():
        sim.project_id = None
        sim.status = 'Draft'
    await s.delete(p)
    await audit(s, user, 'delete', 'projects', pid, f"Menghapus project {before['code']}", before=before, request=request)
    await s.commit()
    return {'ok': True}


@router.put('/{pid}/budgets')
async def save_budgets(pid: str, payload: dict, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    p = await load_project(s, pid)
    ensure_editable(p)
    existing = {b.component: b for b in (await s.scalars(select(ProjectBudget).where(ProjectBudget.project_id == pid))).all()}
    before = {k: f(v.amount) for k, v in existing.items()}
    for comp, amt in payload.items():
        if comp not in COMPONENTS:
            continue
        amt = D(amt)
        if amt < 0:
            raise HTTPException(422, 'Budget tidak boleh negatif')
        if comp in existing:
            existing[comp].amount = amt
        else:
            s.add(ProjectBudget(project_id=pid, component=comp, amount=amt))
    await s.flush()
    after = {b.component: f(b.amount) for b in (await s.scalars(select(ProjectBudget).where(ProjectBudget.project_id == pid))).all()}
    await audit(s, user, 'update', 'project_budgets', pid, f'Mengubah budget project {p.code}', before=before, after=after, request=request)
    await s.commit()
    return after


@router.post('/{pid}/costs')
async def add_cost(pid: str, payload: dict, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    p = await load_project(s, pid)
    ensure_editable(p)
    data = clean(COST_FIELDS, payload)
    if not data.get('component'):
        raise HTTPException(422, 'Kategori biaya wajib dipilih')
    if data['amount'] <= 0:
        raise HTTPException(422, 'Nominal biaya harus lebih dari 0')
    c = ProjectCost(project_id=pid, **data)
    s.add(c)
    await s.flush()
    await audit(s, user, 'create', 'project_costs', c.id, f"Biaya {COMPONENTS[c.component][0]} {f(c.amount):,.0f} untuk {p.code}", after=row(c), request=request)
    await s.commit()
    return row(c)


@router.delete('/{pid}/costs/{cid}')
async def delete_cost(pid: str, cid: str, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    p = await load_project(s, pid)
    ensure_editable(p)
    c = await s.get(ProjectCost, cid)
    if not c or c.project_id != pid:
        raise HTTPException(404, 'Biaya tidak ditemukan')
    if c.expense_id:
        raise HTTPException(409, 'Biaya ini berasal dari modul Pengeluaran; batalkan transaksinya di menu Pengeluaran')
    before = row(c)
    await s.delete(c)
    await audit(s, user, 'delete', 'project_costs', cid, f'Menghapus biaya project {p.code}', before=before, request=request)
    await s.commit()
    return {'ok': True}


@router.post('/{pid}/timesheets')
async def add_timesheet(pid: str, payload: dict, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    p = await load_project(s, pid)
    ensure_editable(p)
    data = clean(TS_FIELDS, payload)
    emp = await s.get(Employee, data['employee_id'])
    if not emp:
        raise HTTPException(422, 'Karyawan tidak ditemukan')
    if data['hours'] <= 0:
        raise HTTPException(422, 'Jam kerja harus lebih dari 0')
    if not emp.productive_hours or Decimal(emp.productive_hours) <= 0:
        raise HTTPException(422, 'Jam produktif karyawan belum diisi')
    rate = Decimal(emp.monthly_cost) / Decimal(emp.productive_hours)
    t = Timesheet(project_id=pid, rate=rate.quantize(Decimal('0.01')), total=(rate * data['hours']).quantize(Decimal('0.01')), **data)
    s.add(t)
    await s.flush()
    await audit(s, user, 'create', 'timesheets', t.id, f"Timesheet {emp.name} {float(data['hours'])} jam untuk {p.code}", after=row(t), request=request)
    await s.commit()
    return row(t)


@router.delete('/{pid}/timesheets/{tid}')
async def delete_timesheet(pid: str, tid: str, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    p = await load_project(s, pid)
    ensure_editable(p)
    t = await s.get(Timesheet, tid)
    if not t or t.project_id != pid:
        raise HTTPException(404, 'Timesheet tidak ditemukan')
    before = row(t)
    await s.delete(t)
    await audit(s, user, 'delete', 'timesheets', tid, f'Menghapus timesheet project {p.code}', before=before, request=request)
    await s.commit()
    return {'ok': True}


class CloseIn(BaseModel):
    notes: str | None = None
    bonus_reconciliation: str | None = None


@router.post('/{pid}/close')
async def close_project(pid: str, body: CloseIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    p = await load_project(s, pid)
    ensure_editable(p)
    if p.status in ('Draft', 'Cancelled'):
        raise HTTPException(409, 'Project Draft/Cancelled tidak dapat ditutup')
    before = row(p)
    p.status = 'Completed'
    p.closed_at = utcnow()
    budgets, costs, ts, allocs = await project_bundle(s, p)
    summary = project_summary(p, budgets, costs, ts, allocs)
    p.closing = {'summary': summary, 'notes': body.notes, 'bonus_reconciliation': body.bonus_reconciliation,
                 'closed_by': user['email'], 'closed_at': p.closed_at.isoformat() + 'Z'}
    await audit(s, user, 'close', 'projects', p.id, f'Closing project {p.code}', before=before, after=row(p), request=request)
    await s.commit()
    return row(p)
