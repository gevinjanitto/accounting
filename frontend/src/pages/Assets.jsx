import { useEffect, useState, useCallback } from "react";
import { Plus, CalendarClock, Ban, ListTree } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, Loading, StatusBadge, Field, btnDark, btnLight } from "@/components/kit";
import { DataTable, Stat, FormDialog, ReasonDialog, Grid, useForm, ExportMenu } from "@/components/fin";
import { IconBtn } from "@/pages/Incomes";
import { useRefs } from "@/pages/MasterData";
import { api, errMsg } from "@/lib/api";
import { rp, tgl, today, thisMonth, bulan } from "@/lib/format";
import { refOpts } from "@/lib/lists";

const CATS = ["Peralatan Kantor", "Komputer & Server", "Kendaraan", "Furnitur", "Bangunan", "Perangkat Lunak", "Lainnya"];

function Schedule({ id, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => { if (id) api.get(`/assets/${id}/schedule`).then(({ data }) => setD(data)); else setD(null); }, [id]);
  if (!id) return null;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-[28px] max-w-2xl max-h-[88vh] overflow-y-auto" data-testid="asset-schedule-dialog">
        <DialogHeader><DialogTitle>Jadwal penyusutan {d?.asset.code}</DialogTitle></DialogHeader>
        {!d ? <Loading /> : <DataTable cols={[{ l: "Periode" }, { l: "Penyusutan", r: true }, { l: "Akumulasi", r: true }, { l: "Nilai buku", r: true }, { l: "Status" }]}
          rows={d.schedule.map((r) => ({ key: r.period, cells: [bulan(r.period), rp(r.amount), rp(r.accumulated), rp(r.book_value), r.posted ? <StatusBadge status="Posted" /> : <span className="text-xs text-slate-400">Rencana</span>] }))} />}
      </DialogContent>
    </Dialog>
  );
}

