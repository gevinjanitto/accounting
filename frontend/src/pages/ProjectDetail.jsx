import { useEffect, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Lock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loading, StatusBadge, Panel, btnDark, btnLight } from "@/components/kit";
import ProjectForm from "@/pages/ProjectForm";
import { api, errMsg } from "@/lib/api";
import { rp, rpShort, pct, tgl } from "@/lib/format";
import { payerLabel } from "@/components/ProjectInputs";
import { ProjectRevenue } from "@/pages/ProjectFinanceTabs";

const SRC = (s) => <span className={`ml-2 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${s === "aktual" ? "bg-[#cddcf3]" : "bg-slate-100 text-slate-500"}`}>{s}</span>;
const taxText = (p, k) => `${p[`${k}_mode`] === "pct" ? `${p[`${k}_value`]}% · ` : ""}${rp(p.summary.tax[k])} (dibayar ${payerLabel(p[`${k}_paid_by`])})`;

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
        <Metric label="Nilai kontrak setelah pajak" value={rp(s.revenue)} sub={`Kontrak ${rp(s.contract_value)}`} testId="ov-revenue" />
        <Metric label="Total biaya (HPP)" value={rp(s.hpp)} sub="Biaya langsung + gaji + operasional" testId="ov-hpp" />
        <Metric label="Laba sebelum bonus" value={rp(s.operating_profit)} sub={`Margin ${pct(s.operating_margin)}`} testId="ov-operating" />
        <Metric dark label="Perkiraan laba bersih" value={rp(s.distributable)} sub={`Margin ${pct(s.margin)} · target ${pct(s.target_margin)}`} testId="ov-distributable" />
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
            {[["Customer", p.customer_name], ["Perusahaan", p.entity_name], ["No. kontrak/SPK", p.contract_number], ["Periode", `${tgl(p.start_date)} – ${tgl(p.end_date)}`], ["PPN", taxText(p, "ppn")], ["PPh", taxText(p, "pph")]].map(([k, v]) => (
              <div key={k} className="contents"><dt className="text-slate-500">{k}</dt><dd className="font-medium">{v || "—"}</dd></div>
            ))}
          </dl>
          {p.description && <p className="text-sm text-slate-600 mt-4 pt-4 border-t">{p.description}</p>}
        </Panel>
      </div>
    </div>
  );
}

function Profitability({ p }) {
  const s = p.summary;
  const lines = [
    ["Nilai kontrak setelah pajak", s.revenue, s.revenue, s.revenue, "plus"],
    ["Biaya langsung", s.estimate.direct_cost, s.direct_cost, s.actual.direct_cost, "minus", s.sources.direct],
    ["Laba kotor", s.revenue - s.estimate.direct_cost, s.gross_profit, s.revenue - s.actual.direct_cost, "sub"],
    ["Gaji karyawan", s.estimate.labor_cost, s.labor_cost, s.actual.labor_cost, "minus", s.sources.labor],
    ["Operasional", s.estimate.overhead, s.overhead, s.actual.overhead, "minus", s.sources.overhead],
    ["Total biaya (HPP)", s.estimate.hpp, s.hpp, s.actual.hpp, "sub"],
    ["Laba sebelum bonus", s.revenue - s.estimate.hpp, s.operating_profit, s.revenue - s.actual.hpp, "sub"],
    ["Bonus tim", s.planned_bonus, s.bonus_used, s.actual_bonus, "minus", s.sources.bonus],
    ["Dana cadangan", s.internal_reserve, s.internal_reserve, s.internal_reserve, "minus"],
    ["Perkiraan laba bersih", s.estimate.distributable, s.distributable, s.actual.distributable, "total"],
  ];
  return (
    <div className="space-y-6">
      <Panel testId="profitability-table">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="text-left py-2">Keterangan</th><th className="text-right">Rencana (budget)</th><th className="text-right">Berjalan</th><th className="text-right">Realisasi</th></tr></thead>
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
        <p className="text-xs text-slate-500 mt-3">Berjalan: angka budget dipakai sampai biaya nyata (dari menu Pengeluaran) melebihinya. Setelah project ditutup, semua angka memakai realisasi.</p>
      </Panel>
      {p.closing && (
        <Panel testId="closing-report">
          <p className="font-semibold">Laporan akhir project</p>
          <p className="text-sm text-slate-500">Ditutup {tgl(p.closing.closed_at)} oleh {p.closing.closed_by}</p>
          <div className="grid sm:grid-cols-3 gap-4 mt-4">
            <Metric label="Total biaya akhir" value={rp(p.closing.summary.hpp)} />
            <Metric label="Laba sebelum bonus" value={rp(p.closing.summary.operating_profit)} />
            <Metric dark label="Laba bersih akhir" value={rp(p.closing.summary.distributable)} sub={`Margin ${pct(p.closing.summary.margin)}`} />
          </div>
          {p.closing.bonus_reconciliation && <p className="text-sm mt-4"><b>Catatan bonus & cadangan:</b> {p.closing.bonus_reconciliation}</p>}
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
        <DialogHeader><DialogTitle>Tutup project {p.code}</DialogTitle><DialogDescription>Sistem memakai biaya nyata: biaya langsung {rpShort(s.actual.direct_cost)}, gaji {rpShort(s.actual.labor_cost)}, operasional {rpShort(s.actual.overhead)}, bonus {rpShort(s.actual_bonus)}. Setelah ditutup data tidak dapat diubah.</DialogDescription></DialogHeader>
        <label className="text-sm font-semibold">Catatan bonus & cadangan</label>
        <Textarea value={f.bonus_reconciliation} onChange={(e) => setF({ ...f, bonus_reconciliation: e.target.value })} className="rounded-2xl" data-testid="close-bonus-input" />
        <label className="text-sm font-semibold">Catatan penutupan</label>
        <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="rounded-2xl" data-testid="close-notes-input" />
        <button onClick={submit} className={`${btnDark} justify-center`} data-testid="close-confirm-button"><Lock className="w-4 h-4" />Tutup project & buat laporan akhir</button>
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
            {!["Draft", "Cancelled"].includes(p.status) && <button className={btnDark} onClick={() => setClosing(true)} data-testid="project-close-button"><Lock className="w-4 h-4" />Tutup project</button>}
          </div>
        )}
      </div>
      <Tabs defaultValue="overview">
        <TabsList className="h-auto p-1.5 rounded-full bg-[#eef1f5] flex-wrap justify-start" data-testid="project-tabs">
          {[["overview", "Ringkasan"], ["revenue", "Pendapatan"], ["profit", "Profitabilitas"]].map(([v, l]) => (
            <TabsTrigger key={v} value={v} className="rounded-full px-5 h-10 data-[state=active]:bg-[#12151c] data-[state=active]:text-white" data-testid={`project-tab-${v}`}>{l}</TabsTrigger>
          ))}
        </TabsList>
        <div className="mt-6">
          <TabsContent value="overview"><Overview p={p} /></TabsContent>
          <TabsContent value="revenue"><ProjectRevenue p={p} reload={load} locked={locked} /></TabsContent>
          <TabsContent value="profit"><Profitability p={p} /></TabsContent>
        </div>
      </Tabs>
      <ProjectForm open={edit} onClose={() => setEdit(false)} project={p} onSaved={load} />
      <CloseDialog open={closing} onClose={() => setClosing(false)} p={p} onDone={load} />
    </div>
  );
}
