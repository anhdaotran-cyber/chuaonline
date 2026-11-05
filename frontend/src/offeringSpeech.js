const SHORT = new Set([
  "dm",
  "dcm",
  "dmm",
  "vcl",
  "vl",
  "cc",
  "cl",
  "dit",
  "deo",
  "lon",
  "cac",
  "buoi",
  "fuck",
  "shit",
  "sex",
  "nude",
  "dick",
  "porn",
  "rape",
  "slut",
  "nazi",
]);

const LONG = [
  "ditme",
  "ditbo",
  "ditcon",
  "concho",
  "fuckyou",
  "bitch",
  "whore",
  "nigger",
  "nigga",
  "cunt",
  "hitler",
  "suicide",
  "loanluan",
];

function fold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

function tokens(folded) {
  return folded.split(/[^a-z0-9]+/).filter(Boolean);
}

export function isSensitive(text) {
  const parts = tokens(fold(text));
  const compact = parts.join("");
  if (!compact) return false;
  if (SHORT.has(compact) || LONG.includes(compact)) return true;
  if (parts.some((part) => SHORT.has(part) || LONG.includes(part))) return true;
  return LONG.some((word) => compact.includes(word));
}

function spokenName(username) {
  const name = String(username || "").trim();
  if (!name || isSensitive(name)) return "";
  return name;
}

export function inviteLine(username) {
  const name = spokenName(username);
  return name ? `Mời ${name} dâng hương.` : "Mời dâng hương.";
}

export function thanksLine(username) {
  const name = spokenName(username);
  return name ? `Cảm ơn ${name} đã dâng hương.` : "Cảm ơn đã dâng hương.";
}

const BLESSINGS = {
  family: ["gia đình bình an", "gia đạo ấm êm", "người thân sum vầy", "nhà cửa yên vui"],
  health: ["sức khỏe dồi dào", "thân tâm an lạc", "bệnh tật tiêu trừ", "sống lâu khỏe mạnh"],
  fortune: ["kinh tế vững vàng", "làm ăn hanh thông", "tài lộc dồi dào", "công việc thuận lợi"],
  love: ["tình duyên viên mãn", "duyên lành sớm đến", "tình cảm bền lâu", "nhân duyên thuận lợi"],
};

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function blessingLine(username) {
  const wishes = [pick(BLESSINGS.family), pick(BLESSINGS.health), pick(BLESSINGS.fortune), pick(BLESSINGS.love)];
  for (let i = wishes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [wishes[i], wishes[j]] = [wishes[j], wishes[i]];
  }
  const sentence = `${wishes.slice(0, -1).join(", ")} và ${wishes[wishes.length - 1]}`;
  const name = spokenName(username);
  return name ? `Chúc ${name} ${sentence}.` : `Chúc ${sentence}.`;
}

function pickVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return (
    voices.find((voice) => voice.lang?.toLowerCase().startsWith("vi")) ||
    voices.find((voice) => /vietnam/i.test(voice.name || "")) ||
    null
  );
}

function speakParts(parts, cancel) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  if (cancel) window.speechSynthesis.cancel();
  const voice = pickVoice();
  let index = 0;
  const next = () => {
    const part = parts[index];
    index += 1;
    if (!part) return;
    const utter = new SpeechSynthesisUtterance(part.text);
    utter.lang = "vi-VN";
    utter.rate = part.rate ?? 0.9;
    utter.pitch = part.pitch ?? 1;
    if (voice) utter.voice = voice;
    utter.onend = () => {
      window.setTimeout(next, part.gap ?? 0);
    };
    window.speechSynthesis.speak(utter);
  };
  next();
}

const CHANT = [
  { text: "Nam mô...", rate: 0.62, pitch: 0.84, gap: 320 },
  { text: "A Di Đà Phật.", rate: 0.64, pitch: 0.88, gap: 460 },
];

export function speakInvite(username) {
  speakParts(
    [
      ...CHANT,
      { text: inviteLine(username), rate: 0.86, pitch: 0.98, gap: 0 },
    ],
    true,
  );
}

export function speakThanks(username) {
  speakParts(
    [
      { text: thanksLine(username), rate: 0.84, pitch: 0.96, gap: 360 },
      { text: blessingLine(username), rate: 0.82, pitch: 0.94, gap: 0 },
    ],
    false,
  );
}
