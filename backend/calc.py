from decimal import Decimal, ROUND_HALF_UP
from fastapi import HTTPException

COMPONENTS = {
    'gaji': ('Gaji Karyawan', 'Labor Cost'),
    'operasional': ('Operasional / Overhead', 'Overhead Cost'),
    'freelancer': ('Freelancer', 'Direct Cost'),
    'server': ('Server / Hosting', 'Direct Cost'),
    'lisensi': ('Lisensi', 'Direct Cost'),
    'vendor': ('Vendor', 'Direct Cost'),
    'perjalanan': ('Perjalanan Dinas', 'Direct Cost'),
    'lainnya': ('Biaya Langsung Lainnya', 'Direct Cost'),
    'bonus': ('Bonus Tim', 'Internal Allocation'),
    'cadangan': ('Cadangan Internal', 'Internal Allocation'),
}
DIRECT = [k for k, v in COMPONENTS.items() if v[1] == 'Direct Cost']
COST_COMPONENTS = DIRECT + ['bonus']
CENT = Decimal('0.01')


def q(v: Decimal) -> Decimal:
    return Decimal(v).quantize(CENT, rounding=ROUND_HALF_UP)


def f(v) -> float:
    return float(q(Decimal(v)))


def pct(num, den) -> float:
    den = Decimal(den)
    return float((Decimal(num) / den * 100).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)) if den else 0.0


def project_summary(project, budgets, costs, timesheets, allocations):
    """Hybrid costing: actual figures replace budget estimates once realisation exists."""
    b = {k: Decimal('0') for k in COMPONENTS}
    for x in budgets:
        b[x.component] = b.get(x.component, Decimal('0')) + Decimal(x.amount)
    a = {k: Decimal('0') for k in COMPONENTS}
    for c in costs:
        a[c.component] = a.get(c.component, Decimal('0')) + Decimal(c.amount)
    a['gaji'] = sum((Decimal(t.total) for t in timesheets), Decimal('0'))
    a['operasional'] = sum((Decimal(o.amount) for o in allocations if o.is_active), Decimal('0'))
    hours = sum((Decimal(t.hours) for t in timesheets), Decimal('0'))

    closed = project.status == 'Completed'
    revenue = Decimal(project.contract_value or 0)

    def used(actual, budget):
        if closed or actual >= budget:
            return actual, 'aktual'
        return budget, 'estimasi'

    direct_actual = sum((a[k] for k in DIRECT), Decimal('0'))
    direct_budget = sum((b[k] for k in DIRECT), Decimal('0'))
    direct, direct_src = used(direct_actual, direct_budget)
    labor, labor_src = used(a['gaji'], b['gaji'])
    overhead, overhead_src = used(a['operasional'], b['operasional'])
    bonus, bonus_src = used(a['bonus'], b['bonus'])
    reserve = b['cadangan']

    hpp = direct + labor + overhead
    gross = revenue - direct
    operating = revenue - hpp
    distributable = operating - bonus - reserve

    hpp_est = direct_budget + b['gaji'] + b['operasional']
    dist_est = revenue - hpp_est - b['bonus'] - b['cadangan']

    rows = []
    for k, (label, cat) in COMPONENTS.items():
        budget, actual = b[k], a[k]
        if k == 'cadangan':
            actual = Decimal('0')
        if budget == 0 and actual == 0:
            continue
        over = actual > budget
        rows.append({'component': k, 'label': label, 'category': cat, 'budget': f(budget), 'actual': f(actual),
                     'variance': f(budget - actual), 'over_budget': bool(over), 'usage_pct': pct(actual, budget) if budget else (100.0 if actual else 0.0)})

    target = Decimal(project.target_margin or 0)
    margin = pct(distributable, revenue)
    alerts = [f"{r['label']} melebihi budget sebesar {abs(r['variance']):,.0f}".replace(',', '.') for r in rows if r['over_budget']]
    low_margin = revenue > 0 and Decimal(str(margin)) < target
    if low_margin:
        alerts.append(f'Margin {margin:.2f}% di bawah target {float(target):.2f}%')

    return {
        'revenue': f(revenue), 'contract_value': f(revenue),
        'direct_cost': f(direct), 'labor_cost': f(labor), 'overhead': f(overhead),
        'hpp': f(hpp), 'gross_profit': f(gross), 'operating_profit': f(operating),
        'planned_bonus': f(b['bonus']), 'actual_bonus': f(a['bonus']), 'bonus_used': f(bonus),
        'internal_reserve': f(reserve), 'distributable': f(distributable),
        'margin': margin, 'operating_margin': pct(operating, revenue), 'gross_margin': pct(gross, revenue),
        'target_margin': float(target),
        'sources': {'direct': direct_src, 'labor': labor_src, 'overhead': overhead_src, 'bonus': bonus_src},
        'estimate': {'hpp': f(hpp_est), 'distributable': f(dist_est), 'margin': pct(dist_est, revenue),
                     'direct_cost': f(direct_budget), 'labor_cost': f(b['gaji']), 'overhead': f(b['operasional'])},
        'actual': {'direct_cost': f(direct_actual), 'labor_cost': f(a['gaji']), 'overhead': f(a['operasional']),
                   'bonus': f(a['bonus']), 'hours': float(hours),
                   'hpp': f(direct_actual + a['gaji'] + a['operasional']),
                   'distributable': f(revenue - direct_actual - a['gaji'] - a['operasional'] - a['bonus'] - reserve)},
        'actual_by_component': {k: f(v) for k, v in a.items()},
        'budget_total': f(sum(b.values(), Decimal('0'))),
        'budget_vs_actual': rows,
        'over_budget': any(r['over_budget'] for r in rows),
        'low_margin': bool(low_margin),
        'alerts': alerts,
    }


