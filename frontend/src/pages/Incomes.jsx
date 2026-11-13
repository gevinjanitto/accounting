import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Wallet, Pencil, Ban, Paperclip, Eye } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, Pill, Pager, Loading, StatusBadge, Field, btnDark, statusLabel } from "@/components/kit";
import { DataTable, Stat, FormDialog, ReasonDialog, Grid, useForm, ExportMenu, TAX_CLASSES } from "@/components/fin";
import { DocsDialog } from "@/components/Documents";
import { useRefs } from "@/pages/MasterData";
import { api, errMsg } from "@/lib/api";
import { rp, tgl, today } from "@/lib/format";
import { useProjects, projectOpts, accountOpts, bankOpts, refOpts } from "@/lib/lists";

const STATUSES = ["Unpaid", "Partial", "Paid", "Void"];
const PAYER = [{ v: "client", l: "Client" }, { v: "kita", l: "Kita (perusahaan)" }];
const payerLabel = (v) => (v === "kita" ? "Kita" : "Client");
const blank = (entity) => ({ date: today(), invoice_number: "", invoice_date: today(), due_date: "", entity_id: entity || "", customer_id: "", project_id: "", revenue_account_id: "", description: "", dpp: "", ppn_pct: 11, pph_pct: 2, ppn_paid_by: "client", pph_paid_by: "kita", tax_classification: TAX_CLASSES[0] });

export const incomeCalc = (f) => {
  const dpp = Number(f.dpp || 0), ppn = (dpp * Number(f.ppn_pct || 0)) / 100, pph = (dpp * Number(f.pph_pct || 0)) / 100;
  const ppnKita = f.ppn_paid_by === "kita" ? ppn : 0, pphKita = f.pph_paid_by === "kita" ? pph : 0;
  const tagihan = dpp + ppn - ppnKita;
  return { dpp, ppn, pph, tagihan, diterima: tagihan - pphKita, bersih: dpp - ppnKita - pphKita };
};

export function IncomeForm({ open, onClose, income, onSaved, presetProject }) {
  const refs = useRefs(["entities", "customers", "accounts"]);
  const projects = useProjects();
  const [f, set, setF] = useForm(blank());
  useEffect(() => {
    if (!open) return;
    if (income) setF({ ...blank(), ...Object.fromEntries(Object.keys(blank()).map((k) => [k, income[k] ?? ""])) });
    else {
      const p = projects.find((x) => x.id === presetProject);
      setF({ ...blank(refs.entities?.[0]?.id), ...(p ? { project_id: p.id, customer_id: p.customer_id || "", entity_id: p.entity_id } : {}) });
    }
  }, [open, income, presetProject, refs.entities, projects, setF]);
  const pickProject = (k, v) => {
    const p = projects.find((x) => x.id === v);
    setF((x) => ({ ...x, project_id: v, ...(p ? { customer_id: p.customer_id || x.customer_id, entity_id: p.entity_id } : {}) }));
  };
  const c = incomeCalc(f);
  const save = async () => {
    if (income) await api.put(`/incomes/${income.id}`, f); else await api.post("/incomes", f);
    toast.success(income ? "Pemasukan diperbarui" : "Pemasukan dicatat & dijurnal otomatis");
    onSaved(); onClose();
  };
  return (
    <FormDialog open={open} onClose={onClose} wide title={income ? `Ubah ${income.number}` : "Catat pemasukan / invoice"} desc="PPN dicatat terpisah sebagai PPN Keluaran dan bukan pendapatan. Pilih siapa yang membayar PPN dan PPh; bila dibayar kita, nilainya mengurangi pemasukan bersih." onSubmit={save} testId="income-form">
      <Grid>
        <Field f={{ k: "date", l: "Tanggal pengakuan", t: "date", req: true }} value={f.date} onChange={set} />
        <Field f={{ k: "invoice_number", l: "No. invoice" }} value={f.invoice_number} onChange={set} />
        <Field f={{ k: "invoice_date", l: "Tanggal invoice", t: "date" }} value={f.invoice_date} onChange={set} />
        <Field f={{ k: "due_date", l: "Jatuh tempo", t: "date" }} value={f.due_date} onChange={set} />
        <Field f={{ k: "project_id", l: "Project", t: "select", o: projectOpts(projects) }} value={f.project_id} onChange={pickProject} />
        <Field f={{ k: "entity_id", l: "Entitas pemilik pendapatan", t: "select", req: true, o: refOpts(refs.entities) }} value={f.entity_id} onChange={set} />
        <Field f={{ k: "customer_id", l: "Customer", t: "select", o: refOpts(refs.customers) }} value={f.customer_id} onChange={set} />
        <Field f={{ k: "revenue_account_id", l: "Akun pendapatan", t: "select", o: accountOpts(refs.accounts, ["4000"]), hint: "Default 4100 Pendapatan Project" }} value={f.revenue_account_id} onChange={set} />
        <Field f={{ k: "dpp", l: "DPP / nilai sebelum PPN (Rp)", t: "num", req: true }} value={f.dpp} onChange={set} />
        <Field f={{ k: "tax_classification", l: "Klasifikasi pajak", t: "select", req: true, o: TAX_CLASSES }} value={f.tax_classification} onChange={set} />
        <Field f={{ k: "ppn_pct", l: "PPN (%)", t: "num" }} value={f.ppn_pct} onChange={set} />
        <Field f={{ k: "ppn_paid_by", l: "PPN dibayar oleh", t: "select", req: true, o: PAYER }} value={f.ppn_paid_by} onChange={set} />
        <Field f={{ k: "pph_pct", l: "PPh (%)", t: "num" }} value={f.pph_pct} onChange={set} />
        <Field f={{ k: "pph_paid_by", l: "PPh dibayar oleh", t: "select", req: true, o: PAYER }} value={f.pph_paid_by} onChange={set} />
        <Field f={{ k: "description", l: "Keterangan", wide: true }} value={f.description} onChange={set} />
      </Grid>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm" data-testid="income-form-preview">
        {[["DPP", c.dpp, "dpp"], [`PPN (dibayar ${payerLabel(f.ppn_paid_by)})`, c.ppn, "ppn"], [`PPh (dibayar ${payerLabel(f.pph_paid_by)})`, c.pph, "pph"],
          ["Total tagihan ke client", c.tagihan, "tagihan"], ["Nilai diterima", c.diterima, "diterima"], ["Pemasukan bersih", c.bersih, "bersih"]].map(([l, v, k]) => (
          <div key={k} className={`rounded-2xl p-3 ${k === "bersih" ? "bg-[#cddcf3]" : "bg-[#f4f6f9]"}`} data-testid={`income-preview-${k}`}><p className="text-xs text-slate-500">{l}</p><p className="font-bold num">{rp(v)}</p></div>
        ))}
      </div>
    </FormDialog>
  );
}

