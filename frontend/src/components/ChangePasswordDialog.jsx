import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function ChangePasswordDialog({ open, onOpenChange, forced }) {
  const { setUser } = useAuth();
  const [f, setF] = useState({ current_password: "", new_password: "", confirm: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (f.new_password.length < 8) return toast.error("Password baru minimal 8 karakter");
    if (f.new_password !== f.confirm) return toast.error("Konfirmasi password tidak sama");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/change-password", { current_password: f.current_password, new_password: f.new_password });
      setUser(data);
      toast.success("Password berhasil diganti");
      setF({ current_password: "", new_password: "", confirm: "" });
      onOpenChange(false);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !forced && onOpenChange(v)}>
      <DialogContent className={`rounded-3xl ${forced ? "[&>button]:hidden" : ""}`} data-testid="change-password-dialog" onInteractOutside={(e) => forced && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{forced ? "Ganti password awal" : "Ganti password"}</DialogTitle>
          <DialogDescription>{forced ? "Demi keamanan, ganti password awal (dari Owner) sebelum melanjutkan." : "Gunakan minimal 8 karakter."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {[["current_password", "Password saat ini"], ["new_password", "Password baru"], ["confirm", "Ulangi password baru"]].map(([k, l]) => (
            <div key={k} className="space-y-1.5">
              <Label>{l}</Label>
              <Input type="password" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} required className="rounded-full h-11" data-testid={`change-password-${k}`} />
            </div>
          ))}
          <Button type="submit" disabled={busy} className="w-full rounded-full h-11 bg-[#12151c] hover:bg-[#0f52ba]" data-testid="change-password-submit">
            {busy ? "Menyimpan…" : "Simpan password"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
