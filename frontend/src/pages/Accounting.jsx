import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Undo2, Lock, Unlock, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, Pager, Loading, StatusBadge, Field, Pill, btnDark, btnLight } from "@/components/kit";
import { DataTable, FormDialog, ReasonDialog, Grid, ExportMenu } from "@/components/fin";
import { useRefs } from "@/pages/MasterData";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg } from "@/lib/api";
import { rp, tgl, today } from "@/lib/format";
import { accountOpts, refOpts, useProjects, projectOpts } from "@/lib/lists";

const SOURCE = { income: "Pemasukan", income_payment: "Penerimaan", expense: "Pengeluaran", expense_payment: "Pelunasan", cash: "Kas & bank", transfer: "Transfer", manual: "Penyesuaian" };

function ManualJournal({ open, onClose, onSaved }) {
  const refs = useRefs(["accounts", "entities"]);
  const projects = useProjects();
  const [f, setF] = useState({ date: today(), description: "", reason: "", entity_id: "", project_id: "" });
  const [lines, setLines] = useState([{ account_id: "", debit: "", credit: "" }, { account_id: "", debit: "", credit: "" }]);
  const dr = lines.reduce((a, l) => a + Number(l.debit || 0), 0), cr = lines.reduce((a, l) => a + Number(l.credit || 0), 0);
  const setLine = (i, k, v) => setLines((x) => x.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return (
    <FormDialog open={open} onClose={onClose} wide title="Jurnal penyesuaian manual" desc="Hanya Owner. Jurnal harus seimbang dan wajib memiliki alasan." testId="manual-journal-form"
      onSubmit={async () => {
        await api.post("/accounting/journals", { ...f, lines: lines.filter((l) => l.account_id).map((l) => ({ account_id: l.account_id, debit: Number(l.debit || 0), credit: Number(l.credit || 0) })) });
        toast.success("Jurnal penyesuaian diposting"); onSaved(); onClose();
      }}>
      <Grid>
        <Field f={{ k: "date", l: "Tanggal", t: "date", req: true }} value={f.date} onChange={(k, v) => setF({ ...f, [k]: v })} />
        <Field f={{ k: "description", l: "Keterangan", req: true }} value={f.description} onChange={(k, v) => setF({ ...f, [k]: v })} />
        <Field f={{ k: "entity_id", l: "Entitas", t: "select", o: refOpts(refs.entities) }} value={f.entity_id} onChange={(k, v) => setF({ ...f, [k]: v })} />
        <Field f={{ k: "project_id", l: "Project", t: "select", o: projectOpts(projects) }} value={f.project_id} onChange={(k, v) => setF({ ...f, [k]: v })} />
        <Field f={{ k: "reason", l: "Alasan penyesuaian", t: "textarea", req: true, wide: true }} value={f.reason} onChange={(k, v) => setF({ ...f, [k]: v })} />
      </Grid>
      <div className="space-y-2" data-testid="manual-journal-lines">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_130px_130px_36px] gap-2 items-end">
            <Field f={{ k: `acc-${i}`, l: i === 0 ? "Akun" : "", t: "select", o: accountOpts(refs.accounts) }} value={l.account_id} onChange={(_, v) => setLine(i, "account_id", v)} />
            <Field f={{ k: `dr-${i}`, l: i === 0 ? "Debit" : "", t: "num" }} value={l.debit} onChange={(_, v) => setLine(i, "debit", v)} />
            <Field f={{ k: `cr-${i}`, l: i === 0 ? "Kredit" : "", t: "num" }} value={l.credit} onChange={(_, v) => setLine(i, "credit", v)} />
            <button type="button" onClick={() => setLines((x) => x.filter((_, j) => j !== i))} className="h-11 text-red-500 grid place-items-center" data-testid={`manual-line-remove-${i}`}><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        <button type="button" onClick={() => setLines((x) => [...x, { account_id: "", debit: "", credit: "" }])} className="text-sm font-semibold text-[#0f52ba]" data-testid="manual-line-add">+ Tambah baris</button>
      </div>
      <div className={`rounded-2xl p-3 text-sm flex justify-between ${dr === cr && dr > 0 ? "bg-[#cddcf3]" : "bg-amber-100"}`} data-testid="manual-journal-balance">
        <span>Debit {rp(dr)} · Kredit {rp(cr)}</span><b>{dr === cr && dr > 0 ? "Seimbang" : "Belum seimbang"}</b>
      </div>
    </FormDialog>
  );
}

