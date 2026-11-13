import { forwardRef, useLayoutEffect, useRef } from "react";

// Tampilan angka dengan pemisah ribuan "." dan desimal ","; nilai yang dikirim tetap angka mentah ("1500000.5").
export const fmtNum = (v) => {
  if (v === "" || v === null || v === undefined) return "";
  const s = String(v);
  if (s === "-") return "-";
  const neg = s.startsWith("-");
  const [i, d] = s.replace("-", "").split(".");
  const int = (i || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + int + (d !== undefined ? `,${d}` : "");
};

export const parseNum = (t) => {
  let s = String(t).replace(/[^\d,-]/g, "");
  const neg = s.startsWith("-");
  s = s.replace(/-/g, "");
  const [i, ...rest] = s.split(",");
  const int = i.replace(/^0+(?=\d)/, "");
  const raw = s.includes(",") ? `${int || "0"}.${rest.join("")}` : int;
  return (neg ? "-" : "") + raw;
};

const sig = (s) => (s.match(/[\d,-]/g) || []).length;

// Posisi kursor setelah format ulang: setelah karakter signifikan (angka/koma) ke-n.
const caretAt = (formatted, n) => {
  if (n <= 0) return 0;
  let c = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (/[\d,-]/.test(formatted[i])) c += 1;
    if (c >= n) return i + 1;
  }
  return formatted.length;
};

export const NumberInput = forwardRef(function NumberInput({ value, onChange, as: C = "input", onFocus, onMouseUp, onKeyDown, ...rest }, ref) {
  const inner = useRef(null);
  const caret = useRef(null);
  const shown = fmtNum(value);
  const setRef = (el) => {
    inner.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  useLayoutEffect(() => {
    const el = inner.current;
    if (el && caret.current !== null && document.activeElement === el) {
      const p = caretAt(el.value, caret.current);
      el.setSelectionRange(p, p);
    }
    caret.current = null;
  }, [shown]);

  const emit = (text, caretSig) => {
    caret.current = caretSig;
    onChange(parseNum(text));
  };

  return (
    <C ref={setRef} type="text" inputMode="decimal" autoComplete="off" value={shown}
      onChange={(e) => emit(e.target.value, sig(e.target.value.slice(0, e.target.selectionStart ?? e.target.value.length)))}
      onFocus={(e) => { const el = e.target; requestAnimationFrame(() => el.select()); onFocus?.(e); }}
      onMouseUp={(e) => { const el = e.target; if (el.selectionStart === el.selectionEnd) el.select(); onMouseUp?.(e); }}
      onKeyDown={(e) => {
        if (e.key === "." || e.key === "Decimal") {
          e.preventDefault();
          const el = e.target;
          const s = el.selectionStart ?? el.value.length;
          const next = `${el.value.slice(0, s)},${el.value.slice(el.selectionEnd ?? s)}`;
          emit(next, sig(next.slice(0, s + 1)));
        }
        onKeyDown?.(e);
      }}
      {...rest} />
  );
});
