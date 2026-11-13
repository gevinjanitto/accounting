import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageHeader, Pager, Loading, Empty, Field, btnDark } from "@/components/kit";
import { MASTER } from "@/lib/masterConfig";
import { api, errMsg } from "@/lib/api";
import { rp, n, pct, tgl } from "@/lib/format";

export function useRefs(kinds) {
  const [refs, setRefs] = useState({});
  const key = kinds.join(",");
  useEffect(() => {
    Promise.all(key.split(",").filter(Boolean).map((k) => api.get(`/master/${k}`, { params: { all: true } }).then(({ data }) => [k, data.items])))
      .then((pairs) => setRefs(Object.fromEntries(pairs)));
  }, [key]);
  return refs;
}

function cell(item, [k, , t]) {
  const v = item[k];
  if (t === "rp") return <span className="num">{rp(v)}</span>;
  if (t === "num") return <span className="num">{n(v)}</span>;
  if (t === "pct") return <span className="num">{pct(v)}</span>;
  if (t === "date") return tgl(v);
  if (t === "rate") return <span className="num">{item.productive_hours ? rp(item.monthly_cost / item.productive_hours) : "—"}</span>;
  if (t === "bool") return v ? "Ya" : "Tidak";
  if (t === "active") return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${v ? "bg-[#cddcf3]" : "bg-slate-100 text-slate-500"}`}>{v ? "Aktif" : "Nonaktif"}</span>;
  return v || "—";
}

function RecordDialog({ kind, cfg, open, onClose, record, onSaved }) {
  const refs = useRefs([...new Set(cfg.fields.filter((f) => f.t === "ref").map((f) => f.ref))]);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setForm(record ? { ...record } : { ...cfg.defaults }); }, [open, record, cfg]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = Object.fromEntries(cfg.fields.map((f) => [f.k, form[f.k]]));
      if (record) await api.put(`/master/${kind}/${record.id}`, payload);
      else await api.post(`/master/${kind}`, payload);
      toast.success(`${cfg.label} tersimpan`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-[28px] max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="master-record-dialog">
        <DialogHeader>
          <DialogTitle>{record ? "Ubah" : "Tambah"} {cfg.label}</DialogTitle>
          <DialogDescription>{cfg.desc}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid sm:grid-cols-2 gap-4">
          {cfg.fields.map((f) => <Field key={f.k} f={f} value={form[f.k]} refs={refs} onChange={(k, v) => setForm((s) => ({ ...s, [k]: v }))} />)}
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="h-11 px-5 rounded-full border text-sm font-semibold" data-testid="master-cancel-button">Batal</button>
            <button type="submit" disabled={busy} className={btnDark} data-testid="master-save-button">{busy ? "Menyimpan…" : "Simpan"}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function MasterData() {
  const { kind = "entities" } = useParams();
  const nav = useNavigate();
  const cfg = MASTER[kind] || MASTER.entities;
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState({ open: false, record: null });
  const [del, setDel] = useState(null);

  const load = useCallback(() => {
    api.get(`/master/${kind}`, { params: { q, page, page_size: 15 } }).then(({ data }) => setData(data));
  }, [kind, q, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); setQ(""); setData(null); }, [kind]);

  const remove = async () => {
    try {
      await api.delete(`/master/${kind}/${del.id}`);
      toast.success("Data dihapus");
      load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setDel(null);
    }
  };

  return (
    <div className="p-5 sm:p-8 lg:p-10" data-testid="master-data-page">
      <PageHeader eyebrow="Master Data" title={cfg.label} desc={cfg.desc}
        actions={<button className={btnDark} onClick={() => setEdit({ open: true, record: null })} data-testid="master-add-button"><Plus className="w-4 h-4" />Tambah {cfg.label}</button>} />
      <div className="flex gap-2 overflow-x-auto mh-scroll pb-2 mb-6" data-testid="master-tabs">
        {Object.entries(MASTER).map(([k, c]) => (
          <button key={k} onClick={() => nav(`/master/${k}`)} data-testid={`master-tab-${k}`}
            className={`shrink-0 inline-flex items-center gap-2 h-11 px-4 rounded-full text-sm font-medium transition-colors ${k === kind ? "bg-[#12151c] text-white" : "bg-[#eef1f5] hover:bg-[#cddcf3]"}`}>
            <c.icon className="w-4 h-4" />{c.label}
          </button>
        ))}
      </div>
      <div className="flex items-center bg-[#eef1f5] rounded-full h-11 px-4 max-w-sm mb-4">
        <Search className="w-4 h-4 text-slate-400" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={`Cari ${cfg.label.toLowerCase()}…`} className="bg-transparent outline-none text-sm ml-2 flex-1" data-testid="master-search-input" />
      </div>
      {!data ? <Loading /> : data.items.length === 0 ? (
        <Empty title={`Belum ada ${cfg.label.toLowerCase()}`} desc="Tambahkan data pertama Anda." />
      ) : (
        <div className="overflow-x-auto rounded-[24px] border border-slate-200">
          <table className="w-full text-sm" data-testid="master-table">
            <thead className="bg-[#f8fafc] text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>{cfg.columns.map(([k, l]) => <th key={k} className="px-4 py-3 font-semibold whitespace-nowrap">{l}</th>)}<th className="px-4 py-3" /></tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.id} className="border-t border-slate-100 hover:bg-[#f8fafc] transition-colors" data-testid={`master-row-${it.id}`}>
                  {cfg.columns.map((c) => <td key={c[0]} className="px-4 py-3 whitespace-nowrap">{cell(it, c)}</td>)}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => setEdit({ open: true, record: it })} className="w-9 h-9 rounded-full hover:bg-white border border-transparent hover:border-slate-200 inline-grid place-items-center" data-testid={`master-edit-${it.id}`}><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => setDel(it)} className="w-9 h-9 rounded-full hover:bg-red-50 text-red-500 inline-grid place-items-center" data-testid={`master-delete-${it.id}`}><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.total > 0 && <Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />}
      <RecordDialog kind={kind} cfg={cfg} open={edit.open} record={edit.record} onClose={() => setEdit({ open: false, record: null })} onSaved={load} />
      <AlertDialog open={!!del} onOpenChange={(v) => !v && setDel(null)}>
        <AlertDialogContent className="rounded-[28px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {del?.name || del?.code}?</AlertDialogTitle>
            <AlertDialogDescription>Penghapusan tercatat di audit trail. Data yang masih dipakai project tidak dapat dihapus.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full" data-testid="master-delete-cancel">Batal</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="rounded-full bg-red-600 hover:bg-red-700" data-testid="master-delete-confirm">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
