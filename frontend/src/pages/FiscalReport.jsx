import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Receipt } from "lucide-react";
import { PageHeader, Loading, Field, btnDark } from "@/components/kit";
import { DataTable, Stat, ExportMenu } from "@/components/fin";
import { TaxRecordForm } from "@/pages/Tax";
import { api } from "@/lib/api";
import { rp, pct, bulan } from "@/lib/format";

const Line = ({ l, v, bold, neg }) => (
  <div className={`flex justify-between gap-4 py-2 border-t border-slate-100 text-sm ${bold ? "font-bold" : ""}`}><span>{l}</span><span className={`num ${neg ? "text-red-600" : ""}`}>{rp(v)}</span></div>
);

export default function FiscalReport() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [d, setD] = useState(null);
  const [accrue, setAccrue] = useState(false);
  const load = () => { setD(null); api.get("/tax/fiscal-report", { params: { year } }).then(({ data }) => setD(data)); };
  useEffect(load, [year]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = d?.management, fi = d?.fiscal;
  const compare = d ? [
    ["Pendapatan / penghasilan bruto", m.revenue, fi.income_non_final, "Penghasilan PPh Final dikeluarkan dari PKP"],
    ["Biaya", m.expense - m.tax_expense, fi.deductible, "Fiskal: hanya biaya deductible"],
    ["Biaya tidak dapat dikurangkan", 0, fi.non_deductible, "Koreksi positif beda tetap"],
    ["Beda waktu", 0, fi.temporary, "Koreksi positif beda waktu"],
    ["Laba sebelum pajak / PKP", m.profit_before_tax, fi.pkp, "PKP dibulatkan ke ribuan ke bawah"],
  ] : [];
  const exportBuild = () => ({
    title: `Laporan Fiskal ${year}`, subtitle: "Rekonsiliasi laba komersial ke penghasilan kena pajak", columns: [{ k: "l", l: "Uraian" }, { k: "v", l: "Nominal", t: "rp" }],
    rows: [["Laba komersial sebelum pajak", m.profit_before_tax], ["Koreksi fiskal positif", fi.positive_corrections], ["Koreksi fiskal negatif", -fi.negative_corrections], ["Penghasilan kena pajak (PKP)", fi.pkp],
      ["PKP mendapat fasilitas Pasal 31E", fi.facility_31e_pkp], ["PPh Badan terutang", fi.pph_badan], ["Kredit PPh 23", -fi.credit_pph23], ["Kredit PPh 25", -fi.credit_pph25], ["PPh 29 kurang (lebih) bayar", fi.pph29],
      ...d.corrections.map((c) => [`Koreksi ${c.direction.toLowerCase()}: ${c.description}`, c.direction === "Positif" ? c.amount : -c.amount]),
      ...d.monthly.flatMap((r) => d.kinds.filter((k) => r[k]).map((k) => [`Rekap ${bulan(r.period)} · ${k}`, r[k]]))].map(([l, v]) => ({ l, v })),
  });
  return (
    <div className="p-5 sm:p-8 lg:p-10" data-testid="fiscal-report-page">
      <PageHeader eyebrow="Fiscal Reporting" title="Laporan fiskal" desc="Laporan manajemen vs fiskal, koreksi positif/negatif, penghasilan kena pajak, kredit pajak, serta rekap PPN dan PPh dari transaksi posted."
        actions={d && <><ExportMenu name="fiscal" build={exportBuild} /><button className={btnDark} onClick={() => setAccrue(true)} data-testid="fiscal-accrue-button"><Receipt className="w-4 h-4" />Catat PPh Badan</button></>} />
      <div className="w-36 mb-6"><Field f={{ k: "year", l: "Tahun pajak", t: "num" }} value={year} onChange={(_, v) => setYear(Number(v) || new Date().getFullYear())} /></div>
      {!d ? <Loading /> : (
        <div className="space-y-8">
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Stat tone="blue" label="Laba komersial sebelum pajak" value={rp(m.profit_before_tax)} testId="fiscal-commercial" />
            <Stat label="Penghasilan kena pajak (PKP)" value={rp(fi.pkp)} sub={`Koreksi +${rp(fi.positive_corrections)} / −${rp(fi.negative_corrections)}`} testId="fiscal-pkp" />
            <Stat tone="dark" label="PPh Badan terutang" value={rp(fi.pph_badan)} sub={`Tarif ${pct(fi.rate)} · fasilitas 31E atas ${rp(fi.facility_31e_pkp)}`} testId="fiscal-pph-badan" />
            <Stat tone="brand" label={fi.pph29 >= 0 ? "PPh 29 kurang bayar" : "PPh lebih bayar"} value={rp(Math.abs(fi.pph29))} sub={`Kredit PPh 23 ${rp(fi.credit_pph23)} · PPh 25 ${rp(fi.credit_pph25)}`} testId="fiscal-pph29" />
          </div>
          <div className="grid xl:grid-cols-[1.3fr_1fr] gap-6">
            <DataTable testId="fiscal-compare-table" cols={[{ l: "Pos" }, { l: "Laporan manajemen", r: true }, { l: "Laporan fiskal", r: true }, { l: "Catatan" }]}
              rows={compare.map(([l, a, b, n]) => ({ key: l, cells: [l, rp(a), <b>{rp(b)}</b>, <span className="text-xs text-slate-500">{n}</span>] }))} />
            <div className="rounded-[28px] border-2 border-[#12151c] p-5" data-testid="fiscal-reconciliation">
              <p className="font-semibold mb-1">Rekonsiliasi fiskal</p>
              <Line l="Laba komersial sebelum pajak" v={m.profit_before_tax} />
              <Line l="(+) Koreksi fiskal positif" v={fi.positive_corrections} />
              <Line l="(−) Koreksi fiskal negatif" v={-fi.negative_corrections} neg />
              <Line l="Penghasilan kena pajak" v={fi.pkp} bold />
              <Line l="PPh Badan terutang" v={fi.pph_badan} />
              <Line l="(−) Kredit PPh 23 dipotong customer" v={-fi.credit_pph23} neg />
              <Line l="(−) Angsuran PPh 25" v={-fi.credit_pph25} neg />
              <Line l="PPh 29 kurang (lebih) bayar" v={fi.pph29} bold />
              {fi.requires_review > 0 && <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-2xl p-3">{rp(fi.requires_review)} biaya berstatus "Requires Review" belum dikoreksi.</p>}
            </div>
          </div>
          <div>
            <p className="font-semibold mb-2">Koreksi fiskal yang dihitung</p>
            <DataTable testId="fiscal-corrections-table" empty="Tidak ada koreksi fiskal pada tahun ini." cols={[{ l: "Tanggal" }, { l: "Uraian" }, { l: "Arah" }, { l: "Kategori" }, { l: "Nominal", r: true }]}
              rows={d.corrections.map((c) => ({ key: c.id, cells: [c.date, c.description, c.direction, c.category, rp(c.amount)] }))} />
          </div>
          <div>
            <p className="font-semibold mb-2">Rekap PPN & PPh per masa</p>
            <DataTable testId="fiscal-monthly-table" empty="Belum ada catatan pajak." cols={[{ l: "Masa" }, ...d.kinds.map((k) => ({ l: k, r: true }))]}
              rows={d.monthly.map((r) => ({ key: r.period, cells: [bulan(r.period), ...d.kinds.map((k) => (r[k] ? rp(r[k]) : "—"))] }))} />
          </div>
          <p className="text-xs text-slate-500">Pemisahan laporan tidak menghilangkan transaksi yang secara hukum merupakan pendapatan CV. Klasifikasi pajak mengikuti substansi transaksi dan aturan pajak yang berlaku (menu Pajak → Aturan pajak).</p>
        </div>
      )}
      <TaxRecordForm open={accrue} onClose={() => setAccrue(false)} onSaved={() => { toast.info("PPh Badan tercatat sebagai beban & utang pajak"); load(); }}
        preset={{ kind: "PPh Badan (PPh 29)", date: `${year}-12-31`, dpp: fi?.pkp || "", amount: fi ? Math.max(fi.pph29, 0) : "", description: `PPh Badan tahun ${year}` }} />
    </div>
  );
}