function PaymentForm({ income, onClose, onSaved }) {
  const refs = useRefs(["bank-accounts"]);
  const [f, set, setF] = useForm({ date: today(), amount: "", bank_account_id: "", note: "" });
  useEffect(() => { if (income) setF({ date: today(), amount: income.outstanding, bank_account_id: "", note: "" }); }, [income, setF]);
  if (!income) return null;
  return (
    <FormDialog open onClose={onClose} title={`Terima pembayaran ${income.invoice_number || income.number}`} desc={`Sisa piutang ${rp(income.outstanding)}. Pembayaran dapat dicatat beberapa kali (termin/parsial).`} testId="income-payment-form"
      onSubmit={async () => { await api.post(`/incomes/${income.id}/payments`, f); toast.success("Pembayaran dicatat ke rekening"); onSaved(); onClose(); }}>
      <Field f={{ k: "date", l: "Tanggal terima", t: "date", req: true }} value={f.date} onChange={set} />
      <Field f={{ k: "amount", l: "Nominal diterima (Rp)", t: "num", req: true }} value={f.amount} onChange={set} />
      <Field f={{ k: "bank_account_id", l: "Rekening penerima", t: "select", req: true, o: bankOpts(refs["bank-accounts"]), hint: "Dana CV yang masuk ke rekening pribadi dicatat lewat rekening jenis Penampung." }} value={f.bank_account_id} onChange={set} />
      <Field f={{ k: "note", l: "Catatan" }} value={f.note} onChange={set} />
    </FormDialog>
  );
}

