import { useEffect, useRef, useState } from "react";
import TempleScene from "./TempleScene.jsx";
import "./App.css";

const MAX_DEVOTEES = 24;
const MAX_TOASTS = 8;
const MAX_HITS_PER_SEC = 10;
const WS_URL = import.meta.env.VITE_WS_URL || "ws://127.0.0.1:8000/ws";
const WS_TOKEN = import.meta.env.VITE_WS_TOKEN || "";

function buildWsUrl() {
  if (!WS_TOKEN) return WS_URL;
  const sep = WS_URL.includes("?") ? "&" : "?";
  return `${WS_URL}${sep}token=${encodeURIComponent(WS_TOKEN)}`;
}

function createAudioPool(size = 6, src = "/mo.mp3") {
  const pool = Array.from({ length: size }, () => {
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.volume = 0.85;
    audio.addEventListener("error", () => {
      if (!audio.dataset.fallback) {
        audio.dataset.fallback = "1";
        audio.src = "/mo.wav";
        audio.load();
      }
    });
    return audio;
  });
  let index = 0;

  return {
    play() {
      const slot = pool[index % pool.length];
      index += 1;
      try {
        slot.currentTime = 0;
        void slot.play().catch(() => {});
      } catch {
        /* ignore autoplay / decode errors */
      }
    },
  };
}

let devoteeSeq = 0;
let toastSeq = 0;

export default function App() {
  const [devotees, setDevotees] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [hitting, setHitting] = useState(false);
  const [wsState, setWsState] = useState("connecting");

  const audioPoolRef = useRef(null);
  const hitTimesRef = useRef([]);
  const hitTimerRef = useRef(null);

  if (!audioPoolRef.current) {
    audioPoolRef.current = createAudioPool(6);
  }

  const triggerFx = () => {
    const now = performance.now();
    hitTimesRef.current = hitTimesRef.current.filter((t) => now - t < 1000);
    if (hitTimesRef.current.length >= MAX_HITS_PER_SEC) {
      return;
    }
    hitTimesRef.current.push(now);
    audioPoolRef.current?.play();
    setHitting(true);
    if (hitTimerRef.current) clearTimeout(hitTimerRef.current);
    hitTimerRef.current = setTimeout(() => setHitting(false), 450);
  };

  const pushToast = (username, content) => {
    const id = ++toastSeq;
    setToasts((prev) => {
      const next = [...prev, { id, username, content }];
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
    });
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2500);
  };

  const spawnDevotee = (username) => {
    const id = ++devoteeSeq;
    const xOffset = 4 + Math.random() * 92;
    setDevotees((prev) => {
      const next = [...prev, { id, username, xOffset }];
      return next.length > MAX_DEVOTEES ? next.slice(next.length - MAX_DEVOTEES) : next;
    });
  };

  const handleEvent = (payload) => {
    if (!payload || typeof payload !== "object") return;
    if (payload.spawnDevotee) {
      spawnDevotee(payload.username || "Phật tử");
    }
    triggerFx();
    pushToast(payload.username || "Ẩn danh", payload.content || payload.type || "");
  };

  useEffect(() => {
    let socket;
    let closed = false;
    let delay = 2000;
    let reconnectTimer;

    const connect = () => {
      if (closed) return;
      setWsState("connecting");
      socket = new WebSocket(buildWsUrl());

      socket.onopen = () => {
        delay = 2000;
        setWsState("open");
      };

      socket.onmessage = (event) => {
        try {
          handleEvent(JSON.parse(event.data));
        } catch {
          /* ignore bad frames */
        }
      };

      socket.onclose = () => {
        setWsState("closed");
        if (closed) return;
        reconnectTimer = setTimeout(() => {
          delay = Math.min(delay + 2000, 10000);
          connect();
        }, delay);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    connect();

    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      if (hitTimerRef.current) clearTimeout(hitTimerRef.current);
      socket?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`scene ${hitting ? "hit" : ""}`}>
      <TempleScene devotees={devotees} hitting={hitting} />
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            <strong>{toast.username}</strong>
            <span>{toast.content}</span>
          </div>
        ))}
      </div>
      <div className={`ws-pill ${wsState}`} title="WebSocket status">
        {wsState === "open" ? "●" : "○"}
      </div>
    </div>
  );
}
