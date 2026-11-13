import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader, Pill, Loading, StatusBadge } from "@/components/kit";
import { api } from "@/lib/api";
import { rp, pct } from "@/lib/format";
import { ExportMenu } from "@/components/fin";

const COLS = [["contract_value", "Contract value"], ["revenue", "Revenue"], ["direct_cost", "Direct cost"], ["labor_cost", "Labor cost"], ["overhead", "Overhead"], ["hpp", "HPP"], ["gross_profit", "Gross profit"], ["operating_profit", "Operating profit"], ["planned_bonus", "Planned bonus"], ["actual_bonus", "Bonus aktual"], ["internal_reserve", "Internal reserve"], ["distributable", "Distributable"]];
const STATUSES = ["Running", "Approved", "On Hold", "Completed", "Quotation"];

export default function Reports() {
  const [status, setStatus] = useState("");
  const [data, setData] = useState(null);
  useEffect(() => { setData(null); api.get("/reports/projects", { params: { status } }).then(({ data }) => setData(data)); }, [status]);

  return (
    <div className="p-5 sm:p-8 lg:p-10" data-testid="reports-page">
      <PageHeader eyebrow="Financial Reporting" title="Laporan project" desc="Contract value, revenue, direct cost, labor, overhead, HPP, gross & operating profit, bonus, cadangan, dan margin per project."
        actions={data && <ExportMenu name="project-report" build={() => ({ title: "Laporan Project", columns: [{ k: "code", l: "Kode" }, { k: "name", l: "Project" }, { k: "status", l: "Status" }, ...COLS.map(([k, l]) => ({ k, l, t: "rp" })), { k: "margin", l: "Margin", t: "pct" }], rows: [...data.rows, { code: "TOTAL", name: `${data.rows.length} project`, ...data.totals, _total: true }] })} />} />
      <div className="flex flex-wrap gap-2 mb-6">
        <Pill active={!status} onClick={() => setStatus("")} testId="report-filter-all">Semua</Pill>
        {STATUSES.map((s) => <Pill key={s} active={status === s} onClick={() => setStatus(s)} testId={`report-filter-${s}`}>{s}</Pill>)}
      </div>
      {!data ? <Loading /> : (
        <div className="overflow-x-auto rounded-[24px] border border-slate-200 mh-scroll">
          <table className="w-full text-sm" data-testid="report-table">
            <thead className="bg-[#12151c] text-white text-left text-xs uppercase tracking-wider">
              <tr><th className="px-4 py-3 sticky left-0 bg-[#12151c]">Project</th>{COLS.map(([k, l]) => <th key={k} className="px-4 py-3 text-right whitespace-nowrap">{l}</th>)}<th className="px-4 py-3 text-right">Margin</th></tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-[#f8fafc]" data-testid={`report-row-${r.code}`}>
                  <td className="px-4 py-3 sticky left-0 bg-white min-w-[220px]">
                    <Link to={`/projects/${r.id}`} className="font-semibold hover:text-[#0f52ba]">{r.code}</Link>
                    <span className="block text-xs text-slate-500 truncate max-w-[220px]">{r.name}</span>
                    <StatusBadge status={r.status} className="mt-1 !h-6" />
                  </td>
                  {COLS.map(([k]) => <td key={k} className={`px-4 py-3 text-right num whitespace-nowrap ${r[k] < 0 ? "text-red-600" : ""}`}>{rp(r[k])}</td>)}
                  <td className={`px-4 py-3 text-right font-bold ${r.margin < r.target_margin ? "text-amber-600" : "text-[#1f4f8f]"}`}>{pct(r.margin)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-[#12151c] bg-[#cddcf3] font-bold" data-testid="report-totals">
                <td className="px-4 py-3 sticky left-0 bg-[#cddcf3]">Total ({data.rows.length})</td>
                {COLS.map(([k]) => <td key={k} className="px-4 py-3 text-right num whitespace-nowrap">{rp(data.totals[k])}</td>)}
                <td className="px-4 py-3 text-right">{pct(data.totals.margin)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500 mt-3">Laporan project memakai alokasi untuk analisis manajemen; konsolidasi perusahaan (menu Laporan Keuangan) menghitung biaya aktual hanya satu kali.</p>
    </div>
  );
}
