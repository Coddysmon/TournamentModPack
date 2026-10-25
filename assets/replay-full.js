/* ---------------------------------------------------------------------------
   Повтор партии Nova по сейвам — полное состояние каждого хода.

   ДАННЫЕ: data/replay-full-source.json → { base, dict, stats? }:
     <base>f/index.json        список пакетов { matches:[{key, file, steps, players, …}] }
     <base>f/<ключ>.json.gz    пакет партии (tools/fullsave/pack.py): начальное состояние s0 и
                               дельты d по ходам; сжат gzip — распаковываем сами (DecompressionStream).
     <dict>                    словарь сайта (названия юнитов, зданий, иконки) — тот же, что у replay.html.
   Адрес: #m=<ключ>&t=<ход>&v=<слот игрока, чьими глазами>.

   Ход в пакете — состояние ПОСЛЕ хода (сейв AutoSave_Post_NNNN). Шаг -1 — старт партии.
   Журнал DLL только дополняет: бои 118 (cmb) рисуются вспышками, если они есть.
   --------------------------------------------------------------------------- */
(() => {
"use strict";
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pl = (n, f) => n + " " + f[(n % 10 === 1 && n % 100 !== 11) ? 0 :
                                (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 1 : 2];

// ---------------------------------------------------------------- словарь
let NAMES = {}, ICONS = {};
const SHEETS = {};
const NM = {};            // вид → Map(ключ типа → русское имя)
function initDict(names, icons, iconBase) {
  NAMES = names || {}; ICONS = icons || {};
  for (const kind of ["unit", "bld", "tech", "imp", "res", "feat"]) {
    NM[kind] = new Map();
    for (const id in (NAMES[kind] || {})) NM[kind].set(NAMES[kind][id].k, NAMES[kind][id].n);
  }
  for (const kind of ["imp", "res"]) {
    const m = ICONS[kind] && ICONS[kind].map;
    if (m) for (const k in m) if (m[k].ru) NM[kind].set(k, m[k].ru);
  }
  for (const slot of ["imp", "res", "unit"]) {
    const s = ICONS[slot];
    if (!s || !s.png) continue;
    const img = new Image();
    img.onload = () => { if (slot === "unit") sprites.clear(); if (PK) { drawMap(); unitsDraw(); } };
    img.src = /^data:/.test(s.png) ? s.png : new URL(s.png, iconBase || location.href).href;
    SHEETS[slot] = img;
  }
}
const PFX = { unit: "UNIT_", bld: "BUILDING_", tech: "TECH_", imp: "IMPROVEMENT_", res: "RESOURCE_", feat: "FEATURE_" };
const prettify = s => { s = String(s || "").replace(/_/g, " ").toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };
function typeName(kind, short) {
  if (!short) return "";
  const m = NM[kind];
  const k = PFX[kind] + short;
  if (m && m.has(k)) return m.get(k);
  const base = String(short).replace(/_SKIN\d+$/, "");            // облики юнитов (подписка) — тот же юнит
  if (m && m.has(PFX[kind] + base)) return m.get(PFX[kind] + base);
  return prettify(base);
}
const unitIconKey = short => {
  const m = ICONS.unit && ICONS.unit.map;
  if (!m) return null;
  return m["UNIT_" + short] || m["UNIT_" + String(short).replace(/_SKIN\d+$/, "")] || null;
};

// Цвета и русские названия держав — по типу цивилизации (в сейве нет игровой палитры в удобном виде).
const CIV = {
  SONGHAI:["#c75b2a","Сонгай"], GERMANY:["#9aa6b2","Германия"], SWEDEN:["#4f8fd9","Швеция"], DENMARK:["#d94f4f","Дания"],
  INCA:["#d9c04f","Инки"], SPAIN:["#d98f41","Испания"], RUSSIA:["#c9a227","Россия"], AMERICA:["#4f6fd9","Америка"],
  ENGLAND:["#b23a3a","Англия"], FRANCE:["#5a7fd9","Франция"], CHINA:["#2fa36b","Китай"], INDIA:["#e08a5a","Индия"],
  JAPAN:["#dcdcdc","Япония"], ARABIA:["#2f8f5a","Аравия"], AZTEC:["#45b8b0","Ацтеки"], ROME:["#8a5fd9","Рим"],
  GREECE:["#6fb8e0","Греция"], EGYPT:["#d9c86b","Египет"], MONGOL:["#b08968","Монголия"], OTTOMAN:["#3fae6a","Османы"],
  PERSIA:["#9b4fd9","Персия"], POLYNESIA:["#4fd9b0","Полинезия"], SIAM:["#d9a441","Сиам"], CARTHAGE:["#7fa0c0","Карфаген"],
  CELTS:["#6fd96f","Кельты"], ETHIOPIA:["#2f9b6b","Эфиопия"], HUNS:["#a0522d","Гунны"], KOREA:["#7fc0e0","Корея"],
  MAYA:["#4fb86a","Майя"], MOROCCO:["#c04f4f","Марокко"], NETHERLANDS:["#e08030","Нидерланды"], POLAND:["#e05a7a","Польша"],
  PORTUGAL:["#3f7fa0","Португалия"], SHOSHONE:["#b0a060","Шошоны"], VENICE:["#5fb0a0","Венеция"], ZULU:["#8a6a3a","Зулусы"],
  BYZANTIUM:["#8f5fd9","Византия"], AUSTRIA:["#e0d0a0","Австрия"], BRAZIL:["#3fae4a","Бразилия"], ASSYRIA:["#a07a4a","Ассирия"],
  BABYLON:["#5a9fd9","Вавилон"], INDONESIA:["#c04f8a","Индонезия"], IROQUOIS:["#6a9b4a","Ирокезы"], SOLARIA:["#b84fd9","Солярия"],
};
const SPARE = ["#d94f4f","#4f8fd9","#d9a441","#53b06a","#9b6dd9","#d97ab0","#45b8b0","#c77a3a","#b0c23f","#6fd9c0","#e08a5a","#8ad95f"];
const CS = "#76859a", BARB = 63, C_BARB = "#7a2c2c";
const ERA_RU = { ERA_ANCIENT: "Древний мир", ERA_CLASSICAL: "Античность", ERA_MEDIEVAL: "Средневековье",
  ERA_RENAISSANCE: "Возрождение", ERA_INDUSTRIAL: "Индустриальная эра", ERA_MODERN: "Новое время",
  ERA_POSTMODERN: "Атомная эра", ERA_FUTURE: "Информационная эра" };
// События шкалы: значок, цвет, подпись. На шкале — только крупные (как у ffaciv); основание
// городов и пантеоны — в списке событий по флажку.
const EV = {
  war:    { g: "⚔", c: "#e05a50", ru: "объявление войны", tl: 1 },
  peace:  { g: "☮", c: "#58C08A", ru: "мир", tl: 0 },
  capt:   { g: "⚑", c: "#e0a82e", ru: "город взят", tl: 1 },
  raze:   { g: "✹", c: "#ff7a3c", ru: "город сожжён / разрушен", tl: 1 },
  left:   { g: "⇥", c: "#9aa6b2", ru: "игрок ушёл (слот ведёт ИИ)", tl: 1 },
  dead:   { g: "✝", c: "#c0c6cc", ru: "держава уничтожена", tl: 1 },
  wonder: { g: "★", c: "#e7b84f", ru: "чудо света", tl: 1 },
  era:    { g: "▲", c: "#6fb8e0", ru: "новая эпоха", tl: 0 },
  found:  { g: "•", c: "#cfd8e2", ru: "основан город", tl: 0 },
  faith:  { g: "✦", c: "#e8e8e8", ru: "пантеон / религия", tl: 0 },
};
const TERR_C = { GRASS: "--grass", PLAINS: "--plains", DESERT: "--desert", TUNDRA: "--tundra", SNOW: "--snow", COAST: "--coast", OCEAN: "--sea" };
const TERR_RU = { GRASS: "луга", PLAINS: "равнины", DESERT: "пустыня", TUNDRA: "тундра", SNOW: "снег", COAST: "берег", OCEAN: "океан", MOUNTAIN: "горы", HILL: "холм" };
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let COL = {};
function readColors() {
  for (const k in TERR_C) COL[k] = css(TERR_C[k]) || "#456";
  COL.forest = css("--forest"); COL.jungle = css("--jungle"); COL.mtn = css("--mtn"); COL.ice = css("--ice");
  COL.marsh = css("--marsh"); COL.lake = css("--lake");
}

// ---------------------------------------------------------------- состояние
let LIST = [], cur = -1, src = null, loadToken = 0;
let PK = null;            // пакет партии
let S = [];               // состояния по шагам: { P:{поле:Int16Array}, F:{команда:{rev,vis}}, U:Map, C:Map, TM, PL }
let si = 0;               // текущий шаг
let view = -1;            // слот игрока, чьими глазами смотрим (−1 — все)
let MEM = null;           // память команды по шагам: [{own, imp, rt, feat, res, C:Map}]
let colorOf = new Map(), playerBy = new Map(), teamOf = new Map(), lakeAt = null;
let timer = null, card = null;
const show = { units: true, names: true, icons: true, heat: false, log: true, yields: true };
try { const v = JSON.parse(localStorage.getItem("rf-layers") || "{}"); for (const k in show) if (typeof v[k] === "boolean") show[k] = v[k]; } catch (e) { /* по умолчанию */ }
// devicePixelRatio бывает float32 (1.100000023…) — округляем, иначе «целое число точек» не находится
const DPR = () => Math.min(3, Math.max(0.5, Math.round((devicePixelRatio || 1) * 10000) / 10000));   // и меньше 1 (масштаб браузера 80–90%)
let zoom = 1, R = 12, W = 0, H = 0;
const ICON_R = 13;
let tab = "players", evAll = false;
const cv = $("cv"), ctx = cv.getContext("2d"), stage = $("stage");
const slider = $("slider"), playBtn = $("play"), tip = $("tip"), sc = $("scroll");
const side = $("rpSide"), cardEl = $("card");
// yf..yr — выход клетки из сейва (еда, производство, золото, наука, культура, вера); у старых пакетов их нет
const FIELDS = ["terr", "pt", "feat", "res", "rn", "imp", "ip", "rt", "rp", "own", "yf", "yp", "yg", "ys", "yc", "yr"];
const T = (kind, i) => (PK && i >= 0 && PK.T[kind] ? PK.T[kind][i] : null);
const key = (x, y) => x + y * PK.w;
const kx = k => k % PK.w, ky = k => (k / PK.w) | 0;
const stepLabel = i => { const t = PK.steps[i]; return t < 0 ? "старт" : "ход " + t; };
const turnOf = i => PK.steps[i];
// Шаги «по журналу» (PK.uSrc[i] — массив держав): сейва на этом ходу нет, юниты этих держав — из журнала
// игроков (117), всё остальное (карта, города, туман, ИИ, ГГ, варвары) — с прошлого сейва.
const isSaveStep = i => !PK.uSrc || PK.uSrc[i] == null;
function prevSaveStep(i) { for (let j = i - 1; j >= 0; j--) if (isSaveStep(j)) return j; return -1; }
const uFresh = (i, p) => isSaveStep(i) || PK.uSrc[i].indexOf(p) >= 0;
function lastFresh(i, p) { for (let j = i; j >= 0; j--) if (uFresh(j, p)) return j; return 0; }

// ---------------------------------------------------------------- распаковка пакета
async function fetchPackage(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(url + " → " + r.status);
  const buf = new Uint8Array(await r.arrayBuffer());
  let text;
  if (buf[0] === 0x1f && buf[1] === 0x8b) {          // сервер отдал .gz как есть — распаковываем сами
    if (typeof DecompressionStream !== "function") throw new Error("браузер не умеет распаковывать gzip");
    const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
    text = await new Response(ds).text();
  } else text = new TextDecoder().decode(buf);      // уже распаковал сам браузер (Content-Encoding)
  return JSON.parse(text);
}
function bitsFromB64(s, n) {
  const raw = atob(s), out = new Uint8Array(n);
  for (let k = 0; k < n; k++) out[k] = (raw.charCodeAt(k >> 3) >> (k & 7)) & 1;
  return out;
}
const ukey = (o, id) => o + ":" + id;
function decode(pk) {
  const n = pk.w * pk.h;
  const s0 = pk.s0, P = {};
  for (const f of FIELDS) P[f] = s0.P[f] ? Int16Array.from(s0.P[f]) : new Int16Array(n);
  const F = {};
  for (const t in (s0.F || {})) F[t] = { rev: bitsFromB64(s0.F[t][0], n), vis: bitsFromB64(s0.F[t][1], n) };
  const U = new Map(); for (const u of s0.U) U.set(ukey(u[0], u[1]), u);
  const C = new Map(); for (const c of s0.C) C.set(c.k, c);
  const out = [{ P, F, U, C, TM: s0.TM, PL: s0.PL }];
  for (const d of pk.d) {
    const a = out[out.length - 1];
    const P2 = Object.assign({}, a.P), cl = {};
    const p = d.p || [];
    for (let i = 0; i + 2 < p.length; i += 3) {
      const f = FIELDS[p[i + 1]];
      if (!cl[f]) { P2[f] = P2[f].slice(); cl[f] = 1; }
      P2[f][p[i]] = p[i + 2];
    }
    const F2 = Object.assign({}, a.F);
    for (const t in (d.F || {})) {
      const r0 = a.F[t] || { rev: new Uint8Array(n), vis: new Uint8Array(n) };
      const rev = r0.rev.slice(), vis = r0.vis.slice();
      for (const k of d.F[t][0]) rev[k] ^= 1;      // разведку игра изредка снимает — тоже переключатель
      for (const k of d.F[t][1]) vis[k] ^= 1;
      F2[t] = { rev, vis };
    }
    let U2 = a.U;
    if (d.U || d.Ud) {
      U2 = new Map(a.U);
      for (const u of (d.U || [])) U2.set(ukey(u[0], u[1]), u);
      const g = d.Ud || [];
      for (let i = 0; i + 1 < g.length; i += 2) U2.delete(ukey(g[i], g[i + 1]));
    }
    let C2 = a.C;
    if (d.C || d.Cd) {
      C2 = new Map(a.C);
      for (const c of (d.C || [])) C2.set(c.k, c);
      for (const k of (d.Cd || [])) C2.delete(k);
    }
    out.push({ P: P2, F: F2, U: U2, C: C2, TM: d.TM ? Object.assign({}, a.TM, d.TM) : a.TM, PL: d.PL ? Object.assign({}, a.PL, d.PL) : a.PL });
  }
  return out;
}

// Память команды: что она видела на клетке в последний раз (владелец, улучшение, дорога,
// особенность, ресурс, город). Под туманом игра показывает именно это, а не правду.
function buildMemory(team) {
  const n = PK.w * PK.h, t = String(team), mem = [];
  let own = new Int16Array(n).fill(-1), imp = new Int16Array(n).fill(-1), rt = new Int16Array(n).fill(-1);
  let feat = new Int16Array(n).fill(-1), res = new Int16Array(n).fill(-1);
  let cities = new Map();
  for (let i = 0; i < S.length; i++) {
    const st = S[i], f = st.F[t];
    own = own.slice(); imp = imp.slice(); rt = rt.slice(); feat = feat.slice(); res = res.slice();
    cities = new Map(cities);
    if (f) for (let k = 0; k < n; k++) {
      if (!f.vis[k] && !(i === 0 && f.rev[k])) continue;
      own[k] = st.P.own[k]; imp[k] = st.P.imp[k]; rt[k] = st.P.rt[k]; feat[k] = st.P.feat[k]; res[k] = st.P.res[k];
      const c = st.C.get(k);
      if (c) cities.set(k, c); else cities.delete(k);
    }
    mem.push({ own, imp, rt, feat, res, C: cities });
  }
  return mem;
}

// Водные области — как CvMap::calculateLandmasses (≤ 9 клеток — озеро).
const HDIR = [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
const half = y => (y >= 0 ? (y >> 1) : -((-y + 1) >> 1));
function findLakes() {
  const n = PK.w * PK.h, lim = NAMES.lakeMax || 9, P0 = S[0].P;
  lakeAt = new Uint8Array(n);
  const seen = new Uint8Array(n), water = k => P0.pt[k] === 3;
  for (let s = 0; s < n; s++) {
    if (seen[s] || !water(s)) continue;
    const area = [s]; seen[s] = 1;
    for (let i = 0; i < area.length; i++) {
      const k = area[i], x = kx(k), y = ky(k), hx = x - half(y);
      for (const d of HDIR) {
        const ny = y + d[1];
        if (ny < 0 || ny >= PK.h) continue;
        let nx = hx + d[0] + half(ny);
        if (PK.wrapX) nx = (nx % PK.w + PK.w) % PK.w; else if (nx < 0 || nx >= PK.w) continue;
        const nk = nx + ny * PK.w;
        if (!seen[nk] && water(nk)) { seen[nk] = 1; area.push(nk); }
      }
    }
    if (area.length <= lim) for (const k of area) lakeAt[k] = 1;
  }
}

// ---------------------------------------------------------------- игроки
function setupPlayers() {
  colorOf = new Map(); playerBy = new Map(); teamOf = new Map();
  const used = new Set(); let spare = 0;
  for (const p of PK.players) {
    playerBy.set(p.i, p); teamOf.set(p.i, p.team);
    let col;
    if (p.kind === "cs") col = CS;
    else if (p.kind === "barb") col = C_BARB;
    else {
      col = (CIV[p.civ] || [])[0];
      if (!col || used.has(col)) { do { col = SPARE[spare++ % SPARE.length]; } while (used.has(col) && spare < 40); }
      used.add(col);
    }
    colorOf.set(p.i, col);
  }
}
const majors = () => PK.players.filter(p => p.kind === "major");
function nameOf(p) {
  if (p == null || p < 0) return "ничья земля";
  if (p === BARB) return "варвары";
  const pp = playerBy.get(p);
  if (!pp) return "держава " + p;
  if (pp.kind === "cs") return pp.nick ? "город-государство " + pp.nick : "город-государство";
  return pp.nick || civRu(pp.civ);
}
const civRu = c => (CIV[c] || [])[1] || prettify(c);
function teamName(t) {
  const m = PK.players.filter(p => p.team === t);
  return m.length ? m.map(p => nameOf(p.i)).join(" + ") : "команда " + t;
}
const chip = p => '<span class="rp-chip"><i style="background:' + (colorOf.get(p) || "#889") + '"></i>' + esc(nameOf(p)) + "</span>";
const tchip = t => { const m = PK.players.filter(p => p.team === t); return m.length ? m.map(p => chip(p.i)).join(" ") : esc("команда " + t); };
const viewTeam = () => view >= 0 && playerBy.has(view) ? playerBy.get(view).team : -1;

// ---------------------------------------------------------------- размер и масштаб
function fitR() {
  // размер окна карты без полос прокрутки не годится: они то есть, то нет (после «+» и «−» «вся карта» сжималась до 97%)
  const ma = sc.parentElement, w = (ma && ma.clientWidth) || sc.clientWidth || 900, h = (ma && ma.clientHeight) || sc.clientHeight || 600;
  const byW = (w - 8) / (Math.sqrt(3) * (PK.w + 0.5));
  const byH = (h - 8) / (1.5 * (PK.h - 1) + 2);
  return Math.max(4, Math.min(byW, byH));
}
function resize() {
  const D = DPR();
  let r = fitR() * zoom;
  if (drawn()) {
    // Пиксель-арт чёткий только при целом увеличении: клетка (тайл 28 точек в высоту) = 14·k точек экрана
    // на радиус. k = 1…4 (больше — крупные «кубики»); ниже k = 1 — обзор всей карты, там тайлы уменьшаются.
    // Ступени: «вся карта» и ×1 — стратегический вид (без пиксель-арта); ×2, ×3, ×4 — рисованный, тайл
    // увеличен ровно в целое число раз (клетка = 14·k точек экрана на радиус).
    const rd = r * D;
    if (zoom > 1.0001 && rd >= 21) r = 14 * Math.max(2, Math.min(4, Math.round(rd / 14))) / D;
    else if (zoom > 1.0001 && rd >= 11) r = 14 / D;
  }
  R = Math.max(4, Math.min(drawn() ? 56 / D : 48, r));
  W = Math.sqrt(3) * R; H = 1.5 * R;
  // карта целиком — это только размер «stage» (по нему идёт прокрутка); холст карты — размером с окно,
  // рисуется видимая часть (viewSize, drawMap)
  const cw = W * (PK.w + 0.5) + 6, ch = H * (PK.h - 1) + 2 * R + 6;
  stage.style.width = cw + "px"; stage.style.height = ch + "px";
  cv._cw = cw; cv._ch = ch;
  viewSize();
  $("zoomLabel").textContent = Math.round(R / Math.max(1e-6, fitR()) * 100) + "%";   // фактический масштаб (рисованный — ступенями)
  $("iconsNote").textContent = drawn() ? (lod() < 1 ? "видно при увеличении ×2 (+)" : "") : (R < ICON_R ? "видно при увеличении (+)" : "");
  const yn = $("yieldsNote"); if (yn) yn.textContent = !PK.yields ? "в этой записи нет" : lod() < 2 ? "видно при увеличении ×3 (+)" : "";
  lodHint(); debugInfo();
}
// Холсты карты и юнитов — размером с окно карты, неподвижны (вне прокрутки) и стоят на целых точках
// экрана: при дробном DPR (125%) их место выравнивается сдвигом на долю точки один раз, а не при каждой
// прокрутке. Содержимое сдвигает сам рисунок (mapOrigin) — композитор ничего не пересэмплирует.
function viewSize() {
  const D = DPR(), w = Math.max(1, sc.clientWidth), h = Math.max(1, sc.clientHeight);
  // CSS-размер холста должен быть точным (браузер округляет размеры до 1/64 точки CSS): иначе 784.8px
  // становится 784.796875px, и холст сжимается на долю точки — опять пересэмплирование. Берём ближайший
  // сверху целый CSS-размер, который при этом DPR даёт целое число точек экрана (лишнее обрежет .rp-map).
  const fit = v => { for (let c = Math.ceil(v); c < Math.ceil(v) + 64; c++) if (Math.abs(c * D - Math.round(c * D)) < 1e-4) return c; return Math.ceil(v); };
  const cw = fit(w), ch = fit(h);
  for (const el of [cv, uv]) {
    const pw = Math.round(cw * D), ph = Math.round(ch * D);
    if (el.width !== pw || el.height !== ph) { el.width = pw; el.height = ph; }
    el.style.width = cw + "px"; el.style.height = ch + "px";
    // Сдвиг на долю точки — через left/top (это раскладка, её Chrome выравнивает одинаково для обоих холстов),
    // а не transform: translate уводил слой с выровненной Chrome позиции — размытие (замер civ5-qa, 110%).
    // Нужен, когда окно карты само начинается на полуточке (узкая раскладка при 125%: верх 95.6px).
    const pr = el.parentElement.getBoundingClientRect();
    const ox = (Math.round(pr.left * D) - pr.left * D) / D, oy = (Math.round(pr.top * D) - pr.top * D) / D;
    el.style.left = ox + "px"; el.style.top = oy + "px";
  }
}
// Начало карты (левый верхний угол stage) относительно холста карты, в точках CSS; и видимые клетки.
function mapOrigin() { const a = stage.getBoundingClientRect(), b = cv.getBoundingClientRect(); return [a.left - b.left, a.top - b.top]; }
let IV = null;
function viewMask(O) {
  const n = PK.w * PK.h, m = new Uint8Array(n), vw = cv.width / DPR(), vh = cv.height / DPR();
  const x0 = -O[0] - W, x1 = -O[0] + vw + W, y0 = -O[1] - 2 * R, y1 = -O[1] + vh + 3 * R;
  for (let k = 0; k < n; k++) { const c = centerOf(kx(k), ky(k)); if (c[0] >= x0 && c[0] <= x1 && c[1] >= y0 && c[1] <= y1) m[k] = 1; }
  return m;
}
// Перевод рисунка: точки CSS карты -> точки экрана холста, сдвиг — целым числом точек экрана.
function mapTransform() {
  const D = DPR(), O = mapOrigin();
  IV = viewMask(O);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(D, 0, 0, D, Math.round(O[0] * D), Math.round(O[1] * D));
}
// Детализация рисованного вида: 0 — стратегический (ровные гексы, границы, города, щитки армий);
// 1 — ×2 пиксель-арт (значки юнитов, ресурсы, улучшения приглушённо); 2 — ×3 и ×4 (отряды фигурками,
// выход клеток). В плоском виде — всё как раньше.
function lod() { if (!drawn()) return 9; const rd = R * DPR(); return rd < 21 ? 0 : rd < 35 ? 1 : 2; }
function setZoom(z, ax, ay, exact) {
  if (!PK) return;
  if (drawn() && !exact) {
    // ступени рисованного вида: 100% (вся карта) и k = 1…4 (см. resize); кнопка/колесо — соседняя ступень
    const D = DPR(), f = fitR() * D, dir = Math.sign(z - zoom);
    const lv = [1].concat([1, 2, 3, 4].map(k => 14 * k / f).filter(v => v > 1.0001));
    let i = 0, best = 1e9; lv.forEach((v, j) => { const d = Math.abs(Math.log(v / zoom)); if (d < best) { best = d; i = j; } });
    if (dir) z = lv[Math.max(0, Math.min(lv.length - 1, i + dir))];
  }
  z = Math.max(1, Math.min(drawn() ? 24 : 8, z));
  if (Math.abs(z - zoom) < 1e-6) return;
  const vw = sc.clientWidth, vh = sc.clientHeight;
  if (ax == null) { ax = vw / 2; ay = vh / 2; }
  const r0 = stage.getBoundingClientRect(), s0 = sc.getBoundingClientRect();
  const fxp = (s0.left + ax - r0.left) / r0.width, fyp = (s0.top + ay - r0.top) / r0.height;
  zoom = z; resize(); drawMap(); fitUi();
  const r1 = stage.getBoundingClientRect();
  sc.scrollLeft += (r1.left + fxp * r1.width) - (s0.left + ax);
  sc.scrollTop += (r1.top + fyp * r1.height) - (s0.top + ay);
  unitsDraw();
}
// ---------------------------------------------------------------- геометрия
// В сейве Y растёт на север; на экране — вниз. Нечётный ряд сдвинут на полклетки.
function centerOf(x, y) {
  const row = PK.h - 1 - y;
  return [3 + W * (x + (y & 1 ? 0.5 : 0)) + W / 2, 3 + H * row + R];
}
function hexPath(cx, cy, g = ctx, r = R) {
  g.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 180 * (60 * k - 90);
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    k ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
}
function neighbor(x, y, dir) {
  const hx = x - half(y), ny = y + HDIR[dir][1];
  if (ny < 0 || ny >= PK.h) return -1;
  let nx = hx + HDIR[dir][0] + half(ny);
  if (PK.wrapX) nx = (nx % PK.w + PK.w) % PK.w; else if (nx < 0 || nx >= PK.w) return -1;
  return key(nx, ny);
}
function hexDist(k0, k1) {
  const x0 = kx(k0), y0 = ky(k0), x1 = kx(k1), y1 = ky(k1), a = x0 - half(y0), dy = y1 - y0;
  let best = 1e9;
  for (const w of (PK.wrapX ? [0, PK.w, -PK.w] : [0])) {
    const dx = (x1 + w - half(y1)) - a;
    best = Math.min(best, (Math.abs(dx) + Math.abs(dy) + Math.abs(dx + dy)) / 2);
  }
  return best;
}

// ---------------------------------------------------------------- карта
function tileFill(st, k, f) {
  const pt = st.P.pt[k], tr = T("terr", st.P.terr[k]);
  if (pt === 0) return COL.mtn;
  if (f === "ICE") return COL.ice;
  if (lakeAt && lakeAt[k]) return COL.lake;
  if (f === "FOREST") return COL.forest;
  if (f === "JUNGLE") return COL.jungle;
  if (f === "MARSH") return COL.marsh;
  return COL[tr] || COL.OCEAN;
}
function glyph(pt, f, cx, cy, a) {
  ctx.globalAlpha = a;
  if (pt === 0) {
    ctx.fillStyle = "#cfd8e2";
    ctx.beginPath();
    ctx.moveTo(cx - R * .5, cy + R * .34); ctx.lineTo(cx - R * .12, cy - R * .36);
    ctx.lineTo(cx + R * .18, cy + R * .1); ctx.lineTo(cx + R * .36, cy - R * .16);
    ctx.lineTo(cx + R * .62, cy + R * .34); ctx.closePath(); ctx.fill();
  } else if (f === "FOREST" || f === "JUNGLE") {
    ctx.fillStyle = f === "FOREST" ? "#9ed88a" : "#bfe88c";
    for (const t of [[-.3, .12, .3], [.12, -.12, .34], [.34, .24, .26]]) {
      ctx.beginPath();
      ctx.moveTo(cx + R * t[0], cy + R * (t[1] - t[2]));
      ctx.lineTo(cx + R * (t[0] - t[2] * .72), cy + R * (t[1] + t[2] * .6));
      ctx.lineTo(cx + R * (t[0] + t[2] * .72), cy + R * (t[1] + t[2] * .6));
      ctx.closePath(); ctx.fill();
    }
  } else if (pt === 1) {
    ctx.strokeStyle = "#000000"; ctx.lineWidth = Math.max(1.4, R * .16);
    ctx.beginPath(); ctx.arc(cx, cy + R * .22, R * .42, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
  } else if (f === "ICE") {
    ctx.fillStyle = "#8fb6cf";
    for (const o of [[-.26, -.14], [.18, .02], [-.04, .3]]) { ctx.beginPath(); ctx.arc(cx + R * o[0], cy + R * o[1], R * .13, 0, 7); ctx.fill(); }
  } else if (f === "OASIS") {
    ctx.fillStyle = "#4fd9b0"; ctx.beginPath(); ctx.arc(cx, cy, R * .26, 0, 7); ctx.fill();
  } else if (f === "MARSH") {
    ctx.strokeStyle = "#8fd8c0"; ctx.lineWidth = Math.max(1, R * .12);
    for (const dy of [-.2, .08, .34]) { ctx.beginPath(); ctx.moveTo(cx - R * .34, cy + R * dy); ctx.lineTo(cx + R * .34, cy + R * dy); ctx.stroke(); }
  } else if (f === "FALLOUT") {
    ctx.fillStyle = "#c8d84f"; ctx.beginPath(); ctx.arc(cx, cy, R * .22, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function iconRect(slot, short) {
  const sh = SHEETS[slot], pack = ICONS[slot];
  if (!sh || !sh.complete || !sh.naturalWidth || !pack || !pack.map || !short) return null;
  return pack.map[PFX[slot] + short] || null;
}
// Что команда видит на клетке: правда (видно или «смотреть как всех») или память под туманом.
function cellView(i, k) {
  const st = S[i], t = viewTeam();
  if (t < 0) return { rev: 1, vis: 1, own: st.P.own[k], imp: st.P.imp[k], rt: st.P.rt[k], feat: st.P.feat[k], res: st.P.res[k] };
  const f = st.F[String(t)];
  if (!f) return { rev: 1, vis: 1, own: st.P.own[k], imp: st.P.imp[k], rt: st.P.rt[k], feat: st.P.feat[k], res: st.P.res[k] };
  const m = MEM[i];
  return { rev: f.rev[k], vis: f.vis[k], own: m.own[k], imp: m.imp[k], rt: m.rt[k], feat: m.feat[k], res: m.res[k] };
}
function citiesFor(i) {
  const t = viewTeam();
  if (t < 0 || !S[i].F[String(t)]) return S[i].C;
  return MEM[i].C;
}

let mapDirty = false, viewDirty = false;
function drawMap() {
  if (!PK) return;
  mapDirty = false;
  viewDirty = false;
  lodHint();
  if (drawn() && lod() >= 1) { drawMapArt(); return; }
  const STRAT = drawn();                                     // рисованный вид на мелком масштабе: стратегический стиль
  mapTransform();
  ctx.imageSmoothingEnabled = true;
  const st = S[si], n = PK.w * PK.h, V = new Array(n);
  for (let k = 0; k < n; k++) V[k] = cellView(si, k);
  ctx.lineJoin = "round";
  // 1. местность, заливка владельца, туман
  for (let k = 0; k < n; k++) { if (!IV[k]) continue;
    const x = kx(k), y = ky(k), c = centerOf(x, y), cx = c[0], cy = c[1], v = V[k];
    if (!v.rev) { hexPath(cx, cy); ctx.fillStyle = "#05080c"; ctx.fill(); continue; }
    const f = T("feat", v.feat);
    hexPath(cx, cy);
    ctx.fillStyle = tileFill(st, k, f);
    ctx.fill();
    if (v.own >= 0) { hexPath(cx, cy); ctx.fillStyle = (colorOf.get(v.own) || "#889") + "66"; ctx.fill(); }
    if (R >= 5) glyph(st.P.pt[k], f, cx, cy, STRAT ? 0.3 : 0.62);
  }
  // 1б. реки (флаги NW / W / NE ребра)
  for (let k = 0; k < n; k++) { if (!IV[k]) continue;
    const rv = PK.riv[k];
    if (!rv || !V[k].rev) continue;
    const c = centerOf(kx(k), ky(k)), cx = c[0], cy = c[1];
    for (const pair of [[1, 2], [2, 3], [4, 1]]) {
      if (!(rv & pair[0])) continue;
      const a0 = Math.PI / 180 * (-30 - 60 * pair[1]);
      ctx.strokeStyle = "#3c86c7"; ctx.lineWidth = Math.max(1.6, R * 0.16);
      ctx.beginPath();
      ctx.moveTo(cx + R * Math.cos(a0), cy + R * Math.sin(a0));
      ctx.lineTo(cx + R * Math.cos(a0 + Math.PI / 3), cy + R * Math.sin(a0 + Math.PI / 3));
      ctx.stroke();
    }
  }
  // 1в. дороги: линия к соседям с дорогой (в стратегическом стиле — нет)
  if (R >= 7 && !STRAT) {
    ctx.lineCap = "round";
    for (let k = 0; k < n; k++) { if (!IV[k]) continue;
      if (V[k].rt < 0 || !V[k].rev) continue;
      const x = kx(k), y = ky(k), c = centerOf(x, y);
      const rail = T("route", V[k].rt) === "RAILROAD";
      for (let dir = 0; dir < 3; dir++) {
        const nk = neighbor(x, y, dir);
        if (nk < 0 || V[nk].rt < 0 || !V[nk].rev) continue;
        const d = centerOf(kx(nk), ky(nk));
        if (Math.abs(d[0] - c[0]) > W * 2) continue;       // через шов карты не тянем
        ctx.strokeStyle = rail ? "#2b2f36" : "#a08060"; ctx.lineWidth = Math.max(1.2, R * (rail ? 0.16 : 0.12));
        ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.stroke();
      }
    }
    ctx.lineCap = "butt";
  }
  // 2. тепловая карта боёв
  if (show.heat) drawHeat(V);
  // 3. границы — где владелец меняется
  for (let k = 0; k < n; k++) { if (!IV[k]) continue;
    const own = V[k].own;
    if (own < 0 || !V[k].rev) continue;
    const x = kx(k), y = ky(k), c = centerOf(x, y), cx = c[0], cy = c[1];
    for (let dir = 0; dir < 6; dir++) {
      const nk = neighbor(x, y, dir);
      if (nk >= 0 && V[nk].own === own && V[nk].rev) continue;
      const a0 = Math.PI / 180 * (-30 - 60 * dir);
      const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
      const x1 = cx + R * Math.cos(a0 + Math.PI / 3), y1 = cy + R * Math.sin(a0 + Math.PI / 3);
      ctx.strokeStyle = "#0b1119"; ctx.lineWidth = STRAT ? Math.max(3.4, R * 0.44) : Math.max(2.6, R * 0.34);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = colorOf.get(own) || "#889"; ctx.lineWidth = STRAT ? Math.max(2.4, R * 0.28) : Math.max(1.6, R * 0.2);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
  }
  // 4. ресурсы и улучшения игровыми иконками — при увеличении
  const cities = citiesFor(si);
  if (show.icons && R >= ICON_R && !STRAT) {
    ctx.globalAlpha = show.units ? 0.5 : 1;
    const ring = (cx, cy, s) => { ctx.beginPath(); ctx.arc(cx, cy, s / 2 + 0.6, 0, 7); ctx.lineWidth = Math.max(1.2, R * 0.07); ctx.strokeStyle = "#0b1119"; ctx.stroke(); };
    for (let k = 0; k < n; k++) { if (!IV[k]) continue;
      const v = V[k];
      if (!v.rev || cities.has(k)) continue;
      const rs = T("res", v.res), im = T("imp", v.imp);
      if (!rs && !im) continue;
      const c = centerOf(kx(k), ky(k)), cx = c[0], cy = c[1], both = rs && im;
      if (rs) {
        const ic = iconRect("res", rs), s = both ? R * 0.96 : R * 1.12, px = both ? cx - R * 0.3 : cx, py = cy + R * 0.02;
        if (ic) { ctx.drawImage(SHEETS.res, ic.x, 0, ic.w, ic.h, px - s / 2, py - s / 2, s, s); ring(px, py, s); }
      }
      if (im) {
        const ic = iconRect("imp", im), s = both ? R * 0.82 : R * 1.08, px = both ? cx + R * 0.36 : cx, py = both ? cy + R * 0.14 : cy + R * 0.02;
        if (ic) { ctx.drawImage(SHEETS.imp, ic.x, 0, ic.w, ic.h, px - s / 2, py - s / 2, s, s); ring(px, py, s); }
        else { ctx.fillStyle = im === "BARBARIAN_CAMP" ? "#d9534f" : "#cbbfae"; ctx.beginPath(); ctx.arc(px, py, R * .22, 0, 7); ctx.fill(); }
      }
    }
    ctx.globalAlpha = 1;
  }
  // 5. туман: разведано, но не видно — приглушить
  if (viewTeam() >= 0) {
    ctx.fillStyle = "rgba(4,7,11,.56)";
    for (let k = 0; k < n; k++) { if (!IV[k]) continue;
      if (!V[k].rev || V[k].vis) continue;
      const c = centerOf(kx(k), ky(k)); hexPath(c[0], c[1], ctx, R + 0.5); ctx.fill();
    }
  }
  // 6. рабочие клетки выбранного города
  if (card && card.kind === "city") {
    const c = cities.get(card.k);
    if (c) for (const k of (c.w || [])) {
      const p = centerOf(kx(k), ky(k));
      ctx.beginPath(); ctx.arc(p[0], p[1] + R * 0.62, Math.max(2, R * 0.2), 0, 7);
      ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = "#0b1119"; ctx.stroke();
    }
  }
  // 7. города: кружок цвета владельца и флажок (жители · имя)
  drawCities(cities);
}
function drawCities(cities) {
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const sel = card && card.kind === "city" ? card.k : -1;
  for (const [k, c] of cities) {
    const pos = centerOf(kx(k), ky(k)), cx = pos[0], cy = pos[1], col = colorOf.get(c.o) || "#99a";
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(3, R * 0.5), 0, 7);
    ctx.fillStyle = col; ctx.fill();
    ctx.lineWidth = R >= 8 ? 2.4 : 1.6; ctx.strokeStyle = "#0b1119"; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.8, R * 0.3), 0, 7);
    ctx.fillStyle = (c.fl & 8) ? "#ff7a3c" : "#f3f7fb"; ctx.fill();
    if (k === sel) { ctx.beginPath(); ctx.arc(cx, cy, R * 0.98, 0, 7); ctx.lineWidth = 2.4; ctx.strokeStyle = "#76C6C0"; ctx.stroke(); }
    if (!show.names || R < 6) continue;
    const fs = Math.max(10, Math.min(15, Math.round(R * 0.7)));
    ctx.font = "600 " + fs + "px system-ui, sans-serif";
    // мелко (обзор поздней партии) — у городов только число жителей, имя — у столиц держав
    const major = (playerBy.get(c.o) || {}).kind === "major";
    const nm = R < 9 && !((c.fl & 1) && major) ? "" : ((c.fl & 1) ? "★ " : "") + (c.n || "город");
    const tw = ctx.measureText(nm).width, bh = Math.round(fs * 1.45);
    ctx.font = "700 " + fs + "px system-ui, sans-serif";
    const ps = String(c.pop), pw = Math.max(bh, ctx.measureText(ps).width + 8);
    const bw = nm ? pw + tw + 10 : pw, bx = cx - bw / 2, by = cy - R * 0.62 - bh - 2;
    ctx.fillStyle = "#0b1119e6"; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = col; ctx.fillRect(bx, by, pw, bh);
    ctx.strokeStyle = "#0b1119"; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    const light = lum(col) > 0.62;
    ctx.fillStyle = light ? "#0b1119" : "#ffffff";
    ctx.fillText(ps, bx + pw / 2, by + bh / 2 + 0.5);
    ctx.font = "600 " + fs + "px system-ui, sans-serif";
    ctx.fillStyle = (c.fl & 4) ? "#ffb3a8" : (c.fl & 2) ? "#b9c3cf" : "#e8eef6";     // оккупирован — розовым, марионетка — серее
    if (nm) ctx.fillText(nm, bx + pw + 5 + tw / 2, by + bh / 2 + 0.5);
    if (c.dmg > 0) {                     // повреждение города — красная полоска под флажком
      ctx.fillStyle = "#0b1119"; ctx.fillRect(bx, by + bh, bw, 3);
      ctx.fillStyle = "#D9534F"; ctx.fillRect(bx, by + bh, bw * Math.min(1, c.dmg / 200), 3);
    }
  }
}

// ---------------------------------------------------------------- рисованный вид
// Тайлы Fantasy Hex (CuddlyClover и участники Unciv, CC BY 4.0) и отряды AbsoluteUnits
// (letstalkaboutdune, CC BY 4.0) — свой атлас assets/replay/unciv-art.png + data/unciv-art.json
// (tools: _tmp/replayfull_live/art/build_art.py). Имена: «F/Tiles/Grassland», «A/Units/Warrior».
// Картинки шестиугольников в атласе — с плоским верхом (32×28); карта Civ5 — с острым верхом,
// поэтому основа клетки масштабируется с запасом (×1,155) и обрезается по шестиугольнику клетки,
// а то, что выступает над клеткой (горы, лес, улучшения, отряды), рисуется без обрезки.
let style = "drawn";
try { const v = localStorage.getItem("rf-style"); if (v === "flat" || v === "drawn") style = v; } catch (e) { /* без хранилища — по умолчанию */ }
const ART = { img: null, map: null, lc: null, ready: false, failed: false, tiles: new Map(), tilesR: 0, tint: new Map(), miss: new Set() };
const drawn = () => style === "drawn" && ART.ready;
function loadArt() {
  if (ART.img || ART.failed) return;
  const img = new Image();
  ART.img = img;
  Promise.all([
    new Promise((ok, bad) => { img.onload = ok; img.onerror = () => bad(new Error("unciv-art.png")); img.src = "assets/replay/unciv-art.png"; }),
    fetch("data/unciv-art.json").then(r => { if (!r.ok) throw new Error("unciv-art.json → " + r.status); return r.json(); }),
  ]).then(([, map]) => {
    ART.map = map; ART.lc = new Map();
    for (const k in map) ART.lc.set(k.toLowerCase(), k);
    ART.ready = true;
    if (PK) { resize(); drawMap(); unitsDraw(); }
    styleUi();
  }).catch(e => { console.warn(e); ART.failed = true; styleUi(); });
}
const ART_ERAS = ["Ancient era", "Classical era", "Medieval era", "Renaissance era", "Industrial era", "Modern era", "Atomic era", "Information era"];
const A_TERR = { GRASS: "Grassland", PLAINS: "Plains", DESERT: "Desert", TUNDRA: "Tundra", SNOW: "Snow", COAST: "Coast", OCEAN: "Ocean", MOUNTAIN: "Mountain", HILL: "Hill" };
const A_FEAT = { FLOOD_PLAINS: "Flood plains", FOREST: "Forest", JUNGLE: "Jungle", MARSH: "Marsh", OASIS: "Oasis", ICE: "Ice", FALLOUT: "Fallout",
  ATOLL: "Atoll", REEF: "Great Barrier Reef", ULURU: "Uluru", GEYSER: "Old Faithful", MT_KAILASH: "Mount Kailash", GIBRALTAR: "Rock of Gibraltar",
  CRATER: "Barringer Crater", FUJI: "Mount Fuji", MESA: "Grand Mesa", VOLCANO: "Krakatoa", FOUNTAIN_YOUTH: "Fountain of Youth",
  EL_DORADO: "El Dorado", SRI_PADA: "Sri Pada", MT_SINAI: "Mount Sinai", POTOSI: "Cerro de Potosi" };
const A_IMP = { FARM: "Farm", MINE: "Mine", PASTURE: "Pasture", CAMP: "Camp", PLANTATION: "Plantation", QUARRY: "Quarry",
  TRADING_POST: "Trading post", LUMBERMILL: "Lumber mill", FISHING_BOATS: "Fishing Boats", BARBARIAN_CAMP: "Barbarian encampment",
  GOODY_HUT: "Ancient ruins", CITY_RUINS: "City ruins", WELL: "Oil well", OFFSHORE_PLATFORM: "Offshore Platform", CUSTOMS_HOUSE: "Customs house",
  TERRACE_FARM: "Terrace farm", HOLY_SITE: "Holy site", ACADEMY: "Academy", CITADEL: "Citadel", MILI_CITADEL: "Citadel", FORT: "Fort",
  MANUFACTORY: "Manufactory", LANDMARK: "Landmark", MOAI: "Moai", POLDER: "Polder" };
const A_RES = { COW: "Cattle", HORSE: "Horses", GOLD: "Gold Ore", WHALE: "Whales", FUR: "Furs", DYE: "Dyes", BANANA: "Bananas" };
const title = s => { s = String(s || "").replace(/_/g, " ").toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };
const TL = "F/Tiles/";
const tk = nm => nm ? ART.lc.get((TL + nm).toLowerCase()) || null : null;
// Слои клетки как в Unciv: сначала готовая «местность+холм+особенность+ресурс+улучшение», иначе по частям.
function cellLayers(st, k, v, isCity) {
  const pt = st.P.pt[k], tr = T("terr", st.P.terr[k]);
  const bn = lakeAt && lakeAt[k] ? "Lakes" : pt === 0 ? "Mountain" : A_TERR[tr] || (pt === 3 ? "Ocean" : "Grassland");
  const f = T("feat", v.feat), fn = f ? (A_FEAT[f] || title(f)) : null;
  const im = isCity ? null : T("imp", v.imp), inn = im ? (A_IMP[im] || title(im)) : null;
  const rs = T("res", v.res), rn = rs ? (A_RES[rs] || title(rs)) : null;
  const hill = pt === 1 ? "Hill" : null;
  if (inn) {
    const tries = [[bn, hill, fn, rn, inn], [bn, hill, fn, inn], [bn, hill, inn], [bn, fn, rn, inn], [bn, fn, inn, rn], [bn, fn, inn], [bn, rn, inn], [bn, inn]];
    for (const a of tries) {
      if (hill && a.indexOf(hill) < 0) continue;              // на холме — только комбинации с холмом
      const parts = a.filter(Boolean);
      if (parts.length !== a.length) continue;                 // в комбинации нет нужной части — не она
      const hit = tk(parts.join("+"));
      if (hit) return { base: hit, over: [], imp: im };
    }
  }
  const over = [];
  let impDone = false;
  if (hill) {
    const hk = inn ? (tk("Hill" + (fn || "") + "+" + inn) || tk("Hill" + (rn || "") + inn) || tk("Hill" + inn)) : null;
    if (hk) { over.push(hk); impDone = true; } else over.push(tk("Hill"));
  }
  if (fn && !impDone) over.push(tk(bn + fn) || tk(fn));
  if (inn && !impDone) {
    const ik = (rn && (tk(rn + "+" + inn) || tk(inn + "+" + rn))) || tk(inn);
    over.push(ik || { icon: im });
  }
  return { base: tk(bn) || tk(pt === 3 ? "Ocean" : "Grassland"), over: over.filter(Boolean), imp: im };
}
const A_UNIT = { WORKBOAT: "Work Boats", GREAT_GENERAL: "Great General", GREAT_QUARTERMASTER: "Great General", GREEK_COMPANIONCAVALRY: "Companion Cavalry",
  SIAMESE_WARELEPHANT: "Naresuan's Elephant", GATLINGGUN: "Gatling Gun", DANISH_KNARR: "Galley", PROPHET: "Great Prophet", ARTIST: "Great Artist", SCIENTIST: "Great Scientist",
  MERCHANT: "Great Merchant", ENGINEER: "Great Engineer", WRITER: "Great Writer", MUSICIAN: "Great Musician", CARGO_SHIP: "Cargo Ship",
  ATOMIC_BOMB: "Atomic Bomb", NUCLEAR_MISSILE: "Nuclear Missile", MECH: "Giant Death Robot", ANTI_AIRCRAFT_GUN: "Anti-Aircraft Gun", ANTI_TANK_GUN: "Anti-Tank Gun" };
// Имя типа Civ5 → ключ атласа: сначала словарь, потом хвосты имени («GREEK_HOPLITE» → «hoplite»).
function artFind(folders, short, alias) {
  if (!ART.ready || !short) return null;
  const base = String(short).replace(/_SKIN\d+$/, "");
  const ck = folders.join("|") + "|" + base;
  if (ART.tint.has("k:" + ck)) return ART.tint.get("k:" + ck);
  const w = base.toLowerCase().split("_"), names = [];
  if (alias && alias[base]) names.push(alias[base]);
  for (let i = 0; i < w.length; i++) names.push(w.slice(i).join(" "));
  let hit = null;
  for (const nm of names) { for (const f of folders) { hit = ART.lc.get((f + nm).toLowerCase()) || null; if (hit) break; } if (hit) break; }
  if (!hit) ART.miss.add(base);
  ART.tint.set("k:" + ck, hit);
  return hit;
}
const artRect = k => k && ART.map[k];
// Картинка клетки: масштаб — шестиугольник картинки (плоский верх, 32×28) накрывает шестиугольник клетки;
// низ картинки по низу клетки; обрезка — по клетке, а выше клетки — прямоугольником её ширины (горы, лес,
// здания выступают вверх, но не залезают на соседей по бокам). Кеш на R.
// Масштаб картинок Fantasy Hex в точках экрана: шестиугольник тайла (28 точек в высоту) = 2R·DPR.
// На ступенях resize() это целое число k — пиксель-арт без размытия.
const artScale = () => (2 * R * DPR()) / 28;
function artTile(key, cap) {
  const D = DPR(), Rd = R * D;
  if (ART.tilesR !== Rd) { ART.tiles.clear(); ART.tilesR = Rd; }
  const ck = key + "|" + (cap ? 1 : 0);
  let c = ART.tiles.get(ck);
  if (c !== undefined) return c;
  const r = artRect(key);
  if (!r) { ART.tiles.set(ck, null); return null; }
  const s = artScale(), dw = Math.round(r[2] * s), dh = Math.round(r[3] * s), extra = Math.max(0, dh - Math.round(28 * s));
  const Wd = W * D, w = Math.ceil(Wd) + 2, h = Math.ceil(2 * Rd + extra) + 2, cx = Math.round(w / 2), cy = h - Math.round(Rd) - 1;
  c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); g.imageSmoothingEnabled = s < 1;            // целое увеличение — без сглаживания
  g.beginPath();
  for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 90), x = cx + (Rd + 0.7) * Math.cos(a), y = cy + (Rd + 0.7) * Math.sin(a); i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.closePath();
  if (cap && extra > 0) g.rect(cx - Wd / 2, 0, Wd, cy - Rd / 2 + 1);
  g.clip("nonzero");
  g.filter = "saturate(0.72) brightness(0.96)";            // местность приглушена (ближе к образцу ffaciv)
  g.drawImage(ART.img, r[0], r[1], r[2], r[3], cx - Math.round(dw / 2), cy + Math.round(14 * s) - dh, dw, dh);
  g.filter = "none";
  c._cx = cx; c._cy = cy;
  ART.tiles.set(ck, c);
  return c;
}
function putTile(key, x, y, cap) {
  const t = key && artTile(key, cap);
  if (!t) return false;
  const D = DPR();
  ctx.drawImage(t, Math.round(x * D - t._cx) / D, Math.round(y * D - t._cy) / D, t.width / D, t.height / D);
  return true;
}
function artOver(g, key, cx, cy, k = 1, alpha = 1) {
  const r = artRect(key);
  if (!r) return false;
  const D = DPR(), s = artScale() * k, dw = Math.round(r[2] * s), dh = Math.round(r[3] * s);
  g.globalAlpha = alpha;
  g.drawImage(ART.img, r[0], r[1], r[2], r[3], Math.round(cx * D - dw / 2) / D, Math.round(cy * D + 14 * s - dh) / D, dw / D, dh / D);
  g.globalAlpha = 1;
  return true;
}
function eraOf(p) {
  const pp = playerBy.get(p); if (!pp) return 0;
  const tm = S[si] && S[si].TM && S[si].TM[String(pp.team)];
  return tm && tm.era > 0 ? Math.min(7, tm.era) : 0;
}
function drawMapArt() {
  const st = S[si], n = PK.w * PK.h, V = new Array(n);
  for (let k = 0; k < n; k++) V[k] = cellView(si, k);
  mapTransform();                                           // рисуем в точках CSS карты, холст — в точках экрана
  ctx.fillStyle = "#05080c"; ctx.fillRect(0, 0, cv._cw, cv._ch);
  ctx.imageSmoothingEnabled = artScale() < 1; ctx.lineJoin = "round";
  const LOD = lod();
  // 1. основа клетки (готовая комбинация с улучшением — тоже основа)
  const cities = citiesFor(si), LAY = new Array(n), IMPL = new Array(n);
  for (let k = 0; k < n; k++) { if (!IV[k]) continue;
    const v = V[k];
    if (!v.rev) continue;
    const c = centerOf(kx(k), ky(k));
    // ×2: местность без улучшения; улучшение — отдельным приглушённым слоем (IMPL) поверх
    const L = LAY[k] = cellLayers(st, k, v, cities.has(k) || LOD < 2);
    if (LOD < 2 && !cities.has(k) && v.imp >= 0) IMPL[k] = cellLayers(st, k, v, false);
    hexPath(c[0], c[1], ctx, R + 0.4); ctx.fillStyle = tileFill(st, k, T("feat", v.feat)); ctx.fill();
    putTile(L.base, c[0], c[1], false);
  }
  // 1а. лёгкая заливка земли владельца (как у ffaciv — оттенок внутри границы)
  for (let k = 0; k < n; k++) { if (!IV[k]) continue;
    const v = V[k];
    if (!v.rev || v.own < 0) continue;
    const c = centerOf(kx(k), ky(k));
    hexPath(c[0], c[1]); ctx.fillStyle = (colorOf.get(v.own) || "#889") + "2e"; ctx.fill();
  }
  // 1б. сетка — тонкие края клеток
  ctx.strokeStyle = "rgba(20,24,18,.28)"; ctx.lineWidth = Math.max(0.6, R * 0.03);
  for (let k = 0; k < n; k++) { if (!IV[k]) continue; if (!V[k].rev) continue; const c = centerOf(kx(k), ky(k)); hexPath(c[0], c[1]); ctx.stroke(); }
  // 2. реки
  for (let k = 0; k < n; k++) { if (!IV[k]) continue;
    const rv = PK.riv[k];
    if (!rv || !V[k].rev) continue;
    const c = centerOf(kx(k), ky(k));
    for (const pair of [[1, 2], [2, 3], [4, 1]]) {
      if (!(rv & pair[0])) continue;
      const a0 = Math.PI / 180 * (-30 - 60 * pair[1]);
      ctx.beginPath();
      ctx.moveTo(c[0] + R * Math.cos(a0), c[1] + R * Math.sin(a0));
      ctx.lineTo(c[0] + R * Math.cos(a0 + Math.PI / 3), c[1] + R * Math.sin(a0 + Math.PI / 3));
      ctx.strokeStyle = "#1d4f7a"; ctx.lineWidth = Math.max(2.2, R * 0.2); ctx.stroke();
      ctx.strokeStyle = "#4f9fd8"; ctx.lineWidth = Math.max(1.4, R * 0.12); ctx.stroke();
    }
  }
  // 3. дороги: от центра к соседям с дорогой (земляная — коричневая, железная — тёмная со шпалами)
  ctx.lineCap = "round";
  for (let k = 0; k < n; k++) { if (!IV[k]) continue;
    if (V[k].rt < 0 || !V[k].rev) continue;
    const x = kx(k), y = ky(k), c = centerOf(x, y), rail = T("route", V[k].rt) === "RAILROAD";
    for (let dir = 0; dir < 6; dir++) {
      const nk = neighbor(x, y, dir);
      if (nk < 0 || V[nk].rt < 0 || !V[nk].rev || cityAtK(nk)) { continue; }
      const d = centerOf(kx(nk), ky(nk));
      if (Math.abs(d[0] - c[0]) > W * 2) continue;
      const mx = (c[0] + d[0]) / 2, my = (c[1] + d[1]) / 2;
      ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(mx, my);
      ctx.strokeStyle = rail ? "#1b1d22" : "#5b4128"; ctx.lineWidth = Math.max(1.8, R * (rail ? 0.2 : 0.17)); ctx.stroke();
      ctx.strokeStyle = rail ? "#8a8f98" : "#b08a5a"; ctx.lineWidth = Math.max(1, R * (rail ? 0.07 : 0.1)); ctx.stroke();
    }
  }
  ctx.lineCap = "butt";
  // 4. накладки по рядам сверху вниз (выступающее вверх ложится на ряд выше, ряд ниже — поверх):
  //    основа выше клетки (горы, готовые комбинации) ещё раз «с шапкой», холм, особенность, улучшение
  for (let row = PK.h - 1; row >= 0; row--) {
    for (let x = 0; x < PK.w; x++) {
      const k = key(x, row), L = LAY[k];
      if (!L) continue;
      const c = centerOf(x, row), br = artRect(L.base);
      if (br && br[3] > 29) putTile(L.base, c[0], c[1], true);
      for (const o of L.over) {
        if (typeof o === "string") { putTile(o, c[0], c[1], true); continue; }
        const ic = LOD >= 2 && iconRect("imp", o.icon), s2 = R * 0.5;   // нет рисунка — игровой значок улучшения (только близко)
        if (ic) { ctx.imageSmoothingEnabled = true; ctx.drawImage(SHEETS.imp, ic.x, 0, ic.w, ic.h, c[0] - s2 / 2, c[1] - s2 / 2, s2, s2); ctx.imageSmoothingEnabled = false; }
      }
      const IL = IMPL[k];
      if (IL) {                                                    // ×2: улучшение приглушённо
        ctx.globalAlpha = 0.45;
        putTile(IL.base, c[0], c[1], true);
        for (const o of IL.over) if (typeof o === "string") putTile(o, c[0], c[1], true);
        ctx.globalAlpha = 1;
      }
      // «разграблено» на карте не рисуется (было красным крестиком) — это в подсказке клетки
    }
  }
  // 5. ресурсы — игровые значки в кружке, в нижнем левом углу клетки (как у ffaciv)
  if (show.icons && LOD >= 1) {
    for (let k = 0; k < n; k++) { if (!IV[k]) continue;
      const v = V[k];
      if (!v.rev || cities.has(k)) continue;
      const rs = T("res", v.res); if (!rs) continue;
      const ic = iconRect("res", rs); if (!ic) continue;
      const c = centerOf(kx(k), ky(k)), s = Math.max(9, R * 0.4), px = c[0] + R * 0.44, py = c[1] - R * 0.38;
      ctx.imageSmoothingEnabled = true;
      ctx.beginPath(); ctx.arc(px, py, s / 2 + 1.2, 0, 7); ctx.fillStyle = "#f3efe4"; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = "#2a2a22"; ctx.stroke();
      ctx.drawImage(SHEETS.res, ic.x, 0, ic.w, ic.h, px - s / 2, py - s / 2, s, s);
      ctx.imageSmoothingEnabled = false;
    }
  }
  // 6. тепловая карта
  if (show.heat) drawHeat(V);
  // 7. границы: толстая линия цвета державы, сдвинутая внутрь клетки, с тёмной подложкой
  for (let k = 0; k < n; k++) { if (!IV[k]) continue;
    const own = V[k].own;
    if (own < 0 || !V[k].rev) continue;
    const x = kx(k), y = ky(k), c = centerOf(x, y), col = colorOf.get(own) || "#889", ri = R * 0.9;
    for (let dir = 0; dir < 6; dir++) {
      const nk = neighbor(x, y, dir);
      if (nk >= 0 && V[nk].own === own && V[nk].rev) continue;
      const a0 = Math.PI / 180 * (-30 - 60 * dir);
      const x0 = c[0] + ri * Math.cos(a0), y0 = c[1] + ri * Math.sin(a0);
      const x1 = c[0] + ri * Math.cos(a0 + Math.PI / 3), y1 = c[1] + ri * Math.sin(a0 + Math.PI / 3);
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(10,12,16,.55)"; ctx.lineWidth = Math.max(2.4, R * 0.2);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.6, R * 0.12); ctx.stroke();
      ctx.lineCap = "butt";
    }
  }
  // 7а. выход клеток (из сейва): точки цвета выхода внизу клетки, только близко и только на видимых клетках
  if (show.yields && PK.yields && LOD >= 2) drawYields(V, cities);
  // 8. туман
  if (viewTeam() >= 0) {
    ctx.fillStyle = "rgba(4,7,11,.5)";
    for (let k = 0; k < n; k++) { if (!IV[k]) continue; if (!V[k].rev || V[k].vis) continue; const c = centerOf(kx(k), ky(k)); hexPath(c[0], c[1], ctx, R + 0.5); ctx.fill(); }
  }
  // 9. рабочие клетки выбранного города
  if (card && card.kind === "city") {
    const c = cities.get(card.k);
    if (c) for (const k of (c.w || [])) {
      const p = centerOf(kx(k), ky(k));
      ctx.beginPath(); ctx.arc(p[0], p[1] + R * 0.62, Math.max(2, R * 0.16), 0, 7);
      ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = "#0b1119"; ctx.stroke();
    }
  }
  // 10. города: здания города по эпохе владельца + плашка как в игре
  for (const [k, c] of cities) {
    const p = centerOf(kx(k), ky(k));
    if (!V[k].rev) continue;
    const ck = artFind(["F/Tiles/"], "City center-" + ART_ERAS[eraOf(c.o)]) || artFind(["F/Tiles/"], "City center");
    if (!artOver(ctx, ck, p[0], p[1])) { ctx.beginPath(); ctx.arc(p[0], p[1], R * 0.5, 0, 7); ctx.fillStyle = colorOf.get(c.o) || "#99a"; ctx.fill(); }
  }
  ctx.imageSmoothingEnabled = true;
  // плашки городов рисуются поверх юнитов — на слое юнитов (unitsFrame), чтобы флажки их не закрывали
}
const cityAtK = k => { const cs = citiesFor(si); return cs && cs.has(k); };
// Плашка города: [жители] ★ ИМЯ, щит обороны над ней, полоска повреждения под ней
// Плашка города: [жители] ИМЯ ★, щит обороны (близко), полоска повреждения. Плашки не накладываются:
// раскладываются по важности (столицы держав, потом по числу жителей), не влезающая — не рисуется.
function drawBanners(cities, g) {
  if (!show.names || R < 6) return;
  g.textAlign = "center"; g.textBaseline = "middle";
  const sel = card && card.kind === "city" ? card.k : -1, LOD = lod(), placed = [];
  const fs = Math.max(10, Math.min(15, Math.round(R * 0.3 + 6)));
  const list = [...cities].map(([k, c]) => ({ k, c, major: (playerBy.get(c.o) || {}).kind === "major" }))
    .sort((a, b) => ((b.c.fl & 1) && b.major) - ((a.c.fl & 1) && a.major) || b.major - a.major || b.c.pop - a.c.pop);
  for (const { k, c, major } of list) {
    const pos = centerOf(kx(k), ky(k)), cx = pos[0], cy = pos[1], col = colorOf.get(c.o) || "#99a";
    const nm = String(c.n || "город").toUpperCase();
    g.font = "800 " + fs + "px system-ui, sans-serif";
    const tw = g.measureText(nm).width, bh = Math.round(fs * 1.5);
    const ps = String(c.pop), pw = Math.max(bh, g.measureText(ps).width + 10);
    const star = (c.fl & 1) && major ? fs : 0;
    const bw = Math.round(pw + tw + star + 14), bx = Math.round(cx - bw / 2), by = Math.round(cy + R * 0.5);
    const box = [bx - 2, by - 2, bx + bw + 2, by + bh + 2];
    if (placed.some(p => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1])) continue;   // мешает более важной
    placed.push(box);
    const rr = bh / 2;
    g.beginPath(); g.roundRect ? g.roundRect(bx, by, bw, bh, rr) : g.rect(bx, by, bw, bh);
    g.fillStyle = (c.fl & 4) ? "#4a2a2af0" : (c.fl & 2) ? "#3a4048f0" : "#161b22f0"; g.fill();
    g.lineWidth = 2; g.strokeStyle = col; g.stroke();
    g.beginPath(); g.roundRect ? g.roundRect(bx + 2, by + 2, pw - 4, bh - 4, rr - 2) : g.rect(bx + 2, by + 2, pw - 4, bh - 4);
    g.fillStyle = col; g.fill();
    g.fillStyle = lum(col) > 0.62 ? "#0b1119" : "#ffffff"; g.fillText(ps, bx + pw / 2, by + bh / 2 + 0.5);
    g.fillStyle = (c.fl & 4) ? "#ffb3a8" : "#f3f7fb";
    g.fillText(nm, bx + pw + 5 + tw / 2, by + bh / 2 + 0.5);
    if (star) { g.fillStyle = "#f2d06b"; g.fillText("★", bx + pw + 7 + tw + star / 2, by + bh / 2); }
    if (c.str > 0 && LOD >= 2) {                     // оборона города — щит над плашкой, только близко
      const sv = "⛊ " + Math.round(c.str / 100);
      g.font = "700 " + Math.round(fs * 0.82) + "px system-ui, sans-serif";
      const sw = g.measureText(sv).width + 10, sh = Math.round(bh * 0.74), sx = Math.round(cx - sw / 2), sy = by - sh - 1;
      g.beginPath(); g.roundRect ? g.roundRect(sx, sy, sw, sh, 4) : g.rect(sx, sy, sw, sh);
      g.fillStyle = "#161b22e6"; g.fill();
      g.fillStyle = "#e8eef6"; g.fillText(sv, cx, sy + sh / 2 + 0.5);
      placed.push([sx, sy, sx + sw, sy + sh]);
    }
    if (c.dmg > 0) { g.fillStyle = "#0b1119"; g.fillRect(bx + rr, by + bh + 1, bw - 2 * rr, 3); g.fillStyle = "#D9534F"; g.fillRect(bx + rr, by + bh + 1, (bw - 2 * rr) * Math.min(1, c.dmg / 200), 3); }
    if (k === sel) { g.beginPath(); g.arc(cx, cy, R * 0.98, 0, 7); g.lineWidth = 2.4; g.strokeStyle = "#76C6C0"; g.stroke(); }
  }
}
// Выход клетки (как его хранит игра в сейве): точки цвета выхода внизу клетки, до 4 видов; больше 3 —
// точка с числом. Под туманом выбранного игрока не показывается; на ходу «по журналу» — с прошлого сейва.
const YCOL = { yf: "#7ccf4a", yp: "#e0873a", yg: "#f0cf45", ys: "#5aa8f0", yc: "#c07ae6", yr: "#f2f2f2" };
const YRU = { yf: "еда", yp: "производство", yg: "золото", ys: "наука", yc: "культура", yr: "вера" };
function drawYields(V, cities) {
  // Один путь на цвет (7 заливок на всю карту вместо тысяч) — перерисовка вблизи дешевле.
  const st = S[si], t = viewTeam(), f = t >= 0 ? st.F[String(t)] : null, n = PK.w * PK.h;
  const r = Math.max(1.8, R * 0.07), gap = r * 2.4, KEYS = ["yf", "yp", "yg", "ys", "yc", "yr"];
  const bg = new Path2D(), path = {}, nums = [];
  for (const yk of KEYS) path[yk] = new Path2D();
  for (let k = 0; k < n; k++) { if (!IV[k]) continue;
    if (!V[k].rev || (f && !f.vis[k]) || cities.has(k)) continue;
    let cnt = 0, wsum = 0;
    for (const yk of KEYS) { const v = st.P[yk][k]; if (v > 0 && cnt < 4) { cnt++; wsum += (v > 3 ? 2 : v) * gap + gap * 0.6; } }
    if (!cnt) continue;
    const c = centerOf(kx(k), ky(k));
    let x = c[0] - wsum / 2 + gap / 2, y = c[1] + R * 0.7, m4 = 0;
    bg.rect(c[0] - wsum / 2 - r * 0.6, y - r * 1.6, wsum + r * 1.2, r * 3.2);
    for (const yk of KEYS) {
      const v = st.P[yk][k];
      if (v <= 0 || m4 === 4) continue;
      m4++;
      const m = v > 3 ? 1 : v;
      for (let i = 0; i < m; i++) { path[yk].rect(x - r, y - r, r * 2, r * 2); x += gap; }
      if (v > 3) { nums.push([yk, v, x, y]); x += gap; }
      x += gap * 0.6;
    }
  }
  ctx.fillStyle = "rgba(10,12,16,.6)"; ctx.fill(bg);
  for (const yk of KEYS) { ctx.fillStyle = YCOL[yk]; ctx.fill(path[yk]); }
  if (nums.length) {
    ctx.font = "700 " + Math.round(r * 3.2) + "px system-ui,sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const [yk, v, x, y] of nums) { ctx.fillStyle = YCOL[yk]; ctx.fillText(String(v), x, y + 0.5); }
  }
}
const A_CIVV = { MAYA: "The Maya", HUNS: "The Huns", OTTOMAN: "The Ottomans", AZTEC: "Aztecs", MONGOL: "Mongolia" };
const civShort = p => String((playerBy.get(p) || {}).civ || "").replace(/^CIVILIZATION_/, "");
// Ключ картинки юнита: облик державы («Hoplite-Greece»), облик эпохи («Worker-Industrial era» — последний не позже эпохи владельца).
function unitArtKey(p, type, emb, water) {
  if (emb) {
    const base = "EmbarkedUnit-" + (emb & 2 ? "Civilian" : "Military");
    for (let e = eraOf(p); e >= 0; e--) { const k = ART.lc.get(("A/Units/" + base + "-" + ART_ERAS[e]).toLowerCase()); if (k) return k; }
    return ART.lc.get(("A/Units/" + base).toLowerCase()) || ART.lc.get(("F/Units/" + base).toLowerCase()) || null;
  }
  const k = artFind(["A/Units/", "F/Units/"], T("unit", type), A_UNIT);
  if (!k) return null;
  const cv = civShort(p), cn = A_CIVV[cv] || title(cv);
  const byCiv = cn && ART.lc.get((k + "-" + cn).toLowerCase());
  if (byCiv) return byCiv;
  for (let e = eraOf(p); e > 0; e--) { const ke = ART.lc.get((k + "-" + ART_ERAS[e]).toLowerCase()); if (ke) return ke; }
  return k;
}
// Слой раскраски: «-1» — цвет державы, «-2» — светлый второй цвет.
// Слой раскраски: «-1» — цвет державы, «-2» — светлый второй цвет. w, h — в точках экрана.
function tintedFigure(key, p, w, h, smooth) {
  const r = artRect(key);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); g.imageSmoothingEnabled = !!smooth;
  g.drawImage(ART.img, r[0], r[1], r[2], r[3], 0, 0, w, h);
  const col = colorOf.get(p) || "#8899aa";
  for (const [suf, cc] of [["-1", col], ["-2", "#efe9da"]]) {
    const lk = ART.lc.get((key + suf).toLowerCase());
    const lr = lk && artRect(lk); if (!lr) continue;
    const t = document.createElement("canvas"); t.width = w; t.height = h;
    const tg = t.getContext("2d"); tg.imageSmoothingEnabled = !!smooth;
    tg.drawImage(ART.img, lr[0], lr[1], lr[2], lr[3], 0, 0, w, h);
    tg.globalCompositeOperation = "multiply"; tg.fillStyle = cc; tg.fillRect(0, 0, w, h);
    tg.globalCompositeOperation = "destination-in"; tg.drawImage(ART.img, lr[0], lr[1], lr[2], lr[3], 0, 0, w, h);
    g.drawImage(t, 0, 0);
  }
  return c;
}
const FORM = {
  5: [[-0.44, -0.18], [0.0, -0.24], [0.44, -0.16], [-0.24, 0.1], [0.24, 0.12]],
  3: [[-0.36, -0.1], [0.36, -0.08], [0, 0.14]],
  2: [[-0.24, -0.04], [0.24, 0.04]],
  1: [[0, 0]],
};
function unitArt(p, type, fl, hp) {
  const emb = (fl & UF.EMB) ? ((fl & (UF.CIV | UF.GP)) ? 3 : 1) : 0;
  const key = unitArtKey(p, type, emb);
  if (!key) return null;
  const r = artRect(key), fromA = key.startsWith("A/"), civ = fl & (UF.CIV | UF.GP);
  const naval = /Trireme|Galley|Galleass|Caravel|Frigate|Ship|Ironclad|Destroyer|Battleship|Submarine|Carrier|Cruiser|Work Boats|Privateer|Dromon|Quinquereme|\/Nau|Sea Beggar|Turtle|Embarked/i.test(key);
  const gun = /Gun|Artillery|Cannon|Catapult|Trebuchet|Ballista|Hwach|Rocket|SAM|Battering|Siege/i.test(key);
  const mounted = /Horse|Cavalry|Knight|Chariot|Lancer|Cataphract|Keshik|Hussar|Conquistador|Cossack|Sipahi|Elephant|Hakkapeliitta|Camel|Companion|Mandekalu|Tank|Panzer|Armor|Landship|Robot|Mechanized|Khan|Comanche|Berber/i.test(key);
  const M = civ || emb || naval ? 1 : gun ? 2 : mounted ? 3 : 5;
  const n = Math.max(1, Math.min(M, Math.ceil(M * Math.max(1, hp) / 100)));
  const D = DPR(), Rd = R * D;
  if (ART.tintR !== Rd) { for (const k of [...ART.tint.keys()]) if (k[0] === "q") ART.tint.delete(k); ART.tintR = Rd; }
  const kk = "q|" + p + "|" + key + "|" + n;
  if (ART.tint.has(kk)) return ART.tint.get(kk);
  // картинки отрядов обрезаны по содержимому: один масштаб на всех (воин 45 точек в высоту → 0,55 R),
  // одиночки (гражданские, корабли) — крупнее; фигурки Fantasy Hex (32×28) — по масштабу тайла
  // в точках экрана; увеличение ≥ 1 — целое (чётко), меньше 1 — уменьшение со сглаживанием
  let px = fromA ? Rd * 0.72 / 45 * (M === 1 ? (naval ? 1.15 : 1.25) : M === 2 ? 1.1 : 1) : artScale() * 0.8;
  if (px >= 0.85) px = Math.max(1, Math.round(px));
  const fw = Math.max(1, Math.round(r[2] * px)), fh = Math.max(1, Math.round(r[3] * px));
  const w = Math.ceil(W * D * 1.25), h = Math.ceil(fh + Rd * 0.7) + 2;
  const fig = tintedFigure(key, p, fw, fh, px < 1);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
  const pts = (FORM[M] || FORM[1]).slice(0, n).map(q => q.slice()).sort((a, b) => a[1] - b[1]);
  for (const q of pts) g.drawImage(fig, Math.round(w / 2 + q[0] * Rd - fig.width / 2), Math.round(h - Rd * 0.32 + q[1] * Rd - fig.height), fig.width, fig.height);
  c._w = w / D; c._h = h / D; c._by = (h - Rd * 0.32) / D;     // в точках CSS; _by — «земля» строя от верха картинки
  ART.tint.set(kk, c);
  return c;
}
function styleUi() {
  for (const b of document.querySelectorAll("[data-style]")) {
    const on = b.dataset.style === style;
    b.setAttribute("aria-checked", on ? "true" : "false");
    b.disabled = b.dataset.style === "drawn" && ART.failed;
  }
  const note = $("styleNote"); if (note) note.textContent = style === "drawn" && ART.failed ? "рисованные тайлы не загрузились — показан плоский вид" : "";
}
function setStyle(v) {
  style = v === "flat" ? "flat" : "drawn";
  try { localStorage.setItem("rf-style", style); } catch (e) { /* без хранилища */ }
  if (style === "drawn") loadArt();
  sprites.clear(); shields.clear(); FRAME = null;
  styleUi();
  if (PK) { resize(); drawMap(); unitsDraw(); }
}

// ---------------------------------------------------------------- журнал событий под картой (вкладки как у ffaciv)
// Строки шага i считаются из разницы шагов i−1 → i: ходы юнитов (только где юнит «свежий» на обоих концах),
// бои журнала 118, гибель юнитов, новые улучшения и дороги, рост и здания городов, события шкалы.
const LOG_TABS = [["all", "Всё"], ["war", "Война"], ["exp", "Расширение"], ["bld", "Строители"], ["city", "Города"], ["emp", "Держава"], ["dip", "Дипломатия"]];
let logTab = "all", logMin = false;
try { const v = localStorage.getItem("rf-logmin"); logMin = v == null ? matchMedia("(max-width:700px)").matches : v === "1"; } catch (e) { /* развёрнут */ }
try { const v = localStorage.getItem("rf-logtab"); if (LOG_TABS.some(t => t[0] === v)) logTab = v; } catch (e) { /* по умолчанию */ }
const LOGC = new Map();
const who = p => '<b style="color:' + (colorOf.get(p) || "#ccd") + '">' + esc(nameOf(p)) + "</b>";
const at = k => " <span class='l'>" + kx(k) + "," + ky(k) + "</span>";
function logOf(i) {
  if (LOGC.has(i)) return LOGC.get(i);
  const out = [];
  if (i <= 0) { LOGC.set(i, out); return out; }
  const a = S[i - 1], b = S[i], T0 = turnOf(i), ms = PK.ms ? PK.ms[i] : null;
  const add = (tab, k, p, html, m) => out.push({ tab, k, p, html, ms: m != null && m > 0 ? m : ms });   // 0 у сообщений повтора — «время неизвестно»
  // юниты: ход, появление, гибель
  const ca = a.C, cb = b.C;
  for (const [kk, u] of b.U) {
    const o = a.U.get(kk), name = esc(typeName("unit", T("unit", u[2])));
    const k = key(u[3], u[4]);
    if (!o) {
      if (cb.has(k) && cb.get(k).o === u[0]) add((u[6] & (UF.CIV | UF.GP)) ? "city" : "war", k, u[0], who(u[0]) + ": " + name + " — готов" + at(k));
      continue;
    }
    const k0 = key(o[3], o[4]);
    if (k0 !== k && uFresh(i, u[0]) && uFresh(i - 1, u[0])) {
      const d = hexDist(k0, k), civ = u[6] & (UF.CIV | UF.GP), settler = /SETTLER/.test(T("unit", u[2]) || "");
      add(settler ? "exp" : civ ? "bld" : "war", k, u[0], who(u[0]) + ": " + name + " — " + pl(d, ["клетка", "клетки", "клеток"]) + " →" + at(k));
    }
    if (u[5] < o[5] && !CMB.size) add("war", k, u[0], who(u[0]) + ": " + name + " ранен (" + o[5] + " → " + u[5] + ")" + at(k));
  }
  for (const [kk, o] of a.U) {
    if (b.U.has(kk) || !uFresh(i, o[0])) continue;
    const k = key(o[3], o[4]), name = esc(typeName("unit", T("unit", o[2]))), ty = T("unit", o[2]) || "";
    if (/SETTLER/.test(ty) && cb.has(k) && !ca.has(k)) continue;                  // основал город — это строка «Расширение»
    if (!(o[6] & (UF.CIV | UF.GP))) add("war", k, o[0], who(o[0]) + ": потеря — " + name + at(k));
  }
  // бои 118
  for (const e of combatsAt(i)) {
    const bk = e.dx >= 0 ? e.dx : e.ax;
    const an = e.at >= 0 ? esc(typeName("unit", T("unit", e.at)) || "") : "";
    const verb = (e.k & 64) ? "уничтожил" : (e.k & 1) ? "обстрелял" : "атаковал";
    add("war", bk, e.ap, (e.ap >= 0 ? who(e.ap) : "?") + (an ? " (" + an + ")" : "") + " " + verb + " " + (e.dp >= 0 ? who(e.dp) : "?") +
      ((e.k & 32) ? " — город" : "") + (e.dd > 0 ? " <span class='l'>−" + e.dd + "</span>" : "") + (bk >= 0 ? at(bk) : ""));
  }
  // улучшения и дороги (только на шагах-сейвах: карта есть только там)
  if (isSaveStep(i)) {
    const n = PK.w * PK.h;
    for (let k = 0; k < n; k++) {
      const im0 = a.P.imp[k], im1 = b.P.imp[k], own = b.P.own[k];
      if (im1 >= 0 && im1 !== im0 && !cb.has(k)) add("bld", k, own, (own >= 0 ? who(own) : "Ничья земля") + ": " + esc(typeName("imp", T("imp", im1))) + at(k));
      else if (im1 >= 0 && im1 === im0 && b.P.ip[k] && !a.P.ip[k]) add("war", k, own, "Разграблено: " + esc(typeName("imp", T("imp", im1))) + at(k));
      if (b.P.rt[k] >= 0 && a.P.rt[k] !== b.P.rt[k] && !cb.has(k)) add("bld", k, own, (own >= 0 ? who(own) : "Ничья земля") + ": " + (T("route", b.P.rt[k]) === "RAILROAD" ? "железная дорога" : "дорога") + at(k));
    }
    for (const [k, c] of cb) {
      const o = ca.get(k);
      if (!o || o.o !== c.o) continue;
      if (c.pop > o.pop) add("city", k, c.o, who(c.o) + ": " + esc(c.n) + " растёт до " + c.pop);
      for (const bi of c.b) if (o.b.indexOf(bi) < 0) add(PK.wonders.indexOf(bi) >= 0 ? "emp" : "city", k, c.o, who(c.o) + ": " + esc(c.n) + " строит " + esc(typeName("bld", T("bld", bi))));
    }
    for (const t in b.TM) {
      const r1 = b.TM[t], r0 = a.TM[t];
      if (!r0 || r1.tech == null || r0.tech == null || r1.tech <= r0.tech) continue;
      const p = majors().find(pp => String(pp.team) === t);
      if (p) add("emp", -1, p.i, who(p.i) + ": " + pl(r1.tech - r0.tech, ["новая технология", "новые технологии", "новых технологий"]) + " (всего " + r1.tech + ")");
    }
  }
  // события шкалы этого хода
  for (const e of PK.ev) {
    if (e.t !== T0 || stepOfTurn(e.t) !== i) continue;
    const tab = e.k === "war" || e.k === "peace" || e.k === "left" || e.k === "dead" ? "dip" : e.k === "found" ? "exp" : e.k === "capt" || e.k === "raze" ? "war" : "emp";
    add(tab, e.c != null ? e.c : -1, e.p != null ? e.p : null, evText(e), null);   // e.ms — время внутри хода, а в журнале — время партии
    out[out.length - 1].major = true; out[out.length - 1].kind = e.k;
    if (e.a != null && e.p == null) out[out.length - 1].tm = [e.a, e.b];   // war/peace/era/dead: a, b — команды
  }
  LOGC.set(i, out);
  return out;
}
function renderLog() {
  const box = $("log");
  if (!box) return;
  box.hidden = !show.log || !PK;
  if (box.hidden) return;
  box.classList.toggle("min", logMin);
  $("logMin").textContent = logMin ? "Журнал ▸" : "▾";
  $("logMin").setAttribute("aria-expanded", logMin ? "false" : "true");
  if (logMin) return;
  $("logTabs").innerHTML = LOG_TABS.map(t => '<button type="button" data-ltab="' + t[0] + '" aria-pressed="' + (t[0] === logTab) + '">' + t[1] + "</button>").join("");
  const t = viewTeam(), f = t >= 0 ? S[si].F[String(t)] : null, rows = [];
  // строк 7; если крупных событий на этом шаге больше — показываются все крупные (до 12)
  const nMaj = logOf(si).filter(e => e.major && (logTab === "all" || e.tab === logTab)).length, LIM = Math.min(12, Math.max(7, nMaj));
  for (let i = si; i > 0 && rows.length < LIM && i > si - 6; i--) {
    const L0 = logOf(i).filter(e => (logTab === "all" || e.tab === logTab) &&
      (!f || (e.p != null && teamOf.get(e.p) === t) || (e.tm && e.tm.indexOf(t) >= 0) || (e.k >= 0 && f.vis[e.k])));   // глазами игрока: свои — всегда, чужие — только на видимых клетках
    // крупные (войны, мир, города…) — в первую очередь; среди них выше те, где обе стороны — державы, и своя команда
    // гибель державы, выход игрока, взятые/сожжённые города, чудеса — выше всего; войны и мир между державами —
    // ниже; эпохи; войны и мир с городами-государствами — последними. Своя команда — на ступень выше.
    const KR = { dead: 6, left: 6, capt: 5, raze: 5, wonder: 5, era: 2 };
    const rank = e => !e.major ? 0 : (KR[e.kind] || (e.tm && e.tm.every(x => majors().some(p => p.team === x)) ? 4 : 1)) +
      (t >= 0 && ((e.tm && e.tm.indexOf(t) >= 0) || (e.p != null && teamOf.get(e.p) === t)) ? 1 : 0);
    const L = L0.slice().sort((a, b) => rank(a) - rank(b));
    for (let j = L.length - 1; j >= 0 && rows.length < LIM; j--) rows.push(Object.assign({ step: i }, L[j]));
  }
  rows.reverse();
  const hm = ms => { if (ms == null || ms < 0) return ""; const m = Math.floor(ms / 60000); return Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0"); };
  const TI = { war: "⚔", exp: "◉", bld: "⚒", city: "▣", emp: "✦", dip: "⚑" };
  $("logList").innerHTML = rows.length ? rows.map(r => '<div class="lr' + (r.step === si ? " now" : "") + '"><span class="lt">' + hm(r.ms) +
    '</span><span class="li">' + (TI[r.tab] || "·") + "</span><span>" + r.html + "</span></div>").join("") : '<div class="lr empty">На этих ходах ничего.</div>';
}

// ---------------------------------------------------------------- тепловая карта боёв
// По сейвам: потеря здоровья юнита между соседними ходами (там, где он стоит теперь) и гибель
// военного юнита (исчез, и это не улучшение и не основание города) — в его последней клетке.
// Есть бои журнала 118 — к ним прибавляется урон из них. Сумма с начала записи по этот ход.
let HEAT = null;
function deathsAt(i) {
  if (i <= 0) return [];
  const a = S[i - 1], b = S[i], out = [];
  for (const [kk, u] of a.U) {
    if (b.U.has(kk)) continue;
    const k = key(u[3], u[4]);
    if (u[6] & (4 | 8)) {                    // гражданский / великий человек
      if (b.C.has(k) && !a.C.has(k)) out.push({ u, k, why: "found" });
      else out.push({ u, k, why: (u[6] & 8) ? "used" : "gone" });
      continue;
    }
    let up = null;
    for (const v of b.U.values()) if (v[0] === u[0] && v[3] === u[3] && v[4] === u[4] && !a.U.has(ukey(v[0], v[1]))) { up = v; break; }
    out.push(up ? { u, k, why: "upgrade", to: up } : { u, k, why: "lost" });
  }
  return out;
}
function heatAt(i) {
  if (!HEAT) HEAT = [new Float32Array(PK.w * PK.h)];
  while (HEAT.length <= i) {
    const j = HEAT.length, h = HEAT[j - 1].slice(), a = S[j - 1], b = S[j];
    for (const [kk, u] of b.U) {
      const p = a.U.get(kk);
      if (p && p[5] > u[5]) h[key(u[3], u[4])] += p[5] - u[5];
    }
    for (const d of deathsAt(j)) if (d.why === "lost") h[d.k] += 100;
    for (const c of combatsAt(j)) {
      if (c.dx >= 0 && c.dd > 0) h[c.dx] += c.dd * 0.5;
      if (c.ax >= 0 && c.ad > 0) h[c.ax] += c.ad * 0.5;
    }
    HEAT.push(h);
  }
  return HEAT[i];
}
function drawHeat(V) {
  const h = heatAt(si);
  let mx = 0; for (let k = 0; k < h.length; k++) if (h[k] > mx) mx = h[k];
  if (mx <= 0) return;
  for (let k = 0; k < h.length; k++) {
    if (h[k] <= 0 || !V[k].rev || !IV[k]) continue;
    const s = Math.sqrt(h[k] / mx), c = centerOf(kx(k), ky(k));
    const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], R * (1.1 + s * 1.3));
    g.addColorStop(0, "rgba(255," + Math.round(150 - 110 * s) + ",40," + (0.35 + 0.5 * s).toFixed(3) + ")");
    g.addColorStop(1, "rgba(255,90,40,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c[0], c[1], R * (1.1 + s * 1.3), 0, 7); ctx.fill();
  }
}
// Бои журнала (118) — если экспорт их дал. Ход боя = ход, после которого снят сейв.
let CMB = new Map();
function parseCombats() {
  CMB = new Map();
  const cm = PK.cmb; if (!cm || !Array.isArray(cm.cols)) return;
  const NMS = ["turn", "n", "k", "ap", "au", "at", "ax", "ahb", "aha", "am", "dp", "du", "dt", "dx", "dhb", "dha", "dm"];
  const CI = {}; for (const nm of NMS) CI[nm] = cm.cols.indexOf(nm);
  if (CI.turn < 0 || CI.dx < 0) return;
  for (const r of (cm.rows || [])) {
    const e = {}; for (const nm of NMS) e[nm] = CI[nm] >= 0 ? r[CI[nm]] : -1;
    e.ad = e.ahb >= 0 && e.aha >= 0 ? e.ahb - e.aha : -1; e.dd = e.dhb >= 0 && e.dha >= 0 ? e.dhb - e.dha : -1;
    if (!CMB.has(e.turn)) CMB.set(e.turn, []);
    CMB.get(e.turn).push(e);
  }
}
const combatsAt = i => CMB.get(turnOf(i)) || [];

// ---------------------------------------------------------------- юниты
const UF = { EMB: 1, FORT: 2, CIV: 4, GP: 8, CARGO: 16, GARR: 32 };
const uv = $("uv"), uctx = uv.getContext("2d");
let anim = null, unFrameReq = 0, unHits = [];
let speed = 2, smooth = true;
const SPEEDS = [0, 1, 2, 4, 7];
const UPERF = { frames: 0, drawMs: 0, maxDraw: 0, gaps: [], last: 0, units: 0 };
window.__rfPerf = UPERF;
try {
  const s = localStorage.getItem("rf.speed"); if (s != null && SPEEDS.includes(+s)) speed = +s;
  const m = localStorage.getItem("rf.smooth"); if (m != null) smooth = m === "1";
} catch (e) { /* без хранилища — по умолчанию */ }

function hexSteps(k0, k1) {
  const x0 = kx(k0), y0 = ky(k0), x1 = kx(k1), y1 = ky(k1), q0 = x0 - half(y0);
  let best = null;
  for (const w of (PK.wrapX ? [0, PK.w, -PK.w] : [0])) {
    const q1 = x1 + w - half(y1), dq = q1 - q0, dr = y1 - y0;
    const d = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
    if (!best || d < best.d) best = { d, q1 };
  }
  const N = best.d, pts = [];
  if (N > 14) { pts.push(centerOf(x0, y0)); pts.push(centerOf(best.q1 + half(y1), y1)); return pts; }
  for (let i = 0; i <= N; i++) {
    const s = N ? i / N : 0;
    const q = q0 + (best.q1 - q0) * s + 1e-6, r = y0 + (y1 - y0) * s + 2e-6, c = -q - r;
    let rq = Math.round(q), rr = Math.round(r), rc = Math.round(c);
    const dq = Math.abs(rq - q), dr = Math.abs(rr - r), dc = Math.abs(rc - c);
    if (dq > dr && dq > dc) rq = -rr - rc; else if (dr > dc) rr = -rq - rc;
    pts.push(centerOf(rq + half(rr), rr));
  }
  return pts;
}
function straight(k0, k1) {
  const x0 = kx(k0), y0 = ky(k0), x1 = kx(k1), y1 = ky(k1);
  let bx = x1;
  if (PK.wrapX) for (const w of [PK.w, -PK.w]) if (Math.abs(x1 + w - x0) < Math.abs(bx - x0)) bx = x1 + w;   // через шов — короче
  return [centerOf(x0, y0), centerOf(bx, y1)];
}
function along(pts, s) {
  if (pts.length === 1 || s <= 0) return pts[0];
  if (s >= 1) return pts[pts.length - 1];
  const f = s * (pts.length - 1), i = Math.floor(f), u = f - i;
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u];
}
const ease = s => s < 0.5 ? 4 * s * s * s : 1 - Math.pow(-2 * s + 2, 3) / 2;
const sprites = new Map();
let spriteR = 0;
function flagShape(fl) {
  if (fl & UF.GARR) return 4;
  if (fl & UF.EMB) return 3;
  if (fl & (UF.CIV | UF.GP)) return 1;
  if (fl & UF.FORT) return 2;
  return 0;
}
function shapePath(g, sh, s) {
  const h = s / 2;
  g.beginPath();
  if (sh === 0) g.arc(0, 0, h, 0, 7);
  else if (sh === 1) { g.moveTo(-h * 1.02, -h * 0.78); g.lineTo(h * 1.02, -h * 0.78); g.lineTo(0, h * 1.02); g.closePath(); }
  else if (sh === 2) {
    g.moveTo(-h * 0.9, -h * 0.9); g.lineTo(h * 0.9, -h * 0.9); g.lineTo(h * 0.9, h * 0.05);
    g.quadraticCurveTo(h * 0.8, h * 0.75, 0, h * 1.02); g.quadraticCurveTo(-h * 0.8, h * 0.75, -h * 0.9, h * 0.05); g.closePath();
  } else if (sh === 3) {
    g.moveTo(-h * 0.92, -h * 0.85); g.lineTo(h * 0.92, -h * 0.85); g.lineTo(h * 0.92, h * 0.3);
    g.lineTo(0, h * 0.98); g.lineTo(-h * 0.92, h * 0.3); g.closePath();
  } else {
    const z = h * 0.34;
    g.moveTo(-h * 0.9, h * 0.9); g.lineTo(-h * 0.9, -h * 0.95); g.lineTo(-h * 0.9 + z, -h * 0.95); g.lineTo(-h * 0.9 + z, -h * 0.68);
    g.lineTo(-z / 2, -h * 0.68); g.lineTo(-z / 2, -h * 0.95); g.lineTo(z / 2, -h * 0.95); g.lineTo(z / 2, -h * 0.68);
    g.lineTo(h * 0.9 - z, -h * 0.68); g.lineTo(h * 0.9 - z, -h * 0.95); g.lineTo(h * 0.9, -h * 0.95); g.lineTo(h * 0.9, h * 0.9); g.closePath();
  }
}
const lum = hex => { const v = parseInt(String(hex).slice(1, 7), 16); return (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255; };
function flagSize() {
  if (!drawn()) return Math.round(Math.max(9, Math.min(36, R * 1.15)));
  const l = lod();                                   // ×2 — крупный значок типа по центру клетки; ×3+ — у отряда
  return l === 1 ? Math.round(Math.max(14, Math.min(46, R * 0.92))) : l === 2 ? Math.round(Math.max(10, Math.min(40, R * 0.56))) : Math.round(Math.max(10, Math.min(22, R * 1.05)));
}
// Стратегический вид: щиток цвета державы с числом юнитов на клетке.
const shields = new Map();
function shieldSprite(p, n) {
  const S2 = Math.round(Math.max(13, Math.min(24, R * 1.25))), dpr = DPR(), kk = p + "|" + n + "|" + S2 + "|" + dpr;
  if (shields.has(kk)) return shields.get(kk);
  const pad = 3, w = Math.ceil((S2 + pad * 2) * dpr), c = document.createElement("canvas"); c.width = c.height = w;
  const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, (S2 / 2 + pad) * dpr, (S2 / 2 + pad) * dpr);
  const col = colorOf.get(p) || "#8899aa", h = S2 / 2;
  g.beginPath(); g.moveTo(-h * 0.9, -h * 0.9); g.lineTo(h * 0.9, -h * 0.9); g.lineTo(h * 0.9, h * 0.1);
  g.quadraticCurveTo(h * 0.8, h * 0.8, 0, h * 1.02); g.quadraticCurveTo(-h * 0.8, h * 0.8, -h * 0.9, h * 0.1); g.closePath();
  g.shadowColor = "rgba(0,0,0,.7)"; g.shadowBlur = 3; g.fillStyle = col; g.fill(); g.shadowBlur = 0;
  g.lineWidth = Math.max(1.4, S2 * 0.1); g.strokeStyle = "#0b1119"; g.stroke();
  g.fillStyle = lum(col) > 0.62 ? "#0b1119" : "#ffffff"; g.font = "800 " + Math.round(S2 * 0.62) + "px system-ui,sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(n), 0, -h * 0.05);
  c._half = S2 / 2 + pad; shields.set(kk, c);
  return c;
}
function sprite(p, type, fl) {
  const S2 = flagSize(), dpr = Math.min(2, devicePixelRatio || 1);
  if (spriteR !== S2 * 10 + dpr) { sprites.clear(); spriteR = S2 * 10 + dpr; }
  const sh = flagShape(fl), gp = (fl & UF.GP) ? 1 : 0, kk = p + "|" + type + "|" + sh + "|" + gp;
  let c = sprites.get(kk);
  if (c) return c;
  const pad = 4, W2 = Math.ceil((S2 + pad * 2) * dpr);
  c = document.createElement("canvas"); c.width = c.height = W2;
  const g = c.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, (S2 / 2 + pad) * dpr, (S2 / 2 + pad) * dpr);
  const col = colorOf.get(p) || "#8899aa";
  shapePath(g, sh, S2);
  g.shadowColor = "rgba(0,0,0,.75)"; g.shadowBlur = Math.max(2, S2 * 0.16); g.shadowOffsetY = Math.max(1, S2 * 0.05);
  g.fillStyle = col; g.fill();
  g.shadowColor = "transparent"; g.shadowBlur = 0; g.shadowOffsetY = 0;
  g.lineWidth = Math.max(1.2, S2 * 0.09); g.strokeStyle = "#0b1119"; g.stroke();
  shapePath(g, sh, S2 - Math.max(2.4, S2 * 0.18));
  g.lineWidth = gp ? Math.max(1.4, S2 * 0.1) : Math.max(0.8, S2 * 0.05); g.strokeStyle = gp ? "#f2d06b" : "rgba(255,255,255,.35)";
  g.stroke();
  const ic = unitIconKey(T("unit", type)), img = SHEETS.unit;
  const isz = S2 * (sh === 1 ? 0.62 : 0.74), oy = sh === 1 ? -S2 * 0.16 : sh === 4 ? S2 * 0.06 : 0;
  if (ic && img && img.complete && img.naturalWidth) {
    const t = document.createElement("canvas"); t.width = t.height = Math.ceil(isz * dpr);
    const tg = t.getContext("2d");
    tg.drawImage(img, ic.x, 0, ic.w, ic.h, 0, 0, t.width, t.height);
    if (lum(col) > 0.72) { tg.globalCompositeOperation = "source-in"; tg.fillStyle = "#0b1119"; tg.fillRect(0, 0, t.width, t.height); }
    g.drawImage(t, -isz / 2, -isz / 2 + oy, isz, isz);
  } else {
    g.fillStyle = lum(col) > 0.72 ? "#0b1119" : "#f3f7fb";
    g.beginPath(); g.arc(0, oy, S2 * 0.16, 0, 7); g.fill();
  }
  c._half = S2 / 2 + pad;
  sprites.set(kk, c);
  return c;
}
// Юниты шага i, которые видит выбранная команда (свои — всегда, чужие — на видимых клетках).
function unitsOf(i) {
  const t = viewTeam(), st = S[i], f = t >= 0 ? st.F[String(t)] : null, out = [];
  for (const [kk, u] of st.U) {
    if (u[6] & UF.CARGO) continue;                           // в трюме — не рисуем отдельно
    const k = key(u[3], u[4]);
    if (f && teamOf.get(u[0]) !== t && !f.vis[k]) continue;
    out.push({ kk, u, p: u[0], type: u[2], k, hp: u[5], fl: u[6] });
  }
  return out;
}
function stackOffsets(list, cities) {
  const by = new Map();
  if (drawn()) {
    for (const u of list) { if (!by.has(u.k)) by.set(u.k, []); by.get(u.k).push(u); }
    // один маркер на клетку: военный (если есть), остальные — числом «+N» у флажка
    for (const [k, us] of by) {
      us.sort((a, b) => ((a.fl & (UF.CIV | UF.GP)) ? 1 : 0) - ((b.fl & (UF.CIV | UF.GP)) ? 1 : 0) || (a.kk < b.kk ? -1 : 1));
      const city = cities.has(k), n = us.length;
      const mil = us.filter(u => !(u.fl & (UF.CIV | UF.GP))).length;
      us.forEach((u, i) => { u.ox = 0; u.oy = (city ? -0.12 : 0) * R; u.hide = i >= 1; u.stack = i === 0 && n > 1 ? n - 1 : 0; u.mil = mil; });
    }
    return;
  }
  for (const u of list) { if (!by.has(u.k)) by.set(u.k, []); by.get(u.k).push(u); }
  for (const [k, us] of by) {
    us.sort((a, b) => ((a.fl & (UF.CIV | UF.GP)) ? 1 : 0) - ((b.fl & (UF.CIV | UF.GP)) ? 1 : 0) || (a.kk < b.kk ? -1 : 1));
    const city = cities.has(k), n = us.length, base = city ? [R * 0.42, R * 0.38] : [0, 0];
    const FAN = n === 1 ? [[0, 0]] : n === 2 ? [[-0.3, -0.12], [0.3, 0.16]] : [[-0.34, -0.16], [0.34, -0.16], [0, 0.26]];
    us.forEach((u, i) => {
      const f = FAN[Math.min(i, FAN.length - 1)];
      u.ox = base[0] + f[0] * R; u.oy = base[1] + f[1] * R;
      u.hide = i >= 3; u.stack = (i === 2 && n > 3) ? n - 2 : 0;
    });
  }
}
function unitsDraw() { if (!unFrameReq) unFrameReq = requestAnimationFrame(unitsFrame); }
function unitsResize() { viewSize(); }
// Кэш кадра: списки юнитов шагов перехода считаются один раз, а не 60 раз в секунду.
let FRAME = null;
function frameLists() {
  const kkey = si + "|" + (anim ? anim.from : -1) + "|" + viewTeam() + "|" + R;
  if (FRAME && FRAME.key === kkey) return FRAME;
  const cur = unitsOf(si); stackOffsets(cur, citiesFor(si));
  let prev = null, prevBy = null, here = null;
  if (anim) {
    prev = unitsOf(anim.from); stackOffsets(prev, citiesFor(anim.from));
    prevBy = new Map(); for (const u of prev) prevBy.set(u.kk, u);
    here = new Set(cur.map(u => u.kk));
    // Соседние сейвы через ход — путь по клеткам (гекс-линия). Между сейвами дыра — честная прямая:
    // где юнит шёл на пропущенных ходах, неизвестно, и выдумывать путь по клеткам нельзя.
    // С журналом 117: путь по клеткам, только если юнит «свежий» на обоих концах (его держава записана
    // журналом или сейвом на обоих ходах); иначе он стоял на месте с прошлого сейва — прямая.
    const gapT = Math.abs(turnOf(si) - turnOf(anim.from)) > 1;
    for (const u of cur) {
      const p = prevBy.get(u.kk); if (!p || p.k === u.k) continue;
      const gap = gapT || Math.abs(turnOf(si) - turnOf(lastFresh(anim.from, u.p))) > 1;
      u.path = gap ? straight(p.k, u.k) : hexSteps(p.k, u.k);
    }
  }
  FRAME = { key: kkey, cur, prev, prevBy, here };
  return FRAME;
}
function unitsFrame(now) {
  unFrameReq = 0;
  const t0 = performance.now();
  unitsResize();
  if (viewDirty && PK) drawMap();                           // прокрутка: карта рисуется в том же кадре, что и юниты
  const dpr = DPR();
  uctx.setTransform(1, 0, 0, 1, 0, 0);
  uctx.clearRect(0, 0, uv.width, uv.height);
  unHits = [];
  // в стратегическом виде (мельче ×2) плашки рисует сама карта
  const banners = () => { if (!drawn() || !PK || lod() === 0) return; const sr0 = sc.getBoundingClientRect(), cr0 = stage.getBoundingClientRect();
    uctx.save(); uctx.translate(cr0.left - sr0.left, cr0.top - sr0.top); drawBanners(citiesFor(si), uctx); uctx.restore(); };
  if (!PK || !show.units) { anim = null; if (mapDirty) drawMap(); if (PK) { uctx.setTransform(DPR(), 0, 0, DPR(), 0, 0); banners(); } return; }
  const sr = sc.getBoundingClientRect(), cr = stage.getBoundingClientRect();
  const ox = cr.left - sr.left, oy = cr.top - sr.top, mapW = W * PK.w;
  uctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  uctx.save();
  uctx.beginPath(); uctx.rect(Math.max(0, ox), Math.max(0, oy), Math.min(cr.width, sr.width), Math.min(cr.height, sr.height)); uctx.clip();
  let s = 1, a = anim;
  if (a) { s = Math.max(0, Math.min(1, (now - a.t0) / a.dur)); if (s >= 1) { anim = null; a = null; } }   // метка кадра бывает раньше начала перехода
  const e = ease(s), FR = frameLists();
  const vw = sr.width, vh = sr.height, SZ = flagSize();
  const sel = card && card.kind === "unit" ? card.kk : null;
  const draw = (u, x, y, alpha, ring) => {
    for (const dx of (PK.wrapX ? [0, -mapW, mapW] : [0])) {
      const sx = ox + x + dx, sy = oy + y;
      if (sx < -SZ || sx > vw + SZ || sy < -SZ || sy > vh + SZ) continue;
      const sp = sprite(u.p, u.type, u.fl), hh = sp._half;
      uctx.globalAlpha = alpha;
      const dl = drawn() ? lod() : 9;
      const ua = dl === 2 ? unitArt(u.p, u.type, u.fl, u.hp) : null;   // фигурки отряда — с ×3
      let fx = sx, fy = sy;
      if (ua) {
        const D = DPR();
        uctx.imageSmoothingEnabled = false;
        uctx.drawImage(ua, Math.round((sx - ua._w / 2) * D) / D, Math.round((sy + R * 0.4 - ua._by) * D) / D, ua._w, ua._h);
        uctx.imageSmoothingEnabled = true;
        fx = sx - R * 0.46; fy = sy - R * 0.46;
        uctx.drawImage(sp, fx - hh, fy - hh, hh * 2, hh * 2);
        if (u.hp < 100) {
          const bw = R * 0.62, bh = Math.max(2, R * 0.08), by = fy - SZ * 0.5 - bh - 2;
          uctx.fillStyle = "#0b1119"; uctx.fillRect(fx - bw / 2 - 1, by - 1, bw + 2, bh + 2);
          uctx.fillStyle = u.hp > 66 ? "#58C08A" : u.hp > 33 ? "#E0A82E" : "#D9534F";
          uctx.fillRect(fx - bw / 2, by, bw * Math.max(0.04, u.hp / 100), bh);
        }
      } else if (dl === 0) {                         // стратегический: щиток армии (только военные) с числом военных юнитов
        if (!u.mil) continue;
        const sh = shieldSprite(u.p, u.mil);
        uctx.drawImage(sh, sx - sh._half, sy - sh._half, sh._half * 2, sh._half * 2);
        if (alpha > 0.5 && dx === 0) unHits.push({ x: sx, y: sy, r: sh._half, kk: u.kk });
        continue;
      } else uctx.drawImage(sp, sx - hh, sy - hh, hh * 2, hh * 2);
      if (!ua && u.hp < 100 && SZ >= 10) {
        const bw = SZ * 0.9, bh = Math.max(2, SZ * 0.13), by = sy + SZ * 0.5 + 1.5;
        uctx.fillStyle = "#0b1119"; uctx.fillRect(sx - bw / 2 - 1, by - 1, bw + 2, bh + 2);
        uctx.fillStyle = u.hp > 66 ? "#58C08A" : u.hp > 33 ? "#E0A82E" : "#D9534F";
        uctx.fillRect(sx - bw / 2, by, bw * Math.max(0.04, u.hp / 100), bh);
      }
      if (ring) {
        uctx.beginPath(); uctx.arc(sx, sy, SZ * (0.62 + 0.5 * ring.s), 0, 7);
        uctx.lineWidth = 2; uctx.strokeStyle = "rgba(217,83,79," + (1 - ring.s).toFixed(3) + ")"; uctx.stroke();
      }
      if (u.stack) {
        const bx = fx + SZ * 0.5, byy = fy - SZ * 0.42, br = Math.max(6, SZ * 0.3);
        uctx.globalAlpha = 1;
        uctx.beginPath(); uctx.arc(bx, byy, br, 0, 7); uctx.fillStyle = "#0b1119"; uctx.fill();
        uctx.lineWidth = 1; uctx.strokeStyle = "#76C6C0"; uctx.stroke();
        uctx.fillStyle = "#E6EDF5"; uctx.font = "700 " + Math.round(br * 1.2) + "px system-ui,sans-serif";
        uctx.textAlign = "center"; uctx.textBaseline = "middle"; uctx.fillText("+" + u.stack, bx, byy + 0.5);
      }
      if (sel && sel === u.kk) {
        uctx.globalAlpha = 1;
        uctx.beginPath(); uctx.arc(sx, sy, SZ * 0.72, 0, 7);
        uctx.lineWidth = 3.5; uctx.strokeStyle = "#0b1119"; uctx.stroke();
        uctx.lineWidth = 2; uctx.strokeStyle = "#76C6C0"; uctx.stroke();
      }
      if (alpha > 0.5 && dx === 0) unHits.push({ x: sx, y: sy, r: ua ? R * 0.6 : SZ * 0.55, kk: u.kk });
    }
  };
  let n = 0;
  if (a) for (const u of FR.prev) {                // уходящие — гаснут на месте
    if (FR.here.has(u.kk) || u.hide) continue;
    const c = centerOf(kx(u.k), ky(u.k));
    draw(u, c[0] + u.ox, c[1] + u.oy, 1 - e, null); n++;
  }
  for (const u of FR.cur) {
    if (u.hide) continue;
    const c = centerOf(kx(u.k), ky(u.k));
    let x = c[0] + u.ox, y = c[1] + u.oy, alpha = 1, ring = null;
    if (a) {
      const p = FR.prevBy.get(u.kk);
      if (!p) alpha = e;
      else {
        if (u.path) { const q = along(u.path, e); x = q[0] + p.ox + (u.ox - p.ox) * e; y = q[1] + p.oy + (u.oy - p.oy) * e; }
        else { x = c[0] + p.ox + (u.ox - p.ox) * e; y = c[1] + p.oy + (u.oy - p.oy) * e; }
        if (!CMB.size && p.hp - u.hp >= 10) ring = { s: e };
      }
    }
    draw(u, x, y, alpha, ring); n++;
  }
  // бои журнала (118): вспышка у защитника и линия от атакующего
  const cm = combatsAt(si);
  for (const b of cm) {
    const ph = a ? Math.max(0, (s - 0.35) / 0.65) : 1;
    if (a && s < 0.35) continue;
    const bk = b.dx >= 0 ? b.dx : b.ax;
    if (bk < 0) continue;
    const B = centerOf(kx(bk), ky(bk)), A = b.ax >= 0 ? centerOf(kx(b.ax), ky(b.ax)) : B;
    const bx = ox + B[0], by = oy + B[1];
    if (bx < -40 || bx > vw + 40 || by < -40 || by > vh + 40) continue;
    uctx.globalAlpha = 1;
    if (ph < 1) {
      uctx.beginPath(); uctx.moveTo(ox + A[0], oy + A[1]); uctx.lineTo(bx, by);
      uctx.lineWidth = 2; uctx.strokeStyle = "rgba(242,208,107," + (1 - ph).toFixed(3) + ")"; uctx.stroke();
      const rr = R * (0.4 + 1.5 * ph);
      uctx.beginPath(); uctx.arc(bx, by, rr, 0, 7); uctx.lineWidth = 2.5; uctx.strokeStyle = "rgba(255,140,60," + (1 - ph).toFixed(3) + ")"; uctx.stroke();
    }
    const m = Math.max(4, R * 0.26), mx = bx + R * 0.52, my = by - R * 0.5;
    uctx.globalAlpha = ph < 1 ? ph : 1;
    uctx.lineWidth = Math.max(2, R * 0.12); uctx.strokeStyle = "#0b1119";
    uctx.beginPath(); uctx.moveTo(mx - m, my - m); uctx.lineTo(mx + m, my + m); uctx.moveTo(mx + m, my - m); uctx.lineTo(mx - m, my + m); uctx.stroke();
    uctx.lineWidth = Math.max(1.2, R * 0.07); uctx.strokeStyle = (b.k & (64 | 128)) ? "#ff6b5e" : "#f2d06b"; uctx.stroke();
  }
  uctx.globalAlpha = 1;
  banners();
  uctx.restore();
  UPERF.units = n;
  const dt = performance.now() - t0;
  if (a || anim) {
    UPERF.frames++; UPERF.drawMs += dt; UPERF.maxDraw = Math.max(UPERF.maxDraw, dt);
    if (UPERF.last) UPERF.gaps.push(now - UPERF.last);
    if (UPERF.gaps.length > 3000) UPERF.gaps.shift();
    UPERF.last = now;
  } else UPERF.last = 0;
  if (anim) unitsDraw();
  else if (mapDirty) drawMap();
}
function unitsOnTurn(prev) {
  if (!show.units) { anim = null; unitsDraw(); return false; }
  const live = timer ? speed > 0 : true;
  if (Math.abs(si - prev) === 1 && smooth && live) {
    const dur = timer ? Math.min(speed * 1000 * 0.72, 3200) : 520;
    anim = { from: prev, to: si, t0: performance.now(), dur };
  } else anim = null;
  FRAME = null;
  unitsDraw();
  return !!anim;
}
function unitAt(ev) {
  if (!show.units) return null;
  const sr = sc.getBoundingClientRect(), x = ev.clientX - sr.left, y = ev.clientY - sr.top;
  for (let i = unHits.length - 1; i >= 0; i--) {
    const h = unHits[i];
    if ((h.x - x) * (h.x - x) + (h.y - y) * (h.y - y) <= h.r * h.r) return h.kk;
  }
  return null;
}

