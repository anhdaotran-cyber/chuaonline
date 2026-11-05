import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { currentYaw } from "./cameraControl.js";

useGLTF.preload("/models/buddha.glb");
useGLTF.preload("/models/devotee-sit.glb?v=2");
useGLTF.preload("/models/devotee-sit-nu.glb?v=2");
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

function makeHaloTexture(rays) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const cx = 256;
  const cy = 256;
  if (rays) {
    for (let i = 0; i < 28; i += 1) {
      const angle = (i / 28) * Math.PI * 2;
      const inner = i % 2 === 0 ? 86 : 110;
      const outer = i % 2 === 0 ? 248 : 190;
      const grad = ctx.createLinearGradient(
        cx + Math.cos(angle) * inner,
        cy + Math.sin(angle) * inner,
        cx + Math.cos(angle) * outer,
        cy + Math.sin(angle) * outer,
      );
      grad.addColorStop(0, "rgba(255, 236, 190, 0.95)");
      grad.addColorStop(1, "rgba(255, 186, 70, 0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = i % 2 === 0 ? 14 : 5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();
    }
  }
  const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, rays ? 120 : 200);
  glow.addColorStop(0, "rgba(255, 248, 220, 0.95)");
  glow.addColorStop(0.35, "rgba(255, 206, 110, 0.55)");
  glow.addColorStop(1, "rgba(255, 170, 50, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, rays ? 120 : 210, 0, Math.PI * 2);
  ctx.fill();
  if (!rays) {
    ctx.strokeStyle = "rgba(255, 220, 140, 0.85)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, 92, 0, Math.PI * 2);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function BuddhaHalo({ hitting }) {
  const rays = useRef(null);
  const glow = useRef(null);
  const rayMap = useMemo(() => makeHaloTexture(true), []);
  const glowMap = useMemo(() => makeHaloTexture(false), []);

  useFrame(({ clock }) => {
    const pulse = 0.94 + Math.sin(clock.elapsedTime * 1.4) * 0.06;
    const boost = hitting ? 1.28 : 1;
    if (rays.current) {
      rays.current.rotation.z = clock.elapsedTime * 0.12;
      rays.current.scale.setScalar(pulse * boost);
      rays.current.material.opacity = (hitting ? 0.95 : 0.72) * pulse;
    }
    if (glow.current) {
      glow.current.scale.setScalar((0.98 + Math.sin(clock.elapsedTime * 1.4 + 0.6) * 0.04) * boost);
      glow.current.material.opacity = hitting ? 0.9 : 0.7;
    }
  });

  return (
    <group position={[0, 1.18, -0.48]}>
      <mesh ref={rays}>
        <planeGeometry args={[1.7, 1.7]} />
        <meshBasicMaterial
          map={rayMap}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={glow}>
        <planeGeometry args={[0.95, 0.95]} />
        <meshBasicMaterial
          map={glowMap}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <pointLight position={[0, 0.02, -0.2]} color="#ffd7a1" intensity={1.35} distance={2.8} />
    </group>
  );
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
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      const next = mats.map((mat) => {
        const gold = mat.clone();
        gold.map = null;
        gold.normalMap = null;
        gold.roughnessMap = null;
        gold.metalnessMap = null;
        gold.aoMap = null;
        gold.color.set("#e2b340");
        gold.metalness = 0.78;
        gold.roughness = 0.28;
        gold.emissive?.set("#6a4a10");
        gold.emissiveIntensity = 0.18;
        gold.needsUpdate = true;
        return gold;
      });
      child.material = Array.isArray(child.material) ? next : next[0];
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
    obj.position.set(-centerX, -minY, -centerZ - 0.05);
  }, [clone]);

  useFrame((_, delta) => {
    if (!glow.current) return;
    const target = hitting ? 1.8 : 0.55;
    glow.current.intensity += (target - glow.current.intensity) * Math.min(1, delta * 5);
  });

  return (
    <group position={[0, 1.04, -2.95]}>
      <BuddhaHalo hitting={hitting} />
      <primitive ref={ref} object={clone} />
      <pointLight ref={glow} position={[0, 1.5, 1.4]} color="#ffd7a1" intensity={0.55} distance={6} />
    </group>
  );
}

const HALL_W = 13.6;
const HALL_D = 12.8;
const HALL_H = 4.55;
const HALL_Z = 2.25;
const BACK_Z = HALL_Z - HALL_D / 2 + 0.28;

const SEAT_COUNT = 20;
const SEAT_X = [-2.55, -1.55, 1.55, 2.55];
const SEAT_Z = [0.4, 1.15, 1.9, 2.65, 3.4];
const ALTAR_Z = -2.95;

