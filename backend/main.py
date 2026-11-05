"""
TikTok Interactive Live — Cầu nguyện overlay backend.
Listen to TikTok LIVE via unofficial TikTokLive, broadcast filtered
comment/gift events to OBS overlay clients over WebSocket.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("cau-nguyen")

TIKTOK_USERNAME = os.getenv("TIKTOK_USERNAME", "").strip()
WS_TOKEN = os.getenv("WS_TOKEN", "").strip()
USER_COOLDOWN_SEC = float(os.getenv("USER_COOLDOWN_SEC", "3"))
MAX_EVENTS_PER_SEC = float(os.getenv("MAX_EVENTS_PER_SEC", "8"))
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))


def _normalize_text(value: str) -> str:
    return " ".join(value.strip().casefold().split())


def _parse_triggers(raw: str) -> set[str]:
    parts = [p for p in raw.split(",") if p.strip()]
    return {_normalize_text(p) for p in parts}


TRIGGER_COMMENTS = _parse_triggers(
    os.getenv(
        "TRIGGER_COMMENTS",
        "a di đà phật,nam mô a di đà phật,cầu an",
    )
)

tiktok_status = "disconnected"
_user_last_emit: dict[str, float] = {}
_emit_timestamps: list[float] = []
_tiktok_task: asyncio.Task | None = None


class ConnectionManager:
    def __init__(self) -> None:
        self.active: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active.add(websocket)
        logger.info("WS client connected (%s)", len(self.active))

    def disconnect(self, websocket: WebSocket) -> None:
        self.active.discard(websocket)
        logger.info("WS client disconnected (%s)", len(self.active))

    async def broadcast(self, payload: dict[str, Any]) -> None:
        if not self.active:
            return
        dead: list[WebSocket] = []
        data_sockets = list(self.active)
        results = await asyncio.gather(
            *[ws.send_json(payload) for ws in data_sockets],
            return_exceptions=True,
        )
        for ws, result in zip(data_sockets, results):
            if isinstance(result, Exception):
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


def _allow_emit(user_key: str) -> bool:
    """Per-user cooldown + global rate limit. Hot-path only — no I/O."""
    now = time.monotonic()
    last = _user_last_emit.get(user_key, 0.0)
    if now - last < USER_COOLDOWN_SEC:
        return False

    cutoff = now - 1.0
    while _emit_timestamps and _emit_timestamps[0] < cutoff:
        _emit_timestamps.pop(0)
    if len(_emit_timestamps) >= MAX_EVENTS_PER_SEC:
        return False

    _user_last_emit[user_key] = now
    _emit_timestamps.append(now)
    return True


async def _emit_event(
    *,
    event_type: str,
    username: str,
    content: str,
    spawn_devotee: bool,
    user_key: str,
) -> None:
    if not _allow_emit(user_key):
        return
    await manager.broadcast(
        {
            "type": event_type,
            "username": username,
            "content": content,
            "spawnDevotee": spawn_devotee,
            "timestamp": int(time.time()),
        }
    )


async def _run_tiktok_client() -> None:
    """Single TikTokLive client with exponential reconnect backoff."""
    global tiktok_status

    if not TIKTOK_USERNAME:
        logger.error("TIKTOK_USERNAME is required. Set it in backend/.env")
        tiktok_status = "misconfigured"
        return

    unique_id = TIKTOK_USERNAME if TIKTOK_USERNAME.startswith("@") else f"@{TIKTOK_USERNAME}"
    placeholder = unique_id.lstrip("@").casefold() in {"your_username", "yourname", "username"}
    if placeholder:
        logger.error(
            "TIKTOK_USERNAME is still the placeholder %s. "
            "Edit backend/.env with a real TikTok unique_id (channel must be LIVE), then restart uvicorn.",
            unique_id,
        )
        tiktok_status = "misconfigured"
        return

    try:
        from TikTokLive import TikTokLiveClient
        from TikTokLive.events import (
            CommentEvent,
            ConnectEvent,
            DisconnectEvent,
            GiftEvent,
        )
    except ImportError:
        logger.exception("TikTokLive is not installed")
        tiktok_status = "error"
        return
    backoff_steps = [5.0, 15.0, 30.0, 60.0, 120.0]
    backoff_index = 0

    while True:
        client = TikTokLiveClient(unique_id=unique_id)
        state = {"connected_ok": False}

        @client.on(ConnectEvent)
        async def on_connect(_: ConnectEvent) -> None:
            global tiktok_status
            tiktok_status = "connected"
            state["connected_ok"] = True
            logger.info("Connected to TikTok LIVE @%s", unique_id.lstrip("@"))

        @client.on(DisconnectEvent)
        async def on_disconnect(_: DisconnectEvent) -> None:
            global tiktok_status
            tiktok_status = "disconnected"
            logger.warning("Disconnected from TikTok LIVE")

        @client.on(CommentEvent)
        async def on_comment(event: CommentEvent) -> None:
            text = getattr(event, "comment", "") or ""
            normalized = _normalize_text(text)
            if normalized not in TRIGGER_COMMENTS:
                return
            user = getattr(event, "user", None)
            nickname = getattr(user, "nickname", None) or getattr(user, "unique_id", "unknown")
            user_key = str(getattr(user, "unique_id", None) or nickname)
            await _emit_event(
                event_type="comment",
                username=str(nickname),
                content=text.strip(),
                spawn_devotee=True,
                user_key=f"c:{user_key}",
            )

        @client.on(GiftEvent)
        async def on_gift(event: GiftEvent) -> None:
            if getattr(event, "streaking", False):
                return
            gift = getattr(event, "gift", None)
            gift_name = getattr(gift, "name", None) or "gift"
            repeat = getattr(event, "repeat_count", 1) or 1
            user = getattr(event, "user", None)
            nickname = getattr(user, "nickname", None) or getattr(user, "unique_id", "unknown")
            user_key = str(getattr(user, "unique_id", None) or nickname)
            content = f"{gift_name} x{repeat}"
            await _emit_event(
                event_type="gift",
                username=str(nickname),
                content=content,
                spawn_devotee=False,
                user_key=f"g:{user_key}",
            )

        delay = backoff_steps[backoff_index]
        try:
            logger.info("Starting TikTokLive client for %s ...", unique_id)
            tiktok_status = "connecting"
            task = await client.start()
            await task
        except asyncio.CancelledError:
            tiktok_status = "disconnected"
            try:
                await client.disconnect()
            except Exception:
                pass
            raise
        except Exception:
            tiktok_status = "disconnected"
            logger.exception(
                "TikTokLive error; reconnecting in %.0fs (protocol/network)",
                delay,
            )
        else:
            tiktok_status = "disconnected"
            logger.warning("TikTokLive ended; reconnecting in %.0fs", delay)

        if state["connected_ok"]:
            backoff_index = 0
        else:
            backoff_index = min(backoff_index + 1, len(backoff_steps) - 1)
        delay = backoff_steps[backoff_index]
        await asyncio.sleep(delay)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _tiktok_task, tiktok_status
    _tiktok_task = asyncio.create_task(_run_tiktok_client(), name="tiktok-live")
    logger.info(
        "Triggers=%s cooldown=%.1fs max_eps=%.0f token=%s",
        sorted(TRIGGER_COMMENTS),
        USER_COOLDOWN_SEC,
        MAX_EVENTS_PER_SEC,
        "on" if WS_TOKEN else "off",
    )
    try:
        yield
    finally:
        if _tiktok_task:
            _tiktok_task.cancel()
            try:
                await _tiktok_task
            except asyncio.CancelledError:
                pass
            _tiktok_task = None
        tiktok_status = "disconnected"


app = FastAPI(title="Cau Nguyen Overlay", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "tiktok": tiktok_status,
        "clients": len(manager.active),
        "triggers": sorted(TRIGGER_COMMENTS),
        "username": TIKTOK_USERNAME or None,
    }


@app.get("/")
async def root() -> dict[str, str]:
    return {"status": "ok", "ws": "/ws", "health": "/health"}


@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str | None = Query(default=None),
) -> None:
    if WS_TOKEN and token != WS_TOKEN:
        await websocket.close(code=4401)
        return

    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive; overlay is receive-only.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=HOST,
        port=PORT,
        reload=False,
    )
