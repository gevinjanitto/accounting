import { useEffect, useState, useCallback } from "react";
import { Plus, Send, Ban, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Loading, StatusBadge, Field, btnDark, btnLight, Empty } from "@/components/kit";
import { DataTable, Stat, FormDialog, ReasonDialog, useForm, ExportMenu } from "@/components/fin";
import { useRefs } from "@/pages/MasterData";
import { api, errMsg } from "@/lib/api";
import { rp, pct, tgl, today, thisMonth, bulan } from "@/lib/format";
import { refOpts, bankOpts } from "@/lib/lists";
import { NumberInput } from "@/components/NumberInput";

function NumCell({ value, onSave, testId }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <NumberInput value={v} onChange={setV} onBlur={() => Number(v) !== Number(value) && onSave(v)}
    className="w-28 h-9 rounded-xl border border-slate-200 px-2 text-right text-sm outline-none focus:border-[#0f52ba]" data-testid={testId} />;
}

function RunDetail({ run, onChanged }) {
  const refs = useRefs(["bank-accounts"]);
  const [bank, setBank] = useState("");
  const [voiding, setVoiding] = useState(false);
  const draft = run.status === "Draft";
  const upd = async (l, k, v) => { try { await api.put(`/payroll/runs/${run.id}/lines/${l.id}`, { [k]: v }); onChanged(); } catch (e) { toast.error(errMsg(e)); } };
  const post = async () => { try { await api.post(`/payroll/runs/${run.id}/post`, { bank_account_id: bank }); toast.success("Payroll diposting: jurnal, mutasi kas & PPh 21 dibuat"); onChanged(); } catch (e) { toast.error(errMsg(e)); } };
  const del = async () => { await api.delete(`/payroll/runs/${run.id}`); toast.success("Draft dihapus"); onChanged(true); };
  const cell = (l, k) => (draft ? <NumCell value={l[k]} onSave={(v) => upd(l, k, v)} testId={`payroll-${k}-${l.employee_code}`} /> : k === "pph21_rate" ? pct(l[k]) : rp(l[k]));
  const exportBuild = () => ({ title: `Payroll ${run.number}`, total: true, subtitle: `Periode ${run.period}`, columns: [{ k: "employee_name", l: "Karyawan" }, { k: "base_salary", l: "Gaji pokok", t: "rp" }, { k: "allowance", l: "Tunjangan", t: "rp" }, { k: "other_income", l: "Lainnya", t: "rp" }, { k: "gross", l: "Bruto", t: "rp" }, { k: "pph21", l: "PPh 21", t: "rp" }, { k: "deductions", l: "Potongan", t: "rp" }, { k: "net", l: "Bersih", t: "rp" }, { k: "allocated_to_projects", l: "Teralokasi project", t: "rp" }], rows: run.lines });
  return (
    <div className="space-y-5" data-testid="payroll-detail">
      <div className="flex flex-wrap items-center gap-3">
        <div><p className="text-xl font-bold">{run.number} · {bulan(run.period)}</p><p className="text-xs text-slate-500">Dibayar {tgl(run.pay_date)} · <StatusBadge status={run.status} testId="payroll-status" /></p></div>
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <ExportMenu name="payroll" build={exportBuild} />
          {draft && <><div className="w-60"><Field f={{ k: "bank", l: "Bayar dari rekening", t: "select", o: bankOpts(refs["bank-accounts"]) }} value={bank} onChange={(_, v) => setBank(v)} /></div>
            <button className={btnDark} disabled={!bank} onClick={post} data-testid="payroll-post-button"><Send className="w-4 h-4" />Posting payroll</button>
            <button className={btnLight} onClick={del} data-testid="payroll-delete-button"><Trash2 className="w-4 h-4" />Hapus draft</button></>}
          {run.status === "Posted" && <button className={btnLight} onClick={() => setVoiding(true)} data-testid="payroll-void-button"><Ban className="w-4 h-4" />Batalkan</button>}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Stat tone="blue" label="Gaji bruto" value={rp(run.gross)} testId="payroll-gross" />
        <Stat label="PPh 21 dipotong" value={rp(run.pph21)} testId="payroll-pph21" />
        <Stat label="Potongan lain" value={rp(run.deductions)} />
        <Stat tone="dark" label="Gaji bersih dibayar" value={rp(run.net)} testId="payroll-net" />
        <Stat tone="brand" label="Teralokasi ke project (timesheet)" value={rp(run.allocated_total)} sub={`Sisa ${rp(run.gross - run.allocated_total)} jadi beban kantor`} testId="payroll-allocated" />
      </div>
      <DataTable testId="payroll-lines-table" cols={[{ l: "Karyawan" }, { l: "Gaji pokok", r: true }, { l: "Tunjangan", r: true }, { l: "Lainnya", r: true }, { l: "Bruto", r: true }, { l: "Tarif PPh 21", r: true }, { l: "PPh 21", r: true }, { l: "Potongan", r: true }, { l: "Bersih", r: true }, { l: "Labor cost project", r: true }]}
        rows={run.lines.map((l) => ({ key: l.id, testId: `payroll-line-${l.employee_code}`, cells: [<div><p className="font-semibold">{l.employee_name}</p><p className="text-xs text-slate-500">{l.employee_code} · biaya bulanan {rp(l.monthly_cost)}</p></div>,
          cell(l, "base_salary"), cell(l, "allowance"), cell(l, "other_income"), <b>{rp(l.gross)}</b>, cell(l, "pph21_rate"), rp(l.pph21), cell(l, "deductions"), <b>{rp(l.net)}</b>,
          <span className="text-xs">{rp(l.allocated_to_projects)}</span>] }))} />
      <p className="text-xs text-slate-500">Gaji aktual dicatat sekali di laporan perusahaan (BR-008). Timesheet project hanya alokasi analitis labor cost; tarif PPh 21 default diambil dari aturan pajak PPH21 yang berlaku.</p>
      <ReasonDialog open={voiding} onClose={() => setVoiding(false)} title={`Batalkan ${run.number}`} desc="Jurnal dibalik, mutasi kas & PPh 21 terkait dibatalkan."
        onConfirm={async (reason) => { try { await api.post(`/payroll/runs/${run.id}/void`, { reason }); toast.success("Payroll dibatalkan"); onChanged(); } catch (e) { toast.error(errMsg(e)); } }} />
    </div>
  );
}

