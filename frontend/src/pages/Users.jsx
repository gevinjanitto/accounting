import { useEffect, useState, useCallback } from "react";
import { UserPlus, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PageHeader, Loading, Field, btnDark } from "@/components/kit";
import { api, errMsg } from "@/lib/api";
import { tglJam } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";

function UserDialog({ open, onClose, roles, onSaved }) {
  const [f, setF] = useState({ email: "", role: "finance_admin" });
  const save = async () => {
    try { await api.post("/users", f); toast.success(`User ${f.email} dibuat · password awal 12345678`); onSaved(); onClose(); setF({ email: "", role: "finance_admin" }); } catch (err) { toast.error(errMsg(err)); }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-[28px]" data-testid="user-create-dialog">
        <DialogHeader><DialogTitle>Tambah user</DialogTitle><DialogDescription>Cukup isi email. Password awal otomatis <b>12345678</b> dan user wajib menggantinya saat login pertama.</DialogDescription></DialogHeader>
        <Field f={{ k: "email", l: "Email", t: "email", req: true }} value={f.email} onChange={(k, v) => setF({ ...f, [k]: v })} />
        <Field f={{ k: "role", l: "Role", t: "select", req: true, o: roles.map((r) => ({ v: r.value, l: r.label + (r.active ? "" : " (belum aktif)") })) }} value={f.role} onChange={(k, v) => setF({ ...f, [k]: v })} />
        <button onClick={save} className={`${btnDark} justify-center`} data-testid="user-create-save">Simpan user</button>
      </DialogContent>
    </Dialog>
  );
}

function ResetDialog({ user, onClose }) {
  const [pw, setPw] = useState("");
  const save = async () => {
    try { await api.post(`/users/${user.id}/reset-password`, { new_password: pw }); toast.success("Password direset"); onClose(); } catch (err) { toast.error(errMsg(err)); }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-[28px]" data-testid="reset-password-dialog">
        <DialogHeader><DialogTitle>Reset password {user.email}</DialogTitle><DialogDescription>Sampaikan password sementara ini ke user; user wajib menggantinya saat login.</DialogDescription></DialogHeader>
        <Field f={{ k: "pw", l: "Password baru (min. 8)", t: "password", req: true }} value={pw} onChange={(_, v) => setPw(v)} />
        <button onClick={save} className={`${btnDark} justify-center`} data-testid="reset-password-save">Reset password</button>
      </DialogContent>
    </Dialog>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const [data, setData] = useState(null);
  const [create, setCreate] = useState(false);
  const [reset, setReset] = useState(null);
  const load = useCallback(() => api.get("/users").then(({ data }) => setData(data)), []);
  useEffect(() => { load(); }, [load]);
  const patch = async (u, body) => { try { await api.patch(`/users/${u.id}`, body); toast.success("User diperbarui"); load(); } catch (err) { toast.error(errMsg(err)); } };
  if (!data) return <Loading />;
  return (
    <div className="p-5 sm:p-8 lg:p-10" data-testid="users-page">
      <PageHeader eyebrow="Login & Akses" title="User & role" desc="User didaftarkan oleh Owner (tidak ada pendaftaran mandiri). Role nonaktif tidak dapat membuka data keuangan."
        actions={<button className={btnDark} onClick={() => setCreate(true)} data-testid="user-add-button"><UserPlus className="w-4 h-4" />Tambah user</button>} />
      <div className="flex flex-wrap gap-2 mb-6">
        {data.roles.map((r) => <span key={r.value} className={`h-8 px-3 rounded-full text-xs font-semibold inline-flex items-center ${r.active ? "bg-[#cddcf3]" : "bg-slate-100 text-slate-500"}`}>{r.label} · {r.active ? "aktif" : "disiapkan"}</span>)}
      </div>
      <div className="overflow-x-auto rounded-[24px] border border-slate-200">
        <table className="w-full text-sm" data-testid="users-table">
          <thead className="bg-[#f8fafc] text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Aktif</th><th className="px-4 py-3">Login terakhir</th><th className="px-4 py-3" /></tr></thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100" data-testid={`user-row-${u.email}`}>
                <td className="px-4 py-3"><p className="font-semibold">{u.name}{u.id === me.id && <span className="text-xs text-slate-400"> (Anda)</span>}</p><p className="text-xs text-slate-500">{u.email}</p></td>
                <td className="px-4 py-3 w-56">
                  <Select value={u.role} onValueChange={(v) => patch(u, { role: v })}>
                    <SelectTrigger className="rounded-full h-10" data-testid={`user-role-select-${u.email}`}><SelectValue /></SelectTrigger>
                    <SelectContent>{data.roles.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="px-4 py-3"><Switch checked={u.is_active} onCheckedChange={(v) => patch(u, { is_active: v })} data-testid={`user-active-switch-${u.email}`} /></td>
                <td className="px-4 py-3 text-slate-500">{tglJam(u.last_login_at)}</td>
                <td className="px-4 py-3 text-right"><button onClick={() => setReset(u)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-xs font-semibold" data-testid={`user-reset-${u.email}`}><KeyRound className="w-3.5 h-3.5" />Reset password</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <UserDialog open={create} onClose={() => setCreate(false)} roles={data.roles} onSaved={load} />
      {reset && <ResetDialog user={reset} onClose={() => setReset(null)} />}
    </div>
  );
}
