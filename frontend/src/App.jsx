import { useEffect, useRef, useState } from "react";
import TempleScene, { CAMERA_VIEWS, PORTRAIT_VIEW, findView } from "./TempleScene.jsx";
import { releaseDevotee, seatDevotee } from "./devotees.js";
import { isSensitive, speakInvite, speakThanks } from "./offeringSpeech.js";
import { applyCameraState, readYaw, subscribeYaw } from "./cameraControl.js";
import "./App.css";

const TEST_AVATAR =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><circle cx="64" cy="64" r="64" fill="#e7c56a"/><circle cx="46" cy="54" r="8" fill="#4a1218"/><circle cx="82" cy="54" r="8" fill="#4a1218"/><path d="M44 78c8 12 32 12 40 0" fill="none" stroke="#4a1218" stroke-width="6" stroke-linecap="round"/></svg>',
  );
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

function isOfferingGift(content) {
  const text = String(content || "");
  const count = Number((text.match(/x\s*(\d+)\s*$/i) || [])[1] || 0);
  if (/hoa\s*hồng|hoa\s*hong|\brose\b/i.test(text)) return true;
  if (text.trim() === "50 tim") return true;
  return /tim|heart/i.test(text) && count >= 50;
}

let devoteeSeq = 0;
let toastSeq = 0;
let offeringSeq = 0;
let lastSpokenOfferingId = 0;

export default function App() {
  const [devotees, setDevotees] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [hitting, setHitting] = useState(false);
  const [wsState, setWsState] = useState("connecting");
  const [viewId, setViewId] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get("goc");
    return findView(requested).id === requested ? requested : PORTRAIT_VIEW.id;
  });
  const [showControls, setShowControls] = useState(
    () => new URLSearchParams(window.location.search).get("setup") === "1",
  );
  const [offerings, setOfferings] = useState([]);
  const [yaw, setYaw] = useState(readYaw);

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

  const spawnDevotee = (username, avatar = "", userKey = "", comment = "") => {
    const key = userKey || username || "phat-tu";
    const id = ++devoteeSeq;
    const shown = isSensitive(username) ? "Phật tử" : username;
    const line = isSensitive(comment) ? "" : String(comment || "").trim();
    setDevotees((prev) =>
      seatDevotee(prev, { id, username: shown, avatar, userKey: key, comment: line }),
    );
  };

  const startOffering = (username, gift) => {
    const id = ++offeringSeq;
    setOfferings((prev) => {
      const next = [...prev, { id, username: username || "Phật tử", gift: gift || "Dâng hương" }];
      return next.length > 6 ? next.slice(next.length - 6) : next;
    });
  };

  const handleEvent = (payload) => {
    if (!payload || typeof payload !== "object") return;
    if (payload.type === "camera") {
      applyCameraState(payload);
      return;
    }
    if (payload.type === "leave") {
      if (payload.userKey) setDevotees((prev) => releaseDevotee(prev, payload.userKey));
      return;
    }
    if (payload.spawnDevotee) {
      spawnDevotee(
        payload.username || "Phật tử",
        payload.avatar || "",
        payload.userKey || "",
        payload.content || "",
      );
    }
    if (payload.type === "gift" && (payload.offering || isOfferingGift(payload.content))) {
      startOffering(payload.username || "Phật tử", payload.content || "");
    }
    if (payload.chime !== false) triggerFx();
    pushToast(payload.username || "Ẩn danh", payload.content || payload.type || "");
  };

  useEffect(() => subscribeYaw(setYaw), []);

  const activeOfferingId = offerings[0]?.id;
  useEffect(() => {
    const current = offerings[0];
    if (!current || current.id === lastSpokenOfferingId) return;
    lastSpokenOfferingId = current.id;
    speakInvite(current.username);
  }, [activeOfferingId, offerings]);

  useEffect(() => {
    const onKey = (event) => {
      const views = [PORTRAIT_VIEW, ...CAMERA_VIEWS];
      const index = views.findIndex((item) => item.id === viewId);
      if (event.key === "h" || event.key === "H") {
        setShowControls((shown) => !shown);
      } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        setViewId(views[(index + 1) % views.length].id);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        setViewId(views[(index - 1 + views.length) % views.length].id);
      } else if (/^[1-9]$/.test(event.key)) {
        const picked = CAMERA_VIEWS[Number(event.key) - 1];
        if (picked) setViewId(picked.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewId]);

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
    <div className={`scene ${hitting ? "hit" : ""} ${showControls ? "controls" : ""}`}>
      <TempleScene
        devotees={devotees}
        hitting={hitting}
        viewId={viewId}
        yaw={yaw}
        offerings={offerings}
        onOfferingThanks={() => {
          const current = offerings[0];
          if (current) speakThanks(current.username);
        }}
        onOfferingDone={(id) => setOfferings((prev) => prev.filter((item) => item.id !== id))}
      />
      <div className="incense-rule">
        <strong>50 tim</strong>
        <span>hoặc</span>
        <strong>1 hoa hồng</strong>
        <em>để dâng hương</em>
      </div>
      {offerings[0] ? (
        <div className="offering-card" aria-live="polite">
          <small>Dâng hương</small>
          <strong>{isSensitive(offerings[0].username) ? "Phật tử" : offerings[0].username}</strong>
          <span>{isSensitive(offerings[0].gift) ? "Dâng hương" : offerings[0].gift}</span>
        </div>
      ) : null}
      {showControls ? (
        <>
          <button type="button" className="test-incense" onClick={() => startOffering("Thử hương", "Hoa hồng x1")}>
            {offerings.length ? "Đang dâng hương" : "Thử dâng hương"}
          </button>
          <button
            type="button"
            className="test-incense test-sit"
            onClick={() => spawnDevotee("Thử ngồi", TEST_AVATAR, "test-sit", "A Di Đà Phật")}
          >
            Thử ngồi
          </button>
          <div className="view-bar" role="toolbar" aria-label="Góc nhìn">
            {CAMERA_VIEWS.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={viewId === item.id ? "on" : ""}
                onClick={() => setViewId(item.id)}
              >
                {index + 1}. {item.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
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
