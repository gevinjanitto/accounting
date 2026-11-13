import { Building2, Users2, Truck, UserCog, BookOpen, Landmark, Percent, CalendarRange, Tags } from "lucide-react";

const active = { k: "is_active", l: "Aktif", t: "bool" };
const party = [
  { k: "name", l: "Nama", req: true }, { k: "party_type", l: "Tipe pihak", t: "select", o: ["Perusahaan", "Perorangan", "Instansi", "Lainnya"] },
  { k: "npwp", l: "NPWP" }, { k: "contact_person", l: "Kontak" }, { k: "email", l: "Email", t: "email" }, { k: "phone", l: "Telepon" },
  { k: "address", l: "Alamat", t: "textarea", wide: true }, active,
];
const partyCols = [["name", "Nama"], ["party_type", "Tipe"], ["npwp", "NPWP"], ["email", "Email"], ["phone", "Telepon"], ["is_active", "Status", "active"]];

export const MASTER = {
  entities: {
    label: "Entitas", icon: Building2, desc: "Identitas hukum pemilik kontrak & pendapatan.",
    columns: [["name", "Nama"], ["type", "Tipe"], ["npwp", "NPWP"], ["tax_status", "Status pajak"], ["is_pkp", "PKP", "bool"], ["is_active", "Status", "active"]],
    fields: [{ k: "name", l: "Nama entitas", req: true }, { k: "type", l: "Tipe", t: "select", o: ["CV", "Pribadi", "Lainnya"], req: true }, { k: "npwp", l: "NPWP" },
      { k: "tax_status", l: "Status pajak", hint: "mis. Normal" }, { k: "is_pkp", l: "Sudah PKP", t: "bool" }, { k: "default_bank_account_id", l: "Rekening default", t: "ref", ref: "bank-accounts" },
      { k: "address", l: "Alamat", t: "textarea", wide: true }, active],
    defaults: { type: "CV", is_active: true },
  },
  customers: { label: "Customer", icon: Users2, desc: "Pemberi kerja / klien project.", columns: partyCols, fields: party, defaults: { party_type: "Perusahaan", is_active: true } },
  vendors: { label: "Vendor", icon: Truck, desc: "Freelancer, penyedia lisensi, hosting, dan lainnya.", columns: partyCols, fields: party, defaults: { party_type: "Perusahaan", is_active: true } },
  employees: {
    label: "Karyawan", icon: UserCog, desc: "Total biaya bulanan = gaji pokok + tunjangan + biaya lain. Tarif/jam = total / jam produktif.",
    columns: [["code", "ID"], ["name", "Nama"], ["position", "Jabatan"], ["department", "Dept."], ["monthly_cost", "Biaya/bulan", "rp"], ["productive_hours", "Jam produktif", "num"], ["rate", "Tarif/jam", "rate"], ["status", "Status"]],
    fields: [{ k: "code", l: "ID karyawan", req: true }, { k: "name", l: "Nama", req: true }, { k: "position", l: "Jabatan" }, { k: "department", l: "Department" },
      { k: "base_salary", l: "Gaji pokok (Rp)", t: "num" }, { k: "allowance", l: "Tunjangan (Rp)", t: "num" }, { k: "other_cost", l: "Biaya lain/BPJS (Rp)", t: "num" },
      { k: "productive_hours", l: "Jam produktif / bulan", t: "num" }, { k: "status", l: "Status", t: "select", o: ["Aktif", "Nonaktif", "Cuti"] }],
    defaults: { productive_hours: 120, status: "Aktif" },
  },
  accounts: {
    label: "COA", icon: BookOpen, desc: "Chart of Accounts. Kelompok 1000–8000 sesuai BRD.",
    columns: [["code", "Kode"], ["name", "Nama akun"], ["group_code", "Kelompok"], ["account_type", "Tipe"], ["is_active", "Status", "active"]],
    fields: [{ k: "code", l: "Kode akun", req: true }, { k: "name", l: "Nama akun", req: true },
      { k: "group_code", l: "Kelompok", t: "select", req: true, o: [["1000", "Aset"], ["1300", "Pajak dibayar di muka"], ["2000", "Liabilitas"], ["3000", "Ekuitas"], ["4000", "Pendapatan"], ["5000", "Direct Cost"], ["6000", "Operational Expense"], ["7000", "Depreciation"], ["8000", "Tax Expense"]].map(([v, l]) => ({ v, l: `${v} · ${l}` })) },
      { k: "account_type", l: "Tipe akun", t: "select", req: true, o: ["Asset", "Liability", "Equity", "Revenue", "Expense", "Tax"] },
      { k: "description", l: "Keterangan", t: "textarea", wide: true }, active],
    defaults: { group_code: "6000", account_type: "Expense", is_active: true },
  },
  "bank-accounts": {
    label: "Rekening", icon: Landmark, desc: "Data rekening bank & kas. Jenis Penampung untuk dana CV yang diterima di rekening pribadi pemilik. Mutasi di menu Kas & Bank.",
    columns: [["name", "Nama"], ["kind", "Jenis"], ["bank_name", "Bank"], ["account_number", "No. rekening"], ["opening_balance", "Saldo awal", "rp"], ["is_active", "Status", "active"]],
    fields: [{ k: "name", l: "Nama rekening", req: true }, { k: "kind", l: "Jenis", t: "select", o: ["Bank", "Kas", "Penampung"], req: true }, { k: "bank_name", l: "Nama bank" },
      { k: "account_number", l: "No. rekening" }, { k: "account_holder", l: "Atas nama" }, { k: "entity_id", l: "Entitas pemilik", t: "ref", ref: "entities" },
      { k: "opening_balance", l: "Saldo awal (Rp)", t: "num" }, active],
    defaults: { kind: "Bank", is_active: true },
  },
  "tax-codes": {
    label: "Kode Pajak", icon: Percent, desc: "Konfigurasi dasar tarif pajak untuk simulator.",
    columns: [["code", "Kode"], ["name", "Nama"], ["tax_type", "Jenis"], ["rate", "Tarif", "pct"], ["effective_from", "Berlaku", "date"], ["is_active", "Status", "active"]],
    fields: [{ k: "code", l: "Kode", req: true }, { k: "name", l: "Nama", req: true }, { k: "tax_type", l: "Jenis pajak", t: "select", req: true, o: ["PPN", "PPh 21", "PPh 23", "PPh 4(2) Final", "PPh 25", "PPh Badan", "Lainnya"] },
      { k: "rate", l: "Tarif (%)", t: "num" }, { k: "base", l: "Dasar pengenaan" }, { k: "effective_from", l: "Berlaku sejak", t: "date" }, { k: "legal_basis", l: "Dasar hukum", wide: true }, active],
    defaults: { tax_type: "PPN", is_active: true },
  },
  "cost-types": {
    label: "Jenis Cost", icon: Tags, desc: "Jenis cost yang dipakai di Pricing Simulator (bisa ditambah langsung dari simulator).",
    columns: [["name", "Nama"], ["description", "Keterangan"], ["is_active", "Status", "active"]],
    fields: [{ k: "name", l: "Nama jenis cost", req: true }, { k: "description", l: "Keterangan", wide: true }, active],
    defaults: { is_active: true },
  },
  periods: {
    label: "Periode", icon: CalendarRange, desc: "Periode akuntansi bulanan.",
    columns: [["code", "Kode"], ["name", "Nama"], ["start_date", "Mulai", "date"], ["end_date", "Selesai", "date"], ["status", "Status"]],
    fields: [{ k: "code", l: "Kode (YYYY-MM)", req: true }, { k: "name", l: "Nama", req: true }, { k: "start_date", l: "Tanggal mulai", t: "date", req: true },
      { k: "end_date", l: "Tanggal selesai", t: "date", req: true }, { k: "status", l: "Status", t: "select", o: ["Open", "Closed"] }],
    defaults: { status: "Open" },
  },
};
