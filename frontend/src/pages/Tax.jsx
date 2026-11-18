import { useEffect, useState, useCallback } from "react";
import { Plus, FileCheck2, Paperclip, Ban, Landmark, Scale, BadgePercent, FileStack } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, Pill, Loading, StatusBadge, Field, btnDark, btnLight } from "@/components/kit";
import { DataTable, Stat, FormDialog, ReasonDialog, Grid, useForm, ExportMenu } from "@/components/fin";
import { DocsDialog } from "@/components/Documents";
import { IconBtn } from "@/pages/Incomes";
import { useRefs } from "@/pages/MasterData";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg } from "@/lib/api";
import { rp, pct, tgl, today, thisMonth, bulan } from "@/lib/format";
import { useProjects, projectOpts, refOpts, bankOpts, accountOpts } from "@/lib/lists";

export const TAX_KINDS = ["PPN Keluaran", "PPN Masukan", "PPh 23 Dipotong Customer", "PPh 21", "PPh 23 Dipungut", "PPh 4(2) Final", "PPh 25", "PPh Badan (PPh 29)"];
const MANUAL_KINDS = TAX_KINDS.slice(3);
const DOC_TYPES = ["Faktur Pajak", "Bukti Potong", "Bukti Setor"];

export function TaxRecordForm({ open, onClose, onSaved, preset = {} }) {
  const refs = useRefs(["entities", "customers", "vendors", "accounts"]);
  const projects = useProjects();
  const init = { kind: "PPh 23 Dipungut", date: today(), entity_id: "", project_id: "", party_id: "", dpp: "", rate: "", amount: "", doc_type: "", doc_number: "", due_date: "", description: "", debit_account_id: "" };
  const [f, set, setF] = useForm(init);
  useEffect(() => { if (open) setF({ ...init, entity_id: refs.entities?.[0]?.id || "", ...preset }); }, [open, refs.entities]); // eslint-disable-line react-hooks/exhaustive-deps
  const parties = [...(refs.customers || []), ...(refs.vendors || [])];
  const payable = !["PPh 25"].includes(f.kind);
  const calc = f.amount ? Number(f.amount) : (Number(f.dpp || 0) * Number(f.rate || 0)) / 100;
  const save = async () => { await api.post("/tax/records", f); toast.success("Catatan pajak disimpan"); onSaved(); onClose(); };
  return (
    <FormDialog open={open} onClose={onClose} wide title="Catat pajak manual" onSubmit={save} testId="tax-record-form"
      desc="PPN Keluaran/Masukan dan PPh 23 dipotong customer tercatat otomatis dari Pemasukan & Pengeluaran. Gunakan form ini untuk PPh 21/23 dipungut, PPh Final, PPh 25, dan PPh Badan.">
      <Grid>
        <Field f={{ k: "kind", l: "Jenis pajak", t: "select", req: true, o: MANUAL_KINDS }} value={f.kind} onChange={set} />
        <Field f={{ k: "date", l: "Tanggal", t: "date", req: true }} value={f.date} onChange={set} />
        <Field f={{ k: "entity_id", l: "Entitas", t: "select", o: refOpts(refs.entities) }} value={f.entity_id} onChange={set} />
        <Field f={{ k: "project_id", l: "Project (opsional)", t: "select", o: projectOpts(projects) }} value={f.project_id} onChange={set} />
        <Field f={{ k: "party_id", l: "Pihak (customer/vendor)", t: "select", o: refOpts(parties) }} value={f.party_id} onChange={set} />
        <Field f={{ k: "description", l: "Keterangan", req: true }} value={f.description} onChange={set} />
        <Field f={{ k: "dpp", l: "Dasar pengenaan (Rp)", t: "num" }} value={f.dpp} onChange={set} />
        <Field f={{ k: "rate", l: "Tarif (%)", t: "num" }} value={f.rate} onChange={set} />
        <Field f={{ k: "amount", l: "Nominal pajak (Rp)", t: "num", hint: "Kosongkan untuk DPP × tarif" }} value={f.amount} onChange={set} />
        <Field f={{ k: "due_date", l: "Jatuh tempo", t: "date", hint: "Kosongkan untuk jatuh tempo standar" }} value={f.due_date} onChange={set} />
        <Field f={{ k: "doc_type", l: "Jenis dokumen", t: "select", o: DOC_TYPES }} value={f.doc_type} onChange={set} />
        <Field f={{ k: "doc_number", l: "No. dokumen (faktur / bukti potong)" }} value={f.doc_number} onChange={set} />
        {payable && <Field f={{ k: "debit_account_id", l: "Akun lawan saat terutang", t: "select", o: accountOpts(refs.accounts), hint: "Kosongkan untuk akun default jenis pajak" }} value={f.debit_account_id} onChange={set} />}
      </Grid>
      <div className="rounded-2xl bg-[#cddcf3] p-3 text-sm flex justify-between" data-testid="tax-form-total"><span>Pajak {payable ? "terutang" : "dibayar di muka"}</span><b className="num">{rp(calc)}</b></div>
    </FormDialog>
  );
}

