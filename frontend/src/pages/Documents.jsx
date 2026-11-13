import { useEffect, useState, useCallback } from "react";
import { Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, Pill, Pager, Loading, Field, btnDark } from "@/components/kit";
import { DocList, UploadForm, DOC_TYPES } from "@/components/Documents";
import { api } from "@/lib/api";

const LINKS = [["", "Tanpa tautan"], ["project", "Project"], ["income", "Pemasukan"], ["expense", "Pengeluaran"]];
const SOURCES = { project: ["/projects", (x) => `${x.code} · ${x.name}`], income: ["/incomes", (x) => `${x.number} · ${x.invoice_number || x.description || ""}`], expense: ["/expenses", (x) => `${x.number} · ${x.description}`] };

function UploadDialog({ open, onClose, onDone }) {
  const [lt, setLt] = useState("");
  const [lid, setLid] = useState("");
  const [opts, setOpts] = useState([]);
  useEffect(() => {
    setLid(""); setOpts([]);
    if (lt) api.get(SOURCES[lt][0], { params: { page_size: 200 } }).then(({ data }) => setOpts(data.items.map((x) => ({ v: x.id, l: SOURCES[lt][1](x) }))));
  }, [lt]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-[28px] max-w-lg" data-testid="document-upload-dialog">
        <DialogHeader><DialogTitle>Unggah dokumen</DialogTitle><DialogDescription>Tautkan ke project atau transaksi agar bukti mudah ditelusuri.</DialogDescription></DialogHeader>
        <UploadForm linkedType={lt} linkedId={lid} onDone={() => { onDone(); onClose(); }}
          extra={<div className="grid grid-cols-2 gap-3">
            <Field f={{ k: "lt", l: "Tautkan ke", t: "select", o: LINKS.slice(1).map(([v, l]) => ({ v, l })) }} value={lt} onChange={(_, v) => setLt(v)} />
            {lt && <Field f={{ k: "lid", l: "Pilih data", t: "select", o: opts }} value={lid} onChange={(_, v) => setLid(v)} />}
          </div>} />
      </DialogContent>
    </Dialog>
  );
}

export default function Documents() {
  const [type, setType] = useState("");
  const [lt, setLt] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [upload, setUpload] = useState(false);
  const load = useCallback(() => api.get("/documents", { params: { doc_type: type, linked_type: lt, q, page } }).then(({ data }) => setData(data)), [type, lt, q, page]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="p-5 sm:p-8 lg:p-10" data-testid="documents-page">
      <PageHeader eyebrow="Document Management" title="Dokumen" desc="Kontrak, SPK, invoice, kwitansi, bukti transfer, dan nota pembelian. Format PDF, JPG, PNG, XLSX hingga 10 MB."
        actions={<button className={btnDark} onClick={() => setUpload(true)} data-testid="document-add-button"><Upload className="w-4 h-4" />Unggah dokumen</button>} />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {["", ...DOC_TYPES].map((t) => <Pill key={t || "all"} active={type === t} onClick={() => { setType(t); setPage(1); }} testId={`doc-type-${t || "all"}`}>{t || "Semua jenis"}</Pill>)}
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {[["", "Semua tautan"], ...LINKS.slice(1)].map(([v, l]) => <Pill key={l} active={lt === v} onClick={() => { setLt(v); setPage(1); }} testId={`doc-link-${v || "all"}`}>{l}</Pill>)}
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Cari nama file / keterangan" className="ml-auto h-10 px-4 rounded-full border border-slate-200 text-sm outline-none focus:border-[#0f52ba] w-64" data-testid="document-search-input" />
      </div>
      {!data ? <Loading /> : <><DocList docs={data.items} onChanged={load} /><Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} /></>}
      <UploadDialog open={upload} onClose={() => setUpload(false)} onDone={load} />
    </div>
  );
}
