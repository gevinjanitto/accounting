import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Ban, Paperclip, CreditCard, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Pill, Pager, Loading, StatusBadge, Field, btnDark, statusLabel } from "@/components/kit";
import { DataTable, Stat, FormDialog, ReasonDialog, Grid, useForm, ExportMenu, TAX_CLASSES } from "@/components/fin";
import { DocsDialog, ACCEPT, MAX } from "@/components/Documents";
import { IconBtn } from "@/pages/Incomes";
import { useRefs } from "@/pages/MasterData";
import { api, errMsg } from "@/lib/api";
import { rp, tgl, today } from "@/lib/format";
import { useProjects, projectOpts, accountOpts, bankOpts } from "@/lib/lists";

export const CATEGORIES = ["Direct Cost", "Labor Cost", "Overhead", "Administrative Expense", "Asset Acquisition", "Other Expense"];
export const CAT_LABEL = { "Direct Cost": "Biaya Langsung", "Labor Cost": "Biaya Tenaga Kerja (gaji/bonus)", Overhead: "Biaya Overhead", "Administrative Expense": "Biaya Administrasi", "Asset Acquisition": "Pembelian Aset", "Other Expense": "Biaya Lainnya" };
const FISCAL_LABEL = { Deductible: "Dapat dikurangkan", "Non-deductible": "Tidak dapat dikurangkan", "Temporary Difference": "Beda waktu (temporer)", "Requires Review": "Perlu ditinjau" };
const CAT_GROUPS = { "Direct Cost": ["5000"], "Labor Cost": ["5000", "6000"], Overhead: ["6000"], "Administrative Expense": ["6000"], "Asset Acquisition": ["1000"], "Other Expense": ["6000", "7000", "8000"] };
const FISCAL = ["Deductible", "Non-deductible", "Temporary Difference", "Requires Review"];
const DIRECT = [["freelancer", "Freelancer"], ["server", "Server / hosting"], ["lisensi", "Lisensi"], ["vendor", "Vendor"], ["perjalanan", "Perjalanan dinas"], ["lainnya", "Biaya langsung lainnya"]];
const blank = () => ({ date: today(), project_id: "", category: "Direct Cost", account_id: "", component: "freelancer", description: "", dpp: "", ppn_pct: 0, payment_method: "Transfer", bank_account_id: "", fiscal_treatment: "Deductible", fiscal_reason: "", fiscal_reference: "", tax_classification: "Non-PPN" });

