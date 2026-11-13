from datetime import date, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from db import get_session
from models import Simulation, SimulationVersion, Project, ProjectBudget, Entity, Party
from common import row, audit, paginate_args, D
from calc import simulate
from security import require_access
from projects import next_code

router = APIRouter(prefix='/api/simulations')


class SaveIn(BaseModel):
    name: str
    customer_id: str | None = None
    entity_id: str | None = None
    label: str | None = None
    inputs: dict


class ConvertIn(BaseModel):
    version_id: str
    code: str | None = None
    start_date: str | None = None
    contract_number: str | None = None
    status: str = 'Approved'


@router.post('/calculate')
async def calculate(inputs: dict, user: dict = Depends(require_access)):
    return simulate(inputs)


@router.get('')
async def list_sims(page: int = 1, page_size: int = 20, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    total = await s.scalar(select(func.count()).select_from(Simulation))
    page, page_size, offset = paginate_args(page, page_size)
    sims = (await s.scalars(select(Simulation).order_by(Simulation.updated_at.desc()).offset(offset).limit(page_size))).all()
    parties = {x.id: x.name for x in (await s.scalars(select(Party))).all()}
    items = []
    for sim in sims:
        v = await s.scalar(select(SimulationVersion).where(SimulationVersion.simulation_id == sim.id).order_by(SimulationVersion.version_no.desc()))
        items.append({**row(sim), 'customer_name': parties.get(sim.customer_id), 'latest': row(v) if v else None})
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


@router.get('/{sid}')
async def get_sim(sid: str, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    sim = await s.get(Simulation, sid)
    if not sim:
        raise HTTPException(404, 'Simulasi tidak ditemukan')
    versions = (await s.scalars(select(SimulationVersion).where(SimulationVersion.simulation_id == sid).order_by(SimulationVersion.version_no.desc()))).all()
    return {**row(sim), 'versions': [row(v) for v in versions]}


async def _add_version(s, sim, body, user):
    outputs = simulate(body.inputs)
    sim.latest_version += 1
    v = SimulationVersion(simulation_id=sim.id, version_no=sim.latest_version, label=body.label or f'Versi {sim.latest_version}',
                          inputs=body.inputs, outputs=outputs, created_by=user['email'])
    s.add(v)
    await s.flush()
    return v


@router.post('')
async def create_sim(body: SaveIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    if not body.name.strip():
        raise HTTPException(422, 'Nama project simulasi wajib diisi')
    sim = Simulation(name=body.name.strip(), customer_id=body.customer_id or None, entity_id=body.entity_id or None)
    s.add(sim)
    await s.flush()
    v = await _add_version(s, sim, body, user)
    await audit(s, user, 'create', 'simulations', sim.id, f'Membuat simulasi {sim.name} ({v.label})', after={'version': v.version_no}, request=request)
    await s.commit()
    return {**row(sim), 'version': row(v)}


@router.post('/{sid}/versions')
async def add_version(sid: str, body: SaveIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    sim = await s.get(Simulation, sid)
    if not sim:
        raise HTTPException(404, 'Simulasi tidak ditemukan')
    sim.name = body.name.strip() or sim.name
    sim.customer_id = body.customer_id or None
    sim.entity_id = body.entity_id or None
    v = await _add_version(s, sim, body, user)
    await audit(s, user, 'create', 'simulation_versions', v.id, f'Menyimpan {v.label} simulasi {sim.name}', after={'version': v.version_no}, request=request)
    await s.commit()
    return {**row(sim), 'version': row(v)}


@router.delete('/{sid}')
async def delete_sim(sid: str, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    sim = await s.get(Simulation, sid)
    if not sim:
        raise HTTPException(404, 'Simulasi tidak ditemukan')
    if sim.project_id:
        raise HTTPException(409, 'Simulasi sudah dikonversi menjadi project dan tidak dapat dihapus')
    before = row(sim)
    await s.delete(sim)
    await audit(s, user, 'delete', 'simulations', sid, f'Menghapus simulasi {sim.name}', before=before, request=request)
    await s.commit()
    return {'ok': True}


@router.post('/{sid}/convert')
async def convert(sid: str, body: ConvertIn, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    sim = await s.get(Simulation, sid)
    if not sim:
        raise HTTPException(404, 'Simulasi tidak ditemukan')
    if sim.project_id:
        raise HTTPException(409, 'Simulasi ini sudah dikonversi menjadi project')
    v = await s.get(SimulationVersion, body.version_id)
    if not v or v.simulation_id != sid:
        raise HTTPException(404, 'Versi simulasi tidak ditemukan')
    entity_id = sim.entity_id or await s.scalar(select(Entity.id).where(Entity.is_active.is_(True)).order_by(Entity.created_at))
    if not entity_id:
        raise HTTPException(422, 'Buat Entitas terlebih dahulu di Master Data')
    inp, out = v.inputs, v.outputs
    code = body.code or await next_code(s)
    if await s.scalar(select(Project.id).where(Project.code == code)):
        raise HTTPException(409, f'Kode project {code} sudah dipakai')
    start = date.fromisoformat(body.start_date) if body.start_date else date.today()
    months = int(D(inp.get('duration_months') or 1))
    p = Project(code=code, name=sim.name, customer_id=sim.customer_id, entity_id=entity_id, contract_number=body.contract_number,
                contract_value=D(out['final'].get('dpp', out['final']['price'])), contract_date=date.today(), start_date=start,
                end_date=start + timedelta(days=30 * max(months, 1)), status=body.status if body.status in ('Approved', 'Running', 'Quotation') else 'Approved',
                target_margin=D(inp.get('target_margin_pct') or 20), costing_method='Hybrid',
                description=f'Dikonversi dari simulasi "{sim.name}" {v.label}.',
                simulation_id=sim.id, simulation_version_id=v.id)
    s.add(p)
    await s.flush()
    budgets = {'gaji': D(out['labor_cost']), 'operasional': D(out['overhead']), 'bonus': D(out['bonus']), 'cadangan': D(out['reserve'])}
    if 'base_cost' in out:
        budgets['lainnya'] = D(out['base_cost'])
    for d in inp.get('direct_costs') or []:
        comp = d.get('component') if d.get('component') in ('freelancer', 'server', 'lisensi', 'vendor', 'perjalanan', 'lainnya') else 'lainnya'
        budgets[comp] = budgets.get(comp, Decimal('0')) + D(d.get('amount'))
    for comp, amt in budgets.items():
        if amt > 0:
            s.add(ProjectBudget(project_id=p.id, component=comp, amount=amt))
    sim.project_id = p.id
    sim.status = 'Converted'
    await audit(s, user, 'convert', 'simulations', sim.id, f'Konversi simulasi {sim.name} {v.label} menjadi project {code}', after=row(p), request=request)
    await s.commit()
    return row(p)