function DetailDialog({ income, onClose, onChanged }) {
  const [voidPay, setVoidPay] = useState(null);
  if (!income) return null;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-[28px] max-w-2xl" data-testid="income-detail-dialog">
        <DialogHeader><DialogTitle>{income.number} · {income.invoice_number || "tanpa no. invoice"}</DialogTitle><DialogDescription>{income.description}</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          {[["DPP", income.dpp], [`PPN (dibayar ${payerLabel(income.ppn_paid_by)})`, income.ppn], [`PPh (dibayar ${payerLabel(income.pph_paid_by)})`, income.pph], ["Total tagihan", income.total], ["Nilai diterima", income.net_receivable], ["Pemasukan bersih", income.net_income]].map(([l, v]) => <div key={l} className="rounded-2xl bg-[#f4f6f9] p-3"><p className="text-xs text-slate-500">{l}</p><p className="font-bold num">{rp(v)}</p></div>)}
        </div>
        <p className="font-semibold mt-2">Riwayat pembayaran</p>
        <DataTable cols={[{ l: "Tanggal" }, { l: "Rekening" }, { l: "Nominal", r: true }, { l: "Status" }, { l: "" }]} empty="Belum ada pembayaran."
          rows={income.payments.map((p) => ({ key: p.id, cells: [tgl(p.date), p.bank_name, rp(p.amount), p.is_void ? <StatusBadge status="Void" /> : <StatusBadge status="Paid" />,
            !p.is_void && <button className="text-xs font-semibold text-red-600" onClick={() => setVoidPay(p)} data-testid={`payment-void-${p.id}`}>Batalkan</button>] }))} />
        <ReasonDialog open={!!voidPay} onClose={() => setVoidPay(null)} title="Batalkan pembayaran" desc="Mutasi kas dan jurnal akan dibalik (tidak dihapus)."
          onConfirm={async (reason) => { await api.post(`/incomes/${income.id}/payments/${voidPay.id}/void`, { reason }); toast.success("Pembayaran dibatalkan"); onChanged(); onClose(); }} />
      </DialogContent>
    </Dialog>
  );
}

export function IncomeTable({ items, onPay, onEdit, onDocs, onVoid, onDetail }) {
  return (
    <DataTable testId="incomes-table" empty="Belum ada pemasukan."
      cols={[{ l: "No. / tanggal" }, { l: "Invoice" }, { l: "Customer · project" }, { l: "DPP", r: true }, { l: "PPN", r: true }, { l: "PPh", r: true }, { l: "Bersih", r: true }, { l: "Diterima", r: true }, { l: "Sisa", r: true }, { l: "Status" }, { l: "" }]}
      rows={items.map((i) => ({ key: i.id, testId: `income-row-${i.number}`, cells: [
        <div><p className="font-semibold">{i.number}</p><p className="text-xs text-slate-500">{tgl(i.date)}</p></div>,
        <div><p>{i.invoice_number || "—"}</p><p className="text-xs text-slate-500">{i.due_date ? `JT ${tgl(i.due_date)}` : ""}</p></div>,
        <div className="max-w-[220px]"><p className="truncate">{i.customer_name || "—"}</p><p className="text-xs text-slate-500 truncate">{i.project_name || i.entity_name}</p></div>,
        <div><p>{rp(i.dpp)}</p></div>, <div data-testid={`income-ppn-${i.number}`}><p>{rp(i.ppn)}</p><p className="text-[11px] text-slate-500">dibayar {payerLabel(i.ppn_paid_by)}</p></div>,
        <div data-testid={`income-pph-${i.number}`}><p>{rp(i.pph)}</p><p className="text-[11px] text-slate-500">dibayar {payerLabel(i.pph_paid_by)}</p></div>, rp(i.net_income), rp(i.paid_amount), <b>{rp(i.outstanding)}</b>, <StatusBadge status={i.status} testId={`income-status-${i.number}`} />,
        <div className="flex gap-1 justify-end">
          <IconBtn onClick={() => onDetail(i)} icon={Eye} title="Detail" testId={`income-detail-${i.number}`} />
          {i.status !== "Void" && i.status !== "Paid" && <IconBtn onClick={() => onPay(i)} icon={Wallet} title="Terima pembayaran" testId={`income-pay-${i.number}`} />}
          {i.status === "Unpaid" && <IconBtn onClick={() => onEdit(i)} icon={Pencil} title="Ubah" testId={`income-edit-${i.number}`} />}
          <IconBtn onClick={() => onDocs(i)} icon={Paperclip} title="Dokumen" badge={i.documents} testId={`income-docs-${i.number}`} />
          {i.status === "Unpaid" && <IconBtn onClick={() => onVoid(i)} icon={Ban} title="Batalkan" danger testId={`income-void-${i.number}`} />}
        </div>] }))} />
  );
}