function DocForm({ rec, onClose, onSaved }) {
  const [f, set, setF] = useForm({ doc_type: "", doc_number: "", doc_date: "" });
  useEffect(() => { if (rec) setF({ doc_type: rec.doc_type || "Bukti Potong", doc_number: rec.doc_number || "", doc_date: rec.doc_date || "" }); }, [rec, setF]);
  if (!rec) return null;
  return (
    <FormDialog open onClose={onClose} title={`Dokumen pajak ${rec.number}`} desc="Nomor faktur pajak / bukti potong menjadi jejak rekonsiliasi." testId="tax-doc-form"
      onSubmit={async () => { await api.put(`/tax/records/${rec.id}/document`, f); toast.success("Dokumen pajak diperbarui"); onSaved(); onClose(); }}>
      <Field f={{ k: "doc_type", l: "Jenis dokumen", t: "select", req: true, o: DOC_TYPES }} value={f.doc_type} onChange={set} />
      <Field f={{ k: "doc_number", l: "Nomor dokumen", req: true }} value={f.doc_number} onChange={set} />
      <Field f={{ k: "doc_date", l: "Tanggal dokumen", t: "date" }} value={f.doc_date} onChange={set} />
    </FormDialog>
  );
}

function PayForm({ rec, onClose, onSaved }) {
  const refs = useRefs(["bank-accounts"]);
  const [f, set] = useForm({ date: today(), bank_account_id: "", ntpn: "" });
  if (!rec) return null;
  return (
    <FormDialog open onClose={onClose} title={`Setor ${rec.kind}`} desc={`${rec.number} · ${rp(rec.amount)} — jurnal & mutasi kas dibuat otomatis.`} testId="tax-pay-form"
      onSubmit={async () => { await api.post(`/tax/records/${rec.id}/pay`, f); toast.success("Pajak disetor"); onSaved(); onClose(); }}>
      <Field f={{ k: "date", l: "Tanggal setor", t: "date", req: true }} value={f.date} onChange={set} />
      <Field f={{ k: "bank_account_id", l: "Dari rekening", t: "select", req: true, o: bankOpts(refs["bank-accounts"]) }} value={f.bank_account_id} onChange={set} />
      <Field f={{ k: "ntpn", l: "NTPN / bukti setor" }} value={f.ntpn} onChange={set} />
    </FormDialog>
  );
}