function seatFor(index) {
  const col = index % SEAT_X.length;
  const row = Math.floor(index / SEAT_X.length);
  return {
    x: SEAT_X[col] ?? SEAT_X[SEAT_X.length - 1],
    z: SEAT_Z[row] ?? SEAT_Z[SEAT_Z.length - 1] + (row - SEAT_Z.length + 1) * 0.85,
  };
}

function faceAltar(x, z) {
  return Math.atan2(-x, ALTAR_Z - z);
}

const AO_DAI_GRAY = "#c8cac6";

function partName(mat) {
  return String(mat?.name || "").toLowerCase().split(".").pop();
}

function dressAsAoDai(obj) {
  obj.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    const next = mats.map((mat) => {
      const part = partName(mat);
      const tunic = /suit|jean|blouse|pant|jacket|legging|shirt|cloth/.test(part);
      const shoe = /shoe|trainer/.test(part);
      if (!tunic && !shoe) return mat;
      const dressed = mat.clone();
      dressed.map = null;
      dressed.normalMap = null;
      dressed.bumpMap = null;
      dressed.roughnessMap = null;
      dressed.metalnessMap = null;
      dressed.aoMap = null;
      dressed.color.set(shoe ? "#241c18" : AO_DAI_GRAY);
      dressed.roughness = shoe ? 0.78 : 0.84;
      dressed.metalness = 0;
      dressed.emissive?.set("#000000");
      dressed.needsUpdate = true;
      return dressed;
    });
    child.material = Array.isArray(child.material) ? next : next[0];
  });
}

function DevoteeFigure({ source, x, z, name, avatar, comment }) {
  const clone = useMemo(() => source.clone(true), [source]);
  const ref = useRef(null);

  useLayoutEffect(() => {
    const obj = ref.current;
    if (!obj?.parent) return;
    dressAsAoDai(obj);
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
    obj.scale.setScalar(0.9 / size.y);
    obj.updateMatrixWorld(true);
    const fitted = new THREE.Box3().setFromObject(obj);
    const min = fitted.min.clone();
    const max = fitted.max.clone();
    obj.parent.worldToLocal(min);
    obj.parent.worldToLocal(max);
    obj.position.set(-(min.x + max.x) / 2, -Math.min(min.y, max.y), -(min.z + max.z) / 2);
    if (avatar) clipHead(obj);
  }, [clone, avatar]);

  return (
    <group position={[x, 0, z]} rotation={[0, faceAltar(x, z), 0]}>
      <primitive ref={ref} object={clone} />
      {avatar ? <ProfileHead url={avatar} /> : null}
      <NameTag name={name} comment={comment} />
    </group>
  );
}

const HEAD_CLIP = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.6);

function clipHead(obj) {
  obj.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    const next = mats.map((mat) => {
      if (!/skin|hair/.test(partName(mat))) return mat;
      const clipped = mat.clone();
      clipped.clippingPlanes = [HEAD_CLIP];
      clipped.clipShadows = true;
      clipped.needsUpdate = true;
      return clipped;
    });
    child.material = Array.isArray(child.material) ? next : next[0];
  });
}

function profileSrc(url) {
  if (!url || url.startsWith("data:") || url.startsWith("/")) return url;
  return `/avatar?url=${encodeURIComponent(url)}`;
}

function useAvatarTexture(url) {
  const [texture, setTexture] = useState(null);
  useEffect(() => {
    const src = profileSrc(url);
    if (!src) return undefined;
    let dropped = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (dropped) return;
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#e7c56a";
      ctx.fillRect(0, 0, 256, 256);
      ctx.beginPath();
      ctx.arc(128, 128, 124, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      const size = Math.min(image.width, image.height);
      ctx.drawImage(
        image,
        (image.width - size) / 2,
        (image.height - size) / 2,
        size,
        size,
        0,
        0,
        256,
        256,
      );
      const next = new THREE.Texture(canvas);
      next.colorSpace = THREE.SRGBColorSpace;
      next.generateMipmaps = false;
      next.minFilter = THREE.LinearFilter;
      next.magFilter = THREE.LinearFilter;
      next.needsUpdate = true;
      setTexture(next);
    };
    image.src = src;
    return () => {
      dropped = true;
    };
  }, [url]);
  return texture;
}

function EnableClipping() {
  const gl = useThree((state) => state.gl);
  useLayoutEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);
  return null;
}

