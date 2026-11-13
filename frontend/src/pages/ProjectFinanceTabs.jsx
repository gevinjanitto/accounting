import { useEffect, useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { Panel, btnDark } from "@/components/kit";
import { Stat } from "@/components/fin";
import { DocList, UploadForm, useDocs } from "@/components/Documents";
import { IncomeTable, IncomeForm, useIncomeActions } from "@/pages/Incomes";
import { ExpenseTable, ExpenseForm, useExpenseActions } from "@/pages/Expenses";
import { TaxTable, TaxRecap } from "@/pages/Tax";
import { api } from "@/lib/api";
import { rp } from "@/lib/format";

function useList(path, projectId) {
  const [data, setData] = useState(null);
  const load = useCallback(() => api.get(path, { params: { project_id: projectId, page_size: 200 } }).then(({ data }) => setData(data)), [path, projectId]);
  useEffect(() => { load(); }, [load]);
  return [data, load];
}

export function ProjectRevenue({ p }) {
  const [data, load] = useList("/incomes", p.id);
  const [create, setCreate] = useState(false);
  const [handlers, dialogs] = useIncomeActions(load);
  if (!data) return null;
  const live = data.items.filter((i) => i.status !== "Void");
  const billed = live.reduce((a, i) => a + i.dpp, 0), received = live.reduce((a, i) => a + i.paid_amount, 0), outstanding = live.reduce((a, i) => a + i.outstanding, 0);
  return (
    <div className="space-y-5" data-testid="project-revenue-tab">
      <div className="grid sm:grid-cols-4 gap-4">
        <Stat label="Nilai kontrak" value={rp(p.contract_value)} />
        <Stat tone="blue" label="Sudah ditagih (DPP)" value={rp(billed)} sub={`${p.contract_value ? Math.round((billed / p.contract_value) * 100) : 0}% dari kontrak`} testId="project-revenue-billed" />
        <Stat label="Diterima" value={rp(received)} />
        <Stat tone="dark" label="Piutang" value={rp(outstanding)} />
      </div>
      <div className="flex justify-end"><button className={btnDark} onClick={() => setCreate(true)} data-testid="project-income-add"><Plus className="w-4 h-4" />Tagih termin</button></div>
      <IncomeTable items={data.items} {...handlers} />
      <IncomeForm open={create} onClose={() => setCreate(false)} onSaved={load} presetProject={p.id} />
      {dialogs}
    </div>
  );
}

export function ProjectExpense({ p, reload, locked }) {
  const [data, load] = useList("/expenses", p.id);
  const [create, setCreate] = useState(false);
  const refresh = () => { load(); reload(); };
  const [handlers, dialogs] = useExpenseActions(refresh);
  if (!data) return null;
  const total = data.items.filter((e) => e.status !== "Void").reduce((a, e) => a + e.dpp, 0);
  return (
    <div className="space-y-5" data-testid="project-expense-tab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Total pengeluaran project (DPP): <b className="text-[#12151c] num">{rp(total)}</b>. Biaya langsung & bonus otomatis masuk ke tab Cost Allocation.</p>
        {!locked && <button className={btnDark} onClick={() => setCreate(true)} data-testid="project-expense-add"><Plus className="w-4 h-4" />Catat pengeluaran</button>}
      </div>
      <ExpenseTable items={data.items} {...handlers} />
      <ExpenseForm open={create} onClose={() => setCreate(false)} onSaved={refresh} presetProject={p.id} />
      {dialogs}
    </div>
  );
}

export function ProjectDocuments({ p }) {
  const [docs, load] = useDocs({ project_id: p.id });
  return (
    <div className="grid xl:grid-cols-[1fr_360px] gap-6" data-testid="project-documents-tab">
      <Panel><p className="font-semibold mb-3">Dokumen project & transaksinya</p><DocList docs={docs} onChanged={load} /></Panel>
      <Panel className="h-fit"><p className="font-semibold mb-4">Unggah kontrak / SPK</p><UploadForm linkedType="project" linkedId={p.id} onDone={load} defaultType="Kontrak" /></Panel>
    </div>
  );
}

export function ProjectTax({ p }) {
  const [data, setData] = useState(null);
  const load = useCallback(() => api.get("/tax/records", { params: { project_id: p.id } }).then(({ data }) => setData(data)), [p.id]);
  useEffect(() => { load(); }, [load]);
  if (!data) return null;
  const sum = (k) => data.items.filter((r) => r.kind === k && r.status !== "Void").reduce((a, r) => a + r.amount, 0);
  return (
    <div className="space-y-5" data-testid="project-tax-tab">
      <div className="grid sm:grid-cols-4 gap-4">
        <Stat tone="blue" label="PPN Keluaran" value={rp(sum("PPN Keluaran"))} testId="project-tax-ppn-out" />
        <Stat label="PPN Masukan" value={rp(sum("PPN Masukan"))} testId="project-tax-ppn-in" />
        <Stat tone="dark" label="PPh 23 dipotong customer" value={rp(sum("PPh 23 Dipotong Customer"))} testId="project-tax-pph23" />
        <Stat label="PPh lain (dipungut/final)" value={rp(sum("PPh 23 Dipungut") + sum("PPh 4(2) Final") + sum("PPh 21"))} />
      </div>
      <p className="text-sm text-slate-500">DPP/PPN/PPh per transaksi project. PPN tidak dihitung sebagai pendapatan; laba project memakai DPP.</p>
      <TaxRecap recap={data.recap} />
      <TaxTable items={data.items} onChanged={load} />
    </div>
  );
}
