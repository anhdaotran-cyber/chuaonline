# TikTok Interactive Live — Cầu nguyện Overlay

Overlay OBS trong suốt: **Bồ Tát** phía trên; mỗi comment khớp cụm từ có nghĩa sẽ **thêm một phật tử** quỳ phía dưới; gift chỉ phát hiệu ứng (glow + tiếng mõ + toast), không spawn thêm người.

## Không gian 3D

Overlay là chính điện Three.js: sàn và tường dùng texture CC0 từ [ambientCG](https://ambientcg.com/) (Wood Floor 043, Plaster 001). Tượng trên ban thờ là scan **Chinese Amoghasiddhi Buddha, 1403–1424** của Minneapolis Institute of Art, giấy phép CC0, file `frontend/public/models/buddha.glb`. Phật tử là người 3D quỳ, CC0 của [Innerscene](https://www.innerscene.com/) (MakeHuman): nam `frontend/public/models/devotee.glb`, nữ `frontend/public/models/devotee-nu.glb`. Áo quần được đổi sang màu nâu lam như áo đi chùa, đặt trên chiếu hai bên lối đi, quay mặt vào ban thờ. Nhà sư ngồi chấp tay bên trái bàn hương, file `frontend/public/models/monk.glb`, mô hình **Buddhist monk in orange robes** của restore50, giấy phép CC-BY.

## Cấu trúc

```text
TiktokLive/
├── backend/          # FastAPI + TikTokLive + WebSocket
└── frontend/         # React + Vite OBS overlay
```

## Yêu cầu vận hành (bắt buộc)

Tool này **không thay thế nội dung livestream**. Để giảm rủi ro “live rác” / low-quality:

1. Overlay chỉ là lớp trong suốt trên **camera / video thật** (không gian chùa, nghi lễ, người thật).
2. Operator phải có **giọng nói / tương tác thật** trên live — không để khung hình tĩnh + tiếng mõ lặp.
3. Không khuyến khích spam một ký tự. Dùng cụm từ có nghĩa (mặc định bên dưới) và ưu tiên tương tác gift / trò chuyện thật.
4. Bạn tự chịu trách nhiệm tuân thủ [TikTok Terms / Community Guidelines](https://www.tiktok.com/legal/page/us/terms-of-service/en).

## Backend

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# Sửa TIKTOK_USERNAME=@ten_cua_ban trong .env
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### Biến môi trường (`.env`)

| Key | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `TIKTOK_USERNAME` | (bắt buộc) | User livestream đang LIVE |
| `TRIGGER_COMMENTS` | `a di đà phật,nam mô a di đà phật,cầu an` | Cụm từ kích hoạt (phân tách bằng dấu phẩy) |
| `USER_COOLDOWN_SEC` | `3` | Cooldown mỗi user |
| `MAX_EVENTS_PER_SEC` | `8` | Giới hạn emit toàn cục |
| `WS_TOKEN` | trống | Nếu set: client phải nối `ws://.../ws?token=...` |
| `HOST` / `PORT` | `127.0.0.1` / `8000` | Localhost-first |

Health check: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

Payload WebSocket:

```json
{
  "type": "comment",
  "username": "An",
  "content": "A Di Đà Phật",
  "spawnDevotee": true,
  "timestamp": 1730000000
}
```

Gift: `"spawnDevotee": false`.

## Frontend (OBS overlay)

```bash
cd frontend
npm install
npm run dev
```

Mở [http://127.0.0.1:5173](http://127.0.0.1:5173).

Tuỳ chọn `.env` trong `frontend/`:

```env
VITE_WS_URL=ws://127.0.0.1:8000/ws
VITE_WS_TOKEN=
```

### OBS Browser Source

1. Thêm **Browser Source** → URL `http://127.0.0.1:5173`
2. Bật nền trong suốt (Transparent / Custom CSS):

```css
body { background-color: rgba(0,0,0,0) !important; }
```

3. Đặt source **trên** lớp camera/video thật.

### Assets (WebP &lt; 100KB khuyến nghị)

Thay file trong `frontend/public/`:

- `bodhisattva.webp` — ảnh Bồ Tát
- `models/devotee.glb`, `models/devotee-nu.glb` — phật tử nam và nữ (spawn xen kẽ)
- `mo.mp3` — tiếng gõ mõ ngắn (fallback `mo.wav` nếu thiếu mp3)

Tạo lại placeholder:

```bash
cd frontend
python scripts/generate_assets.py
```

## Ma trận rủi ro

| Nhóm | Mức | Mitigation trong tool | Việc operator phải làm |
| --- | --- | --- | --- |
| Policy & spam TikTok | Rất cao | Cụm từ có nghĩa, cooldown 3s, max 8 evt/s | Camera + giọng thật; tránh spam bait; ưu tiên gift |
| TikTokLive unofficial | TB–Cao | Backoff 5→15→30→60→120s, `/health`, không crash API | Chờ lib cập nhật khi Protobuf đổi |
| Frontend / OBS | Thấp | Devotee FIFO 24, toast 8, audio pool 6, hit coalesce | Nén WebP &lt;100KB |
| Event loop & bảo mật | Thấp | Handler nhẹ, bind `127.0.0.1`, `WS_TOKEN` | Không mở public không token |

## Lưu ý kỹ thuật

- Livestream phải **đang LIVE** thì TikTokLive mới kết nối được.
- `TikTokLive` là thư viện **unofficial** (reverse-engineer Webcast). Có thể gãy bất kỳ lúc nào khi TikTok đổi protocol.
- Không bot gửi comment lên TikTok — chỉ lắng nghe (read-only).