// ---------------------------------------------------------------- шаг (ход)
function setStep(i) {
  const prev = si;
  si = Math.max(0, Math.min(S.length - 1, i | 0));
  const defer = unitsOnTurn(prev);
  const gapTxt = si > 0 && turnOf(si) - turnOf(si - 1) > 1 ? "между ходами " + turnOf(si - 1) + " и " + turnOf(si) + ": сейвов нет, движение — прямой от сейва к сейву" : "";
  // дыра в сейвах: «ходы 103–105» — этот шаг покрывает пропущенные ходы целиком
  const ps = isSaveStep(si) ? -1 : prevSaveStep(si);
  const jTxt = ps >= 0 ? "сейва на ходу " + turnOf(si) + " нет: юниты " + PK.uSrc[si].map(nameOf).join(", ") +
    " — по журналу игроков; карта, города, туман и остальные юниты — " + stepLabel(ps) : "";
  $("turnLabel").innerHTML = (gapTxt ? "ходы " + (turnOf(si - 1) + 1) + "–" + turnOf(si) : esc(stepLabel(si))) + (jTxt ? "<sup class='rf-j'>ж</sup>" : "") + " <small>/ " + turnOf(S.length - 1) + "</small>";
  $("turnLabel").title = gapTxt || jTxt;
  slider.value = si;
  if (defer) mapDirty = true; else drawMap();
  tlNow(); renderSide(); viewPill(); renderLog();
  if (card) renderCard();
  if (!timer) saveHash();
}
const PLAY = "M7 5 L19 12 L7 19 Z", PAUSE = "M7 5 H10.5 V19 H7 Z M13.5 5 H17 V19 H13.5 Z";
function stop() {
  if (!timer) return;
  clearTimeout(timer); timer = null;
  $("playIco").setAttribute("d", PLAY);
  playBtn.setAttribute("aria-label", "Смотреть"); playBtn.title = "Смотреть по ходам (пробел)";
  saveHash();
}
function play() {
  if (timer) { stop(); return; }
  if (si >= S.length - 1) setStep(0);
  $("playIco").setAttribute("d", PAUSE);
  playBtn.setAttribute("aria-label", "Пауза"); playBtn.title = "Пауза (пробел)";
  const per = () => speed > 0 ? speed * 1000 : 200;
  let due = performance.now() + 200;
  const tick = () => {
    if (!timer) return;
    if (si >= S.length - 1) { stop(); return; }
    setStep(si + 1);
    due = Math.max(due + per(), performance.now() + 10);
    timer = setTimeout(tick, due - performance.now());
  };
  timer = setTimeout(tick, due - performance.now());
}

