import { useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";

useGLTF.preload("/models/buddha.glb");
useGLTF.preload("/models/devotee.glb");
useGLTF.preload("/models/devotee-nu.glb");
useGLTF.preload("/models/monk.glb");

function prepareTexture(tex, repeatX, repeatY) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  return tex;
}

function prepareDataTexture(tex, repeatX, repeatY) {
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  return tex;
}

function Statue({ hitting }) {
  const { scene } = useGLTF("/models/buddha.glb");
  const clone = useMemo(() => scene.clone(true), [scene]);
  const ref = useRef(null);
  const glow = useRef(null);

  useLayoutEffect(() => {
    const obj = ref.current;
    if (!obj?.parent) return;
    obj.traverse((child) => {
      child.matrixAutoUpdate = true;
    });
    obj.scale.set(1, 1, 1);
    obj.position.set(0, 0, 0);
    obj.rotation.set(0, 0, 0);
    obj.updateMatrix();
    obj.updateMatrixWorld(true);
    const raw = new THREE.Box3().setFromObject(obj);
    const size = raw.getSize(new THREE.Vector3());
    if (size.y < 0.0001) return;
    obj.scale.setScalar(1.35 / size.y);
    obj.updateMatrixWorld(true);
    const fitted = new THREE.Box3().setFromObject(obj);
    const min = fitted.min.clone();
    const max = fitted.max.clone();
    obj.parent.worldToLocal(min);
    obj.parent.worldToLocal(max);
    const minY = Math.min(min.y, max.y);
    const centerX = (min.x + max.x) / 2;
    const centerZ = (min.z + max.z) / 2;
    obj.position.set(-centerX, -minY, -centerZ + 1.05);
  }, [clone]);

  useFrame((_, delta) => {
    if (!glow.current) return;
    const target = hitting ? 1.8 : 0.55;
    glow.current.intensity += (target - glow.current.intensity) * Math.min(1, delta * 5);
  });

  return (
    <group position={[0, 1.04, -2.35]}>
      <primitive ref={ref} object={clone} />
      <pointLight ref={glow} position={[0, 1.5, 1.4]} color="#ffd7a1" intensity={0.55} distance={6} />
    </group>
  );
}

const SEAT_X = [-1.55, 1.55];
const SEAT_Z = [1.4, 2.5];

function seatFor(index) {
  const col = index % SEAT_X.length;
  const row = Math.floor(index / SEAT_X.length);
  return {
    x: SEAT_X[col],
    z: SEAT_Z[row] ?? SEAT_Z[SEAT_Z.length - 1] + (row - SEAT_Z.length + 1) * 1.15,
  };
}

const lamCache = new Map();

function isTempleCloth(name) {
  const part = String(name || "").toLowerCase().split(".").pop();
  if (/hair|eyebrow|eyelash|teeth|eye|skin|scalp|afro/.test(part)) return false;
  if (part === "body" || part.startsWith("body")) return false;
  return /suit|shoe|jean|blouse|pant|jacket|legging|shirt|trainer|cloth/.test(part);
}

function toLamMap(texture, tint) {
  const image = texture.image;
  if (!image) return texture;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = imgData.data;
  for (let i = 0; i < px.length; i += 4) {
    const luma = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
    const shade = 0.9 + (luma - 0.5) * 0.06;
    px[i] = Math.min(255, tint[0] * shade);
    px[i + 1] = Math.min(255, tint[1] * shade);
    px[i + 2] = Math.min(255, tint[2] * shade);
  }
  ctx.putImageData(imgData, 0, 0);
  const next = new THREE.CanvasTexture(canvas);
  next.colorSpace = THREE.SRGBColorSpace;
  next.flipY = texture.flipY;
  next.wrapS = texture.wrapS;
  next.wrapT = texture.wrapT;
  next.anisotropy = 8;
  return next;
}

function lamMap(texture, kind) {
  const key = `${texture.uuid}:${kind}`;
  if (lamCache.has(key)) return lamCache.get(key);
  const tint = kind === "shoe" ? [48, 36, 28] : [156, 118, 78];
  const next = toLamMap(texture, tint);
  lamCache.set(key, next);
  return next;
}

