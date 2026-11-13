import { useRef, useState } from "react";
import { Download, Upload, HardDrive } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, btnDark, btnLight } from "@/components/kit";
import { api, errMsg, tokenStore } from "@/lib/api";

export default function Backup() {
  const [busy, setBusy] = useState("");
  const fileRef = useRef(null);

  const download = async () => {
    setBusy("download");
    try {
      const res = await api.get("/backup", { responseType: "blob" });
      const name = (res.headers["content-disposition"] || "").match(/filename="(.+)"/)?.[1] || "maiharta-finance-backup.json";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(res.data);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Backup berhasil diunduh");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy("");
    }
  };

  const restore = async (file) => {
    if (!file) return;
    if (!window.confirm(`Restore akan MENGGANTI seluruh data saat ini dengan isi "${file.name}". Lanjutkan?`)) return;
    setBusy("restore");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/backup/restore", fd);
      const total = Object.values(data.restored).reduce((a, b) => a + b, 0);
      toast.success(`Restore selesai: ${total} baris data dipulihkan. Silakan login ulang.`);
      setTimeout(() => { tokenStore.clear(); window.location.href = "/login"; }, 1500);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="p-5 sm:p-8 lg:p-10" data-testid="backup-page">
      <PageHeader eyebrow="Pengaturan" title="Backup & restore" desc="Unduh salinan seluruh data (JSON) untuk disimpan terpisah, dan pulihkan kembali bila diperlukan." />
      <div className="grid gap-5 md:grid-cols-2">
        <Panel className="p-6" testId="backup-download-panel">
          <HardDrive className="w-6 h-6 text-[#0f52ba]" />
          <h3 className="mt-3 font-bold text-lg">Backup manual</h3>
          <p className="text-sm text-slate-500 mt-1">Seluruh tabel database (kecuali file dokumen di bucket). File berisi data sensitif termasuk hash password, simpan di lokasi aman.</p>
          <button className={`${btnDark} mt-5`} onClick={download} disabled={!!busy} data-testid="backup-download-button">
            <Download className="w-4 h-4" /> {busy === "download" ? "Menyiapkan…" : "Unduh backup"}
          </button>
        </Panel>
        <Panel className="p-6" testId="backup-restore-panel">
          <Upload className="w-6 h-6 text-red-600" />
          <h3 className="mt-3 font-bold text-lg">Restore dari file</h3>
          <p className="text-sm text-slate-500 mt-1">Mengganti semua data saat ini dengan isi file backup. Tercatat di audit trail.</p>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => restore(e.target.files?.[0])} data-testid="backup-restore-input" />
          <button className={`${btnLight} mt-5`} onClick={() => fileRef.current?.click()} disabled={!!busy} data-testid="backup-restore-button">
            <Upload className="w-4 h-4" /> {busy === "restore" ? "Memulihkan…" : "Pilih file backup"}
          </button>
        </Panel>
      </div>
    </div>
  );
}
