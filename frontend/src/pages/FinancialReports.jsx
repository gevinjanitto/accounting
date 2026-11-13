import { useEffect, useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, Pill, Loading, Field } from "@/components/kit";
import { DataTable, Stat, ExportMenu } from "@/components/fin";
import { useRefs } from "@/pages/MasterData";
import { CATEGORIES } from "@/pages/Expenses";
import { api } from "@/lib/api";
import { rp, pct, bulan, today } from "@/lib/format";
import { useProjects, projectOpts, refOpts } from "@/lib/lists";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const PRESETS = [["day", "Harian"], ["week", "Mingguan"], ["month", "Bulanan"], ["quarter", "Triwulan"], ["year", "Tahunan"], ["all", "Semua"], ["custom", "Custom"]];

export function rangeFor(preset, ref) {
  const d = new Date(`${ref}T00:00:00`);
  const y = d.getFullYear(), m = d.getMonth();
  if (preset === "day") return [ref, ref];
  if (preset === "week") { const s = new Date(d); s.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const e = new Date(s); e.setDate(s.getDate() + 6); return [iso(s), iso(e)]; }
  if (preset === "month") return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
  if (preset === "quarter") { const q = Math.floor(m / 3) * 3; return [iso(new Date(y, q, 1)), iso(new Date(y, q + 3, 0))]; }
  if (preset === "year") return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))];
  return ["", ""];
}

function Filters({ f, setF, refs, projects }) {
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="rounded-[28px] bg-[#f4f6f9] p-5 mb-6 space-y-4" data-testid="report-filters">
      <div className="flex flex-wrap gap-2">{PRESETS.map(([k, l]) => <Pill key={k} active={f.preset === k} onClick={() => set("preset", k)} testId={`report-preset-${k}`}>{l}</Pill>)}</div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {f.preset === "custom" ? (
          <>
            <Field f={{ k: "date_from", l: "Dari", t: "date" }} value={f.date_from} onChange={set} />
            <Field f={{ k: "date_to", l: "Sampai", t: "date" }} value={f.date_to} onChange={set} />
          </>
        ) : f.preset !== "all" && <Field f={{ k: "ref", l: "Tanggal acuan", t: "date" }} value={f.ref} onChange={set} />}
        <Field f={{ k: "entity_id", l: "Entitas", t: "select", o: refOpts(refs.entities) }} value={f.entity_id} onChange={set} />
        <Field f={{ k: "project_id", l: "Project", t: "select", o: projectOpts(projects) }} value={f.project_id} onChange={set} />
        <Field f={{ k: "customer_id", l: "Customer", t: "select", o: refOpts(refs.customers) }} value={f.customer_id} onChange={set} />
        <Field f={{ k: "category", l: "Kategori biaya", t: "select", o: CATEGORIES }} value={f.category} onChange={set} />
      </div>
    </div>
  );
}

const subtitleOf = (p) => (p.date_from || p.date_to ? `Periode ${p.date_from || "awal"} s/d ${p.date_to || "sekarang"}` : "Semua periode");