function dressAsTempleClothes(obj) {
  obj.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    const next = mats.map((mat) => {
      if (!isTempleCloth(mat.name) || !mat.map) return mat;
      const dressed = mat.clone();
      const shoe = /shoe|trainer/i.test(mat.name);
      dressed.map = lamMap(mat.map, shoe ? "shoe" : "lam");
      dressed.normalMap = null;
      dressed.roughness = shoe ? 0.55 : 0.92;
      dressed.color.set("#ffffff");
      return dressed;
    });
    child.material = Array.isArray(child.material) ? next : next[0];
  });
}

function DevoteeFigure({ source, x, z, name }) {
  const clone = useMemo(() => source.clone(true), [source]);
  const ref = useRef(null);

  useLayoutEffect(() => {
    const obj = ref.current;
    if (!obj?.parent) return;
    dressAsTempleClothes(obj);
    obj.traverse((child) => {
      child.matrixAutoUpdate = true;
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    obj.scale.set(1, 1, 1);
    obj.position.set(0, 0, 0);
    obj.rotation.set(0, 0, 0);
    obj.updateMatrixWorld(true);
    const raw = new THREE.Box3().setFromObject(obj);
    const size = raw.getSize(new THREE.Vector3());
    if (size.y < 0.0001) return;
    obj.scale.setScalar(1.15 / size.y);
    obj.updateMatrixWorld(true);
    const fitted = new THREE.Box3().setFromObject(obj);
    const min = fitted.min.clone();
    const max = fitted.max.clone();
    obj.parent.worldToLocal(min);
    obj.parent.worldToLocal(max);
    obj.position.set(-(min.x + max.x) / 2, -Math.min(min.y, max.y), -(min.z + max.z) / 2);
  }, [clone]);

  return (
    <group position={[x, 0, z]} rotation={[0, Math.PI, 0]}>
      <primitive ref={ref} object={clone} />
      <NameTag name={name} side={x < 0 ? 1 : -1} front={z > 2} />
    </group>
  );
}

function NameTag({ name, side, front }) {
  const ref = useRef(null);
  const label = useMemo(() => makeNameTexture(name), [name]);
  useFrame(({ camera }) => {
    ref.current?.lookAt(camera.position);
  });
  const position = front ? [0, 0.58, -0.22] : [side * 0.7, 0.95, 0.05];
  return (
    <mesh ref={ref} position={position}>
      <planeGeometry args={[0.62, 0.16]} />
      <meshBasicMaterial map={label} transparent depthWrite={false} />
    </mesh>
  );
}

function Devotees({ people }) {
  const male = useGLTF("/models/devotee.glb");
  const female = useGLTF("/models/devotee-nu.glb");
  return people.map((person, index) => {
    const seat = seatFor(index);
    const woman = person.model ? person.model === "female" : index % 2 === 1;
    return (
      <DevoteeFigure
        key={person.id}
        source={woman ? female.scene : male.scene}
        x={seat.x}
        z={seat.z}
        name={person.username}
      />
    );
  });
}

function makeNameTexture(name) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = "rgba(28, 14, 8, 0.78)";
  ctx.fillRect(8, 10, 240, 44);
  ctx.fillStyle = "#fff4df";
  ctx.font = "600 28px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(name || "Phật tử").slice(0, 16), 128, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const PREVIEW_DEVOTEES = [
  { id: "preview-minh", username: "Minh An", model: "male" },
  { id: "preview-thao", username: "Thảo", model: "female" },
  { id: "preview-hung", username: "Hùng", model: "male" },
  { id: "preview-lan", username: "Lan", model: "female" },
];

function makeScrollTexture(text, vertical) {
  const canvas = document.createElement("canvas");
  canvas.width = vertical ? 420 : 900;
  canvas.height = vertical ? 980 : 200;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#7c1b28";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#e7c56a";
  ctx.lineWidth = vertical ? 16 : 12;
  ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
  ctx.fillStyle = "#f8e7b0";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (vertical) {
    const words = text.split(/\s+/).filter(Boolean);
    const pad = 70;
    const gap = 28;
    const fontSize = Math.min(92, Math.floor((canvas.height - pad * 2 - gap * (words.length - 1)) / words.length));
    ctx.font = `700 ${fontSize}px "Segoe UI", sans-serif`;
    words.forEach((word, i) => {
      const line = word.charAt(0).toUpperCase() + word.slice(1);
      ctx.fillText(line, canvas.width / 2, pad + fontSize / 2 + i * (fontSize + gap));
    });
  } else {
    ctx.font = "700 72px Segoe UI, sans-serif";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function Couplets() {
  const left = useMemo(() => makeScrollTexture("Phật pháp trường tồn", true), []);
  const right = useMemo(() => makeScrollTexture("Từ bi bất tận", true), []);
  const top = useMemo(() => makeScrollTexture("A DI ĐÀ PHẬT", false), []);
  const z = -3.2;

  return (
    <group>
      <mesh position={[0, 3.05, z]}>
        <planeGeometry args={[2.7, 0.58]} />
        <meshStandardMaterial map={top} roughness={0.55} />
      </mesh>
      <mesh position={[-2.05, 2.18, z]}>
        <planeGeometry args={[1.12, 2.4]} />
        <meshStandardMaterial map={left} roughness={0.55} />
      </mesh>
      <mesh position={[2.05, 2.18, z]}>
        <planeGeometry args={[1.12, 2.4]} />
        <meshStandardMaterial map={right} roughness={0.55} />
      </mesh>
    </group>
  );
}

function Fruit({ position, color, scale = [1, 1, 1], rotation = [0, 0, 0] }) {
  return (
    <mesh position={position} scale={scale} rotation={rotation} castShadow>
      <sphereGeometry args={[0.075, 16, 16]} />
      <meshStandardMaterial color={color} roughness={0.38} />
    </mesh>
  );
}

function FruitPlate({ position, mirror = 1 }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <cylinderGeometry args={[0.34, 0.38, 0.05, 24]} />
        <meshStandardMaterial color="#f7f1e4" roughness={0.55} />
      </mesh>
      <Fruit position={[-0.1 * mirror, 0.09, 0.04]} color="#c0392b" />
      <Fruit position={[0.08 * mirror, 0.09, -0.02]} color="#e67e22" />
      <Fruit position={[0.0, 0.1, 0.12]} color="#d4a017" scale={[1.35, 0.55, 0.7]} rotation={[0.4, 0.2, 0.8]} />
      <Fruit position={[0.14 * mirror, 0.08, 0.1]} color="#7d9b4a" scale={[0.85, 1.05, 0.85]} />
      <Fruit position={[-0.02, 0.14, -0.06]} color="#8e2f8a" scale={[0.55, 0.55, 0.55]} />
      <Fruit position={[0.06 * mirror, 0.15, -0.02]} color="#6d3478" scale={[0.5, 0.5, 0.5]} />
    </group>
  );
}

function Monk() {
  const { scene } = useGLTF("/models/monk.glb");
  const clone = useMemo(() => scene.clone(true), [scene]);
  const ref = useRef(null);

  useLayoutEffect(() => {
    const obj = ref.current;
    if (!obj?.parent) return;
    obj.traverse((child) => {
      child.matrixAutoUpdate = true;
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    obj.scale.set(1, 1, 1);
    obj.position.set(0, 0, 0);
    obj.rotation.set(0, 0, 0);
    obj.updateMatrixWorld(true);
    const raw = new THREE.Box3().setFromObject(obj);
    const size = raw.getSize(new THREE.Vector3());
    if (size.y < 0.0001) return;
    obj.scale.setScalar(1.32 / size.y);
    obj.updateMatrixWorld(true);
    const fitted = new THREE.Box3().setFromObject(obj);
    const min = fitted.min.clone();
    const max = fitted.max.clone();
    obj.parent.worldToLocal(min);
    obj.parent.worldToLocal(max);
    obj.position.set(-(min.x + max.x) / 2, -Math.min(min.y, max.y) - 0.34, -(min.z + max.z) / 2);
  }, [clone]);

  return (
    <group position={[-1.15, 0, 0.02]} rotation={[0, 0.15, 0]}>
      <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.42, 0.46, 0.14, 28]} />
        <meshStandardMaterial color="#7a1e24" roughness={0.84} />
      </mesh>
      <primitive ref={ref} object={clone} />
    </group>
  );
}

function OfferingTable() {
  return (
    <group position={[0, 0, -0.45]}>
      <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.15, 0.56, 0.62]} />
        <meshStandardMaterial color="#6b2a1e" roughness={0.62} />
      </mesh>
      <mesh position={[0, 0.58, 0]}>
        <boxGeometry args={[1.28, 0.06, 0.74]} />
        <meshStandardMaterial color="#e7c56a" roughness={0.35} metalness={0.35} />
      </mesh>
      <mesh position={[0, 0.68, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.2, 0.12, 20]} />
        <meshStandardMaterial color="#8d6a32" metalness={0.65} roughness={0.35} />
      </mesh>
      {[-0.05, 0, 0.05].map((x) => (
        <mesh key={x} position={[x, 0.84, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.28, 6]} />
          <meshStandardMaterial color="#d9c7a2" />
        </mesh>
      ))}
      <IncenseSmoke />
    </group>
  );
}