# ---------- Pricing & Negotiation Simulator ----------
def status_for(margin: Decimal, target: Decimal, minimum: Decimal, surplus: Decimal):
    if surplus < 0:
        return 'Loss'
    if margin >= target:
        return 'Profitable'
    if margin >= minimum:
        return 'Minimum Price'
    return 'Below Target'


RECOMMENDED_UPLIFT = Decimal('1.10')
SCENARIOS = [0, 5, 10, 15, 20, 30, 40, 50]


def _num(v, d=0) -> Decimal:
    try:
        return Decimal(str(v)) if v not in (None, '', '-') else Decimal(str(d))
    except Exception:
        raise HTTPException(422, f'Nilai angka tidak valid: {v}')


def simulate(inp: dict) -> dict:
    """Harga dasar + cost + pajak = harga minimum; rekomendasi = minimum +10%; harga saat ini = minimum + kenaikan negosiasi."""
    hpp = _num(inp.get('hpp'))
    rows, cost = [], Decimal('0')
    for c in inp.get('costs') or []:
        val = _num(c.get('value'))
        amt = hpp * val / 100 if c.get('mode') == 'pct' else val
        cost += amt
        rows.append({**c, 'amount': f(amt)})
    base = hpp + cost
    ppn_r = _num(inp.get('ppn_pct'), 11) / 100
    pph_r = _num(inp.get('pph_pct'), 2) / 100
    ppn, pph = base * ppn_r, base * pph_r
    minimum = base + ppn + pph
    recommended = minimum * RECOMMENDED_UPLIFT

    def status(price):
        if q(price) < q(minimum):
            return 'Loss'
        return 'Profitable' if q(price) >= q(recommended) else 'Minimum Price'

    def scenario(up):
        price = minimum * (1 + Decimal(str(up)) / 100)
        dpp = price / (1 + ppn_r + pph_r)
        surplus = price - minimum
        margin = (surplus / price * 100) if price > 0 else Decimal('0')
        return {'markup_pct': float(up), 'price': f(price), 'dpp': f(dpp), 'ppn': f(dpp * ppn_r), 'pph': f(dpp * pph_r),
                'surplus': f(surplus), 'margin': f(margin), 'invoice_total': f(price), 'status': status(price)}

    up = max(_num(inp.get('markup_pct')), Decimal('0'))
    ups = sorted({Decimal(str(x)) for x in SCENARIOS} | {up})
    final = scenario(up)
    return {
        'hpp': f(hpp), 'cost_rows': rows, 'cost_total': f(cost), 'base_cost': f(base), 'fixed_cost': f(base),
        'ppn': f(ppn), 'pph': f(pph), 'tax_total': f(ppn + pph),
        'min_acceptable_price': f(minimum), 'recommended_price': f(recommended), 'current_price': final['price'],
        'labor_cost': 0.0, 'overhead': 0.0, 'bonus': 0.0, 'reserve': 0.0,
        'final': final, 'scenarios': [scenario(x) for x in ups],
    }