export function IconBtn({ onClick, icon: Icon, title, danger, badge, testId }) {
  return (
    <button type="button" onClick={onClick} title={title} data-testid={testId}
      className={`relative w-9 h-9 grid place-items-center rounded-full border border-slate-200 transition-colors ${danger ? "text-red-500 hover:bg-red-50" : "hover:bg-[#12151c] hover:text-white"}`}>
      <Icon className="w-4 h-4" />
      {badge > 0 && <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#0f52ba] text-white text-[9px] font-bold grid place-items-center">{badge}</span>}
    </button>
  );
}

export function useIncomeActions(load) {
  const [pay, setPay] = useState(null);
  const [edit, setEdit] = useState(null);
  const [docs, setDocs] = useState(null);
  const [voiding, setVoiding] = useState(null);
  const [detail, setDetail] = useState(null);
  const handlers = { onPay: setPay, onEdit: setEdit, onDocs: (i) => setDocs({ type: "income", id: i.id, label: i.number, defaultType: "Invoice" }), onVoid: setVoiding, onDetail: setDetail };
  const dialogs = (
    <>
      <PaymentForm income={pay} onClose={() => setPay(null)} onSaved={load} />
      <IncomeForm open={!!edit} income={edit} onClose={() => setEdit(null)} onSaved={load} />
      <DocsDialog target={docs} onClose={() => setDocs(null)} onChanged={load} />
      <DetailDialog income={detail} onClose={() => setDetail(null)} onChanged={load} />
      <ReasonDialog open={!!voiding} onClose={() => setVoiding(null)} title={`Batalkan ${voiding?.number}`} desc="Transaksi posted tidak dihapus; sistem membuat jurnal pembalik."
        onConfirm={async (reason) => { try { await api.post(`/incomes/${voiding.id}/void`, { reason }); toast.success("Pemasukan dibatalkan"); load(); } catch (err) { toast.error(errMsg(err)); } }} />
    </>
  );
  return [handlers, dialogs];
}

export default function Incomes() {
  const [sp] = useSearchParams();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState(sp.get("q") || "");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [create, setCreate] = useState(false);
  const load = useCallback(() => api.get("/incomes", { params: { status, q, page } }).then(({ data }) => setData(data)), [status, q, page]);
  useEffect(() => { load(); }, [load]);
  const [handlers, dialogs] = useIncomeActions(load);
  const exportBuild = () => ({ title: "Daftar Pemasukan", total: true, columns: [{ k: "number", l: "No." }, { k: "date", l: "Tanggal" }, { k: "invoice_number", l: "Invoice" }, { k: "customer_name", l: "Customer" }, { k: "project_name", l: "Project" }, { k: "dpp", l: "DPP", t: "rp" }, { k: "ppn", l: "PPN", t: "rp" }, { k: "ppn_paid_by", l: "PPN dibayar" }, { k: "pph", l: "PPh", t: "rp" }, { k: "pph_paid_by", l: "PPh dibayar" }, { k: "net_income", l: "Pemasukan bersih", t: "rp" }, { k: "paid_amount", l: "Diterima", t: "rp" }, { k: "outstanding", l: "Sisa", t: "rp" }, { k: "status", l: "Status" }], rows: data?.items || [] });
  return (
    <div className="p-5 sm:p-8 lg:p-10" data-testid="incomes-page">
      <PageHeader eyebrow="Manajemen Pemasukan" title="Pemasukan" desc="Invoice, termin, dan piutang. Setiap pemasukan dijurnal otomatis; PPN dipisahkan dari pendapatan."
        actions={<><ExportMenu name="incomes" build={exportBuild} /><button className={btnDark} onClick={() => setCreate(true)} data-testid="income-add-button"><Plus className="w-4 h-4" />Catat pemasukan</button></>} />
      {data && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Stat tone="blue" label="Total pendapatan (DPP)" value={rp(data.total_dpp)} testId="incomes-total-dpp" />
          <Stat label="Total PPN" value={rp(data.total_ppn)} testId="incomes-total-ppn" />
          <Stat tone="dark" label="Piutang belum diterima" value={rp(data.total_outstanding)} testId="incomes-total-outstanding" />
          <Stat label="Jumlah transaksi" value={data.total} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <Pill active={!status} onClick={() => { setStatus(""); setPage(1); }} testId="income-filter-all">Semua</Pill>
        {STATUSES.map((s) => <Pill key={s} active={status === s} onClick={() => { setStatus(s); setPage(1); }} testId={`income-filter-${s}`}>{statusLabel(s)}</Pill>)}
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Cari no. / invoice / keterangan" className="ml-auto h-10 px-4 rounded-full border border-slate-200 text-sm outline-none focus:border-[#0f52ba] w-64" data-testid="income-search-input" />
      </div>
      {!data ? <Loading /> : <><IncomeTable items={data.items} {...handlers} /><Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} /></>}
      <IncomeForm open={create} onClose={() => setCreate(false)} onSaved={load} />
      {dialogs}
    </div>
  );
}