function IncenseSmoke() {
  const a = useRef(null);
  const b = useRef(null);
  useFrame(({ clock }) => {
    [a.current, b.current].forEach((mesh, i) => {
      if (!mesh) return;
      const t = (clock.elapsedTime * 0.28 + i * 0.5) % 1;
      mesh.position.y = t * 0.7;
      mesh.material.opacity = Math.sin(t * Math.PI) * 0.12;
    });
  });
  return (
    <group position={[0, 0.98, 0]}>
      <mesh ref={a}>
        <sphereGeometry args={[0.05, 10, 10]} />
        <meshBasicMaterial color="#f4efe6" transparent opacity={0.2} depthWrite={false} />
      </mesh>
      <mesh ref={b} position={[0.08, 0, 0]}>
        <sphereGeometry args={[0.04, 10, 10]} />
        <meshBasicMaterial color="#f4efe6" transparent opacity={0.2} depthWrite={false} />
      </mesh>
    </group>
  );
}

function AncientWalls({ wallColor, wallRough, woodColor, woodRough }) {
  const roomW = 8.4;
  const roomD = 11.2;
  const height = 4.35;
  const y = height / 2;
  const z = 2.15;
  const plaster = {
    map: wallColor,
    roughnessMap: wallRough,
    color: "#8d7360",
    roughness: 0.96,
  };
  const panel = {
    map: woodColor,
    roughnessMap: woodRough,
    color: "#8a5e3c",
    roughness: 0.82,
  };

  return (
    <group>
      <pointLight position={[-2.4, 1.8, -2.3]} color="#f0d7b4" intensity={0.55} distance={6} />
      <pointLight position={[2.4, 1.8, -2.3]} color="#f0d7b4" intensity={0.55} distance={6} />
      <mesh position={[0, y, z - roomD / 2]} receiveShadow>
        <boxGeometry args={[roomW, height, 0.22]} />
        <meshStandardMaterial {...plaster} />
      </mesh>
      <mesh position={[0, y, z + roomD / 2]}>
        <boxGeometry args={[roomW, height, 0.22]} />
        <meshStandardMaterial {...plaster} />
      </mesh>
      <mesh position={[-roomW / 2, y, z]} receiveShadow>
        <boxGeometry args={[0.22, height, roomD]} />
        <meshStandardMaterial {...plaster} />
      </mesh>
      <mesh position={[roomW / 2, y, z]} receiveShadow>
        <boxGeometry args={[0.22, height, roomD]} />
        <meshStandardMaterial {...plaster} />
      </mesh>

      <mesh position={[0, 0.22, z - roomD / 2 + 0.14]}>
        <boxGeometry args={[roomW - 0.16, 0.44, 0.1]} />
        <meshStandardMaterial {...panel} />
      </mesh>
      <mesh position={[0, 0.22, z + roomD / 2 - 0.14]}>
        <boxGeometry args={[roomW - 0.16, 0.44, 0.1]} />
        <meshStandardMaterial {...panel} />
      </mesh>
      <mesh position={[-roomW / 2 + 0.14, 0.22, z]}>
        <boxGeometry args={[0.1, 0.44, roomD - 0.16]} />
        <meshStandardMaterial {...panel} />
      </mesh>
      <mesh position={[roomW / 2 - 0.14, 0.22, z]}>
        <boxGeometry args={[0.1, 0.44, roomD - 0.16]} />
        <meshStandardMaterial {...panel} />
      </mesh>
    </group>
  );
}

