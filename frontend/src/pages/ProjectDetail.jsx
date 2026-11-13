import { useEffect, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Lock, Plus, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loading, StatusBadge, Panel, Field, btnDark, btnLight } from "@/components/kit";
import ProjectForm, { BUDGET_KEYS } from "@/pages/ProjectForm";
import { useRefs } from "@/pages/MasterData";
import { api, errMsg } from "@/lib/api";
import { rp, rpShort, pct, tgl, today, n } from "@/lib/format";
import { NumberInput } from "@/components/NumberInput";
import { ProjectRevenue, ProjectExpense, ProjectDocuments, ProjectTax } from "@/pages/ProjectFinanceTabs";

const COST_OPTS = [["freelancer", "Freelancer"], ["server", "Server / hosting"], ["lisensi", "Lisensi"], ["vendor", "Vendor"], ["perjalanan", "Perjalanan dinas"], ["lainnya", "Biaya langsung lainnya"], ["bonus", "Bonus aktual tim"]].map(([v, l]) => ({ v, l }));
const METHOD_LABEL = { revenue: "Persentase revenue", hours: "Jam kerja", duration: "Durasi project", capacity: "Kapasitas / penggunaan", manual: "Manual (%)" };
const SRC = (s) => <span className={`ml-2 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${s === "aktual" ? "bg-[#cddcf3]" : "bg-slate-100 text-slate-500"}`}>{s}</span>;

function Metric({ label, value, sub, dark, testId }) {
  return (
    <div className={`rounded-[24px] p-5 ${dark ? "bg-[#12151c] text-white" : "bg-[#f4f6f9]"}`} data-testid={testId}>
      <p className={`text-xs ${dark ? "text-white/70" : "text-slate-500"}`}>{label}</p>
      <p className="text-2xl font-extrabold num mt-1">{value}</p>
      {sub && <div className={`text-xs mt-1 ${dark ? "text-white/70" : "text-slate-500"}`}>{sub}</div>}
    </div>
  );
}

function Overview({ p }) {
  const s = p.summary;
  const marginPct = Math.max(0, Math.min(100, (s.margin / Math.max(s.target_margin, 1)) * 100));
  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Metric label="Revenue (kontrak sebelum PPN)" value={rp(s.revenue)} testId="ov-revenue" />
        <Metric label="HPP" value={rp(s.hpp)} sub={<>Direct + Labor + Overhead</>} testId="ov-hpp" />
        <Metric label="Operating project profit" value={rp(s.operating_profit)} sub={`Margin operasi ${pct(s.operating_margin)}`} testId="ov-operating" />
        <Metric dark label="Distributable estimate" value={rp(s.distributable)} sub={`Margin ${pct(s.margin)} · target ${pct(s.target_margin)}`} testId="ov-distributable" />
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <Panel>
          <p className="font-semibold mb-4">Margin terhadap target</p>
          <div className="h-4 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full transition-[width] duration-700 ${s.low_margin ? "bg-amber-500" : "bg-[#3574c4]"}`} style={{ width: `${marginPct}%` }} /></div>
          <div className="flex justify-between text-xs mt-2 text-slate-500"><span>{pct(s.margin)}</span><span>Target {pct(s.target_margin)}</span></div>
          {s.alerts.length > 0 && (
            <div className="mt-5 space-y-2" data-testid="project-alerts">
              {s.alerts.map((a, i) => <p key={i} className="flex gap-2 text-sm text-red-700 bg-red-50 rounded-2xl px-4 py-2.5"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{a}</p>)}
            </div>
          )}
        </Panel>
        <Panel>
          <p className="font-semibold mb-3">Detail kontrak</p>
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            {[["Customer", p.customer_name], ["Entitas", p.entity_name], ["No. kontrak/SPK", p.contract_number], ["Tanggal kontrak", tgl(p.contract_date)], ["Periode", `${tgl(p.start_date)} – ${tgl(p.end_date)}`], ["Metode costing", p.costing_method], ["Klasifikasi pajak", p.tax_classification], ["Jam kerja tercatat", `${n(s.actual.hours)} jam`]].map(([k, v]) => (
              <div key={k} className="contents"><dt className="text-slate-500">{k}</dt><dd className="font-medium">{v || "—"}</dd></div>
            ))}
          </dl>
          {p.description && <p className="text-sm text-slate-600 mt-4 pt-4 border-t">{p.description}</p>}
        </Panel>
      </div>
    </div>
  );
}