function ProfileHead({ url }) {
  const ref = useRef(null);
  const texture = useAvatarTexture(url);
  useFrame(({ camera }) => {
    ref.current?.lookAt(camera.position);
  });
  return (
    <mesh ref={ref} position={[0, 0.72, 0]} renderOrder={2}>
      <circleGeometry args={[0.16, 40]} />
      <meshBasicMaterial
        map={texture || null}
        color={texture ? "#ffffff" : "#ff2040"}
        toneMapped={false}
        side={THREE.DoubleSide}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

function NameTag({ name, comment = "" }) {
  const ref = useRef(null);
  const label = useMemo(() => makeNameTexture(name, comment), [name, comment]);
  useFrame(({ camera }) => {
    ref.current?.lookAt(camera.position);
  });
  const tall = Boolean(comment);
  return (
    <mesh ref={ref} position={[0, tall ? 1.12 : 0.98, 0.02]} renderOrder={3}>
      <planeGeometry args={tall ? [0.96, 0.3] : [0.4, 0.1]} />
      <meshBasicMaterial map={label} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function Devotees({ people }) {
  const male = useGLTF("/models/devotee-sit.glb?v=2");
  const female = useGLTF("/models/devotee-sit-nu.glb?v=2");
  return people.map((person, index) => {
    const seat = seatFor(person.seat ?? index);
    const woman = person.model ? person.model === "female" : (person.seat ?? index) % 2 === 1;
    return (
      <DevoteeFigure
        key={person.id}
        source={woman ? female.scene : male.scene}
        x={seat.x}
        z={seat.z}
        name={person.username}
        comment={person.comment || ""}
        avatar={person.avatar}
      />
    );
  });
}

function commentLines(comment) {
  const value = String(comment || "").replace(/\s+/g, " ").trim();
  if (!value) return [];
  const max = 24;
  if (value.length <= max) return [value];
  const cut = value.lastIndexOf(" ", max);
  const split = cut > 8 ? cut : max;
  const rest = value.slice(split).trim();
  return [value.slice(0, split).trim(), rest.length > max ? `${rest.slice(0, max - 1)}…` : rest];
}

function makeNameTexture(name, comment = "") {
  const lines = commentLines(comment);
  const canvas = document.createElement("canvas");
  canvas.width = lines.length ? 512 : 256;
  canvas.height = lines.length ? 160 : 64;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(28, 14, 8, 0.82)";
  ctx.fillRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (!lines.length) {
    ctx.fillStyle = "#fff4df";
    ctx.font = "600 28px Segoe UI, sans-serif";
    ctx.fillText(String(name || "Phật tử").slice(0, 16), 128, 32);
  } else {
    ctx.fillStyle = "#fff8ea";
    ctx.font = "600 34px Segoe UI, sans-serif";
    const top = lines.length === 1 ? 58 : 46;
    lines.forEach((line, index) => ctx.fillText(line, 256, top + index * 40));
    ctx.fillStyle = "#e7c56a";
    ctx.font = "600 24px Segoe UI, sans-serif";
    ctx.fillText(String(name || "Phật tử").slice(0, 22), 256, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const SCROLL_FONT = '"Times New Roman", Palatino, serif';

function fitScrollFont(ctx, lines, maxWidth, startSize) {
  let size = startSize;
  while (size > 30) {
    ctx.font = `700 ${size}px ${SCROLL_FONT}`;
    const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
    if (widest <= maxWidth) return size;
    size -= 2;
  }
  return size;
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
    <group position={[-1.58, 0, -0.22]} rotation={[0, 0.55, 0]}>
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
        <meshStandardMaterial color="#4a1218" roughness={0.46} metalness={0.08} />
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
    </group>
  );
}

function AncientWalls({ wallColor, wallRough, woodColor, woodRough }) {
  const roomW = HALL_W;
  const roomD = HALL_D;
  const height = HALL_H;
  const y = height / 2;
  const z = HALL_Z;
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
      <pointLight position={[-4.6, 1.9, -2.8]} color="#f0d7b4" intensity={0.7} distance={9} />
      <pointLight position={[4.6, 1.9, -2.8]} color="#f0d7b4" intensity={0.7} distance={9} />
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

function makeShrineTexture(title, lines) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 1280;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#7a1a28";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#f0d48a";
  ctx.lineWidth = 24;
  ctx.strokeRect(26, 26, canvas.width - 52, canvas.height - 52);
  ctx.lineWidth = 6;
  ctx.strokeRect(52, 52, canvas.width - 104, canvas.height - 104);
  ctx.fillStyle = "#f8e7b0";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const words = [...title.split(/\s+/).filter(Boolean), ...lines.filter(Boolean)];
  const fontSize = fitScrollFont(ctx, words, canvas.width - 120, words.length > 2 ? 108 : 112);
  ctx.font = `700 ${fontSize}px ${SCROLL_FONT}`;
  const gap = 36;
  const block = words.length * fontSize + (words.length - 1) * gap;
  const start = (860 - block) / 2 + fontSize / 2;
  words.forEach((word, i) => {
    ctx.fillText(word, canvas.width / 2, start + i * (fontSize + gap));
  });
  const cx = canvas.width / 2;
  const cy = 1080;
  ctx.fillStyle = "#f4c2d0";
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(angle) * 58, cy + Math.sin(angle) * 30, 38, 18, angle, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#f3d36b";
  ctx.beginPath();
  ctx.arc(cx, cy, 24, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function SwayLantern({ position, phase = 0 }) {
  const ref = useRef(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.z = Math.sin(clock.elapsedTime * 0.7 + phase) * 0.12;
  });
  return (
    <group ref={ref} position={position}>
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.2, 6]} />
        <meshStandardMaterial color="#e7c56a" metalness={0.4} roughness={0.35} />
      </mesh>
      <mesh position={[0, -0.32, 0]}>
        <sphereGeometry args={[0.11, 16, 12]} />
        <meshStandardMaterial color="#ffbf5a" emissive="#ff8c1a" emissiveIntensity={0.9} roughness={0.32} />
      </mesh>
      <mesh position={[0, -0.46, 0]}>
        <cylinderGeometry args={[0.035, 0.08, 0.07, 10]} />
        <meshStandardMaterial color="#9d2433" roughness={0.5} />
      </mesh>
    </group>
  );
}

function LotusUrn({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.14, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.12, 0.2, 14]} />
        <meshStandardMaterial color="#e7c56a" metalness={0.48} roughness={0.32} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const angle = (i / 5) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(angle) * 0.09, 0.3, Math.sin(angle) * 0.09]}>
            <sphereGeometry args={[0.05, 10, 8]} />
            <meshStandardMaterial color={i % 2 ? "#f6c9d6" : "#fff6ea"} roughness={0.45} />
          </mesh>
        );
      })}
    </group>
  );
}

