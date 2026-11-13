import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bell, Menu, KeyRound, LogOut } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";
import { NavGroups } from "./Sidebar";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import { ALERT_ICON } from "@/pages/Dashboard";

function AlertsBell({ alerts }) {
  const nav = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative grid place-items-center w-12 h-12 rounded-full bg-white shadow-sm hover:-translate-y-0.5 transition-transform" data-testid="alerts-bell-button">
          <Bell className="w-5 h-5" />
          {alerts.length > 0 && <span className="absolute top-2 right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center" data-testid="alerts-count">{alerts.length}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] rounded-2xl p-2" data-testid="alerts-dropdown">
        <DropdownMenuLabel className="flex items-center justify-between"><span>Notifikasi</span><span className="text-xs font-normal text-slate-500">{alerts.length} aktif</span></DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-[360px] overflow-y-auto mh-scroll">
          {alerts.length === 0 && <p className="text-sm text-slate-500 p-3" data-testid="alerts-empty">Tidak ada notifikasi.</p>}
          {alerts.map((a, i) => {
            const [Icon, tone] = ALERT_ICON[a.type] || ALERT_ICON.over_budget;
            return (
              <DropdownMenuItem key={i} onClick={() => nav(a.link || `/projects/${a.project_id}`)} className="flex gap-3 items-start rounded-xl p-2.5 cursor-pointer" data-testid={`bell-alert-item-${i}`}>
                <span className={`w-8 h-8 shrink-0 rounded-full grid place-items-center ${tone}`}><Icon className="w-4 h-4" /></span>
                <span className="min-w-0"><span className="block text-sm font-semibold whitespace-normal">{a.message}</span><span className="block text-xs text-slate-500 truncate">{a.project}</span></span>
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Topbar({ alerts = [] }) {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const mustChange = !!user?.must_change_password && user?.role !== "owner";

  const submit = (e) => {
    e.preventDefault();
    nav(`/projects?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="h-[76px] shrink-0 flex items-center gap-3 px-4 md:px-6" data-testid="topbar">
      <button className="md:hidden grid place-items-center w-11 h-11 rounded-2xl bg-white" onClick={() => setOpen(true)} data-testid="mobile-menu-button">
        <Menu className="w-5 h-5" />
      </button>
      <form onSubmit={submit} className="flex-1 min-w-0 flex items-center bg-white rounded-full pl-5 pr-1.5 h-12 shadow-sm focus-within:ring-2 focus-within:ring-[#0f52ba]/30 transition-shadow">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari project, kode, atau no. kontrak…" className="flex-1 bg-transparent outline-none text-sm" data-testid="global-search-input" />
        <button type="submit" className="grid place-items-center w-9 h-9 rounded-full bg-[#eef1f5] hover:bg-[#0f52ba] hover:text-white transition-colors" data-testid="global-search-button">
          <Search className="w-4 h-4" />
        </button>
      </form>
      <div className="shrink-0 flex items-center gap-2">
        <AlertsBell alerts={alerts} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 h-12 pl-4 pr-1.5 rounded-full bg-white shadow-sm" data-testid="user-menu-trigger">
              <span className="hidden sm:block text-sm font-semibold max-w-[160px] truncate">{user?.name}</span>
              <img src="/assets/mascot-blue.png" alt="" className="w-9 h-9 rounded-full object-cover object-top bg-[#e0ecff]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-2xl">
            <DropdownMenuLabel>
              <div className="font-semibold">{user?.name}</div>
              <div className="text-xs text-slate-500 font-normal">{user?.email} · {user?.role_label}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setPwOpen(true)} data-testid="menu-change-password"><KeyRound className="w-4 h-4 mr-2" />Ganti password</DropdownMenuItem>
            <DropdownMenuItem onClick={signOut} className="text-red-600" data-testid="menu-logout"><LogOut className="w-4 h-4 mr-2" />Keluar</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 bg-[#eef1f5]">
          <SheetTitle className="flex items-center gap-2 mb-6"><img src="/assets/logo-icon.png" alt="" className="w-8 h-8" />Maiharta Finance</SheetTitle>
          <div className="overflow-y-auto mh-scroll max-h-[calc(100vh-100px)] -mx-2"><NavGroups prefix="mobile-nav" layoutId="mobile-nav-active" onNavigate={() => setOpen(false)} /></div>
        </SheetContent>
      </Sheet>
      <ChangePasswordDialog open={pwOpen || mustChange} onOpenChange={setPwOpen} forced={mustChange} />
    </header>
  );
}
