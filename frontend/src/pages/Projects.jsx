import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Search, AlertTriangle } from "lucide-react";
import { PageHeader, Pill, StatusBadge, Pager, Loading, Empty, btnDark } from "@/components/kit";
import ProjectForm from "@/pages/ProjectForm";
import { api } from "@/lib/api";
import { rpShort, pct, tgl } from "@/lib/format";

const STATUSES = ["Draft", "Estimation", "Quotation", "Approved", "Running", "On Hold", "Completed", "Cancelled"];

function ProjectCard({ p, i }) {
  const s = p.summary;
  const used = s.revenue ? Math.min((s.hpp / s.revenue) * 100, 100) : 0;
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
      <Link to={`/projects/${p.id}`} className="block rounded-[28px] border border-slate-200 p-5 hover:border-[#12151c] hover:-translate-y-1 transition-[transform,border-color] duration-300 bg-white h-full" data-testid={`project-card-${p.code}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-mono-num text-slate-500">{p.code}</p>
            <p className="font-semibold text-lg leading-snug mt-1 line-clamp-2">{p.name}</p>
            <p className="text-xs text-slate-500 mt-1 truncate">{p.customer_name || "Tanpa customer"} · {p.entity_name}</p>
          </div>
          <StatusBadge status={p.status} />
        </div>
        <div className="grid grid-cols-3 gap-2 mt-5">
          <div><p className="text-[11px] text-slate-500">Kontrak</p><p className="font-bold num">{rpShort(s.revenue)}</p></div>
          <div><p className="text-[11px] text-slate-500">HPP</p><p className="font-bold num">{rpShort(s.hpp)}</p></div>
          <div><p className="text-[11px] text-slate-500">Margin</p><p className={`font-bold num ${s.low_margin ? "text-amber-600" : "text-[#1f4f8f]"}`}>{pct(s.margin)}</p></div>
        </div>
        <div className="mt-4 h-2.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-[#0f52ba]" style={{ width: `${used}%` }} /></div>
        <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
          <span>{tgl(p.start_date)} – {tgl(p.end_date)}</span>
          {s.over_budget && <span className="inline-flex items-center gap-1 text-red-600 font-semibold"><AlertTriangle className="w-3.5 h-3.5" />Over budget</span>}
        </div>
      </Link>
    </motion.div>
  );
}

export default function Projects() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [q, setQ] = useState(sp.get("q") || "");
  const [status, setStatus] = useState(sp.get("status") || "");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);

  useEffect(() => { setQ(sp.get("q") || ""); setStatus(sp.get("status") || ""); }, [sp]);
  const load = useCallback(() => {
    api.get("/projects", { params: { q, status, page, page_size: 12 } }).then(({ data }) => setData(data));
  }, [q, status, page]);
  useEffect(() => { load(); }, [load]);

  const pickStatus = (st) => { setPage(1); setSp(st ? { status: st } : {}); };

  return (
    <div className="p-5 sm:p-8 lg:p-10" data-testid="projects-page">
      <PageHeader eyebrow="Project Management" title="Project" desc="Kelola kontrak, budget, biaya aktual, timesheet, dan profitabilitas setiap project."
        actions={<button className={btnDark} onClick={() => setOpen(true)} data-testid="project-add-button"><Plus className="w-4 h-4" />Project baru</button>} />
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="flex items-center bg-[#eef1f5] rounded-full h-10 px-4 w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Cari project…" className="bg-transparent outline-none text-sm ml-2 flex-1" data-testid="projects-search-input" />
        </div>
        <Pill active={!status} onClick={() => pickStatus("")} testId="projects-filter-all">Semua</Pill>
        {STATUSES.map((st) => <Pill key={st} active={status === st} onClick={() => pickStatus(st)} testId={`projects-filter-${st}`}>{st}</Pill>)}
      </div>
      {!data ? <Loading /> : data.items.length === 0 ? (
        <Empty title="Belum ada project" desc="Buat project langsung atau konversi dari Pricing Simulator." action={<button className={btnDark} onClick={() => setOpen(true)}>Project baru</button>} />
      ) : (
        <div className="grid sm:grid-cols-2 2xl:grid-cols-3 gap-5" data-testid="projects-grid">
          {data.items.map((p, i) => <ProjectCard key={p.id} p={p} i={i} />)}
        </div>
      )}
      {data && data.total > 0 && <Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />}
      <ProjectForm open={open} onClose={() => setOpen(false)} onSaved={(p) => nav(`/projects/${p.id}`)} />
    </div>
  );
}