function JournalList({ isOwner }) {
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState({});
  const [create, setCreate] = useState(false);
  const [reversing, setReversing] = useState(null);
  const load = useCallback(() => api.get("/accounting/journals", { params: { kind, q, page } }).then(({ data }) => setData(data)), [kind, q, page]);
  useEffect(() => { load(); }, [load]);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {[["", "Semua"], ["auto", "Otomatis"], ["manual", "Penyesuaian"], ["reversal", "Pembalik"]].map(([k, l]) => <Pill key={l} active={kind === k} onClick={() => { setKind(k); setPage(1); }} testId={`journal-filter-${k || "all"}`}>{l}</Pill>)}
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Cari no. / keterangan" className="h-10 px-4 rounded-full border border-slate-200 text-sm outline-none focus:border-[#0f52ba] w-56" data-testid="journal-search-input" />
        {isOwner && <button className={`${btnDark} ml-auto`} onClick={() => setCreate(true)} data-testid="manual-journal-button"><Plus className="w-4 h-4" />Jurnal penyesuaian</button>}
      </div>
      {!data ? <Loading /> : (
        <div className="space-y-2" data-testid="journal-list">
          {data.items.length === 0 && <p className="text-sm text-slate-500 py-10 text-center">Belum ada jurnal.</p>}
          {data.items.map((j) => (
            <div key={j.id} className="rounded-[22px] border border-slate-200 overflow-hidden" data-testid={`journal-${j.number}`}>
              <button onClick={() => setOpen((o) => ({ ...o, [j.id]: !o[j.id] }))} className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-[#f8fafc]">
                <ChevronDown className={`w-4 h-4 transition-transform ${open[j.id] ? "rotate-180" : ""}`} />
                <span className="font-mono-num text-sm text-[#0f52ba]">{j.number}</span>
                <span className="text-xs text-slate-500">{tgl(j.date)}</span>
                <span className="text-sm font-medium flex-1 min-w-[200px] truncate">{j.description}</span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-[#f4f6f9]">{j.kind === "reversal" ? "Pembalik" : SOURCE[j.source_type] || j.kind}</span>
                <StatusBadge status={j.status} className="!h-6" />
                <span className="num font-semibold text-sm">{rp(j.total)}</span>
              </button>
              {open[j.id] && (
                <div className="px-4 pb-4 bg-[#fbfcfd]">
                  <table className="w-full text-sm"><tbody>
                    {j.lines.map((l) => <tr key={l.id} className="border-t border-slate-100"><td className={`py-2 ${l.credit ? "pl-8" : ""}`}>{l.account_code} · {l.account_name}<span className="block text-xs text-slate-400">{l.memo}</span></td><td className="py-2 text-right num w-40">{l.debit ? rp(l.debit) : ""}</td><td className="py-2 text-right num w-40">{l.credit ? rp(l.credit) : ""}</td></tr>)}
                  </tbody></table>
                  {j.reason && <p className="text-xs text-slate-500 mt-2">Alasan: {j.reason}</p>}
                  {isOwner && j.kind === "manual" && j.status === "Posted" && <button onClick={() => setReversing(j)} className={`${btnLight} mt-3 !h-9`} data-testid={`journal-reverse-${j.number}`}><Undo2 className="w-4 h-4" />Buat jurnal pembalik</button>}
                </div>
              )}
            </div>
          ))}
          <Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
        </div>
      )}
      <ManualJournal open={create} onClose={() => setCreate(false)} onSaved={load} />
      <ReasonDialog open={!!reversing} onClose={() => setReversing(null)} title={`Balik ${reversing?.number}`} desc="Jurnal posted tidak dihapus; sistem membuat jurnal pembalik."
        onConfirm={async (reason) => { try { await api.post(`/accounting/journals/${reversing.id}/reverse`, { reason }); toast.success("Jurnal pembalik dibuat"); load(); } catch (err) { toast.error(errMsg(err)); } }} />
    </div>
  );
}

function Ledger() {
  const refs = useRefs(["accounts"]);
  const [f, setF] = useState({ account_id: "", date_from: "", date_to: "" });
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!f.account_id && refs.accounts?.length) setF((x) => ({ ...x, account_id: refs.accounts.find((a) => a.code === "1110")?.id || refs.accounts[0].id }));
  }, [refs.accounts, f.account_id]);
  useEffect(() => { if (f.account_id) api.get("/accounting/ledger", { params: f }).then(({ data }) => setData(data)).catch((e) => toast.error(errMsg(e))); }, [f]);
  const exportBuild = () => ({ title: `Buku Besar ${data.account.code} ${data.account.name}`, subtitle: `Saldo awal ${rp(data.opening)} · saldo akhir ${rp(data.closing)}`, columns: [{ k: "date", l: "Tanggal" }, { k: "number", l: "No. jurnal" }, { k: "description", l: "Keterangan" }, { k: "debit", l: "Debit", t: "rp" }, { k: "credit", l: "Kredit", t: "rp" }, { k: "balance", l: "Saldo", t: "rp" }], rows: data.rows });
  return (
    <div>
      <div className="grid sm:grid-cols-[1fr_180px_180px_auto] gap-3 items-end mb-4">
        <Field f={{ k: "account_id", l: "Akun", t: "select", req: true, o: accountOpts(refs.accounts) }} value={f.account_id} onChange={(k, v) => setF({ ...f, [k]: v })} />
        <Field f={{ k: "date_from", l: "Dari", t: "date" }} value={f.date_from} onChange={(k, v) => setF({ ...f, [k]: v })} />
        <Field f={{ k: "date_to", l: "Sampai", t: "date" }} value={f.date_to} onChange={(k, v) => setF({ ...f, [k]: v })} />
        {data && <ExportMenu name="ledger" build={exportBuild} />}
      </div>
      {!data ? <Loading /> : (
        <DataTable testId="ledger-table" empty="Tidak ada transaksi pada akun ini."
          cols={[{ l: "Tanggal" }, { l: "No. jurnal" }, { l: "Keterangan" }, { l: "Debit", r: true }, { l: "Kredit", r: true }, { l: "Saldo", r: true }]}
          rows={[{ key: "open", cells: ["", "", <i className="text-slate-500">Saldo awal</i>, "", "", rp(data.opening)] }, ...data.rows.map((r, i) => ({ key: i, cells: [tgl(r.date), <span className="font-mono-num text-xs">{r.number}</span>, <span className="block max-w-[340px] truncate">{r.description}</span>, r.debit ? rp(r.debit) : "", r.credit ? rp(r.credit) : "", rp(r.balance)] }))]}
          foot={["", "", "Total / saldo akhir", rp(data.total_debit), rp(data.total_credit), rp(data.closing)]} />
      )}
    </div>
  );
}

