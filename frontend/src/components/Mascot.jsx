import { useEffect, useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

// Frame-sequence player (12 fps, tanpa crossfade): kursor horizontal men-scrub arah pandang, ngetik = jari menekan kalkulator, captcha sukses = jempol.
const FPS = 12;
const pad = (i) => String(i).padStart(3, "0");
const SRC = { seq: (i) => `/assets/mascot/seq/f${pad(i)}.webp`, scrub: (i) => `/assets/mascot/scrub/s${pad(i)}.webp`, thumb: (i) => `/assets/mascot/thumb/t${pad(i)}.webp`, type: (i) => `/assets/mascot/type/k${pad(i)}.webp` };
const SCRUB_N = 61;
const THUMB_N = 61;
const THUMB_LOOP = [24, 60];
const TYPING = [0, 21];
const COVER = 150;
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
const LISTS = { scrub: range(0, SCRUB_N - 1), thumb: range(0, THUMB_N - 1), type: range(...TYPING), seq: [101, COVER] };

function useFrames() {
  const imgs = useRef({ seq: [], scrub: [], thumb: [], type: [] });
  useEffect(() => {
    const order = [["seq", 101], ["scrub", Math.floor(SCRUB_N / 2)], ["thumb", 0], ...Object.entries(LISTS).flatMap(([k, l]) => l.map((i) => [k, i]))];
    order.forEach(([set, i]) => {
      if (imgs.current[set][i]) return;
      const im = new Image();
      im.decoding = "async";
      im.src = SRC[set](i);
      imgs.current[set][i] = im;
    });
  }, []);
  return imgs;
}

const ready = (im) => im && im.complete && im.naturalWidth > 0;

function pick(imgs, set, i) {
  const arr = imgs[set];
  for (let d = 0; d < 70; d += 1) {
    if (ready(arr[i - d])) return arr[i - d];
    if (ready(arr[i + d])) return arr[i + d];
  }
  return ready(imgs.seq[101]) ? imgs.seq[101] : null;
}

function drawContain(ctx, im, w, h) {
  if (!im) return;
  const s = Math.min(w / im.naturalWidth, h / im.naturalHeight);
  const dw = im.naturalWidth * s, dh = im.naturalHeight * s;
  ctx.drawImage(im, (w - dw) / 2, h - dh, dw, dh);
}

function usePlayer(canvasRef, imgs, modeRef, mouseX, lastKey) {
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv.getContext("2d");
    let raf, last = performance.now(), prev = null, scrub = Math.floor(SCRUB_N / 2), thumb = 0, thumbDir = 1, typing = TYPING[0], typeDir = 1;
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const mode = modeRef.current;
      let frame;
      if (mode === "success") {
        if (prev !== "success") { thumb = 0; thumbDir = 1; }
        thumb += thumbDir * FPS * dt;
        if (thumb >= THUMB_LOOP[1]) { thumb = THUMB_LOOP[1]; thumbDir = -1; }
        if (thumbDir < 0 && thumb <= THUMB_LOOP[0]) { thumb = THUMB_LOOP[0]; thumbDir = 1; }
        frame = ["thumb", Math.round(thumb)];
      } else if (mode === "typing") {
        if (prev !== "typing") { typing = TYPING[0]; typeDir = 1; }
        typing += typeDir * FPS * dt * (now - lastKey.current < 450 ? 1.3 : 1);
        if (typing >= TYPING[1]) { typing = TYPING[1]; typeDir = -1; }
        if (typing <= TYPING[0]) { typing = TYPING[0]; typeDir = 1; }
        frame = ["type", Math.round(typing)];
      } else if (mode === "cover") {
        frame = ["seq", COVER];
      } else {
        const target = mouseX.current * (SCRUB_N - 1);
        scrub += (target - scrub) * Math.min(1, dt * 9);
        frame = ["scrub", Math.max(0, Math.min(SCRUB_N - 1, Math.round(scrub)))];
      }
      prev = mode;
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      ctx.clearRect(0, 0, w, h);
      drawContain(ctx, pick(imgs.current, frame[0], frame[1]), w, h);
      cv.dataset.frame = `${frame[0]}-${frame[1]}`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, imgs, modeRef, mouseX, lastKey]);
}

export default function Mascot({ mode = "idle", tick = 0, className = "", children, testId = "login-mascot" }) {
  const canvasRef = useRef(null);
  const modeRef = useRef(mode);
  const mouseX = useRef(0.5);
  const lastKey = useRef(0);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 18 });
  const sy = useSpring(my, { stiffness: 60, damping: 18 });
  const layerX = useTransform(sx, [-1, 1], [22, -22]);
  const layerY = useTransform(sy, [-1, 1], [14, -14]);
  const imgs = useFrames();
  modeRef.current = mode;
  usePlayer(canvasRef, imgs, modeRef, mouseX, lastKey);

  useEffect(() => {
    if (tick) lastKey.current = performance.now();
  }, [tick]);

  useEffect(() => {
    const onMove = (e) => {
      const x = Math.max(0, Math.min(1, e.clientX / window.innerWidth));
      mouseX.current = x;
      mx.set(x * 2 - 1);
      my.set(Math.max(-1, Math.min(1, (e.clientY / window.innerHeight) * 2 - 1)));
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [mx, my]);

  return (
    <div className={`relative ${className}`} data-testid={testId} data-mode={mode}>
      <div className="absolute inset-0 drop-shadow-[0_30px_40px_rgba(10,58,133,0.3)]">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full mh-mascot-fade" aria-label="Maskot Maiharta Finance" data-testid="mascot-canvas" />
      </div>
      <motion.div style={{ x: layerX, y: layerY }} className="absolute inset-0 z-20 pointer-events-none">
        {children}
      </motion.div>
    </div>
  );
}
