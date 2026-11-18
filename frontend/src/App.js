import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AppShell from "@/components/layout/AppShell";
import Login from "@/pages/Login";
import Pending from "@/pages/Pending";
import Dashboard from "@/pages/Dashboard";
import MasterData from "@/pages/MasterData";
import Projects from "@/pages/Projects";
import ProjectDetail from "@/pages/ProjectDetail";
import Simulator from "@/pages/Simulator";
import Reports from "@/pages/Reports";
import Users from "@/pages/Users";
import Audit from "@/pages/Audit";
import Incomes from "@/pages/Incomes";
import Expenses from "@/pages/Expenses";
import CashBank from "@/pages/CashBank";
import Accounting from "@/pages/Accounting";
import FinancialReports from "@/pages/FinancialReports";
import Documents from "@/pages/Documents";
import Tax from "@/pages/Tax";
import FiscalReport from "@/pages/FiscalReport";
import Payroll from "@/pages/Payroll";
import Assets from "@/pages/Assets";
import Forecast from "@/pages/Forecast";
import Backup from "@/pages/Backup";

function Splash() {
  return (
    <div className="h-screen grid place-items-center bg-[#eef1f5]" data-testid="app-loading">
      <img src="/assets/logo-icon.png" alt="Maiharta" className="w-14 h-14 mh-float" />
    </div>
  );
}

function Protected({ children, ownerOnly }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.has_access) return <Navigate to="/menunggu-akses" replace />;
  if (ownerOnly && user.role !== "owner") return <Navigate to="/" replace />;
  return children;
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (user) return <Navigate to={user.has_access ? "/" : "/menunggu-akses"} replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors closeButton />
        <Routes>
          <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
          <Route path="/menunggu-akses" element={<Pending />} />
          <Route element={<Protected><AppShell /></Protected>}>
            <Route index element={<Dashboard />} />
            <Route path="simulator" element={<Simulator />} />
            <Route path="simulator/:id" element={<Simulator />} />
            <Route path="projects" element={<Projects />} />
            <Route path="projects/:id" element={<ProjectDetail />} />
            <Route path="master" element={<MasterData />} />
            <Route path="master/:kind" element={<MasterData />} />
            <Route path="laporan" element={<Reports />} />
            <Route path="users" element={<Protected ownerOnly><Users /></Protected>} />
            <Route path="audit" element={<Audit />} />
            <Route path="pemasukan" element={<Incomes />} />
            <Route path="pengeluaran" element={<Expenses />} />
            <Route path="kas-bank" element={<CashBank />} />
            <Route path="jurnal" element={<Accounting />} />
            <Route path="laporan-keuangan" element={<FinancialReports />} />
            <Route path="dokumen" element={<Documents />} />
            <Route path="pajak" element={<Tax />} />
            <Route path="laporan-fiskal" element={<FiscalReport />} />
            <Route path="payroll" element={<Payroll />} />
            <Route path="aset" element={<Assets />} />
            <Route path="forecast" element={<Forecast />} />
            <Route path="backup" element={<Protected ownerOnly><Backup /></Protected>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