function BackWing({ side, texture }) {
  const sign = side === "left" ? -1 : 1;
  return (
    <group position={[sign * 5.55, 0, BACK_Z + 0.16]}>
      <mesh position={[0, 1.62, 0]} castShadow>
        <boxGeometry args={[1.28, 3.1, 0.08]} />
        <meshStandardMaterial color="#4c121c" roughness={0.72} />
      </mesh>
      <mesh position={[0, 3.22, 0]}>
        <boxGeometry args={[1.46, 0.09, 0.12]} />
        <meshStandardMaterial color="#e7c56a" metalness={0.55} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.1, 0.04]}>
        <boxGeometry args={[1.42, 0.14, 0.18]} />
        <meshStandardMaterial color="#e7c56a" metalness={0.42} roughness={0.34} />
      </mesh>
      <mesh position={[0, 1.7, 0.05]}>
        <planeGeometry args={[1.12, 2.24]} />
        <meshStandardMaterial map={texture} roughness={0.48} />
      </mesh>
      <SwayLantern position={[sign * -0.42, 3.34, 0.08]} phase={side === "left" ? 0.4 : 2} />
      <LotusUrn position={[0, 0, 0.2]} />
    </group>
  );
}

function OrnamentWalls() {
  const lamp = useMemo(() => makeShrineTexture("Buông Xả Được Yên", []), []);
  const peace = useMemo(() => makeShrineTexture("Một Niệm Được An", []), []);
  return (
    <group>
      <BackWing side="left" texture={lamp} />
      <BackWing side="right" texture={peace} />
    </group>
  );
}

function SonThuyWall() {
  const map = useTexture("/textures/tuong-rong-phuong.jpg");
  map.colorSpace = THREE.SRGBColorSpace;
  const width = 4.22 * (1024 / 572);
  return (
    <mesh position={[0, 2.22, HALL_Z - HALL_D / 2 + 0.16]}>
      <planeGeometry args={[width, 4.22]} />
      <meshBasicMaterial map={map} />
    </mesh>
  );
}

