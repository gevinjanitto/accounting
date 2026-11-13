import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, btnDark } from "@/components/kit";
import { useRefs } from "@/pages/MasterData";
import { api, errMsg } from "@/lib/api";
import { rp } from "@/lib/format";
import { NumberInput } from "@/components/NumberInput";

const STATUS = ["Draft", "Estimation", "Quotation", "Approved", "Running", "On Hold", "Cancelled"];
const FIELDS = [
  { k: "name", l: "Nama project", req: true, wide: true }, { k: "code", l: "Kode project", hint: "Kosongkan untuk dibuat otomatis" },
  { k: "status", l: "Status", t: "select", o: STATUS, req: true }, { k: "customer_id", l: "Customer", t: "ref", ref: "customers" },
  { k: "entity_id", l: "Entitas pemilik kontrak", t: "ref", ref: "entities", req: true }, { k: "contract_number", l: "No. kontrak / SPK" },
  { k: "contract_value", l: "Nilai kontrak sebelum PPN (Rp)", t: "num", req: true }, { k: "contract_date", l: "Tanggal kontrak", t: "date" },
  { k: "target_margin", l: "Target margin (%)", t: "num" }, { k: "start_date", l: "Tanggal mulai", t: "date" }, { k: "end_date", l: "Tanggal selesai", t: "date" },
  { k: "costing_method", l: "Metode costing", t: "select", o: ["Hybrid", "Percentage Based", "Actual Cost Based"] },
  { k: "tax_classification", l: "Klasifikasi pajak", hint: "mis. Jasa (PPN + PPh 23)" }, { k: "description", l: "Deskripsi", t: "textarea", wide: true },
];
export const BUDGET_KEYS = [["gaji", "Gaji karyawan"], ["operasional", "Operasional / overhead"], ["bonus", "Bonus tim (rencana)"], ["freelancer", "Freelancer"], ["server", "Server / hosting"], ["lisensi", "Lisensi"], ["vendor", "Vendor"], ["perjalanan", "Perjalanan dinas"], ["lainnya", "Biaya langsung lainnya"], ["cadangan", "Cadangan internal"]];

export default function ProjectForm({ open, onClose, project, onSaved }) {
  const refs = useRefs(["customers", "entities"]);
  const [form, setForm] = useState({});
  const [budgets, setBudgets] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(project ? { ...project } : { status: "Draft", target_margin: 20, costing_method: "Hybrid", entity_id: refs.entities?.[0]?.id });
    setBudgets({});
  }, [open, project, refs.entities]);

  const applyPct = () => {
    const v = Number(form.contract_value || 0);
    setBudgets({ gaji: v * 0.3, operasional: v * 0.1, bonus: v * 0.15, cadangan: v * 0.05 });
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = Object.fromEntries(FIELDS.map((f) => [f.k, form[f.k]]));
      const { data } = project ? await api.put(`/projects/${project.id}`, payload) : await api.post("/projects", { ...payload, budgets });
      toast.success("Project tersimpan");
      onSaved(data);
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-[28px] max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="project-form-dialog">
        <DialogHeader>
          <DialogTitle>{project ? `Ubah ${project.code}` : "Project baru"}</DialogTitle>
          <DialogDescription>Revenue Fase 1 memakai nilai kontrak sebelum PPN.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-6">
          <div className="grid sm:grid-cols-2 gap-4">
            {FIELDS.map((f) => <Field key={f.k} f={f} value={form[f.k]} refs={refs} onChange={(k, v) => setForm((s) => ({ ...s, [k]: v }))} />)}
          </div>
          {!project && (
            <div className="rounded-[22px] bg-[#f8fafc] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <p className="font-semibold text-sm">Budget awal (opsional)</p>
                <button type="button" onClick={applyPct} className="text-xs font-semibold px-3 h-8 rounded-full bg-[#cddcf3]" data-testid="project-form-apply-pct">Isi persentase default (30/10/15/5%)</button>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {BUDGET_KEYS.map(([k, l]) => (
                  <label key={k} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-600">{l}</span>
                    <NumberInput value={budgets[k] ?? ""} onChange={(v) => setBudgets((b) => ({ ...b, [k]: v }))} className="w-40 h-10 rounded-xl border px-3 text-right num" data-testid={`project-form-budget-${k}`} />
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-3">Total budget: <b className="num">{rp(Object.values(budgets).reduce((a, b) => a + Number(b || 0), 0))}</b></p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="h-11 px-5 rounded-full border text-sm font-semibold" data-testid="project-form-cancel">Batal</button>
            <button type="submit" disabled={busy} className={btnDark} data-testid="project-form-save">{busy ? "Menyimpan…" : "Simpan project"}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
