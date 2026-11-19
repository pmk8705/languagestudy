/* LanguageStudy — 4개 국어 회화·청크 학습 (서버 없음, 폰에 저장) */
"use strict";

const KEY = "languagestudy-v1";
const DECK_FILES = ["daily_gym", "travel"]; // data/*.json — 새 묶음 파일을 만들면 여기와 sw.js ASSETS에 추가
const LANG_ORDER = ["en", "ja", "zh", "es"];
const LANGS = {
  en: { flag: "🇺🇸", name: "영어", tts: "en-US" },
  ja: { flag: "🇯🇵", name: "일본어", tts: "ja-JP" },
  zh: { flag: "🇨🇳", name: "중국어", tts: "zh-CN" },
  es: { flag: "🇪🇸", name: "스페인어", tts: "es-ES" },
};
// 복습 칸(box)마다 다음 복습까지 날 수
const BOX_DAYS = [0, 1, 3, 7, 14, 30, 60, 120];
const MINE = { id: "mine", title: "내 문장", emoji: "✍️" };
// 내 문장 주제: Gemini는 이 목록에서만 고른다 (docs/문장규칙.md와 같게)
const THEMES = ["인사·예절", "식당·카페", "쇼핑·결제", "호텔", "교통", "길찾기", "관광·사진", "긴급·건강", "일상", "운동", "감정·대화", "기타"];
// 목록에 없는 이름은 낱말로 가장 가까운 주제에 합침 (위에서부터 먼저 맞는 것)
const THEME_WORDS = [
  ["식당·카페", ["식당", "카페", "음식", "주문", "레스토랑", "타파스", "맛집", "음료", "술", "메뉴"]],
  ["쇼핑·결제", ["쇼핑", "결제", "계산", "가격", "시장", "환전", "돈", "구매"]],
  ["호텔", ["호텔", "숙소", "숙박", "체크인", "체크아웃"]],
  ["교통", ["교통", "공항", "기차", "버스", "택시", "지하철", "비행", "렌터카", "이동"]],
  ["길찾기", ["길", "위치", "방향"]],
  ["관광·사진", ["관광", "사진", "박물관", "투어", "입장", "구경", "명소"]],
  ["긴급·건강", ["긴급", "건강", "병원", "약국", "아파", "분실", "경찰", "응급", "알레르기"]],
  ["인사·예절", ["인사", "예절", "감사", "사과", "소개", "실례"]],
  ["운동", ["운동", "헬스", "스포츠", "체육", "요가", "러닝"]],
  ["일상", ["일상", "생활", "날씨", "집", "회사", "업무"]],
  ["감정·대화", ["감정", "대화", "기분", "잡담", "수다"]],
];
const THEME_EMOJI = {
  "인사·예절": "👋", "식당·카페": "🍽️", "쇼핑·결제": "🛍️", "호텔": "🏨", "교통": "🚆", "길찾기": "🧭",
  "관광·사진": "📸", "긴급·건강": "🚑", "일상": "🏠", "운동": "🏋️", "감정·대화": "💬", "기타": "📦",
};
function normTheme(name) {
  const s = String(name || "").trim();
  if (!s) return "기타";
  const flat = s.replace(/[\s/·,.]/g, "");
  const exact = THEMES.find(t => t.replace(/·/g, "") === flat);
  if (exact) return exact;
  for (const [t, words] of THEME_WORDS) if (words.some(w => s.includes(w))) return t;
  return "기타";
}

const $ = (s, el = document) => el.querySelector(s);
const view = $("#view");

/* ---------- 저장 ---------- */
function defaults() {
  return {
    settings: { lang: "en", rate: 1, autoPlay: true, newPerDay: 10, topic: "all" },
    progress: {},          // "문장id:언어" → { box, due, last, reps }
    mine: [],              // 내가 가져온 문장
    inbox: [],             // 한국어로 모아 둔 문장 [{ id, ko, at }]
    newLog: { date: "", done: {}, extra: {} },
  };
}
function load() {
  const d = defaults();
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && typeof s === "object") {
      return {
        settings: Object.assign(d.settings, s.settings || {}),
        progress: s.progress || {},
        mine: (Array.isArray(s.mine) ? s.mine : []).map(it => Object.assign({}, it, { theme: normTheme(it.theme) })),
        inbox: Array.isArray(s.inbox) ? s.inbox : [],
        newLog: Object.assign(d.newLog, s.newLog || {}),
      };
    }
  } catch (e) { /* 깨진 저장본이면 새로 시작 */ }
  return d;
}
let state = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast("저장하지 못했어요. 폰 저장 공간을 확인해 주세요."); }
}

/* ---------- 날짜 (로컬 날짜 글자 YYYY-MM-DD) ---------- */
function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(str, n) {
  const [y, m, d] = str.split("-").map(Number);
  return todayStr(new Date(y, m - 1, d + n));
}
function daysBetween(a, b) {
  const p = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  return Math.round((p(b) - p(a)) / 86400000);
}

/* ---------- 도우미 ---------- */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
let toastTimer;
function toast(msg, ms = 2800) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}
function uid() { return Math.random().toString(36).slice(2, 8); }

/* ---------- 문장 묶음 ---------- */
let decks = [];       // [{ id, title, emoji, items }]
let decksLoaded = false;

async function loadDecks() {
  const res = await Promise.all(DECK_FILES.map(f =>
    fetch(`data/${f}.json`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).catch(() => null)
  ));
  decks = res.filter(Boolean).map(d => ({ id: d.id, title: d.title, emoji: d.emoji || "📚", items: d.items || [] }));
  if (res.some(r => !r)) toast("일부 문장 파일을 읽지 못했어요. 인터넷 연결 후 다시 열어 주세요.");
  decksLoaded = true;
  render();
}
function deckList() {
  const list = decks.slice();
  if (state.mine.length) list.push(Object.assign({ items: state.mine }, MINE));
  return list;
}
function allItems() {
  const out = [];
  for (const d of deckList()) for (const it of d.items) out.push(Object.assign({ deck: d.id }, it, { theme: normTheme(it.theme || d.title) }));
  return out;
}
function itemById(id) { return allItems().find(it => it.id === id); }
function hasLang(it, lang) { return it && it[lang] && typeof it[lang].text === "string" && it[lang].text.trim(); }