function LeftWallPainting() {
  const map = useTexture("/textures/tuong-trai.jpg");
  map.colorSpace = THREE.SRGBColorSpace;
  const height = 3.85;
  const width = height * (1024 / 572);
  return (
    <mesh position={[-HALL_W / 2 + 0.2, 2.18, -0.55]} rotation={[0, Math.PI / 2, 0]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={map} />
    </mesh>
  );
}

function RightWallPainting() {
  const map = useTexture("/textures/tuong-phai.jpg");
  map.colorSpace = THREE.SRGBColorSpace;
  const height = 3.85;
  const width = height * (1024 / 572);
  return (
    <mesh position={[HALL_W / 2 - 0.2, 2.18, -0.55]} rotation={[0, -Math.PI / 2, 0]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={map} />
    </mesh>
  );
}

function RisingSmoke({ count = 3 }) {
  const refs = useRef([]);
  useFrame(({ clock }) => {
    refs.current.forEach((mesh, index) => {
      if (!mesh) return;
      const t = (clock.elapsedTime * 0.45 + index * 0.33) % 1;
      mesh.position.y = 0.34 + t * 0.16;
      mesh.position.x = Math.sin(clock.elapsedTime * 1.1 + index) * 0.012;
      mesh.material.opacity = Math.sin(t * Math.PI) * 0.55;
    });
  });
  return (
    <group>
      {Array.from({ length: count }, (_, index) => (
        <mesh
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
        >
          <sphereGeometry args={[0.018 + index * 0.006, 8, 6]} />
          <meshBasicMaterial color="#f7f1e6" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function IncenseSticks({ smoked = true }) {
  return (
    <group>
      {[-0.035, 0, 0.035].map((x) => (
        <group key={x} position={[x, 0.16, 0]}>
          <mesh>
            <cylinderGeometry args={[0.008, 0.008, 0.32, 6]} />
            <meshStandardMaterial color="#d9c7a2" />
          </mesh>
          <mesh position={[0, 0.17, 0]}>
            <sphereGeometry args={[0.016, 8, 8]} />
            <meshStandardMaterial color="#ff9a3c" emissive="#ff6a00" emissiveIntensity={1.4} />
          </mesh>
        </group>
      ))}
      {smoked ? <RisingSmoke /> : null}
    </group>
  );
}

function PlantedIncense({ x, onFade }) {
  const ref = useRef(null);
  const age = useRef(0);
  const gone = useRef(false);
  useFrame((_, delta) => {
    age.current += delta;
    if (!ref.current) return;
    const fade = age.current > 16 ? Math.max(0, 1 - (age.current - 16) / 3) : 1;
    ref.current.visible = fade > 0.02;
    if (age.current > 19 && !gone.current) {
      gone.current = true;
      onFade();
    }
  });
  return (
    <group ref={ref} position={[x, 0.72, -0.45]}>
      <IncenseSticks />
    </group>
  );
}

function IncenseWalker({ username, silk, onPlant, onDone, riteCam }) {
  const root = useRef(null);
  const camera = useThree((state) => state.camera);
  const leftLeg = useRef(null);
  const rightLeg = useRef(null);
  const sticks = useRef(null);
  const age = useRef(0);
  const planted = useRef(false);
  const finished = useRef(false);
  const frameTime = useRef(-1);
  const walk = 4.6;
  const bowZ = 1.72;
  const plantZ = 0.36;
  const bows = 3;
  const bow = 1.2;
  const approach = 1.7;
  const plant = 1.15;
  const leave = 2.2;

  useEffect(() => {
    return () => {
      if (riteCam.current) riteCam.current.active = false;
    };
  }, [riteCam]);

  useFrame((state, delta) => {
    const now = state.clock.elapsedTime;
    if (now === frameTime.current) return;
    frameTime.current = now;
    const body = root.current;
    if (!body || finished.current) return;
    age.current += Math.min(delta, 0.05);
    const t = age.current;
    const bowEnd = walk + bows * bow;
    const approachEnd = bowEnd + approach;
    let z = bowZ;
    let walking = false;
    let bowing = 0;
    let stickDrop = 0;
    if (t < walk) {
      const u = t / walk;
      const eased = u * u * (3 - 2 * u);
      z = 5.7 + (bowZ - 5.7) * eased;
      walking = true;
    } else if (t < bowEnd) {
      z = bowZ;
      const u = ((t - walk) % bow) / bow;
      bowing = Math.sin(u * Math.PI);
    } else if (t < approachEnd) {
      const u = (t - bowEnd) / approach;
      const eased = u * u * (3 - 2 * u);
      z = bowZ + (plantZ - bowZ) * eased;
      walking = true;
    } else if (t < approachEnd + plant) {
      z = plantZ;
      stickDrop = (t - approachEnd) / plant;
    } else if (t < approachEnd + plant + leave) {
      const u = (t - approachEnd - plant) / leave;
      z = plantZ + (5.7 - plantZ) * u;
      walking = true;
      stickDrop = 1;
      if (!planted.current) {
        planted.current = true;
        onPlant();
      }
    } else if (!finished.current) {
      finished.current = true;
      riteCam.current.active = false;
      onDone();
      return;
    }
    const stride = walking ? Math.sin(t * 8) : 0;
    body.position.set(0, Math.abs(stride) * 0.035 - bowing * 0.08, z);
    body.rotation.x = bowing * 0.28;
    if (leftLeg.current) leftLeg.current.rotation.x = stride * 0.55;
    if (rightLeg.current) rightLeg.current.rotation.x = -stride * 0.55;
    if (sticks.current) {
      sticks.current.visible = stickDrop < 1;
      sticks.current.position.y = 1.02 - stickDrop * 0.46;
      sticks.current.position.z = 0.36 + stickDrop * 0.28;
    }
    const eyeY = body.position.y + 1.58 - bowing * 0.22;
    const eyeZ = body.position.z - 0.12;
    const lookY = 1.55 - bowing * 0.95 - stickDrop * 0.7;
    riteCam.current.active = true;
    riteCam.current.position.set(0, eyeY, eyeZ);
    riteCam.current.target.set(0, lookY, -2.15);
    riteCam.current.fov = 62;
    camera.position.set(0, eyeY, eyeZ);
    camera.lookAt(0, lookY, -2.15);
    if (Math.abs(camera.fov - 62) > 0.1) {
      camera.fov = 62;
      camera.updateProjectionMatrix();
    }
  }, -1);

  return (
    <group ref={root} position={[0, 0, 5.7]} rotation={[0, Math.PI, 0]}>
      <group ref={leftLeg} position={[-0.11, 0.82, 0]}>
        <mesh position={[0, -0.38, 0]} castShadow>
          <capsuleGeometry args={[0.065, 0.48, 4, 8]} />
          <meshStandardMaterial color={silk} roughness={0.62} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.11, 0.82, 0]}>
        <mesh position={[0, -0.38, 0]} castShadow>
          <capsuleGeometry args={[0.065, 0.48, 4, 8]} />
          <meshStandardMaterial color={silk} roughness={0.62} />
        </mesh>
      </group>
      <mesh position={[0, 1.12, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.32, 0.92, 12]} />
        <meshStandardMaterial color={silk} roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.62, 0]} castShadow>
        <sphereGeometry args={[0.12, 16, 12]} />
        <meshStandardMaterial color="#e4b89a" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.73, -0.02]}>
        <sphereGeometry args={[0.11, 12, 10]} />
        <meshStandardMaterial color="#241c18" roughness={0.7} />
      </mesh>
      <mesh position={[0.16, 1.18, 0.32]} rotation={[1.15, 0, -0.25]} castShadow>
        <capsuleGeometry args={[0.04, 0.28, 4, 6]} />
        <meshStandardMaterial color={silk} roughness={0.6} />
      </mesh>
      <mesh position={[-0.1, 1.2, 0.34]} rotation={[1.2, 0, 0.3]} castShadow>
        <capsuleGeometry args={[0.04, 0.26, 4, 6]} />
        <meshStandardMaterial color={silk} roughness={0.6} />
      </mesh>
      <group ref={sticks} position={[0.04, 1.12, 0.42]}>
        <IncenseSticks />
      </group>
      <group position={[0, 1.15, 0]}>
        <NameTag name={username} />
      </group>
    </group>
  );
}

function IncenseRite({ offerings, onDone, onThanks, riteCam }) {
  const [planted, setPlanted] = useState([]);
  const current = offerings[0];
  return (
    <group>
      {planted.map((stick) => (
        <PlantedIncense
          key={stick.id}
          x={stick.x}
          onFade={() => setPlanted((list) => list.filter((item) => item.id !== stick.id))}
        />
      ))}
      {current ? (
        <IncenseWalker
          key={current.id}
          username={current.username}
          silk={current.id % 2 ? "#f7f3ea" : "#1c1917"}
          onPlant={() => {
            setPlanted((list) => [...list.slice(-4), { id: current.id, x: ((current.id % 5) - 2) * 0.045 }]);
            onThanks?.();
          }}
          riteCam={riteCam}
          onDone={() => onDone(current.id)}
        />
      ) : null}
    </group>
  );
}

function Hall({ devotees, offerings, onOfferingDone, onOfferingThanks, riteCam }) {
  const people = devotees.slice(-SEAT_COUNT);

  const [woodColor, woodRough, woodNormal, wallColor, wallRough] = useTexture([
    "/textures/wood_color.jpg",
    "/textures/wood_roughness.jpg",
    "/textures/wood_normal.jpg",
    "/textures/wall_color.jpg",
    "/textures/wall_roughness.jpg",
  ]);

  prepareTexture(woodColor, 6, 4);
  prepareDataTexture(woodRough, 6, 4);
  prepareDataTexture(woodNormal, 6, 4);
  prepareTexture(wallColor, 3, 2);
  prepareDataTexture(wallRough, 3, 2);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, HALL_Z]} receiveShadow>
        <planeGeometry args={[18, 18]} />
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
      <SonThuyWall />
      <LeftWallPainting />
      <RightWallPainting />

      <mesh position={[0, HALL_H + 0.16, HALL_Z - 0.4]}>
        <boxGeometry args={[HALL_W + 3.2, 0.28, HALL_D + 0.6]} />
        <meshStandardMaterial color="#6e1824" roughness={0.6} metalness={0.05} />
      </mesh>
      <mesh position={[0, HALL_H - 0.28, 3.4]}>
        <boxGeometry args={[HALL_W + 3.4, 0.16, 0.7]} />
        <meshStandardMaterial color="#f0d48a" roughness={0.35} metalness={0.4} />
      </mesh>

      {[
        [-4.35, -1.55],
        [4.35, -1.55],
        [-4.9, 2.15],
        [4.9, 2.15],
      ].map(([x, z]) => (
        <group key={`${x}-${z}`} position={[x, 0, z]}>
          <mesh position={[0, 2.15, 0]} castShadow>
            <cylinderGeometry args={[0.22, 0.26, 4.3, 20]} />
            <meshStandardMaterial color="#9d2433" roughness={0.45} metalness={0.08} />
          </mesh>
          <mesh position={[0, 4.35, 0]}>
            <cylinderGeometry args={[0.32, 0.32, 0.12, 20]} />
            <meshStandardMaterial color="#e7c56a" roughness={0.3} metalness={0.55} />
          </mesh>
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.34, 0.36, 0.16, 20]} />
            <meshStandardMaterial color="#e7c56a" roughness={0.3} metalness={0.55} />
          </mesh>
          <mesh position={[0, 3.55, 0]}>
            <sphereGeometry args={[0.16, 16, 16]} />
            <meshStandardMaterial color="#ffbf3c" emissive="#ff9f1a" emissiveIntensity={1.4} />
          </mesh>
          <pointLight position={[0, 3.35, 0.2]} color="#ffb347" intensity={1.15} distance={9} />
        </group>
      ))}

      {[
        [-2.35, 3.15],
        [2.35, 3.15],
        [-2.35, 1.15],
        [2.35, 1.15],
        [-2.35, 4.55],
        [2.35, 4.55],
      ].map(([x, z]) => (
        <group key={`den-${x}-${z}`} position={[x, 0, z]}>
          <mesh position={[0, 3.35, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.85, 6]} />
            <meshStandardMaterial color="#e7c56a" metalness={0.55} roughness={0.32} />
          </mesh>
          <mesh position={[0, 2.86, 0]}>
            <sphereGeometry args={[0.14, 16, 12]} />
            <meshStandardMaterial color="#ffd56a" emissive="#ff9a1a" emissiveIntensity={2.1} />
          </mesh>
          <pointLight position={[0, 2.55, 0]} color="#ffc56a" intensity={2.4} distance={7.5} decay={2} />
        </group>
      ))}

      <mesh position={[0, 0.48, -2.95]} castShadow receiveShadow>
        <boxGeometry args={[3.4, 0.96, 1.5]} />
        <meshStandardMaterial color="#7c1b28" roughness={0.5} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0.99, -2.95]}>
        <boxGeometry args={[3.7, 0.1, 1.75]} />
        <meshStandardMaterial color="#4a1218" roughness={0.42} metalness={0.08} />
      </mesh>
      <FruitPlate position={[-1.15, 1.1, -2.8]} />
      <FruitPlate position={[1.15, 1.1, -2.75]} mirror={-1} />
      <OfferingTable />
      <OrnamentWalls />

      <mesh position={[0, 0.012, 1.9]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[0.68, 4.6]} />
        <meshStandardMaterial color="#5c1218" roughness={0.88} />
      </mesh>
      {[-2.05, 2.05].map((x) => (
        <mesh key={x} position={[x, 0.018, 1.9]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[2.05, 3.75]} />
          <meshStandardMaterial color="#7a1d28" roughness={0.8} />
        </mesh>
      ))}

      <Devotees people={people} />
      <IncenseRite offerings={offerings} onDone={onOfferingDone} onThanks={onOfferingThanks} riteCam={riteCam} />

      <ContactShadows position={[0, 0.02, 1.2]} opacity={0.4} scale={24} blur={2.4} far={7} color="#140c08" />
    </group>
  );
}

