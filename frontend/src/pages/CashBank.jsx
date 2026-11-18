import { useEffect, useState, useCallback, useMemo } from "react";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Plus, ScanLine, Ban, Landmark, Wallet, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader, Pager, Loading, StatusBadge, Field, btnDark, btnLight } from "@/components/kit";
import { DataTable, FormDialog, ReasonDialog, Grid, useForm, ExportMenu } from "@/components/fin";
import { useRefs } from "@/pages/MasterData";
import { api, errMsg } from "@/lib/api";
import { rp, tgl, today } from "@/lib/format";
import { accountOpts, bankOpts, refOpts } from "@/lib/lists";

const ICON = { Bank: Landmark, Kas: Wallet, Penampung: UserRound };

function AccountCard({ a, active, onClick }) {
  const Icon = ICON[a.kind] || Landmark;
  return (
    <button onClick={onClick} data-testid={`bank-card-${a.id}`}
      className={`text-left rounded-[26px] p-5 min-w-[230px] transition-[transform,background-color] duration-200 hover:-translate-y-0.5 ${active ? "bg-[#12151c] text-white" : "bg-[#f4f6f9]"}`}>
      <div className="flex items-center justify-between">
        <span className={`w-10 h-10 rounded-2xl grid place-items-center ${active ? "bg-white/10" : "bg-white"}`}><Icon className="w-5 h-5" /></span>
        <span className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${active ? "bg-white/10" : "bg-[#cddcf3]"}`}>{a.kind}</span>
      </div>
      <p className="mt-4 text-sm font-semibold truncate">{a.name}</p>
      <p className={`text-xs truncate ${active ? "text-white/60" : "text-slate-500"}`}>{a.bank_name || a.entity_name || "—"} {a.account_number || ""}</p>
      <p className="text-2xl font-extrabold num mt-2" data-testid={`bank-balance-${a.id}`}>{rp(a.balance)}</p>
      {a.unreconciled > 0 && <p className={`text-[11px] mt-1 ${active ? "text-white/60" : "text-amber-700"}`}>{a.unreconciled} mutasi belum direkonsiliasi</p>}
    </button>
  );
}

function ManualForm({ open, onClose, onSaved, defaultBank }) {
  const refs = useRefs(["bank-accounts", "accounts", "entities"]);
  const [f, set, setF] = useForm({});
  useEffect(() => { if (open) setF({ date: today(), bank_account_id: defaultBank || "", direction: "in", amount: "", kind: "manual", counter_account_id: "", entity_id: "", description: "" }); }, [open, defaultBank, setF]);
  return (
    <FormDialog open={open} onClose={onClose} title="Mutasi kas/bank" testId="cash-manual-form"
      desc="Untuk mutasi di luar invoice & pengeluaran. Pilih 'Dana CV via pemilik' bila dana CV diterima/dibayarkan oleh pemilik (akun lawan default 2300 Utang kepada Pemilik)."
      onSubmit={async () => { await api.post("/cash/transactions", f); toast.success("Mutasi dicatat & dijurnal"); onSaved(); onClose(); }}>
      <Grid>
        <Field f={{ k: "date", l: "Tanggal", t: "date", req: true }} value={f.date} onChange={set} />
        <Field f={{ k: "bank_account_id", l: "Rekening", t: "select", req: true, o: bankOpts(refs["bank-accounts"]) }} value={f.bank_account_id} onChange={set} />
        <Field f={{ k: "direction", l: "Arah", t: "select", req: true, o: [{ v: "in", l: "Masuk" }, { v: "out", l: "Keluar" }] }} value={f.direction} onChange={set} />
        <Field f={{ k: "kind", l: "Jenis", t: "select", req: true, o: [{ v: "manual", l: "Mutasi lain" }, { v: "owner_fund", l: "Dana CV via pemilik" }] }} value={f.kind} onChange={set} />
        <Field f={{ k: "amount", l: "Nominal (Rp)", t: "num", req: true }} value={f.amount} onChange={set} />
        <Field f={{ k: "counter_account_id", l: "Akun lawan (COA)", t: "select", o: accountOpts(refs.accounts) }} value={f.counter_account_id} onChange={set} />
        <Field f={{ k: "entity_id", l: "Entitas", t: "select", o: refOpts(refs.entities) }} value={f.entity_id} onChange={set} />
        <Field f={{ k: "description", l: "Keterangan", req: true }} value={f.description} onChange={set} />
      </Grid>
    </FormDialog>
  );
}

function TransferForm({ open, onClose, onSaved, defaultBank }) {
  const refs = useRefs(["bank-accounts"]);
  const [f, set, setF] = useForm({});
  useEffect(() => { if (open) setF({ date: today(), from_account_id: defaultBank || "", to_account_id: "", amount: "", description: "" }); }, [open, defaultBank, setF]);
  return (
    <FormDialog open={open} onClose={onClose} title="Transfer antar rekening" desc="Transfer antar rekening bukan pendapatan maupun biaya baru." testId="cash-transfer-form"
      onSubmit={async () => { await api.post("/cash/transfers", f); toast.success("Transfer dicatat"); onSaved(); onClose(); }}>
      <Field f={{ k: "date", l: "Tanggal", t: "date", req: true }} value={f.date} onChange={set} />
      <Field f={{ k: "from_account_id", l: "Dari rekening", t: "select", req: true, o: bankOpts(refs["bank-accounts"]) }} value={f.from_account_id} onChange={set} />
      <Field f={{ k: "to_account_id", l: "Ke rekening", t: "select", req: true, o: bankOpts(refs["bank-accounts"]) }} value={f.to_account_id} onChange={set} />
      <Field f={{ k: "amount", l: "Nominal (Rp)", t: "num", req: true }} value={f.amount} onChange={set} />
      <Field f={{ k: "description", l: "Keterangan" }} value={f.description} onChange={set} />
    </FormDialog>
  );
}

function ReconcileDialog({ bank, onClose, onSaved }) {
  const [sd, setSd] = useState(today());
  const [stmtBal, setStmtBal] = useState("");
  const [sel, setSel] = useState([]);
  const [data, setData] = useState(null);
  useEffect(() => { if (bank) api.get(`/cash/reconcile/${bank.id}`, { params: { statement_date: sd } }).then(({ data }) => { setData(data); setSel([]); }); }, [bank, sd]);
  const cleared = useMemo(() => {
    if (!data) return 0;
    return data.reconciled_balance + data.unreconciled.filter((t) => sel.includes(t.id)).reduce((a, t) => a + (t.direction === "in" ? t.amount : -t.amount), 0);
  }, [data, sel]);
  if (!bank) return null;
  const diff = Number(stmtBal || 0) - cleared;
  const save = async () => {
    try { await api.post("/cash/reconcile", { bank_account_id: bank.id, statement_date: sd, statement_balance: Number(stmtBal || 0), transaction_ids: sel }); toast.success("Rekonsiliasi disimpan"); onSaved(); onClose(); }
    catch (err) { toast.error(errMsg(err)); }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-[28px] max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="reconcile-dialog">
        <DialogHeader><DialogTitle>Rekonsiliasi {bank.name}</DialogTitle><DialogDescription>Centang mutasi yang tercantum di rekening koran, lalu cocokkan dengan saldo akhir rekening koran.</DialogDescription></DialogHeader>
        <Grid>
          <Field f={{ k: "sd", l: "Tanggal rekening koran", t: "date" }} value={sd} onChange={(_, v) => setSd(v)} />
          <Field f={{ k: "sb", l: "Saldo akhir rekening koran (Rp)", t: "num", req: true }} value={stmtBal} onChange={(_, v) => setStmtBal(v)} />
        </Grid>
        {!data ? <Loading /> : (
          <>
            <div className="space-y-1 max-h-[300px] overflow-y-auto mh-scroll" data-testid="reconcile-list">
              {data.unreconciled.length === 0 && <p className="text-sm text-slate-500 py-4 text-center">Semua mutasi sudah direkonsiliasi.</p>}
              {data.unreconciled.map((t) => (
                <label key={t.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-[#f4f6f9] cursor-pointer">
                  <Checkbox checked={sel.includes(t.id)} onCheckedChange={(v) => setSel((x) => (v ? [...x, t.id] : x.filter((i) => i !== t.id)))} data-testid={`reconcile-check-${t.id}`} />
                  <span className="text-xs text-slate-500 w-24">{tgl(t.date)}</span>
                  <span className="flex-1 text-sm truncate">{t.description}</span>
                  <span className={`num text-sm font-semibold ${t.direction === "in" ? "text-[#0f52ba]" : "text-red-600"}`}>{t.direction === "in" ? "+" : "−"}{rp(t.amount)}</span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-2xl bg-[#f4f6f9] p-3"><p className="text-xs text-slate-500">Saldo buku</p><p className="font-bold num">{rp(data.book_balance)}</p></div>
              <div className="rounded-2xl bg-[#cddcf3] p-3"><p className="text-xs text-slate-500">Saldo tercocokkan</p><p className="font-bold num" data-testid="reconcile-cleared">{rp(cleared)}</p></div>
              <div className={`rounded-2xl p-3 ${Math.abs(diff) < 0.5 ? "bg-[#12151c] text-white" : "bg-amber-100"}`}><p className="text-xs opacity-70">Selisih</p><p className="font-bold num" data-testid="reconcile-diff">{rp(diff)}</p></div>
            </div>
            <button onClick={save} className={`${btnDark} w-full justify-center`} data-testid="reconcile-save">Simpan rekonsiliasi</button>
            {data.history.length > 0 && (
              <div><p className="font-semibold text-sm mb-2">Riwayat</p>
                {data.history.map((h) => <p key={h.id} className="text-xs text-slate-600 py-1 border-t">{tgl(h.statement_date)} · {h.items} mutasi · saldo koran {rp(h.statement_balance)} · selisih {rp(h.difference)}</p>)}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function CashBank() {
  const [accs, setAccs] = useState(null);
  const [bank, setBank] = useState("");
  const [page, setPage] = useState(1);
  const [tx, setTx] = useState(null);
  const [modal, setModal] = useState("");
  const [voiding, setVoiding] = useState(null);
  const loadAccs = useCallback(() => api.get("/cash/accounts").then(({ data }) => setAccs(data)), []);
  const loadTx = useCallback(() => api.get("/cash/transactions", { params: { bank_account_id: bank, page } }).then(({ data }) => setTx(data)), [bank, page]);
  useEffect(() => { loadAccs(); }, [loadAccs]);
  useEffect(() => { loadTx(); }, [loadTx]);
  const reload = () => { loadAccs(); loadTx(); };
  const selected = accs?.items.find((a) => a.id === bank);
  const exportBuild = () => ({ title: `Mutasi ${selected?.name || "semua rekening"}`, total: true, columns: [{ k: "number", l: "No." }, { k: "date", l: "Tanggal" }, { k: "bank_name", l: "Rekening" }, { k: "kind_label", l: "Jenis" }, { k: "description", l: "Keterangan" }, { l: "Masuk", t: "rp", v: (r) => (r.direction === "in" ? r.amount : 0) }, { l: "Keluar", t: "rp", v: (r) => (r.direction === "out" ? r.amount : 0) }, { l: "Rekonsiliasi", v: (r) => (r.reconciled ? "Ya" : "Belum") }], rows: tx?.items || [] });
  if (!accs) return <Loading />;
  return (
    <div className="p-5 sm:p-8 lg:p-10" data-testid="cash-page">
      <PageHeader eyebrow="Cash & Bank" title="Kas & bank" desc={`Total saldo seluruh rekening ${rp(accs.total_balance)}. Saldo = saldo awal + mutasi masuk − mutasi keluar.`}
        actions={<>
          <button className={btnLight} onClick={() => setModal("transfer")} data-testid="cash-transfer-button"><ArrowLeftRight className="w-4 h-4" />Transfer</button>
          {selected && <button className={btnLight} onClick={() => setModal("reconcile")} data-testid="cash-reconcile-button"><ScanLine className="w-4 h-4" />Rekonsiliasi</button>}
          <button className={btnDark} onClick={() => setModal("manual")} data-testid="cash-manual-button"><Plus className="w-4 h-4" />Mutasi</button>
        </>} />
      <div className="flex gap-4 overflow-x-auto pb-3 mh-scroll mb-6" data-testid="bank-cards">
        <button onClick={() => { setBank(""); setPage(1); }} className={`rounded-[26px] p-5 min-w-[180px] text-left transition-colors ${!bank ? "bg-[#0f52ba] text-white" : "bg-[#f4f6f9]"}`} data-testid="bank-card-all">
          <p className="text-sm font-semibold">Semua rekening</p><p className="text-2xl font-extrabold num mt-8">{rp(accs.total_balance)}</p>
        </button>
        {accs.items.map((a) => <AccountCard key={a.id} a={a} active={bank === a.id} onClick={() => { setBank(a.id); setPage(1); }} />)}
      </div>
      <div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-lg">Mutasi {selected ? selected.name : "semua rekening"}</h2><ExportMenu name="cash" build={exportBuild} /></div>
      {!tx ? <Loading /> : (
        <>
          <DataTable testId="cash-table" empty="Belum ada mutasi."
            cols={[{ l: "No. / tanggal" }, { l: "Rekening" }, { l: "Jenis" }, { l: "Keterangan" }, { l: "Masuk", r: true }, { l: "Keluar", r: true }, { l: "Rekonsiliasi" }, { l: "" }]}
            rows={tx.items.map((t) => ({ key: t.id, testId: `cash-row-${t.number}`, cells: [
              <div><p className="font-semibold">{t.number}</p><p className="text-xs text-slate-500">{tgl(t.date)}</p></div>, t.bank_name, <span className="text-xs">{t.kind_label}</span>,
              <div className="max-w-[260px]"><p className="truncate">{t.description}</p>{t.counter_account && <p className="text-xs text-slate-500 truncate">{t.counter_account}</p>}</div>,
              t.direction === "in" ? <span className="text-[#0f52ba] font-semibold inline-flex items-center gap-1"><ArrowDownLeft className="w-3.5 h-3.5" />{rp(t.amount)}</span> : "",
              t.direction === "out" ? <span className="text-red-600 font-semibold inline-flex items-center gap-1"><ArrowUpRight className="w-3.5 h-3.5" />{rp(t.amount)}</span> : "",
              t.is_void ? <StatusBadge status="Void" /> : t.reconciled ? <StatusBadge status="Closed" className="!h-6" /> : <span className="text-xs text-slate-400">Belum</span>,
              !t.is_void && !t.reconciled && ["manual", "owner_fund", "transfer"].includes(t.kind) && <button onClick={() => setVoiding(t)} className="text-red-500" title="Batalkan" data-testid={`cash-void-${t.number}`}><Ban className="w-4 h-4" /></button>] }))} />
          <Pager page={tx.page} pageSize={tx.page_size} total={tx.total} onPage={setPage} />
        </>
      )}
      <ManualForm open={modal === "manual"} onClose={() => setModal("")} onSaved={reload} defaultBank={bank} />
      <TransferForm open={modal === "transfer"} onClose={() => setModal("")} onSaved={reload} defaultBank={bank} />
      {modal === "reconcile" && <ReconcileDialog bank={selected} onClose={() => setModal("")} onSaved={reload} />}
      <ReasonDialog open={!!voiding} onClose={() => setVoiding(null)} title={`Batalkan ${voiding?.number}`} desc="Mutasi ditandai batal dan jurnalnya dibalik."
        onConfirm={async (reason) => { try { await api.post(`/cash/transactions/${voiding.id}/void`, { reason }); toast.success("Mutasi dibatalkan"); reload(); } catch (err) { toast.error(errMsg(err)); } }} />
    </div>
  );
}