export default function Payroll() {
  const refs = useRefs(["entities"]);
  const [runs, setRuns] = useState(null);
  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [open, setOpen] = useState(false);
  const [f, set, setF] = useForm({});
  const loadRuns = useCallback(() => api.get("/payroll/runs").then(({ data }) => { setRuns(data.items); return data.items; }), []);
  const loadDetail = useCallback((id) => id && api.get(`/payroll/runs/${id}`).then(({ data }) => setDetail(data)), []);
  useEffect(() => { loadRuns().then((items) => items[0] && setSel(items[0].id)); }, [loadRuns]);
  useEffect(() => { setDetail(null); loadDetail(sel); }, [sel, loadDetail]);
  const changed = (removed) => { loadRuns().then((items) => { if (removed) setSel(items[0]?.id || null); else loadDetail(sel); }); };
  const create = async () => { const { data } = await api.post("/payroll/runs", f); toast.success("Draft payroll dibuat dari data karyawan"); setOpen(false); await loadRuns(); setSel(data.id); };
  return (
    <div className="p-5 sm:p-8 lg:p-10" data-testid="payroll-page">
      <PageHeader eyebrow="Payroll" title="Penggajian" desc="Payroll bulanan dari Master Karyawan, terhubung ke labor cost project (timesheet), PPh 21, jurnal beban gaji, dan mutasi kas."
        actions={<button className={btnDark} onClick={() => { setF({ period: thisMonth(), pay_date: today(), entity_id: refs.entities?.[0]?.id || "", note: "" }); setOpen(true); }} data-testid="payroll-add-button"><Plus className="w-4 h-4" />Payroll baru</button>} />
      {!runs ? <Loading /> : runs.length === 0 ? <Empty title="Belum ada payroll" desc="Buat payroll bulanan; baris karyawan terisi otomatis dari Master Data." /> : (
        <div className="grid xl:grid-cols-[260px_1fr] gap-6">
          <div className="space-y-2" data-testid="payroll-runs-list">
            {runs.map((r) => (
              <button key={r.id} onClick={() => setSel(r.id)} className={`w-full text-left p-4 rounded-[22px] border transition-colors ${sel === r.id ? "bg-[#12151c] text-white border-[#12151c]" : "border-slate-200 hover:border-slate-400"}`} data-testid={`payroll-run-${r.period}`}>
                <p className="font-semibold">{bulan(r.period)}</p><p className={`text-xs ${sel === r.id ? "text-white/70" : "text-slate-500"}`}>{r.number} · {r.status} · {rp(r.net)}</p>
              </button>
            ))}
          </div>
          <div className="min-w-0">{detail ? <RunDetail run={detail} onChanged={changed} /> : <Loading />}</div>
        </div>
      )}
      <FormDialog open={open} onClose={() => setOpen(false)} title="Payroll baru" onSubmit={create} testId="payroll-form">
        <Field f={{ k: "period", l: "Periode", t: "month", req: true }} value={f.period} onChange={set} />
        <Field f={{ k: "pay_date", l: "Tanggal bayar", t: "date", req: true }} value={f.pay_date} onChange={set} />
        <Field f={{ k: "entity_id", l: "Entitas", t: "select", o: refOpts(refs.entities) }} value={f.entity_id} onChange={set} />
        <Field f={{ k: "note", l: "Catatan" }} value={f.note} onChange={set} />
      </FormDialog>
    </div>
  );
}
