import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Trash2, Save, ArrowRightCircle, History, FilePlus2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Panel, StatusBadge, Field, btnDark, btnLight } from "@/components/kit";
import { NumberInput } from "@/components/NumberInput";
import { useRefs } from "@/pages/MasterData";
import { api, errMsg } from "@/lib/api";
import { simulate, emptySimulation, newCost } from "@/lib/simcalc";
import { rp, rpShort, pct, tgl, today } from "@/lib/format";

const numIn = "h-10 rounded-xl border px-3 text-right num w-full outline-none transition-[border-color,box-shadow] duration-200 focus:border-[#0f52ba] focus:shadow-[0_0_0_3px_rgba(15,82,186,.12)]";

function Num({ label, value, onChange, suffix, testId, big }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <div className="relative mt-1">
        <NumberInput value={value ?? ""} onChange={onChange} className={`${numIn} ${suffix ? "pr-10" : ""} ${big ? "!h-12 text-lg font-bold" : ""}`} data-testid={testId} />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>}
      </div>
    </label>
  );
}

function SimList({ items, activeId, onNew }) {
  const nav = useNavigate();
  return (
    <div className="space-y-2" data-testid="simulation-list">
      <button onClick={onNew} className={`${btnDark} w-full justify-center`} data-testid="sim-new-button"><FilePlus2 className="w-4 h-4" />Simulasi baru</button>
      {items.map((s) => (
        <button key={s.id} onClick={() => nav(`/simulator/${s.id}`)} data-testid={`sim-item-${s.id}`}
          className={`w-full text-left p-4 rounded-[22px] border transition-colors ${s.id === activeId ? "border-[#12151c] bg-[#f4f6f9]" : "border-slate-200 hover:border-slate-400"}`}>
          <div className="flex items-start justify-between gap-2"><span className="font-semibold text-sm line-clamp-2">{s.name}</span><StatusBadge status={s.status} className="!h-6 !px-2" /></div>
          {s.latest && <p className="text-xs text-slate-500 mt-1">{s.latest.label} · {rpShort(s.latest.outputs.final.price)} · {s.latest.outputs.final.status}</p>}
        </button>
      ))}
    </div>
  );
}

function Tile({ label, value, testId, tone = "bg-[#f4f6f9]" }) {
  return <div className={`rounded-[22px] p-4 ${tone}`}><p className="text-[11px] text-slate-500 leading-tight">{label}</p><p className="font-bold num mt-1 break-all" data-testid={testId}>{rp(value)}</p></div>;
}

