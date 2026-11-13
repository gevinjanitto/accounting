import { useEffect, useState, lazy, Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TrendingUp, ShieldCheck, PieChart } from "lucide-react";
import Mascot from "@/components/Mascot";
import { AppFooter } from "@/components/layout/AppFooter";

const FinanceScene = lazy(() => import("@/components/three/FinanceScene"));

const SLIDES = [
  { t: "Hitung HPP & harga penawaran", d: "dalam hitungan detik dengan Maiharta Finance" },
  { t: "Pantau budget vs realisasi", d: "setiap project, lengkap dengan peringatan dini" },
  { t: "Negosiasi tanpa kehilangan margin", d: "simulasikan kenaikan dari harga minimum" },
];

function GlassCard({ className, children }) {
  return <div className={`absolute bg-white/80 backdrop-blur-xl border border-white rounded-3xl shadow-[0_20px_50px_-20px_rgba(10,58,133,.45)] ${className}`}>{children}</div>;
}

function ShowcasePanel({ mode, tick }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % SLIDES.length), 4200);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="relative hidden lg:flex flex-col h-full overflow-hidden bg-[#dbe8fb] lg:rounded-l-[44px] mh-grain" data-testid="login-showcase">
      <div className="absolute inset-0 mh-dots opacity-60" />
      <div className="absolute -top-24 -right-24 w-[420px] h-[420px] rounded-full bg-[#cddcf3]" />
      <div className="absolute -bottom-32 -left-20 w-[380px] h-[380px] rounded-full bg-[#0f52ba]/15" />
      <div className="absolute inset-0"><Suspense fallback={null}><FinanceScene /></Suspense></div>
      <div className="relative z-30 px-10 pt-8 flex justify-center">
        <div className="text-center px-7 py-4 rounded-[28px] bg-white/65 backdrop-blur-xl border border-white/80 shadow-[0_20px_50px_-30px_rgba(10,58,133,.45)]">
        <div className="flex justify-center gap-1.5 mb-4">
          {SLIDES.map((_, k) => (
            <button key={k} onClick={() => setI(k)} data-testid={`login-slide-dot-${k}`} className={`h-2 rounded-full transition-all duration-300 ${k === i ? "w-7 bg-[#12151c]" : "w-2 bg-[#12151c]/25"}`} />
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35 }}>
            <p className="text-2xl font-semibold text-[#12151c]">{SLIDES[i].t}</p>
            <p className="text-slate-600 mt-1">{SLIDES[i].d.replace("Maiharta Finance", "")}<b className="text-[#0f52ba]">{SLIDES[i].d.includes("Maiharta") ? "Maiharta Finance" : ""}</b></p>
          </motion.div>
        </AnimatePresence>
        </div>
      </div>
      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-x-0 bottom-0 flex justify-center">
          <Mascot mode={mode} tick={tick} className="w-[min(94%,760px)] h-[min(72vh,700px)]" testId="login-mascot">
          <GlassCard className="left-[9%] top-[30%] p-4 w-48">
            <div className="flex items-center gap-2 text-xs text-slate-500"><TrendingUp className="w-4 h-4 text-[#3574c4]" />Project costing</div>
            <p className="text-lg font-extrabold text-[#12151c] mt-1 leading-snug">HPP & margin otomatis</p>
            <span className="mt-2 inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#cddcf3]">Akurat & terukur</span>
          </GlassCard>
          <GlassCard className="right-[8%] top-[18%] p-4 w-48">
            <div className="flex items-center gap-2 text-xs text-slate-500"><PieChart className="w-4 h-4 text-[#0f52ba]" />Laporan keuangan</div>
            <p className="text-lg font-extrabold mt-1 leading-snug">Real-time & terintegrasi</p>
            <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden"><div className="h-full w-[64%] bg-[#0f52ba] rounded-full" /></div>
          </GlassCard>
          <GlassCard className="right-[8%] bottom-[14%] p-3 pr-5 flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-[#12151c] grid place-items-center"><ShieldCheck className="w-5 h-5 text-white" /></span>
            <div><p className="text-xs text-slate-500">Audit trail</p><p className="text-sm font-bold">Setiap perubahan tercatat</p></div>
          </GlassCard>
          </Mascot>
        </div>
      </div>
    </div>
  );
}

export default function AuthLayout({ children, mascotMode = "idle", mascotTick = 0 }) {
  return (
    <div className="min-h-screen lg:h-screen w-full grid lg:grid-cols-[minmax(460px,1fr)_1.15fr] bg-white" data-testid="auth-layout">
      <div className="flex flex-col px-6 sm:px-12 xl:px-20 py-8 overflow-y-auto mh-scroll">
        <div className="flex items-center gap-3 mh-rise">
          <img src="/assets/logo-icon.png" alt="" className="h-11 w-11 object-contain" data-testid="auth-logo" />
          <span className="text-xl font-extrabold tracking-tight text-[#12151c]" data-testid="auth-app-name">Maiharta <span className="text-[#0f52ba]">Finance</span></span>
        </div>
        <div className="flex-1 flex items-center">
          <div className="w-full max-w-[440px] mx-auto py-10">{children}</div>
        </div>
        <AppFooter />
      </div>
      <ShowcasePanel mode={mascotMode} tick={mascotTick} />
    </div>
  );
}