// ---------------------------------------------------------------- смотреть как
function fillView() {
  const opts = ['<option value="-1">Все — без тумана</option>'];
  for (const p of majors()) opts.push('<option value="' + p.i + '">' + esc(p.nick || civRu(p.civ)) + " · " + esc(civRu(p.civ)) + "</option>");
  $("viewPick").innerHTML = opts.join("");
}
function setView(p) {
  view = playerBy.has(p) && playerBy.get(p).kind === "major" ? p : -1;
  $("viewPick").value = String(view);
  $("viewPick").parentElement.classList.toggle("on", view >= 0);
  MEM = view >= 0 ? buildMemory(playerBy.get(view).team) : null;
  FRAME = null; anim = null;
  drawMap(); unitsDraw(); renderSide(); viewPill(); saveHash(); renderLog();
  if (card) renderCard();
}
function viewPill() {
  const el = $("viewPill");
  if (view < 0) { el.hidden = true; return; }
  const f = S[si].F[String(viewTeam())];
  let rev = 0, vis = 0;
  if (f) for (let k = 0; k < f.rev.length; k++) { rev += f.rev[k]; vis += f.vis[k]; }
  el.innerHTML = "<span>Глазами <b>" + esc(nameOf(view)) + "</b><span class='rp-src'>разведано " + Math.round(100 * rev / (PK.w * PK.h)) +
    " % карты, видно сейчас " + vis + " клеток</span></span><button type='button' title='Показать всё' aria-label='Показать всё'>×</button>";
  el.hidden = false;
  el.querySelector("button").onclick = () => setView(-1);
}

