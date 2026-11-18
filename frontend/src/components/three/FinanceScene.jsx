import { useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, RoundedBox } from "@react-three/drei";
import * as THREE from "three";

function Coin({ position, scale = 1, speed = 1 }) {
  const ref = useRef();
  useFrame((_, dt) => { ref.current.rotation.y += dt * 0.9 * speed; });
  return (
    <Float speed={1.6 * speed} rotationIntensity={0.6} floatIntensity={1.4}>
      <group ref={ref} position={position} scale={scale} rotation={[Math.PI / 2.4, 0, 0]}>
        <mesh>
          <cylinderGeometry args={[0.55, 0.55, 0.14, 48]} />
          <meshStandardMaterial color="#f5b83d" metalness={0.45} roughness={0.3} emissive="#a86b00" emissiveIntensity={0.35} />
        </mesh>
        <mesh position={[0, 0.075, 0]}>
          <cylinderGeometry args={[0.4, 0.4, 0.02, 48]} />
          <meshStandardMaterial color="#ffd36b" metalness={0.4} roughness={0.25} emissive="#b37a00" emissiveIntensity={0.3} />
        </mesh>
      </group>
    </Float>
  );
}

function Calculator({ position }) {
  const keys = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) keys.push([-0.32 + c * 0.32, -0.35 + r * 0.26]);
  return (
    <Float speed={1.2} rotationIntensity={0.5} floatIntensity={1}>
      <group position={position} rotation={[0.35, -0.5, 0.15]}>
        <RoundedBox args={[1.1, 1.6, 0.22]} radius={0.12} smoothness={6}>
          <meshStandardMaterial color="#0f52ba" metalness={0.25} roughness={0.35} />
        </RoundedBox>
        <RoundedBox args={[0.86, 0.36, 0.05]} radius={0.04} position={[0, 0.5, 0.12]}>
          <meshStandardMaterial color="#cddcf3" roughness={0.4} />
        </RoundedBox>
        {keys.map(([x, y], i) => (
          <RoundedBox key={i} args={[0.22, 0.18, 0.06]} radius={0.04} position={[x, y, 0.13]}>
            <meshStandardMaterial color={i % 3 === 2 ? "#12151c" : "#ffffff"} roughness={0.35} />
          </RoundedBox>
        ))}
      </group>
    </Float>
  );
}

function Bars({ position }) {
  const hs = [0.5, 0.85, 0.65, 1.2];
  return (
    <Float speed={1.4} rotationIntensity={0.4} floatIntensity={0.8}>
      <group position={position} rotation={[0.25, 0.6, 0]}>
        {hs.map((h, i) => (
          <RoundedBox key={i} args={[0.24, h, 0.24]} radius={0.06} position={[i * 0.32 - 0.48, h / 2 - 0.5, 0]}>
            <meshStandardMaterial color={i === 3 ? "#12151c" : i % 2 ? "#3574c4" : "#9ec9ff"} roughness={0.3} metalness={0.1} />
          </RoundedBox>
        ))}
      </group>
    </Float>
  );
}

function Rig({ pointer, children }) {
  const g = useRef();
  useFrame(() => {
    g.current.rotation.y = THREE.MathUtils.lerp(g.current.rotation.y, pointer.current.x * 0.45, 0.06);
    g.current.rotation.x = THREE.MathUtils.lerp(g.current.rotation.x, -pointer.current.y * 0.3, 0.06);
    g.current.position.x = THREE.MathUtils.lerp(g.current.position.x, pointer.current.x * 0.35, 0.05);
  });
  return <group ref={g}>{children}</group>;
}

export default function FinanceScene() {
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const move = (e) => {
      pointer.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 };
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);

  return (
    <Canvas camera={{ position: [0, 0, 7], fov: 42 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }} data-testid="login-3d-canvas">
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 6, 5]} intensity={1.6} />
      <directionalLight position={[0, 0, 8]} intensity={0.9} />
      <pointLight position={[-4, -2, 3]} intensity={18} color="#9ec9ff" />
      <Rig pointer={pointer}>
        <Coin position={[-2.6, 1.9, 0]} scale={0.9} />
        <Coin position={[2.7, -1.6, 0.6]} scale={0.7} speed={1.3} />
        <Coin position={[2.3, 2.4, -1]} scale={0.5} speed={0.8} />
        <Calculator position={[-2.5, -1.7, 0.4]} />
        <Bars position={[2.6, 0.5, -0.4]} />
        <Float speed={2} floatIntensity={2}>
          <mesh position={[-0.4, 2.8, -1.5]}>
            <torusGeometry args={[0.35, 0.12, 24, 64]} />
            <meshStandardMaterial color="#3574c4" roughness={0.3} />
          </mesh>
        </Float>
        <Float speed={1.8} floatIntensity={1.6}>
          <mesh position={[3.2, -0.2, -1.2]}>
            <icosahedronGeometry args={[0.32, 0]} />
            <meshStandardMaterial color="#12151c" roughness={0.4} flatShading />
          </mesh>
        </Float>
      </Rig>
    </Canvas>
  );
}
