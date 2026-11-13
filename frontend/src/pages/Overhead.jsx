import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Shuffle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader, Panel, Loading, Empty, Field, StatusBadge, btnDark, btnLight } from "@/components/kit";
import { Table } from "@/pages/ProjectDetail";
import { api, errMsg } from "@/lib/api";
import { rp, pct, bulan, thisMonth, tglJam } from "@/lib/format";

const DEFAULT = { Internet: 500000, Listrik: 700000, "Server umum": 3000000, Administrasi: 1000000, Sewa: 2000000, "Lain-lain": 2800000 };

function PoolForm({ open, onClose, pool, onSaved }) {
  const [period, setPeriod] = useState(thisMonth());
  const [rows, setRows] = useState([]);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!open) return;
    setPeriod(pool?.period || thisMonth());
    setRows(Object.entries(pool?.components || DEFAULT).map(([k, v]) => ({ k, v })));
    setNote(pool?.note || "");
  }, [open, pool]);
  const total = rows.reduce((a, r) => a + Number(r.v || 0), 0);
  const save = async () => {
    try {
      await api.post("/overhead/pools", { period, note, components: Object.fromEntries(rows.filter((r) => r.k).map((r) => [r.k, r.v])) });
      toast.success("Cost pool tersimpan"); onSaved(); onClose();
    } catch (err) { toast.error(errMsg(err)); }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-[28px] max-w-lg" data-testid="pool-form-dialog">
        <DialogHeader><DialogTitle>{pool ? `Cost pool ${bulan(pool.period)}` : "Cost pool overhead baru"}</DialogTitle><DialogDescription>Nominal diisi manual per bulan (Fase 1).</DialogDescription></DialogHeader>
        <Field f={{ k: "period", l: "Periode", t: "month" }} value={period} onChange={(_, v) => setPeriod(v)} />
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_150px_32px] gap-2">
              <input value={r.k} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} className="h-10 rounded-xl border px-3 text-sm" data-testid={`pool-comp-name-${i}`} />
              <input type="number" value={r.v} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} className="h-10 rounded-xl border px-3 text-right num" data-testid={`pool-comp-amount-${i}`} />
              <button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <button onClick={() => setRows([...rows, { k: "", v: 0 }])} className="text-sm font-semibold text-[#0f52ba]" data-testid="pool-add-component">+ Tambah komponen</button>
        </div>
        <Field f={{ k: "note", l: "Catatan" }} value={note} onChange={(_, v) => setNote(v)} />
        <div className="flex items-center justify-between"><span className="text-sm">Total <b className="num" data-testid="pool-total">{rp(total)}</b></span><button onClick={save} className={btnDark} data-testid="pool-save-button">Simpan</button></div>
      </DialogContent>
    </Dialog>
  );
}

function AllocateDialog({ pool, onClose, onDone, methods }) {
  const [projects, setProjects] = useState([]);
  const [method, setMethod] = useState("revenue");
  const [sel, setSel] = useState([]);
  const [weights, setWeights] = useState({});
  useEffect(() => {
    api.get("/projects", { params: { page_size: 200 } }).then(({ data }) => setProjects(data.items.filter((p) => !["Completed", "Cancelled", "Draft"].includes(p.status))));
  }, []);
  const run = async () => {
    try {
      const { data } = await api.post(`/overhead/pools/${pool.id}/allocate`, { method, project_ids: sel, weights });
      toast.success(`Teralokasi ke ${data.allocations.length} project`); onDone(); onClose();
    } catch (err) { toast.error(errMsg(err)); }
  };
  const needWeights = method === "manual" || method === "capacity";
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-[28px] max-w-xl" data-testid="allocate-dialog">
        <DialogHeader><DialogTitle>Alokasi {rp(pool.total)} · {bulan(pool.period)}</DialogTitle><DialogDescription>Alokasi lama dinonaktifkan dan disimpan sebagai riwayat. Total selalu tepat sama dengan cost pool (tanpa beban ganda).</DialogDescription></DialogHeader>
        <Field f={{ k: "method", l: "Metode alokasi", t: "select", o: methods.map((m) => ({ v: m.value, l: m.label })), req: true }} value={method} onChange={(_, v) => setMethod(v)} />
        <div className="space-y-2 max-h-72 overflow-y-auto mh-scroll">
          {projects.map((p) => (
            <label key={p.id} className="flex items-center gap-3 p-3 rounded-2xl bg-[#f4f6f9]" data-testid={`allocate-project-${p.code}`}>
              <Checkbox checked={sel.includes(p.id)} onCheckedChange={(c) => setSel(c ? [...sel, p.id] : sel.filter((x) => x !== p.id))} />
              <span className="flex-1 text-sm"><b>{p.code}</b> {p.name}<span className="block text-xs text-slate-500">{rp(p.contract_value)} · {p.status}</span></span>
              {needWeights && sel.includes(p.id) && <input type="number" placeholder={method === "manual" ? "%" : "bobot"} value={weights[p.id] ?? ""} onChange={(e) => setWeights({ ...weights, [p.id]: e.target.value })} className="w-24 h-9 rounded-xl border px-2 text-right num" data-testid={`allocate-weight-${p.code}`} />}
            </label>
          ))}
          {projects.length === 0 && <p className="text-sm text-slate-500">Tidak ada project aktif.</p>}
        </div>
        <button onClick={run} disabled={!sel.length} className={`${btnDark} justify-center`} data-testid="allocate-run-button"><Shuffle className="w-4 h-4" />Jalankan alokasi</button>
      </DialogContent>
    </Dialog>
  );
}

