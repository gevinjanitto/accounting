import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, RefreshCw, Coins, Calculator, BarChart3, FileText, Wallet, CreditCard, Headphones, Info } from "lucide-react";
import { api, errMsg } from "@/lib/api";

const TILE = {
  koin: { icon: Coins, bg: "#fff4d6", fg: "#c58a00" },
  kalkulator: { icon: Calculator, bg: "#e0ecff", fg: "#0f52ba" },
  grafik: { icon: BarChart3, bg: "#dfe9f8", fg: "#1f5a9a" },
  dokumen: { icon: FileText, bg: "#f1f5f9", fg: "#475569" },
  dompet: { icon: Wallet, bg: "#fde8e8", fg: "#c2410c" },
  kartu: { icon: CreditCard, bg: "#ede9fe", fg: "#5b21b6" },
};

const ENV_SITE_KEY = (process.env.REACT_APP_RECAPTCHA_SITE_KEY || "").trim();
let scriptPromise;
const loadGoogle = () => {
  if (window.grecaptcha?.render) return Promise.resolve(window.grecaptcha);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      window.__mhRecaptchaReady = () => resolve(window.grecaptcha);
      const s = document.createElement("script");
      s.src = "https://www.google.com/recaptcha/api.js?onload=__mhRecaptchaReady&render=explicit&hl=id";
      s.async = true;
      s.onerror = () => { scriptPromise = null; reject(new Error("Gagal memuat Google reCAPTCHA")); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
};

function GoogleCaptcha({ siteKey, onChange }) {
  const box = useRef(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    loadGoogle().then((g) => {
      if (!alive || !box.current || box.current.dataset.rendered) return;
      box.current.dataset.rendered = "1";
      g.render(box.current, {
        sitekey: siteKey,
        callback: (t) => onChange(t),
        "expired-callback": () => onChange(null),
        "error-callback": () => { onChange(null); setErr("reCAPTCHA error, periksa site key & domain terdaftar di Google"); },
      });
    }).catch((e) => setErr(e.message));
    return () => { alive = false; };
  }, [siteKey, onChange]);
  return (
    <div data-testid="captcha-widget" data-provider="google">
      <div ref={box} className="min-h-[78px]" />
      {err && <p className="text-xs text-red-600 mt-1.5" data-testid="captcha-error">{err}</p>}
    </div>
  );
}

export default function Captcha(props) {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    api.get("/captcha/config")
      .then(({ data }) => setCfg(data))
      .catch((e) => setCfg(ENV_SITE_KEY ? { provider: "google", site_key: ENV_SITE_KEY } : { provider: "error", error: errMsg(e) }));
  }, []);
  if (!cfg) return <div className="h-[78px] rounded-[14px] bg-slate-100 animate-pulse" data-testid="captcha-loading" />;
  const siteKey = cfg.site_key || ENV_SITE_KEY;
  if (cfg.provider === "google") {
    if (!siteKey) return <p className="text-xs text-red-600" data-testid="captcha-error">RECAPTCHA_SITE_KEY belum di-set di backend.</p>;
    return <GoogleCaptcha siteKey={siteKey} onChange={props.onChange} />;
  }
  if (cfg.provider === "error") return <p className="text-xs text-red-600 bg-red-50 rounded-2xl px-4 py-3" data-testid="captcha-error">{cfg.error}</p>;
  return <BuiltinCaptcha {...props} />;
}