function TrialBalance() {
  const [dateTo, setDateTo] = useState("");
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/accounting/trial-balance", { params: { date_to: dateTo } }).then(({ data }) => setData(data)); }, [dateTo]);
  const exportBuild = () => ({ title: "Neraca Saldo", total: true, subtitle: dateTo ? `Per ${dateTo}` : "Semua periode", columns: [{ k: "code", l: "Kode" }, { k: "name", l: "Akun" }, { k: "debit", l: "Debit", t: "rp" }, { k: "credit", l: "Kredit", t: "rp" }], rows: data.rows });
  return (
    <div>
      <div className="flex items-end gap-3 mb-4"><div className="w-52"><Field f={{ k: "tb_to", l: "Per tanggal", t: "date" }} value={dateTo} onChange={(_, v) => setDateTo(v)} /></div>{data && <ExportMenu name="trial-balance" build={exportBuild} />}
        {data && <span className={`ml-auto text-xs font-semibold px-3 py-1.5 rounded-full ${data.balanced ? "bg-[#cddcf3]" : "bg-red-100 text-red-700"}`} data-testid="trial-balance-status">{data.balanced ? "Seimbang" : "Tidak seimbang"}</span>}</div>
      {!data ? <Loading /> : (
        <DataTable testId="trial-balance-table" cols={[{ l: "Kode" }, { l: "Akun" }, { l: "Debit", r: true }, { l: "Kredit", r: true }]}
          rows={data.rows.map((r) => ({ key: r.account_id, cells: [r.code, r.name, r.debit ? rp(r.debit) : "", r.credit ? rp(r.credit) : ""] }))}
          foot={["", "Total", rp(data.total_debit), rp(data.total_credit)]} />
      )}
    </div>
  );
}