function Company({ params }) {
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); api.get("/reports/company", { params }).then(({ data }) => setD(data)); }, [params]);
  if (!d) return <Loading />;
  const s = d.summary, a = d.allocation_check;
  const lines = [["Total pendapatan (DPP)", s.revenue], ["Direct cost", -s.direct_cost], ["Labor cost (gaji aktual)", -s.labor_cost], ["Bonus aktual", -s.actual_bonus], ["Overhead", -s.overhead], ["Administrative expense", -s.administrative_expense], ["Other expense", -s.other_expense], ["Operating profit", s.operating_profit, true], ["Depresiasi", -s.depreciation], ["Beban pajak", -s.tax_expense], ["Net profit", s.net_profit, true]];
  const exportBuild = () => ({ title: "Laporan Perusahaan", subtitle: subtitleOf(params), columns: [{ k: 0, l: "Komponen" }, { k: 1, l: "Nominal", t: "rp" }],
    rows: [...lines, ["Cadangan internal (analitis, bukan beban)", s.internal_reserve], ["Arus kas bersih", s.cash_flow], ["Pembelian aset (kapitalisasi)", s.asset_acquisition]] });
  return (
    <div className="space-y-6" data-testid="company-report">
      <div className="flex justify-end"><ExportMenu name="company" build={exportBuild} /></div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat tone="blue" label="Pendapatan" value={rp(s.revenue)} testId="company-revenue" />
        <Stat label="Operating profit" value={rp(s.operating_profit)} testId="company-operating" />
        <Stat tone="dark" label="Net profit" value={rp(s.net_profit)} sub={`Margin ${pct(s.net_margin)}`} testId="company-net" />
        <Stat tone="brand" label="Arus kas bersih" value={rp(s.cash_flow)} sub={`Cadangan internal ${rp(s.internal_reserve)}`} testId="company-cashflow" />
      </div>
      <div className="grid xl:grid-cols-[1.2fr_1fr] gap-6">
        <DataTable testId="company-lines" cols={[{ l: "Komponen" }, { l: "Nominal", r: true }]}
          rows={lines.map(([l, v, bold], i) => ({ key: i, cells: [bold ? <b>{l}</b> : l, <span className={`${bold ? "font-bold" : ""} ${v < 0 ? "text-red-600" : ""}`}>{rp(v)}</span>] }))} />
        <div className="space-y-4">
          <div className="rounded-[28px] border-2 border-[#12151c] p-5" data-testid="allocation-check">
            <p className="font-semibold">Kontrol biaya ganda</p>
            <p className="text-xs text-slate-500 mb-3">Alokasi ke project hanya untuk analisis; konsolidasi memakai biaya aktual satu kali.</p>
            {[["Gaji dialokasikan ke project (timesheet)", a.labor_allocated_to_projects], ["Gaji aktual perusahaan (dipakai)", a.labor_actual_company], ["Overhead dialokasikan ke project", a.overhead_allocated_to_projects], ["Overhead aktual perusahaan (dipakai)", a.overhead_actual_company]].map(([l, v]) => (
              <div key={l} className="flex justify-between text-sm py-1.5 border-t border-slate-100"><span>{l}</span><b className="num">{rp(v)}</b></div>
            ))}
          </div>
          <DataTable testId="company-monthly" cols={[{ l: "Bulan" }, { l: "Pendapatan", r: true }, { l: "Pengeluaran", r: true }, { l: "Laba", r: true }]} empty="Tidak ada transaksi pada filter ini."
            rows={d.monthly.map((m) => ({ key: m.month, cells: [bulan(m.month), rp(m.revenue), rp(m.expense), <b className={m.profit < 0 ? "text-red-600" : ""}>{rp(m.profit)}</b>] }))} />
        </div>
      </div>
      <DataTable testId="company-by-project" cols={[{ l: "Project" }, { l: "Customer" }, { l: "Pendapatan", r: true }, { l: "Pengeluaran langsung", r: true }, { l: "Selisih", r: true }]}
        rows={d.by_project.map((p) => ({ key: p.project_id, cells: [p.project, p.customer || "—", rp(p.revenue), rp(p.expense), rp(p.profit)] }))} />
    </div>
  );
}

function Section({ title, rows, total, testId }) {
  return (
    <div data-testid={testId}>
      <p className="font-semibold mb-2">{title}</p>
      <DataTable cols={[{ l: "Akun" }, { l: "Nominal", r: true }]} empty="—" rows={rows.map((r) => ({ key: r.account_id || r.label, cells: [r.code ? `${r.code} · ${r.name}` : r.label, rp(r.amount)] }))} foot={[`Total ${title.toLowerCase()}`, rp(total)]} />
    </div>
  );
}

