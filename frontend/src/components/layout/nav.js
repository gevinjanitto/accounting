import { LayoutGrid, Calculator, FolderKanban, Database, FileBarChart2, Users, ShieldCheck, ArrowDownToLine, ArrowUpFromLine, Landmark, FolderOpen, BookOpenCheck, LineChart, Receipt, FileSpreadsheet, Wallet, Package, TrendingUp, HardDrive } from "lucide-react";

export const NAV_GROUPS = [
  { title: "Utama", items: [{ to: "/", label: "Dasbor", icon: LayoutGrid, id: "dashboard" }] },
  {
    title: "Project", items: [
      { to: "/simulator", label: "Simulator Harga", icon: Calculator, id: "simulator" },
      { to: "/projects", label: "Project", icon: FolderKanban, id: "projects" },
      { to: "/laporan", label: "Laporan Project", icon: FileBarChart2, id: "reports" },
    ],
  },
  {
    title: "Keuangan", items: [
      { to: "/pemasukan", label: "Pemasukan", icon: ArrowDownToLine, id: "incomes" },
      { to: "/pengeluaran", label: "Pengeluaran", icon: ArrowUpFromLine, id: "expenses" },
      { to: "/kas-bank", label: "Kas & Bank", icon: Landmark, id: "cash" },
      { to: "/dokumen", label: "Dokumen", icon: FolderOpen, id: "documents" },
    ],
  },
  {
    title: "Akuntansi", items: [
      { to: "/jurnal", label: "Jurnal & Buku Besar", icon: BookOpenCheck, id: "accounting" },
      { to: "/laporan-keuangan", label: "Laporan Keuangan", icon: LineChart, id: "financial-reports" },
    ],
  },
  {
    title: "Pajak & Perencanaan", items: [
      { to: "/pajak", label: "Pajak", icon: Receipt, id: "tax" },
      { to: "/laporan-fiskal", label: "Laporan Fiskal", icon: FileSpreadsheet, id: "fiscal" },
      { to: "/payroll", label: "Penggajian", icon: Wallet, id: "payroll" },
      { to: "/aset", label: "Aset Tetap", icon: Package, id: "assets" },
      { to: "/forecast", label: "Proyeksi", icon: TrendingUp, id: "forecast" },
    ],
  },
  {
    title: "Pengaturan", items: [
      { to: "/master", label: "Master Data", icon: Database, id: "master" },
      { to: "/users", label: "User & Role", icon: Users, id: "users", ownerOnly: true },
      { to: "/audit", label: "Jejak Audit", icon: ShieldCheck, id: "audit" },
      { to: "/backup", label: "Cadangan & Pemulihan", icon: HardDrive, id: "backup", ownerOnly: true },
    ],
  },
];

export const NAV = NAV_GROUPS.flatMap((g) => g.items);

export const groupsFor = (user) =>
  NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((n) => !n.ownerOnly || user?.role === "owner") })).filter((g) => g.items.length);