export default function Assets() {
  const refs = useRefs(["entities"]);
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState(thisMonth());
  const [sched, setSched] = useState(null);
  const [disposing, setDisposing] = useState(null);
  const [voidDep, setVoidDep] = useState(false);
  const [f, set, setF] = useForm({});
  const load = useCallback(() => api.get("/assets").then(({ data }) => setD(data)), []);
  useEffect(() => { load(); }, [load]);
  const openForm = () => { setF({ code: `AST-${String((d?.items.length || 0) + 1).padStart(3, "0")}`, name: "", category: CATS[0], entity_id: refs.entities?.[0]?.id || "", acquisition_date: today(), cost: "", residual: 0, useful_life_months: 48, expense_id: "", note: "" }); setOpen(true); };
  const pickExpense = (_, id) => { const e = d.expense_candidates.find((x) => x.id === id); setF((x) => ({ ...x, expense_id: id, ...(e ? { name: x.name || e.description, cost: e.dpp, acquisition_date: e.date } : {}) })); };
  const run = async () => { try { const { data } = await api.post("/assets/depreciate", { period }); toast.success(`Penyusutan s/d ${bulan(period)} (${data.periods.length} periode, ${data.assets} aset): ${rp(data.total)}`); load(); } catch (e) { toast.error(errMsg(e)); } };
  const exportBuild = () => ({ title: "Daftar Aset Tetap", total: true, columns: [{ k: "code", l: "Kode" }, { k: "name", l: "Nama" }, { k: "category", l: "Kategori" }, { k: "acquisition_date", l: "Perolehan" }, { k: "cost", l: "Harga perolehan", t: "rp" }, { k: "useful_life_months", l: "Umur (bln)", t: "num" }, { k: "monthly_depreciation", l: "Penyusutan/bln", t: "rp" }, { k: "accumulated", l: "Akumulasi", t: "rp" }, { k: "book_value", l: "Nilai buku", t: "rp" }, { k: "status", l: "Status" }], rows: d?.items || [] });
  return (
    <div className="p-5 sm:p-8 lg:p-10" data-testid="assets-page">
      <PageHeader eyebrow="Asset Management" title="Aset tetap" desc="Register aset tetap dengan penyusutan garis lurus bulanan yang dijurnal ke akun 7000 Depreciation (Beban Penyusutan / Akumulasi Penyusutan)."
        actions={<><ExportMenu name="assets" build={exportBuild} /><button className={btnDark} onClick={openForm} data-testid="asset-add-button"><Plus className="w-4 h-4" />Tambah aset</button></>} />
      {!d ? <Loading /> : (
        <div className="space-y-6">
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Stat tone="blue" label="Harga perolehan" value={rp(d.totals.cost)} testId="assets-total-cost" />
            <Stat label="Akumulasi penyusutan" value={rp(d.totals.accumulated)} testId="assets-total-acc" />
            <Stat tone="dark" label="Nilai buku" value={rp(d.totals.book_value)} testId="assets-total-book" />
            <div className="rounded-[24px] border-2 border-[#12151c] p-4 space-y-2" data-testid="depreciation-run-card">
              <p className="text-sm font-semibold">Penyusutan bulanan · {rp(d.totals.monthly_depreciation)}/bln</p>
              <Field f={{ k: "period", l: "Periode", t: "month" }} value={period} onChange={(_, v) => setPeriod(v)} />
              <div className="flex gap-2">
                <button className={`${btnDark} flex-1 justify-center`} onClick={run} data-testid="depreciation-run-button"><CalendarClock className="w-4 h-4" />Jalankan</button>
                <button className={btnLight} onClick={() => setVoidDep(true)} data-testid="depreciation-void-button">Batalkan</button>
              </div>
            </div>
          </div>
          <DataTable testId="assets-table" empty="Belum ada aset tetap."
            cols={[{ l: "Kode · nama" }, { l: "Kategori" }, { l: "Perolehan" }, { l: "Harga", r: true }, { l: "Umur", r: true }, { l: "Penyusutan/bln", r: true }, { l: "Akumulasi", r: true }, { l: "Nilai buku", r: true }, { l: "Status" }, { l: "" }]}
            rows={d.items.map((a) => ({ key: a.id, testId: `asset-row-${a.code}`, cells: [<div><p className="font-semibold">{a.code}</p><p className="text-xs text-slate-500 max-w-[200px] truncate">{a.name}</p></div>,
              a.category, tgl(a.acquisition_date), rp(a.cost), `${a.useful_life_months} bln`, rp(a.monthly_depreciation), rp(a.accumulated), <b>{rp(a.book_value)}</b>,
              <div><StatusBadge status={a.status} /><p className="text-[11px] text-slate-500 mt-1">{a.months_done} bln disusutkan</p></div>,
              <div className="flex gap-1 justify-end"><IconBtn onClick={() => setSched(a.id)} icon={ListTree} title="Jadwal" testId={`asset-schedule-${a.code}`} />
                {a.status === "Aktif" && <IconBtn onClick={() => setDisposing(a)} icon={Ban} title="Lepas aset" danger testId={`asset-dispose-${a.code}`} />}</div>] }))} />
        </div>
      )}
      <FormDialog open={open} onClose={() => setOpen(false)} wide title="Tambah aset tetap" testId="asset-form" desc="Pembelian aset dicatat di Pengeluaran (kategori Asset Acquisition); pilih transaksinya agar aset tertelusur ke bukti."
        onSubmit={async () => { await api.post("/assets", f); toast.success("Aset ditambahkan"); setOpen(false); load(); }}>
        <Grid>
          <Field f={{ k: "expense_id", l: "Dari pengeluaran aset (opsional)", t: "select", o: (d?.expense_candidates || []).map((e) => ({ v: e.id, l: `${e.number} · ${e.description} · ${rp(e.dpp)}` })), wide: true }} value={f.expense_id} onChange={pickExpense} />
          <Field f={{ k: "code", l: "Kode aset", req: true }} value={f.code} onChange={set} />
          <Field f={{ k: "name", l: "Nama aset", req: true }} value={f.name} onChange={set} />
          <Field f={{ k: "category", l: "Kategori", t: "select", req: true, o: CATS }} value={f.category} onChange={set} />
          <Field f={{ k: "entity_id", l: "Entitas", t: "select", o: refOpts(refs.entities) }} value={f.entity_id} onChange={set} />
          <Field f={{ k: "acquisition_date", l: "Tanggal perolehan", t: "date", req: true }} value={f.acquisition_date} onChange={set} />
          <Field f={{ k: "cost", l: "Harga perolehan (Rp)", t: "num", req: true }} value={f.cost} onChange={set} />
          <Field f={{ k: "residual", l: "Nilai sisa (Rp)", t: "num" }} value={f.residual} onChange={set} />
          <Field f={{ k: "useful_life_months", l: "Umur manfaat (bulan)", t: "num", req: true, hint: "Kelompok 1 = 48 bln, Kelompok 2 = 96 bln" }} value={f.useful_life_months} onChange={set} />
        </Grid>
      </FormDialog>
      <Schedule id={sched} onClose={() => setSched(null)} />
      <ReasonDialog open={!!disposing} onClose={() => setDisposing(null)} title={`Lepas aset ${disposing?.code}`} desc="Aset tidak lagi disusutkan."
        onConfirm={async (reason) => { await api.post(`/assets/${disposing.id}/dispose`, { reason }); toast.success("Aset dilepas"); load(); }} />
      <ReasonDialog open={voidDep} onClose={() => setVoidDep(false)} title={`Batalkan penyusutan ${bulan(period)}`} desc="Jurnal penyusutan periode ini dibalik."
        onConfirm={async (reason) => { try { await api.post(`/assets/depreciate/${period}/void`, { reason }); toast.success("Penyusutan dibatalkan"); load(); } catch (e) { toast.error(errMsg(e)); } }} />
    </div>
  );
}