function ProfitLoss({ params }) {
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); api.get("/accounting/profit-loss", { params }).then(({ data }) => setD(data)); }, [params]);
  if (!d) return <Loading />;
  const exportBuild = () => ({ title: "Laporan Laba Rugi", subtitle: subtitleOf(params), columns: [{ k: "label", l: "Akun" }, { k: "amount", l: "Nominal", t: "rp" }],
    rows: [...d.revenue.map((r) => ({ label: `${r.code} ${r.name}`, amount: r.amount })), { label: "Total pendapatan", amount: d.total_revenue, _total: true }, ...d.expenses.map((r) => ({ label: `${r.code} ${r.name}`, amount: r.amount })), { label: "Total beban", amount: d.total_expense, _total: true }, { label: "Laba kotor", amount: d.gross_profit, _total: true }, { label: "Laba operasi", amount: d.operating_profit, _total: true }, { label: "Laba bersih", amount: d.net_profit, _total: true }] });
  return (
    <div className="space-y-6" data-testid="profit-loss-report">
      <div className="flex justify-end"><ExportMenu name="profit-loss" build={exportBuild} /></div>
      <div className="grid sm:grid-cols-3 gap-4">
        <Stat tone="blue" label="Laba kotor" value={rp(d.gross_profit)} /><Stat label="Laba operasi" value={rp(d.operating_profit)} /><Stat tone="dark" label="Laba bersih" value={rp(d.net_profit)} testId="pl-net-profit" />
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <Section title="Pendapatan" rows={d.revenue} total={d.total_revenue} testId="pl-revenue" />
        <Section title="Beban" rows={d.expenses} total={d.total_expense} testId="pl-expenses" />
      </div>
    </div>
  );
}

function BalanceSheet({ params }) {
  const [d, setD] = useState(null);
  const q = useMemo(() => ({ as_of: params.date_to || today(), entity_id: params.entity_id }), [params]);
  useEffect(() => { setD(null); api.get("/accounting/balance-sheet", { params: q }).then(({ data }) => setD(data)); }, [q]);
  if (!d) return <Loading />;
  const equity = [...d.equity, { label: "Laba berjalan", amount: d.current_earnings }];
  const exportBuild = () => ({ title: "Neraca", subtitle: `Per ${q.as_of}`, columns: [{ k: "s", l: "Bagian" }, { k: "label", l: "Akun" }, { k: "amount", l: "Nominal", t: "rp" }],
    rows: [...d.assets.map((r) => ({ s: "Aset", label: `${r.code} ${r.name}`, amount: r.amount })), { s: "Aset", label: "Total aset", amount: d.total_assets, _total: true }, ...d.liabilities.map((r) => ({ s: "Liabilitas", label: `${r.code} ${r.name}`, amount: r.amount })), ...equity.map((r) => ({ s: "Ekuitas", label: r.code ? `${r.code} ${r.name}` : r.label, amount: r.amount })), { s: "", label: "Total liabilitas + ekuitas", amount: d.total_liabilities + d.total_equity, _total: true }] });
  return (
    <div className="space-y-6" data-testid="balance-sheet-report">
      <div className="flex items-center justify-between"><p className="text-sm text-slate-500">Per {q.as_of} · <span className={`font-semibold ${d.balanced ? "text-[#0f52ba]" : "text-red-600"}`} data-testid="balance-sheet-status">{d.balanced ? "Seimbang" : "Tidak seimbang"}</span></p><ExportMenu name="balance-sheet" build={exportBuild} /></div>
      <div className="grid lg:grid-cols-2 gap-6">
        <Section title="Aset" rows={d.assets} total={d.total_assets} testId="bs-assets" />
        <div className="space-y-6">
          <Section title="Liabilitas" rows={d.liabilities} total={d.total_liabilities} testId="bs-liabilities" />
          <Section title="Ekuitas" rows={equity} total={d.total_equity} testId="bs-equity" />
        </div>
      </div>
    </div>
  );
}

