import axios from "axios";

const normalizeBase = (raw) => {
  let u = (raw || "").trim().replace(/\/+$/, "").replace(/\/api$/, "");
  if (u && !/^https?:\/\//i.test(u)) u = `${/^(localhost|127\.)/.test(u) ? "http" : "https"}://${u}`;
  return u;
};
export const API = `${normalizeBase(process.env.REACT_APP_BACKEND_URL)}/api`;
const TOKEN_KEY = "mh_finance_token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((cfg) => {
  const t = tokenStore.get();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && tokenStore.get() && !err.config.url.includes("/auth/login")) {
      tokenStore.clear();
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export const errMsg = (e, fallback = "Terjadi kesalahan") => {
  const d = e?.response?.data?.detail;
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ");
  if (d) return d;
  if (e?.message === "Network Error") return "Tidak dapat terhubung ke server backend. Periksa REACT_APP_BACKEND_URL (frontend) dan CORS_ORIGINS (backend).";
  return e?.message || fallback;
};
