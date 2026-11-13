import { Navigate } from "react-router-dom";
import { Clock3, LogOut, RefreshCw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import MascotTilt from "@/components/MascotTilt";
import { AppFooter } from "@/components/layout/AppFooter";

export default function Pending() {
  const { user, loading, signOut, refresh } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.has_access) return <Navigate to="/" replace />;
  return (
    <div className="min-h-screen w-full bg-[#eef1f5] flex flex-col" data-testid="pending-page">
      <div className="flex-1 grid lg:grid-cols-2 items-center gap-10 px-6 sm:px-16 py-10">
        <div className="max-w-lg mh-rise">
          <span className="inline-flex items-center gap-2 px-4 h-9 rounded-full bg-white text-sm font-semibold"><Clock3 className="w-4 h-4 text-[#0f52ba]" />{user.role_label}</span>
          <h1 className="mt-6 text-4xl sm:text-5xl font-extrabold tracking-tight">Akun Anda menunggu akses</h1>
          <p className="mt-4 text-slate-600 leading-relaxed">
            Halo <b>{user.name}</b>. Owner perlu memberikan role yang aktif sebelum Anda dapat membuka data keuangan.
          </p>
          <div className="mt-8 flex gap-3">
            <button onClick={refresh} className="h-12 px-6 rounded-full bg-[#12151c] text-white font-semibold flex items-center gap-2 hover:bg-[#0f52ba] transition-colors" data-testid="pending-refresh-button"><RefreshCw className="w-4 h-4" />Cek ulang</button>
            <button onClick={signOut} className="h-12 px-6 rounded-full bg-white font-semibold flex items-center gap-2" data-testid="pending-logout-button"><LogOut className="w-4 h-4" />Keluar</button>
          </div>
        </div>
        <MascotTilt src="/assets/mascot-wave.png" className="h-[60vh] max-h-[560px]" testId="pending-mascot" />
      </div>
      <AppFooter className="px-6 sm:px-16 py-5" />
    </div>
  );
}
