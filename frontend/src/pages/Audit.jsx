import { useEffect, useState, Fragment } from "react";
import { Search, ChevronDown } from "lucide-react";
import { PageHeader, Pager, Loading, Pill } from "@/components/kit";
import { api } from "@/lib/api";
import { tglJam } from "@/lib/format";

const ACTION_STYLE = { create: "bg-[#cddcf3]", update: "bg-[#e0ecff] text-[#0f52ba]", delete: "bg-red-100 text-red-700", login: "bg-slate-100", login_failed: "bg-amber-100 text-amber-800", close: "bg-[#12151c] text-white", convert: "bg-[#12151c] text-white", allocate: "bg-violet-100 text-violet-800" };

export default function Audit() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [module, setModule] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  useEffect(() => { api.get("/audit", { params: { q, module, page } }).then(({ data }) => setData(data)); }, [q, module, page]);

  return (
    <div className="p-5 sm:p-8 lg:p-10" data-testid="audit-page">
      <PageHeader eyebrow="Keamanan" title="Audit trail" desc="Setiap perubahan data tercatat: siapa, kapan, apa, beserta nilai sebelum dan sesudah." />
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex items-center bg-[#eef1f5] rounded-full h-10 px-4 w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Cari aktivitas atau email…" className="bg-transparent outline-none text-sm ml-2 flex-1" data-testid="audit-search-input" />
        </div>
        <Pill active={!module} onClick={() => { setModule(""); setPage(1); }} testId="audit-module-all">Semua</Pill>
        {data?.modules.map((m) => <Pill key={m} active={module === m} onClick={() => { setModule(m); setPage(1); }} testId={`audit-module-${m}`}>{m}</Pill>)}
      </div>
      {!data ? <Loading /> : (
        <div className="rounded-[24px] border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm" data-testid="audit-table">
            <thead className="bg-[#f8fafc] text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Waktu</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Aksi</th><th className="px-4 py-3">Modul</th><th className="px-4 py-3">Ringkasan</th><th className="px-4 py-3">IP</th><th /></tr></thead>
            <tbody>
              {data.items.map((a) => (
                <Fragment key={a.id}>
                  <tr className="border-t border-slate-100 hover:bg-[#f8fafc] cursor-pointer" onClick={() => setOpen(open === a.id ? null : a.id)} data-testid={`audit-row-${a.id}`}>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">{tglJam(a.created_at)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{a.user_email || "—"}</td>
                    <td className="px-4 py-3"><span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ACTION_STYLE[a.action] || "bg-slate-100"}`}>{a.action}</span></td>
                    <td className="px-4 py-3 text-slate-500">{a.module}</td>
                    <td className="px-4 py-3 min-w-[260px]">{a.summary}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{a.ip || "—"}</td>
                    <td className="px-4 py-3">{(a.before || a.after) && <ChevronDown className={`w-4 h-4 transition-transform ${open === a.id ? "rotate-180" : ""}`} />}</td>
                  </tr>
                  {open === a.id && (a.before || a.after) && (
                    <tr className="bg-[#f8fafc]"><td colSpan={7} className="px-4 py-4">
                      <div className="grid md:grid-cols-2 gap-4 text-xs">
                        <pre className="bg-white rounded-2xl p-3 overflow-auto max-h-64 font-mono-num">{JSON.stringify(a.before, null, 2) || "—"}</pre>
                        <pre className="bg-white rounded-2xl p-3 overflow-auto max-h-64 font-mono-num">{JSON.stringify(a.after, null, 2) || "—"}</pre>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />}
    </div>
  );
}
