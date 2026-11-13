from collections import defaultdict
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from db import get_session
from models import Project, ProjectCost, Timesheet, AuditLog, Party, Entity
from common import row, paginate_args
from calc import pct, f
from security import require_access
from projects import summaries_for
from company import financial_summary
from tax import tax_dashboard

router = APIRouter(prefix='/api')
ACTIVE = ('Approved', 'Running', 'On Hold')


@router.get('/dashboard')
async def dashboard(user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    projects = (await s.scalars(select(Project).where(Project.status != 'Cancelled'))).all()
    sums = await summaries_for(s, projects)
    counted = [p for p in projects if p.status in ACTIVE + ('Completed',)]
    completed = [p for p in projects if p.status == 'Completed']
    total_contract = sum((Decimal(str(sums[p.id]['revenue'])) for p in counted), Decimal('0'))
    total_hpp = sum((Decimal(str(sums[p.id]['hpp'])) for p in counted), Decimal('0'))
    est_profit = sum((Decimal(str(sums[p.id]['estimate']['distributable'])) for p in counted), Decimal('0'))
    cur_profit = sum((Decimal(str(sums[p.id]['distributable'])) for p in counted), Decimal('0'))
    realized = sum((Decimal(str(sums[p.id]['distributable'])) for p in completed), Decimal('0'))
    realized_rev = sum((Decimal(str(sums[p.id]['revenue'])) for p in completed), Decimal('0'))

    cost = defaultdict(Decimal)
    for p in counted:
        a = sums[p.id]['actual_by_component']
        cost['gaji'] += Decimal(str(a['gaji']))
        cost['operasional'] += Decimal(str(a['operasional']))
        cost['server'] += Decimal(str(a['server']))
        cost['freelancer'] += Decimal(str(a['freelancer']))
        cost['bonus'] += Decimal(str(a['bonus']))
        cost['lainnya'] += sum(Decimal(str(a[k])) for k in ('lisensi', 'vendor', 'perjalanan', 'lainnya'))

    alerts = []
    for p in projects:
        sm = sums[p.id]
        if p.status in ('Draft', 'Cancelled'):
            continue
        for r in sm['budget_vs_actual']:
            if r['over_budget']:
                alerts.append({'type': 'over_budget', 'project_id': p.id, 'project': f'{p.code} - {p.name}', 'message': f"{r['label']} melebihi budget", 'amount': abs(r['variance'])})
        if sm['low_margin']:
            alerts.append({'type': 'low_margin', 'project_id': p.id, 'project': f'{p.code} - {p.name}', 'message': f"Margin {sm['margin']:.2f}% di bawah target {sm['target_margin']:.2f}%", 'amount': sm['margin']})

    status_counts = defaultdict(int)
    for p in (await s.scalars(select(Project))).all():
        status_counts[p.status] += 1

    monthly = defaultdict(Decimal)
    for c in (await s.scalars(select(ProjectCost))).all():
        monthly[c.date.strftime('%Y-%m')] += Decimal(c.amount)
    for t in (await s.scalars(select(Timesheet))).all():
        monthly[t.date.strftime('%Y-%m')] += Decimal(t.total)
    months = []
    y, m = date.today().year, date.today().month
    for _ in range(6):
        months.insert(0, f'{y:04d}-{m:02d}')
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)

    parties = {x.id: x.name for x in (await s.scalars(select(Party))).all()}
    top = sorted(counted, key=lambda p: sums[p.id]['revenue'], reverse=True)[:6]
    return {
        'finance': await financial_summary(s),
        'tax': await tax_dashboard(s),
        'project_summary': {
            'active': len([p for p in projects if p.status in ACTIVE]), 'completed': len(completed),
            'pipeline': len([p for p in projects if p.status in ('Draft', 'Estimation', 'Quotation')]),
            'total_contract': f(total_contract), 'total_hpp': f(total_hpp), 'estimated_profit': f(est_profit),
            'current_profit': f(cur_profit), 'realized_profit': f(realized),
            'margin': pct(cur_profit, total_contract), 'realized_margin': pct(realized, realized_rev),
        },
        'cost_summary': {k: f(v) for k, v in cost.items()},
        'alerts': alerts,
        'status_counts': dict(status_counts),
        'monthly_costs': [{'month': m, 'amount': f(monthly[m])} for m in months],
        'top_projects': [{'id': p.id, 'code': p.code, 'name': p.name, 'status': p.status, 'customer': parties.get(p.customer_id),
                          'revenue': sums[p.id]['revenue'], 'hpp': sums[p.id]['hpp'], 'margin': sums[p.id]['margin'],
                          'target_margin': sums[p.id]['target_margin']} for p in top],
    }


@router.get('/reports/projects')
async def project_report(status: str = '', user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    stmt = select(Project).order_by(Project.code)
    if status:
        stmt = stmt.where(Project.status == status)
    projects = (await s.scalars(stmt)).all()
    sums = await summaries_for(s, projects)
    parties = {x.id: x.name for x in (await s.scalars(select(Party))).all()}
    ents = {e.id: e.name for e in (await s.scalars(select(Entity))).all()}
    rows = [{'id': p.id, 'code': p.code, 'name': p.name, 'status': p.status, 'customer': parties.get(p.customer_id),
             'entity': ents.get(p.entity_id), **{k: sums[p.id][k] for k in (
                 'contract_value', 'revenue', 'direct_cost', 'labor_cost', 'overhead', 'hpp', 'gross_profit', 'operating_profit',
                 'planned_bonus', 'actual_bonus', 'internal_reserve', 'distributable', 'margin', 'target_margin', 'sources')}}
            for p in projects]
    keys = ('contract_value', 'revenue', 'direct_cost', 'labor_cost', 'overhead', 'hpp', 'gross_profit', 'operating_profit', 'planned_bonus', 'actual_bonus', 'internal_reserve', 'distributable')
    totals = {k: round(sum(r[k] for r in rows), 2) for k in keys}
    totals['margin'] = pct(Decimal(str(totals['distributable'])), Decimal(str(totals['revenue'])))
    return {'rows': rows, 'totals': totals}


@router.get('/audit')
async def audit_logs(q: str = '', module: str = '', page: int = 1, page_size: int = 25,
                     user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    stmt = select(AuditLog)
    if module:
        stmt = stmt.where(AuditLog.module == module)
    if q:
        stmt = stmt.where(or_(AuditLog.summary.ilike(f'%{q}%'), AuditLog.user_email.ilike(f'%{q}%')))
    total = await s.scalar(select(func.count()).select_from(stmt.subquery()))
    page, page_size, offset = paginate_args(page, page_size)
    items = (await s.scalars(stmt.order_by(AuditLog.created_at.desc()).offset(offset).limit(page_size))).all()
    modules = (await s.scalars(select(AuditLog.module).distinct())).all()
    return {'items': [row(i) for i in items], 'total': total, 'page': page, 'page_size': page_size, 'modules': sorted(modules)}
