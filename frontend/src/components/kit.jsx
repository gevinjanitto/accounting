import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumberInput } from "@/components/NumberInput";

const EYEBROW_ID = {
  "Accounting & Journal": "Akuntansi & Jurnal", "Asset Management": "Manajemen Aset", "Cash & Bank": "Kas & Bank", "Document Management": "Manajemen Dokumen",
  "Financial Forecast": "Proyeksi Keuangan", "Financial Reporting": "Laporan Keuangan", "Fiscal Reporting": "Laporan Fiskal", "Management Reporting": "Laporan Manajemen",
  Payroll: "Penggajian", "Project Costing": "Kalkulasi Biaya Project", "Project Management": "Manajemen Project", "Tax Management": "Manajemen Pajak",
};

export function PageHeader({ eyebrow, title, desc, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div className="mh-rise">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f52ba] mb-2">{EYEBROW_ID[eyebrow] || eyebrow}</p>}
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#12151c]" data-testid="page-title">{title}</h1>
        {desc && <p className="text-slate-500 mt-2 max-w-2xl text-sm sm:text-base">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const STATUS_STYLE = {
  Profitable: "bg-[#dfe9f8] text-[#1f4f8f]",
  "Minimum Price": "bg-amber-100 text-amber-800",
  "Below Target": "bg-orange-100 text-orange-800",
  Loss: "bg-red-100 text-red-700",
  Draft: "bg-slate-100 text-slate-600",
  Estimation: "bg-sky-100 text-sky-800",
  Quotation: "bg-indigo-100 text-indigo-800",
  Approved: "bg-[#e0ecff] text-[#0f52ba]",
  Running: "bg-[#cddcf3] text-[#12151c]",
  "On Hold": "bg-amber-100 text-amber-800",
  Completed: "bg-[#12151c] text-white",
  Cancelled: "bg-red-50 text-red-600",
  Converted: "bg-[#12151c] text-white",
  Unpaid: "bg-amber-100 text-amber-800",
  Partial: "bg-sky-100 text-sky-800",
  Paid: "bg-[#cddcf3] text-[#12151c]",
  Void: "bg-red-50 text-red-600",
  Posted: "bg-[#e0ecff] text-[#0f52ba]",
  Reversed: "bg-slate-100 text-slate-500",
  Open: "bg-[#cddcf3] text-[#12151c]",
  Closed: "bg-[#12151c] text-white",
  Terutang: "bg-amber-100 text-amber-800",
  Disetor: "bg-[#12151c] text-white",
  "Kredit Pajak": "bg-[#cddcf3] text-[#12151c]",
  "Menunggu Bukti Potong": "bg-orange-100 text-orange-800",
  Dikompensasi: "bg-[#e0ecff] text-[#0f52ba]",
  Aktif: "bg-[#cddcf3] text-[#12151c]",
  Dilepas: "bg-slate-100 text-slate-500",
};

const STATUS_ID = {
  Profitable: "Menguntungkan", "Minimum Price": "Harga Minimum", "Below Target": "Di Bawah Target", Loss: "Rugi", Estimation: "Estimasi", Quotation: "Penawaran",
  Approved: "Disetujui", Running: "Berjalan", "On Hold": "Ditunda", Completed: "Selesai", Cancelled: "Dibatalkan", Converted: "Dikonversi",
  Unpaid: "Belum Dibayar", Partial: "Sebagian", Paid: "Lunas", Void: "Batal", Posted: "Diposting", Reversed: "Dibalik", Open: "Terbuka", Closed: "Ditutup",
};
export const statusLabel = (s) => STATUS_ID[s] || s;

export function StatusBadge({ status, className = "", testId }) {
  return (
    <span className={`inline-flex items-center h-7 px-3 rounded-full text-xs font-semibold whitespace-nowrap ${STATUS_STYLE[status] || "bg-slate-100 text-slate-600"} ${className}`} data-testid={testId}>
      {statusLabel(status)}
    </span>
  );
}

export function Pill({ active, onClick, children, testId }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId}
      className={`h-10 px-4 rounded-full text-sm font-medium border transition-colors duration-200 ${active ? "bg-[#cddcf3] border-[#cddcf3] text-[#12151c]" : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"}`}>
      {children}
    </button>
  );
}