export const PORTRAIT_VIEW = {
  id: "doc",
  label: "Dọc",
  position: [0, 2.05, 7.45],
  target: [0, 0.48, 1.35],
  fov: 58,
};

export function findView(id) {
  if (id === PORTRAIT_VIEW.id) return PORTRAIT_VIEW;
  return CAMERA_VIEWS.find((item) => item.id === id) ?? PORTRAIT_VIEW;
}

export function aimPortrait(yaw = 0) {
  const [px, py, pz] = PORTRAIT_VIEW.position;
  const [tx, , tz] = PORTRAIT_VIEW.target;
  const dx = tx - px;
  const dz = tz - pz;
  const horiz = Math.hypot(dx, dz) || 1;
  const angle = Math.atan2(dx, -dz) + yaw;
  return {
    position: PORTRAIT_VIEW.position,
    target: [px + Math.sin(angle) * horiz, PORTRAIT_VIEW.target[1], pz - Math.cos(angle) * horiz],
    fov: PORTRAIT_VIEW.fov,
  };
}

export const CAMERA_VIEWS = [
  { id: "toan-canh", label: "Toàn cảnh", position: [0, 3.55, 8.15], target: [0, 0.55, 0.55], fov: 46 },
  { id: "chinh-dien", label: "Chính điện", position: [0, 2.15, 3.35], target: [0, 1.85, -2.4], fov: 40 },
  { id: "tuong-trai", label: "Tường trái", position: [-2.15, 2.05, -2.55], target: [-6.45, 2.15, -1.85], fov: 40 },
  { id: "tuong-giua", label: "Tường giữa", position: [0, 1.95, 2.15], target: [0, 2.25, -3.9], fov: 42 },
  { id: "loi-giua", label: "Lối giữa", position: [0, 1.28, 6.35], target: [0, 1.15, -2.2], fov: 50 },
  { id: "ben-phai", label: "Bên phải", position: [2.15, 2.05, -2.55], target: [6.45, 2.15, -1.85], fov: 40 },
];