function Hall({ devotees }) {
  const [woodColor, woodRough, woodNormal, wallColor, wallRough] = useTexture([
    "/textures/wood_color.jpg",
    "/textures/wood_roughness.jpg",
    "/textures/wood_normal.jpg",
    "/textures/wall_color.jpg",
    "/textures/wall_roughness.jpg",
  ]);

  prepareTexture(woodColor, 4, 3);
  prepareDataTexture(woodRough, 4, 3);
  prepareDataTexture(woodNormal, 4, 3);
  prepareTexture(wallColor, 2, 2);
  prepareDataTexture(wallRough, 2, 2);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 1.4]} receiveShadow>
        <planeGeometry args={[14, 16]} />
        <meshStandardMaterial
          map={woodColor}
          roughnessMap={woodRough}
          normalMap={woodNormal}
          roughness={0.85}
        />
      </mesh>

      <AncientWalls
        wallColor={wallColor}
        wallRough={wallRough}
        woodColor={woodColor}
        woodRough={woodRough}
      />

      <mesh position={[0, 4.55, 0.2]}>
        <boxGeometry args={[12.4, 0.28, 11.2]} />
        <meshStandardMaterial color="#6e1824" roughness={0.6} metalness={0.05} />
      </mesh>
      <mesh position={[0, 4.15, 2.8]}>
        <boxGeometry args={[12.6, 0.16, 0.7]} />
        <meshStandardMaterial color="#f0d48a" roughness={0.35} metalness={0.4} />
      </mesh>

      {[
        [-3.1, -1.4],
        [3.1, -1.4],
        [-3.6, 1.8],
        [3.6, 1.8],
      ].map(([x, z]) => (
        <group key={`${x}-${z}`} position={[x, 0, z]}>
          <mesh position={[0, 2.05, 0]} castShadow>
            <cylinderGeometry args={[0.22, 0.26, 4.1, 20]} />
            <meshStandardMaterial color="#9d2433" roughness={0.45} metalness={0.08} />
          </mesh>
          <mesh position={[0, 4.15, 0]}>
            <cylinderGeometry args={[0.32, 0.32, 0.12, 20]} />
            <meshStandardMaterial color="#e7c56a" roughness={0.3} metalness={0.55} />
          </mesh>
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.34, 0.36, 0.16, 20]} />
            <meshStandardMaterial color="#e7c56a" roughness={0.3} metalness={0.55} />
          </mesh>
          <mesh position={[0, 3.35, 0]}>
            <sphereGeometry args={[0.16, 16, 16]} />
            <meshStandardMaterial color="#ffbf3c" emissive="#ff9f1a" emissiveIntensity={1.4} />
          </mesh>
          <pointLight position={[0, 3.2, 0.2]} color="#ffb347" intensity={0.55} distance={4.5} />
        </group>
      ))}

      <mesh position={[0, 0.48, -2.35]} castShadow receiveShadow>
        <boxGeometry args={[3.4, 0.96, 1.5]} />
        <meshStandardMaterial color="#7c1b28" roughness={0.5} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0.99, -2.35]}>
        <boxGeometry args={[3.7, 0.1, 1.75]} />
        <meshStandardMaterial color="#e7c56a" roughness={0.32} metalness={0.45} />
      </mesh>
      <FruitPlate position={[-1.15, 1.1, -2.2]} />
      <FruitPlate position={[1.15, 1.1, -2.15]} mirror={-1} />
      <Couplets />
      <OfferingTable />

      <mesh position={[0, 0.012, 1.55]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[0.9, 3.6]} />
        <meshStandardMaterial color="#5c1218" roughness={0.88} />
      </mesh>
      {SEAT_X.map((x) =>
        SEAT_Z.map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[1.4, 1.45]} />
            <meshStandardMaterial color="#7a1d28" roughness={0.8} />
          </mesh>
        )),
      )}

      <Devotees people={[...PREVIEW_DEVOTEES, ...devotees]} />

      <ContactShadows position={[0, 0.02, 1]} opacity={0.4} scale={18} blur={2.4} far={6} color="#140c08" />
    </group>
  );
}

function OverviewCamera() {
  const camera = useThree((state) => state.camera);
  useLayoutEffect(() => {
    camera.position.set(0, 2.05, 6.9);
    camera.fov = 42;
    camera.lookAt(0, 0.95, -1.05);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

export default function TempleScene({ devotees, hitting }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [0, 2.05, 6.9], fov: 42 }}
      gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping }}
    >
      <OverviewCamera />
      <color attach="background" args={["#1a100c"]} />
      <fog attach="fog" args={["#1a100c", 14, 26]} />
      <ambientLight intensity={0.38} color="#ffe0bf" />
      <directionalLight position={[2, 6, 4]} intensity={1.15} color="#fff1d6" castShadow />
      <Hall devotees={devotees} />
      <Statue hitting={hitting} />
      <Monk />
    </Canvas>
  );
}