function Periods({ isOwner }) {
  const [items, setItems] = useState(null);
  const [reopen, setReopen] = useState(null);
  const load = useCallback(() => api.get("/accounting/periods").then(({ data }) => setItems(data)), []);
  useEffect(() => { load(); }, [load]);
  const close = async (p) => {
    if (!window.confirm(`Tutup periode ${p.code}? Transaksi pada periode ini tidak dapat diposting lagi.`)) return;
    try { await api.post(`/accounting/periods/${p.code}/close`); toast.success("Periode ditutup"); load(); } catch (err) { toast.error(errMsg(err)); }
  };
  if (!items) return <Loading />;
  return (
    <>
      <DataTable testId="periods-table" cols={[{ l: "Periode" }, { l: "Rentang" }, { l: "Jurnal", r: true }, { l: "Status" }, { l: "" }]}
        rows={items.map((p) => ({ key: p.id, testId: `period-row-${p.code}`, cells: [p.code, `${tgl(p.start_date)} – ${tgl(p.end_date)}`, p.journals, <StatusBadge status={p.status} />,
          isOwner && (p.status === "Open"
            ? <button onClick={() => close(p)} className="inline-flex items-center gap-1 text-xs font-semibold" data-testid={`period-close-${p.code}`}><Lock className="w-3.5 h-3.5" />Tutup</button>
            : <button onClick={() => setReopen(p)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#0f52ba]" data-testid={`period-reopen-${p.code}`}><Unlock className="w-3.5 h-3.5" />Buka ulang</button>)] }))} />
      <ReasonDialog open={!!reopen} onClose={() => setReopen(null)} title={`Buka ulang ${reopen?.code}`} desc="Pembukaan ulang periode tercatat di audit trail."
        onConfirm={async (reason) => { try { await api.post(`/accounting/periods/${reopen.code}/reopen`, { reason }); toast.success("Periode dibuka"); load(); } catch (err) { toast.error(errMsg(err)); } }} />
    </>
  );
}

export default function Accounting() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  return (
    <div className="p-5 sm:p-8 lg:p-10" data-testid="accounting-page">
      <PageHeader eyebrow="Accounting & Journal" title="Jurnal & buku besar" desc="Jurnal otomatis dari setiap transaksi, jurnal penyesuaian, buku besar, neraca saldo, dan closing periode." />
      <Tabs defaultValue="journals">
        <TabsList className="h-auto p-1.5 rounded-full bg-[#eef1f5] flex-wrap justify-start" data-testid="accounting-tabs">
          {[["journals", "Jurnal"], ["ledger", "Buku besar"], ["trial", "Neraca saldo"], ["periods", "Periode"]].map(([v, l]) => (
            <TabsTrigger key={v} value={v} className="rounded-full px-5 h-10 data-[state=active]:bg-[#12151c] data-[state=active]:text-white" data-testid={`accounting-tab-${v}`}>{l}</TabsTrigger>
          ))}
        </TabsList>
        <div className="mt-6">
          <TabsContent value="journals"><JournalList isOwner={isOwner} /></TabsContent>
          <TabsContent value="ledger"><Ledger /></TabsContent>
          <TabsContent value="trial"><TrialBalance /></TabsContent>
          <TabsContent value="periods"><Periods isOwner={isOwner} /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