export function TaxTable({ items, onChanged }) {
  const [doc, setDoc] = useState(null);
  const [pay, setPay] = useState(null);
  const [docs, setDocs] = useState(null);
  const [voiding, setVoiding] = useState(null);
  return (
    <>
      <DataTable testId="tax-records-table" empty="Belum ada catatan pajak."
        cols={[{ l: "No. / tanggal" }, { l: "Jenis" }, { l: "Pihak · project" }, { l: "DPP", r: true }, { l: "Tarif", r: true }, { l: "Pajak", r: true }, { l: "Dokumen" }, { l: "Jatuh tempo" }, { l: "Status" }, { l: "" }]}
        rows={items.map((r) => ({ key: r.id, testId: `tax-row-${r.number}`, cells: [
          <div><p className="font-semibold">{r.number}</p><p className="text-xs text-slate-500">{tgl(r.date)} · {r.source_type === "manual" ? "manual" : `dari ${r.source_type}`}</p></div>,
          <div className="max-w-[200px]"><p className="font-medium">{r.kind}</p><p className="text-xs text-slate-500 truncate">{r.description}</p></div>,
          <div className="max-w-[180px] text-xs"><p className="truncate">{r.party_name || "—"}</p><p className="truncate text-slate-500">{r.project_name || ""}</p></div>,
          rp(r.dpp), r.rate ? pct(r.rate) : "—", <b className={r.side === "credit" ? "text-[#0f52ba]" : ""}>{rp(r.amount)}</b>,
          <div className="text-xs"><p>{r.doc_type || "—"}</p><p className="text-slate-500">{r.doc_number || (r.ntpn ? `NTPN ${r.ntpn}` : "belum ada no.")}</p></div>,
          <span className={`text-xs ${r.overdue ? "text-red-600 font-semibold" : ""}`}>{tgl(r.due_date)}</span>,
          <StatusBadge status={r.status} testId={`tax-status-${r.number}`} />,
          <div className="flex gap-1 justify-end">
            {r.status === "Terutang" && ["manual", "payroll"].includes(r.source_type) && <IconBtn onClick={() => setPay(r)} icon={Landmark} title="Setor" testId={`tax-pay-${r.number}`} />}
            {r.status !== "Void" && <IconBtn onClick={() => setDoc(r)} icon={FileCheck2} title="No. faktur / bukti potong" testId={`tax-doc-${r.number}`} />}
            <IconBtn onClick={() => setDocs({ type: "tax", id: r.id, label: r.number, defaultType: r.doc_type || "Bukti Potong" })} icon={Paperclip} title="Lampiran" badge={r.documents} testId={`tax-attach-${r.number}`} />
            {r.source_type === "manual" && r.status !== "Void" && <IconBtn onClick={() => setVoiding(r)} icon={Ban} title="Batalkan" danger testId={`tax-void-${r.number}`} />}
          </div>] }))} />
      <DocForm rec={doc} onClose={() => setDoc(null)} onSaved={onChanged} />
      <PayForm rec={pay} onClose={() => setPay(null)} onSaved={onChanged} />
      <DocsDialog target={docs} onClose={() => setDocs(null)} onChanged={onChanged} />
      <ReasonDialog open={!!voiding} onClose={() => setVoiding(null)} title={`Batalkan ${voiding?.number}`} desc="Jurnal terutang/setoran dibalik dan mutasi kas dibatalkan."
        onConfirm={async (reason) => { try { await api.post(`/tax/records/${voiding.id}/void`, { reason }); toast.success("Catatan pajak dibatalkan"); onChanged(); } catch (e) { toast.error(errMsg(e)); } }} />
    </>
  );
}

export function TaxRecap({ recap }) {
  return (
    <DataTable testId="tax-recap-table" cols={[{ l: "Jenis pajak" }, { l: "Posisi" }, { l: "Transaksi", r: true }, { l: "DPP", r: true }, { l: "Pajak", r: true }]} empty="—"
      rows={recap.map((r) => ({ key: r.kind, cells: [r.kind, r.side === "payable" ? "Terutang / disetor" : "Kredit pajak", r.count, rp(r.dpp), <b>{rp(r.amount)}</b>] }))} />
  );
}

