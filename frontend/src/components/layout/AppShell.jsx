import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { AppFooter } from "./AppFooter";
import { api } from "@/lib/api";

export default function AppShell() {
  const loc = useLocation();
  const [alerts, setAlerts] = useState([]);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("mh_sidebar_collapsed") === "1");
  const toggle = () => setCollapsed((c) => { localStorage.setItem("mh_sidebar_collapsed", c ? "0" : "1"); return !c; });

  useEffect(() => {
    api.get("/dashboard").then(({ data }) => setAlerts([...data.tax.alerts, ...data.alerts, ...data.finance.alerts])).catch(() => {});
  }, [loc.pathname]);

  return (
    <div className="h-screen w-full flex bg-[#eef1f5] overflow-hidden" data-testid="app-shell">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar alerts={alerts} />
        <main className="flex-1 min-h-0 overflow-y-auto mh-scroll bg-white md:rounded-tl-[36px] [-webkit-mask-image:-webkit-radial-gradient(white,black)] flex flex-col" data-testid="main-panel">
          <AnimatePresence mode="wait">
            <motion.div key={loc.pathname} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className="flex-1">
              <Outlet />
            </motion.div>
          </AnimatePresence>
          <AppFooter className="px-6 lg:px-10 py-5 border-t border-slate-100" />
        </main>
      </div>
    </div>
  );
}