/* ---------- 음성 듣기 (브라우저 내장, 무료) ---------- */
const canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
let voices = [];
function loadVoices() { try { voices = canSpeak ? speechSynthesis.getVoices() || [] : []; } catch (e) { voices = []; } }
if (canSpeak) {
  loadVoices();
  try { speechSynthesis.addEventListener("voiceschanged", () => { loadVoices(); if (tab === "settings") render(); }); }
  catch (e) { speechSynthesis.onvoiceschanged = loadVoices; }
}
function voiceFor(lang) {
  const want = LANGS[lang].tts.toLowerCase();
  const prefix = want.split("-")[0];
  const norm = v => (v.lang || "").replace("_", "-").toLowerCase();
  return voices.find(v => norm(v) === want)
    || (lang === "zh" && voices.find(v => /^(cmn|zh-hans)/.test(norm(v))))
    || voices.find(v => norm(v).startsWith(prefix + "-") || norm(v) === prefix)
    || null;
}
const warnedNoVoice = {};
function speak(text, lang, rate) {
  if (!canSpeak) { toast("이 브라우저는 음성 듣기를 지원하지 않아요."); return; }
  const v = voiceFor(lang);
  if (!v && voices.length && !warnedNoVoice[lang]) {
    warnedNoVoice[lang] = true;
    toast(`이 폰에 ${LANGS[lang].name} 음성이 없을 수 있어요. 설정 탭의 안내를 봐 주세요.`, 4500);
  }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = v ? v.lang : LANGS[lang].tts;
  if (v) u.voice = v;
  u.rate = rate || state.settings.rate || 1;
  u.onerror = e => {
    if (e && (e.error === "interrupted" || e.error === "canceled")) return;
    toast(`${LANGS[lang].name} 음성을 재생하지 못했어요.`);
  };
  try {
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch (e) { toast("음성을 재생하지 못했어요."); }
}

/* ---------- 문장 표시 ---------- */
// 문장 안에서 청크 부분에 형광펜
function markChunks(text, chunks) {
  const ranges = [];
  const low = text.toLowerCase();
  for (const c of chunks || []) {
    const t = String(c.t || "").replace(/^[¿¡\s]+|[?？!！。.,，、\s]+$/g, "");
    if (!t) continue;
    const i = low.indexOf(t.toLowerCase());
    if (i < 0) continue;
    const r = [i, i + t.length];
    if (!ranges.some(([a, b]) => r[0] < b && a < r[1])) ranges.push(r);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let out = "", pos = 0;
  for (const [a, b] of ranges) { out += esc(text.slice(pos, a)) + "<mark>" + esc(text.slice(a, b)) + "</mark>"; pos = b; }
  return out + esc(text.slice(pos));
}
// 한글 발음: *강세* → 굵게, ¿¡는 뺌
function readHtml(s) {
  return esc(String(s || "").replace(/[¿¡]/g, "")).replace(/\*([^*]+)\*/g, "<b>$1</b>");
}

/* 중국어 병음 + 성조 */
const TONE_MARK = {
  "ā": 1, "á": 2, "ǎ": 3, "à": 4, "ē": 1, "é": 2, "ě": 3, "è": 4, "ī": 1, "í": 2, "ǐ": 3, "ì": 4,
  "ō": 1, "ó": 2, "ǒ": 3, "ò": 4, "ū": 1, "ú": 2, "ǔ": 3, "ù": 4, "ǖ": 1, "ǘ": 2, "ǚ": 3, "ǜ": 4,
};
const TONE_ARROW = { 1: "—", 2: "↗", 3: "↘↗", 4: "↘", 0: "·" };
const SYL_RE = /([a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]+[1-5]?)|([,.?!;:，。？！、；：])/giu;
const HAN_RE = /[㐀-鿿豈-﫿]/;
function toneOf(syl) {
  const s = syl.toLowerCase().normalize("NFC");
  for (const ch of s) if (TONE_MARK[ch]) return TONE_MARK[ch];
  const m = s.match(/([1-4])$/);
  return m ? Number(m[1]) : 0;
}
function parsePinyin(pinyin) {
  const syls = [];
  let clause = 0;
  for (const m of String(pinyin || "").normalize("NFC").matchAll(SYL_RE)) {
    if (m[2]) { clause++; continue; }
    syls.push({ s: m[1], t: toneOf(m[1]), clause });
  }
  return syls;
}
// 실제로 읽는 성조: 不·一 변화, 3성+3성 → 앞은 2성
function spokenTones(syls, hans) {
  const out = syls.map(x => x.t);
  const n = syls.length;
  for (let i = 0; i < n; i++) {
    const next = i + 1 < n && syls[i + 1].clause === syls[i].clause ? syls[i + 1].t : null;
    const ch = hans ? hans[i] : null;
    const low = syls[i].s.toLowerCase();
    const isBu = ch ? ch === "不" : low === "bù";
    const isYi = ch ? ch === "一" : low === "yī";
    if (isBu && next === 4) out[i] = 2;
    if (isYi && next && !(hans && hans[i - 1] === "第")) out[i] = next === 4 ? 2 : 4;
  }
  for (let i = 0; i < n;) {
    if (out[i] !== 3) { i++; continue; }
    let j = i;
    while (j + 1 < n && out[j + 1] === 3 && syls[j + 1].clause === syls[i].clause) j++;
    for (let k = i; k < j; k++) out[k] = 2;
    i = j + 1;
  }
  return out;
}
function zhHtml(text, pinyin, opts = {}) {
  const syls = parsePinyin(pinyin);
  const chars = [...String(text || "")];
  const hans = chars.filter(c => HAN_RE.test(c));
  const aligned = syls.length && syls.length === hans.length;
  const spoken = spokenTones(syls, aligned ? hans : null);
  let changed = false;
  const col = (i) => {
    const t0 = syls[i].t, t = spoken[i];
    const diff = t0 !== t;
    if (diff) changed = true;
    const title = diff ? ` title="원래 ${t0}성 → ${t}성으로 읽어요"` : "";
    return { cls: `t${t}${diff ? " sandhi" : ""}`, title, arrow: TONE_ARROW[t], py: esc(syls[i].s) };
  };
  let html;
  if (aligned) {
    let k = 0;
    html = `<div class="zh">` + chars.map(c => {
      if (HAN_RE.test(c)) {
        const x = col(k++);
        return `<span class="col ${x.cls}"${x.title}><span class="tone">${x.arrow}</span><span class="py">${x.py}</span><span class="hz">${esc(c)}</span></span>`;
      }
      if (/\s/.test(c)) return `<span class="word-gap"></span>`;
      return `<span class="col punct"><span class="tone"></span><span class="py">&nbsp;</span><span class="hz">${esc(c)}</span></span>`;
    }).join("") + `</div>`;
  } else {
    // 병음 글자 수가 한자와 다르면 두 줄로
    html = `<div class="zh-plain"><div class="py-line">` +
      syls.map((s, i) => { const x = col(i); return `<span class="${x.cls}"${x.title}>${x.py}<sup>${x.arrow}</sup></span>`; }).join(" ") +
      `</div><div class="sent">${esc(text)}</div></div>`;
  }
  if (changed && opts.legend !== false) html += `<div class="legend">점선 밑줄 = 앞뒤 글자 때문에 성조가 바뀌어 읽히는 글자 (화살표·색은 실제 소리)</div>`;
  return html;
}

function sentenceHtml(lang, d, opts = {}) {
  if (!d) return "";
  if (lang === "zh") return zhHtml(d.text, d.pinyin, opts);
  let h = `<div class="sent">${opts.mark === false ? esc(d.text) : markChunks(d.text, d.chunks)}</div>`;
  if (d.read && (lang === "ja" || lang === "es")) h += `<div class="read">${readHtml(d.read)}</div>`;
  return h;
}
function chunkHtml(lang, c) {
  let sub = "";
  if (lang === "zh" && c.pinyin) sub = `<div class="cr">${zhPlainPinyin(c.pinyin)}</div>`;
  else if (c.read) sub = `<div class="cr">${readHtml(c.read)}</div>`;
  return `<button class="chunk" data-act="say" data-lang="${lang}" data-text="${esc(c.t)}">
    <div><div class="ct">${esc(c.t)}</div>${sub}<div class="ck">${esc(c.ko || "")}</div></div><span class="spk">🔊</span></button>`;
}
function zhPlainPinyin(p) {
  const syls = parsePinyin(p);
  const sp = spokenTones(syls, null);
  return syls.map((s, i) => `<span class="t${sp[i]}">${esc(s.s)}</span>`).join(" ");
}
function playRow(lang, text) {
  const r = state.settings.rate;
  return `<div class="play-row">
    <button class="play" data-act="say" data-lang="${lang}" data-text="${esc(text)}">▶ 듣기</button>
    <button class="rate" data-act="rate">${r < 1 ? "🐢 0.75배" : "1.0배"}</button>
  </div>`;
}

/* ---------- 간격 반복 ---------- */
function pkey(id, lang) { return `${id}:${lang}`; }
function nextBox(box, g) {
  if (g === "again") return 0;
  if (g === "hard") return box <= 2 ? 2 : box - 1;
  return Math.min(BOX_DAYS.length - 1, Math.max(3, box + 1));
}
function dayLabel(n) { return n === 0 ? "오늘" : `${n}일 뒤`; }
function rollNewLog() {
  const t = todayStr();
  if (state.newLog.date !== t) state.newLog = { date: t, done: {}, extra: {} };
}
function newAllowance(lang) {
  rollNewLog();
  return Math.max(0, state.settings.newPerDay + (state.newLog.extra[lang] || 0) - (state.newLog.done[lang] || 0));
}
function deckFilter(it) { return state.settings.topic === "all" || it.theme === state.settings.topic; }
function themeLabel(it) { return `${THEME_EMOJI[it.theme] || "📦"} ${esc(it.theme)}${it.deck === "mine" ? " · ✍️" : ""}`; }

let session = null;
function buildSession() {
  const lang = state.settings.lang, t = todayStr();
  const items = allItems().filter(it => deckFilter(it) && hasLang(it, lang));
  const due = [], fresh = [];
  for (const it of items) {
    const p = state.progress[pkey(it.id, lang)];
    if (!p) fresh.push(it.id);
    else if (p.due <= t) due.push([p.due, it.id]);
  }
  due.sort((a, b) => a[0] < b[0] ? -1 : 1);
  const newIds = fresh.slice(0, newAllowance(lang));
  session = {
    lang, topic: state.settings.topic, date: t,
    queue: due.map(x => x[1]).concat(newIds),
    newIds: new Set(newIds),
    idx: 0, flipped: false,
    dueCount: due.length, freshLeft: fresh.length - newIds.length,
    stats: { again: 0, hard: 0, good: 0 },
  };
}
function needSession() {
  return !session || session.lang !== state.settings.lang || session.topic !== state.settings.topic || session.date !== todayStr();
}
function grade(g) {
  const s = session, id = s.queue[s.idx], lang = s.lang;
  const k = pkey(id, lang);
  const before = state.progress[k];
  const box = nextBox(before ? before.box : 0, g);
  const t = todayStr();
  state.progress[k] = { box, due: addDays(t, BOX_DAYS[box]), last: t, reps: (before ? before.reps : 0) + 1 };
  if (!before) { rollNewLog(); state.newLog.done[lang] = (state.newLog.done[lang] || 0) + 1; }
  s.stats[g]++;
  if (g === "again") s.queue.splice(Math.min(s.idx + 4, s.queue.length), 0, id); // 이번 공부 안에 한 번 더
  s.idx++;
  s.flipped = false;
  save();
  render();
}

/* ---------- 화면 ---------- */
let tab = "study";
let cmpQuery = "", cmpLimit = 30;
let pending = null; // 검사한 가져오기 결과
let mineOpen = false, mineQuery = "";
let timerHandle;

function render() {
  clearTimeout(timerHandle);
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  renderLangBar();
  if (!decksLoaded) { view.innerHTML = `<div class="empty">불러오는 중…</div>`; return; }
  if (tab === "study") renderStudy();
  else if (tab === "compare") renderCompare();
  else if (tab === "inbox") renderInbox();
  else renderSettings();
}
function renderLangBar() {
  const bar = $("#langBar");
  bar.classList.toggle("hide", tab !== "study");
  bar.innerHTML = LANG_ORDER.map(l =>
    `<button role="tab" data-lang="${l}" aria-selected="${state.settings.lang === l}">${LANGS[l].flag} ${LANGS[l].name}</button>`).join("");
}
// 주제 칩: 이 언어로 볼 수 있는 문장이 있는 주제만, 개수와 함께
function deckChips(lang) {
  const items = allItems().filter(it => !lang || hasLang(it, lang));
  const counts = {};
  for (const it of items) counts[it.theme] = (counts[it.theme] || 0) + 1;
  const topic = state.settings.topic;
  if (topic !== "all" && !counts[topic]) state.settings.topic = "all";
  const chip = (id, label, n) =>
    `<button data-act="deck" data-id="${esc(id)}" class="${state.settings.topic === id ? "on" : ""}">${label} <span class="n">${n}</span></button>`;
  return `<div class="chips">` + chip("all", "전체", items.length) +
    THEMES.filter(t => counts[t]).map(t => chip(t, `${THEME_EMOJI[t]} ${esc(t)}`, counts[t])).join("") + `</div>`;
}

function renderStudy() {
  if (needSession()) buildSession();
  const s = session, lang = s.lang, L = LANGS[lang];
  let id = s.queue[s.idx], it = id && itemById(id);
  while (id && !hasLang(it, lang)) { s.idx++; id = s.queue[s.idx]; it = id && itemById(id); } // 지워진 문장 건너뛰기
  const left = s.queue.length - s.idx;
  let html = deckChips(lang) + `<div class="study-head"><span class="muted">${L.flag} ${L.name} · 남은 카드 ${left}</span><span class="muted small">복습 ${s.dueCount} · 새 ${s.newIds.size}</span></div>`;

  if (!it) {
    html += doneHtml();
    view.innerHTML = html;
    return;
  }
  const d = it[lang];
  const p = state.progress[pkey(it.id, lang)];
  const box = p ? p.box : 0;
  html += `<div class="card flash" ${s.flipped ? "" : `data-act="flip"`}>
    <div class="theme">${themeLabel(it)}${s.newIds.has(it.id) && !p ? " · 새 문장" : ""}</div>
    <div class="ko">${esc(it.ko)}</div>`;
  if (!s.flipped) {
    html += `<div class="timer run"><i></i></div><div class="tap-hint" id="hint">3초 안에 ${L.name}로 말해 보세요</div>`;
  } else {
    html += `<div class="answer">${sentenceHtml(lang, d)}${playRow(lang, d.text)}
      ${(d.chunks || []).length ? `<div class="chunks">${d.chunks.map(c => chunkHtml(lang, c)).join("")}</div>` : ""}</div>`;
  }
  html += `</div>`;
  if (s.flipped) {
    const g = k => dayLabel(BOX_DAYS[nextBox(box, k)]);
    html += `<div class="grade">
      <button class="again" data-act="grade" data-g="again">🔄 다시<small>${g("again")}</small></button>
      <button class="hard" data-act="grade" data-g="hard">🤔 애매함<small>${g("hard")}</small></button>
      <button class="good" data-act="grade" data-g="good">💡 마스터<small>${g("good")}</small></button></div>`;
  }
  view.innerHTML = html;
  if (!s.flipped) {
    timerHandle = setTimeout(() => {
      const h = $("#hint");
      if (h) { h.textContent = "탭해서 정답 보기"; h.classList.add("go"); }
    }, 3000);
  }
}
function doneHtml() {
  const s = session, lang = s.lang, t = todayStr();
  const n = s.stats.again + s.stats.hard + s.stats.good;
  const items = allItems().filter(it => deckFilter(it) && hasLang(it, lang));
  if (!items.length) {
    return `<div class="empty"><b>📭</b>이 주제에는 ${LANGS[lang].name} 문장이 없어요.</div>`;
  }
  let next = null;
  for (const it of items) {
    const p = state.progress[pkey(it.id, lang)];
    if (p && p.due > t && (!next || p.due < next)) next = p.due;
  }
  let h = `<div class="card empty"><b>${n ? "🎉" : "☕"}</b>${n ? `오늘 공부 끝! ${n}장 했어요.` : "지금 볼 카드가 없어요."}`;
  if (n) h += `<div class="small" style="margin-top:6px">다시 ${s.stats.again} · 애매함 ${s.stats.hard} · 마스터 ${s.stats.good}</div>`;
  if (next) h += `<div class="small" style="margin-top:6px">다음 복습: ${dayLabel(daysBetween(t, next))}</div>`;
  h += `</div>`;
  if (s.freshLeft > 0) h += `<button class="btn primary wide" data-act="more-new">새 문장 10개 더 하기 (남은 ${s.freshLeft}개)</button>`;
  return h;
}

function renderCompare() {
  const q = cmpQuery.trim().toLowerCase();
  const items = allItems().filter(it => deckFilter(it) && (!q || JSON.stringify(it).toLowerCase().includes(q)));
  let html = deckChips() + `<input class="search" id="cmpSearch" type="search" placeholder="한국어·외국어로 찾기" value="${esc(cmpQuery)}">`;
  if (!items.length) html += `<div class="empty"><b>🔍</b>찾는 문장이 없어요.</div>`;
  html += items.slice(0, cmpLimit).map(it => `<div class="card cmp"><div class="theme muted small">${themeLabel(it)}</div>
    <div class="ko">${esc(it.ko)}</div>` +
    LANG_ORDER.filter(l => hasLang(it, l)).map(l => `<div class="cmp-lang"><div class="flag">${LANGS[l].flag}</div>
      <div class="body">${sentenceHtml(l, it[l], { mark: false, legend: false })}</div>
      <button class="spk" data-act="say" data-lang="${l}" data-text="${esc(it[l].text)}" aria-label="${LANGS[l].name} 듣기">🔊</button></div>`).join("") +
    `</div>`).join("");
  if (items.length > cmpLimit) html += `<button class="btn wide" data-act="cmp-more">더 보기 (${items.length - cmpLimit}개)</button>`;
  view.innerHTML = html;
}

/* ---------- 수집함 · 가져오기 ---------- */
const GEMINI_RULES = `아래 한국어 문장들을 LanguageStudy 앱 형식의 JSON 배열로 바꿔 줘.
설명 없이 JSON 코드블록 하나만 답해 줘.

[형식]
[
  {
    "id": "my-YYMMDD-01",
    "theme": "아래 주제 목록 중 하나",
    "ko": "한국어 문장",
    "en": { "text": "...", "chunks": [{ "t": "...", "ko": "..." }] },
    "ja": { "text": "...", "read": "한글 발음", "chunks": [{ "t": "...", "read": "...", "ko": "..." }] },
    "zh": { "text": "...", "pinyin": "...", "chunks": [{ "t": "...", "pinyin": "...", "ko": "..." }] },
    "es": { "text": "...", "read": "한글 발음", "chunks": [{ "t": "...", "read": "...", "ko": "..." }] }
  }
]

[규칙]
- id: "my-" + 오늘 날짜(YYMMDD) + "-" + 두 자리 번호. 한 번 정한 id는 바꾸지 않음.
- theme: 다음 12개 중 하나를 글자 그대로 (새 이름 만들지 말 것): ${THEMES.join(" / ")}
- 교과서체가 아닌 원어민이 실제로 쓰는 자연스러운 구어체. 친구 사이는 반말 톤, 가게·호텔은 정중한 톤.
- chunks: 언어마다 2~3개, 통째로 외울 2~4단어 덩어리. "ko"는 쓰임새가 보이는 풀이.
- 일본어 read: 한글 발음. 장음은 "-" (예: 쿄-), 촉음(っ)은 받침 ㅅ 또는 다음 자음 겹침.
- 중국어 pinyin: 성조 부호(ā á ǎ à), 음절마다 띄어쓰기, 문장부호는 원문과 같은 자리에. 성조는 사전의 원래 성조로 적기 (3성+3성, 不, 一 변화는 앱이 자동 표시하므로 바꾸지 말 것). 경성은 부호 없이. 哪里·这里·那里·行李·房间里의 里/李도 경성 li (nǎ li, xíng li). 중국어 문장에는 영어(Wi-Fi 등)를 넣지 않기.
- 스페인어 read: 한글 발음, 강세 음절 전체를 *별표*로 감싸기 (예: 그라*시아*스, 데스*뿌에스*, cuánto = *꽌*또).
- 남녀에 따라 말이 달라지면 (listo/lista, alérgico/alérgica 등) 원문은 남자 형태, 그 청크 "ko" 끝에 "— 남자 말투 (여자: lista *리스*따)"처럼 적기. ¿ ¡ 는 read에 넣지 않음. 원문의 ¿ ¡ á é í ó ú ñ 는 정확히.
- 마지막에 한 줄로: 표현이나 발음이 애매했던 곳을 알려 줘.

[문장]`;

function geminiPrompt() {
  return GEMINI_RULES + "\n" + state.inbox.map((x, i) => `${i + 1}. ${x.ko}`).join("\n");
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
    ta.remove();
    return ok;
  }
}

function hanCount(s) { return [...String(s || "")].filter(c => HAN_RE.test(c)).length; }
function starsOdd(s) { return ((String(s || "").match(/\*/g) || []).length) % 2 === 1; }
function str(v) { return typeof v === "string" ? v.trim() : ""; }

function checkImport(raw) {
  const errors = [], warns = [];
  let text = String(raw || "").trim();
  const a = text.search(/[\[{]/), b = Math.max(text.lastIndexOf("]"), text.lastIndexOf("}"));
  if (a < 0 || b < a) return { items: [], errors: ["JSON을 찾지 못했어요. Gemini 답의 코드블록을 통째로 붙여 넣어 주세요."], warns };
  let data;
  try { data = JSON.parse(text.slice(a, b + 1)); }
  catch (e) { return { items: [], errors: ["JSON 모양이 깨졌어요 (쉼표·따옴표 확인). Gemini에게 다시 받아 오는 게 가장 쉬워요."], warns }; }
  if (data && !Array.isArray(data) && Array.isArray(data.items)) data = data.items;
  if (!Array.isArray(data)) data = [data];

  const builtIn = new Set(decks.flatMap(d => d.items.map(it => it.id)));
  const mineIds = new Set(state.mine.map(it => it.id));
  const builtInKo = new Set(decks.flatMap(d => d.items.map(it => koKey(it.ko))));
  const dups = {};
  const seen = new Set();
  const items = [];
  data.forEach((it, i) => {
    const n = `${i + 1}번`;
    if (!it || typeof it !== "object") { errors.push(`${n}: 문장 모양이 아니에요.`); return; }
    const ko = str(it.ko);
    if (!ko) { errors.push(`${n}: 한국어(ko)가 없어요.`); return; }
    let id = str(it.id) || `my-${todayStr().slice(2).replace(/-/g, "")}-${uid()}`;
    if (seen.has(id)) { errors.push(`${n}: id "${id}"가 이번 묶음 안에서 겹쳐요.`); return; }
    if (builtIn.has(id)) { errors.push(`${n}: id "${id}"가 기본 문장과 겹쳐요.`); return; }
    seen.add(id);
    const clean = { id, ko, theme: normTheme(it.theme) };
    let langs = 0;
    for (const l of LANG_ORDER) {
      const d = it[l];
      if (!d || !str(d.text)) continue;
      langs++;
      const o = { text: str(d.text) };
      if (l === "ja" || l === "es") { o.read = str(d.read); if (!o.read) warns.push(`${n} ${LANGS[l].name}: 한글 발음(read)이 없어요.`); }
      if (l === "es" && starsOdd(o.read)) warns.push(`${n} 스페인어: 강세 *별표* 짝이 안 맞아요.`);
      if (l === "zh") {
        o.pinyin = str(d.pinyin);
        if (!o.pinyin) warns.push(`${n} 중국어: 병음(pinyin)이 없어요.`);
        else {
          const syls = parsePinyin(o.pinyin), hc = hanCount(o.text);
          if (syls.length !== hc) warns.push(`${n} 중국어: 병음 ${syls.length}개, 한자 ${hc}개로 수가 달라요 (두 줄로 표시돼요).`);
          if (syls.length && syls.every(s => s.t === 0)) warns.push(`${n} 중국어: 병음에 성조 부호가 없어요.`);
        }
      }
      o.chunks = (Array.isArray(d.chunks) ? d.chunks : []).filter(c => c && str(c.t)).map(c => {
        const cc = { t: str(c.t), ko: str(c.ko) };
        if (str(c.read)) cc.read = str(c.read);
        if (str(c.pinyin)) cc.pinyin = str(c.pinyin);
        if (l === "es" && starsOdd(cc.read)) warns.push(`${n} 스페인어 청크 "${cc.t}": *별표* 짝이 안 맞아요.`);
        return cc;
      });
      clean[l] = o;
    }
    if (!langs) { errors.push(`${n}: 외국어 문장(text)이 하나도 없어요.`); return; }
    if (mineIds.has(id)) warns.push(`${n}: 같은 id의 내 문장을 새 내용으로 바꿔요 (복습 기록은 유지).`);
    else {
      // id는 다른데 한국어가 같은 문장 → 고친 문장인지 사용자가 고름 (기본: 바꾸기)
      const k = koKey(ko);
      const old = state.mine.find(m => koKey(m.ko) === k);
      if (old) dups[items.length] = { of: old.id, mode: "replace" };
      else if (builtInKo.has(k)) warns.push(`${n}: 기본 문장에 같은 한국어 문장이 있어요 (따로 추가돼요).`);
    }
    items.push(clean);
  });
  return { items, errors, warns, dups };
}
function koKey(s) { return String(s || "").replace(/[\s.,!?！？。、~…·'"“”‘’]/g, ""); }
function saveImport() {
  if (!pending || !pending.items.length) return;
  const kos = new Set();
  let replaced = 0;
  pending.items.forEach((it, idx) => {
    const d = pending.dups && pending.dups[idx];
    if (d && d.mode === "replace") { it.id = d.of; replaced++; } // 예전 id를 이어받아 복습 기록 유지
    const i = state.mine.findIndex(m => m.id === it.id);
    if (i >= 0) state.mine[i] = it; else state.mine.push(it);
    kos.add(it.ko.replace(/\s+/g, ""));
  });
  const before = state.inbox.length;
  state.inbox = state.inbox.filter(x => !kos.has(x.ko.replace(/\s+/g, "")));
  const removed = before - state.inbox.length;
  const n = pending.items.length;
  pending = null;
  session = null;
  save();
  toast(`문장 ${n}개를 저장했어요.${replaced ? ` (그중 ${replaced}개는 예전 문장을 바꿈)` : ""}${removed ? ` 수집함에서 ${removed}개를 지웠어요.` : ""}`);
  render();
}

function renderInbox() {
  let html = `<h2>📥 문장 수집함</h2><div class="card">
    <div class="muted small" style="margin-bottom:8px">"이 말 외국어로 뭐지?" 싶은 순간 한국어로 적어 두세요. 모이면 Gemini에게 보낼 글을 한 번에 복사해요.</div>
    <form class="add-row" id="inboxForm"><input id="inboxInput" placeholder="예: 체크아웃 1시간만 늦출 수 있을까요?" autocomplete="off" enterkeyhint="done">
    <button class="btn primary" type="submit">추가</button></form>
    <div style="margin-top:8px">${state.inbox.map((x, i) => `<div class="inbox-item"><span>${esc(x.ko)}</span><button class="x" data-act="inbox-del" data-i="${i}" aria-label="지우기">✕</button></div>`).join("")}</div>
    <button class="btn wide" style="margin-top:10px" data-act="copy-prompt" ${state.inbox.length ? "" : "disabled"}>📋 Gemini에게 보낼 글 복사 (${state.inbox.length}개)</button>
  </div>`;

  html += `<h2>📦 문장 가져오기</h2><div class="card">
    <div class="muted small" style="margin-bottom:8px">Gemini 답(JSON)을 그대로 붙여 넣고 검사하세요. 문장은 이 폰에만 저장돼요.</div>
    <textarea id="importText" placeholder="여기에 붙여 넣기">${esc(pending ? pending.raw : "")}</textarea>
    <button class="btn primary wide" style="margin-top:8px" data-act="check-import">검사하기</button>`;
  if (pending) {
    const { items, errors, warns } = pending;
    html += `<div style="margin-top:12px"><b>${items.length}개 문장을 저장할 수 있어요.</b>`;
    if (errors.length || warns.length) html += `<ul class="check-list">${errors.map(e => `<li class="bad">❌ ${esc(e)}</li>`).join("")}${warns.map(w => `<li class="warn">⚠️ ${esc(w)}</li>`).join("")}</ul>`;
    if (items.length) {
      const dups = pending.dups || {};
      const nd = Object.keys(dups).length;
      if (nd) html += `<div class="dup-note">🔁 이미 있는 한국어 문장이 ${nd}개 있어요 (번호만 달라요). 고친 문장이면 '예전 것 바꾸기', 다른 표현으로 하나 더 두려면 '따로 추가'를 고르세요.</div>`;
      html += `<ul class="check-list">${items.map((it, i) => `<li>${esc(it.ko)} <span class="muted">· ${esc(it.theme)} ${LANG_ORDER.filter(l => it[l]).map(l => LANGS[l].flag).join("")}</span>` +
        (dups[i] ? `<div class="dup-pick">
          <label><input type="radio" name="dup-${i}" value="replace" ${dups[i].mode === "replace" ? "checked" : ""}> 예전 것 바꾸기</label>
          <label><input type="radio" name="dup-${i}" value="add" ${dups[i].mode === "add" ? "checked" : ""}> 따로 추가</label></div>` : "") +
        `</li>`).join("")}</ul>
        <button class="btn primary wide" data-act="save-import">저장하기</button>`;
    }
    html += `</div>`;
  }
  html += `</div>`;

  if (state.mine.length) {
    html += `<button class="fold" data-act="mine-toggle" aria-expanded="${mineOpen}">
      <span>✍️ 내 문장 ${state.mine.length}개</span><span>${mineOpen ? "▾ 접기" : "▸ 펼치기"}</span></button>`;
    if (mineOpen) {
      const q = mineQuery.trim().toLowerCase();
      const list = state.mine.filter(it => !q || JSON.stringify(it).toLowerCase().includes(q));
      html += `<input class="search" id="mineSearch" type="search" placeholder="내 문장에서 찾기" value="${esc(mineQuery)}">`;
      if (!list.length) html += `<div class="empty"><b>🔍</b>찾는 문장이 없어요.</div>`;
      for (const t of THEMES) {
        const g = list.filter(it => normTheme(it.theme) === t);
        if (!g.length) continue;
        html += `<div class="card"><div class="group-title">${THEME_EMOJI[t]} ${esc(t)} <span class="muted">${g.length}</span></div>${g.map(it =>
          `<div class="inbox-item"><span>${esc(it.ko)}</span><button class="x" data-act="mine-del" data-id="${esc(it.id)}" aria-label="지우기">✕</button></div>`).join("")}</div>`;
      }
    }
  }
  view.innerHTML = html;
}

/* ---------- 설정 ---------- */
function renderSettings() {
  const s = state.settings;
  const voiceRows = LANG_ORDER.map(l => {
    const v = voiceFor(l);
    const st = !canSpeak ? `<span class="no">지원 안 함</span>` : v ? `<span class="ok">있음</span>` : voices.length ? `<span class="no">없음</span>` : `<span class="muted">확인 중</span>`;
    return `<div class="voice-row"><span>${LANGS[l].flag} ${LANGS[l].name} ${st}</span>
      <button class="btn" data-act="say" data-lang="${l}" data-text="${esc(SAMPLE[l])}">▶ 시험</button></div>`;
  }).join("");
  view.innerHTML = `<h2>🔊 듣기</h2><div class="card">
    <div class="row"><button class="btn ${s.rate === 1 ? "primary" : ""}" data-act="set-rate" data-r="1">1.0배</button>
    <button class="btn ${s.rate < 1 ? "primary" : ""}" data-act="set-rate" data-r="0.75">🐢 0.75배</button></div>
    <label class="row" style="margin-top:12px"><input type="checkbox" id="autoPlay" ${s.autoPlay ? "checked" : ""}> 정답을 볼 때 자동으로 듣기</label>
  </div>
  <h2>🗣️ 이 폰의 음성</h2><div class="card">${voiceRows}
    <div class="muted small" style="margin-top:8px">음성이 "없음"이면:<br>
    · 안드로이드: 설정 → 일반(시스템) → 언어 및 입력 → 텍스트 음성 변환 → Google 음성 엔진 ⚙ → 음성 데이터 설치<br>
    · 아이폰: 설정 → 손쉬운 사용 → 콘텐츠 말하기 → 음성</div></div>
  <h2>🃏 공부</h2><div class="card">
    <label class="row">하루 새 문장 <select id="newPerDay">${[5, 10, 15, 20, 30].map(n => `<option ${n === s.newPerDay ? "selected" : ""}>${n}</option>`).join("")}</select> 개</label>
  </div>
  <h2>💾 백업</h2><div class="card">
    <div class="muted small" style="margin-bottom:8px">내 문장·수집함·복습 기록을 파일로 저장해요. 폰을 바꾸거나 앱을 지우기 전에 꼭 내보내 두세요.</div>
    <div class="row"><button class="btn" data-act="export">⬇️ 내보내기</button><button class="btn" data-act="import">⬆️ 가져오기</button></div>
    <button class="btn wide" style="margin-top:12px;color:var(--again)" data-act="reset">복습 기록 초기화</button>
  </div>
  <p class="muted small" style="text-align:center">LanguageStudy · 문장 ${allItems().length}개</p>`;
}
const SAMPLE = { en: "Nice to meet you.", ja: "はじめまして。", zh: "你好，很高兴认识你。", es: "Mucho gusto." };

function exportBackup() {
  const data = { type: "languagestudy-backup", v: 1, at: new Date().toISOString(), mine: state.mine, inbox: state.inbox, progress: state.progress, settings: state.settings };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `LanguageStudy_백업_${todayStr()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
$("#filePicker").addEventListener("change", async e => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d || d.type !== "languagestudy-backup") throw new Error("type");
    if (!confirm("지금 기록을 이 백업 파일 내용으로 바꿀까요?")) return;
    const base = defaults();
    state = {
      settings: Object.assign(base.settings, d.settings || {}),
      progress: d.progress || {}, inbox: d.inbox || [], newLog: base.newLog,
      mine: (d.mine || []).map(it => Object.assign({}, it, { theme: normTheme(it.theme) })),
    };
    session = null;
    save();
    toast("백업을 가져왔어요.");
    render();
  } catch (err) { toast("LanguageStudy 백업 파일이 아니에요."); }
});

/* ---------- 이벤트 ---------- */
view.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "say") { e.stopPropagation(); speak(b.dataset.text, b.dataset.lang); return; }
  if (act === "flip") {
    session.flipped = true;
    render();
    const it = itemById(session.queue[session.idx]);
    if (state.settings.autoPlay && it) speak(it[session.lang].text, session.lang);
    return;
  }
  if (act === "grade") return grade(b.dataset.g);
  if (act === "rate") { state.settings.rate = state.settings.rate < 1 ? 1 : 0.75; save(); render(); return; }
  if (act === "deck") { state.settings.topic = b.dataset.id; cmpLimit = 30; save(); render(); return; }
  if (act === "more-new") { rollNewLog(); const l = state.settings.lang; state.newLog.extra[l] = (state.newLog.extra[l] || 0) + 10; save(); session = null; render(); return; }
  if (act === "cmp-more") { cmpLimit += 30; render(); return; }
  if (act === "inbox-del") { state.inbox.splice(Number(b.dataset.i), 1); save(); render(); return; }
  if (act === "copy-prompt") { toast(await copyText(geminiPrompt()) ? "복사했어요. Gemini 채팅에 붙여 넣으세요." : "복사하지 못했어요."); return; }
  if (act === "check-import") {
    const raw = $("#importText").value;
    pending = Object.assign(checkImport(raw), { raw });
    render();
    return;
  }
  if (act === "save-import") return saveImport();
  if (act === "mine-toggle") { mineOpen = !mineOpen; render(); return; }
  if (act === "mine-del") {
    const it = state.mine.find(m => m.id === b.dataset.id);
    if (!it || !confirm(`"${it.ko}" 문장을 지울까요?`)) return;
    state.mine = state.mine.filter(m => m.id !== it.id);
    for (const l of LANG_ORDER) delete state.progress[pkey(it.id, l)];
    session = null; save(); render(); return;
  }
  if (act === "set-rate") { state.settings.rate = Number(b.dataset.r); save(); render(); return; }
  if (act === "export") return exportBackup();
  if (act === "import") { $("#filePicker").click(); return; }
  if (act === "reset") {
    if (!confirm("복습 기록을 모두 지울까요? 문장은 남아요.")) return;
    state.progress = {}; state.newLog = defaults().newLog; session = null; save(); render(); toast("복습 기록을 지웠어요.");
  }
});
view.addEventListener("submit", e => {
  if (e.target.id !== "inboxForm") return;
  e.preventDefault();
  const inp = $("#inboxInput");
  const ko = inp.value.trim();
  if (!ko) return;
  state.inbox.push({ id: uid(), ko, at: todayStr() });
  save();
  render();
  const again = $("#inboxInput");
  if (again) again.focus();
});
view.addEventListener("input", e => {
  const id = e.target.id;
  if (id === "cmpSearch" || id === "mineSearch") {
    if (id === "cmpSearch") { cmpQuery = e.target.value; cmpLimit = 30; } else mineQuery = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const s = $("#" + id); if (s) { s.focus(); try { s.setSelectionRange(pos, pos); } catch (err) { /* type=search */ } }
  }
});
view.addEventListener("change", e => {
  if (e.target.id === "autoPlay") { state.settings.autoPlay = e.target.checked; save(); }
  if (e.target.name && e.target.name.startsWith("dup-") && pending && pending.dups) {
    const d = pending.dups[Number(e.target.name.slice(4))];
    if (d) d.mode = e.target.value;
  }
  if (e.target.id === "newPerDay") { state.settings.newPerDay = Number(e.target.value); session = null; save(); }
});
$("#langBar").addEventListener("click", e => {
  const b = e.target.closest("[data-lang]");
  if (!b) return;
  state.settings.lang = b.dataset.lang;
  save();
  render();
});
document.querySelector(".tabs").addEventListener("click", e => {
  const b = e.target.closest("[data-tab]");
  if (!b) return;
  tab = b.dataset.tab;
  render();
  window.scrollTo(0, 0);
});
// 컴퓨터에서: 스페이스 = 뒤집기, 1·2·3 = 다시·애매함·마스터
document.addEventListener("keydown", e => {
  if (tab !== "study" || !session || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if (!session.flipped && (e.key === " " || e.key === "Enter")) { e.preventDefault(); const f = $("[data-act=flip]"); if (f) f.click(); }
  else if (session.flipped && ["1", "2", "3"].includes(e.key)) grade(["again", "hard", "good"][Number(e.key) - 1]);
});
// 날짜가 바뀐 채로 앱을 다시 열면 오늘 카드로
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && tab === "study" && session && session.date !== todayStr()) render();
  if (document.visibilityState === "hidden" && canSpeak) { try { speechSynthesis.cancel(); } catch (e) { /* 무시 */ } }
});

/* ---------- 시작 ---------- */
render();
loadDecks();
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