function Results({ out, inp }) {
  const f = out.final;
  return (
    <div className="space-y-4" data-testid="sim-results">
      <motion.div key={f.status} initial={{ scale: 0.97, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} className="rounded-[28px] bg-[#12151c] text-white p-6 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-[#0f52ba]/50" />
        <p className="text-sm text-white/70 relative">Harga saat ini (minimum + kenaikan {pct(f.markup_pct)}, sudah termasuk pajak)</p>
        <p className="text-3xl sm:text-4xl font-extrabold num relative mt-1 break-all" data-testid="sim-final-price">{rp(f.price)}</p>
        <div className="flex items-center gap-3 mt-3 relative"><StatusBadge status={f.status} testId="sim-status" /><span className="text-sm">Margin <b className="num" data-testid="sim-final-margin">{pct(f.margin)}</b></span></div>
        <div className="grid grid-cols-2 gap-3 mt-5 relative text-sm">
          <div><p className="text-white/60 text-xs">Selisih dari harga minimum</p><p className="font-bold num" data-testid="sim-final-surplus">{rp(f.surplus)}</p></div>
          <div><p className="text-white/60 text-xs">DPP (tanpa pajak)</p><p className="font-bold num" data-testid="sim-final-dpp">{rp(f.dpp)}</p></div>
        </div>
      </motion.div>
      <div className="grid grid-cols-2 gap-3">
        <Tile label="Total harga dasar" value={out.hpp} testId="sim-hpp" />
        <Tile label="Total cost" value={out.cost_total} testId="sim-cost-total" />
        <Tile label="Harga minimum (harga dasar + cost + pajak)" value={out.min_acceptable_price} testId="sim-map" tone="bg-amber-50" />
        <Tile label="Harga rekomendasi (minimum +10%)" value={out.recommended_price} testId="sim-recommended" tone="bg-[#dfe9f8]" />
        <div className="col-span-2"><Tile label="Harga saat ini — mulai dari harga minimum, naik saat slider negosiasi digeser" value={out.current_price} testId="sim-current" tone="bg-[#cddcf3]" /></div>
      </div>
      <div className="rounded-[22px] border border-slate-200 p-4 text-sm space-y-1.5" data-testid="sim-tax-box">
        <p className="font-semibold mb-1">Rincian harga minimum</p>
        <div className="flex justify-between"><span className="text-slate-500">Harga dasar + cost</span><span className="num">{rp(out.base_cost)}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">PPN {pct(inp.ppn_pct)}</span><span className="num" data-testid="sim-ppn-amount">{rp(out.ppn)}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">PPh {pct(inp.pph_pct)}</span><span className="num" data-testid="sim-pph-amount">{rp(out.pph)}</span></div>
        <div className="flex justify-between border-t pt-1.5"><span className="font-semibold">Harga minimum</span><span className="num font-semibold">{rp(out.min_acceptable_price)}</span></div>
      </div>
      <div className="rounded-[22px] bg-[#cddcf3] p-4 text-sm space-y-1">
        <p>Kenaikan negosiasi saat ini: <b className="num" data-testid="sim-markup-info">{pct(f.markup_pct)}</b> di atas harga minimum</p>
        <p>{f.markup_pct >= 10 ? "Harga saat ini sudah mencapai harga rekomendasi." : <>Naikkan minimal <b className="num">10%</b> agar mencapai harga rekomendasi.</>}</p>
      </div>
    </div>
  );
}

function Negotiation({ out }) {
  return (
    <Panel testId="negotiation-table">
      <p className="font-semibold mb-1">Negotiation simulator</p>
      <p className="text-xs text-slate-500 mb-4">Harga minimum {rp(out.min_acceptable_price)} — tiap skenario menaikkan harga dari harga minimum.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="py-2">Skenario</th><th className="text-right">Harga</th><th className="text-right">Selisih vs minimum</th><th className="text-right">Margin</th><th className="text-right pr-1">Status</th></tr></thead>
          <tbody>
            {out.scenarios.map((s) => (
              <tr key={s.markup_pct} className={`border-t ${s.markup_pct === out.final.markup_pct ? "bg-[#f4f6f9] font-semibold" : ""}`} data-testid={`scenario-${s.markup_pct}`}>
                <td className="py-3">{s.markup_pct === 0 ? "Harga minimum" : `Naik ${pct(s.markup_pct)}`}</td>
                <td className="text-right num">{rp(s.price)}</td><td className={`text-right num ${s.surplus < 0 ? "text-red-600" : ""}`}>{rp(s.surplus)}</td>
                <td className="text-right num">{pct(s.margin)}</td><td className="text-right py-2"><StatusBadge status={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function CostTypeSelect({ types, value, onPick, onCreated, testId }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const create = async () => {
    if (!name.trim()) return;
    try {
      const { data } = await api.post("/master/cost-types", { name: name.trim(), is_active: true });
      onCreated(data); onPick(data); setAdding(false); setName("");
      toast.success(`Jenis "${data.name}" ditambahkan ke Master Data`);
    } catch (err) { toast.error(errMsg(err)); }
  };
  if (adding) {
    return (
      <div className="flex gap-1">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama jenis baru"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); create(); } if (e.key === "Escape") setAdding(false); }}
          className="h-10 min-w-0 flex-1 rounded-xl border px-3 text-sm outline-none focus:border-[#0f52ba]" data-testid={`${testId}-new-name`} />
        <button type="button" onClick={create} className="h-10 w-10 shrink-0 grid place-items-center rounded-xl bg-[#12151c] text-white hover:bg-[#0f52ba] transition-colors" data-testid={`${testId}-new-save`}><Check className="w-4 h-4" /></button>
        <button type="button" onClick={() => setAdding(false)} className="h-10 w-10 shrink-0 grid place-items-center rounded-xl border" data-testid={`${testId}-new-cancel`}><X className="w-4 h-4" /></button>
      </div>
    );
  }
  return (
    <select value={value || ""} onChange={(e) => (e.target.value === "__new" ? setAdding(true) : onPick(types.find((t) => t.id === e.target.value) || null))}
      className="h-10 w-full rounded-xl border px-2 text-sm bg-white" data-testid={testId}>
      <option value="">Pilih jenis…</option>
      {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      <option value="__new">+ Tambah jenis baru…</option>
    </select>
  );
}

function CostRow({ c, i, amount, types, onUpd, onDel, onTypeCreated }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-[1fr_190px_auto_150px_130px_36px] gap-2 items-center" data-testid={`sim-cost-row-${i}`}>
      <input value={c.label} onChange={(e) => onUpd({ label: e.target.value })} placeholder="Keterangan" className="h-10 rounded-xl border px-3 text-sm outline-none focus:border-[#0f52ba]" data-testid={`sim-cost-label-${i}`} />
      <CostTypeSelect types={types} value={c.cost_type_id} onCreated={onTypeCreated} testId={`sim-cost-type-${i}`}
        onPick={(t) => onUpd({ cost_type_id: t?.id || "", type_name: t?.name || "", ...(t && !c.label ? { label: t.name } : {}) })} />
      <div className="inline-flex h-10 rounded-xl border p-1 bg-[#f4f6f9]">
        {[["pct", "%"], ["fixed", "Rp"]].map(([m, l]) => (
          <button type="button" key={m} onClick={() => onUpd({ mode: m })} data-testid={`sim-cost-mode-${m}-${i}`}
            className={`px-3 rounded-lg text-xs font-semibold transition-colors duration-200 ${c.mode === m ? "bg-[#12151c] text-white" : "text-slate-500 hover:text-[#12151c]"}`}>{l}</button>
        ))}
      </div>
      <div className="relative">
        <NumberInput value={c.value} onChange={(v) => onUpd({ value: v })} className={`${numIn} ${c.mode === "pct" ? "pr-8" : ""}`} data-testid={`sim-cost-value-${i}`} />
        {c.mode === "pct" && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>}
      </div>
      <div className="text-right text-sm font-semibold num" data-testid={`sim-cost-amount-${i}`}>{rp(amount)}</div>
      <button type="button" onClick={onDel} className="text-red-500 justify-self-end" data-testid={`sim-cost-delete-${i}`}><Trash2 className="w-4 h-4" /></button>
    </div>
  );
}

function ConvertDialog({ open, onClose, sim, version }) {
  const nav = useNavigate();
  const [f, setF] = useState({ code: "", contract_number: "", start_date: today(), status: "Approved" });
  const go = async () => {
    try {
      const { data } = await api.post(`/simulations/${sim.id}/convert`, { ...f, version_id: version.id });
      toast.success(`Project ${data.code} dibuat`);
      nav(`/projects/${data.id}`);
    } catch (err) { toast.error(errMsg(err)); }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-[28px]" data-testid="convert-dialog">
        <DialogHeader><DialogTitle>Konversi ke project</DialogTitle><DialogDescription>{version?.label}: harga {rp(version?.outputs.final.price)}, harga dasar {rp(version?.outputs.hpp)}. Budget, durasi, dan versi simulasi ikut terbawa.</DialogDescription></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field f={{ k: "code", l: "Kode project", hint: "Kosong = otomatis" }} value={f.code} onChange={(k, v) => setF({ ...f, [k]: v })} />
          <Field f={{ k: "contract_number", l: "No. kontrak/SPK" }} value={f.contract_number} onChange={(k, v) => setF({ ...f, [k]: v })} />
          <Field f={{ k: "start_date", l: "Tanggal mulai", t: "date" }} value={f.start_date} onChange={(k, v) => setF({ ...f, [k]: v })} />
          <Field f={{ k: "status", l: "Status awal", t: "select", o: ["Quotation", "Approved", "Running"], req: true }} value={f.status} onChange={(k, v) => setF({ ...f, [k]: v })} />
        </div>
        <button onClick={go} className={`${btnDark} justify-center`} data-testid="convert-confirm-button"><ArrowRightCircle className="w-4 h-4" />Buat project</button>
      </DialogContent>
    </Dialog>
  );
}

function InfoPanel({ inp, set, refs, out }) {
  return (
    <Panel testId="sim-info">
      <p className="font-semibold mb-4">Informasi</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field f={{ k: "customer_id", l: "Customer", t: "ref", ref: "customers" }} refs={refs} value={inp.customer_id} onChange={set} />
        <Field f={{ k: "entity_id", l: "Entitas", t: "ref", ref: "entities" }} refs={refs} value={inp.entity_id} onChange={set} />
        <Num label="Estimasi durasi" suffix="bln" value={inp.duration_months} onChange={(v) => set("duration_months", v)} testId="sim-duration" />
        <Num label="Harga dasar (Rp)" value={inp.hpp} onChange={(v) => set("hpp", v)} testId="sim-hpp-input" big />
        <Num label="PPN" suffix="%" value={inp.ppn_pct} onChange={(v) => set("ppn_pct", v)} testId="sim-ppn" />
        <Num label="PPh" suffix="%" value={inp.pph_pct} onChange={(v) => set("pph_pct", v)} testId="sim-pph" />
      </div>
      <div className="mt-6">
        <div className="flex justify-between text-sm mb-3">
          <span className="font-semibold">Negosiasi harga <span className="text-xs font-normal text-slate-500">(geser untuk menaikkan dari harga minimum {rpShort(out.min_acceptable_price)})</span></span>
          <span className="font-bold num" data-testid="sim-markup-value">+{pct(inp.markup_pct || 0)}</span>
        </div>
        <Slider value={[Number(inp.markup_pct) || 0]} min={0} max={50} step={0.5} onValueChange={([v]) => set("markup_pct", v)} data-testid="sim-markup-slider" />
        <div className="flex justify-between text-[11px] text-slate-400 mt-2"><span>Minimum</span><span>Rekomendasi +10%</span><span>+50%</span></div>
      </div>
    </Panel>
  );
}

export default function Simulator() {
  const { id } = useParams();
  const nav = useNavigate();
  const refs = useRefs(["customers", "entities", "cost-types"]);
  const [types, setTypes] = useState([]);
  const [list, setList] = useState([]);
  const [sim, setSim] = useState(null);
  const [inp, setInp] = useState(emptySimulation());
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [convert, setConvert] = useState(null);
  const out = useMemo(() => simulate(inp), [inp]);
  const set = (k, v) => setInp((s) => ({ ...s, [k]: v }));
  useEffect(() => { if (refs["cost-types"]) setTypes(refs["cost-types"].filter((t) => t.is_active)); }, [refs]);

  const loadList = useCallback(() => api.get("/simulations", { params: { page_size: 50 } }).then(({ data }) => setList(data.items)), []);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => {
    if (!id) { setSim(null); setInp(emptySimulation()); return; }
    api.get(`/simulations/${id}`).then(({ data }) => { setSim(data); if (data.versions[0]) setInp({ ...emptySimulation(), ...data.versions[0].inputs }); });
  }, [id]);

  const save = async () => {
    if (!inp.name?.trim()) return toast.error("Isi nama project simulasi");
    setBusy(true);
    try {
      const body = { name: inp.name, customer_id: inp.customer_id, entity_id: inp.entity_id, label: label || undefined, inputs: inp };
      const { data } = sim ? await api.post(`/simulations/${sim.id}/versions`, body) : await api.post("/simulations", body);
      toast.success(`${data.version.label} tersimpan`);
      setLabel("");
      await loadList();
      if (!sim) nav(`/simulator/${data.id}`);
      else setSim((await api.get(`/simulations/${sim.id}`)).data);
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };

  const costs = inp.costs || [];
  const updCost = (i, patch) => set("costs", costs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="p-5 sm:p-8 lg:p-10 grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-8" data-testid="simulator-page">
      <SimList items={list} activeId={id} onNew={() => nav("/simulator")} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f52ba] mb-2">Pricing & Negotiation Simulator</p>
            <input value={inp.name} onChange={(e) => set("name", e.target.value)} placeholder="Nama project simulasi…" className="text-3xl sm:text-4xl font-extrabold tracking-tight outline-none bg-transparent w-full placeholder:text-slate-300" data-testid="sim-name-input" />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label versi (opsional)" className="h-11 rounded-full border px-4 text-sm w-48" data-testid="sim-version-label" />
            <button onClick={save} disabled={busy} className={btnDark} data-testid="sim-save-button"><Save className="w-4 h-4" />{sim ? "Simpan versi baru" : "Simpan simulasi"}</button>
          </div>
        </div>
        <div className="grid 2xl:grid-cols-[1fr_400px] gap-6">
          <div className="space-y-6 min-w-0">
            <InfoPanel inp={inp} set={set} refs={refs} out={out} />
            <Panel testId="sim-costs">
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold">Cost</p>
                <button onClick={() => set("costs", [...costs, newCost()])} className={btnLight} data-testid="sim-add-cost"><Plus className="w-4 h-4" />Tambah cost</button>
              </div>
              <p className="text-xs text-slate-500 mb-4">Isi dalam persen dari harga dasar (%) atau jumlah tetap (Rp). Jenis cost diambil dari Master Data dan bisa ditambah langsung di sini.</p>
              {costs.length === 0 && <p className="text-sm text-slate-500" data-testid="sim-costs-empty">Belum ada cost. Klik "Tambah cost".</p>}
              <div className="space-y-2">
                {costs.map((c, i) => (
                  <CostRow key={i} c={c} i={i} amount={out.cost_rows[i]?.amount} types={types} onUpd={(p) => updCost(i, p)}
                    onDel={() => set("costs", costs.filter((_, j) => j !== i))} onTypeCreated={(t) => setTypes((x) => [...x, t].sort((a, b) => a.name.localeCompare(b.name)))} />
                ))}
              </div>
              {costs.length > 0 && <div className="flex justify-between border-t mt-4 pt-3 text-sm"><span className="font-semibold">Total cost</span><b className="num" data-testid="sim-cost-sum">{rp(out.cost_total)}</b></div>}
            </Panel>
            <Negotiation out={out} />
            {sim && (
              <Panel testId="sim-versions">
                <p className="font-semibold mb-3 flex items-center gap-2"><History className="w-4 h-4" />Riwayat versi (tidak tertimpa)</p>
                <div className="space-y-2">
                  {sim.versions.map((v) => (
                    <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-[#f4f6f9]" data-testid={`sim-version-${v.version_no}`}>
                      <div><p className="text-sm font-semibold">{v.label} <span className="text-xs text-slate-500 font-normal">· {tgl(v.created_at)} · {v.created_by}</span></p><p className="text-xs text-slate-500">{rp(v.outputs.final.price)} · margin {pct(v.outputs.final.margin)}</p></div>
                      <div className="flex gap-2 items-center">
                        <StatusBadge status={v.outputs.final.status} />
                        <button onClick={() => setInp({ ...emptySimulation(), ...v.inputs })} className="h-9 px-3 rounded-full border text-xs font-semibold bg-white" data-testid={`sim-load-version-${v.version_no}`}>Muat</button>
                        {!sim.project_id && <button onClick={() => setConvert(v)} className="h-9 px-3 rounded-full bg-[#12151c] text-white text-xs font-semibold" data-testid={`sim-convert-version-${v.version_no}`}>Konversi</button>}
                      </div>
                    </div>
                  ))}
                </div>
                {sim.project_id && <button onClick={() => nav(`/projects/${sim.project_id}`)} className="mt-3 text-sm font-semibold text-[#0f52ba]" data-testid="sim-open-project">Sudah dikonversi → buka project</button>}
              </Panel>
            )}
          </div>
          <div className="2xl:sticky 2xl:top-4 h-fit"><Results out={out} inp={inp} /></div>
        </div>
      </div>
      {sim && convert && <ConvertDialog open={!!convert} onClose={() => setConvert(null)} sim={sim} version={convert} />}
    </div>
  );
}
