// Mirror of backend calc.simulate for instant recalculation; the server recomputes on save.
const N = (v, d = 0) => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? d : Number(v));
const r2 = (v) => Math.round(v * 100) / 100;
export const RECOMMENDED_UPLIFT = 1.1;
const SCENARIOS = [0, 5, 10, 15, 20, 30, 40, 50];

export const costAmount = (c, hpp) => (c.mode === "pct" ? (hpp * N(c.value)) / 100 : N(c.value));

export function simulate(inp) {
  const hpp = N(inp.hpp);
  const cost_rows = (inp.costs || []).map((c) => ({ ...c, amount: r2(costAmount(c, hpp)) }));
  const cost = (inp.costs || []).reduce((s, c) => s + costAmount(c, hpp), 0);
  const base = hpp + cost;
  const ppnR = N(inp.ppn_pct, 11) / 100;
  const pphR = N(inp.pph_pct, 2) / 100;
  const ppn = base * ppnR, pph = base * pphR;
  const min = base + ppn + pph;
  const rec = min * RECOMMENDED_UPLIFT;
  const status = (p) => (r2(p) < r2(min) ? "Loss" : r2(p) >= r2(rec) ? "Profitable" : "Minimum Price");
  const scenario = (u) => {
    const price = min * (1 + N(u) / 100);
    const dpp = price / (1 + ppnR + pphR);
    const surplus = price - min;
    return {
      markup_pct: N(u), price: r2(price), dpp: r2(dpp), ppn: r2(dpp * ppnR), pph: r2(dpp * pphR),
      surplus: r2(surplus), margin: r2(price > 0 ? (surplus / price) * 100 : 0), invoice_total: r2(price), status: status(price),
    };
  };
  const up = Math.max(N(inp.markup_pct), 0);
  const ups = [...new Set([...SCENARIOS, up])].sort((a, b) => a - b);
  const final = scenario(up);
  return {
    hpp: r2(hpp), cost_rows, cost_total: r2(cost), base_cost: r2(base), fixed_cost: r2(base),
    ppn: r2(ppn), pph: r2(pph), tax_total: r2(ppn + pph),
    min_acceptable_price: r2(min), recommended_price: r2(rec), current_price: final.price,
    final, scenarios: ups.map(scenario),
  };
}

export const newCost = () => ({ label: "", cost_type_id: "", type_name: "", mode: "pct", value: 10 });

export const emptySimulation = () => ({
  name: "", customer_id: "", entity_id: "", duration_months: 3, hpp: 100000000,
  costs: [], ppn_pct: 11, pph_pct: 2, markup_pct: 0,
});
