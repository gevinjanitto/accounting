import calendar
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from db import get_session
from models import OverheadPool, OverheadAllocation, Project, Timesheet, new_id
from common import row, audit, D
from calc import q, f
from security import require_access

router = APIRouter(prefix='/api/overhead')

DEFAULT_COMPONENTS = ['Internet', 'Listrik', 'Server umum', 'Administrasi', 'Sewa', 'Lain-lain']
METHODS = {'revenue': 'Persentase revenue', 'hours': 'Jam kerja', 'duration': 'Durasi project', 'capacity': 'Kapasitas / penggunaan', 'manual': 'Manual (%)'}


class PoolIn(BaseModel):
    period: str
    components: dict
    note: str | None = None


class AllocateIn(BaseModel):
    method: str
    project_ids: list[str]
    weights: dict | None = None


def month_range(period):
    try:
        y, m = int(period[:4]), int(period[5:7])
        return date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])
    except (ValueError, IndexError):
        raise HTTPException(422, 'Format periode harus YYYY-MM')


@router.get('/meta')
async def meta(user: dict = Depends(require_access)):
    return {'components': DEFAULT_COMPONENTS, 'methods': [{'value': k, 'label': v} for k, v in METHODS.items()]}


@router.get('/pools')
async def list_pools(user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    pools = (await s.scalars(select(OverheadPool).order_by(OverheadPool.period.desc()))).all()
    out = []
    for p in pools:
        allocated = await s.scalar(select(func.coalesce(func.sum(OverheadAllocation.amount), 0)).where(OverheadAllocation.pool_id == p.id, OverheadAllocation.is_active.is_(True)))
        out.append({**row(p), 'allocated': f(allocated), 'unallocated': f(Decimal(p.total) - Decimal(allocated))})
    return out


@router.post('/pools')
async def save_pool(body: PoolIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    month_range(body.period)
    comps = {k: float(q(D(v))) for k, v in body.components.items() if str(k).strip()}
    if any(v < 0 for v in comps.values()):
        raise HTTPException(422, 'Nominal overhead tidak boleh negatif')
    total = sum((D(v) for v in comps.values()), Decimal('0'))
    pool = await s.scalar(select(OverheadPool).where(OverheadPool.period == body.period))
    before = row(pool) if pool else None
    if pool:
        active = await s.scalar(select(func.count()).select_from(OverheadAllocation).where(OverheadAllocation.pool_id == pool.id, OverheadAllocation.is_active.is_(True)))
        if active and q(total) != q(Decimal(pool.total)):
            raise HTTPException(409, 'Cost pool sudah dialokasikan. Jalankan ulang alokasi setelah mengubah total, atau batalkan alokasi dahulu.')
        pool.components, pool.total, pool.note = comps, total, body.note
    else:
        pool = OverheadPool(period=body.period, components=comps, total=total, note=body.note)
        s.add(pool)
    await s.flush()
    await audit(s, user, 'update' if before else 'create', 'overhead_pools', pool.id, f'Cost pool overhead {body.period}: {float(total):,.0f}', before=before, after=row(pool), request=request)
    await s.commit()
    return row(pool)


@router.get('/pools/{pool_id}/allocations')
async def pool_allocations(pool_id: str, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    allocs = (await s.scalars(select(OverheadAllocation).where(OverheadAllocation.pool_id == pool_id).order_by(OverheadAllocation.created_at.desc()))).all()
    projects = {p.id: f'{p.code} - {p.name}' for p in (await s.scalars(select(Project))).all()}
    return [{**row(a), 'project_name': projects.get(a.project_id), 'method_label': METHODS.get(a.method, a.method)} for a in allocs]


async def weights_for(s, method, projects, period, weights):
    start, end = month_range(period)
    out = {}
    for p in projects:
        if method == 'revenue':
            out[p.id] = Decimal(p.contract_value or 0)
        elif method == 'hours':
            out[p.id] = Decimal(await s.scalar(select(func.coalesce(func.sum(Timesheet.hours), 0)).where(
                Timesheet.project_id == p.id, Timesheet.date >= start, Timesheet.date <= end)))
        elif method == 'duration':
            ps, pe = p.start_date or start, p.end_date or end
            overlap = (min(pe, end) - max(ps, start)).days + 1
            out[p.id] = Decimal(max(overlap, 0))
        else:
            out[p.id] = D((weights or {}).get(p.id))
    if method == 'manual':
        total = sum(out.values(), Decimal('0'))
        if q(total) != Decimal('100.00'):
            raise HTTPException(422, f'Total persentase manual harus 100% (saat ini {float(total):.2f}%)')
    return out


@router.post('/pools/{pool_id}/allocate')
async def allocate(pool_id: str, body: AllocateIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    pool = await s.get(OverheadPool, pool_id)
    if not pool:
        raise HTTPException(404, 'Cost pool tidak ditemukan')
    if body.method not in METHODS:
        raise HTTPException(422, 'Metode alokasi tidak dikenal')
    if not body.project_ids:
        raise HTTPException(422, 'Pilih minimal satu project')
    projects = (await s.scalars(select(Project).where(Project.id.in_(body.project_ids)))).all()
    if len(projects) != len(set(body.project_ids)):
        raise HTTPException(404, 'Sebagian project tidak ditemukan')
    if any(p.status == 'Completed' for p in projects):
        raise HTTPException(409, 'Project yang sudah ditutup tidak dapat menerima alokasi baru')
    w = await weights_for(s, body.method, projects, pool.period, body.weights)
    total_w = sum(w.values(), Decimal('0'))
    if total_w <= 0:
        raise HTTPException(422, 'Dasar alokasi bernilai 0 untuk semua project (mis. belum ada jam kerja di periode ini)')
    previous = (await s.scalars(select(OverheadAllocation).where(OverheadAllocation.pool_id == pool_id, OverheadAllocation.is_active.is_(True)))).all()
    for a in previous:
        a.is_active = False
    run_id = new_id()
    total = Decimal(pool.total)
    remaining = total
    result = []
    for i, p in enumerate(projects):
        share = w[p.id] / total_w
        amount = remaining if i == len(projects) - 1 else q(total * share)
        remaining -= amount
        a = OverheadAllocation(pool_id=pool_id, project_id=p.id, run_id=run_id, method=body.method, basis_value=w[p.id],
                               share_pct=(share * 100).quantize(Decimal('0.0001')), amount=amount, created_by=user['email'])
        s.add(a)
        result.append({'project': p.code, 'amount': float(amount), 'share_pct': float(share * 100)})
    await audit(s, user, 'allocate', 'overhead_allocations', pool_id,
                f'Alokasi overhead {pool.period} ({METHODS[body.method]}) ke {len(projects)} project; {len(previous)} baris lama dinonaktifkan',
                before={'previous_run': previous[0].run_id if previous else None}, after={'run_id': run_id, 'result': result}, request=request)
    await s.commit()
    return {'run_id': run_id, 'allocations': result}


@router.post('/pools/{pool_id}/cancel')
async def cancel_allocation(pool_id: str, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    active = (await s.scalars(select(OverheadAllocation).where(OverheadAllocation.pool_id == pool_id, OverheadAllocation.is_active.is_(True)))).all()
    closed = {p.id for p in (await s.scalars(select(Project).where(Project.status == 'Completed'))).all()}
    if any(a.project_id in closed for a in active):
        raise HTTPException(409, 'Alokasi melibatkan project yang sudah ditutup')
    for a in active:
        a.is_active = False
    await audit(s, user, 'cancel', 'overhead_allocations', pool_id, f'Membatalkan {len(active)} alokasi overhead aktif', request=request)
    await s.commit()
    return {'cancelled': len(active)}
