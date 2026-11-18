import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

// Mouse-tracking tilt + parallax: children with data-depth move at different rates.
export default function MascotTilt({ src, className = "", children, intensity = 14, testId = "mascot-tilt" }) {
  const ref = useRef(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 140, damping: 18 });
  const sy = useSpring(my, { stiffness: 140, damping: 18 });
  const rotY = useTransform(sx, [-0.5, 0.5], [-intensity, intensity]);
  const rotX = useTransform(sy, [-0.5, 0.5], [intensity * 0.7, -intensity * 0.7]);
  const imgX = useTransform(sx, [-0.5, 0.5], [-18, 18]);
  const imgY = useTransform(sy, [-0.5, 0.5], [-10, 10]);
  const layerX = useTransform(sx, [-0.5, 0.5], [34, -34]);
  const layerY = useTransform(sy, [-0.5, 0.5], [22, -22]);

  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const reset = () => { mx.set(0); my.set(0); };

  return (
    <div ref={ref} onPointerMove={onMove} onPointerLeave={reset} className={`relative ${className}`} style={{ perspective: 1100 }} data-testid={testId}>
      <motion.div style={{ rotateX: rotX, rotateY: rotY, transformStyle: "preserve-3d" }} className="relative w-full h-full">
        <motion.img src={src} alt="Maskot Maiharta" draggable={false} style={{ x: imgX, y: imgY, translateZ: 60 }}
          className="relative z-10 h-full w-full object-contain object-bottom select-none drop-shadow-[0_30px_40px_rgba(10,58,133,0.35)]" />
        <motion.div style={{ x: layerX, y: layerY, translateZ: 110 }} className="absolute inset-0 z-20 pointer-events-none">
          {children}
        </motion.div>
      </motion.div>
    </div>
  );
}
