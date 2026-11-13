import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { groupsFor } from "./nav";

export function NavGroups({ onNavigate, prefix = "nav", layoutId = "nav-active", compact = false }) {
  const { user } = useAuth();
  return (
    <nav className={`flex flex-col ${compact ? "gap-3" : "gap-5"}`}>
      {groupsFor(user).map((g) => (
        <div key={g.title}>
          {compact ? <div className="mx-auto mb-1.5 w-6 h-px bg-slate-300" /> : <p className="px-4 mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{g.title}</p>}
          <div className="flex flex-col gap-0.5">
            {g.items.map(({ to, label, icon: Icon, id }) => (
              <NavLink key={to} to={to} end={to === "/"} onClick={onNavigate} title={compact ? label : undefined} data-testid={`${prefix}-${id}`}
                className={`relative flex items-center h-11 rounded-2xl group ${compact ? "justify-center w-11 mx-auto" : "gap-3 px-4"}`}>
                {({ isActive }) => (
                  <>
                    {isActive && <motion.span layoutId={layoutId} className="absolute inset-0 rounded-2xl bg-[#12151c]" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
                    <Icon className={`relative w-[18px] h-[18px] shrink-0 transition-colors duration-200 ${isActive ? "text-white" : "text-slate-500 group-hover:text-[#0f52ba]"}`} />
                    {!compact && <span className={`relative text-sm truncate transition-colors duration-200 ${isActive ? "text-white font-semibold" : "text-slate-600 font-medium group-hover:text-[#12151c]"}`}>{label}</span>}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export default function Sidebar({ collapsed, onToggle }) {
  const { signOut } = useAuth();
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <aside className={`hidden md:flex shrink-0 flex-col py-5 transition-[width] duration-300 ${collapsed ? "w-[84px] px-2" : "w-[236px] pl-3 pr-2"}`} data-testid="sidebar">
      <div className={`mb-6 flex items-center ${collapsed ? "flex-col gap-3" : "justify-between gap-2 pl-2"}`}>
        <NavLink to="/" className="flex items-center h-12" data-testid="sidebar-logo">
          <img src="/assets/logo-icon.png" alt="" className={`object-contain shrink-0 ${collapsed ? "h-11 w-11" : "h-10 w-10"}`} />
          {!collapsed && <span className="ml-2 text-[15px] font-extrabold leading-tight tracking-tight text-[#12151c] whitespace-nowrap" data-testid="sidebar-app-name">Maiharta Finance</span>}
        </NavLink>
        <button onClick={onToggle} title={collapsed ? "Tampilkan menu lengkap" : "Ringkas menu (ikon saja)"} data-testid="sidebar-collapse-toggle"
          className="grid place-items-center w-9 h-9 rounded-full text-slate-500 hover:bg-white hover:text-[#0f52ba] transition-colors">
          <Toggle className="w-[18px] h-[18px]" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden mh-scroll pr-1">
        <NavGroups compact={collapsed} />
      </div>
      <button onClick={signOut} title={collapsed ? "Keluar" : undefined} data-testid="sidebar-logout-button"
        className={`mt-4 flex items-center h-11 rounded-2xl bg-white text-sm font-medium text-slate-600 hover:text-red-500 transition-colors ${collapsed ? "justify-center w-11 mx-auto" : "mx-1 gap-3 px-4"}`}>
        <LogOut className="w-[18px] h-[18px]" />{!collapsed && "Keluar"}
      </button>
    </aside>
  );
}