function Records() {
  const [kind, setKind] = useState("");
  const [period, setPeriod] = useState("");
  const [data, setData] = useState(null);
  const [create, setCreate] = useState(false);
  const load = useCallback(() => api.get("/tax/records", { params: { kind, period } }).then(({ data }) => setData(data)), [kind, period]);
  useEffect(() => { load(); }, [load]);
  const exportBuild = () => ({ title: "Rekap Pajak", total: true, subtitle: period ? `Masa ${period}` : "Semua masa", columns: [{ k: "number", l: "No." }, { k: "date", l: "Tanggal" }, { k: "kind", l: "Jenis" }, { k: "party_name", l: "Pihak" }, { k: "dpp", l: "DPP", t: "rp" }, { k: "rate", l: "Tarif", t: "pct" }, { k: "amount", l: "Pajak", t: "rp" }, { k: "doc_number", l: "No. dokumen" }, { k: "due_date", l: "Jatuh tempo" }, { k: "status", l: "Status" }], rows: data?.items || [] });
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48"><Field f={{ k: "period", l: "Masa pajak", t: "month" }} value={period} onChange={(_, v) => setPeriod(v)} /></div>
        {period && <button className={btnLight} onClick={() => setPeriod("")} data-testid="tax-period-clear">Semua masa</button>}
        <div className="ml-auto flex gap-2"><ExportMenu name="tax-records" build={exportBuild} /><button className={btnDark} onClick={() => setCreate(true)} data-testid="tax-add-button"><Plus className="w-4 h-4" />Catat pajak</button></div>
      </div>
      <div className="flex flex-wrap gap-2">{["", ...TAX_KINDS].map((k) => <Pill key={k || "all"} active={kind === k} onClick={() => setKind(k)} testId={`tax-kind-${k || "all"}`}>{k || "Semua jenis"}</Pill>)}</div>
      {!data ? <Loading /> : (
        <>
          <div className="grid sm:grid-cols-3 gap-4">
            <Stat tone="dark" label="Pajak terutang belum disetor" value={rp(data.total_payable)} testId="tax-total-payable" />
            <Stat tone="blue" label="Kredit pajak (masukan, potong, dibayar di muka)" value={rp(data.total_credit)} testId="tax-total-credit" />
            <Stat label="Jumlah catatan" value={data.items.length} />
          </div>
          <TaxRecap recap={data.recap} />
          <TaxTable items={data.items} onChanged={load} />
        </>
      )}
      <TaxRecordForm open={create} onClose={() => setCreate(false)} onSaved={load} />
    </div>
  );
}