// ---------------------------------------------------------------- шкала событий
function evText(e) {
  switch (e.k) {
    case "war": return tchip(e.a) + " и " + tchip(e.b) + ": <b>война</b>";
    case "peace": return tchip(e.a) + " и " + tchip(e.b) + ": <b>мир</b>";
    case "capt": return chip(e.p) + " берёт город <b>" + esc(e.n) + "</b> у " + chip(e.from);
    case "raze": return "город <b>" + esc(e.n) + "</b> (" + chip(e.p) + ") исчез с карты — сожжён или разрушен";
    case "left": return chip(e.p) + " вышел из партии — слот ведёт ИИ";
    case "dead": return tchip(e.a) + " — держава уничтожена";
    case "wonder": return chip(e.p) + ": чудо <b>" + esc(typeName("bld", T("bld", e.b))) + "</b> в городе " + esc(e.n) + (e.before ? " <span class='l'>(построено до начала записи)</span>" : "");
    case "era": return tchip(e.a) + " входит в эпоху «" + esc(ERA_RU[e.eraName] || prettify(String(e.eraName).replace(/^ERA_/, ""))) + "»";
    case "found": return chip(e.p) + " основывает город <b>" + esc(e.n) + "</b>";
    case "faith": return chip(e.p) + (e.rel ? " основывает религию" : " принимает пантеон");
    default: return esc(e.k);
  }
}
const evPlain = e => evText(e).replace(/<[^>]+>/g, "");
// Ход события между двумя сейвами: если между соседними сейвами дыра, точный ход неизвестен.
function whenText(i) {
  const t = turnOf(i);
  if (i > 0 && t - turnOf(i - 1) > 1) return "между ходами " + (turnOf(i - 1) + 1) + " и " + t;
  // города, войны, эпохи считаются по сейвам: между двумя сейвами точный ход неизвестен
  const ps = isSaveStep(i) ? prevSaveStep(i) : -1;
  if (ps >= 0 && t - turnOf(ps) > 1) return "между ходами " + (turnOf(ps) + 1) + " и " + t;
  return t < 0 ? "старт" : "ход " + t;
}
function stepOfTurn(t) {
  let best = 0;
  for (let i = 0; i < PK.steps.length; i++) if (PK.steps[i] <= t) best = i;
  return best;
}
function buildTimeline() {
  const box = $("tlIn"), n = S.length;
  const pos = i => (n > 1 ? i / (n - 1) * 100 : 50) + "%";
  let h = '<div class="scrub" id="tlScrub"></div>';
  for (let i = 0; i < n; i++) {
    const t = turnOf(i);
    if (t >= 0 && (t % 10 === 0 || i === n - 1)) h += '<i class="tk big" style="left:' + pos(i) + '" title="ход ' + t + '"></i>';
  }
  // дыры в записи (ходов без сейва) — красной чертой
  for (let i = 1; i < n; i++) if (turnOf(i) - turnOf(i - 1) > 1)
    h += '<i class="tk gap" style="left:' + pos(i - 1) + ";right:" + (100 - parseFloat(pos(i))) + '%" title="ходы ' + (turnOf(i - 1) + 1) + "–" + (turnOf(i) - 1) + ' без сейва"></i>';
  const by = new Map();
  PK.ev.forEach((e, j) => { if (!EV[e.k] || !EV[e.k].tl || e.before) return; const i = stepOfTurn(e.t); if (!by.has(i)) by.set(i, []); by.get(i).push(j); });
  for (const [i, list] of by) {
    const show2 = list.slice(0, 2);
    show2.forEach((j, r) => {
      const e = PK.ev[j], m = EV[e.k];
      h += '<button type="button" class="ei" data-i="' + i + '" style="left:' + pos(i) + ";bottom:" + (8 + r * 12) + "px;background:" + m.c +
        '" title="ход ' + e.t + ": " + esc(evPlain(e)) + '" aria-label="ход ' + e.t + ": " + esc(m.ru) + '">' + m.g + "</button>";
    });
    if (list.length > 2) h += '<button type="button" class="ei more" data-i="' + i + '" style="left:' + pos(i) + ';bottom:20px;transform:translateX(12px)" title="' +
      esc(list.slice(2).map(j => "ход " + PK.ev[j].t + ": " + evPlain(PK.ev[j])).join("\n")) + '">+' + (list.length - 2) + "</button>";
  }
  h += '<div class="now" id="tlNow"><b id="tlNowLbl"></b></div>';
  box.innerHTML = h;
  const scrub = $("tlScrub");
  const go = ev => { const r = box.getBoundingClientRect(); stop(); setStep(Math.round((ev.clientX - r.left) / r.width * (n - 1))); };
  scrub.addEventListener("pointerdown", ev => { go(ev); scrub.setPointerCapture(ev.pointerId); scrub.onpointermove = go; });
  scrub.addEventListener("pointerup", () => { scrub.onpointermove = null; });
}
function tlNow() {
  const n = S.length, el = $("tlNow");
  if (!el) return;
  el.style.left = (n > 1 ? si / (n - 1) * 100 : 50) + "%";
  $("tlNowLbl").textContent = turnOf(si) < 0 ? "старт" : String(turnOf(si));
}
$("tl").addEventListener("click", ev => { const b = ev.target.closest(".ei"); if (b) { stop(); setStep(+b.dataset.i); } });

