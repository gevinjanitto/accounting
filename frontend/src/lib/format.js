const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

export const rp = (v) => idr.format(Number(v || 0)).replace(/\s/g, "");
export const n = (v) => num.format(Number(v || 0));
export const pct = (v) => `${num.format(Number(v || 0))}%`;

export const rpShort = (v) => {
  const x = Number(v || 0);
  const a = Math.abs(x);
  if (a >= 1e12) return `Rp${num.format(x / 1e12)} T`;
  if (a >= 1e9) return `Rp${num.format(x / 1e9)} M`;
  if (a >= 1e6) return `Rp${num.format(x / 1e6)} jt`;
  if (a >= 1e3) return `Rp${num.format(x / 1e3)} rb`;
  return rp(x);
};

export const tgl = (v) => (v ? new Date(v).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const tglJam = (v) =>
  v ? new Date(v).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export const today = () => new Date().toISOString().slice(0, 10);
export const thisMonth = () => new Date().toISOString().slice(0, 7);
export const bulan = (ym) => {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("id-ID", { month: "short", year: "numeric" });
};
