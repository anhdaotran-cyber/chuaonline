import { useEffect, useRef, useState } from "react";
import TempleScene, { PORTRAIT_VIEW } from "./TempleScene.jsx";
import { releaseDevotee, seatDevotee } from "./devotees.js";
import { isSensitive } from "./offeringSpeech.js";
import { YAW_SPOTS, applyCameraState, bindCameraSender, currentYaw, readAuto, readSpeed, setAutoEnabled, subscribeCamera, writeSpeed, writeYaw, yawLabel } from "./cameraControl.js";
import "./ControlPage.css";

const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
const WS_TOKEN = import.meta.env.VITE_WS_TOKEN || "";
const TURN_RATE = 0.9;

function buildWsUrl() {
  if (!WS_TOKEN) return WS_URL;
  const sep = WS_URL.includes("?") ? "&" : "?";
  return `${WS_URL}${sep}token=${encodeURIComponent(WS_TOKEN)}`;
}

export default function ControlPage() {
  const [yaw, setYaw] = useState(currentYaw);
  const [speed, setSpeed] = useState(readSpeed);
  const [auto, setAuto] = useState(readAuto);
  const [wsState, setWsState] = useState("connecting");
  const [devotees, setDevotees] = useState([]);
  const autoRef = useRef(false);
  const speedRef = useRef(speed);
  const holding = useRef(false);
  autoRef.current = auto;
  speedRef.current = speed;

  useEffect(() => {
    document.body.classList.add("control-page");
    document.title = "Điều khiển góc nhìn";
    return () => {
      document.body.classList.remove("control-page");
      document.title = "Cầu nguyện Overlay";
    };
  }, []);

  useEffect(() => subscribeCamera((detail) => {
    setAuto(Boolean(detail?.auto));
    if (typeof detail?.speed === "number") setSpeed(detail.speed);
    setYaw(currentYaw());
  }), []);

  useEffect(() => {
    const timer = window.setInterval(() => setYaw(currentYaw()), 200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let socket;
    let closed = false;
    let delay = 2000;
    let reconnectTimer;
    let seq = 0;

    const spawn = (username, avatar, userKey, comment) => {
      const shown = isSensitive(username) ? "Phật tử" : username;
      const line = isSensitive(comment) ? "" : String(comment || "").trim();
      setDevotees((prev) =>
        seatDevotee(prev, {
          id: ++seq,
          username: shown,
          avatar,
          userKey: userKey || username || "phat-tu",
          comment: line,
        }),
      );
    };

    const connect = () => {
      if (closed) return;
      setWsState("connecting");
      socket = new WebSocket(buildWsUrl());
      socket.onopen = () => {
        delay = 2000;
        setWsState("open");
        bindCameraSender(socket);
      };
      socket.onmessage = (event) => {
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
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
          spawn(payload.username || "Phật tử", payload.avatar || "", payload.userKey || "", payload.content || "");
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
      socket.onerror = () => socket.close();
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      bindCameraSender(null);
      socket?.close();
    };
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "ArrowLeft") nudge(-1);
      if (event.key === "ArrowRight") nudge(1);
      if (event.key === "Home" || event.key === "0") center();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nudge = (dir) => {
    holding.current = true;
    autoRef.current = false;
    setAuto(false);
    setYaw((current) => writeYaw(current + dir * 0.05 * speedRef.current));
  };

  const hold = (dir) => {
    nudge(dir);
    const timer = window.setInterval(() => {
      setYaw((current) => writeYaw(current + dir * TURN_RATE * speedRef.current * 0.05));
    }, 50);
    const stop = () => {
      holding.current = false;
      window.clearInterval(timer);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  const center = () => {
    autoRef.current = false;
    setAuto(false);
    setYaw(writeYaw(0));
  };

  const goTo = (next) => {
    autoRef.current = false;
    setAuto(false);
    setYaw(writeYaw(next));
  };

  const wsLabel = wsState === "open" ? "Đã nối live" : wsState === "connecting" ? "Đang nối live" : "Chưa nối live";

  return (
    <div className="control-shell">
      <div className="control-preview">
        <TempleScene devotees={devotees} hitting={false} viewId={PORTRAIT_VIEW.id} yaw={yaw} offerings={[]} />
      </div>
      <section className="control-panel">
        <p className="control-kicker">Trang điều khiển</p>
        <h1>Quay góc nhìn</h1>
        <p className="control-note">
          Quay trái hoặc phải để người ngồi hai bên lọt vào khung. Trang live trên TikTok đi theo, không hiện nút này.
        </p>
        <p className={`control-angle ${yaw < -0.03 ? "left" : ""} ${yaw > 0.03 ? "right" : ""}`}>{yawLabel(yaw)}</p>
        <div className="control-turn">
          <button type="button" onPointerDown={() => hold(-1)}>
            Quay trái
          </button>
          <button type="button" onPointerDown={() => hold(1)}>
            Quay phải
          </button>
        </div>
        <div className="control-spots" role="group" aria-label="Vị trí góc quay">
          {YAW_SPOTS.map((spot) => (
            <button
              key={spot.id}
              type="button"
              className={Math.abs(yaw - spot.yaw) < 0.04 ? "on" : ""}
              onClick={() => goTo(spot.yaw)}
            >
              {spot.label}
            </button>
          ))}
        </div>
        <label className="control-speed">
          <span>
            Tốc độ quay
            <strong>{speed.toFixed(1)}×</strong>
          </span>
          <input
            type="range"
            min="0.3"
            max="3"
            step="0.1"
            value={speed}
            aria-label="Tốc độ quay"
            onChange={(event) => setSpeed(writeSpeed(event.target.value))}
          />
          <small>
            <span>Chậm</span>
            <span>Nhanh</span>
          </small>
        </label>
        <div className="control-actions">
          <button type="button" onClick={center}>
            Về giữa
          </button>
          <button type="button" className={auto ? "on" : ""} onClick={() => setAuto(setAutoEnabled(!readAuto()))}>
            {auto ? "Đang tự quay" : "Tự quay hai bên"}
          </button>
        </div>
        <p className={`control-link ${wsState}`}>{wsLabel}</p>
      </section>
    </div>
  );
}
