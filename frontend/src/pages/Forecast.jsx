import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { PageHeader, Loading, Field } from "@/components/kit";
import { DataTable, Stat, ExportMenu } from "@/components/fin";
import { api } from "@/lib/api";
import { rp, rpShort, bulan } from "@/lib/format";

function Chart({ rows }) {
  const max = Math.max(...rows.map((r) => Math.max(r.inflow, r.outflow, Math.abs(r.closing))), 1);
  return (
    <div className="rounded-[30px] bg-[#cddcf3] p-6 mh-grain" data-testid="forecast-chart">
      <div className="flex flex-wrap items-center gap-4 mb-5 text-xs">
        <span className="flex items-center gap-2"><i className="w-3 h-3 rounded bg-[#0f52ba]" />Kas masuk</span>
        <span className="flex items-center gap-2"><i className="w-3 h-3 rounded bg-[#12151c]" />Kas keluar</span>
        <span className="flex items-center gap-2"><i className="w-3 h-3 rounded-full border-2 border-[#12151c] bg-white" />Saldo akhir</span>
      </div>
      <div className="flex items-end gap-4 h-56">
        {rows.map((r, i) => (
          <div key={r.month} className="flex-1 flex flex-col items-center gap-2 h-full" title={`${bulan(r.month)} · saldo ${rp(r.closing)}`}>
            <span className={`text-[11px] font-bold num ${r.closing < 0 ? "text-red-600" : ""}`}>{rpShort(r.closing)}</span>
            <div className="flex-1 w-full flex items-end justify-center gap-1.5">
              {[[r.inflow, "#0f52ba"], [r.outflow, "#12151c"]].map(([v, c], k) => (
                <motion.span key={k} initial={{ height: 0 }} animate={{ height: `${Math.max((v / max) * 100, 2)}%` }} transition={{ delay: i * 0.06 + k * 0.04, duration: 0.6 }}
                  className="w-full max-w-[26px] rounded-xl" style={{ background: c }} />
              ))}
            </div>
            <span className="text-[11px] text-slate-600">{bulan(r.month)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Forecast() {
  const [p, setP] = useState({ months: 6, revenue_change_pct: 0, expense_change_pct: 0, collection_pct: 100 });
  const [d, setD] = useState(null);
  useEffect(() => { const t = setTimeout(() => api.get("/forecast", { params: p }).then(({ data }) => setD(data)), 300); return () => clearTimeout(t); }, [p]);
  const set = (k, v) => setP((x) => ({ ...x, [k]: Number(v) || 0 }));
  const exportBuild = () => ({ title: "Financial Forecast", subtitle: `${p.months} bulan · pendapatan ${p.revenue_change_pct}% · biaya ${p.expense_change_pct}% · penagihan ${p.collection_pct}%`,
    columns: [{ k: "month", l: "Bulan" }, { k: "opening", l: "Saldo awal", t: "rp" }, { k: "inflow", l: "Kas masuk", t: "rp" }, { k: "outflow", l: "Kas keluar", t: "rp" }, { k: "net", l: "Arus bersih", t: "rp" }, { k: "closing", l: "Saldo akhir", t: "rp" }, { k: "revenue", l: "Proyeksi pendapatan", t: "rp" }], rows: d?.rows || [] });
  return (
    <div className="p-5 sm:p-8 lg:p-10" data-testid="forecast-page">
      <PageHeader eyebrow="Financial Forecast" title="Proyeksi keuangan" desc="Proyeksi arus kas dari saldo bank saat ini, piutang jatuh tempo, sisa kontrak project berjalan, rata-rata biaya, gaji, dan kewajiban pajak."
        actions={d && <ExportMenu name="forecast" build={exportBuild} />} />
      <div className="rounded-[28px] bg-[#f4f6f9] p-5 mb-6 grid sm:grid-cols-2 xl:grid-cols-4 gap-3" data-testid="forecast-assumptions">
        <Field f={{ k: "months", l: "Horizon (bulan, maks 24)", t: "num" }} value={p.months} onChange={set} />
        <Field f={{ k: "revenue_change_pct", l: "Perubahan sisa kontrak (%)", t: "num" }} value={p.revenue_change_pct} onChange={set} />
        <Field f={{ k: "expense_change_pct", l: "Perubahan biaya operasional (%)", t: "num" }} value={p.expense_change_pct} onChange={set} />
        <Field f={{ k: "collection_pct", l: "Tingkat penagihan (%)", t: "num" }} value={p.collection_pct} onChange={set} />
      </div>
      {!d ? <Loading /> : (
        <div className="space-y-6">
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Stat label="Saldo kas & bank saat ini" value={rp(d.opening_balance)} testId="forecast-opening" />
            <Stat tone="blue" label={`Saldo akhir proyeksi (${d.rows.length} bln)`} value={rp(d.closing_balance)} testId="forecast-closing" />
            <Stat tone="dark" label="Saldo terendah" value={rp(d.min_balance)} testId="forecast-min" />
            <Stat tone="brand" label="Biaya rata-rata + gaji / bulan" value={rp(d.assumptions.avg_monthly_expense + d.assumptions.monthly_payroll)} sub={`Gaji dari ${d.assumptions.payroll_basis}`} />
          </div>
          {d.deficit_months.length > 0 && <p className="flex items-center gap-2 text-sm text-red-700 bg-red-50 rounded-2xl px-4 py-3" data-testid="forecast-deficit-alert"><AlertTriangle className="w-4 h-4" />Saldo diproyeksikan negatif pada {d.deficit_months.map(bulan).join(", ")}.</p>}
          <Chart rows={d.rows} />
          <DataTable testId="forecast-table" cols={[{ l: "Bulan" }, { l: "Saldo awal", r: true }, { l: "Kas masuk", r: true }, { l: "Kas keluar", r: true }, { l: "Saldo akhir", r: true }, { l: "Rincian" }]}
            rows={d.rows.map((r) => ({ key: r.month, cells: [<b>{bulan(r.month)}</b>, rp(r.opening), <span className="text-[#0f52ba]">{rp(r.inflow)}</span>, rp(r.outflow), <b className={r.closing < 0 ? "text-red-600" : ""}>{rp(r.closing)}</b>,
              <div className="text-[11px] text-slate-500 max-w-[360px] whitespace-normal">{[...Object.entries(r.inflow_detail).map(([k, v]) => `+ ${k} ${rpShort(v)}`), ...Object.entries(r.outflow_detail).map(([k, v]) => `− ${k} ${rpShort(v)}`)].join(" · ")}</div>] }))} />
          <p className="text-xs text-slate-500">Asumsi: sisa kontrak (DPP) dibagi rata sampai tanggal selesai project; biaya rata-rata dari 3 bulan terakhir (tanpa pembelian aset); PPN kurang bayar disetor bulan berikutnya.</p>
        </div>
      )}
    </div>
  );
}
