import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Panel, btnDark, btnLight } from "@/components/kit";
import { Stat, DataTable } from "@/components/fin";
import { BudgetEditor, BUDGET_KEYS, budgetsFromRows, payerLabel, taxNote } from "@/components/ProjectInputs";
import { api, errMsg } from "@/lib/api";
import { rp, pct } from "@/lib/format";

const LABEL = Object.fromEntries(BUDGET_KEYS);

function BudgetDialog({ open, onClose, p, onSaved }) {
  const [budgets, setBudgets] = useState({});
  useEffect(() => { if (open) setBudgets(budgetsFromRows(p.budgets)); }, [open, p.budgets]);
  const save = async () => {
    try { await api.put(`/projects/${p.id}/budgets`, budgets); toast.success("Budget disimpan"); onSaved(); onClose(); } catch (err) { toast.error(errMsg(err)); }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-[28px] max-w-2xl max-h-[92vh] overflow-y-auto" data-testid="budget-dialog">
        <DialogHeader><DialogTitle>Ubah budget</DialogTitle><DialogDescription>Isi tiap budget pakai persen (%) atau nilai rupiah (Rp).</DialogDescription></DialogHeader>
        <BudgetEditor budgets={budgets} setBudgets={setBudgets} base={p.summary.tax.net} />
        <button onClick={save} className={`${btnDark} justify-center`} data-testid="budget-save-button">Simpan budget</button>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectRevenue({ p, reload, locked }) {
  const [edit, setEdit] = useState(false);
  const t = p.summary.tax;
  const actual = p.summary.actual_by_component;
  const total = p.budgets.reduce((a, b) => a + b.amount, 0);
  const profit = t.net - total;
  const rows = p.budgets.filter((b) => b.amount > 0 || b.percent).sort((a, b) => b.amount - a.amount);
  return (
    <div className="space-y-5" data-testid="project-revenue-tab">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat label="Nilai kontrak" value={rp(t.contract)} sub={`Tagihan ke client ${rp(t.tagihan)}`} testId="revenue-contract" />
        <Stat tone="blue" label="Pajak" value={rp(t.ppn + t.pph)} testId="revenue-tax"
          sub={`PPN ${p.ppn_mode === "pct" ? `${p.ppn_value}% ` : ""}${rp(t.ppn)} (dibayar ${payerLabel(p.ppn_paid_by)}) · PPh ${p.pph_mode === "pct" ? `${p.pph_value}% ` : ""}${rp(t.pph)} (dibayar ${payerLabel(p.pph_paid_by)}) · Ditanggung kita ${rp(t.tax_borne)}`} />
        <Stat tone="dark" label="Total budget" value={rp(total)} sub={`${pct(t.net ? (total / t.net) * 100 : 0)} dari nilai setelah pajak ${rp(t.net)}`} testId="revenue-budget-total" />
        <Stat label="Profit" value={<span className={profit < 0 ? "text-red-600" : "text-emerald-700"}>{rp(profit)}</span>} sub={`Margin ${pct(t.net ? (profit / t.net) * 100 : 0)} · nilai setelah pajak − total budget`} testId="revenue-profit" />
      </div>
      <p className="text-xs text-slate-600 bg-[#f4f6f9] rounded-2xl px-4 py-2.5" data-testid="revenue-tax-note">{taxNote(t)}</p>
      <Panel testId="revenue-budget-list">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="font-semibold">Daftar budget</p>
          {!locked && <button className={btnLight} onClick={() => setEdit(true)} data-testid="revenue-budget-edit"><Pencil className="w-4 h-4" />Ubah budget</button>}
        </div>
        <DataTable empty="Belum ada budget. Klik Ubah budget untuk mengisi."
          cols={[{ l: "Budget" }, { l: "Persen", r: true }, { l: "Nilai budget", r: true }, { l: "Terpakai", r: true }, { l: "Sisa", r: true }]}
          rows={rows.map((b) => {
            const used = b.component === "cadangan" ? 0 : actual[b.component] || 0;
            return { key: b.id, testId: `budget-row-${b.component}`, cells: [LABEL[b.component] || b.component, b.percent !== null ? pct(b.percent) : "—", rp(b.amount), rp(used),
              <b className={b.amount - used < 0 ? "text-red-600" : ""}>{rp(b.amount - used)}</b>] };
          })}
          foot={rows.length > 0 && [<b>Total</b>, "", <b>{rp(total)}</b>, "", ""]} />
      </Panel>
      <BudgetDialog open={edit} onClose={() => setEdit(false)} p={p} onSaved={reload} />
    </div>
  );
}