function CostAllocation({ p, reload, locked }) {
  const refs = useRefs(["vendors"]);
  const [f, setF] = useState({ date: today(), component: "freelancer", amount: "", vendor_id: "", description: "" });
  const add = async (e) => {
    e.preventDefault();
    try { await api.post(`/projects/${p.id}/costs`, f); toast.success("Biaya dicatat"); setF({ ...f, amount: "", description: "" }); reload(); } catch (err) { toast.error(errMsg(err)); }
  };
  const del = async (id) => { try { await api.delete(`/projects/${p.id}/costs/${id}`); reload(); } catch (err) { toast.error(errMsg(err)); } };
  return (
    <div className="grid xl:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-6">
        <Panel testId="direct-costs-panel">
          <p className="font-semibold mb-3">Biaya langsung & bonus aktual</p>
          <Table cols={["Tanggal", "Kategori", "Vendor", "Keterangan", "Nominal", ""]} rows={p.costs.map((c) => [tgl(c.date), c.component_label, c.vendor_name || "—", c.description || "—", <span className="num font-semibold">{rp(c.amount)}</span>,
            c.expense_id ? <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-[#cddcf3]" data-testid={`cost-from-expense-${c.id}`}>Pengeluaran</span> : !locked && <button onClick={() => del(c.id)} className="text-red-500" data-testid={`cost-delete-${c.id}`}><Trash2 className="w-4 h-4" /></button>])} empty="Belum ada biaya langsung." />
        </Panel>
        <Panel testId="overhead-alloc-panel">
          <div className="flex items-center justify-between mb-3"><p className="font-semibold">Alokasi overhead</p></div>
          <Table cols={["Metode", "Porsi", "Nominal", "Status"]} rows={p.allocations.map((a) => [METHOD_LABEL[a.method] || a.method, pct(a.share_pct), <span className="num">{rp(a.amount)}</span>, a.is_active ? <StatusBadge status="Running" /> : <span className="text-xs text-slate-400">Diganti (riwayat)</span>])} empty="Belum ada alokasi overhead." />
        </Panel>
      </div>
      {!locked && (
        <Panel className="h-fit">
          <p className="font-semibold mb-4">Catat biaya</p>
          <form onSubmit={add} className="space-y-3">
            <Field f={{ k: "date", l: "Tanggal", t: "date", req: true }} value={f.date} onChange={(k, v) => setF({ ...f, [k]: v })} />
            <Field f={{ k: "component", l: "Kategori", t: "select", o: COST_OPTS, req: true }} value={f.component} onChange={(k, v) => setF({ ...f, [k]: v })} />
            <Field f={{ k: "vendor_id", l: "Vendor", t: "ref", ref: "vendors" }} refs={refs} value={f.vendor_id} onChange={(k, v) => setF({ ...f, [k]: v })} />
            <Field f={{ k: "amount", l: "Nominal (Rp)", t: "num", req: true }} value={f.amount} onChange={(k, v) => setF({ ...f, [k]: v })} />
            <Field f={{ k: "description", l: "Keterangan" }} value={f.description} onChange={(k, v) => setF({ ...f, [k]: v })} />
            <button type="submit" className={`${btnDark} w-full justify-center`} data-testid="cost-add-button"><Plus className="w-4 h-4" />Simpan biaya</button>
          </form>
        </Panel>
      )}
    </div>
  );
}

function EmployeeCost({ p, reload, locked }) {
  const refs = useRefs(["employees"]);
  const [f, setF] = useState({ employee_id: "", date: today(), hours: "", description: "" });
  const emp = (refs.employees || []).find((e) => e.id === f.employee_id);
  const rate = emp && emp.productive_hours ? emp.monthly_cost / emp.productive_hours : 0;
  const add = async (e) => {
    e.preventDefault();
    try { await api.post(`/projects/${p.id}/timesheets`, f); toast.success("Timesheet dicatat"); setF({ ...f, hours: "", description: "" }); reload(); } catch (err) { toast.error(errMsg(err)); }
  };
  const del = async (id) => { try { await api.delete(`/projects/${p.id}/timesheets/${id}`); reload(); } catch (err) { toast.error(errMsg(err)); } };
  return (
    <div className="grid xl:grid-cols-[1fr_360px] gap-6">
      <Panel testId="timesheet-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="font-semibold">Timesheet project</p>
          <p className="text-sm text-slate-500">Total {n(p.summary.actual.hours)} jam · <b className="text-[#12151c] num">{rp(p.summary.actual.labor_cost)}</b></p>
        </div>
        <Table cols={["Tanggal", "Karyawan", "Jam", "Tarif/jam", "Total", "Deskripsi", ""]} rows={p.timesheets.map((t) => [tgl(t.date), t.employee_name, n(t.hours), rp(t.rate), <span className="num font-semibold">{rp(t.total)}</span>, t.description || "—",
          !locked && <button onClick={() => del(t.id)} className="text-red-500" data-testid={`timesheet-delete-${t.id}`}><Trash2 className="w-4 h-4" /></button>])} empty="Belum ada timesheet." />
        <p className="text-xs text-slate-500 mt-3">Biaya tenaga kerja aktual dari timesheet menggantikan estimasi persentase (tidak ditambahkan dua kali).</p>
      </Panel>
      {!locked && (
        <Panel className="h-fit">
          <p className="font-semibold mb-4">Input jam kerja</p>
          <form onSubmit={add} className="space-y-3">
            <Field f={{ k: "employee_id", l: "Karyawan", t: "ref", ref: "employees", req: true }} refs={refs} value={f.employee_id} onChange={(k, v) => setF({ ...f, [k]: v })} />
            <Field f={{ k: "date", l: "Tanggal", t: "date", req: true }} value={f.date} onChange={(k, v) => setF({ ...f, [k]: v })} />
            <Field f={{ k: "hours", l: "Jam kerja", t: "num", req: true }} value={f.hours} onChange={(k, v) => setF({ ...f, [k]: v })} />
            <Field f={{ k: "description", l: "Deskripsi pekerjaan" }} value={f.description} onChange={(k, v) => setF({ ...f, [k]: v })} />
            <div className="rounded-2xl bg-[#f4f6f9] p-3 text-sm" data-testid="timesheet-preview">
              <div className="flex justify-between"><span className="text-slate-500">Tarif/jam</span><b className="num">{rp(rate)}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">Biaya</span><b className="num">{rp(rate * Number(f.hours || 0))}</b></div>
            </div>
            <button type="submit" className={`${btnDark} w-full justify-center`} data-testid="timesheet-add-button"><Plus className="w-4 h-4" />Simpan timesheet</button>
          </form>
        </Panel>
      )}
    </div>
  );
}

function Budget({ p, reload, locked }) {
  const [b, setB] = useState({});
  useEffect(() => { setB(Object.fromEntries(p.budgets.map((x) => [x.component, x.amount]))); }, [p.budgets]);
  const save = async () => { try { await api.put(`/projects/${p.id}/budgets`, b); toast.success("Budget disimpan"); reload(); } catch (err) { toast.error(errMsg(err)); } };
  const rows = p.summary.budget_vs_actual;
  return (
    <div className="grid xl:grid-cols-[380px_1fr] gap-6">
      <Panel testId="budget-editor">
        <p className="font-semibold mb-4">Project budget</p>
        <div className="space-y-2.5">
          {BUDGET_KEYS.map(([k, l]) => (
            <label key={k} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-600">{l}</span>
              <NumberInput disabled={locked} value={b[k] ?? ""} onChange={(v) => setB({ ...b, [k]: v })} className="w-40 h-10 rounded-xl border px-3 text-right num disabled:bg-slate-50" data-testid={`budget-input-${k}`} />
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-3">Bonus rencana dan cadangan internal adalah alokasi manajemen, bukan beban akuntansi otomatis.</p>
        {!locked && <button onClick={save} className={`${btnDark} w-full justify-center mt-4`} data-testid="budget-save-button">Simpan budget</button>}
      </Panel>
      <Panel testId="budget-vs-actual">
        <p className="font-semibold mb-3">Budget vs actual</p>
        <Table cols={["Komponen", "Budget", "Actual", "Variance", "Pemakaian"]} rows={rows.map((r) => [
          <span className="font-medium">{r.label}<span className="block text-[11px] text-slate-400">{r.category}</span></span>, rp(r.budget), rp(r.actual),
          <span className={`num font-semibold ${r.variance < 0 ? "text-red-600" : "text-[#1f4f8f]"}`} data-testid={`variance-${r.component}`}>{r.variance >= 0 ? "+" : "−"}{rp(Math.abs(r.variance))}</span>,
          <div className="w-32"><div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full ${r.over_budget ? "bg-red-500" : "bg-[#0f52ba]"}`} style={{ width: `${Math.min(r.usage_pct, 100)}%` }} /></div><span className="text-[11px] text-slate-500">{pct(r.usage_pct)}{r.over_budget && " · over budget"}</span></div>,
        ])} empty="Belum ada budget." />
      </Panel>
    </div>
  );
}

function Profitability({ p }) {
  const s = p.summary;
  const lines = [
    ["Revenue", s.revenue, s.revenue, s.revenue, "plus"],
    ["Direct cost", s.estimate.direct_cost, s.direct_cost, s.actual.direct_cost, "minus", s.sources.direct],
    ["Gross project profit", s.revenue - s.estimate.direct_cost, s.gross_profit, s.revenue - s.actual.direct_cost, "sub"],
    ["Labor cost", s.estimate.labor_cost, s.labor_cost, s.actual.labor_cost, "minus", s.sources.labor],
    ["Allocated overhead", s.estimate.overhead, s.overhead, s.actual.overhead, "minus", s.sources.overhead],
    ["HPP", s.estimate.hpp, s.hpp, s.actual.hpp, "sub"],
    ["Operating project profit", s.revenue - s.estimate.hpp, s.operating_profit, s.revenue - s.actual.hpp, "sub"],
    ["Bonus tim", s.planned_bonus, s.bonus_used, s.actual_bonus, "minus", s.sources.bonus],
    ["Cadangan internal", s.internal_reserve, s.internal_reserve, s.internal_reserve, "minus"],
    ["Distributable estimate", s.estimate.distributable, s.distributable, s.actual.distributable, "total"],
  ];
  return (
    <div className="space-y-6">
      <Panel testId="profitability-table">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="text-left py-2">Indikator</th><th className="text-right">Estimasi (budget)</th><th className="text-right">Hybrid (berjalan)</th><th className="text-right">Aktual murni</th></tr></thead>
            <tbody>
              {lines.map(([l, e, h, a, kind, src]) => (
                <tr key={l} className={`border-t ${kind === "total" ? "bg-[#12151c] text-white" : kind === "sub" ? "bg-[#f4f6f9] font-semibold" : ""}`}>
                  <td className="py-3 px-2">{kind === "minus" && "− "}{l}{src && SRC(src)}</td>
                  <td className="text-right num px-2">{rp(e)}</td><td className="text-right num px-2 font-semibold">{rp(h)}</td><td className="text-right num px-2">{rp(a)}</td>
                </tr>
              ))}
              <tr className="border-t"><td className="py-3 px-2">Margin</td><td className="text-right px-2">{pct(s.estimate.margin)}</td><td className="text-right px-2 font-bold" data-testid="profit-margin">{pct(s.margin)}</td><td className="text-right px-2">{pct(s.revenue ? (s.actual.distributable / s.revenue) * 100 : 0)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500 mt-3">Hybrid: estimasi persentase dipakai sampai realisasi melampauinya; setelah closing seluruh angka memakai aktual.</p>
      </Panel>
      {p.closing && (
        <Panel testId="closing-report">
          <p className="font-semibold">Laporan final project</p>
          <p className="text-sm text-slate-500">Ditutup {tgl(p.closing.closed_at)} oleh {p.closing.closed_by}</p>
          <div className="grid sm:grid-cols-3 gap-4 mt-4">
            <Metric label="HPP final" value={rp(p.closing.summary.hpp)} />
            <Metric label="Operating profit final" value={rp(p.closing.summary.operating_profit)} />
            <Metric dark label="Keuntungan final" value={rp(p.closing.summary.distributable)} sub={`Margin ${pct(p.closing.summary.margin)}`} />
          </div>
          {p.closing.bonus_reconciliation && <p className="text-sm mt-4"><b>Rekonsiliasi bonus & cadangan:</b> {p.closing.bonus_reconciliation}</p>}
          {p.closing.notes && <p className="text-sm mt-1"><b>Catatan:</b> {p.closing.notes}</p>}
        </Panel>
      )}
    </div>
  );
}

export function Table({ cols, rows, empty }) {
  if (!rows.length) return <p className="text-sm text-slate-500 py-6 text-center">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider text-slate-500"><tr>{cols.map((c, i) => <th key={i} className="py-2 px-2 font-semibold whitespace-nowrap">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-slate-100">{r.map((c, j) => <td key={j} className="py-3 px-2 whitespace-nowrap">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function CloseDialog({ open, onClose, p, onDone }) {
  const [f, setF] = useState({ notes: "", bonus_reconciliation: "" });
  const submit = async () => {
    try { await api.post(`/projects/${p.id}/close`, f); toast.success("Project ditutup"); onDone(); onClose(); } catch (err) { toast.error(errMsg(err)); }
  };
  const s = p.summary;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-[28px]" data-testid="close-project-dialog">
        <DialogHeader><DialogTitle>Closing {p.code}</DialogTitle><DialogDescription>Sistem memakai biaya aktual: direct {rpShort(s.actual.direct_cost)}, labor {rpShort(s.actual.labor_cost)}, overhead {rpShort(s.actual.overhead)}, bonus aktual {rpShort(s.actual_bonus)}. Setelah ditutup data tidak dapat diubah.</DialogDescription></DialogHeader>
        <label className="text-sm font-semibold">Rekonsiliasi bonus aktual & cadangan</label>
        <Textarea value={f.bonus_reconciliation} onChange={(e) => setF({ ...f, bonus_reconciliation: e.target.value })} className="rounded-2xl" data-testid="close-bonus-input" />
        <label className="text-sm font-semibold">Catatan closing</label>
        <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="rounded-2xl" data-testid="close-notes-input" />
        <button onClick={submit} className={`${btnDark} justify-center`} data-testid="close-confirm-button"><Lock className="w-4 h-4" />Tutup project & buat laporan final</button>
      </DialogContent>
    </Dialog>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [edit, setEdit] = useState(false);
  const [closing, setClosing] = useState(false);
  const load = useCallback(() => api.get(`/projects/${id}`).then(({ data }) => setP(data)), [id]);
  useEffect(() => { load(); }, [load]);
  if (!p) return <Loading />;
  const locked = p.status === "Completed";
  return (
    <div className="p-5 sm:p-8 lg:p-10" data-testid="project-detail-page">
      <Link to="/projects" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#12151c] mb-4" data-testid="project-back-link"><ArrowLeft className="w-4 h-4" />Semua project</Link>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div className="mh-rise">
          <p className="font-mono-num text-sm text-[#0f52ba]">{p.code}</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-1" data-testid="project-name">{p.name}</h1>
          <div className="flex items-center gap-3 mt-3"><StatusBadge status={p.status} testId="project-status" /><span className="text-sm text-slate-500">{p.customer_name || "Tanpa customer"} · {rp(p.contract_value)}</span></div>
        </div>
        {!locked && (
          <div className="flex gap-2">
            <button className={btnLight} onClick={() => setEdit(true)} data-testid="project-edit-button"><Pencil className="w-4 h-4" />Ubah</button>
            <button className={btnDark} onClick={() => setClosing(true)} data-testid="project-close-button"><Lock className="w-4 h-4" />Closing project</button>
          </div>
        )}
      </div>
      <Tabs defaultValue="overview">
        <TabsList className="h-auto p-1.5 rounded-full bg-[#eef1f5] flex-wrap justify-start" data-testid="project-tabs">
          {[["overview", "Overview"], ["cost", "Cost Allocation"], ["employee", "Employee Cost"], ["budget", "Budget"], ["profit", "Profitability"], ["revenue", "Revenue"], ["expense", "Expense"], ["documents", "Documents"], ["tax", "Tax"]].map(([v, l]) => (
            <TabsTrigger key={v} value={v} className="rounded-full px-5 h-10 data-[state=active]:bg-[#12151c] data-[state=active]:text-white" data-testid={`project-tab-${v}`}>{l}</TabsTrigger>
          ))}
        </TabsList>
        <div className="mt-6">
          <TabsContent value="overview"><Overview p={p} /></TabsContent>
          <TabsContent value="cost"><CostAllocation p={p} reload={load} locked={locked} /></TabsContent>
          <TabsContent value="employee"><EmployeeCost p={p} reload={load} locked={locked} /></TabsContent>
          <TabsContent value="budget"><Budget p={p} reload={load} locked={locked} /></TabsContent>
          <TabsContent value="profit"><Profitability p={p} /></TabsContent>
          <TabsContent value="revenue"><ProjectRevenue p={p} /></TabsContent>
          <TabsContent value="expense"><ProjectExpense p={p} reload={load} locked={locked} /></TabsContent>
          <TabsContent value="documents"><ProjectDocuments p={p} /></TabsContent>
          <TabsContent value="tax"><ProjectTax p={p} /></TabsContent>
        </div>
      </Tabs>
      <ProjectForm open={edit} onClose={() => setEdit(false)} project={p} onSaved={load} />
      <CloseDialog open={closing} onClose={() => setClosing(false)} p={p} onDone={load} />
    </div>
  );
}
