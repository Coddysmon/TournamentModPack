/* ---------------------------------------------------------------------------
   Карта партии Nova — повтор по ходам.

   ДАННЫЕ — ДВА ПУТИ, логика страницы одна:
     • отдельная страница: всё вшито в <script id="matchdata"> (сборка build_ui.py);
     • сайт: data/replay-source.json → { base, dict }:
         <dict>                 словарь названий и иконок (собирается у владельца
                                из базы игры — на сервере базы игры нет);
         <base>index.json       список партий { schema, generated, matches:[{id,…}] };
         <base>m/<id>.json      одна партия — ровно то, что пишет экспорт.
   Адрес: #m=<ключ партии>&t=<ход>. ?embed=1 — без меню сайта (лаунчер).

   Состояние на ход t считается с нуля по событям (rebuild) — событий немного,
   зато ошибка не копится. Боковая панель перерисовывает только открытую вкладку.
   --------------------------------------------------------------------------- */
(() => {
"use strict";

const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- словарь
let NAMES = {}, ICONS = {}, BYKEY = {}, TILE_Y = null;
const SHEETS = {};

// Цвета держав. В повторе лежит только НОМЕР строки игровой палитры, самой палитры
// там нет, поэтому таблица своя, по названию цивилизации — так игрок узнаёт себя сразу.
const CIV = {
  Songhai:"#c75b2a", Germany:"#9aa6b2", Sweden:"#4f8fd9", Denmark:"#d94f4f",
  "The Inca":"#d9c04f", Spain:"#d98f41", Russia:"#c9a227", America:"#4f6fd9",
  England:"#b23a3a", France:"#5a7fd9", China:"#2fa36b", India:"#e08a5a",
  Japan:"#dcdcdc", Arabia:"#2f8f5a", Aztec:"#45b8b0", Rome:"#8a5fd9",
  Greece:"#6fb8e0", Egypt:"#d9c86b", Mongolia:"#b08968", Ottoman:"#3fae6a",
  Persia:"#9b4fd9", Polynesia:"#4fd9b0", Siam:"#d9a441", Carthage:"#7fa0c0",
  Celts:"#6fd96f", Ethiopia:"#2f9b6b", Huns:"#a0522d", Korea:"#7fc0e0",
  Maya:"#4fb86a", Morocco:"#c04f4f", Netherlands:"#e08030", Poland:"#e05a7a",
  Portugal:"#3f7fa0", Shoshone:"#b0a060", Venice:"#5fb0a0", Zulu:"#8a6a3a",
  Byzantium:"#8f5fd9", Austria:"#e0d0a0", Brazil:"#3fae4a", Assyria:"#a07a4a",
  Babylon:"#5a9fd9", Indonesia:"#c04f8a", Iroquois:"#6a9b4a", Solaria:"#b84fd9",
};
const SPARE = ["#d94f4f","#4f8fd9","#d9a441","#53b06a","#9b6dd9","#d97ab0","#45b8b0",
               "#c77a3a","#b0c23f","#6fd9c0","#e08a5a","#8ad95f"];
const CS = "#76859a";   // города-государства — одним спокойным цветом

const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let TERR, C_FOREST, C_JUNGLE, C_MTN, C_ICE, C_MARSH;
function readColors() {
  TERR = ["--grass","--plains","--desert","--tundra","--snow","--coast","--sea"].map(css);
  C_FOREST = css("--forest"); C_JUNGLE = css("--jungle"); C_MTN = css("--mtn");
  C_ICE = css("--ice"); C_MARSH = css("--marsh"); C_LAKE = css("--lake");
}

const TERR_RU = ["луга","равнины","пустыня","тундра","снег","берег","океан"];
let C_LAKE;
const FEAT_RU = {0:"лёд",1:"джунгли",2:"болото",3:"оазис",4:"пойма",5:"лес",6:"фоллаут"};
const KIND_RU = {1:"Институты",2:"Ветки",3:"Идеология",4:"Пантеон",5:"Религия основана",6:"Религия улучшена"};
const KIND_VERB = {1:"взял институт",2:"открыл ветку",3:"выбрал идеологию",4:"выбрал пантеон",5:"основал религию",6:"улучшил религию"};
// Древние руины и лагеря варваров никто не строит: хозяина у них нет (журнал пишет их на слот 0).
const NOBODY = new Set(["IMPROVEMENT_GOODY_HUT", "IMPROVEMENT_BARBARIAN_CAMP"]);

function initDict(names, icons, iconBase) {
  NAMES = names || {}; ICONS = icons || {}; TILE_Y = NAMES.tileYield || null;
  BYKEY = {};
  for (const t of ["policy", "branch", "belief", "religion"])
    for (const id in (NAMES[t] || {})) BYKEY[NAMES[t][id].k] = NAMES[t][id].n;
  // Полосы иконок — по одной картинке на вид (улучшения, ресурсы); рисуем из них куски.
  for (const slot of ["imp", "res"]) {
    const s = ICONS[slot];
    if (!s || !s.png) continue;
    const img = new Image();
    img.onload = () => { if (D) drawAll(); legendIcons(); };
    img.src = /^data:/.test(s.png) ? s.png : new URL(s.png, iconBase || location.href).href;
    SHEETS[slot] = img;
  }
}

// ---------------------------------------------------------------- состояние
let LIST = [];            // [{id, when, turns, humans, marks, data?}]
let cur = -1;             // номер партии в LIST
let D, owner, steps, cities, told, workByTurn, impByTurn, clickByTurn, colorOf, isCS;
let worked, workedCity, everWorked, impAt, impBy, cityName, pickList, popAt;
let resAt, resN, resFrom, resByTurn, impPrev, aliveNow;
let techByTurn, bldByTurn, tyByTurn, cityEvByTurn, cellEvByTurn, cityYByTurn;
let tileY, techKnown, techQ, cityB, cityQ, cityGY;
// Клетки по ходам. Повтор хранит местность и особенности ТОЛЬКО на последний ход
// (CvReplayInfo::createInfo), поэтому без истории на 7-м ходу «стояли» осадки от ядерных
// ударов конца партии. История — поля feats [ход, клетка, особенность] и terrs [ход,
// клетка, местность, тип] из журнала (события 107 и 105, ход 0 — генерация карты).
let TNOW, featByTurn, terrByTurn, featHist, featFinalOnly;
// Озёра. В Civ5 озеро — та же местность «берег» (TERRAIN_COAST); озером её делает движок:
// водная «суша» (CvLandmass, связные клетки воды по соседству гексов) не больше
// LAKE_MAX_AREA_SIZE клеток (в моде 9) — CvLandmass::isLake. Признака озера нет ни в
// повторе, ни в журнале, поэтому считаем так же. Выдача: к местности + Yields.LakeChange.
let lakeAt, nLakes = 0;
let focus = -1, turn = 0, timer = null, flash = null;
// Точки выдачи по умолчанию выключены: на обзоре это шум, включаются в «Слоях».
const show = { names: true, imp: true, res: true, yield: false, trail: false };
let zoom = 1, R = 12, W = 0, H = 0;
// С какого радиуса клетки рисуются иконки и точки выдачи. Обзор всей карты (100 %) — чистая
// карта держав и городов; подробности появляются при увеличении (широкий экран — со 135 %).
const ICON_R = 13, YIELD_R = 14;
let tab = "players", onlyMain = true, feedAll = false;
let card = null;          // {kind:"city"|"cell", k}

const cv = $("cv"), ctx = cv.getContext("2d");
const fx = $("fx"), fctx = fx.getContext("2d");
const slider = $("slider"), playBtn = $("play"), tip = $("tip"), sc = $("scroll");
const side = $("rpSide"), cardEl = $("card"), mapArea = $("mapArea");

const key = (x, y) => x + y * D.width;
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// «Пшеница» → «пшеница» внутри перечисления; имена собственные (чудеса природы) не трогаем.
const low = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
// 1 переключение, 2 переключения, 5 переключений.
const pl = (n, f) => n + " " + f[(n % 10 === 1 && n % 100 !== 11) ? 0 :
                                (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 1 : 2];

const nameOfKind = (kind, id) => {
  const tbl = {1:"policy",2:"branch",3:"branch",4:"belief",5:"religion",6:"religion"}[kind];
  const rec = tbl && NAMES[tbl] ? NAMES[tbl][String(id)] : null;
  return rec ? rec.n : "№" + id;
};
// Выбор из итогового блока журнала приходит ключами (POLICY_…, BELIEF_…), из потока
// событий — номерами строк базы. Название ищем по ключу в тех же таблицах.
const keyName = k => BYKEY[k] || (NAMES.keyru && NAMES.keyru[k]) || k.replace(/^[A-Z]+_(BRANCH_)?/, "").replace(/_/g, " ").toLowerCase();
function pickTitle(p) {
  if (p.keys && p.keys.length) {
    const ks = p.keys.filter(k => k);
    const rest = (p.kind === 4 || p.kind === 5) ? ks.slice(1).map(keyName) : [];
    return { main: ks.length ? keyName(ks[0]) : "—", rest };
  }
  return { main: nameOfKind(p.kind, p.id),
           rest: (p.beliefs || []).filter(b => b >= 0).map(b => nameOfKind(4, b)) };
}
const impName = id => {
  const rec = NAMES.imp ? NAMES.imp[String(id)] : null;
  if (!rec) return "улучшение №" + id;
  const ic = ICONS.imp && ICONS.imp.map ? ICONS.imp.map[rec.k] : null;
  return (ic && ic.ru) ? ic.ru : rec.n;
};
function nameOfRes(id) {
  const rec = NAMES.res ? NAMES.res[String(id)] : null;
  if (!rec) return "ресурс №" + id;
  const ic = ICONS.res && ICONS.res.map ? ICONS.res.map[rec.k] : null;
  return (ic && ic.ru) ? ic.ru : rec.n;
}
const ORDER_KIND = ["unit", "bld", "proj", "spec", "proc"];
function nameOfOrder(it) {
  const tbl = NAMES[ORDER_KIND[it.o]] || {};
  const rec = tbl[String(it.d)];
  return rec ? rec.n : "заказ №" + it.d;
}
const techName = id => (NAMES.tech && NAMES.tech[String(id)]) ? NAMES.tech[String(id)].n : "технология №" + id;
const bldName = id => (NAMES.bld && NAMES.bld[String(id)]) ? NAMES.bld[String(id)].n : "здание №" + id;

const YRU = ["еда", "молотки", "золото", "наука", "культура", "вера"];
const YCOL = ["#7fd37f", "#e0a040", "#e8d060", "#6fb8e0", "#c88ae0", "#e0e0e0"];
const ylSpans = arr => arr.map((x, i) => x == null ? "" :
  '<span><i style="background:' + YCOL[i] + '"></i>' + YRU[i] + " <b>" + x + "</b></span>").join("");

// ---------------------------------------------------------------- загрузка партии
// Правки, которые раньше делала сборка (build_map.py) и которым нужен словарь, —
// здесь: экспорт на сервере пишет сырые номера, а словаря у него нет.
function normalize(m) {
  if (m._norm) return;
  m._norm = true;
  for (const e of (m.imps || [])) {
    const r = NAMES.imp && NAMES.imp[String(e.imp)];
    if (r && NOBODY.has(r.k)) e.p = -1;
  }
  // Выборы двумя путями: итоговый блок K_PICKS (ключами) и поток событий (номерами).
  // Когда итоговый блок есть, поток его только дублирует.
  const pk = m.picks || [];
  if (pk.some(p => p.keys)) m.picks = pk.filter(p => p.keys);
  // Выдача местности: сборка кладёт её в партию готовой, экспорт сервера — нет
  // (на сервере нет базы игры); тогда берём из таблицы словаря по (тип, местность, особенность).
  // (Выдача местности теперь считается на каждый ход по TNOW — см. totalYield.)
}

function byTurn(arr) {
  const m = new Map();
  for (const e of (arr || [])) {
    if (!m.has(e.turn)) m.set(e.turn, []);
    m.get(e.turn).push(e);
  }
  return m;
}

function setup(m) {
  stop();
  D = m;
  normalize(D);
  isCS = new Map(); colorOf = new Map();
  let spare = 0;
  for (const p of D.players) {
    // Город-государство в повторе — держава, у которой имя совпадает с «цивилизацией».
    const cs = (p.name || "") === (p.civ || "") && (p.civ || "").length > 0;
    isCS.set(p.i, cs);
    colorOf.set(p.i, cs ? CS : (CIV[p.civ] || SPARE[spare++ % SPARE.length]));
  }
  steps = [];
  const land = D.events.filter(e => e.kind === 2 && e.x >= 0).sort((a, b) => a.turn - b.turn);
  let i = 0;
  for (let t = 0; t <= D.finalTurn; t++) {
    const st = [];
    while (i < land.length && land[i].turn <= t) { st.push(land[i]); i++; }
    steps.push(st);
  }
  cities = D.events.filter(e => (e.kind === 1 || e.kind === 3 || e.kind === 4) && e.x >= 0);
  told = D.events.filter(e => e.text && e.text.length > 0);

  // Названия городов — из текста события основания: «Sidon is founded.» / «Основан город Кахокия.»
  cityName = new Map();
  for (const c of cities) {
    if (c.kind !== 1 || !c.text) continue;
    const mm = c.text.match(/^(.+?)\s+(?:is founded|was founded|founded)/i) ||
               c.text.match(/^Основан город\s+(.+?)\.?\s*$/i);
    if (mm) cityName.set(key(c.x, c.y), mm[1].trim());
  }

  workByTurn = byTurn(D.work);
  // Итоги движка и ручные переключения — одним потоком в порядке журнала.
  cellEvByTurn = byTurn([...(D.work || []).map(e => Object.assign({ src: "w" }, e)),
                         ...(D.clicks || []).map(e => Object.assign({ src: "c" }, e))]
                        .sort((a, b) => (a.turn - b.turn) || ((a.s || 0) - (b.s || 0))));
  impByTurn = byTurn(D.imps);
  resByTurn = byTurn(D.res);
  clickByTurn = byTurn(D.clicks);
  techByTurn = byTurn(D.techs);
  bldByTurn = byTurn(D.blds);
  // Выдача клеток: массивы [ход, клетка, еда, молотки, золото, наука, культура, вера].
  tyByTurn = new Map();
  for (const a of (D.tyields || [])) { if (!tyByTurn.has(a[0])) tyByTurn.set(a[0], []); tyByTurn.get(a[0]).push(a); }
  cityYByTurn = cityYieldIndex(D);
  featByTurn = new Map(); terrByTurn = new Map(); featHist = new Uint8Array(D.width * D.height);
  for (const a of (D.feats || [])) {
    if (!featByTurn.has(a[0])) featByTurn.set(a[0], []);
    featByTurn.get(a[0]).push(a); featHist[a[1]] = 1;
  }
  for (const a of (D.terrs || [])) { if (!terrByTurn.has(a[0])) terrByTurn.set(a[0], []); terrByTurn.get(a[0]).push(a); }
  featFinalOnly = !(D.feats || []).length;
  findLakes();
  // Здания и заказы — одним потоком в порядке журнала: так складывается очередь города.
  cityEvByTurn = byTurn([...(D.blds || []).map(e => Object.assign({ src: "b" }, e)),
                         ...(D.orders || []).map(e => Object.assign({ src: "o" }, e))].sort((a, b) => a.s - b.s));
  pickList = (D.picks || []).slice().sort((a, b) => a.turn - b.turn);

  const n = D.width * D.height;
  owner = new Int16Array(n); worked = new Int16Array(n); workedCity = new Int32Array(n);
  everWorked = new Int16Array(n); impAt = new Int16Array(n); impBy = new Int16Array(n);
  resAt = new Int16Array(n); resN = new Int16Array(n); resFrom = new Int16Array(n);
  impPrev = new Map();

  focus = -1; flash = null; card = null; cardEl.hidden = true;
  slider.max = D.finalTurn;
  layerAvail("trail", (D.work || []).length);
  layerAvail("imp", (D.imps || []).length);
  layerAvail("res", (D.res || []).length);
  metaText();
}

// Выдача ГОРОДА — числа самой игры: датчик REPLAYEVENT_NovaCityYield (116) в DLL,
// поле cyields экспорта (отчёт 2026-10-18-DLL-datchik-vydachi-gorodov):
//   { src: "game"|"calc", players: [номера повтора с числами игры], journals,
//     cols: ["turn","p","c","pop","food","surplus","prod","gold","sci","cul","faith","work","spec"],
//     rows: [[…по cols…]] }   выдачи и избыток — целые ×100; work — клетки x+y·ширина
//   (с центром), полный состав на конец хода; spec — пары (номер Specialists, сколько).
// Столбцы ищем по имени из cols — порядок может поменяться. src "calc" или нет поля —
// карточка показывает сумму клеток, как раньше, и подписывает «расчёт».
function cityYieldIndex(m) {
  const cy = m.cyields;
  if (!cy || cy.src !== "game" || !Array.isArray(cy.rows) || !Array.isArray(cy.cols)) return null;
  const at = n => cy.cols.indexOf(n);
  const I = { turn: at("turn"), p: at("p"), c: at("c"), pop: at("pop"), work: at("work"), spec: at("spec"), surplus: at("surplus"),
              y: ["food", "prod", "gold", "sci", "cul", "faith"].map(at) };
  if (I.turn < 0 || I.c < 0 || I.y.some(i => i < 0)) return null;
  const out = new Map();
  for (const r of cy.rows) {
    if (!Array.isArray(r)) continue;
    const t = r[I.turn];
    if (!out.has(t)) out.set(t, []);
    out.get(t).push({ c: r[I.c], p: I.p >= 0 ? r[I.p] : -1, pop: I.pop >= 0 ? r[I.pop] : null,
      y: I.y.map(i => r[i] / 100), surplus: I.surplus >= 0 ? r[I.surplus] / 100 : null,
      work: I.work >= 0 && Array.isArray(r[I.work]) ? r[I.work] : null,
      spec: I.spec >= 0 && Array.isArray(r[I.spec]) ? r[I.spec] : [] });
  }
  return out.size ? out : null;
}

// Водные области — как CvMap::calculateLandmasses: клетки воды (тип клетки 3 — океан/берег,
// в том числе подо льдом), связанные через соседей; карта замкнута по долготе (как и
// hexDist: карты Nova зацикленные; в повторе флага нет). Область ≤ порога — озеро.
function findLakes() {
  const n = D.width * D.height, lim = NAMES.lakeMax || 9;
  lakeAt = new Uint8Array(n); nLakes = 0;
  const seen = new Uint8Array(n), water = k => D.tiles[k].t === 3;
  for (let s = 0; s < n; s++) {
    if (seen[s] || !water(s)) continue;
    const area = [s]; seen[s] = 1;
    for (let i = 0; i < area.length; i++) {
      const k = area[i], x = k % D.width, y = (k / D.width) | 0, hx = x - half(y);
      for (const d of HDIR) {
        const ny = y + d[1];
        if (ny < 0 || ny >= D.height) continue;
        const nx = ((hx + d[0] + half(ny)) % D.width + D.width) % D.width, nk = nx + ny * D.width;
        if (!seen[nk] && water(nk)) { seen[nk] = 1; area.push(nk); }
      }
    }
    if (area.length <= lim) { for (const k of area) lakeAt[k] = 1; nLakes++; }
  }
}

function layerAvail(name, ok) {
  const box = document.querySelector('[data-layer="' + name + '"]');
  if (!box) return;
  box.disabled = !ok;
  box.closest(".rp-layer").classList.toggle("off", !ok);
}
// Подписи в меню слоёв: чего нет в записи и что появится только при увеличении.
function layerHints() {
  const zoomIn = "видно при увеличении (+)";
  $("impNote").textContent = !(D.imps || []).length ? "в записи нет улучшений" : R < ICON_R ? zoomIn : "";
  $("resNote").textContent = !(D.res || []).length ? "в записи нет ресурсов" : R < ICON_R ? zoomIn : "";
  $("yieldNote").textContent = R < YIELD_R ? zoomIn : "";
  $("trailNote").textContent = !(D.work || []).length ? "в записи нет клеток городов" : "где жители стояли раньше";
}

function metaText() {
  const parts = ["карта <b>" + D.width + "×" + D.height + "</b>", "ходов <b>" + D.finalTurn + "</b>",
                 "записана <b>" + esc(D.when) + "</b>"];
  parts.push("озёр " + nLakes);
  parts.push((D.res || []).length ? "ресурсов на карте <b>" + D.res.length + "</b>" : "ресурсов в записи нет");
  if (!(D.work || []).length) parts.push("клеток городов нет");
  if (!(D.picks || []).length) parts.push("выборов нет");
  const src = resSource(-2);
  $("meta").innerHTML = "Эта запись: " + parts.join(" · ") + (src ? ". " + esc(src.charAt(0).toUpperCase() + src.slice(1)) + "." : "") +
    (featFinalOnly ? " Лес, джунгли, осадки и прочие особенности клеток — на конец партии: истории клеток в этой записи нет." : "");
}

// ---------------------------------------------------------------- размер и масштаб
// 100 % — вся карта в окне целиком; увеличение растит клетку.
function fitR() {
  const w = sc.clientWidth || 900, h = sc.clientHeight || 600;
  const byW = (w - 8) / (Math.sqrt(3) * (D.width + 0.5));
  const byH = (h - 8) / (1.5 * (D.height - 1) + 2);
  return Math.max(4, Math.min(byW, byH));
}
function resize() {
  R = Math.max(4, Math.min(48, fitR() * zoom));
  W = Math.sqrt(3) * R; H = 1.5 * R;
  const dpr = 1;   // карта рисуется в пикселях CSS: чёткость важнее не настолько, чтобы платить памятью
  cv.width = Math.ceil(W * (D.width + 0.5)) + 6;
  cv.height = Math.ceil(H * (D.height - 1) + 2 * R) + 6;
  cv.style.width = cv.width / dpr + "px"; cv.style.height = cv.height / dpr + "px";
  fx.width = cv.width; fx.height = cv.height;
  fx.style.width = cv.style.width; fx.style.height = cv.style.height;
  $("zoomLabel").textContent = Math.round(zoom * 100) + "%";
  layerHints();
}
// Масштаб вокруг точки (по умолчанию — центр окна карты): точка под ней остаётся на месте.
function setZoom(z, ax, ay) {
  z = Math.max(1, Math.min(8, z));
  if (!D || Math.abs(z - zoom) < 1e-6) return;
  const vw = sc.clientWidth, vh = sc.clientHeight;
  if (ax == null) { ax = vw / 2; ay = vh / 2; }
  const r0 = cv.getBoundingClientRect(), s0 = sc.getBoundingClientRect();
  const fxp = (s0.left + ax - r0.left) / r0.width, fyp = (s0.top + ay - r0.top) / r0.height;
  zoom = z; resize(); drawAll();
  const r1 = cv.getBoundingClientRect();
  sc.scrollLeft += (r1.left + fxp * r1.width) - (s0.left + ax);
  sc.scrollTop += (r1.top + fyp * r1.height) - (s0.top + ay);
  placeCard();
}

// ---------------------------------------------------------------- состояние на ход
function rebuild(t) {
  owner.fill(-1); worked.fill(-1); workedCity.fill(-1); everWorked.fill(-1);
  impAt.fill(-1); impBy.fill(-1); resAt.fill(-1); resN.fill(0); resFrom.fill(-1);
  popAt = new Map(); impPrev = new Map();
  tileY = new Map(); techKnown = new Map(); techQ = new Map(); cityB = new Map(); cityQ = new Map();
  cityGY = new Map();
  // Клетки на ход t: у клеток с историей особенности — с нуля (до первого события её не было:
  // ход 0 журнала — вся генерация карты), у остальных — как в повторе. На последнем ходу
  // повтор главнее журнала (журнал мог оборваться раньше).
  const fin = t >= D.finalTurn;
  TNOW = D.tiles.map((p, k) => fin ? p : { t: p.t, r: p.r, f: featHist[k] ? -1 : p.f, v: p.v });
  if (!fin) for (let i = 0; i <= t; i++) {
    for (const a of (featByTurn.get(i) || [])) TNOW[a[1]].f = a[2];
    for (const a of (terrByTurn.get(i) || [])) { TNOW[a[1]].r = a[2]; TNOW[a[1]].t = a[3]; }
  }
  for (let i = 0; i <= t; i++) {
    for (const e of steps[i]) owner[key(e.x, e.y)] = e.p;
    for (const w of (cellEvByTurn.get(i) || [])) {
      // Ручное переключение (TASK_CHANGE_WORKING_PLOT) — переключатель: клетка была под
      // жителем этого города — житель снят, не была — поставлен.
      if (w.src === "c") {
        const k = key(w.x, w.y), wc = key(w.cx, w.cy);
        if (k === wc) continue;
        if (workedCity[k] === wc) { worked[k] = -1; workedCity[k] = -1; }
        else { worked[k] = w.p; workedCity[k] = wc; everWorked[k] = w.p; }
        continue;
      }
      popAt.set(key(w.cx, w.cy), w.pop);
      // Снимаем жителя, только если клетку держал именно этот город.
      const wc = key(w.cx, w.cy);
      for (const a of w.rem) { const k = key(a[0], a[1]); if (workedCity[k] === wc) { worked[k] = -1; workedCity[k] = -1; } }
      for (const a of w.add) {
        const k = key(a[0], a[1]);
        worked[k] = w.p; workedCity[k] = wc; everWorked[k] = w.p;
      }
    }
    // Улучшение на клетке — последнее по времени; снос — то же событие с типом −1.
    for (const e of (impByTurn.get(i) || [])) {
      const k = key(e.x, e.y);
      if (i === t && !impPrev.has(k)) impPrev.set(k, impAt[k]);
      impAt[k] = e.imp; impBy[k] = e.p;
    }
    for (const a of (tyByTurn.get(i) || [])) tileY.set(a[1], a.slice(2));
    // Датчик игры: полный состав клеток города на конец хода — он точнее восстановления по
    // перестановкам, поэтому заменяет его для этого города (центр — кружок города, не житель).
    if (cityYByTurn) for (const r of (cityYByTurn.get(i) || [])) {
      cityGY.set(r.c, Object.assign({ turn: i }, r));
      if (r.pop != null) popAt.set(r.c, r.pop);
      if (r.work) {
        // Клетки города — не дальше трёх от центра: чистим только это окно, не всю карту.
        const ccx = r.c % D.width, ccy = (r.c / D.width) | 0;
        for (let yy = Math.max(0, ccy - 3); yy <= Math.min(D.height - 1, ccy + 3); yy++)
          for (let dx = -4; dx <= 4; dx++) {
            const k = ((ccx + dx + D.width) % D.width) + yy * D.width;
            if (workedCity[k] === r.c) { worked[k] = -1; workedCity[k] = -1; }
          }
        const wp = owner[r.c] >= 0 ? owner[r.c] : r.p;
        for (const k of r.work) {
          if (k === r.c || k < 0 || k >= worked.length) continue;
          worked[k] = wp; workedCity[k] = r.c; everWorked[k] = wp;
        }
      }
    }
    for (const e of (techByTurn.get(i) || [])) {
      if (e.p < 0) continue;
      if (!techKnown.has(e.p)) { techKnown.set(e.p, new Map()); techQ.set(e.p, []); }
      const q = techQ.get(e.p);
      if (e.k === "a") {
        techKnown.get(e.p).set(e.t, i);
        const at = q.indexOf(e.t); if (at >= 0) q.splice(at, 1);
      } else if (e.k === "r") { q.length = 0; q.push(e.t); }
      else if (e.k === "q") { if (!q.includes(e.t)) q.push(e.t); }
    }
    for (const e of (cityEvByTurn.get(i) || [])) cityStep(e, i);
    // Ресурс, однажды увиденный, с клетки уже не пропадает.
    for (const e of (resByTurn.get(i) || [])) {
      const k = key(e.x, e.y);
      if (resAt[k] !== e.res) resFrom[k] = i;
      resAt[k] = e.res; resN[k] = e.n || 0;
    }
  }
  aliveNow = null;
}

// Один шаг жизни города. Очередь — по правилам CvCity::pushOrder:
// Shift очищает очередь, Ctrl ставит в конец, без них — в начало.
function cityStep(e, turnNo) {
  const c = e.c;
  if (!cityB.has(c)) cityB.set(c, new Map());
  if (!cityQ.has(c)) cityQ.set(c, []);
  const B = cityB.get(c), q = cityQ.get(c);
  const dropB = b => { for (let j = q.length - 1; j >= 0; j--) if (q[j].o === 1 && q[j].d === b) q.splice(j, 1); };
  if (e.src === "b") {
    if (e.k === "s") B.delete(e.b);
    else { B.set(e.b, { turn: turnNo, how: e.k, y: e.y }); dropB(e.b); }
    return;
  }
  if (e.k === "push") {
    const it = { o: e.o, d: e.d, alt: e.alt };
    if (e.sh) q.length = 0;
    if (e.ct) q.push(it); else q.unshift(it);
  } else if (e.k === "pop") {
    const n = e.n < 0 ? q.length - 1 : e.n;
    if (n >= 0 && n < q.length) q.splice(n, 1);
  } else if (e.k === "swap") {
    if (e.n >= 0 && e.n + 1 < q.length) { const t = q[e.n]; q[e.n] = q[e.n + 1]; q[e.n + 1] = t; }
  } else if (e.k === "u") {
    if (q.length && q[0].o === 0 && q[0].d === e.d && !q[0].alt) q.shift();
  }
}

// Выдача клетки на ход: из игры (событие YieldChanged журнала), а если клетка с начала
// партии не менялась — расчёт страницы (местность + улучшение + ресурс; без рек и техов).
function cellYield(k) {
  const g = tileY && tileY.get(k);
  if (g) return { y: g, game: true };
  const c = totalYield(k);
  return { y: c ? [c[0], c[1], c[2], 0, 0, 0] : [0, 0, 0, 0, 0, 0], game: false };
}
// Сумма по клеткам города: центр + клетки с жителями этого города. Не выдача города в игре.
function cityTiles(ck) {
  const sum = [0, 0, 0, 0, 0, 0];
  let n = 0, fromGame = 0;
  const add = k => { const cy = cellYield(k); for (let i = 0; i < 6; i++) sum[i] += cy.y[i]; n++; if (cy.game) fromGame++; };
  add(ck);
  for (let k = 0; k < worked.length; k++) if (k !== ck && workedCity[k] === ck) add(k);
  return { sum, n, fromGame };
}
function seriesAt(p, name) {
  const s = D.series && D.series[p] ? D.series[p][name] : null;
  if (!s) return null;
  for (let t = Math.min(turn, s.length - 1); t >= 0 && t >= turn - 1; t--) if (s[t] != null) return s[t];
  return null;
}

// ---------------------------------------------------------------- геометрия
// Игровой X уже сдвинут по чётности ряда, поэтому смещение половины клетки зависит
// от чётности ИГРОВОГО y. В повторе Y растёт на север, на экране — вниз.
function centerOf(x, y) {
  const row = D.height - 1 - y;
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
const HDIR = [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
const half = y => (y >= 0 ? (y >> 1) : -((-y + 1) >> 1));
function neighbor(x, y, dir) {
  const hx = x - half(y);
  const ny = y + HDIR[dir][1];
  if (ny < 0 || ny >= D.height) return -1;
  const nx = hx + HDIR[dir][0] + half(ny);
  if (nx < 0 || nx >= D.width) return -1;
  return key(nx, ny);
}
// Расстояние по клеткам с учётом того, что карта замкнута по долготе.
function hexDist(x1, y1, x2, y2) {
  const a = x1 - half(y1), dy = y2 - y1;
  let best = 1e9;
  for (const wrap of [0, D.width, -D.width]) {
    const dx = (x2 + wrap - half(y2)) - a;
    best = Math.min(best, (Math.abs(dx) + Math.abs(dy) + Math.abs(dx + dy)) / 2);
  }
  return best;
}

// ---------------------------------------------------------------- рисование
function tileFill(p, k) {
  if (p.t === 0) return C_MTN;
  if (p.f === 0) return C_ICE;
  if (lakeAt && lakeAt[k]) return C_LAKE;
  if (p.f === 5) return C_FOREST;
  if (p.f === 1) return C_JUNGLE;
  if (p.f === 2) return C_MARSH;
  return TERR[p.r] || TERR[6];
}
// Рисунки местности: горы — гребень, лес и джунгли — кроны, холм — горб, лёд — крошка.
function glyph(p, cx, cy, a) {
  ctx.globalAlpha = a;
  if (p.t === 0) {
    ctx.fillStyle = "#cfd8e2";
    ctx.beginPath();
    ctx.moveTo(cx - R * .5, cy + R * .34); ctx.lineTo(cx - R * .12, cy - R * .36);
    ctx.lineTo(cx + R * .18, cy + R * .1); ctx.lineTo(cx + R * .36, cy - R * .16);
    ctx.lineTo(cx + R * .62, cy + R * .34);
    ctx.closePath(); ctx.fill();
  } else if (p.f === 5 || p.f === 1) {
    ctx.fillStyle = p.f === 5 ? "#9ed88a" : "#bfe88c";
    for (const t of [[-.3, .12, .3], [.12, -.12, .34], [.34, .24, .26]]) {
      ctx.beginPath();
      ctx.moveTo(cx + R * t[0], cy + R * (t[1] - t[2]));
      ctx.lineTo(cx + R * (t[0] - t[2] * .72), cy + R * (t[1] + t[2] * .6));
      ctx.lineTo(cx + R * (t[0] + t[2] * .72), cy + R * (t[1] + t[2] * .6));
      ctx.closePath(); ctx.fill();
    }
  } else if (p.t === 1) {
    ctx.strokeStyle = "#000000"; ctx.lineWidth = Math.max(1.4, R * .16);
    ctx.beginPath(); ctx.arc(cx, cy + R * .22, R * .42, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
  } else if (p.f === 0) {
    ctx.fillStyle = "#8fb6cf";
    for (const o of [[-.26, -.14], [.18, .02], [-.04, .3]]) {
      ctx.beginPath(); ctx.arc(cx + R * o[0], cy + R * o[1], R * .13, 0, 7); ctx.fill();
    }
  } else if (p.f === 3) {
    ctx.fillStyle = "#4fd9b0";
    ctx.beginPath(); ctx.arc(cx, cy, R * .26, 0, 7); ctx.fill();
  } else if (p.f === 2) {
    ctx.strokeStyle = "#8fd8c0"; ctx.lineWidth = Math.max(1, R * .12);
    for (const dy of [-.2, .08, .34]) {
      ctx.beginPath(); ctx.moveTo(cx - R * .34, cy + R * dy); ctx.lineTo(cx + R * .34, cy + R * dy); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
// Полная выдача клетки: из игры, если клетка менялась; иначе основа + улучшение + ресурс.
function totalYield(k) {
  const g = tileY && tileY.get(k);
  if (g) return [g[0], g[1], g[2]];
  const q = TNOW[k];
  const base = TILE_Y ? (TILE_Y[q.t + "," + q.r + "," + q.f] || null) : (D.yields ? D.yields[k] : null);
  if (!base) return null;
  const out = [base[0], base[1], base[2]];
  if (lakeAt && lakeAt[k] && NAMES.lakeChange) for (let i = 0; i < 3; i++) out[i] += NAMES.lakeChange[i];
  const id = impAt[k];
  const rec = id >= 0 && NAMES.imp ? NAMES.imp[String(id)] : null;
  if (rec && rec.y) for (let i = 0; i < 3; i++) out[i] += rec.y[i];
  const rid = resAt ? resAt[k] : -1;
  const rrec = rid >= 0 && NAMES.res ? NAMES.res[String(rid)] : null;
  if (rrec && rrec.y) for (let i = 0; i < 3; i++) out[i] += rrec.y[i];
  // Как в игре (CvPlot::calculateYield): выдача клетки не бывает меньше нуля — осадки
  // с их −2/−2/−3 обнуляют клетку, а не уводят город в минус.
  for (let i = 0; i < 3; i++) if (out[i] < 0) out[i] = 0;
  return out;
}
// Точки выдачи: зелёный кружок — еда, оранжевый квадрат — молотки, жёлтый ромб — золото.
function pips(y, cx, cy) {
  if (!y) return;
  const items = [];
  for (let i = 0; i < Math.min(y[0], 5); i++) items.push(0);
  for (let i = 0; i < Math.min(y[1], 5); i++) items.push(1);
  for (let i = 0; i < Math.min(y[2], 5); i++) items.push(2);
  if (!items.length) return;
  const r = Math.max(1.5, R * 0.1), gap = r * 2.5;
  let x = cx - (items.length - 1) * gap / 2;
  for (const t of items) {
    ctx.beginPath();
    if (t === 0) { ctx.arc(x, cy, r, 0, 7); ctx.fillStyle = "#7fd37f"; }
    else if (t === 1) { ctx.rect(x - r, cy - r, r * 2, r * 2); ctx.fillStyle = "#e0a040"; }
    else {
      ctx.moveTo(x, cy - r * 1.3); ctx.lineTo(x + r * 1.3, cy);
      ctx.lineTo(x, cy + r * 1.3); ctx.lineTo(x - r * 1.3, cy);
      ctx.closePath(); ctx.fillStyle = "#e8d060";
    }
    ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = "#0b1119b0"; ctx.stroke();
    x += gap;
  }
}
// Для чего в игре нет своей иконки улучшения — рисуем сами: руины, хижина, лагерь.
function drawnByHand(id, cx, cy) {
  const k = NAMES.imp && NAMES.imp[String(id)] ? NAMES.imp[String(id)].k : "";
  ctx.lineWidth = Math.max(1.2, R * 0.12);
  if (k === "IMPROVEMENT_GOODY_HUT") {
    ctx.fillStyle = "#e4c98a";
    ctx.beginPath();
    ctx.moveTo(cx, cy - R * .3); ctx.lineTo(cx + R * .32, cy + R * .24);
    ctx.lineTo(cx - R * .32, cy + R * .24); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#6b4f2a"; ctx.stroke();
  } else if (k === "IMPROVEMENT_BARBARIAN_CAMP") {
    ctx.fillStyle = "#d9534f";
    ctx.beginPath();
    ctx.moveTo(cx, cy - R * .32); ctx.lineTo(cx + R * .22, cy + R * .2);
    ctx.lineTo(cx - R * .22, cy + R * .2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#2b1b1b"; ctx.stroke();
  } else {
    ctx.fillStyle = "#cbbfae";
    for (const o of [[-.26, .06, .18], [0, -.06, .22], [.26, .08, .16]]) {
      ctx.fillRect(cx + R * o[0] - R * .09, cy + R * o[1] - R * o[2], R * .18, R * o[2] * 2);
    }
    ctx.strokeStyle = "#4a4138"; ctx.lineWidth = 1; ctx.strokeRect(cx - R * .36, cy - R * .24, R * .72, R * .46);
  }
}
function iconFor(slot, id) {
  const sh = SHEETS[slot], pack = ICONS[slot];
  if (!sh || !sh.complete || !sh.naturalWidth || !pack || id < 0) return null;
  const rec = NAMES[slot] ? NAMES[slot][String(id)] : null;
  if (!rec) return null;
  return pack.map[rec.k] || null;
}

function aliveCities() {
  if (aliveNow) return aliveNow;
  const alive = new Map();
  for (const c of cities) {
    if (c.turn > turn) continue;
    const k = key(c.x, c.y);
    if (c.kind === 4) alive.delete(k); else alive.set(k, c);
  }
  return (aliveNow = alive);
}

function drawAll() {
  if (!D) return;
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.lineJoin = "round";
  const alive = aliveCities();

  const addNow = new Set(), remNow = new Set(), clickNow = new Set(), impNow = new Set();
  for (const w of (workByTurn.get(turn) || [])) {
    if (focus >= 0 && w.p !== focus) continue;
    for (const a of w.add) addNow.add(key(a[0], a[1]));
    for (const a of w.rem) remNow.add(key(a[0], a[1]));
  }
  for (const c of (clickByTurn.get(turn) || [])) {
    if (focus >= 0 && c.p !== focus) continue;
    clickNow.add(key(c.x, c.y));
  }
  for (const e of (impByTurn.get(turn) || [])) {
    if (focus >= 0 && e.p !== focus) continue;
    impNow.add(key(e.x, e.y));
  }

  // 1. местность и заливка владельца
  for (let y = 0; y < D.height; y++) {
    for (let x = 0; x < D.width; x++) {
      const k = key(x, y), p = TNOW[k], own = owner[k];
      const c = centerOf(x, y), cx = c[0], cy = c[1];
      const faded = focus >= 0 && own !== focus;
      ctx.globalAlpha = faded ? 0.5 : 1;
      hexPath(cx, cy); ctx.fillStyle = tileFill(p, k); ctx.fill();
      if (own >= 0) {
        hexPath(cx, cy);
        ctx.fillStyle = colorOf.get(own) + (faded ? "33" : "66");
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (R >= 5) glyph(p, cx, cy, faded ? 0.26 : 0.62);
    }
  }

  // 1б. реки: признаки по северо-западному, западному и северо-восточному ребру.
  for (let y = 0; y < D.height; y++) {
    for (let x = 0; x < D.width; x++) {
      const p = D.tiles[key(x, y)];
      if (!p.v) continue;
      const c = centerOf(x, y), cx = c[0], cy = c[1];
      for (const pair of [[1, 2], [2, 3], [4, 1]]) {
        if (!(p.v & pair[0])) continue;
        const a0 = Math.PI / 180 * (-30 - 60 * pair[1]);
        ctx.strokeStyle = "#3c86c7"; ctx.lineWidth = Math.max(1.6, R * 0.16);
        ctx.beginPath();
        ctx.moveTo(cx + R * Math.cos(a0), cy + R * Math.sin(a0));
        ctx.lineTo(cx + R * Math.cos(a0 + Math.PI / 3), cy + R * Math.sin(a0 + Math.PI / 3));
        ctx.stroke();
      }
    }
  }

  // 2. границы — только там, где владелец меняется
  for (let y = 0; y < D.height; y++) {
    for (let x = 0; x < D.width; x++) {
      const k = key(x, y), own = owner[k];
      if (own < 0) continue;
      const c = centerOf(x, y), cx = c[0], cy = c[1];
      ctx.globalAlpha = (focus >= 0 && own !== focus) ? 0.35 : 1;
      for (let dir = 0; dir < 6; dir++) {
        const nk = neighbor(x, y, dir);
        if (nk >= 0 && owner[nk] === own) continue;
        const a0 = Math.PI / 180 * (-30 - 60 * dir);
        const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
        const x1 = cx + R * Math.cos(a0 + Math.PI / 3), y1 = cy + R * Math.sin(a0 + Math.PI / 3);
        ctx.strokeStyle = "#0b1119"; ctx.lineWidth = Math.max(2.6, R * 0.34);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.strokeStyle = colorOf.get(own); ctx.lineWidth = Math.max(1.6, R * 0.2);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  // 3. ресурсы и улучшения — игровыми иконками. Оба на клетке — ресурс слева,
  // улучшение справа и чуть ниже. На клетке города иконок нет (кружок города).
  const cityAt = new Set(alive.keys());
  const ring = (cx, cy, s) => {
    ctx.beginPath(); ctx.arc(cx, cy, s / 2 + 0.6, 0, 7);
    ctx.lineWidth = Math.max(1.2, R * 0.07); ctx.strokeStyle = "#0b1119"; ctx.stroke();
  };
  // Мелко (обзор всей карты) иконки — только шум: рисуем их с R ≥ ICON_R. Но у выделенной
  // державы — с R ≥ 6: остальная карта приглушена, и «выбрал — значков нет» сбивало с толку.
  const iconsAll = R >= ICON_R, iconsFocus = !iconsAll && focus >= 0 && R >= 6;
  if (iconsAll || iconsFocus) for (let k = 0; k < impAt.length; k++) {
    if (iconsFocus && owner[k] !== focus && impBy[k] !== focus) continue;
    let rid = show.res ? resAt[k] : -1, iid = show.imp ? impAt[k] : -1;
    if (iid >= 0 && focus >= 0 && impBy[k] >= 0 && impBy[k] !== focus) iid = -1;
    if ((rid < 0 && iid < 0) || cityAt.has(k)) continue;
    const x = k % D.width, y = (k / D.width) | 0;
    const c = centerOf(x, y), cx = c[0], cy = c[1];
    const both = rid >= 0 && iid >= 0;
    if (rid >= 0) {
      const s = both ? R * 0.96 : R * 1.12;
      const px = both ? cx - R * 0.3 : cx, py = cy + R * 0.02;
      const ic = iconFor("res", rid);
      if (ic) { ctx.drawImage(SHEETS.res, ic.x, 0, ic.w, ic.h, px - s / 2, py - s / 2, s, s); ring(px, py, s); }
      else {
        ctx.beginPath(); ctx.arc(px, py, s * 0.3, 0, 7);
        ctx.fillStyle = "#e8d060"; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = "#0b1119"; ctx.stroke();
      }
    }
    if (iid >= 0) {
      const s = both ? R * 0.82 : R * 1.08;
      const px = both ? cx + R * 0.36 : cx, py = both ? cy + R * 0.14 : cy + R * 0.02;
      const ic = iconFor("imp", iid);
      if (ic) { ctx.drawImage(SHEETS.imp, ic.x, 0, ic.w, ic.h, px - s / 2, py - s / 2, s, s); ring(px, py, s); }
      else drawnByHand(iid, px, py);
    }
    if (iid >= 0 && impNow.has(k)) {
      hexPath(cx, cy); ctx.strokeStyle = "#f2d06b"; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  // 3б. выдача клетки — только на занятой земле и там, где стоят жители.
  if (show.yield && (D.yields || TILE_Y) && R >= YIELD_R) {
    for (let y = 0; y < D.height; y++) {
      for (let x = 0; x < D.width; x++) {
        const k = key(x, y);
        if (owner[k] < 0 && worked[k] < 0) continue;
        if (focus >= 0 && owner[k] !== focus && worked[k] !== focus) continue;
        const c = centerOf(x, y);
        pips(totalYield(k), c[0], c[1] - R * 0.52);
      }
    }
  }

  // 4. клетки: след, состояние, перемены этого хода, ручное переключение
  for (let k = 0; k < worked.length; k++) {
    const ev = everWorked[k], wp = worked[k];
    if (ev < 0 && wp < 0 && !addNow.has(k) && !remNow.has(k) && !clickNow.has(k)) continue;
    const x = k % D.width, y = (k / D.width) | 0;
    const c = centerOf(x, y), cx = c[0], cy = c[1];
    if (show.trail && ev >= 0 && wp < 0 && (focus < 0 || ev === focus)) {
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.15, 0, 7);
      ctx.fillStyle = "#3d5570"; ctx.fill();
    }
    if (wp >= 0 && (focus < 0 || wp === focus) && R >= 8) {
      ctx.beginPath(); ctx.arc(cx, cy + R * 0.7, Math.max(1.4, R * 0.16), 0, 7);
      ctx.fillStyle = "#ffffff"; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = "#0b1119"; ctx.stroke();
    }
    if (addNow.has(k)) {
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.46, 0, 7);
      ctx.lineWidth = 2.4; ctx.strokeStyle = "#8fe3a0"; ctx.stroke();
    }
    if (remNow.has(k)) {
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.46, 0, 7);
      ctx.lineWidth = 2.4; ctx.strokeStyle = "#e36f6f"; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - R * .24, cy - R * .24); ctx.lineTo(cx + R * .24, cy + R * .24);
      ctx.moveTo(cx + R * .24, cy - R * .24); ctx.lineTo(cx - R * .24, cy + R * .24);
      ctx.lineWidth = 1.8; ctx.stroke();
    }
    // Ручное переключение игроком — белая рамка: это решение человека, а не движка.
    if (clickNow.has(k)) {
      hexPath(cx, cy);
      ctx.strokeStyle = "#0b1119"; ctx.lineWidth = Math.max(4, R * 0.36); ctx.stroke();
      hexPath(cx, cy);
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(2, R * 0.2); ctx.stroke();
    }
  }

  // 5. города
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const sel = card && card.kind === "city" ? card.k : -1;
  for (const pair of alive) {
    const k = pair[0], c = pair[1];
    const pos = centerOf(c.x, c.y), cx = pos[0], cy = pos[1];
    const faded = focus >= 0 && c.p !== focus;
    ctx.globalAlpha = faded ? 0.4 : 1;
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(3, R * 0.5), 0, 7);
    ctx.fillStyle = colorOf.get(c.p) || "#99a"; ctx.fill();
    ctx.lineWidth = R >= 8 ? 2.4 : 1.6; ctx.strokeStyle = "#0b1119"; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.8, R * 0.33), 0, 7);
    ctx.fillStyle = "#f3f7fb"; ctx.fill();
    if (c.turn === turn || k === sel) {
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.95, 0, 7);
      ctx.lineWidth = 2.2; ctx.strokeStyle = k === sel ? "#76C6C0" : "#f2d06b"; ctx.stroke();
    }
    const pop = popAt.get(k);
    if (pop && !faded && R >= 8) {
      ctx.font = "700 " + Math.max(9, Math.round(R * 0.78)) + "px system-ui, sans-serif";
      ctx.fillStyle = "#0b1119";
      ctx.fillText(String(pop), cx, cy + R * 0.04);
    }
    const nm = cityName.get(k);
    if (show.names && nm && !faded && R >= 7) {
      ctx.font = "600 " + Math.max(10, Math.round(R * 0.74)) + "px system-ui, sans-serif";
      const label = pop ? nm + " · " + pop : nm;
      const w = ctx.measureText(label).width, bh = Math.max(13, R * 0.96);
      const bx = cx - w / 2 - 3, by = cy - R * 0.62 - bh - 1;
      ctx.fillStyle = "#0b1119e0";
      ctx.fillRect(bx, by, w + 6, bh);
      ctx.fillStyle = "#e8eef6";
      ctx.fillText(label, cx, by + bh / 2 + 0.5);
    }
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- имена
function playerOf(p) { for (const q of D.players) if (q.i === p) return q; return null; }
// Имя державы или ГГ. Номеров не показываем: нет имени — первый город игрока.
function nameOf(p) {
  if (p < 0) return "ничья земля";
  const pp = playerOf(p);
  if (pp && (pp.name || pp.civ)) return pp.name || pp.civ;
  for (const q of (D.pnames || [])) if (q.i === p && (q.name || q.nick)) return q.name || q.nick;
  for (const c of cities) if (c.p === p && cityName.get(key(c.x, c.y)))
    return "город-государство " + cityName.get(key(c.x, c.y));
  return "неизвестная держава";
}
// Ник человека из журнала, если он отличается от имени в повторе.
function nickOf(p) {
  for (const q of (D.pnames || [])) if (q.i === p && q.nick && q.nick !== nameOf(p)) return q.nick;
  return "";
}
function civOf(p) { const pp = playerOf(p); return pp ? (pp.civ || "") : ""; }
// Город, к которому относится клетка: чей житель на ней, иначе ближайший город хозяина (≤3).
function cityOfCell(k) {
  if (workedCity[k] >= 0 && cityName.get(workedCity[k])) return cityName.get(workedCity[k]);
  const x = k % D.width, y = (k / D.width) | 0, own = owner[k];
  let best = "", bd = 4;
  for (const pair of aliveCities()) {
    const c = pair[1];
    if (own >= 0 && c.p !== own) continue;
    const d = hexDist(x, y, c.x, c.y);
    if (d < bd && cityName.get(pair[0])) { bd = d; best = cityName.get(pair[0]); }
  }
  return best;
}
function cityLabel(ck) { return cityName.get(ck) || ("город " + nameOf(owner[ck])); }
// Клетка словами: местность (или чудо природы), особенность, ресурс, улучшение.
function cellDesc(k, noImp, noRes) {
  const p = TNOW[k], parts = [];
  const frec = p.f >= 0 && NAMES.feat ? NAMES.feat[String(p.f)] : null;
  const fe = frec ? frec.n : (FEAT_RU[p.f] || "");
  const wonder = !!fe && fe.charAt(0) !== fe.charAt(0).toLowerCase();
  if (wonder) parts.push(fe);
  else {
    parts.push(p.t === 0 ? "горы" : lakeAt && lakeAt[k] ? "озеро" : (TERR_RU[p.r] || "клетка"));
    if (p.t === 1) parts.push("холм");
    if (fe) parts.push(fe);
  }
  if (!noRes && resAt[k] >= 0) parts.push(low(nameOfRes(resAt[k])));
  if (!noImp && impAt[k] >= 0) parts.push(low(impName(impAt[k])));
  return parts.join(", ");
}
function cellLink(k, t, text) {
  return '<span class="cell" data-k="' + k + '" data-t="' + t + '" role="button" tabindex="0" ' +
         'title="Показать на карте">' + esc(text) + "</span>";
}

// ---------------------------------------------------------------- державы
function counts() {
  const land = new Map(), work = new Map(), city = new Map(), imp = new Map();
  for (let i = 0; i < owner.length; i++) if (owner[i] >= 0) land.set(owner[i], (land.get(owner[i]) || 0) + 1);
  for (let i = 0; i < worked.length; i++) if (worked[i] >= 0) work.set(worked[i], (work.get(worked[i]) || 0) + 1);
  for (let i = 0; i < impAt.length; i++) if (impAt[i] >= 0 && impBy[i] >= 0) imp.set(impBy[i], (imp.get(impBy[i]) || 0) + 1);
  for (const c of aliveCities().values()) city.set(c.p, (city.get(c.p) || 0) + 1);
  return { land, work, city, imp };
}
// Выдача державы за ход — ряды самого повтора (игра считает их сама), не расчёт.
function ylLine(p) {
  const keys = ["foodperturn", "productionperturn", "goldperturn", "scienceperturn", "cultureperturn", "faithperturn"];
  const v = keys.map(k => seriesAt(p, k));
  if (v.every(x => x == null)) return "";
  return '<span class="yl" title="Выдача державы за ход — числа самой игры (ряды повтора)">' + ylSpans(v) + "</span>";
}
function panel() {
  const n = counts();
  const seen = new Set([...n.land.keys(), ...n.city.keys()]);
  const majors = [...seen].filter(p => !isCS.get(p));
  majors.sort((a, b) => (n.land.get(b) || 0) - (n.land.get(a) || 0));
  const box = $("players");
  box.innerHTML = majors.map(p => {
    const ci = n.city.get(p) || 0, on = focus === p;
    let s = '<div class="pl' + (on ? " on" : "") + '" data-p="' + p + '" role="button" tabindex="0" aria-pressed="' + on + '">' +
      '<i class="sw" style="background:' + colorOf.get(p) + '"></i>' +
      '<span class="nm">' + esc(nameOf(p)) + '</span><span class="n">' + (ci ? pl(ci, ["город", "города", "городов"]) : "") + "</span></div>";
    if (on) {
      const w = n.work.get(p) || 0, im = n.imp.get(p) || 0;
      const tk = seriesAt(p, "techsknown"), wt = seriesAt(p, "workedtiles");
      const q = techQ && techQ.get(p), curT = q && q.length ? techName(q[0]) : "";
      s += '<div class="pl-more">' +
        "<span>" + esc(civOf(p)) + (nickOf(p) ? " · игрок " + esc(nickOf(p)) : "") + "</span>" +
        '<span class="st"><span>земли <b>' + (n.land.get(p) || 0) + "</b> кл.</span>" +
        (w ? "<span>жителей на клетках <b>" + w + "</b></span>" : "") +
        (im ? "<span>улучшений <b>" + im + "</b></span>" : "") +
        (wt != null ? '<span title="Число самой игры">клеток в работе (игра) <b>' + wt + "</b></span>" : "") +
        (tk != null ? "<span>технологий <b>" + tk + "</b></span>" : "") + "</span>" +
        ylLine(p) +
        (curT ? "<span>изучает: <b>" + esc(curT) + "</b></span>" : "") + "</div>";
    }
    return s;
  }).join("") || '<div class="empty">земли ещё никем не заняты</div>';
  const cs = [...seen].filter(p => isCS.get(p)).map(nameOf);
  $("csline").textContent = cs.length ? "Города-государства (серым): " + cs.join(", ") : "";
}
// Откуда ресурсы. Датчик ресурсов пишет только то, что видел ИГРОК, записавший журнал,
// и с того хода, когда он это увидел. Экспорт сервера склеивает журналы всех участников
// и пишет, кто что дал (D.logs.res); в старых записях этого поля нет — тогда журнал один.
function resSource(p) {
  if (!(D.res || []).length) return "";
  const logs = D.logs && Array.isArray(D.logs.res) ? D.logs.res.filter(l => l.seen > 0) : null;
  if (logs && logs.length > 1)
    return "ресурсы — по журналам " + logs.length + " участников: " + logs.map(l => l.nick || "?").join(", ");
  const one = logs && logs.length === 1 ? logs[0] : null;
  if (one && one.p === p) return "ресурсы — по журналу этого игрока";
  return "ресурсы — по журналу " + (one && one.nick ? one.nick : "одного игрока") +
         ": на чужой земле только то, что он видел, и с того хода; журналов других игроков в записи нет";
}
function setFocus(p) {
  focus = (focus === p) ? -1 : p;
  focusPill(); drawAll(); renderSide();
}
function focusPill() {
  const el = $("focusPill");
  if (focus < 0) { el.hidden = true; return; }
  el.hidden = false;
  const src = resSource(focus);
  el.innerHTML = '<i class="sw" style="width:10px;height:10px;border-radius:50%;background:' + colorOf.get(focus) +
    '"></i><span>показана <b>' + esc(nameOf(focus)) + "</b>" + (src ? '<small class="rp-src">' + esc(src) + "</small>" : "") +
    '</span><button type="button" aria-label="Показать всех" title="Показать всех">×</button>';
  el.querySelector("button").onclick = () => setFocus(focus);
}

// ---------------------------------------------------------------- технологии
function techCard() {
  const box = $("techs"), head = $("techHead");
  if (!(D.techs || []).length) { head.textContent = "Технологии"; box.innerHTML = '<div class="empty">в журнале этой партии технологий нет</div>'; return; }
  const who = focus >= 0 ? [focus] : [...techKnown.keys()].sort((a, b) => techKnown.get(b).size - techKnown.get(a).size);
  head.textContent = focus >= 0 ? "Технологии — " + nameOf(focus) : "Технологии · ход " + turn;
  if (!who.length || (focus >= 0 && !techKnown.has(focus))) {
    box.innerHTML = '<div class="empty">' + (focus >= 0 ? "у этой державы к ходу " + turn + " записей нет (журнал пишет технологии только людей)" : "к ходу " + turn + " записей нет") + "</div>";
    return;
  }
  const html = [];
  for (const p of who) {
    const known = techKnown.get(p) || new Map(), q = techQ.get(p) || [];
    const list = [...known.entries()].sort((a, b) => b[1] - a[1] || 0);
    const last = list.filter(e => e[1] > 0);
    // Журнал пишет изучение только у команд людей — рядом число самой игры.
    const inGame = seriesAt(p, "techsknown");
    let s = '<div class="grp"><h4><span class="rp-chip"><i style="background:' + colorOf.get(p) + '"></i>' + esc(nameOf(p)) + "</span></h4><p>" +
      '<span class="t">в журнале ' + known.size + (inGame != null ? " · в игре " + inGame : "") + "</span><br>" +
      (q.length ? '<span class="t">изучает:</span> <b>' + esc(techName(q[0])) + "</b>" +
                  (q.length > 1 ? ' <span class="t">дальше: ' + esc(q.slice(1, 4).map(techName).join(", ")) + "</span>" : "") + "<br>"
                : '<span class="t">цель изучения не выбрана или не записана</span><br>');
    if (focus >= 0) s += list.map(e => '<span class="t">' + e[1] + "</span> " + esc(techName(e[0]))).join("<br>");
    else s += last.slice(0, 2).map(e => '<span class="t">' + e[1] + "</span> " + esc(techName(e[0]))).join(" · ");
    html.push(s + "</p></div>");
  }
  box.innerHTML = html.join("");
}

// ---------------------------------------------------------------- выборы
function picks() {
  const head = $("picksHead"), box = $("picks");
  if (!pickList.length) {
    head.textContent = "Институты и религия";
    box.innerHTML = '<div class="empty">в этой записи выборов нет: блок пишется, когда партия доиграна до конца</div>';
    return;
  }
  head.textContent = focus >= 0 ? "Институты и религия — " + nameOf(focus) : "Институты и религия · ход " + turn;
  const taken = pickList.filter(p => p.turn <= turn && (focus < 0 || p.slot === focus));
  if (!taken.length) {
    box.innerHTML = '<div class="empty">' + (focus >= 0 ? "эта держава" : "никто") + " к ходу " + turn + " ничего ещё не взял</div>";
    return;
  }
  const groups = new Map();
  for (const p of taken) { if (!groups.has(p.kind)) groups.set(p.kind, []); groups.get(p.kind).push(p); }
  const html = [];
  for (const kind of [2, 1, 3, 4, 5, 6]) {
    const list = groups.get(kind);
    if (!list) continue;
    const items = list.map(p => {
      const who = focus < 0 ? '<span class="t">' + esc(nameOf(p.slot)) + " </span>" : "";
      const pt = pickTitle(p);
      let s = who + '<span class="t">' + p.turn + "</span> " + esc(pt.main);
      if (pt.rest.length) s += " <span class='t'>(" + esc(pt.rest.join(", ")) + ")</span>";
      return s;
    });
    html.push('<div class="grp"><h4>' + KIND_RU[kind] + " · " + list.length + "</h4><p>" + items.join("<br>") + "</p></div>");
  }
  box.innerHTML = html.join("");
}

// ---------------------------------------------------------------- события
// Лента хода. Клетки — словами, и каждая клетка — ссылка на карту. У каждой строки
// признак «важное»: сообщения игры, здания, изученные технологии, выборы, разорение.
// Перестановки жителей, ручные переключения, обычные постройки рабочих и выбор цели
// изучения — подробности: видны, если снять «только важное».
const FEED_LIMIT = 30;
function feedRows() {
  const rows = [];
  const col = p => (p >= 0 ? (colorOf.get(p) || "#45556b") : "#45556b");
  const add = (main, p, t, html, k) => rows.push({ main,
    html: '<div class="ev' + (t === turn ? " now" : "") + (k >= 0 ? " go" : "") + '"' +
      (k >= 0 ? ' data-k="' + k + '" data-t="' + t + '"' : "") + '><i style="background:' + col(p) +
      '"></i><b class="t">' + t + "</b><p>" + html + "</p></div>" });
  const more = (main, n) => rows.push({ main, html: '<div class="ev now more">… и ещё ' + n + " на этом ходу</div>" });
  const who = p => "<b>" + esc(nameOf(p)) + "</b>";

  // Выборы этого хода — институты, ветки, идеология, пантеон, религия.
  for (const p of pickList) {
    if (p.turn !== turn || (focus >= 0 && p.slot !== focus)) continue;
    const pt = pickTitle(p);
    add(true, p.slot, turn, who(p.slot) + " " + KIND_VERB[p.kind] + ": " + esc(pt.main) +
      (pt.rest.length ? ' <span class="l">(' + esc(pt.rest.join(", ")) + ")</span>" : ""), -1);
  }

  // Технологии этого хода (только люди — так пишет журнал).
  const tch = (techByTurn.get(turn) || []).filter(e => e.p >= 0 && (focus < 0 || e.p === focus));
  const TVERB = { r: "выбрал изучать", q: "добавил в очередь изучения", a: "изучил", s: "украл технологию", f: "взял бесплатно" };
  let tn = 0;
  for (const e of tch) {
    const main = e.k === "a" || e.k === "s" || e.k === "f";
    if (++tn > 10) continue;
    add(main, e.p, turn, who(e.p) + " " + TVERB[e.k] + ": " + esc(techName(e.t)), -1);
  }
  if (tch.length > 10) more(false, pl(tch.length - 10, ["запись о технологиях", "записи о технологиях", "записей о технологиях"]));

  // Здания этого хода: построено, куплено, продано. Город — ссылка.
  const bl = (bldByTurn.get(turn) || []).filter(e => focus < 0 || e.p === focus);
  const BVERB = { b: "построено", p: "куплено", s: "продано" };
  for (const e of bl.slice(0, 10)) {
    const cn = cityName.get(e.c) || ("город " + nameOf(e.p));
    add(true, e.p, turn, who(e.p) + ", " + cellLink(e.c, turn, cn) + ": " + BVERB[e.k] +
      " здание " + esc(bldName(e.b)) + (e.k === "p" && e.y === 5 ? " за веру" : ""), e.c);
  }
  if (bl.length > 10) more(true, pl(bl.length - 10, ["здание", "здания", "зданий"]));

  // Улучшения: построено, разорено, снесено.
  const imps = (impByTurn.get(turn) || []).filter(e => focus < 0 || e.p === focus);
  for (const e of imps.slice(0, 8)) {
    const k = key(e.x, e.y);
    const ik = e.imp >= 0 && NAMES.imp && NAMES.imp[String(e.imp)] ? NAMES.imp[String(e.imp)].k : "";
    const nature = NOBODY.has(ik);
    const w = e.p >= 0 ? e.p : (nature ? -1 : owner[k]);
    let what;
    if (e.imp < 0) {
      const was = impPrev.get(k);
      what = was >= 0 ? "убрано: " + low(impName(was)) : "улучшение убрано";
    } else if (e.pil) what = "разорено: " + low(impName(e.imp));
    else if (nature) what = "появилось: " + low(impName(e.imp));
    else what = "построено: " + low(impName(e.imp));
    const city = cityOfCell(k);
    add(!!e.pil, w, turn, (w >= 0 ? who(w) + " — " : "") + what + " · " +
      cellLink(k, turn, cellDesc(k, true)) + (city ? ' <span class="l">(город ' + esc(city) + ")</span>" : ""), k);
  }
  if (imps.length > 8) more(false, pl(imps.length - 8, ["улучшение", "улучшения", "улучшений"]));

  // Ручные переключения: клетку за ход переключают по нескольку раз — показываем раз.
  const seen = new Set(), clicks = [];
  for (const c of (clickByTurn.get(turn) || [])) {
    if (focus >= 0 && c.p !== focus) continue;
    const k = key(c.x, c.y);
    if (seen.has(k)) continue;
    seen.add(k); clicks.push(c);
  }
  for (const c of clicks.slice(0, 6)) {
    const k = key(c.x, c.y), ck = key(c.cx, c.cy);
    const on = worked[k] >= 0 && workedCity[k] === ck;
    add(false, c.p, turn, who(c.p) + ", " + esc(cityLabel(ck)) + ": вручную переключил клетку " + cellLink(k, turn, cellDesc(k)) +
      ' <span class="l">— ' + (on ? "житель на ней" : "к концу хода свободна") + "</span>", k);
  }
  if (clicks.length > 6) more(false, pl(clicks.length - 6, ["ручное переключение", "ручных переключения", "ручных переключений"]));

  // Перестановка жителей движком за ход.
  const works = (workByTurn.get(turn) || []).filter(w => focus < 0 || w.p === focus);
  for (const w of works.slice(0, 6)) {
    const list = arr => arr.slice(0, 4).map(a => { const k = key(a[0], a[1]); return cellLink(k, turn, cellDesc(k)); })
      .join(" · ") + (arr.length > 4 ? ' <span class="l">и ещё ' + (arr.length - 4) + "</span>" : "");
    const parts = [];
    if (w.add.length) parts.push("житель встал на " + list(w.add));
    if (w.rem.length) parts.push("ушёл с " + list(w.rem));
    const one = w.add.length + w.rem.length === 1 ? key(...(w.add[0] || w.rem[0])) : -1;
    add(false, w.p, turn, who(w.p) + ", " + esc(cityLabel(key(w.cx, w.cy))) +
      ' <span class="l">(жителей ' + w.pop + ")</span>: " + parts.join("; "), one);
  }
  if (works.length > 6) more(false, pl(works.length - 6, ["город с перестановкой", "города с перестановкой", "городов с перестановкой"]));

  // Сообщения самой игры из повтора — этот ход и предыдущие (до 12).
  let toldN = 0;
  for (let t = turn; t >= 0 && toldN < 12; t--) {
    for (const e of told) {
      if (e.turn !== t) continue;
      if (focus >= 0 && e.p !== focus) continue;
      add(true, e.p, t, esc(e.text), e.x >= 0 ? key(e.x, e.y) : -1);
      if (++toldN >= 12) break;
    }
  }
  return rows;
}
function feed() {
  const all = feedRows();
  const vis = onlyMain ? all.filter(r => r.main) : all;
  const shown = feedAll ? vis : vis.slice(0, FEED_LIMIT);
  const hidden = all.length - vis.length;
  $("feedCount").textContent = onlyMain && hidden ? "скрыто подробностей: " + hidden : "";
  $("feed").innerHTML = (shown.length ? shown.map(r => r.html).join("") :
    '<div class="empty">' + (all.length ? "на этом ходу важного нет — снимите «только важное»" : "на этом ходу записей нет") + "</div>") +
    (vis.length > shown.length ? '<button type="button" class="rp-btn rp-more" id="feedMore">показать все (' + vis.length + ")</button>" : "");
  const mb = $("feedMore");
  if (mb) mb.onclick = () => { feedAll = true; feed(); };
}

// ---------------------------------------------------------------- карточки поверх карты
function cityCardHtml(ck) {
  const c = aliveCities().get(ck);
  if (!c) return null;
  const nm = cityName.get(ck) || "город";
  const ct = cityTiles(ck), gy = cityGY && cityGY.get(ck);
  let s = '<p class="sub"><span class="rp-chip"><i style="background:' + colorOf.get(c.p) + '"></i><b>' + esc(nameOf(c.p)) + "</b></span>" +
    (popAt.get(ck) ? " · жителей " + popAt.get(ck) : "") + " · основан на ходу " + c.turn +
    " · " + cellLink(ck, turn, "показать на карте") + "</p>";
  // Выдача города: сначала числа самой игры (датчик в DLL), если они есть в записи.
  if (gy) {
    const r1 = x => Math.round(x * 10) / 10;
    const spec = [];
    for (let i = 0; i + 1 < gy.spec.length; i += 2) {
      const rec = NAMES.spec && NAMES.spec[String(gy.spec[i])];
      spec.push((rec ? rec.n : "специалист №" + gy.spec[i]) + " " + gy.spec[i + 1]);
    }
    s += "<h3>Выдача города · из игры</h3><p class='yl'>" + ylSpans(gy.y.map(r1)) + "</p>" +
      (gy.surplus != null ? '<p class="rp-note">в рост идёт ' + r1(gy.surplus) + " еды</p>" : "") +
      '<p class="rp-note">' + (gy.work ? "клеток в работе " + gy.work.filter(k => k !== ck).length : "") +
      (spec.length ? " · специалисты: " + esc(spec.join(", ")) : "") +
      (gy.turn !== turn ? " · запись хода " + gy.turn : "") + "</p>";
    s += '<details><summary>сумма по клеткам · ' + ct.n + " кл.</summary><p class='yl'>" + ylSpans(ct.sum) + "</p>" +
      "<p>Сумма значений клеток без зданий, специалистов и прибавок — для сравнения с числом игры.</p></details>";
  } else {
    s += "<h3>Выдача клеток города · " + ct.n + " кл.</h3><p class='yl'>" + ylSpans(ct.sum) + "</p>" +
      "<details><summary>что это за число</summary><p>Сумма по центру и клеткам, где стоят жители: из игры — " + ct.fromGame + " из " + ct.n +
      " клеток, остальные — расчёт страницы. Здания, специалисты и процентные прибавки сюда не входят: " +
      "выдачи города из игры в этой записи нет (датчик пишет её с DLL 18.10.2026 и только по своим городам " +
      "каждого журнала). Клетки под жителями восстановлены по журналу " +
      "(перестановки движка + ручные переключения) и с игрой сходятся не точно: к середине партии " +
      "по державе выходит на 10–25 % меньше клеток, чем считает игра (её число — в подробностях державы).</p></details>";
  }
  const q = cityQ.get(ck) || [];
  s += "<h3>Стройка</h3><p>" + (q.length ? "<b>" + esc(nameOfOrder(q[0])) + "</b>" +
       (q.length > 1 ? ' <span class="l">дальше: ' + esc(q.slice(1, 4).map(nameOfOrder).join(", ")) + "</span>" : "")
       : '<span class="l">заказов в записи нет</span>') + "</p>";
  const B = cityB.get(ck);
  const bl = B ? [...B.entries()].sort((a, b) => a[1].turn - b[1].turn) : [];
  s += "<h3>Здания · " + bl.length + "</h3><p class='blist'>" + (bl.length ? bl.map(e => '<span class="t">' + e[1].turn + "</span> " +
       esc(bldName(e[0])) + (e[1].how === "p" ? ' <span class="l">(куплено' + (e[1].y === 5 ? " за веру" : "") + ")</span>" : "")).join("<br>")
       : '<span class="l">записей нет</span>') + "</p>" +
       "<details><summary>чего здесь нет</summary><p>Стройка — по заказам игрока из журнала; то, что ставит в очередь движок или советник, не пишется. " +
       "Здания — построенное и купленное игроком; даровые (дворец, от институтов и чудес) журнал не пишет; " +
       "у городов ИИ и городов-государств зданий в записи нет.</p></details>";
  return { head: nm, body: s };
}
function cellInfoHtml(k) {
  const p = TNOW[k];
  let what = cellDesc(k, true, true);
  if (p.v) what += ", у реки";
  let s = "";
  const line = (l, v) => { s += (s ? "<br>" : "") + "<span class='l'>" + l + "</span> " + v; };
  if (resAt[k] >= 0) line("ресурс:", "<b>" + esc(nameOfRes(resAt[k])) + "</b>" + (resN[k] > 1 ? " ×" + resN[k] : "") +
                          " <span class='l'>— виден с хода " + resFrom[k] + "</span>");
  const cy = cellYield(k);
  const RODS = ["еды", "молотков", "золота", "науки", "культуры", "веры"];
  const w = [];
  for (let i = 0; i < 6; i++) if (cy.y[i]) w.push(cy.y[i] + " " + RODS[i]);
  line("даёт:", (w.length ? w.join(", ") : "ничего") + " <span class='l'>(" + (cy.game ? "из игры" : "расчёт") + ")</span>");
  line("земля:", owner[k] >= 0 ? esc(nameOf(owner[k])) : "ничья");
  const nm = cityName.get(k);
  if (nm && aliveCities().has(k)) {
    line("город:", esc(nm) + (popAt.get(k) ? ", жителей " + popAt.get(k) : ""));
    const B = cityB.get(k), q = cityQ.get(k);
    if (q && q.length) line("строит:", esc(nameOfOrder(q[0])));
    if (B && B.size) line("зданий в записи:", B.size);
  } else if (owner[k] >= 0) {
    const cc = cityOfCell(k);
    if (cc) line("у города:", esc(cc));
  }
  if (impAt[k] >= 0) line("улучшение:", esc(impName(impAt[k])) +
    (impBy[k] >= 0 ? " <span class='l'>— построил " + esc(nameOf(impBy[k])) + "</span>" : ""));
  if (worked[k] >= 0) {
    const cn = cityName.get(workedCity[k]);
    line("здесь стоит житель:", esc(nameOf(worked[k])) + (cn ? " — " + esc(cn) : ""));
  } else if (everWorked[k] >= 0) line("житель стоял раньше:", esc(nameOf(everWorked[k])));
  return { head: what.charAt(0).toUpperCase() + what.slice(1), body: s };
}
function openCard(kind, k) {
  card = { kind, k };
  closePops();
  renderCard(true);
  drawAll();
}
function closeCard() {
  if (!card) return;
  card = null; cardEl.hidden = true; drawAll();
}
function renderCard(place) {
  if (!card) { cardEl.hidden = true; return; }
  let r = null;
  if (card.kind === "city") r = cityCardHtml(card.k);
  if (!r && card.kind === "city") { card = { kind: "cell", k: card.k }; }   // город исчез на этом ходу
  if (!r) {
    const ci = cellInfoHtml(card.k);
    r = { head: ci.head, body: '<p>' + ci.body + "</p>" };
  }
  $("cardHead").textContent = r.head;
  $("cardBody").innerHTML = r.body;
  cardEl.hidden = false;
  if (place) placeCard();
}
// Карточка — на стороне, противоположной клетке, чтобы клетку не закрывать.
function placeCard() {
  if (!card || cardEl.hidden) return;
  const x = card.k % D.width, y = (card.k / D.width) | 0, c = centerOf(x, y);
  const r = cv.getBoundingClientRect(), m = mapArea.getBoundingClientRect();
  const cxs = r.left + c[0] * r.width / cv.width;
  const right = cxs < m.left + m.width / 2;
  cardEl.classList.toggle("right", right);
  cardEl.classList.toggle("left", !right);
}

// ---------------------------------------------------------------- переход к клетке
function goCell(k, t) {
  stop();
  if (t !== turn) setTurn(t);
  const x = k % D.width, y = (k / D.width) | 0, c = centerOf(x, y);
  const r = cv.getBoundingClientRect(), s = sc.getBoundingClientRect();
  const px = r.left + c[0] * r.width / cv.width, py = r.top + c[1] * r.height / cv.height;
  sc.scrollLeft += px - (s.left + s.width / 2);
  sc.scrollTop += py - (s.top + s.height / 2);
  flash = { k, t0: performance.now() };
  requestAnimationFrame(fxFrame);
  if (narrow()) showSide(false);     // на узком экране панель закрывает карту
  if (aliveCities().has(k)) openCard("city", k);
}
function fxFrame(now) {
  fctx.clearRect(0, 0, fx.width, fx.height);
  if (!flash || !D) return;
  const dt = now - flash.t0;
  if (dt > 2600) { flash = null; return; }
  const x = flash.k % D.width, y = (flash.k / D.width) | 0, c = centerOf(x, y);
  const fade = dt > 2100 ? 1 - (dt - 2100) / 500 : 1;
  for (let i = 0; i < 3; i++) {
    const ph = ((dt / 800) + i / 3) % 1;
    fctx.beginPath();
    fctx.arc(c[0], c[1], R * 0.9 + Math.max(R * 2.4, 34) * ph, 0, 7);
    fctx.lineWidth = 3; fctx.strokeStyle = "rgba(242,208,107," + ((1 - ph) * fade).toFixed(3) + ")";
    fctx.stroke();
  }
  fctx.globalAlpha = fade;
  hexPath(c[0], c[1], fctx, R * 1.04);
  fctx.lineWidth = Math.max(5, R * 0.42); fctx.strokeStyle = "#0b1119"; fctx.stroke();
  hexPath(c[0], c[1], fctx, R * 1.04);
  fctx.lineWidth = Math.max(3, R * 0.24); fctx.strokeStyle = "#f2d06b"; fctx.stroke();
  fctx.globalAlpha = 1;
  requestAnimationFrame(fxFrame);
}

// ---------------------------------------------------------------- боковая панель
const narrow = () => matchMedia("(max-width:980px)").matches;
function showSide(on) {
  side.hidden = !on;
  $("sideBtn").setAttribute("aria-expanded", String(on));
  if (on) { closePops(); renderSide(); }
  // Ширина окна карты поменялась — подгоняем 100 % (на широком экране панель сдвигает карту).
  if (D && !narrow()) { resize(); drawAll(); placeCard(); }
}
function setTab(t) {
  tab = t;
  for (const b of side.querySelectorAll("[role=tab]")) b.setAttribute("aria-selected", String(b.dataset.tab === t));
  for (const p of side.querySelectorAll(".rp-pane")) p.hidden = p.dataset.pane !== t;
  renderSide();
}
function renderSide() {
  if (!D || side.hidden) return;
  if (tab === "players") panel();
  else if (tab === "feed") feed();
  else if (tab === "techs") techCard();
  else if (tab === "picks") picks();
}

// ---------------------------------------------------------------- ход
function setTurn(t) {
  turn = Math.max(0, Math.min(D.finalTurn, t | 0));
  rebuild(turn);
  $("turnLabel").innerHTML = "ход " + turn + " <small>/ " + D.finalTurn + "</small>";
  slider.value = turn;
  feedAll = false;
  drawAll(); renderSide(); focusPill();
  if (card) renderCard(false);
  if (!timer) saveHash();
}
const PLAY = "M7 5 L19 12 L7 19 Z", PAUSE = "M7 5 H10.5 V19 H7 Z M13.5 5 H17 V19 H13.5 Z";
function stop() {
  if (!timer) return;
  clearInterval(timer); timer = null;
  $("playIco").setAttribute("d", PLAY);
  playBtn.setAttribute("aria-label", "Смотреть"); playBtn.title = "Смотреть по ходам (пробел)";
  saveHash();
}
function play() {
  if (timer) { stop(); return; }
  if (turn >= D.finalTurn) setTurn(0);
  $("playIco").setAttribute("d", PAUSE);
  playBtn.setAttribute("aria-label", "Пауза"); playBtn.title = "Пауза (пробел)";
  timer = setInterval(() => { if (turn >= D.finalTurn) { stop(); return; } setTurn(turn + 1); }, 130);
}

// ---------------------------------------------------------------- адрес страницы
function readHash() {
  const h = new URLSearchParams(String(location.hash || "").replace(/^#/, ""));
  return { m: h.get("m") || "", t: h.has("t") ? parseInt(h.get("t"), 10) : NaN };
}
let hashTimer = 0;
function saveHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    if (cur < 0) return;
    const h = "#m=" + encodeURIComponent(LIST[cur].id) + "&t=" + turn;
    if (location.hash !== h) history.replaceState(null, "", h);
  }, 250);
}

// ---------------------------------------------------------------- всплывающие меню
function togglePop(id, btnId) {
  const el = $(id), open = el.hidden;
  closePops();
  if (open) { el.hidden = false; $(btnId).setAttribute("aria-expanded", "true"); }
}
function closePops() {
  for (const [id, b] of [["layersPop", "layersBtn"], ["helpPop", "helpBtn"]]) {
    $(id).hidden = true; $(b).setAttribute("aria-expanded", "false");
  }
}

// Иконки в «Обозначениях» — те же куски полос, что и на карте, фоном.
function legendIcons() {
  for (const el of document.querySelectorAll(".ico[data-slot]")) {
    const pack = ICONS[el.dataset.slot], ic = pack && pack.map ? pack.map[el.dataset.key] : null;
    const img = SHEETS[el.dataset.slot];
    if (!ic || !img || !img.naturalWidth) { el.style.background = "#2b3a4e"; continue; }
    const sz = 18, k = sz / ic.h;
    el.style.backgroundImage = "url(" + img.src + ")";
    el.style.backgroundSize = (img.naturalWidth * k) + "px " + sz + "px";
    el.style.backgroundPosition = (-ic.x * k) + "px 0";
  }
}

// ---------------------------------------------------------------- мышь и клавиатура
// Клетка под указателем или -1.
function tileAt(ev) {
  const r = cv.getBoundingClientRect();
  const sx = (ev.clientX - r.left) * cv.width / r.width;
  const sy = (ev.clientY - r.top) * cv.height / r.height;
  const row = Math.round((sy - 3 - R) / H);
  let best = -1, bd = 1e9;
  for (let dr = Math.max(0, row - 1); dr <= Math.min(D.height - 1, row + 1); dr++) {
    const y = D.height - 1 - dr;
    for (let x = 0; x < D.width; x++) {
      const c = centerOf(x, y);
      const d = (c[0] - sx) * (c[0] - sx) + (c[1] - sy) * (c[1] - sy);
      if (d < bd) { bd = d; best = key(x, y); }
    }
  }
  return (best < 0 || bd > R * R * 1.3) ? -1 : best;
}

// Карту можно тянуть мышью. Тянули — это не нажатие на клетку.
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
  if (!dragged) { dragged = true; sc.classList.add("drag"); tip.hidden = true; try { sc.setPointerCapture(drag.id); } catch (e) { /* нет — не страшно */ } }
  sc.scrollLeft = drag.l - dx; sc.scrollTop = drag.t - dy;
});
addEventListener("pointerup", () => { if (drag) { drag = null; sc.classList.remove("drag"); } });
sc.addEventListener("wheel", ev => {
  if (!D || !ev.ctrlKey) return;               // без Ctrl — обычная прокрутка
  ev.preventDefault();
  const s = sc.getBoundingClientRect();
  setZoom(zoom * (ev.deltaY < 0 ? 1.18 : 1 / 1.18), ev.clientX - s.left, ev.clientY - s.top);
}, { passive: false });
sc.addEventListener("scroll", () => { tip.hidden = true; }, { passive: true });

cv.addEventListener("click", ev => {
  if (dragged) { dragged = false; return; }
  if (!D) return;
  const k = tileAt(ev);
  if (k < 0) { closeCard(); return; }
  if (card && card.k === k) { closeCard(); return; }
  openCard(aliveCities().has(k) ? "city" : "cell", k);
});
cv.addEventListener("mousemove", ev => {
  if (!D || drag) return;
  const k = tileAt(ev);
  if (k < 0) { tip.hidden = true; cv.style.cursor = "crosshair"; return; }
  cv.style.cursor = "pointer";
  const ci = cellInfoHtml(k);
  tip.innerHTML = "<b>" + esc(ci.head) + "</b><br>" + ci.body +
    (aliveCities().has(k) ? "<br><span class='l'>нажмите — карточка города</span>" : "");
  tip.hidden = false;
  tip.style.left = Math.min(ev.clientX + 16, innerWidth - 250) + "px";
  tip.style.top = Math.max(4, Math.min(ev.clientY + 14, innerHeight - tip.offsetHeight - 8)) + "px";
});
cv.addEventListener("mouseleave", () => { tip.hidden = true; });

// Ссылки на клетку — в ленте и в карточке города.
function cellLinkClick(ev) {
  const el = ev.target.closest(".cell") || ev.target.closest(".ev.go");
  if (!el || !el.dataset.k) return false;
  goCell(+el.dataset.k, +el.dataset.t);
  return true;
}
for (const box of [$("feed"), $("cardBody")]) {
  box.addEventListener("click", cellLinkClick);
  box.addEventListener("keydown", ev => {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.classList.contains("cell") && cellLinkClick(ev)) ev.preventDefault();
  });
}
$("players").addEventListener("click", ev => { const el = ev.target.closest(".pl"); if (el) setFocus(+el.dataset.p); });
$("players").addEventListener("keydown", ev => {
  const el = ev.target.closest(".pl");
  if (el && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); setFocus(+el.dataset.p); }
});

slider.addEventListener("input", e => { stop(); setTurn(+e.target.value); });
$("toEnd").addEventListener("click", () => { stop(); setTurn(D.finalTurn); });
playBtn.addEventListener("click", play);
$("zoomIn").addEventListener("click", () => setZoom(zoom * 1.35));
$("zoomOut").addEventListener("click", () => setZoom(zoom / 1.35));
$("layersBtn").addEventListener("click", () => togglePop("layersPop", "layersBtn"));
$("helpBtn").addEventListener("click", () => togglePop("helpPop", "helpBtn"));
$("sideBtn").addEventListener("click", () => showSide(side.hidden));
$("sideClose").addEventListener("click", () => showSide(false));
$("cardClose").addEventListener("click", closeCard);
for (const b of document.querySelectorAll(".rp-pop [data-close]")) b.addEventListener("click", closePops);
for (const b of side.querySelectorAll("[role=tab]")) b.addEventListener("click", () => setTab(b.dataset.tab));
$("onlyMain").addEventListener("change", e => { onlyMain = e.target.checked; feedAll = false; feed(); });
for (const box of document.querySelectorAll("[data-layer]")) {
  box.addEventListener("change", () => { show[box.dataset.layer] = box.checked; drawAll(); layerBadge(); });
}
function layerBadge() {
  // Кнопка «Слои» подсвечена, когда набор слоёв отличается от обычного.
  const changed = ["names", "imp", "res"].some(k => !show[k]) || show.yield || show.trail;
  $("layersBtn").classList.toggle("on", changed);
}
$("matchPick").addEventListener("change", e => openMatch(+e.target.value, NaN));
// Нажатие мимо меню закрывает его.
document.addEventListener("pointerdown", ev => {
  if (ev.target.closest(".rp-pop") || ev.target.closest("#layersBtn") || ev.target.closest("#helpBtn")) return;
  closePops();
});
addEventListener("keydown", ev => {
  if (!D || ev.altKey || ev.metaKey || ev.ctrlKey) return;
  const tag = (ev.target.tagName || "").toLowerCase();
  if (tag === "input" && ev.target.type !== "range" && ev.target.type !== "checkbox") return;
  if (tag === "select" || tag === "textarea") return;
  const k = ev.key;
  if (k === "Escape") { if (!$("layersPop").hidden || !$("helpPop").hidden) closePops(); else if (card) closeCard(); else if (!side.hidden && narrow()) showSide(false); return; }
  if (tag === "input" && ev.target.type === "range") return;   // у ползунка свои стрелки
  if (k === " " && tag !== "button") { ev.preventDefault(); play(); }
  else if (k === "ArrowRight") { ev.preventDefault(); stop(); setTurn(turn + 1); }
  else if (k === "ArrowLeft") { ev.preventDefault(); stop(); setTurn(turn - 1); }
  else if (k === "Home") { ev.preventDefault(); stop(); setTurn(0); }
  else if (k === "End") { ev.preventDefault(); stop(); setTurn(D.finalTurn); }
  else if (k === "+" || k === "=") setZoom(zoom * 1.35);
  else if (k === "-" || k === "_") setZoom(zoom / 1.35);
  else if (k === "?") togglePop("helpPop", "helpBtn");
});
let rsz = 0;
addEventListener("resize", () => { clearTimeout(rsz); rsz = setTimeout(() => { if (D) { resize(); drawAll(); placeCard(); } }, 80); });
addEventListener("hashchange", () => {
  const h = readHash();
  const i = LIST.findIndex(m => m.id === h.m);
  if (i >= 0 && i !== cur) openMatch(i, h.t);
  else if (i === cur && !isNaN(h.t) && h.t !== turn) { stop(); setTurn(h.t); }
});

// ---------------------------------------------------------------- партии
const ABOUT =
  "Карта, города, границы и сообщения взяты из файла повтора, который игра пишет сама. " +
  "Улучшения рабочих, ручные переключения клеток, обрабатываемые клетки и выборы игроков — " +
  "из журнала партии Nova; в повторе их нет, поэтому они есть не у всех записей. " +
  "Ресурсы на клетках — тоже из журнала (датчик в библиотеке мода с 03.10.2026): " +
  "пишется только то, что видел игрок, записавший журнал, и с того хода, когда он это увидел. " +
  "Белая точка — клетка, которую город обрабатывает на этом ходу; белая рамка — переключение, " +
  "которое игрок сделал руками: раз в ход движок перераспределяет жителей сам, и это решением игрока не является. " +
  "Цвета держав подобраны по названию цивилизации: в повторе нет игровой палитры. Города-государства " +
  "показаны серым — они опознаются по совпадению имени державы с названием её «цивилизации». " +
  "Иконки улучшений и ресурсов — игровые. Технологии, здания и очередь стройки — из журнала; движок пишет " +
  "их только у людей (после выхода игрока, когда слот ведёт ИИ, записи прекращаются). Выдача держав — ряды " +
  "самого повтора, числа игры. Выдача города в карточке — числа игры, если они есть в записи; иначе сумма " +
  "клеток (центр и клетки с жителями) без зданий, специалистов и процентных прибавок. Русские названия " +
  "технологий, зданий и юнитов базовой игры переведены вручную.";

function summaryOf(m, i) {
  let humans = 0;
  for (const p of m.players) if (p.name && p.civ && p.name !== p.civ) humans++;
  const marks = [];
  if ((m.work || []).length) marks.push("клетки");
  if ((m.imps || []).length) marks.push("улучшения");
  if ((m.res || []).length) marks.push("ресурсы");
  if ((m.picks || []).length) marks.push("выборы");
  const id = m.id || (m.nrl ? m.nrl.replace(/\.nrl$/i, "") : "") || ("m" + i);
  return { id, when: m.when, turns: m.finalTurn, humans, marks,
           score: (m.work || []).length + (m.imps || []).length + (m.picks || []).length * 10, data: m };
}
function fillPicker() {
  $("matchPick").innerHTML = LIST.map((m, i) =>
    '<option value="' + i + '" title="' + esc(m.marks.length ? "в записи: " + m.marks.join(", ") : "") + '">' +
    esc(String(m.when).replace(/^(\d\d\.\d\d)\.\d{4}/, "$1")) + " · " + m.turns + " ход. · " + m.humans + " держ.</option>").join("");
}

let src = null, loadToken = 0;
async function getJson(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(url + " → " + r.status);
  return r.json();
}
function message(text) { const el = $("msg"); el.hidden = !text; el.textContent = text || ""; }

async function openMatch(i, t) {
  if (i < 0 || i >= LIST.length) return;
  const token = ++loadToken;
  stop();
  cur = i;
  $("matchPick").value = String(i);
  let m = LIST[i].data;
  if (!m) {
    message("Загружаю партию…");
    try { m = await getJson(src.base + "m/" + encodeURIComponent(LIST[i].id) + ".json"); }
    catch (e) { console.warn(e); if (token === loadToken) message("Партия не загрузилась. Попробуйте позже или выберите другую."); return; }
    if (token !== loadToken) return;
    LIST[i].data = m;
  }
  message("");
  setup(m);
  zoom = 1;
  resize();
  // Телефон стоймя: карта шире экрана, и «вся карта» — полоска посередине. Начинаем
  // с карты во всю высоту окна и ставим вид в середину; «−» вернёт обзор целиком.
  if (sc.clientWidth < 700 && sc.clientHeight > sc.clientWidth) {
    const byH = (sc.clientHeight - 8) / (1.5 * (D.height - 1) + 2);
    zoom = Math.max(1, Math.min(4, byH / fitR()));
    resize();
  }
  setTurn(isNaN(t) ? D.finalTurn : t);    // по умолчанию — конец партии: так видно, чем кончилось
  sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) / 2; sc.scrollTop = 0;
}

// Адрес источника: только свой сайт (относительный путь) или https.
function safeBase(b) {
  b = String(b || "");
  if (!b || /^[a-z]+:/i.test(b) && !/^https:\/\//i.test(b)) return null;
  return b.endsWith("/") ? b : b + "/";
}

async function boot() {
  readColors();
  if (/[?&]embed=1\b/.test(location.search)) document.documentElement.classList.add("rp-embed");
  $("about").textContent = ABOUT;
  const inline = document.getElementById("matchdata");
  try {
    if (inline) {
      const DATA = JSON.parse(inline.textContent);
      initDict(DATA.names, DATA.icons, location.href);
      LIST = (DATA.matches || []).map(summaryOf);
    } else {
      message("Загружаю список партий…");
      const cfgUrl = document.documentElement.getAttribute("data-replay-source") || "data/replay-source.json";
      const cfg = await getJson(cfgUrl);
      const base = safeBase(cfg.base), dictUrl = cfg.dict ? String(cfg.dict) : (base ? base + "dict.json" : "");
      if (!base) throw new Error("data/replay-source.json: base не годится");
      src = { base };
      const [idx, dict] = await Promise.all([getJson(base + "index.json"), getJson(dictUrl)]);
      initDict(dict.names, dict.icons, new URL(dictUrl, location.href).href);
      LIST = (idx.matches || []).filter(m => m && m.id).map(m => ({
        id: String(m.id), when: m.when || "", turns: m.turns || 0, humans: m.humans || 0,
        marks: Array.isArray(m.marks) ? m.marks : [], score: 0, data: null }));
    }
  } catch (e) {
    console.warn(e);
    message("Карты партий сейчас недоступны.");
    return;
  }
  if (!LIST.length) { message("Партий с картой пока нет."); return; }
  fillPicker();
  legendIcons();
  layerBadge();
  const h = readHash();
  let first = LIST.findIndex(m => m.id === h.m);
  // Ссылка на партию, которой на карте нет (из статистики или лаунчера: выгрузка идёт раз
  // в 10 минут, старые партии — без повтора) — говорим это, а не молча показываем другую.
  if (first < 0 && h.m) {
    const b = $("banner");
    b.textContent = "Карты этой партии пока нет — показана другая. Карты появляются в течение ~10 минут после партии, если на сервер пришли повтор и журнал.";
    b.hidden = false;
    setTimeout(() => { b.hidden = true; }, 9000);
  }
  if (first < 0) {
    // Без адреса — партия, где больше всего слоёв (в отдельной странице) или самая новая (сайт).
    first = 0;
    let best = -1;
    LIST.forEach((m, i) => { if (m.score > best) { best = m.score; first = i; } });
  }
  await openMatch(first, h.t);
}
boot();
})();