function Reconciliation() {
  const refs = useRefs(["bank-accounts"]);
  const [period, setPeriod] = useState(thisMonth());
  const [d, setD] = useState(null);
  const [f, set] = useForm({ date: today(), bank_account_id: "", ntpn: "" });
  const [voidSettle, setVoidSettle] = useState(null);
  const load = useCallback(() => { setD(null); api.get("/tax/reconciliation", { params: { period } }).then(({ data }) => setD(data)); }, [period]);
  useEffect(() => { load(); }, [load]);
  const settle = async () => {
    try { const { data } = await api.post("/tax/ppn-settle", { period, ...f }); toast.success(`PPN masa ${period} diselesaikan, setor ${rp(data.paid)}`); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="space-y-6" data-testid="tax-reconciliation">
      <div className="w-48"><Field f={{ k: "period", l: "Masa PPN", t: "month" }} value={period} onChange={(_, v) => setPeriod(v)} /></div>
      {!d ? <Loading /> : (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
            <Stat label="PPN Keluaran (terbuka)" value={rp(d.ppn.keluaran)} testId="recon-ppn-out" />
            <Stat tone="blue" label="PPN Masukan (dikreditkan)" value={rp(d.ppn.masukan)} testId="recon-ppn-in" />
            <Stat tone="dark" label={`Posisi: ${d.ppn.status}`} value={rp(Math.abs(d.ppn.net))} testId="recon-ppn-net" />
            <div className="rounded-[24px] border-2 border-[#12151c] p-4 space-y-2" data-testid="ppn-settle-card">
              <p className="text-sm font-semibold">Setor / kompensasi PPN {bulan(period)}</p>
              <Field f={{ k: "date", l: "Tanggal", t: "date" }} value={f.date} onChange={set} />
              {d.ppn.net > 0 && <Field f={{ k: "bank_account_id", l: "Rekening", t: "select", o: bankOpts(refs["bank-accounts"]) }} value={f.bank_account_id} onChange={set} />}
              <Field f={{ k: "ntpn", l: "NTPN" }} value={f.ntpn} onChange={set} />
              <button className={`${btnDark} w-full justify-center`} onClick={settle} disabled={d.ppn.net < 0 || (!d.ppn.keluaran && !d.ppn.masukan)} data-testid="ppn-settle-button"><Scale className="w-4 h-4" />Proses masa PPN</button>
              {d.ppn.net < 0 && <p className="text-[11px] text-slate-500">Lebih bayar — dikompensasikan ke masa berikutnya.</p>}
              {d.settlements.map((x) => <button key={x.id} onClick={() => setVoidSettle(x)} className="w-full text-xs font-semibold text-red-600" data-testid={`ppn-settle-void-${x.id}`}>Batalkan setoran {tgl(x.date)} · {rp(x.paid)}</button>)}
            </div>
          </div>
          <div>
            <p className="font-semibold mb-2">Rekonsiliasi catatan pajak vs buku besar</p>
            <DataTable testId="tax-recon-checks" cols={[{ l: "Akun" }, { l: "Catatan pajak", r: true }, { l: "Buku besar", r: true }, { l: "Selisih", r: true }, { l: "Status" }]}
              rows={d.checks.map((c) => ({ key: c.code, testId: `recon-check-${c.code}`, cells: [`${c.code} · ${c.label}`, rp(c.records), rp(c.ledger), rp(c.difference), <span className={`text-xs font-semibold ${c.matched ? "text-[#0f52ba]" : "text-red-600"}`}>{c.matched ? "Cocok" : "Perlu ditelusuri"}</span>] }))} />
          </div>
          <div>
            <p className="font-semibold mb-2">Bukti pajak belum lengkap</p>
            <TaxTable items={d.missing_documents} onChanged={load} />
          </div>
        </>
      )}
      <ReasonDialog open={!!voidSettle} onClose={() => setVoidSettle(null)} title="Batalkan setoran PPN" desc="Jurnal dibalik, mutasi kas dibatalkan, status PPN dikembalikan."
        onConfirm={async (reason) => { try { await api.post(`/tax/ppn-settle/${voidSettle.id}/void`, { reason }); toast.success("Setoran PPN dibatalkan"); load(); } catch (e) { toast.error(errMsg(e)); } }} />
    </div>
  );
}

function Corrections() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(false);
  const [voiding, setVoiding] = useState(null);
  const [f, set, setF] = useForm({});
  const load = useCallback(() => api.get("/tax/corrections", { params: { year } }).then(({ data }) => setD(data)), [year]);
  useEffect(() => { load(); }, [load]);
  const rows = d ? [...d.auto, ...d.manual] : [];
  return (
    <div className="space-y-5" data-testid="tax-corrections">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-36"><Field f={{ k: "year", l: "Tahun pajak", t: "num" }} value={year} onChange={(_, v) => setYear(Number(v) || new Date().getFullYear())} /></div>
        <button className={`${btnDark} ml-auto`} onClick={() => { setF({ date: today(), description: "", direction: "Positif", category: "Beda Tetap", amount: "", reference: "" }); setOpen(true); }} data-testid="correction-add-button"><Plus className="w-4 h-4" />Koreksi manual</button>
      </div>
      <p className="text-sm text-slate-500">Koreksi otomatis berasal dari perlakuan fiskal pengeluaran (Non-deductible → beda tetap, Temporary Difference → beda waktu) dan penghasilan PPh Final. "Perlu review" belum dihitung sampai diklasifikasikan.</p>
      {!d ? <Loading /> : (
        <DataTable testId="corrections-table" empty="Belum ada koreksi fiskal."
          cols={[{ l: "Tanggal" }, { l: "Uraian" }, { l: "Arah" }, { l: "Kategori" }, { l: "Nominal", r: true }, { l: "Dasar / alasan" }, { l: "Sumber" }, { l: "" }]}
          rows={rows.map((c) => ({ key: c.id, cells: [tgl(c.date), <span className="max-w-[260px] block truncate">{c.description}</span>,
            <span className={`text-xs font-semibold ${c.direction === "Positif" ? "text-red-600" : "text-[#0f52ba]"}`}>{c.direction}</span>, c.category, rp(c.amount),
            <span className="text-xs max-w-[200px] block truncate">{c.reference || "—"}</span>, c.auto ? "Otomatis" : (c.included ? "Manual" : "Dibatalkan"),
            !c.auto && c.included ? <IconBtn onClick={() => setVoiding(c)} icon={Ban} title="Batalkan" danger testId={`correction-void-${c.id}`} /> : null] }))} />
      )}
      <FormDialog open={open} onClose={() => setOpen(false)} title="Koreksi fiskal manual" testId="correction-form"
        onSubmit={async () => { await api.post("/tax/corrections", f); toast.success("Koreksi fiskal dicatat"); setOpen(false); load(); }}>
        <Grid>
          <Field f={{ k: "date", l: "Tanggal", t: "date", req: true }} value={f.date} onChange={set} />
          <Field f={{ k: "amount", l: "Nominal (Rp)", t: "num", req: true }} value={f.amount} onChange={set} />
          <Field f={{ k: "direction", l: "Arah koreksi", t: "select", req: true, o: ["Positif", "Negatif"] }} value={f.direction} onChange={set} />
          <Field f={{ k: "category", l: "Kategori", t: "select", req: true, o: ["Beda Tetap", "Beda Waktu"] }} value={f.category} onChange={set} />
          <Field f={{ k: "description", l: "Uraian", req: true, wide: true }} value={f.description} onChange={set} />
          <Field f={{ k: "reference", l: "Dasar hukum / dokumen", wide: true }} value={f.reference} onChange={set} />
        </Grid>
      </FormDialog>
      <ReasonDialog open={!!voiding} onClose={() => setVoiding(null)} title="Batalkan koreksi fiskal"
        onConfirm={async (reason) => { await api.post(`/tax/corrections/${voiding.id}/void`, { reason }); toast.success("Koreksi dibatalkan"); load(); }} />
    </div>
  );
}