export function ExpenseForm({ open, onClose, expense, onSaved, presetProject }) {
  const refs = useRefs(["accounts", "bank-accounts"]);
  const projects = useProjects();
  const [f, set, setF] = useForm(blank());
  const [file, setFile] = useState(null);
  useEffect(() => {
    if (!open) return;
    setFile(null);
    if (expense) setF(Object.fromEntries(Object.keys(blank()).map((k) => [k, expense[k] ?? ""])));
    else {
      const p = projects.find((x) => x.id === presetProject);
      setF({ ...blank(), ...(p ? { project_id: p.id, component: "freelancer" } : {}) });
    }
  }, [open, expense, presetProject, projects, setF]);
  const compOpts = f.category === "Direct Cost" ? DIRECT : f.category === "Labor Cost" ? [["bonus", "Bonus aktual tim"]] : [];
  const dpp = Number(f.dpp || 0), ppn = (dpp * Number(f.ppn_pct || 0)) / 100;
  const save = async () => {
    const body = { ...f, component: f.project_id ? f.component : "" };
    const { data } = expense ? await api.put(`/expenses/${expense.id}`, body) : await api.post("/expenses", body);
    if (file) {
      const fd = new FormData();
      fd.append("file", file); fd.append("doc_type", "Nota Pembelian"); fd.append("description", "Bukti pengeluaran");
      fd.append("linked_type", "expense"); fd.append("linked_id", expense?.id || data.id);
      try { await api.post("/documents", fd); } catch (err) { toast.error(`Pengeluaran tersimpan, tetapi bukti gagal diunggah: ${errMsg(err)}`); }
    }
    toast.success(expense ? "Pengeluaran diperbarui" : "Pengeluaran dicatat & dijurnal otomatis");
    onSaved(); onClose();
  };
  return (
    <FormDialog open={open} onClose={onClose} wide title={expense ? `Ubah ${expense.number}` : "Catat pengeluaran"} onSubmit={save} testId="expense-form"
      desc="Biaya langsung yang dikaitkan ke project otomatis masuk ke HPP project (tab Cost Allocation). Gaji project tetap dihitung dari timesheet agar tidak ganda.">
      <Grid>
        <Field f={{ k: "date", l: "Tanggal", t: "date", req: true }} value={f.date} onChange={set} />
        <Field f={{ k: "category", l: "Kategori", t: "select", req: true, o: CATEGORIES.map((c) => ({ v: c, l: CAT_LABEL[c] })) }} value={f.category} onChange={(k, v) => setF((x) => ({ ...x, category: v, account_id: "", component: v === "Direct Cost" ? "freelancer" : "" }))} />
        <Field f={{ k: "project_id", l: "Project (opsional)", t: "select", o: projectOpts(projects) }} value={f.project_id} onChange={(k, v) => setF((x) => ({ ...x, project_id: v, component: x.component || (x.category === "Direct Cost" ? "freelancer" : "") }))} />
        {f.project_id && compOpts.length > 0 && <Field f={{ k: "component", l: "Komponen biaya project", t: "select", o: compOpts.map(([v, l]) => ({ v, l })) }} value={f.component} onChange={set} />}
        <Field f={{ k: "account_id", l: "Akun COA", t: "select", o: accountOpts(refs.accounts, CAT_GROUPS[f.category]), hint: "Kosongkan untuk akun default kategori" }} value={f.account_id} onChange={set} />
        <Field f={{ k: "description", l: "Deskripsi", t: "textarea", req: true, wide: true, rows: 5, max: 255, hint: `${(f.description || "").length}/255 karakter` }} value={f.description} onChange={set} />
        <Field f={{ k: "dpp", l: "DPP (Rp)", t: "num", req: true }} value={f.dpp} onChange={set} />
        <Field f={{ k: "ppn_pct", l: "PPN Masukan (%)", t: "num" }} value={f.ppn_pct} onChange={set} />
        <Field f={{ k: "payment_method", l: "Metode pembayaran", t: "select", req: true, o: [{ v: "Transfer", l: "Transfer bank" }, { v: "Tunai", l: "Tunai / kas" }, { v: "Utang", l: "Belum dibayar (utang)" }] }} value={f.payment_method} onChange={set} />
        {f.payment_method !== "Utang" && <Field f={{ k: "bank_account_id", l: "Dibayar dari rekening", t: "select", req: true, o: bankOpts(refs["bank-accounts"]) }} value={f.bank_account_id} onChange={set} />}
        <Field f={{ k: "tax_classification", l: "Klasifikasi pajak", t: "select", req: true, o: TAX_CLASSES }} value={f.tax_classification} onChange={set} />
        <Field f={{ k: "fiscal_treatment", l: "Perlakuan fiskal", t: "select", req: true, o: FISCAL.map((v) => ({ v, l: FISCAL_LABEL[v] })) }} value={f.fiscal_treatment} onChange={set} />
        {f.fiscal_treatment !== "Deductible" && <Field f={{ k: "fiscal_reason", l: "Alasan perlakuan fiskal", req: true }} value={f.fiscal_reason} onChange={set} />}
        <Field f={{ k: "fiscal_reference", l: "Referensi aturan / dokumen" }} value={f.fiscal_reference} onChange={set} />
      </Grid>
      <ProofPicker file={file} setFile={setFile} />
      <div className="rounded-2xl bg-[#cddcf3] p-3 text-sm flex justify-between" data-testid="expense-form-total"><span>Total (DPP + PPN)</span><b className="num">{rp(dpp + ppn)}</b></div>
    </FormDialog>
  );
}