function CashFlow({ params }) {
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); api.get("/cash/cash-flow", { params: { date_from: params.date_from, date_to: params.date_to, entity_id: params.entity_id } }).then(({ data }) => setD(data)); }, [params]);
  if (!d) return <Loading />;
  const L = { operating: "Aktivitas operasi", investing: "Aktivitas investasi", financing: "Aktivitas pendanaan" };
  const exportBuild = () => ({ title: "Laporan Arus Kas", subtitle: subtitleOf(params), columns: [{ k: "s", l: "Aktivitas" }, { k: "label", l: "Uraian" }, { k: "amount", l: "Nominal", t: "rp" }],
    rows: [{ s: "", label: "Kas awal", amount: d.opening_cash }, ...Object.entries(d.sections).flatMap(([k, rows]) => [...rows.map((r) => ({ s: L[k], ...r })), { s: L[k], label: "Subtotal", amount: d.totals[k], _total: true }]), { s: "", label: "Kenaikan (penurunan) kas", amount: d.net_change }, { s: "", label: "Kas akhir", amount: d.closing_cash, _total: true }] });
  return (
    <div className="space-y-6" data-testid="cash-flow-report">
      <div className="flex justify-end"><ExportMenu name="cash-flow" build={exportBuild} /></div>
      <div className="grid sm:grid-cols-3 gap-4"><Stat label="Kas awal" value={rp(d.opening_cash)} /><Stat tone="blue" label="Perubahan kas" value={rp(d.net_change)} /><Stat tone="dark" label="Kas akhir" value={rp(d.closing_cash)} testId="cf-closing" /></div>
      <div className="grid lg:grid-cols-3 gap-6">
        {Object.entries(d.sections).map(([k, rows]) => <Section key={k} title={L[k]} rows={rows} total={d.totals[k]} testId={`cf-${k}`} />)}
      </div>
      <p className="text-xs text-slate-500">Transfer antar rekening tidak dihitung sebagai arus kas masuk/keluar.</p>
    </div>
  );
}

export default function FinancialReports() {
  const refs = useRefs(["entities", "customers"]);
  const projects = useProjects();
  const [f, setF] = useState({ preset: "year", ref: today(), date_from: "", date_to: "", entity_id: "", project_id: "", customer_id: "", category: "" });
  const params = useMemo(() => {
    const [a, b] = f.preset === "custom" ? [f.date_from, f.date_to] : rangeFor(f.preset, f.ref || today());
    return { date_from: a, date_to: b, entity_id: f.entity_id, project_id: f.project_id, customer_id: f.customer_id, category: f.category };
  }, [f]);
  return (
    <div className="p-5 sm:p-8 lg:p-10" data-testid="financial-reports-page">
      <PageHeader eyebrow="Management Reporting" title="Laporan keuangan" desc="Laporan perusahaan, laba rugi, neraca, dan arus kas dari transaksi posted. Semua laporan dapat di-export ke PDF, Excel, dan CSV." />
      <Filters f={f} setF={setF} refs={refs} projects={projects} />
      <Tabs defaultValue="company">
        <TabsList className="h-auto p-1.5 rounded-full bg-[#eef1f5] flex-wrap justify-start" data-testid="fin-report-tabs">
          {[["company", "Laporan perusahaan"], ["pl", "Laba rugi"], ["bs", "Neraca"], ["cf", "Arus kas"]].map(([v, l]) => (
            <TabsTrigger key={v} value={v} className="rounded-full px-5 h-10 data-[state=active]:bg-[#12151c] data-[state=active]:text-white" data-testid={`fin-report-tab-${v}`}>{l}</TabsTrigger>
          ))}
        </TabsList>
        <div className="mt-6">
          <TabsContent value="company"><Company params={params} /></TabsContent>
          <TabsContent value="pl"><ProfitLoss params={params} /></TabsContent>
          <TabsContent value="bs"><BalanceSheet params={params} /></TabsContent>
          <TabsContent value="cf"><CashFlow params={params} /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