function Rules() {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [f, set, setF] = useForm({});
  const load = () => api.get("/tax/rules").then(({ data }) => setD(data));
  useEffect(() => { load(); }, []);
  const open = (r) => { setF(r ? { code: r.code, name: r.name, tax_type: r.tax_type, rate: r.rate, base: r.base || "", criteria: r.criteria || "", effective_from: today(), legal_basis: r.legal_basis || "" } : { code: "", name: "", tax_type: "", rate: "", base: "", criteria: "", effective_from: today(), legal_basis: "" }); setForm(r ? "revise" : "new"); };
  return (
    <div className="space-y-5" data-testid="tax-rules">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-slate-500 max-w-2xl">Tarif, dasar pengenaan, kriteria, periode berlaku, dan dasar hukum disimpan berversi. Perubahan membuat versi baru tanpa mengubah transaksi lama.</p>
        {user?.role === "owner" && <button className={`${btnDark} ml-auto`} onClick={() => open(null)} data-testid="rule-add-button"><Plus className="w-4 h-4" />Aturan baru</button>}
      </div>
      {!d ? <Loading /> : (
        <DataTable testId="tax-rules-table" cols={[{ l: "Kode · versi" }, { l: "Nama" }, { l: "Jenis" }, { l: "Tarif", r: true }, { l: "Dasar pengenaan" }, { l: "Berlaku" }, { l: "Dasar hukum" }, { l: "" }]}
          rows={d.items.map((r) => ({ key: r.id, testId: `rule-row-${r.code}-${r.version}`, cells: [<div><b>{r.code}</b><p className="text-xs text-slate-500">v{r.version}{r.in_effect && <span className="ml-1 text-[#0f52ba] font-semibold">· berlaku</span>}</p></div>,
            r.name, r.tax_type, pct(r.rate), <span className="text-xs">{r.base || "—"}</span>, <span className="text-xs">{tgl(r.effective_from)} – {r.effective_to ? tgl(r.effective_to) : "sekarang"}</span>,
            <span className="text-xs max-w-[200px] block truncate">{r.legal_basis || "—"}</span>,
            user?.role === "owner" && r.in_effect ? <button className="text-xs font-semibold text-[#0f52ba]" onClick={() => open(r)} data-testid={`rule-revise-${r.code}`}>Versi baru</button> : null] }))} />
      )}
      <FormDialog open={!!form} onClose={() => setForm(null)} wide title={form === "revise" ? `Versi baru ${f.code}` : "Aturan pajak baru"} testId="rule-form"
        onSubmit={async () => { await api.post("/tax/rules", f); toast.success("Aturan pajak disimpan"); setForm(null); load(); }}>
        <Grid>
          <Field f={{ k: "code", l: "Kode", req: true }} value={f.code} onChange={form === "revise" ? () => {} : set} />
          <Field f={{ k: "name", l: "Nama", req: true }} value={f.name} onChange={set} />
          <Field f={{ k: "tax_type", l: "Jenis pajak", req: true }} value={f.tax_type} onChange={set} />
          <Field f={{ k: "rate", l: "Tarif (%)", t: "num", req: true }} value={f.rate} onChange={set} />
          <Field f={{ k: "base", l: "Dasar pengenaan" }} value={f.base} onChange={set} />
          <Field f={{ k: "criteria", l: "Kriteria" }} value={f.criteria} onChange={set} />
          <Field f={{ k: "effective_from", l: "Berlaku mulai", t: "date", req: true }} value={f.effective_from} onChange={set} />
          <Field f={{ k: "legal_basis", l: "Dasar hukum" }} value={f.legal_basis} onChange={set} />
        </Grid>
      </FormDialog>
    </div>
  );
}

