import { useState } from "react";
import { Download, FileSpreadsheet, FileText, FileDown } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, btnDark, btnLight } from "@/components/kit";
import { exportData } from "@/lib/exporter";
import { errMsg } from "@/lib/api";

export function ExportMenu({ name, build }) {
  const run = async (fmt) => {
    try { await exportData(fmt, build()); } catch (e) { toast.error(`Export gagal: ${e.message}`); }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={btnLight} data-testid={`export-${name}-button`}><Download className="w-4 h-4" />Export</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-2xl w-44">
        <DropdownMenuItem onClick={() => run("pdf")} data-testid={`export-${name}-pdf`}><FileText className="w-4 h-4 mr-2" />PDF</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("xlsx")} data-testid={`export-${name}-xlsx`}><FileSpreadsheet className="w-4 h-4 mr-2" />Excel (.xlsx)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("csv")} data-testid={`export-${name}-csv`}><FileDown className="w-4 h-4 mr-2" />CSV</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Stat({ label, value, sub, tone = "light", testId }) {
  const cls = { light: "bg-[#f4f6f9]", blue: "bg-[#cddcf3]", dark: "bg-[#12151c] text-white", brand: "bg-[#0f52ba] text-white" }[tone];
  const muted = tone === "dark" || tone === "brand" ? "text-white/70" : "text-slate-500";
  return (
    <div className={`rounded-[24px] p-5 ${cls}`} data-testid={testId}>
      <p className={`text-xs ${muted}`}>{label}</p>
      <p className="text-2xl font-extrabold num mt-1 tracking-tight">{value}</p>
      {sub && <p className={`text-xs mt-1 ${muted}`}>{sub}</p>}
    </div>
  );
}

export function DataTable({ cols, rows, empty = "Belum ada data.", testId, foot }) {
  return (
    <div className="overflow-x-auto rounded-[24px] border border-slate-200 mh-scroll" data-testid={testId}>
      <table className="w-full text-sm">
        <thead className="bg-[#f8fafc] text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>{cols.map((c, i) => <th key={i} className={`px-4 py-3 font-semibold whitespace-nowrap ${c.r ? "text-right" : ""}`}>{c.l}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={cols.length} className="px-4 py-10 text-center text-slate-500">{empty}</td></tr>}
          {rows.map((r, i) => (
            <tr key={r.key ?? i} className="border-t border-slate-100 hover:bg-[#f8fafc] transition-colors" data-testid={r.testId}>
              {r.cells.map((c, j) => <td key={j} className={`px-4 py-3 whitespace-nowrap ${cols[j]?.r ? "text-right num" : ""}`}>{c}</td>)}
            </tr>
          ))}
          {foot && <tr className="border-t-2 border-[#12151c] bg-[#cddcf3] font-bold">{foot.map((c, j) => <td key={j} className={`px-4 py-3 whitespace-nowrap ${cols[j]?.r ? "text-right num" : ""}`}>{c}</td>)}</tr>}
        </tbody>
      </table>
    </div>
  );
}

export function FormDialog({ open, onClose, title, desc, children, onSubmit, submitLabel = "Simpan", wide, testId }) {
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await onSubmit(); } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={`rounded-[28px] max-h-[92vh] overflow-y-auto ${wide ? "max-w-3xl" : "max-w-lg"}`} data-testid={testId}>
        <DialogHeader><DialogTitle>{title}</DialogTitle>{desc && <DialogDescription>{desc}</DialogDescription>}</DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {children}
          <button type="submit" disabled={busy} className={`${btnDark} w-full justify-center`} data-testid={`${testId}-submit`}>{busy ? "Menyimpan…" : submitLabel}</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReasonDialog({ open, onClose, title, desc, onConfirm, testId = "reason-dialog" }) {
  const [reason, setReason] = useState("");
  return (
    <FormDialog open={open} onClose={onClose} title={title} desc={desc} testId={testId} submitLabel="Konfirmasi"
      onSubmit={async () => { await onConfirm(reason); setReason(""); onClose(); }}>
      <Field f={{ k: "reason", l: "Alasan", t: "textarea", req: true }} value={reason} onChange={(_, v) => setReason(v)} />
    </FormDialog>
  );
}

export function Grid({ children }) {
  return <div className="grid sm:grid-cols-2 gap-4">{children}</div>;
}

export const useForm = (init) => {
  const [f, setF] = useState(init);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  return [f, set, setF];
};

export const TAX_CLASSES = ["Jasa (PPN + PPh 23)", "Jasa (PPN saja)", "PPN Masukan", "PPh Final", "Non-PPN", "Bukan objek pajak"];
