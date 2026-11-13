import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import AuthLayout from "@/components/AuthLayout";
import Captcha, { useCaptchaReset } from "@/components/Captcha";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export const pillInput = "w-full h-14 rounded-full border border-slate-300 bg-white pl-12 pr-5 text-[15px] outline-none transition-[border-color,box-shadow] duration-200 focus:border-[#0f52ba] focus:shadow-[0_0_0_4px_rgba(15,82,186,.12)]";
const stagger = (i) => ({ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.08 * i, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] } });

export default function Login() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ email: "", password: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [captcha, setCaptcha] = useState(null);
  const [capKey, resetCaptcha] = useCaptchaReset();
  const [focus, setFocus] = useState(null);
  const [tick, setTick] = useState(0);
  const mascotMode = focus === "password" && !show ? "cover" : focus === "email" ? "typing" : captcha ? "success" : "idle";
  const fieldEvents = (name) => ({ onFocus: () => setFocus(name), onBlur: () => setFocus(null), onKeyDown: () => setTick((t) => t + 1) });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!captcha) return setError("Centang captcha \"Saya bukan robot\" terlebih dahulu");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/login", { ...f, captcha_token: captcha });
      signIn(data.token, data.user);
      toast.success(`Selamat datang, ${data.user.name}`);
      nav(data.user.has_access ? "/" : "/menunggu-akses");
    } catch (err) {
      setError(errMsg(err, "Login gagal"));
      setCaptcha(null);
      resetCaptcha();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout mascotMode={mascotMode} mascotTick={tick}>
      <motion.h1 {...stagger(0)} className="text-4xl sm:text-5xl font-extrabold tracking-tight text-[#12151c]">Selamat datang!</motion.h1>
      <motion.p {...stagger(1)} className="mt-3 text-slate-500 leading-relaxed">
        Kelola costing, HPP, dan harga penawaran project <b className="text-[#12151c]">CV Maiharta</b> dalam satu aplikasi.
      </motion.p>
      <form onSubmit={submit} className="mt-9 space-y-4" data-testid="login-form">
        <motion.div {...stagger(2)} className="relative">
          <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="email" required placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} {...fieldEvents("email")} className={pillInput} data-testid="login-email-input" />
        </motion.div>
        <motion.div {...stagger(3)} className="relative">
          <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type={show ? "text" : "password"} required placeholder="Password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} {...fieldEvents("password")} className={`${pillInput} pr-14`} data-testid="login-password-input" />
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setShow(!show)} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" data-testid="login-toggle-password">
            {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </motion.div>
        <motion.div {...stagger(4)} className="flex justify-end">
          <button type="button" onClick={() => toast.info("Hubungi Owner untuk reset password. Owner dapat mereset password dari menu User & Role.")} className="text-sm font-medium text-slate-600 hover:text-[#0f52ba]" data-testid="login-forgot-password">
            Lupa password?
          </button>
        </motion.div>
        <motion.div {...stagger(5)}>
          <Captcha key={capKey} passToken={captcha} onChange={setCaptcha} />
        </motion.div>
        {error && <motion.p initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="text-sm text-red-600 bg-red-50 rounded-2xl px-4 py-3" data-testid="login-error">{error}</motion.p>}
        <motion.button {...stagger(6)} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} type="submit" disabled={busy}
          className="group w-full h-14 rounded-full bg-[#12151c] text-white font-semibold flex items-center justify-center gap-2 hover:bg-[#0f52ba] transition-colors disabled:opacity-60" data-testid="login-submit-button">
          {busy ? <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent mh-spin" /> : <>Masuk <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" /></>}
        </motion.button>
      </form>
    </AuthLayout>
  );
}