// Captcha bawaan (dipakai bila RECAPTCHA_SECRET_KEY tidak di-set, mis. saat lokal).
function BuiltinCaptcha({ passToken, onChange }) {
  const [state, setState] = useState("idle");
  const [ch, setCh] = useState(null);
  const [sel, setSel] = useState([]);
  const [err, setErr] = useState("");

  const load = async () => {
    setState("loading");
    setErr("");
    setSel([]);
    try {
      const { data } = await api.get("/captcha/challenge");
      setTimeout(() => { setCh(data); setState("challenge"); }, 550);
    } catch (e) {
      setErr(errMsg(e));
      setState("idle");
    }
  };

  const verify = async () => {
    setState("verifying");
    try {
      const { data } = await api.post("/captcha/verify", { token: ch.token, selected: sel });
      onChange(data.pass_token);
      setState("done");
    } catch (e) {
      setErr(errMsg(e));
      setTimeout(load, 700);
    }
  };

  const done = passToken && state === "done";
  const toggle = (i) => setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));

  return (
    <div className="relative" data-testid="captcha-widget">
      <div className="flex items-center justify-between h-[74px] pl-4 pr-3 rounded-[14px] border border-slate-300 bg-[#f9f9f9] shadow-[0_1px_2px_rgba(0,0,0,.06)]">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => !done && state === "idle" && load()} data-testid="captcha-checkbox"
            className={`w-7 h-7 rounded-[4px] grid place-items-center transition-all ${done ? "" : "border-2 border-slate-400 bg-white hover:border-slate-500"}`}>
            {state === "loading" && <span className="w-6 h-6 rounded-full border-[3px] border-[#4a90e2] border-t-transparent mh-spin" />}
            {done && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}><Check className="w-8 h-8 text-[#0f6fd6]" strokeWidth={3.5} /></motion.span>}
          </button>
          <span className="text-[14px] text-slate-700">{done ? "Terverifikasi" : "Saya bukan robot"}</span>
        </div>
        <div className="flex flex-col items-center text-[9px] text-slate-500 leading-tight">
          <RefreshCw className="w-7 h-7 text-[#4a90e2]" strokeWidth={2.4} />
          <span className="mt-0.5 font-medium">reCAPTCHA</span>
          <span>Privasi - Persyaratan</span>
        </div>
      </div>
      {err && state !== "challenge" && <p className="text-xs text-red-600 mt-1.5" data-testid="captcha-error">{err}</p>}

      <AnimatePresence>
        {(state === "challenge" || state === "verifying") && ch && (
          <motion.div initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}
            className="absolute z-30 left-0 bottom-[82px] w-[316px] bg-white rounded-md shadow-2xl border border-slate-200 p-2" data-testid="captcha-challenge">
            <div className="bg-[#4a90e2] text-white px-4 py-4 rounded-sm">
              <p className="text-sm">Pilih semua gambar dengan</p>
              <p className="text-2xl font-bold leading-tight capitalize" data-testid="captcha-target" data-target={ch.target}>{ch.target_label}</p>
              <p className="text-xs opacity-90">Klik verifikasi setelah selesai</p>
            </div>
            <div className="grid grid-cols-3 gap-1 mt-1">
              {ch.tiles.map((t, i) => {
                const T = TILE[t];
                const on = sel.includes(i);
                return (
                  <button type="button" key={i} onClick={() => toggle(i)} data-testid={`captcha-tile-${i}`} data-tile={t}
                    className="relative aspect-square grid place-items-center overflow-hidden" style={{ background: T.bg }}>
                    <motion.span animate={{ scale: on ? 0.78 : 1 }} transition={{ type: "spring", stiffness: 300 }}>
                      <T.icon className="w-12 h-12" style={{ color: T.fg, transform: `rotate(${(i * 23) % 40 - 20}deg)` }} />
                    </motion.span>
                    {on && <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-[#4a90e2] grid place-items-center"><Check className="w-3.5 h-3.5 text-white" /></span>}
                  </button>
                );
              })}
            </div>
            {err && <p className="text-xs text-red-600 px-1 pt-2">{err}</p>}
            <div className="flex items-center justify-between pt-2 px-1 border-t border-slate-200 mt-2">
              <div className="flex gap-3 text-slate-500">
                <button type="button" onClick={load} data-testid="captcha-reload"><RefreshCw className="w-5 h-5" /></button>
                <Headphones className="w-5 h-5" /><Info className="w-5 h-5" />
              </div>
              <button type="button" onClick={verify} disabled={state === "verifying"} data-testid="captcha-verify-button"
                className="bg-[#4a90e2] hover:bg-[#3b7dd8] text-white text-sm font-semibold uppercase px-5 py-2.5 rounded-sm">
                {state === "verifying" ? "…" : "Verifikasi"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const useCaptchaReset = () => {
  const [key, setKey] = useState(0);
  return [key, () => setKey((k) => k + 1)];
};