function ProofPicker({ file, setFile }) {
  const pick = (e) => {
    const x = e.target.files[0] || null;
    e.target.value = "";
    if (x && x.size > MAX) return toast.error("Ukuran file bukti maksimal 10 MB");
    setFile(x);
  };
  return (
    <div className="space-y-1.5" data-testid="expense-proof">
      <p className="text-xs font-semibold text-slate-600">Bukti pengeluaran (opsional)</p>
      <label className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 px-4 py-3 cursor-pointer hover:border-[#0f52ba] transition-colors">
        <Paperclip className="w-5 h-5 text-slate-400 shrink-0" />
        <span className="text-sm text-slate-600 truncate flex-1" data-testid="expense-proof-name">{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : "Upload nota / kwitansi / bukti transfer — PDF, JPG, PNG, XLSX (maks. 10 MB)"}</span>
        {file && <button type="button" onClick={(e) => { e.preventDefault(); setFile(null); }} className="text-slate-400 hover:text-red-500" data-testid="expense-proof-clear"><X className="w-4 h-4" /></button>}
        <input type="file" accept={ACCEPT} className="hidden" onChange={pick} data-testid="expense-proof-input" />
      </label>
    </div>
  );
}

function PayForm({ expense, onClose, onSaved }) {
  const refs = useRefs(["bank-accounts"]);
  const [f, set] = useForm({ date: today(), bank_account_id: "" });
  if (!expense) return null;
  return (
    <FormDialog open onClose={onClose} title={`Lunasi ${expense.number}`} desc={`Total ${rp(expense.total)} akan dibayar dari rekening terpilih.`} testId="expense-pay-form"
      onSubmit={async () => { await api.post(`/expenses/${expense.id}/pay`, f); toast.success("Utang dilunasi"); onSaved(); onClose(); }}>
      <Field f={{ k: "date", l: "Tanggal bayar", t: "date", req: true }} value={f.date} onChange={set} />
      <Field f={{ k: "bank_account_id", l: "Rekening", t: "select", req: true, o: bankOpts(refs["bank-accounts"]) }} value={f.bank_account_id} onChange={set} />
    </FormDialog>
  );
}

export function ExpenseTable({ items, onEdit, onPay, onDocs, onVoid }) {
  return (
    <DataTable testId="expenses-table" empty="Belum ada pengeluaran."
      cols={[{ l: "No. / tanggal" }, { l: "Deskripsi" }, { l: "Kategori · akun" }, { l: "Project" }, { l: "DPP", r: true }, { l: "PPN", r: true }, { l: "Total", r: true }, { l: "Fiskal" }, { l: "Status" }, { l: "" }]}
      rows={items.map((e) => ({ key: e.id, testId: `expense-row-${e.number}`, cells: [
        <div><p className="font-semibold">{e.number}</p><p className="text-xs text-slate-500">{tgl(e.date)}</p></div>,
        <div className="min-w-[240px] max-w-[360px] whitespace-normal"><p className="line-clamp-3" title={e.description}>{e.description}</p><p className="text-xs text-slate-500 truncate">{e.payment_method}</p></div>,
        <div className="max-w-[200px]"><p className="truncate">{CAT_LABEL[e.category] || e.category}</p><p className="text-xs text-slate-500 truncate">{e.account_name}</p></div>,
        <div className="max-w-[180px]"><p className="truncate text-xs">{e.project_name || "—"}</p>{e.component_label && <p className="text-[11px] text-[#0f52ba]">{e.component_label}</p>}</div>,
        rp(e.dpp), rp(e.ppn), <b>{rp(e.total)}</b>, <span className="text-xs">{FISCAL_LABEL[e.fiscal_treatment] || e.fiscal_treatment}</span>, <StatusBadge status={e.status} testId={`expense-status-${e.number}`} />,
        <div className="flex gap-1 justify-end">
          {e.status === "Unpaid" && <IconBtn onClick={() => onPay(e)} icon={CreditCard} title="Lunasi" testId={`expense-pay-${e.number}`} />}
          {e.status !== "Void" && <IconBtn onClick={() => onEdit(e)} icon={Pencil} title="Ubah" testId={`expense-edit-${e.number}`} />}
          <IconBtn onClick={() => onDocs(e)} icon={Paperclip} title="Dokumen" badge={e.documents} testId={`expense-docs-${e.number}`} />
          {e.status !== "Void" && <IconBtn onClick={() => onVoid(e)} icon={Ban} title="Batalkan" danger testId={`expense-void-${e.number}`} />}
        </div>] }))} />
  );
}

export function useExpenseActions(load) {
  const [edit, setEdit] = useState(null);
  const [pay, setPay] = useState(null);
  const [docs, setDocs] = useState(null);
  const [voiding, setVoiding] = useState(null);
  const handlers = { onEdit: setEdit, onPay: setPay, onVoid: setVoiding, onDocs: (e) => setDocs({ type: "expense", id: e.id, label: e.number, defaultType: "Nota Pembelian" }) };
  const dialogs = (
    <>
      <ExpenseForm open={!!edit} expense={edit} onClose={() => setEdit(null)} onSaved={load} />
      <PayForm expense={pay} onClose={() => setPay(null)} onSaved={load} />
      <DocsDialog target={docs} onClose={() => setDocs(null)} onChanged={load} />
      <ReasonDialog open={!!voiding} onClose={() => setVoiding(null)} title={`Batalkan ${voiding?.number}`} desc="Jurnal dibalik, mutasi kas dibatalkan, dan biaya project terkait dihapus dari HPP."
        onConfirm={async (reason) => { try { await api.post(`/expenses/${voiding.id}/void`, { reason }); toast.success("Pengeluaran dibatalkan"); load(); } catch (err) { toast.error(errMsg(err)); } }} />
    </>
  );
  return [handlers, dialogs];
}

export default function Expenses() {
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [create, setCreate] = useState(false);
  const load = useCallback(() => api.get("/expenses", { params: { status, category, q, page } }).then(({ data }) => setData(data)), [status, category, q, page]);
  useEffect(() => { load(); }, [load]);
  const [handlers, dialogs] = useExpenseActions(load);
  const exportBuild = () => ({ title: "Daftar Pengeluaran", total: true, columns: [{ k: "number", l: "No." }, { k: "date", l: "Tanggal" }, { k: "description", l: "Deskripsi" }, { k: "category", l: "Kategori" }, { k: "account_name", l: "Akun" }, { k: "project_name", l: "Project" }, { k: "dpp", l: "DPP", t: "rp" }, { k: "ppn", l: "PPN", t: "rp" }, { k: "total", l: "Total", t: "rp" }, { k: "fiscal_treatment", l: "Fiskal" }, { k: "status", l: "Status" }], rows: data?.items || [] });
  return (
    <div className="p-5 sm:p-8 lg:p-10" data-testid="expenses-page">
      <PageHeader eyebrow="Manajemen Pengeluaran" title="Pengeluaran" desc="Biaya langsung, gaji, overhead, administrasi, dan pembelian aset — lengkap dengan perlakuan fiskal dan lampiran bukti."
        actions={<><ExportMenu name="expenses" build={exportBuild} /><button className={btnDark} onClick={() => setCreate(true)} data-testid="expense-add-button"><Plus className="w-4 h-4" />Catat pengeluaran</button></>} />
      {data && (
        <div className="grid sm:grid-cols-3 gap-4 mb-6">
          <Stat tone="blue" label="Total pengeluaran (DPP)" value={rp(data.total_dpp)} testId="expenses-total-dpp" />
          <Stat tone="dark" label="Utang belum dibayar" value={rp(data.total_unpaid)} testId="expenses-total-unpaid" />
          <Stat label="Jumlah transaksi" value={data.total} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {["", "Unpaid", "Paid", "Void"].map((s) => <Pill key={s || "all"} active={status === s} onClick={() => { setStatus(s); setPage(1); }} testId={`expense-filter-${s || "all"}`}>{s ? statusLabel(s) : "Semua status"}</Pill>)}
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Cari no. / deskripsi" className="ml-auto h-10 px-4 rounded-full border border-slate-200 text-sm outline-none focus:border-[#0f52ba] w-64" data-testid="expense-search-input" />
      </div>
      <div className="flex flex-wrap gap-2 mb-5">
        {["", ...CATEGORIES].map((c) => <Pill key={c || "all"} active={category === c} onClick={() => { setCategory(c); setPage(1); }} testId={`expense-cat-${c || "all"}`}>{c ? CAT_LABEL[c] : "Semua kategori"}</Pill>)}
      </div>
      {!data ? <Loading /> : <><ExpenseTable items={data.items} {...handlers} /><Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} /></>}
      <ExpenseForm open={create} onClose={() => setCreate(false)} onSaved={load} />
      {dialogs}
    </div>
  );
}