function ViewCamera({ viewId, riteCam, yaw = 0 }) {
  const camera = useThree((state) => state.camera);
  const view = findView(viewId);
  const yawRef = useRef(yaw);
  yawRef.current = yaw;
  const goalPos = useRef(new THREE.Vector3(...view.position));
  const goalTarget = useRef(new THREE.Vector3(...view.target));
  const look = useRef(new THREE.Vector3(...view.target));
  const goalFov = useRef(view.fov);
  const riding = useRef(false);

  useLayoutEffect(() => {
    if (riteCam.current?.active) return;
    goalPos.current.set(...view.position);
    goalTarget.current.set(...view.target);
    goalFov.current = view.fov;
  }, [view, riteCam]);

  useFrame((_, delta) => {
    const rite = riteCam.current;
    if (rite?.active) {
      riding.current = true;
      goalPos.current.copy(rite.position);
      goalTarget.current.copy(rite.target);
      goalFov.current = rite.fov;
    } else if (riding.current) {
      riding.current = false;
      goalPos.current.set(...view.position);
      goalTarget.current.set(...view.target);
      goalFov.current = view.fov;
    }
    if (rite?.active) return;
    if (view.id === PORTRAIT_VIEW.id) {
      const aim = aimPortrait(currentYaw());
      goalPos.current.set(...aim.position);
      goalTarget.current.set(...aim.target);
      goalFov.current = aim.fov;
    }
    const step = 1 - Math.exp(-delta * 3.4);
    camera.position.lerp(goalPos.current, step);
    look.current.lerp(goalTarget.current, step);
    camera.lookAt(look.current);
    camera.fov += (goalFov.current - camera.fov) * step;
    camera.updateProjectionMatrix();
  });
  return null;
}

