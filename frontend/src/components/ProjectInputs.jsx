import { NumberInput } from "@/components/NumberInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { rp } from "@/lib/format";

export const BUDGET_KEYS = [["gaji", "Gaji karyawan"], ["operasional", "Operasional"], ["bonus", "Bonus tim"], ["freelancer", "Freelancer"], ["server", "Server / hosting"], ["lisensi", "Lisensi"], ["vendor", "Vendor"], ["perjalanan", "Perjalanan dinas"], ["lainnya", "Biaya lainnya"], ["cadangan", "Dana cadangan"]];
export const PAYER = [{ v: "client", l: "Client" }, { v: "kita", l: "Kita (perusahaan)" }];
export const payerLabel = (v) => (v === "kita" ? "Kita" : "Client");

export const taxAmount = (contract, mode, value) => (mode === "nominal" ? Number(value || 0) : (Number(contract || 0) * Number(value || 0)) / 100);

export function projectTax(p) {
  const contract = Number(p.contract_value || 0);
  const ppn = taxAmount(contract, p.ppn_mode, p.ppn_value), pph = taxAmount(contract, p.pph_mode, p.pph_value);
  const ppnKita = p.ppn_paid_by === "kita" ? ppn : 0, pphKita = p.pph_paid_by === "kita" ? pph : 0;
  return { contract, ppn, pph, borne: ppnKita + pphKita, tagihan: contract + ppn - ppnKita, net: contract - ppnKita - pphKita };
}

export const taxNote = (t) => ((t.borne ?? t.tax_borne) > 0
  ? `Nilai setelah pajak = nilai kontrak ${rp(t.contract)} − pajak yang dibayar kita ${rp(t.borne ?? t.tax_borne)} = ${rp(t.net)}.`
  : `Semua pajak dibayar client (ditambahkan ke tagihan), jadi nilai kontrak tidak berkurang: nilai setelah pajak tetap ${rp(t.net)}. Pilih "Kita" bila pajak dipotong dari nilai kontrak.`);

export const budgetAmount = (b, base) => (b?.mode === "pct" ? (base * Number(b.value || 0)) / 100 : Number(b?.value || 0));
export const budgetTotal = (budgets, base) => Object.values(budgets).reduce((a, b) => a + budgetAmount(b, base), 0);
export const budgetsFromRows = (rows) => Object.fromEntries(rows.map((x) => [x.component, x.percent !== null && x.percent !== undefined ? { mode: "pct", value: x.percent } : { mode: "nominal", value: x.amount }]));

export function ModeToggle({ mode, onChange, testId }) {
  return (
    <div className="inline-flex shrink-0 rounded-full bg-[#eef1f5] p-0.5 text-xs font-semibold" data-testid={testId}>
      {[["pct", "%"], ["nominal", "Rp"]].map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)} data-testid={`${testId}-${v}`}
          className={`h-8 min-w-[38px] px-2.5 rounded-full transition-colors ${mode === v ? "bg-[#12151c] text-white" : "text-slate-500 hover:text-[#12151c]"}`}>{l}</button>
      ))}
    </div>
  );
}

export function TaxRow({ label, prefix, form, set, amount }) {
  const mode = form[`${prefix}_mode`] || "pct";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2" data-testid={`tax-row-${prefix}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{label}</p>
        <ModeToggle mode={mode} onChange={(v) => set(`${prefix}_mode`, v)} testId={`${prefix}-mode`} />
      </div>
      <div className="flex items-center gap-2">
        <NumberInput value={form[`${prefix}_value`] ?? ""} onChange={(v) => set(`${prefix}_value`, v)} className="flex-1 min-w-0 h-11 rounded-xl border px-3 text-right num" placeholder={mode === "pct" ? "mis. 11" : "Rp"} data-testid={`${prefix}-value`} />
        <span className="text-xs text-slate-500 w-6">{mode === "pct" ? "%" : ""}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">Dibayar oleh</span>
        <Select value={form[`${prefix}_paid_by`] || "client"} onValueChange={(v) => set(`${prefix}_paid_by`, v)}>
          <SelectTrigger className="h-9 w-44 rounded-xl text-xs" data-testid={`${prefix}-paid-by`}><SelectValue /></SelectTrigger>
          <SelectContent>{PAYER.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <p className="text-xs text-slate-500">= <b className="num text-[#12151c]">{rp(amount)}</b></p>
    </div>
  );
}

export function BudgetEditor({ budgets, setBudgets, base }) {
  const setRow = (k, patch) => setBudgets((b) => ({ ...b, [k]: { mode: "pct", value: "", ...b[k], ...patch } }));
  const total = budgetTotal(budgets, base);
  return (
    <div className="space-y-2" data-testid="budget-editor">
      {BUDGET_KEYS.map(([k, l]) => {
        const b = budgets[k] || { mode: "pct", value: "" };
        return (
          <div key={k} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_120px_130px] items-center gap-2 text-sm">
            <span className="text-slate-600">{l}</span>
            <ModeToggle mode={b.mode} onChange={(m) => setRow(k, { mode: m, value: "" })} testId={`budget-mode-${k}`} />
            <NumberInput value={b.value ?? ""} onChange={(v) => setRow(k, { value: v })} placeholder={b.mode === "pct" ? "%" : "Rp"} className="h-10 rounded-xl border px-3 text-right num" data-testid={`budget-value-${k}`} />
            <span className="text-right num text-xs text-slate-500" data-testid={`budget-amount-${k}`}>{rp(budgetAmount(b, base))}</span>
          </div>
        );
      })}
      <div className="flex flex-wrap justify-between gap-2 pt-3 border-t text-sm">
        <span className="text-slate-500">Persen dihitung dari nilai kontrak setelah pajak: <b className="num text-[#12151c]">{rp(base)}</b></span>
        <span>Total budget: <b className="num" data-testid="budget-total">{rp(total)}</b>{base > 0 && <span className="text-slate-500"> ({Math.round((total / base) * 100)}%)</span>}</span>
      </div>
    </div>
  );
}