export function Panel({ className = "", children, testId }) {
  return <div className={`rounded-[28px] border border-slate-200/80 bg-white p-5 sm:p-6 ${className}`} data-testid={testId}>{children}</div>;
}

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between pt-4 text-sm text-slate-500" data-testid="pager">
      <span>{total} data · hal. {page}/{pages}</span>
      <div className="flex gap-2">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="w-9 h-9 rounded-full border grid place-items-center disabled:opacity-40" data-testid="pager-prev"><ChevronLeft className="w-4 h-4" /></button>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="w-9 h-9 rounded-full border grid place-items-center disabled:opacity-40" data-testid="pager-next"><ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

export function Loading() {
  return <div className="py-20 grid place-items-center text-slate-400" data-testid="loading"><Loader2 className="w-6 h-6 animate-spin" /></div>;
}

export function Empty({ title, desc, action }) {
  return (
    <div className="py-14 flex flex-col items-center text-center" data-testid="empty-state">
      <img src="/assets/mascot-wave.png" alt="" className="h-36 object-contain mb-4 opacity-90" />
      <p className="font-semibold">{title}</p>
      {desc && <p className="text-sm text-slate-500 mt-1 max-w-sm">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export const btnDark = "inline-flex items-center gap-2 h-11 px-5 rounded-full bg-[#12151c] text-white text-sm font-semibold hover:bg-[#0f52ba] transition-colors disabled:opacity-50";
export const btnLight = "inline-flex items-center gap-2 h-11 px-5 rounded-full bg-white border border-slate-200 text-sm font-semibold hover:border-slate-400 transition-colors disabled:opacity-50";
export const inputCls = "rounded-2xl h-11";

// Generic form field: text | number | date | select | bool | textarea | ref
export function Field({ f, value, onChange, refs = {} }) {
  const id = `field-${f.k}`;
  const set = (v) => onChange(f.k, v);
  let control;
  if (f.t === "bool") {
    control = <div className="h-11 flex items-center"><Switch checked={!!value} onCheckedChange={set} data-testid={id} /></div>;
  } else if (f.t === "textarea") {
    control = <Textarea value={value ?? ""} onChange={(e) => set(e.target.value)} required={f.req} rows={f.rows} maxLength={f.max} className={`rounded-2xl ${f.rows ? "min-h-[130px] text-[15px]" : ""}`} data-testid={id} />;
  } else if (f.t === "select" || f.t === "ref") {
    const opts = f.t === "ref" ? (refs[f.ref] || []).map((r) => ({ v: r.id, l: r.code ? `${r.code} · ${r.name}` : r.name })) : f.o.map((o) => (typeof o === "string" ? { v: o, l: o } : o));
    control = (
      <Select value={value || "__none"} onValueChange={(v) => set(v === "__none" ? "" : v)}>
        <SelectTrigger className="rounded-2xl h-11" data-testid={id}><SelectValue placeholder="Pilih…" /></SelectTrigger>
        <SelectContent>
          {!f.req && <SelectItem value="__none">— Tidak ada —</SelectItem>}
          {opts.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  } else if (f.t === "num") {
    control = <NumberInput as={Input} value={value} onChange={set} required={f.req} className={inputCls} data-testid={id} />;
  } else {
    control = <Input type={f.t === "num" ? "number" : f.t || "text"} step="any" value={value ?? ""} onChange={(e) => set(e.target.value)} required={f.req} className={inputCls} data-testid={id} />;
  }
  return (
    <div className={`space-y-1.5 ${f.wide ? "sm:col-span-2" : ""}`}>
      <Label className="text-xs font-semibold text-slate-600">{f.l}{f.req && <span className="text-red-500"> *</span>}</Label>
      {control}
      {f.hint && <p className="text-[11px] text-slate-400">{f.hint}</p>}
    </div>
  );
}