export default function TempleScene({ devotees, hitting, viewId, yaw = 0, offerings = [], onOfferingDone, onOfferingThanks }) {
  const opening = findView(viewId);
  const riteCam = useRef({
    active: false,
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
    fov: 58,
  });
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: opening.position, fov: opening.fov, near: 0.05 }}
      gl={{ antialias: true, alpha: false, localClippingEnabled: true, toneMapping: THREE.ACESFilmicToneMapping }}
    >
      <EnableClipping />
      <ViewCamera viewId={viewId} riteCam={riteCam} yaw={yaw} />
      <color attach="background" args={["#1a100c"]} />
      <fog attach="fog" args={["#1a100c", 16, 32]} />
      <ambientLight intensity={0.55} color="#ffe0bf" />
      <directionalLight position={[2, 6, 4]} intensity={1.45} color="#fff1d6" castShadow />
      <pointLight position={[0, 2.4, 6.4]} color="#ffe4c2" intensity={1.6} distance={16} decay={2} />
      <Hall
        devotees={devotees}
        offerings={offerings}
        onOfferingDone={onOfferingDone}
        onOfferingThanks={onOfferingThanks}
        riteCam={riteCam}
      />
      <Statue hitting={hitting} />
      <Monk />
    </Canvas>
  );
}
