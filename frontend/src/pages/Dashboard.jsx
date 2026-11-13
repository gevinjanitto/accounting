import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FolderKanban, Wallet, AlertTriangle, TrendingDown, ArrowUpRight, Plus, Calculator, Receipt, FileWarning, Landmark } from "lucide-react";
import { api } from "@/lib/api";
import { rp, rpShort, pct, bulan } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { Loading, StatusBadge, Pill } from "@/components/kit";
import MascotTilt from "@/components/MascotTilt";
import { Stat } from "@/components/fin";

const COSTS = [["gaji", "Gaji", "#cddcf3"], ["operasional", "Operasional", "#d9d2f5"], ["server", "Server", "#12151c"], ["freelancer", "Freelancer", "#cddcf3"], ["bonus", "Bonus", "#d9d2f5"], ["lainnya", "Lainnya", "#e0ecff"]];

function HeadStat({ icon: Icon, label, value, testId }) {
  return (
    <div className="flex items-center gap-3" data-testid={testId}>
      <span className="w-12 h-12 rounded-full border-2 border-[#12151c] grid place-items-center"><Icon className="w-5 h-5" /></span>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-2xl font-extrabold tracking-tight num">{value}</p>
      </div>
    </div>
  );
}

function ActivityChart({ data, summary }) {
  const max = Math.max(...data.map((d) => d.amount), 1);
  return (
    <div className="rounded-[30px] bg-[#cddcf3] p-6 mh-grain relative overflow-hidden" data-testid="cost-activity-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-semibold">Aktivitas biaya project</h3>
          <p className="text-sm text-slate-600">Biaya langsung + timesheet per bulan</p>
        </div>
        <div className="flex gap-2">
          <div className="bg-white/70 rounded-2xl px-4 py-2"><p className="text-[11px] text-slate-500">Total HPP</p><p className="font-bold num" data-testid="dash-total-hpp">{rpShort(summary.total_hpp)}</p></div>
          <div className="bg-white/70 rounded-2xl px-4 py-2"><p className="text-[11px] text-slate-500">Estimasi profit</p><p className="font-bold num" data-testid="dash-est-profit">{rpShort(summary.estimated_profit)}</p></div>
        </div>
      </div>
      <div className="mt-6 flex items-end gap-3 h-52">
        {data.length === 0 && <p className="text-sm text-slate-600">Belum ada biaya tercatat.</p>}
        {data.map((d, i) => {
          const blocks = Math.max(1, Math.round((d.amount / max) * 5));
          const peak = d.amount === max;
          return (
            <div key={d.month} className="flex-1 flex flex-col items-center gap-1.5 group" title={rp(d.amount)}>
              <span className="text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity num">{rpShort(d.amount)}</span>
              {Array.from({ length: 5 - blocks }).map((_, k) => <span key={`e${k}`} className="w-full max-w-[56px] h-8 rounded-xl mh-hatch" />)}
              {Array.from({ length: blocks }).map((_, k) => (
                <span key={k} className="w-full max-w-[56px] h-8 rounded-xl mh-grow" style={{ background: peak && k === 0 ? "#12151c" : k === 0 ? "#5d6670" : "#9aa5a2", animationDelay: `${i * 80 + k * 40}ms` }} />
              ))}
              <span className="text-[11px] text-slate-600 mt-1">{bulan(d.month)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CostBars({ cost }) {
  const total = Object.values(cost).reduce((a, b) => a + b, 0) || 1;
  return (
    <div data-testid="cost-summary-card">
      <h3 className="text-2xl font-semibold">Ringkasan biaya</h3>
      <p className="text-xs text-slate-500 mb-4">Realisasi seluruh project berjalan & selesai</p>
      <div className="flex gap-3 h-48">
        {COSTS.map(([k, l, c], i) => {
          const p = ((cost[k] || 0) / total) * 100;
          return (
            <div key={k} className="flex-1 flex flex-col items-center gap-2" title={`${l}: ${rp(cost[k] || 0)}`} data-testid={`cost-bar-${k}`}>
              <div className="relative flex-1 w-full max-w-[44px] rounded-full bg-slate-100 overflow-hidden">
                <motion.div initial={{ height: 0 }} animate={{ height: `${Math.max(p, 6)}%` }} transition={{ delay: i * 0.08, duration: 0.8 }} className="absolute bottom-0 inset-x-0 rounded-full flex items-start justify-center pt-2" style={{ background: c }}>
                  <span className={`text-[10px] font-bold ${c === "#12151c" ? "text-white" : ""}`}>{Math.round(p)}%</span>
                </motion.div>
              </div>
              <span className="text-[11px] text-slate-600">{l}</span>
              <span className="text-[11px] font-semibold num">{rpShort(cost[k] || 0)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MarginCard({ s }) {
  return (
    <div className="space-y-3" data-testid="margin-card">
      <h3 className="text-2xl font-semibold">Profitabilitas</h3>
      <div className="rounded-[26px] bg-[#cddcf3] p-5">
        <p className="text-sm font-semibold">Margin berjalan</p>
        <p className="text-4xl font-extrabold num mt-1" data-testid="dash-margin">{pct(s.margin)}</p>
        <p className="text-xs text-slate-600 mt-1">Estimasi surplus {rpShort(s.current_profit)} dari kontrak {rpShort(s.total_contract)}</p>
      </div>
      <div className="rounded-[26px] bg-[#12151c] text-white p-5 relative overflow-hidden">
        <div className="absolute inset-x-0 bottom-0 h-16 flex items-end gap-[3px] px-4 opacity-40">
          {Array.from({ length: 46 }).map((_, i) => <span key={i} className="flex-1 bg-white rounded-t" style={{ height: `${25 + Math.abs(Math.sin(i / 3)) * 70}%` }} />)}
        </div>
        <p className="text-sm relative">Realisasi profit (project selesai)</p>
        <p className="text-3xl font-extrabold num relative mt-1" data-testid="dash-realized">{rpShort(s.realized_profit)}</p>
        <p className="text-xs text-white/70 relative">Margin realisasi {pct(s.realized_margin)}</p>
      </div>
    </div>
  );
}

function WelcomeCard({ name }) {
  return (
    <div className="relative rounded-[28px] bg-[#0f52ba] text-white overflow-hidden mh-grain flex items-stretch" data-testid="welcome-card">
      <div className="absolute inset-0 mh-dots opacity-30" />
      <div className="relative p-5 z-10 w-[56%] shrink-0 flex flex-col">
        <p className="text-xs uppercase tracking-[0.2em] text-white/70">Asisten Mai</p>
        <p className="text-lg sm:text-xl font-bold mt-2 leading-snug">Halo {name?.split(" ")[0]}, siap hitung harga penawaran?</p>
        <Link to="/simulator" className="mt-4 self-start inline-flex items-center gap-2 h-10 px-4 rounded-full bg-white text-[#12151c] text-sm font-semibold hover:-translate-y-0.5 transition-transform" data-testid="welcome-open-simulator">
          Buka simulator <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="relative flex-1 min-w-0 pt-3 pr-3">
        <MascotTilt src="/assets/mascot-wave.png" className="w-full h-[230px]" intensity={8} testId="dashboard-mascot" />
      </div>
    </div>
  );
}

function TaxSummary({ t }) {
  return (
    <div className="rounded-[28px] bg-[#12151c] text-white p-6 relative overflow-hidden" data-testid="tax-summary-card">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs uppercase tracking-[0.2em] text-white/60">Indikator pajak</p><p className="text-3xl font-extrabold num mt-1" data-testid="dash-tax-total">{rpShort(t.total)}</p><p className="text-xs text-white/60">Estimasi kewajiban pajak belum disetor</p></div>
        <Link to="/pajak" className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-white text-[#12151c] text-sm font-semibold hover:-translate-y-0.5 transition-transform" data-testid="dash-tax-open">Buka pajak <ArrowUpRight className="w-4 h-4" /></Link>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {t.estimates.map((e) => <span key={e.label} className="px-4 py-2 rounded-full bg-white/10 text-sm" data-testid={`dash-tax-${e.label}`}>{e.label} · <b className="num">{rpShort(e.amount)}</b></span>)}
        {t.alerts.filter((a) => a.type === "tax_due").length > 0 && <span className="px-4 py-2 rounded-full bg-red-500/90 text-sm font-semibold">{t.alerts.filter((a) => a.type === "tax_due").length} mendekati / lewat jatuh tempo</span>}
      </div>
    </div>
  );
}

function FinanceSummary({ f }) {
  return (
    <div data-testid="finance-summary">
      <div className="flex items-end justify-between mb-3">
        <h3 className="text-2xl font-semibold">Ringkasan keuangan</h3>
        <Link to="/laporan-keuangan" className="text-sm font-semibold text-[#0f52ba]" data-testid="finance-summary-report-link">Laporan keuangan →</Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3">
        <Stat tone="blue" label="Total pemasukan" value={rpShort(f.total_income)} testId="fin-total-income" />
        <Stat label="Total pengeluaran" value={rpShort(f.total_expense)} testId="fin-total-expense" />
        <Stat tone="dark" label="Laba" value={rpShort(f.profit)} testId="fin-profit" />
        <Stat tone="brand" label="Saldo bank & kas" value={rpShort(f.bank_balance)} testId="fin-bank-balance" />
        <Stat label="Piutang" value={rpShort(f.receivable)} testId="fin-receivable" />
        <Stat label="Utang" value={rpShort(f.payable)} testId="fin-payable" />
      </div>
    </div>
  );
}

export const ALERT_ICON = { over_budget: [AlertTriangle, "bg-red-100 text-red-600"], low_margin: [TrendingDown, "bg-amber-100 text-amber-700"], unpaid_invoice: [Receipt, "bg-sky-100 text-sky-700"], missing_document: [FileWarning, "bg-slate-200 text-slate-700"], tax_due: [Landmark, "bg-red-100 text-red-600"], tax_doc: [FileWarning, "bg-orange-100 text-orange-700"] };

function RightColumn({ data }) {
  const nav = useNavigate();
  const alerts = [...data.tax.alerts, ...data.alerts, ...data.finance.alerts];
  return (
    <div className="space-y-5">
      <div className="rounded-[28px] border-2 border-[#12151c] p-5" data-testid="alerts-panel">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Peringatan</h3>
          <span className="text-xs text-slate-500">{alerts.length} aktif</span>
        </div>
        <div className="mt-3 space-y-2 max-h-[260px] overflow-y-auto mh-scroll pr-1">
          {alerts.length === 0 && <p className="text-sm text-slate-500 py-4">Semua project dalam budget, invoice lunas, dan bukti lengkap.</p>}
          {alerts.map((a, i) => {
            const [Icon, tone] = ALERT_ICON[a.type] || ALERT_ICON.over_budget;
            return (
              <button key={i} onClick={() => nav(a.link || `/projects/${a.project_id}`)} className="w-full text-left flex gap-3 p-3 rounded-2xl bg-slate-50 hover:bg-[#e0ecff] transition-colors" data-testid={`alert-item-${i}`}>
                <span className={`w-9 h-9 shrink-0 rounded-full grid place-items-center ${tone}`}><Icon className="w-4 h-4" /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{a.message}</span>
                  <span className="block text-xs text-slate-500 truncate">{a.project}{a.type !== "low_margin" && ` · ${a.type === "over_budget" ? "+" : ""}${rpShort(a.amount)}`}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div data-testid="top-projects">
        <div className="flex items-center justify-between mb-3"><h3 className="font-semibold">Project terbesar</h3><Link to="/projects" className="text-xs font-semibold text-[#0f52ba]" data-testid="top-projects-view-all">Lihat semua</Link></div>
        <div className="space-y-2">
          {data.top_projects.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="flex items-center justify-between gap-3 p-3 pl-4 rounded-full border border-slate-200 hover:border-[#12151c] transition-colors" data-testid={`top-project-${p.code}`}>
              <span className="min-w-0"><span className="block text-sm font-semibold truncate">{p.name}</span><span className="block text-[11px] text-slate-500">{rpShort(p.revenue)}</span></span>
              <span className={`shrink-0 text-xs font-bold px-3 h-7 grid place-items-center rounded-full ${p.margin >= p.target_margin ? "bg-[#cddcf3]" : "bg-amber-100 text-amber-800"}`}>{pct(p.margin)}</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="rounded-[28px] bg-[#12151c] text-white p-5" data-testid="quick-sim-card">
        <div className="flex items-center gap-3"><Calculator className="w-5 h-5" /><p className="font-semibold">Penawaran baru?</p></div>
        <p className="text-sm text-white/70 mt-2">Simulasikan harga dasar, kenaikan negosiasi, dan harga minimum sebelum mengirim quotation.</p>
        <Link to="/simulator" className="mt-4 w-full h-11 rounded-full bg-white text-[#12151c] font-semibold text-sm flex items-center justify-center gap-2" data-testid="quick-sim-button"><Plus className="w-4 h-4" />Buat simulasi</Link>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("all");
  useEffect(() => { api.get("/dashboard").then(({ data }) => setData(data)); }, []);
  if (!data) return <Loading />;
  const s = data.project_summary;
  const statuses = Object.entries(data.status_counts);

  return (
    <div className="p-5 sm:p-8 lg:p-10 grid grid-cols-1 2xl:grid-cols-[1fr_340px] xl:grid-cols-[1fr_320px] gap-8" data-testid="dashboard-page">
      <div className="min-w-0 space-y-8">
        <div className="flex flex-wrap items-center gap-x-12 gap-y-5 mh-rise">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-none">Ringkasan<br className="hidden sm:block" /> project</h1>
          <HeadStat icon={FolderKanban} label="Project aktif / selesai" value={`${s.active} / ${s.completed}`} testId="dash-active-projects" />
          <HeadStat icon={Wallet} label="Total nilai kontrak" value={rpShort(s.total_contract)} testId="dash-total-contract" />
        </div>
        <FinanceSummary f={data.finance.summary} />
        <TaxSummary t={data.tax} />
        <div className="flex flex-wrap gap-2">
          <Pill active={tab === "all"} onClick={() => setTab("all")} testId="dash-tab-all">Semua</Pill>
          {statuses.map(([st, c]) => <Pill key={st} active={tab === st} onClick={() => setTab(st)} testId={`dash-tab-${st}`}>{st} · {c}</Pill>)}
        </div>
        {tab !== "all" ? (
          <div className="rounded-[28px] border border-slate-200 p-6" data-testid="dash-status-filter-view">
            <p className="text-sm text-slate-500 mb-3">Project berstatus <StatusBadge status={tab} /></p>
            <Link to={`/projects?status=${encodeURIComponent(tab)}`} className="text-sm font-semibold text-[#0f52ba]">Buka daftar project {tab} →</Link>
          </div>
        ) : (
          <ActivityChart data={data.monthly_costs} summary={s} />
        )}
        <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-8">
          <CostBars cost={data.cost_summary} />
          <MarginCard s={s} />
          <div className="md:col-span-2 2xl:col-span-1"><h3 className="text-2xl font-semibold mb-3">Sapaan</h3><WelcomeCard name={user?.name} /></div>
        </div>
      </div>
      <RightColumn data={data} />
    </div>
  );
}