function PoolHistory({ pool }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get(`/overhead/pools/${pool.id}/allocations`).then(({ data }) => setRows(data)); }, [pool]);
  if (!rows) return <Loading />;
  return <Table cols={["Project", "Metode", "Dasar", "Porsi", "Nominal", "Status", "Dibuat"]} rows={rows.map((a) => [a.project_name, a.method_label, a.basis_value, pct(a.share_pct), <span className="num font-semibold">{rp(a.amount)}</span>, a.is_active ? <StatusBadge status="Running" /> : <span className="text-xs text-slate-400">Riwayat</span>, tglJam(a.created_at)])} empty="Belum dialokasikan." />;
}

export default function Overhead() {
  const [pools, setPools] = useState(null);
  const [meta, setMeta] = useState({ methods: [] });
  const [form, setForm] = useState({ open: false, pool: null });
  const [alloc, setAlloc] = useState(null);
  const [active, setActive] = useState(null);
  const load = useCallback(() => api.get("/overhead/pools").then(({ data }) => { setPools(data); setActive((a) => data.find((p) => p.id === a?.id) || data[0] || null); }), []);
  useEffect(() => { load(); api.get("/overhead/meta").then(({ data }) => setMeta(data)); }, [load]);
  const cancel = async (p) => { try { await api.post(`/overhead/pools/${p.id}/cancel`); toast.success("Alokasi dibatalkan"); load(); } catch (err) { toast.error(errMsg(err)); } };

  return (
    <div className="p-5 sm:p-8 lg:p-10" data-testid="overhead-page">
      <PageHeader eyebrow="Project Costing" title="Alokasi overhead" desc="Kumpulkan biaya umum dalam cost pool bulanan lalu alokasikan ke project berdasarkan revenue, jam kerja, durasi, kapasitas, atau manual."
        actions={<button className={btnDark} onClick={() => setForm({ open: true, pool: null })} data-testid="pool-add-button"><Plus className="w-4 h-4" />Cost pool</button>} />
      {!pools ? <Loading /> : pools.length === 0 ? <Empty title="Belum ada cost pool" /> : (
        <div className="grid xl:grid-cols-[340px_1fr] gap-6">
          <div className="space-y-3">
            {pools.map((p) => (
              <button key={p.id} onClick={() => setActive(p)} className={`w-full text-left rounded-[24px] p-5 border transition-colors ${active?.id === p.id ? "border-[#12151c] bg-[#f4f6f9]" : "border-slate-200 hover:border-slate-400"}`} data-testid={`pool-item-${p.period}`}>
                <p className="text-sm text-slate-500">{bulan(p.period)}</p>
                <p className="text-2xl font-extrabold num">{rp(p.total)}</p>
                <div className="mt-3 h-2 rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-[#3574c4]" style={{ width: `${p.total ? (p.allocated / p.total) * 100 : 0}%` }} /></div>
                <p className="text-xs text-slate-500 mt-2">Teralokasi {rp(p.allocated)} · sisa {rp(p.unallocated)}</p>
              </button>
            ))}
          </div>
          {active && (
            <div className="space-y-6">
              <Panel>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <p className="font-semibold text-lg">Komponen {bulan(active.period)}</p>
                  <div className="flex gap-2">
                    <button className={btnLight} onClick={() => setForm({ open: true, pool: active })} data-testid="pool-edit-button">Ubah</button>
                    {active.allocated > 0 && <button className={btnLight} onClick={() => cancel(active)} data-testid="pool-cancel-alloc-button"><XCircle className="w-4 h-4" />Batalkan alokasi</button>}
                    <button className={btnDark} onClick={() => setAlloc(active)} data-testid="pool-allocate-button"><Shuffle className="w-4 h-4" />Alokasikan</button>
                  </div>
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  {Object.entries(active.components).map(([k, v]) => <div key={k} className="rounded-2xl bg-[#f4f6f9] p-4"><p className="text-xs text-slate-500">{k}</p><p className="font-bold num">{rp(v)}</p></div>)}
                </div>
              </Panel>
              <Panel testId="pool-history"><p className="font-semibold mb-3">Alokasi & riwayat aturan</p><PoolHistory pool={active} /></Panel>
            </div>
          )}
        </div>
      )}
      <PoolForm open={form.open} pool={form.pool} onClose={() => setForm({ open: false, pool: null })} onSaved={load} />
      {alloc && <AllocateDialog pool={alloc} methods={meta.methods} onClose={() => setAlloc(null)} onDone={load} />}
    </div>
  );
}