const TABS = [["records", "Rekap & transaksi", FileStack], ["recon", "Rekonsiliasi", Scale], ["corrections", "Koreksi fiskal", BadgePercent], ["rules", "Aturan pajak", FileCheck2]];

export default function Tax() {
  return (
    <div className="p-5 sm:p-8 lg:p-10" data-testid="tax-page">
      <PageHeader eyebrow="Tax Management" title="Pajak" desc="PPN Keluaran/Masukan, faktur pajak, PPh 21/23/Final/25/Badan, bukti potong, kredit pajak, koreksi fiskal, dan rekonsiliasi — tertelusur ke transaksi dan bukti." />
      <Tabs defaultValue="records">
        <TabsList className="h-auto p-1.5 rounded-full bg-[#eef1f5] flex-wrap justify-start" data-testid="tax-tabs">
          {TABS.map(([v, l, Icon]) => <TabsTrigger key={v} value={v} className="rounded-full px-5 h-10 gap-2 data-[state=active]:bg-[#12151c] data-[state=active]:text-white" data-testid={`tax-tab-${v}`}><Icon className="w-4 h-4" />{l}</TabsTrigger>)}
        </TabsList>
        <div className="mt-6">
          <TabsContent value="records"><Records /></TabsContent>
          <TabsContent value="recon"><Reconciliation /></TabsContent>
          <TabsContent value="corrections"><Corrections /></TabsContent>
          <TabsContent value="rules"><Rules /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
