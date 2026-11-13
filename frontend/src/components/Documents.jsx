import { useEffect, useState, useCallback } from "react";
import { Upload, Eye, Download, Trash2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, btnDark } from "@/components/kit";
import { api, errMsg } from "@/lib/api";
import { tglJam } from "@/lib/format";

export const DOC_TYPES = ["Kontrak", "SPK", "Invoice", "Kwitansi", "Bukti Transfer", "Nota Pembelian", "Dokumen Pendukung", "Faktur Pajak", "Bukti Potong", "Bukti Setor"];
export const ACCEPT = ".pdf,.jpg,.jpeg,.png,.xlsx";
export const MAX = 10 * 1024 * 1024;

export async function openDoc(d, asDownload = false) {
  try {
    const res = await api.get(`/documents/${d.id}/file`, { responseType: "blob", params: { download: asDownload } });
    const url = URL.createObjectURL(res.data);
    if (asDownload) {
      const a = document.createElement("a");
      a.href = url; a.download = d.original_name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return null;
    }
    return url;
  } catch (err) { toast.error(errMsg(err, "Gagal membuka file")); return null; }
}

export function PreviewDialog({ doc, onClose }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let u;
    if (doc) openDoc(doc).then((x) => { u = x; setUrl(x); });
    return () => { if (u) URL.revokeObjectURL(u); setUrl(null); };
  }, [doc]);
  if (!doc) return null;
  const isImg = doc.mime.startsWith("image/");
  const isPdf = doc.mime === "application/pdf";
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-[28px] max-w-4xl" data-testid="document-preview-dialog">
        <DialogHeader><DialogTitle className="truncate pr-6">{doc.original_name}</DialogTitle><DialogDescription>{doc.doc_type} · {(doc.size / 1024).toFixed(0)} KB</DialogDescription></DialogHeader>
        <div className="rounded-2xl bg-[#f4f6f9] min-h-[300px] grid place-items-center overflow-hidden">
          {!url ? <p className="text-sm text-slate-500">Memuat…</p> : isImg ? <img src={url} alt={doc.original_name} className="max-h-[70vh] object-contain" data-testid="document-preview-image" />
            : isPdf ? <iframe title="preview" src={url} className="w-full h-[70vh]" data-testid="document-preview-pdf" />
              : <p className="text-sm text-slate-500 p-8 text-center">Pratinjau tidak tersedia untuk file Excel. Silakan unduh file.</p>}
        </div>
        <button className={`${btnDark} justify-center`} onClick={() => openDoc(doc, true)} data-testid="document-preview-download"><Download className="w-4 h-4" />Unduh</button>
      </DialogContent>
    </Dialog>
  );
}

export function UploadForm({ linkedType, linkedId, onDone, defaultType = "Dokumen Pendukung", extra }) {
  const [file, setFile] = useState(null);
  const [type, setType] = useState(defaultType);
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!file) return toast.error("Pilih file terlebih dahulu");
    if (file.size > MAX) return toast.error("Ukuran file maksimal 10 MB");
    const fd = new FormData();
    fd.append("file", file); fd.append("doc_type", type); fd.append("description", desc);
    if (linkedType && linkedId) { fd.append("linked_type", linkedType); fd.append("linked_id", linkedId); }
    setBusy(true);
    try { await api.post("/documents", fd); toast.success("Dokumen diunggah"); setFile(null); setDesc(""); e.target.reset(); onDone?.(); }
    catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3" data-testid="document-upload-form">
      {extra}
      <label className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 px-4 py-4 cursor-pointer hover:border-[#0f52ba] transition-colors">
        <Paperclip className="w-5 h-5 text-slate-400" />
        <span className="text-sm text-slate-600 truncate flex-1">{file ? file.name : "Pilih file PDF, JPG, PNG, atau XLSX (maks. 10 MB)"}</span>
        <input type="file" accept={ACCEPT} className="hidden" onChange={(e) => setFile(e.target.files[0] || null)} data-testid="document-file-input" />
      </label>
      <Field f={{ k: "doc_type", l: "Jenis dokumen", t: "select", o: DOC_TYPES, req: true }} value={type} onChange={(_, v) => setType(v)} />
      <Field f={{ k: "doc_desc", l: "Keterangan" }} value={desc} onChange={(_, v) => setDesc(v)} />
      <button type="submit" disabled={busy} className={`${btnDark} w-full justify-center`} data-testid="document-upload-submit"><Upload className="w-4 h-4" />{busy ? "Mengunggah…" : "Unggah dokumen"}</button>
    </form>
  );
}

export function DocList({ docs, onChanged }) {
  const [preview, setPreview] = useState(null);
  const del = async (d) => {
    if (!window.confirm(`Hapus dokumen ${d.original_name}?`)) return;
    try { await api.delete(`/documents/${d.id}`); toast.success("Dokumen dihapus"); onChanged?.(); } catch (err) { toast.error(errMsg(err)); }
  };
  if (!docs.length) return <p className="text-sm text-slate-500 py-6 text-center" data-testid="documents-empty">Belum ada dokumen terlampir.</p>;
  return (
    <div className="space-y-2" data-testid="documents-list">
      {docs.map((d) => (
        <div key={d.id} className="flex items-center gap-3 p-3 rounded-2xl bg-[#f4f6f9]" data-testid={`document-item-${d.id}`}>
          <span className="w-10 h-10 shrink-0 rounded-xl bg-white grid place-items-center text-[10px] font-bold uppercase text-[#0f52ba]">{d.original_name.split(".").pop()}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{d.original_name}</p>
            <p className="text-xs text-slate-500 truncate">{d.doc_type}{d.linked_label ? ` · ${d.linked_label}` : ""} · {tglJam(d.created_at)}</p>
          </div>
          <button onClick={() => setPreview(d)} className="p-2 rounded-full hover:bg-white" data-testid={`document-preview-${d.id}`}><Eye className="w-4 h-4" /></button>
          <button onClick={() => openDoc(d, true)} className="p-2 rounded-full hover:bg-white" data-testid={`document-download-${d.id}`}><Download className="w-4 h-4" /></button>
          <button onClick={() => del(d)} className="p-2 rounded-full hover:bg-white text-red-500" data-testid={`document-delete-${d.id}`}><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
      <PreviewDialog doc={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

export function useDocs(params) {
  const [docs, setDocs] = useState([]);
  const key = JSON.stringify(params);
  const load = useCallback(() => api.get("/documents", { params: { ...JSON.parse(key), page_size: 200 } }).then(({ data }) => setDocs(data.items)), [key]);
  useEffect(() => { load(); }, [load]);
  return [docs, load];
}

export function DocsDialog({ target, onClose, onChanged }) {
  const [docs, load] = useDocs(target ? { linked_type: target.type, linked_id: target.id } : { linked_type: "none" });
  if (!target) return null;
  const refresh = () => { load(); onChanged?.(); };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-[28px] max-w-2xl max-h-[92vh] overflow-y-auto" data-testid="docs-dialog">
        <DialogHeader><DialogTitle>Bukti & dokumen {target.label}</DialogTitle><DialogDescription>Lampirkan invoice, kwitansi, bukti transfer, atau nota pembelian.</DialogDescription></DialogHeader>
        <DocList docs={docs} onChanged={refresh} />
        <div className="pt-4 border-t"><UploadForm linkedType={target.type} linkedId={target.id} onDone={refresh} defaultType={target.defaultType} /></div>
      </DialogContent>
    </Dialog>
  );
}
