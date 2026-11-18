import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, btnDark, statusLabel } from "@/components/kit";
import { useRefs } from "@/pages/MasterData";
import { api, errMsg } from "@/lib/api";
import { rp } from "@/lib/format";
import { TaxRow, BudgetEditor, projectTax, budgetsFromRows, taxNote } from "@/components/ProjectInputs";

const STATUS = ["Draft", "Estimation", "Quotation", "Approved", "Running", "On Hold", "Cancelled"].map((s) => ({ v: s, l: statusLabel(s) }));
const KEYS = ["name", "customer_id", "entity_id", "contract_number", "status", "contract_value", "start_date", "end_date", "description", "ppn_mode", "ppn_value", "ppn_paid_by", "pph_mode", "pph_value", "pph_paid_by"];
const BLANK = { status: "Draft", ppn_mode: "pct", ppn_value: 11, ppn_paid_by: "client", pph_mode: "pct", pph_value: 2, pph_paid_by: "kita" };

function Section({ title, children }) {
  return <div className="rounded-[22px] bg-[#f8fafc] p-4 space-y-3"><p className="font-semibold text-sm">{title}</p>{children}</div>;
}

export default function ProjectForm({ open, onClose, project, onSaved }) {
  const refs = useRefs(["customers", "entities"]);
  const [form, setForm] = useState({});
  const [budgets, setBudgets] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const entities = refs.entities || [];

  useEffect(() => {
    if (!open) return;
    setForm(project ? { ...BLANK, ...project } : { ...BLANK, entity_id: entities[0]?.id });
    setBudgets(project ? budgetsFromRows(project.budgets || []) : {});
  }, [open, project, entities]);

  const tax = projectTax(form);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = Object.fromEntries(KEYS.map((k) => [k, form[k]]));
      if (!payload.entity_id) payload.entity_id = entities[0]?.id;
      const { data } = project ? await api.put(`/projects/${project.id}`, payload) : await api.post("/projects", { ...payload, budgets });
      if (project) await api.put(`/projects/${project.id}/budgets`, budgets);
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
          <DialogTitle>{project ? `Ubah ${project.code}` : "Buat project baru"}</DialogTitle>
          <DialogDescription>Isi data utama, pajak, lalu budget. Kode project dibuat otomatis.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-5">
          <Section title="1. Data project">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field f={{ k: "name", l: "Nama project", req: true, wide: true }} value={form.name} onChange={set} />
              <Field f={{ k: "customer_id", l: "Customer", t: "ref", ref: "customers" }} refs={refs} value={form.customer_id} onChange={set} />
              <Field f={{ k: "contract_number", l: "No. kontrak / SPK" }} value={form.contract_number} onChange={set} />
              <Field f={{ k: "contract_value", l: "Nilai kontrak (Rp, sebelum PPN)", t: "num", req: true }} value={form.contract_value} onChange={set} />
              <Field f={{ k: "status", l: "Status", t: "select", o: STATUS, req: true }} value={form.status} onChange={set} />
              <Field f={{ k: "start_date", l: "Tanggal mulai", t: "date" }} value={form.start_date} onChange={set} />
              <Field f={{ k: "end_date", l: "Tanggal selesai", t: "date" }} value={form.end_date} onChange={set} />
              {entities.length > 1 && <Field f={{ k: "entity_id", l: "Perusahaan pemilik kontrak", t: "ref", ref: "entities", req: true }} refs={refs} value={form.entity_id} onChange={set} />}
              <Field f={{ k: "description", l: "Keterangan", t: "textarea", wide: true }} value={form.description} onChange={set} />
            </div>
          </Section>
          <Section title="2. Pajak (PPN & PPh)">
            <div className="grid sm:grid-cols-2 gap-3">
              <TaxRow label="PPN" prefix="ppn" form={form} set={set} amount={tax.ppn} />
              <TaxRow label="PPh" prefix="pph" form={form} set={set} amount={tax.pph} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm" data-testid="project-form-tax-preview">
              {[["Tagihan ke client", tax.tagihan, "tagihan"], ["Pajak ditanggung kita", tax.borne, "borne"], ["Nilai kontrak setelah pajak", tax.net, "net"]].map(([l, v, k]) => (
                <div key={k} className={`rounded-2xl p-3 ${k === "net" ? "bg-[#cddcf3]" : "bg-white border"}`} data-testid={`project-form-preview-${k}`}><p className="text-xs text-slate-500">{l}</p><p className="font-bold num">{rp(v)}</p></div>
              ))}
            </div>
            <p className="text-xs text-slate-600 bg-white border rounded-2xl px-3 py-2" data-testid="project-form-tax-note">{taxNote(tax)}</p>
          </Section>
          <Section title="3. Budget (isi pakai % atau Rp, boleh dikosongkan)">
            <BudgetEditor budgets={budgets} setBudgets={setBudgets} base={tax.net} />
          </Section>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="h-11 px-5 rounded-full border text-sm font-semibold" data-testid="project-form-cancel">Batal</button>
            <button type="submit" disabled={busy} className={btnDark} data-testid="project-form-save">{busy ? "Menyimpan…" : "Simpan project"}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