// ---------------------------------------------------------------- панель
const narrow = () => matchMedia("(max-width:980px)").matches;
function showSide(on) {
  side.hidden = !on;
  $("sideBtn").setAttribute("aria-expanded", String(on));
  if (on) renderSide();
  if (PK) { requestAnimationFrame(() => { unitsDraw(); }); }
}
function setTab(t) {
  tab = t;
  for (const b of side.querySelectorAll("[role=tab]")) b.setAttribute("aria-selected", String(b.dataset.tab === t));
  for (const p of side.querySelectorAll(".rp-pane")) p.hidden = p.dataset.pane !== t;
  renderSide();
}
function renderSide() {
  if (side.hidden || !PK) return;
  if (tab === "players") renderPlayers();
  else if (tab === "events") renderEvents();
  else if (tab === "chat") renderChat();
  else if (tab === "wars") renderWars();
}
const statAt = (p, name, i) => { const r = PK.stats[String(p)]; if (!r || !r[name]) return null; for (let j = i; j >= 0; j--) if (r[name][j] != null) return r[name][j]; return null; };
function renderPlayers() {
  const st = S[si], ncity = new Map(), nunit = new Map(), nmil = new Map();
  for (const c of st.C.values()) ncity.set(c.o, (ncity.get(c.o) || 0) + 1);
  for (const u of st.U.values()) { nunit.set(u[0], (nunit.get(u[0]) || 0) + 1); if (!(u[6] & (UF.CIV | UF.GP))) nmil.set(u[0], (nmil.get(u[0]) || 0) + 1); }
  const rows = majors().map(p => {
    const alive = (st.TM[String(p.team)] || {}).alive !== 0, human = st.PL[String(p.i)] === 3;
    const sc2 = statAt(p.i, "SCORE", si);
    let s = '<div class="pl' + (view === p.i ? " on" : "") + (alive ? "" : " gone") + '" data-p="' + p.i + '" tabindex="0" role="button">' +
      '<i class="sw" style="background:' + colorOf.get(p.i) + '"></i><span class="nm">' + esc(p.nick || civRu(p.civ)) +
      ' <span class="l">· ' + esc(civRu(p.civ)) + (human ? "" : " · ИИ") + "</span></span>" +
      '<span class="n">' + pl(ncity.get(p.i) || 0, ["город", "города", "городов"]) + "</span>" + (sc2 != null ? '<span class="sc" title="очки">' + sc2 + "</span>" : "") + "</div>";
    if (view === p.i) {
      const tm = st.TM[String(p.team)] || {};
      const g = n => { const v = statAt(p.i, n, si); return v == null ? "—" : v; };
      s += '<div class="pl-more"><div class="st"><span>юнитов <b>' + (nunit.get(p.i) || 0) + "</b> (военных " + (nmil.get(p.i) || 0) + ")</span><span>техов <b>" +
        (tm.tech != null ? tm.tech : "—") + "</b></span><span>жителей <b>" + g("POPULATION") + "</b></span><span>земли <b>" + g("TOTALLAND") + "</b></span></div>" +
        '<div class="st"><span>наука <b>' + g("SCIENCEPERTURN") + "</b></span><span>культура <b>" + g("CULTUREPERTURN") + "</b></span><span>золото <b>" + g("TOTALGOLD") +
        "</b> (" + g("GOLDPERTURN") + "/ход)</span><span>вера <b>" + g("FAITHPERTURN") + "</b></span><span>счастье <b>" + g("EXCESSHAPINESS") + "</b></span></div>" +
        '<div class="st"><span>воюет с: ' + ((tm.war || []).filter(t => t !== BARB).map(t => tchip(t)).join(", ") || "никем") + "</span></div></div>";
    }
    return s;
  });
  $("players").innerHTML = rows.join("");
  const cs = PK.players.filter(p => p.kind === "cs" && [...st.C.values()].some(c => c.o === p.i));
  $("csline").innerHTML = cs.length ? "Города-государства: " + cs.map(p => chip(p.i)).join(", ") : "";
}
function renderEvents() {
  const list = PK.ev.filter(e => evAll || (EV[e.k] && EV[e.k].tl));
  $("evCount").textContent = pl(list.length, ["событие", "события", "событий"]);
  const T0 = turnOf(si);
  $("events").innerHTML = list.length ? list.map(e => {
    const m = EV[e.k] || { g: "?", c: "#888" };
    return '<div class="ev go' + (e.t === T0 ? " now" : e.t > T0 ? " fut" : "") + '" data-t="' + e.t + '"><span class="ic" style="background:' + m.c + '">' + m.g +
      '</span><b class="t">' + e.t + "</b><p>" + evText(e) + (/^между/.test(whenText(stepOfTurn(e.t))) ? " <span class='l'>(" + whenText(stepOfTurn(e.t)) + ")</span>" : "") + "</p></div>";
  }).join("") : '<p class="empty">Событий нет.</p>';
}
function clock(ms) { if (ms == null || ms < 0) return ""; const s = Math.round(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
function renderChat() {
  const T0 = turnOf(si);
  const rows = (PK.chat || []).filter(c => c[0] <= T0);
  $("chat").innerHTML = rows.length ? rows.map(c =>
    '<div class="ev chat' + (c[0] === T0 ? " now" : "") + '"><b class="t">' + c[0] + '</b><p><span class="who" style="color:' + (colorOf.get(c[2]) || "#ccc") + '">' +
    esc(nameOf(c[2])) + "</span>: " + esc(c[3]) + ' <span class="tm">' + clock(c[1]) + "</span></p></div>").join("") :
    '<p class="empty">' + ((PK.chat || []).length ? "До этого хода реплик «всем» не было." : "В записи нет реплик «всем».") + "</p>";
}
// Войны: периоды по сейвам (команды в состоянии войны на каждом ходу), потери — счётчик игры
// NUMLOSTUNITS за срок войны (на всех фронтах сразу, отдельного счёта «кто кого» в сейве нет).
let WARS = null;
function buildWars() {
  const open = new Map(), out = [], mt = new Set(PK.majorTeams);
  const isCSTeam = t => PK.players.some(p => p.team === t && p.kind === "cs");
  for (let i = 0; i < S.length; i++) {
    const now = new Set();
    for (const t in S[i].TM) {
      const a = +t;
      for (const b of (S[i].TM[t].war || [])) {
        if (a >= b || b === BARB || a === BARB) continue;
        if (!mt.has(a) && !mt.has(b)) continue;
        if (!mt.has(a) && !isCSTeam(a)) continue;
        now.add(a + ":" + b);
      }
    }
    for (const k of now) if (!open.has(k)) open.set(k, { a: +k.split(":")[0], b: +k.split(":")[1], i0: i, before: i === 0 });
    for (const [k, w] of open) if (!now.has(k)) { w.i1 = i; out.push(w); open.delete(k); }
  }
  for (const w of open.values()) { w.i1 = -1; out.push(w); }
  out.forEach(w => { w.major = mt.has(w.a) && mt.has(w.b); });
  WARS = out.sort((x, y) => (y.major - x.major) || (x.i0 - y.i0));
}
function lostIn(team, i0, i1) {
  let s = 0, any = false;
  for (const p of PK.players.filter(q => q.team === team && q.kind === "major")) {
    const a = statAt(p.i, "NUMLOSTUNITS", i0), b = statAt(p.i, "NUMLOSTUNITS", i1);
    if (a != null && b != null) { s += b - a; any = true; }
  }
  return any ? s : null;
}
function armyOf(team, i) {
  let n = 0;
  for (const u of S[i].U.values()) if (teamOf.get(u[0]) === team && !(u[6] & (UF.CIV | UF.GP))) n++;
  return n;
}
function renderWars() {
  if (!WARS) buildWars();
  const list = WARS.filter(w => w.i0 <= si);
  if (!list.length) { $("wars").innerHTML = '<p class="empty">До этого хода войн между державами не было.</p>'; return; }
  $("wars").innerHTML = '<p class="rp-hint">Срок — по сейвам. Потери — счётчик игры за срок войны, по всем фронтам сразу; армия — военные юниты на этом ходу.</p>' +
    list.map(w => {
      const end = w.i1 >= 0 && w.i1 <= si ? w.i1 : -1, i1 = end >= 0 ? end : si;
      const t0 = w.before ? "до начала записи" : whenText(w.i0);
      const len = turnOf(i1) - turnOf(w.i0);
      const la = lostIn(w.a, w.i0, i1), lb = lostIn(w.b, w.i0, i1);
      const aa = armyOf(w.a, si), ab = armyOf(w.b, si), tot = Math.max(1, aa + ab);
      const ca = colorOf.get((PK.players.find(p => p.team === w.a) || {}).i) || "#888", cb = colorOf.get((PK.players.find(p => p.team === w.b) || {}).i) || "#888";
      return '<div class="war grp' + (end < 0 ? " on" : "") + '" data-i="' + w.i0 + '"><h4>' + tchip(w.a) + ' <span class="vs">⚔</span> ' + tchip(w.b) + "</h4>" +
        "<p>" + esc(t0) + " — " + (end >= 0 ? "мир: " + whenText(end) : "<b>идёт</b>") + " · " + pl(Math.max(0, len), ["ход", "хода", "ходов"]) + "</p>" +
        '<div class="bar" title="армии на этом ходу"><i style="width:' + (100 * aa / tot) + "%;background:" + ca + '"></i><i style="width:' + (100 * ab / tot) + "%;background:" + cb + '"></i></div>' +
        "<p>армия <b>" + aa + "</b> : <b>" + ab + "</b>" + (la != null || lb != null ? " · потери <b>" + (la == null ? "?" : la) + "</b> : <b>" + (lb == null ? "?" : lb) + "</b>" : "") + "</p></div>";
    }).join("");
}

// ---------------------------------------------------------------- карточки
function openCard(c) { card = c; renderCard(); drawMap(); unitsDraw(); }
function closeCard() { card = null; cardEl.hidden = true; drawMap(); unitsDraw(); }
function yieldTip(k, v) {
  if (!PK.yields || !v.rev || (viewTeam() >= 0 && !v.vis)) return "";
  const st = S[si], parts = [];
  for (const yk of ["yf", "yp", "yg", "ys", "yc", "yr"]) if (st.P[yk][k] > 0) parts.push("<span style='color:" + YCOL[yk] + "'>●</span> " + YRU[yk] + " " + st.P[yk][k]);
  if (!parts.length) return "";
  const ps = isSaveStep(si) ? -1 : prevSaveStep(si);
  return "<br>выход: " + parts.join(" · ") + (ps >= 0 ? "<br><span class='l'>выход — по сейву " + esc(stepLabel(ps)) + "</span>" : "");
}
function cellDesc(k) {
  const st = S[si], v = cellView(si, k);
  if (!v.rev) return "не разведано";
  const pt = st.P.pt[k], tr = T("terr", st.P.terr[k]), f = T("feat", v.feat), parts = [];
  parts.push(pt === 0 ? "горы" : lakeAt[k] ? "озеро" : (TERR_RU[tr] || prettify(tr)));
  if (pt === 1) parts.push("холм");
  if (f) parts.push(typeName("feat", f).toLowerCase());
  if (v.res >= 0) parts.push(typeName("res", T("res", v.res)).toLowerCase());
  if (v.imp >= 0) parts.push(typeName("imp", T("imp", v.imp)).toLowerCase());
  return parts.join(", ");
}
function renderCard() {
  if (!card) return;
  let head = "", body = "";
  const line = (l, v) => { body += "<p><span class='l'>" + l + "</span> " + v + "</p>"; };
  if (card.kind === "city") {
    const c = citiesFor(si).get(card.k);
    if (!c) { head = "Города нет"; body = "<p class='rp-note'>На " + esc(stepLabel(si)) + " здесь нет города (ещё не основан, разрушен или не виден).</p>"; }
    else {
      head = c.n || "Город";
      const vf = viewTeam() >= 0 ? S[si].F[String(viewTeam())] : null;
      const hidden = !!vf && !vf.vis[card.k];
      body += '<p class="sub">' + chip(c.o) + ((c.fl & 1) ? " · столица" : "") + ((c.fl & 2) ? " · марионетка" : "") + ((c.fl & 4) ? " · оккупирован" : "") +
        ((c.fl & 8) ? " · <b style='color:#ff7a3c'>горит</b>" : "") + ((c.fl & 16) ? " · сопротивление" : "") + "</p>";
      if (hidden) body += "<p class='rp-note'>Город сейчас в тумане — показано, каким его видели в последний раз.</p>";
      line("жителей:", "<b>" + c.pop + "</b>" + (c.sp ? " (специалистов " + c.sp + ")" : "") + (c.f != null ? " · основан на ходу " + c.f : ""));
      if (c.orig != null && c.orig !== c.o) line("основал:", chip(c.orig));
      if (c.dmg > 0) line("повреждён:", String(c.dmg));
      const bl = (c.b || []).map(b => T("bld", b)).filter(Boolean);
      const wn = new Set((PK.wonders || []).map(b => T("bld", b)));
      body += "<h3>Здания · " + bl.length + "</h3>" + (bl.length ? '<div class="blist">' + bl.map(b => '<span' + (wn.has(b) ? ' class="w"' : "") + ">" +
        esc(typeName("bld", b)) + "</span>").sort().join("") + "</div>" : "<p class='rp-note'>нет</p>");
      if (!hidden) {
        const q = (c.q || []).map(o => o[0] === 0 ? "юнит «" + typeName("unit", T("unit", o[1])) + "»" : o[0] === 1 ? typeName("bld", T("bld", o[1])) :
          o[0] === 2 ? "проект " + prettify(String(o[2]).replace(/^PROJECT_/, "")) : o[0] === 4 ? "процесс " + prettify(String(o[2]).replace(/^PROCESS_/, "")) : "заказ");
        body += "<h3>Очередь</h3>" + (q.length ? "<ol>" + q.map(x => "<li>" + esc(x) + "</li>").join("") + "</ol>" : "<p class='rp-note'>пусто</p>");
        body += "<h3>Рабочие клетки · " + (c.w || []).length + "</h3><p class='rp-note'>отмечены на карте белыми точками</p>";
      }
      if (PK.cyields) body += "<p class='rp-note'>Выдача города по журналу DLL есть в записи (датчик 116).</p>";
    }
  } else if (card.kind === "unit") {
    const st = S[si], u = st.U.get(card.kk);
    const pu = si > 0 ? S[si - 1].U.get(card.kk) : null;
    const tyU = u || card.last;
    if (!tyU) { card = null; cardEl.hidden = true; return; }
    head = typeName("unit", T("unit", tyU[2])) || "Юнит";
    body += '<p class="sub">' + chip(tyU[0]) + "</p>";
    if (!u) {
      const d = deathsAt(si).find(x => ukey(x.u[0], x.u[1]) === card.kk);
      const WHY = { found: "основал город", used: "израсходован (великий человек)", gone: "исчез (израсходован или распущен)", lost: "погиб или распущен" };
      const why = !d ? "на этом ходу его нет" : d.why === "upgrade" ? "улучшен до «" + typeName("unit", T("unit", d.to[2])) + "»" : WHY[d.why];
      line(esc(stepLabel(si)) + ":", esc(why));
    } else {
      const fl = u[6], kind = fl & UF.GP ? "великий человек" : fl & UF.CIV ? "гражданский" : "военный";
      const st2 = [[UF.GARR, "гарнизон"], [UF.EMB, "на воде"], [UF.FORT, "укреплён / спит"]].filter(f => fl & f[0]).map(f => f[1]);
      body += '<div class="rp-hp"><i style="width:' + u[5] + "%;background:" + (u[5] > 66 ? "var(--good)" : u[5] > 33 ? "var(--warn)" : "var(--bad)") + '"></i></div>';
      line("здоровье:", "<b>" + u[5] + "</b> из 100 · " + kind + (st2.length ? " · " + st2.join(", ") : ""));
      if (!(fl & (UF.CIV | UF.GP))) line("опыт:", u[8] + " · уровень " + u[7] + (u[9] ? " · повышений " + u[9] : ""));
      line("клетка:", esc(cellDesc(key(u[3], u[4]))));
      if (pu) {
        const d = hexDist(key(pu[3], pu[4]), key(u[3], u[4]));
        const prevT = turnOf(si - 1), back = turnOf(si) - prevT > 1 ? "на прошлом сейве (ход " + prevT + "):" : "ход назад:";
        line(back, d === 0 ? "стоял здесь же" : "в " + pl(d, ["клетке", "клетках", "клетках"]) + " отсюда" + (pu[5] !== u[5] ? " · здоровье было " + pu[5] : "") +
          (turnOf(si) - prevT > 1 && d > 0 ? " <span class='l'>— путь между ходами " + prevT + " и " + turnOf(si) + " неизвестен</span>" : ""));
      } else if (si > 0) line("появился:", turnOf(si) - turnOf(si - 1) > 1 ? "между ходами " + turnOf(si - 1) + " и " + turnOf(si) : "на этом ходу");
    }
  }
  $("cardHead").textContent = head;
  $("cardBody").innerHTML = body;
  cardEl.hidden = false;
  // карточка — с той стороны, где её не закрывает
  const k = card.kind === "city" ? card.k : (() => { const u = S[si].U.get(card.kk) || card.last; return u ? key(u[3], u[4]) : 0; })();
  const p = centerOf(kx(k), ky(k)), r = cv.getBoundingClientRect(), s = sc.getBoundingClientRect();
  const leftHalf = (r.left + p[0] - s.left) < s.width / 2;
  cardEl.classList.toggle("right", leftHalf); cardEl.classList.toggle("left", !leftHalf);
}

// ---------------------------------------------------------------- мышь, клавиши
function tileAt(ev) {
  const r = stage.getBoundingClientRect();
  const sx = ev.clientX - r.left, sy = ev.clientY - r.top;
  const row = Math.round((sy - 3 - R) / H);
  let best = -1, bd = 1e9;
  for (let dr = Math.max(0, row - 1); dr <= Math.min(PK.h - 1, row + 1); dr++) {
    const y = PK.h - 1 - dr;
    for (let x = 0; x < PK.w; x++) {
      const c = centerOf(x, y), d = (c[0] - sx) * (c[0] - sx) + (c[1] - sy) * (c[1] - sy);
      if (d < bd) { bd = d; best = key(x, y); }
    }
  }
  return (best < 0 || bd > R * R * 1.3) ? -1 : best;
}
let drag = null, dragged = false;
sc.addEventListener("pointerdown", ev => {
  if (ev.pointerType !== "mouse" || ev.button !== 0) return;
  drag = { x: ev.clientX, y: ev.clientY, l: sc.scrollLeft, t: sc.scrollTop, id: ev.pointerId };
  dragged = false;
});
addEventListener("pointermove", ev => {
  if (!drag) return;
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
  if (!dragged && Math.abs(dx) + Math.abs(dy) < 5) return;
  if (!dragged) { dragged = true; sc.classList.add("drag"); tip.hidden = true; try { sc.setPointerCapture(drag.id); } catch (e) { /* не страшно */ } }
  sc.scrollLeft = drag.l - dx; sc.scrollTop = drag.t - dy;
});
addEventListener("pointerup", () => { if (drag) { drag = null; sc.classList.remove("drag"); } });
sc.addEventListener("wheel", ev => {
  if (!PK || !ev.ctrlKey) return;
  ev.preventDefault();
  const s = sc.getBoundingClientRect();
  setZoom(zoom * (ev.deltaY < 0 ? 1.18 : 1 / 1.18), ev.clientX - s.left, ev.clientY - s.top);
}, { passive: false });
sc.addEventListener("scroll", () => { tip.hidden = true; viewDirty = true; unitsDraw(); }, { passive: true });
sc.addEventListener("click", ev => {
  if (dragged) { dragged = false; return; }
  if (!PK) return;
  const ukk = unitAt(ev);
  if (ukk) {
    // во время перехода хода по уходящему юниту тоже можно попасть — его нет на текущем шаге
    const last = S[si].U.get(ukk) || (anim && S[anim.from].U.get(ukk)) || (si > 0 && S[si - 1].U.get(ukk));
    if (card && card.kind === "unit" && card.kk === ukk) closeCard(); else if (last) openCard({ kind: "unit", kk: ukk, last });
    return;
  }
  const k = tileAt(ev);
  if (k >= 0 && citiesFor(si).has(k)) { if (card && card.kind === "city" && card.k === k) closeCard(); else openCard({ kind: "city", k }); return; }
  if (card) closeCard();
});
sc.addEventListener("mousemove", ev => {
  if (!PK || drag) return;
  const ukk = unitAt(ev), place = () => {
    tip.hidden = false;
    // не вылезать за край окна: не влезает справа — слева от курсора, не влезает снизу — выше
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = ev.clientX + 16, y = ev.clientY + 14;
    if (x + tw > innerWidth - 6) x = Math.max(6, ev.clientX - tw - 12);
    if (y + th > innerHeight - 6) y = Math.max(6, ev.clientY - th - 10);
    tip.style.left = x + "px"; tip.style.top = y + "px";
  };
  if (ukk) {
    const u = S[si].U.get(ukk);
    if (u) { sc.style.cursor = "pointer"; tip.innerHTML = "<b>" + esc(typeName("unit", T("unit", u[2]))) + "</b><br>" + esc(nameOf(u[0])) + " · здоровье " + u[5]; place(); return; }
  }
  const k = tileAt(ev);
  if (k < 0) { tip.hidden = true; sc.style.cursor = "grab"; return; }
  const c = citiesFor(si).get(k), v = cellView(si, k);
  sc.style.cursor = c ? "pointer" : "grab";
  tip.innerHTML = (c ? "<b>" + esc(c.n) + "</b> · " + esc(nameOf(c.o)) + " · жителей " + c.pop + "<br>" : "") + esc(cellDesc(k)) +
    (v.rev && v.own >= 0 && !c ? "<br><span class='l'>" + esc(nameOf(v.own)) + "</span>" : "") +
    (viewTeam() >= 0 && v.rev && !v.vis ? "<br><span class='l'>в тумане: как видели в последний раз</span>" : "") + yieldTip(k, v);
  place();
});
sc.addEventListener("mouseleave", () => { tip.hidden = true; });

function togglePop(id, btnId) {
  const el = $(id), open = el.hidden;
  closePops();
  if (id !== "morePop") { $("morePop").hidden = true; $("moreBtn").setAttribute("aria-expanded", "false"); }
  if (open) { el.hidden = false; $(btnId).setAttribute("aria-expanded", "true"); }
}
function closePops() {
  for (const [id, b] of [["layersPop", "layersBtn"], ["helpPop", "helpBtn"], ["speedPop", "speedBtn"], ["morePop", "moreBtn"]]) { $(id).hidden = true; $(b).setAttribute("aria-expanded", "false"); }
}
document.addEventListener("pointerdown", ev => {
  if (ev.target.closest(".rp-pop") || ev.target.closest("#layersBtn") || ev.target.closest("#helpBtn") || ev.target.closest("#speedBtn")) return;
  closePops();
});
slider.addEventListener("input", e => { stop(); setStep(+e.target.value); });
$("toEnd").addEventListener("click", () => { stop(); setStep(S.length - 1); });
playBtn.addEventListener("click", play);
$("zoomIn").addEventListener("click", () => setZoom(zoom * 1.35));
$("zoomOut").addEventListener("click", () => setZoom(zoom / 1.35));
$("layersBtn").addEventListener("click", () => togglePop("layersPop", "layersBtn"));
$("moreBtn").addEventListener("click", () => togglePop("morePop", "moreBtn"));
$("fitBtn").addEventListener("click", () => { if (zoom > 1.0001) { setZoom(1, null, null, true); fitUi(); } else closeUp(); });
$("lodHint").addEventListener("click", () => setZoom(zoom * 2));
$("helpBtn").addEventListener("click", () => togglePop("helpPop", "helpBtn"));
$("speedBtn").addEventListener("click", () => togglePop("speedPop", "speedBtn"));
$("sideBtn").addEventListener("click", () => showSide(side.hidden));
$("sideClose").addEventListener("click", () => showSide(false));
$("cardClose").addEventListener("click", closeCard);
for (const b of document.querySelectorAll(".rp-pop [data-close]")) b.addEventListener("click", closePops);
for (const b of side.querySelectorAll("[role=tab]")) b.addEventListener("click", () => setTab(b.dataset.tab));
$("evAll").addEventListener("change", e => { evAll = e.target.checked; renderEvents(); });
$("viewPick").addEventListener("change", e => setView(+e.target.value));
$("players").addEventListener("click", ev => { const el = ev.target.closest(".pl"); if (el) setView(view === +el.dataset.p ? -1 : +el.dataset.p); });
$("players").addEventListener("keydown", ev => { const el = ev.target.closest(".pl"); if (el && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); setView(view === +el.dataset.p ? -1 : +el.dataset.p); } });
$("events").addEventListener("click", ev => { const el = ev.target.closest(".ev.go"); if (el) { stop(); setStep(stepOfTurn(+el.dataset.t)); } });
$("wars").addEventListener("click", ev => { const el = ev.target.closest(".war"); if (el) { stop(); setStep(+el.dataset.i); } });
for (const box of document.querySelectorAll("[data-layer]")) box.checked = !!show[box.dataset.layer];
for (const box of document.querySelectorAll("[data-layer]")) box.addEventListener("change", () => {
  show[box.dataset.layer] = box.checked; anim = null; FRAME = null;
  try { localStorage.setItem("rf-layers", JSON.stringify(show)); } catch (e) { /* без хранилища */ }
  drawMap(); unitsDraw(); renderLog();
  $("layersBtn").classList.toggle("on", !show.units || !show.names || !show.icons || show.heat || !show.log);
});
for (const b of document.querySelectorAll("[data-speed]")) b.addEventListener("click", () => {
  speed = +b.dataset.speed;
  try { localStorage.setItem("rf.speed", String(speed)); } catch (e) { /* не страшно */ }
  speedUi();
});
$("smooth").addEventListener("change", e => { smooth = e.target.checked; try { localStorage.setItem("rf.smooth", smooth ? "1" : "0"); } catch (er) { /* не страшно */ } });
function speedUi() {
  $("speedLbl").textContent = speed > 0 ? speed + " с" : "быстро";
  for (const b of document.querySelectorAll("[data-speed]")) b.setAttribute("aria-checked", String(+b.dataset.speed === speed));
  $("smooth").checked = smooth;
}
addEventListener("keydown", ev => {
  if (!PK || ev.altKey || ev.metaKey || ev.ctrlKey) return;
  const tag = (ev.target.tagName || "").toLowerCase();
  if (tag === "input" && ev.target.type !== "range" && ev.target.type !== "checkbox") return;
  if (tag === "select" || tag === "textarea") return;
  const k = ev.key;
  if (k === "Escape") { if (!$("layersPop").hidden || !$("helpPop").hidden || !$("speedPop").hidden) closePops(); else if (card) closeCard(); else if (!side.hidden && narrow()) showSide(false); return; }
  if (tag === "input" && ev.target.type === "range") return;
  if (k === " " && tag !== "button") { ev.preventDefault(); play(); }
  else if (k === "ArrowRight") { ev.preventDefault(); stop(); setStep(si + 1); }
  else if (k === "ArrowLeft") { ev.preventDefault(); stop(); setStep(si - 1); }
  else if (k === "Home") { ev.preventDefault(); stop(); setStep(0); }
  else if (k === "End") { ev.preventDefault(); stop(); setStep(S.length - 1); }
  else if (k === "+" || k === "=") setZoom(zoom * 1.35);
  else if (k === "-" || k === "_") setZoom(zoom / 1.35);
  else if (k === "?") togglePop("helpPop", "helpBtn");
});
let rsz = 0;
addEventListener("resize", () => { clearTimeout(rsz); rsz = setTimeout(() => { if (PK) { resize(); drawMap(); FRAME = null; unitsDraw(); } }, 80); });
// смена масштаба браузера (Ctrl ±) меняет DPR без resize у части браузеров — следим отдельно
(function watchDpr() { const q = matchMedia("(resolution: " + devicePixelRatio + "dppx)"); q.addEventListener("change", () => { if (PK) { resize(); drawMap(); FRAME = null; unitsDraw(); } watchDpr(); }, { once: true }); })();

// ---------------------------------------------------------------- адрес
function readHash() {
  const h = new URLSearchParams(String(location.hash || "").replace(/^#/, ""));
  return { m: h.get("m") || "", t: h.has("t") ? parseInt(h.get("t"), 10) : NaN, v: h.has("v") ? parseInt(h.get("v"), 10) : -1 };
}
let hashTimer = 0;
function saveHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    if (cur < 0 || !PK) return;
    const h = "#m=" + encodeURIComponent(LIST[cur].key) + "&t=" + turnOf(si) + (view >= 0 ? "&v=" + view : "");
    if (location.hash !== h) history.replaceState(null, "", h);
  }, 250);
}
addEventListener("hashchange", () => {
  const h = readHash(), i = LIST.findIndex(m => m.key === h.m);
  if (i >= 0 && i !== cur) openMatch(i, h.t, h.v);
  else if (i === cur && !isNaN(h.t) && h.t !== turnOf(si)) { stop(); setStep(stepOfTurn(h.t)); }
});

