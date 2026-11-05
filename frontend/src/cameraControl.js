export const MAX_YAW = 0.68;
export const SWEEP_SECONDS = 26;

export const YAW_SPOTS = [
  { id: "ngoai-trai", label: "Ngoài trái", yaw: -0.43 },
  { id: "trong-trai", label: "Trong trái", yaw: -0.27 },
  { id: "trong-phai", label: "Trong phải", yaw: 0.27 },
  { id: "ngoai-phai", label: "Ngoài phải", yaw: 0.43 },
];

const STORAGE_KEY = "chua-camera-yaw";
const SPEED_KEY = "chua-camera-speed";
const AUTO_KEY = "chua-camera-auto";
const CHANNEL_NAME = "chua-camera";
const MIN_SPEED = 0.3;
const MAX_SPEED = 3;

export function clampSpeed(speed) {
  const value = Number(speed);
  if (!Number.isFinite(value)) return 1;
  return Math.max(MIN_SPEED, Math.min(MAX_SPEED, value));
}

export function clampYaw(yaw) {
  const value = Number(yaw);
  if (!Number.isFinite(value)) return 0;
  return Math.max(-MAX_YAW, Math.min(MAX_YAW, value));
}

function emptySweep() {
  return { on: false, speed: 1, startedAt: 0, phase: 0 };
}

let manualYaw = 0;
let sweep = emptySweep();
let sender = null;
let channel;

function readStoredYaw() {
  try {
    return clampYaw(localStorage.getItem(STORAGE_KEY));
  } catch {
    return 0;
  }
}

function loadSweep() {
  try {
    const raw = localStorage.getItem(AUTO_KEY);
    const speedRaw = localStorage.getItem(SPEED_KEY);
    const speed = speedRaw == null || speedRaw === "" ? 1 : clampSpeed(speedRaw);
    if (!raw) {
      sweep = { ...emptySweep(), speed };
      return;
    }
    const data = JSON.parse(raw);
    sweep = {
      on: Boolean(data?.on),
      speed: clampSpeed(data?.speed ?? speed),
      startedAt: Number(data?.startedAt) || 0,
      phase: Number(data?.phase) || 0,
    };
  } catch {
    sweep = emptySweep();
  }
}

manualYaw = readStoredYaw();
loadSweep();

export function readSpeed() {
  return sweep.speed;
}

export function readYaw() {
  return manualYaw;
}

export function readAuto() {
  return sweep.on;
}

export function currentYaw(now = Date.now()) {
  if (!sweep.on || !sweep.startedAt) return manualYaw;
  const elapsed = Math.max(0, (now - sweep.startedAt) / 1000);
  const phase = sweep.phase + ((Math.PI * 2) * sweep.speed * elapsed) / SWEEP_SECONDS;
  return Math.sin(phase) * MAX_YAW;
}

function snapshot() {
  return {
    type: "camera",
    yaw: manualYaw,
    auto: sweep.on,
    speed: sweep.speed,
    startedAt: sweep.startedAt,
    phase: sweep.phase,
  };
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, String(manualYaw));
    localStorage.setItem(SPEED_KEY, String(sweep.speed));
    localStorage.setItem(AUTO_KEY, JSON.stringify(sweep));
  } catch {
    /* private mode */
  }
}

function emitLocal() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("chua-camera", { detail: snapshot() }));
}

function publish() {
  persist();
  const detail = snapshot();
  bus()?.postMessage(detail);
  emitLocal();
  if (sender && sender.readyState === WebSocket.OPEN) {
    sender.send(JSON.stringify(detail));
  }
  return detail;
}

export function applyCameraState(detail) {
  if (!detail || typeof detail !== "object") return;
  if (typeof detail.yaw === "number") manualYaw = clampYaw(detail.yaw);
  sweep = {
    on: Boolean(detail.auto),
    speed: clampSpeed(detail.speed ?? sweep.speed),
    startedAt: Number(detail.startedAt) || 0,
    phase: Number.isFinite(Number(detail.phase)) ? Number(detail.phase) : 0,
  };
  persist();
  emitLocal();
}

export function bindCameraSender(socket) {
  sender = socket;
  return () => {
    if (sender === socket) sender = null;
  };
}

export function writeYaw(yaw) {
  manualYaw = clampYaw(yaw);
  sweep = { ...sweep, on: false };
  publish();
  return manualYaw;
}

export function writeSpeed(speed) {
  const next = clampSpeed(speed);
  if (sweep.on && sweep.startedAt) {
    const elapsed = Math.max(0, (Date.now() - sweep.startedAt) / 1000);
    const phase = sweep.phase + ((Math.PI * 2) * sweep.speed * elapsed) / SWEEP_SECONDS;
    sweep = { on: true, speed: next, startedAt: Date.now(), phase };
  } else {
    sweep = { ...sweep, speed: next };
  }
  publish();
  return next;
}

export function setAutoEnabled(on) {
  if (on) {
    const yaw = currentYaw();
    const ratio = Math.max(-1, Math.min(1, yaw / MAX_YAW));
    sweep = {
      on: true,
      speed: sweep.speed || 1,
      startedAt: Date.now(),
      phase: Math.asin(ratio),
    };
  } else {
    manualYaw = clampYaw(currentYaw());
    sweep = { ...sweep, on: false };
  }
  publish();
  return sweep.on;
}

function bus() {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener("message", (event) => {
      applyCameraState(event.data);
    });
  }
  return channel;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== AUTO_KEY && event.key !== STORAGE_KEY && event.key !== SPEED_KEY) return;
    manualYaw = readStoredYaw();
    loadSweep();
    emitLocal();
  });
  bus();
}

export function subscribeCamera(onChange) {
  const onLocal = (event) => onChange(event.detail);
  window.addEventListener("chua-camera", onLocal);
  return () => window.removeEventListener("chua-camera", onLocal);
}

export function subscribeYaw(onYaw) {
  return subscribeCamera(() => onYaw(currentYaw()));
}

export function yawLabel(yaw) {
  const degrees = Math.round((clampYaw(yaw) * 180) / Math.PI);
  if (Math.abs(degrees) < 2) return "Giữa";
  return degrees < 0 ? `Trái ${Math.abs(degrees)}°` : `Phải ${degrees}°`;
}