// ---------------------------------------------------------------- партии
const ABOUT =
  "Всё на карте — из автосейвов партии: игра сама пишет сейв на каждый ход, лаунчер Nova отправляет их вместе с логами. " +
  "Из сейва берётся полное состояние хода: клетки, границы, туман войны каждой команды (что разведано и что видно), все юниты всех " +
  "держав, городов-государств и варваров, города с жителями, зданиями, очередью и рабочими клетками, войны и мир. Ход на шкале — " +
  "состояние после хода (сейв конца хода). Если у партии есть сейвы от нескольких игроков, берётся один, а остальные с ним сверяются. " +
  "Ходы без сейва отмечены на шкале красной чертой — юниты через такую дыру не идут плавно. Журнал библиотеки мода, если он есть, " +
  "только дополняет сейвы: бои рисуются вспышками. Чат — только реплики «всем»: личные и командные вырезаются ещё при сборке записи " +
  "и в неё не попадают. «Смотреть как» показывает карту глазами игрока: неразведанное закрыто, а под туманом — то, что его команда " +
  "видела в последний раз. Тепловая карта — потери здоровья и гибель юнитов между ходами. Номера Steam нигде не показываются; ники — как в рейтинге.";
const shortWhen = w => String(w || "").replace(/^(\d\d\.\d\d)\.\d{4}/, "$1");
function fillPicker() {
  $("matchPick").innerHTML = LIST.map((m, i) => {
    const ppl = (m.players || []).map(p => p[1]).filter(Boolean);
    return '<option value="' + i + '">' + (m.no ? "№" + m.no + " · " : "") + esc(m.when ? shortWhen(m.when) + " · " : "") + (m.last + 1) + " ход. · " +
      esc(ppl.slice(0, 3).join(", ") + (ppl.length > 3 ? " +" + (ppl.length - 3) : "")) + "</option>";
  }).join("");
}
function metaText() {
  const s = PK.src || {}, parts = [];
  parts.push("карта <b>" + PK.w + "×" + PK.h + "</b>");
  parts.push("ходов в записи <b>" + PK.steps.filter(t => t >= 0).length + "</b> из " + (turnOf(S.length - 1) + 1));
  if (s.journalSteps) parts.push("из них без сейва, с юнитами по журналу игроков <b>" + s.journalSteps + "</b> (держав в журнале: " +
    Object.keys(s.journalPlayers || {}).map(p => esc(nameOf(+p))).join(", ") + ")");
  if ((PK.gaps || []).length) parts.push("без сейва " + pl(PK.gaps.length, ["ход", "хода", "ходов"]));
  parts.push("сейвов <b>" + (s.saves || 0) + "</b>" + (s.dupChecked ? ", дубли сверены на " + pl(s.dupChecked, ["ходу", "ходах", "ходах"]) + (s.dupMismatch && s.dupMismatch.length ? " (расхождений " + s.dupMismatch.length + ")" : " — совпали") : ""));
  parts.push("реплик «всем» <b>" + (s.chatPublic || 0) + "</b>");
  parts.push(s.journalCombats ? "боёв из журнала <b>" + s.journalCombats + "</b>" : "боёв из журнала нет — потери видны по здоровью юнитов");
  $("meta").innerHTML = "Эта запись: " + parts.join(" · ") + ".";
  $("evKey").innerHTML = Object.keys(EV).filter(k => EV[k].tl).map(k => '<div><span class="ic" style="width:14px;height:14px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font:700 9px/1 sans-serif;color:#0b1119;background:' +
    EV[k].c + '">' + EV[k].g + "</span>" + EV[k].ru + "</div>").join("");
}
function message(text) { const el = $("msg"); el.hidden = !text; el.textContent = text || ""; }
async function openMatch(i, t, v) {
  if (i < 0 || i >= LIST.length) return;
  const token = ++loadToken;
  stop(); cur = i; $("matchPick").value = String(i);
  message("Загружаю партию…");
  let pk = LIST[i].data;
  try {
    if (!pk) {
      const f = String(LIST[i].file || "");
      if (!/^[\w./-]+$/.test(f) || f.includes("..")) throw new Error("странный путь " + f);
      pk = await fetchPackage(src.base + f);
      if (token !== loadToken) return;
      LIST[i].data = pk;
    }
  } catch (e) { console.warn(e); if (token === loadToken) message("Партия не загрузилась: " + e.message); return; }
  message("");
  PK = pk; card = null; cardEl.hidden = true; HEAT = null; WARS = null; MEM = null; view = -1; FRAME = null; anim = null;
  S = decode(PK);
  setupPlayers(); findLakes(); parseCombats(); sprites.clear(); LOGC.clear();
  slider.max = S.length - 1;
  fillView(); metaText(); buildTimeline();
  zoom = 1; resize();
  if (sc.clientWidth < 700 && sc.clientHeight > sc.clientWidth) {
    const byH = (sc.clientHeight - 8) / (1.5 * (PK.h - 1) + 2);
    zoom = Math.max(1, Math.min(4, byH / fitR())); resize();
  }
  si = isNaN(t) ? S.length - 1 : stepOfTurn(t);
  if (v >= 0 && playerBy.has(v)) setView(v); else { $("viewPick").value = "-1"; $("viewPick").parentElement.classList.remove("on"); }
  setStep(si);
  sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) / 2; sc.scrollTop = 0;
  if (drawn()) closeUp();                                   // рисованный вид открывается крупно (×2), как у ffaciv
}
// Куда смотреть крупно: столица выбранного игрока; иначе город крупного события этого хода; иначе самый
// большой город державы-человека.
function focusCell() {
  const cs = S[si].C;
  if (view >= 0) for (const [k, c] of cs) if (c.o === view && (c.fl & 1)) return k;
  const T0 = turnOf(si);
  for (const e of PK.ev) if (e.t === T0 && e.c != null && ["capt", "raze", "wonder", "found"].includes(e.k)) return e.c;
  let best = -1, bp = -1;
  for (const [k, c] of cs) { const pp = playerBy.get(c.o); if (pp && pp.kind === "major" && c.pop > bp) { bp = c.pop; best = k; } }
  return best;
}
function closeUp() {
  const z = 28 / (fitR() * DPR());
  if (z > 1.0001) setZoom(z, null, null, true);
  const k = focusCell();
  if (k >= 0) { const c = centerOf(kx(k), ky(k)), r = stage.getBoundingClientRect(), q = sc.getBoundingClientRect(); sc.scrollLeft += r.left + c[0] - (q.left + q.width / 2); sc.scrollTop += r.top + c[1] - (q.top + q.height / 2); }
  fitUi();
}
function fitUi() { const b = $("fitBtn"); if (b) { const all = zoom <= 1.0001; b.querySelector(".rp-lbl").textContent = all ? "Крупно" : "Вся карта"; b.title = all ? "Крупно: столица или место события хода" : "Показать всю карту"; } }
// Подсказка: слой включён, но на этом масштабе пока не рисуется — увеличьте.
function lodHint() {
  const el = $("lodHint"); if (!el || !PK) return;
  const l = lod(), miss = [];
  if (drawn()) {
    if (l < 1) miss.push("местность", "значки юнитов");
    if (l < 1 && show.icons) miss.push("ресурсы");
    if (l < 2 && show.units) miss.push("отряды фигурками");
    if (l < 2 && show.yields && PK.yields) miss.push("выход клеток");
  }
  el.hidden = !miss.length;
  if (miss.length) el.textContent = "＋ Увеличьте карту, чтобы увидеть: " + miss.join(", ");
}
// Отладка у зрителя: #…&debug или ?debug — в углу DPR, размеры холста, масштаб тайла.
const DEBUG = /(^|[#&?])debug\b/.test(location.hash + "&" + location.search);
function debugInfo() {
  if (!DEBUG) return;
  let el = $("rfDebug");
  if (!el) { el = document.createElement("div"); el.id = "rfDebug"; el.className = "rf-debug"; $("mapArea").appendChild(el); }
  const r = cv.getBoundingClientRect(), D = DPR();
  el.textContent = "devicePixelRatio " + devicePixelRatio + " (берётся " + D + ") · окно " + innerWidth + "×" + innerHeight +
    " · холст " + cv.width + "×" + cv.height + " точек, CSS " + cv.style.width + "×" + cv.style.height +
    " · место " + (r.left * D).toFixed(2) + "," + (r.top * D).toFixed(2) + " точек · R " + R.toFixed(2) + " · тайл ×" + (R * D / 14).toFixed(3) +
    " · уровень " + lod() + " · " + (drawn() ? "рисованный" : "плоский");
}
$("matchPick").addEventListener("change", e => openMatch(+e.target.value, NaN, -1));
function safeBase(b) {
  b = String(b || "");
  if (!b || /^[a-z]+:/i.test(b) && !/^https:\/\//i.test(b)) return null;
  return b.endsWith("/") ? b : b + "/";
}
async function getJson(url) { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error(url + " → " + r.status); return r.json(); }
async function boot() {
  readColors();
  if (/[?&]embed=1\b/.test(location.search)) document.documentElement.classList.add("rp-embed");
  $("about").textContent = ABOUT;
  speedUi();
  try {
    message("Загружаю список партий…");
    const cfgUrl = document.documentElement.getAttribute("data-replay-source") || "data/replay-full-source.json";
    const cfg = await getJson(cfgUrl);
    const base = safeBase(cfg.base);
    if (!base) throw new Error("replay-full-source.json: base не годится");
    src = { base };
    const statsP = cfg.stats ? getJson(String(cfg.stats)).catch(() => null) : Promise.resolve(null);
    const [idx, dict, stats] = await Promise.all([getJson(base + "f/index.json"), getJson(String(cfg.dict)), statsP]);
    initDict(dict.names, dict.icons, new URL(String(cfg.dict), location.href).href);
    const ST = new Map(); for (const s of ((stats && stats.matches) || [])) if (s && s.key) ST.set(s.key, s);
    LIST = (idx.matches || []).filter(m => m && m.key && m.file).map(m => Object.assign({}, m, {
      no: ST.has(m.key) ? ST.get(m.key).no || 0 : 0,
      when: m.when || (ST.has(m.key) ? new Date(ST.get(m.key).at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "") : "") }));
    LIST.sort((a, b) => (b.no || 0) - (a.no || 0) || (b.last - a.last));
  } catch (e) { console.warn(e); message("Повторы сейчас недоступны."); return; }
  if (!LIST.length) { message("Повторов пока нет."); return; }
  fillPicker();
  const h = readHash();
  let first = LIST.findIndex(m => m.key === h.m);
  if (first < 0) first = 0;
  await openMatch(first, h.t, h.v);
}
for (const b of document.querySelectorAll("[data-style]")) b.addEventListener("click", () => setStyle(b.dataset.style));
$("logMin").addEventListener("click", () => {
  logMin = !logMin; try { localStorage.setItem("rf-logmin", logMin ? "1" : "0"); } catch (e) { /* без хранилища */ }
  renderLog();
});
$("logTabs").addEventListener("click", ev => {
  const b = ev.target.closest("[data-ltab]"); if (!b) return;
  logTab = b.dataset.ltab; try { localStorage.setItem("rf-logtab", logTab); } catch (e) { /* без хранилища */ }
  renderLog();
});
styleUi();
if (style === "drawn") loadArt();
window.__rf = { get PK() { return PK; }, get S() { return S; }, get si() { return si; }, setStep: i => setStep(i), setView: p => setView(p), play: () => play(), stop: () => stop(),
  get view() { return view; }, perf: UPERF, unitsOf: i => unitsOf(i), setStyle: v => setStyle(v), get artMiss() { return [...ART.miss]; },
  setZoom: (z, x, y) => setZoom(z, x, y),
  focus: (x, y) => { const c = centerOf(x, y), r = stage.getBoundingClientRect(), q = sc.getBoundingClientRect(); sc.scrollLeft += r.left + c[0] - (q.left + q.width / 2); sc.scrollTop += r.top + c[1] - (q.top + q.height / 2); unitsDraw(); },
  openCity: k => openCard({ kind: "city", k }),
  openUnit: kk => openCard({ kind: "unit", kk, last: S[si].U.get(kk) || (si > 0 && S[si - 1].U.get(kk)) }) };
boot();
})();
