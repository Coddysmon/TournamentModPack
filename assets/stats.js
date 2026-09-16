/* ---------------------------------------------------------------------------
   Статистика партий Nova: обзор, игрок, партия.

   ОТКУДА ДАННЫЕ — ОДНА НАСТРОЙКА: data/stats-source.json
     {"mode": "static", "base": "data/stats/"}      срезы JSON рядом со страницей
     {"mode": "live",   "base": "https://…/"}       служба nova-rating напрямую

   Формат один и тот же в обоих режимах — это ответы службы
   (Client\src\Civ5Launcher.Rating\Stats.cs, StatsMatchView):
     static: <base>index.json               { schema, generated, matches: [партия без рядов] }
             <base>m/<ключ>/<РЯД>.json      партия с одним рядом
     live:   <base>stats/matches            то же, что index.json (маршрут службы с 16.09.2026)
             <base>stats/match?key=&keys=   существующий маршрут службы

   Страница вычисляет обзор, винрейты и сводку игрока сама, из списка партий:
   службе не нужно заводить под сайт отдельные «агрегаты», а правила подсчёта
   видны здесь, а не спрятаны на сервере.

   Правила сайта (site.js) действуют и здесь: текст из сети — только через
   esc()/textContent (ники вводят игроки), не доехало — так и сказать.
   Адресация — hash: #Tab:Player/Player:<ник>/Dataset:<ключ ряда>.
   --------------------------------------------------------------------------- */
'use strict';

(() => {
  const N = NOVA_STATS_NAMES;
  const esc = NOVA.esc;
  const $ = NOVA.$;

  /* Партий меньше этого — винрейт цивилизации помечается «мало данных». */
  const SMALL_SAMPLE = 10;
  /* Сколько последних партий игрока рисовать линиями. */
  const PLAYER_CHART_LIMIT = 30;
  const DEFAULT_DATASET = 'REPLAYDATASET_SCORE';

  /* Категориальная палитра для тёмного фона: порядок фиксированный, цвет идёт за
     участником (порядок мест), а не за рангом значения. Девятый и дальше — не
     новый оттенок, а приглушённая линия (подсвечивается наведением). */
  const PALETTE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
  const MUTED = '#5F7483';
  /* Партий у игрока больше восьми — цвет уже не может идти за партией; тогда
     победы рисуются акцентом сайта, остальные — приглушённо (и то и другое —
     с подписью в легенде и в таблице значений, не только цветом). */
  const WIN = '#76C6C0';

  /* ------------------------------------------------------------- подписи */

  const DS = new Map(N.datasets.map(d => [d.k, d]));
  const pretty = k => {
    const s = String(k || '').replace(/^REPLAYDATASET_|^CIVILIZATION_|^VICTORY_/, '').replace(/_/g, ' ').toLowerCase();
    return s ? s[0].toUpperCase() + s.slice(1) : '—';
  };
  const dsTitle = k => (DS.get(k) || {}).t || pretty(k);
  const civName = k => N.civs[k] || pretty(k);
  const victoryName = k => !k ? 'Без итога' : (N.victories[k] || pretty(k));
  const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
  const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const num = v => v == null || isNaN(v) ? '—' : (Math.abs(v) >= 100 ? nf0 : nf1).format(v);
  const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '—';
  const RU_MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const shortDate = iso => {
    const d = new Date(iso);
    return isNaN(d) ? '—' : d.getDate() + ' ' + RU_MONTH_SHORT[d.getMonth()] + ' ' + d.getFullYear();
  };
  const plural = (n, one, few, many) => {
    const a = n % 100, b = n % 10;
    return (a > 10 && a < 20) ? many : b === 1 ? one : (b > 1 && b < 5) ? few : many;
  };

  /* -------------------------------------------------------------- данные */

  const KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{8}$/;
  const DS_RE = /^REPLAYDATASET_[A-Z0-9_]+$/;

  let sourceP = null;
  function source() {
    if (!sourceP) sourceP = fetch('data/stats-source.json', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
      .then(s => {
        const mode = s && (s.mode === 'live' || s.mode === 'static') ? s.mode : 'static';
        let base = s && typeof s.base === 'string' && s.base.trim() ? s.base.trim() : 'data/stats/';
        if (!base.endsWith('/')) base += '/';
        // http с https-страницы браузер молча заблокирует (mixed content) — лучше
        // сказать об этом прямо, чем показывать «данных нет».
        const insecure = /^http:\/\//i.test(base) && location.protocol === 'https:';
        const bad = !/^(https?:\/\/|\.{0,2}\/|[a-z0-9_-])/i.test(base) || /^(javascript|data):/i.test(base);
        return { mode, base, problem: insecure ? 'mixed' : bad ? 'bad' : '' };
      });
    return sourceP;
  }

  async function getJson(url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (r.status === 404) return { missing: true };
    if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
    return r.json();
  }

  let indexP = null;
  function index() {
    if (!indexP) indexP = (async () => {
      const src = await source();
      if (src.problem) return { ok: false, why: src.problem };
      const url = src.base + (src.mode === 'live' ? 'stats/matches' : 'index.json');
      try {
        const j = await getJson(url);
        // Нет самого списка — это неверный адрес источника, а не «партий нет».
        if (j.missing) return { ok: false, why: 'net' };
        const list = Array.isArray(j.matches) ? j.matches : [];
        const matches = list.filter(m => m && KEY_RE.test(m.key || '') && Array.isArray(m.players))
          .sort((a, b) => String(b.at).localeCompare(String(a.at)));
        return { ok: true, matches, generated: j.generated || null };
      } catch (e) {
        console.warn(e);
        return { ok: false, why: 'net' };
      }
    })();
    return indexP;
  }

  const seriesCache = new Map();
  function matchSeries(key, ds) {
    if (!KEY_RE.test(key) || !DS_RE.test(ds)) return Promise.resolve(null);
    const id = key + '|' + ds;
    if (!seriesCache.has(id)) seriesCache.set(id, (async () => {
      const src = await source();
      const url = src.mode === 'live'
        ? src.base + 'stats/match?key=' + encodeURIComponent(key) + '&keys=' + encodeURIComponent(ds)
        : src.base + 'm/' + encodeURIComponent(key) + '/' + encodeURIComponent(ds) + '.json';
      try {
        const j = await getJson(url);
        if (j.missing) return [];
        return (Array.isArray(j.series) ? j.series : []).filter(s => s && s.key === ds
          && Array.isArray(s.turns) && Array.isArray(s.values));
      } catch (e) {
        console.warn(e);
        return null;
      }
    })());
    return seriesCache.get(id);
  }

  /* Не больше шести запросов разом: у игрока бывает тридцать партий. */
  async function pool(items, fn, width = 6) {
    const out = new Array(items.length);
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => {
      while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
    }));
    return out;
  }

  /* --------------------------------------------------------------- адрес */

  function readHash() {
    const st = { Tab: 'Overview' };
    String(location.hash || '').replace(/^#/, '').split('/').forEach(part => {
      const i = part.indexOf(':');
      if (i <= 0) return;
      let v = part.slice(i + 1);
      try { v = decodeURIComponent(v); } catch (e) { return; }
      st[part.slice(0, i)] = v;
    });
    if (!['Overview', 'Player', 'Match'].includes(st.Tab)) st.Tab = 'Overview';
    return st;
  }
  function hashOf(st) {
    const order = ['Tab', 'Player', 'Match', 'Dataset', 'Version'];
    return '#' + order.filter(k => st[k]).map(k => k + ':' + encodeURIComponent(st[k])).join('/');
  }
  const go = st => { location.hash = hashOf(st); };
  const replace = st => { history.replaceState(null, '', hashOf(st)); render(); };

  const linkPlayer = name => '<a href="' + esc(hashOf({ Tab: 'Player', Player: name })) + '">' + esc(name) + '</a>';
  const linkMatch = (m, text) => '<a href="' + esc(hashOf({ Tab: 'Match', Match: m.key })) + '">'
    + esc(text || matchTitle(m)) + '</a>';
  const matchTitle = m => m.no ? 'Партия №' + m.no : 'Партия ' + m.key.slice(0, 8);
  const humans = m => m.players.filter(p => p.isHuman);
  const decisive = m => m.players.some(p => p.won);
  const winnerOf = m => m.players.filter(p => p.won);

  /* ---------------------------------------------------------- агрегаты */

  function players(matches) {
    const map = new Map();
    for (const m of matches) {
      const total = m.players.length;
      for (const p of humans(m)) {
        const name = String(p.name || '').trim();
        if (!name) continue;
        let r = map.get(name);
        if (!r) map.set(name, r = { name, matches: 0, wins: 0, decisive: 0, placeSum: 0, placeN: 0, civs: new Map(), list: [] });
        r.matches++;
        if (decisive(m)) { r.decisive++; if (p.won) r.wins++; }
        if (p.place > 0) { r.placeSum += p.place; r.placeN++; }
        r.civs.set(p.civ, (r.civs.get(p.civ) || 0) + 1);
        r.list.push({ m, p, total });
      }
    }
    return [...map.values()].sort((a, b) => b.matches - a.matches || b.wins - a.wins || a.name.localeCompare(b.name));
  }

  function civStats(matches) {
    const map = new Map();
    for (const m of matches) {
      if (!decisive(m)) continue;          // без итога побед нет ни у кого — не размываем винрейт
      for (const p of humans(m)) {
        let r = map.get(p.civ);
        if (!r) map.set(p.civ, r = { civ: p.civ, n: 0, wins: 0, placeSum: 0 });
        r.n++; if (p.won) r.wins++; r.placeSum += p.place || 0;
      }
    }
    return [...map.values()].sort((a, b) => b.n - a.n || (b.wins / b.n) - (a.wins / a.n));
  }

  /* ----------------------------------------------------------- разметка */

  const tableWrap = html => '<div class="st-scroll">' + html + '</div>';

  function bars(rows, total) {
    const max = Math.max(1, ...rows.map(r => r.n));
    return '<ul class="st-bars">' + rows.map(r =>
      '<li><span class="l">' + esc(r.label) + '</span>'
      + '<span class="b"><i style="width:' + (100 * r.n / max).toFixed(1) + '%"></i></span>'
      + '<span class="v"><b>' + r.n + '</b> <small>' + pct(r.n, total) + '</small></span></li>').join('') + '</ul>';
  }

  function matchRows(list) {
    return tableWrap('<table class="st"><thead><tr><th scope="col">Партия</th><th scope="col">Дата</th>'
      + '<th scope="col" class="num">Игроков</th><th scope="col">Победа</th><th scope="col" class="num">Ходов</th></tr></thead><tbody>'
      + list.map(m => {
        const w = winnerOf(m);
        return '<tr><td>' + linkMatch(m) + '</td><td>' + esc(shortDate(m.at)) + '</td>'
          + '<td class="num">' + humans(m).length + '</td>'
          + '<td>' + (w.length ? w.map(p => p.isHuman ? linkPlayer(p.name) : esc(p.name) + ' <span class="tag">ИИ</span>').join(', ')
            + ' <span class="dim">· ' + esc(victoryName(m.victoryType)) + '</span>'
            : '<span class="dim">' + esc(victoryName(m.victoryType)) + '</span>') + '</td>'
          + '<td class="num">' + num(m.turns) + '</td></tr>';
      }).join('') + '</tbody></table>');
  }

  function datasetSelect(id, current, available) {
    const avail = available && available.length ? new Set(available) : null;
    const groups = Object.keys(N.groups).map(g => {
      const opts = N.datasets.filter(d => d.g === g && (!avail || avail.has(d.k)));
      if (!opts.length) return '';
      return '<optgroup label="' + esc(N.groups[g]) + '">' + opts.map(d =>
        '<option value="' + esc(d.k) + '"' + (d.k === current ? ' selected' : '') + '>' + esc(d.t) + '</option>').join('') + '</optgroup>';
    }).join('');
    // Ряды, которых нет в подписях (новая версия мода), — отдельной группой, по ключу.
    const extra = avail ? [...avail].filter(k => !DS.has(k)).sort() : [];
    const tail = extra.length ? '<optgroup label="Новые ряды">' + extra.map(k =>
      '<option value="' + esc(k) + '"' + (k === current ? ' selected' : '') + '>' + esc(pretty(k)) + '</option>').join('') + '</optgroup>' : '';
    return '<label>Показатель<select id="' + id + '">' + groups + tail + '</select></label>';
  }

  const unitOf = k => (DS.get(k) || {}).u || '';
  const unitNote = k => { const u = unitOf(k); return !u || (u === 'в ход' && /за ход/.test(dsTitle(k))) ? '' : ' · ' + u; };
  const divOf = k => (DS.get(k) || {}).div || 1;

  /* ------------------------------------------------------------ график */

  function niceTicks(min, max, count) {
    if (max === min) { max = min + 1; }
    const span = max - min, raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw) || raw;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
    return ticks;
  }

  /* Свой SVG, без библиотек: сайт без сборщика, а нужен ровно линейный график
     с перекрестием. lines: [{id, label, sub, color, turns, values, strong, dash}] */
  function lineChart(host, cfg) {
    const lines = cfg.lines.filter(l => l.turns.length);
    host.innerHTML = '';
    if (!lines.length) {
      host.innerHTML = '<p class="dim st-empty-chart">Этого показателя в партиях нет.</p>';
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'chart';
    host.appendChild(wrap);
    const legend = document.createElement('ul');
    legend.className = 'legend';
    host.appendChild(legend);

    const lookup = lines.map(l => { const m = new Map(); l.turns.forEach((t, i) => m.set(t, l.values[i])); return m; });
    let xMin = Infinity, xMax = -Infinity, yMin = 0, yMax = -Infinity;
    lines.forEach(l => {
      xMin = Math.min(xMin, l.turns[0]); xMax = Math.max(xMax, l.turns[l.turns.length - 1]);
      l.values.forEach(v => { if (v < yMin) yMin = v; if (v > yMax) yMax = v; });
    });
    if (xMax <= xMin) xMax = xMin + 1;
    if (yMax <= yMin) yMax = yMin + 1;
    const yT = niceTicks(yMin, yMax, 5);
    yMin = yT[0]; yMax = yT[yT.length - 1];

    let hot = null;         // подсвеченная линия (наведение на легенду)
    const svgNS = 'http://www.w3.org/2000/svg';

    function draw() {
      const W = Math.max(280, wrap.clientWidth);
      const H = W < 520 ? 240 : 320;
      const padL = 12 + 7 * Math.max(...yT.map(v => num(v).length)), padR = 12, padT = 12, padB = 30;
      const X = t => padL + (t - xMin) / (xMax - xMin) * (W - padL - padR);
      const Y = v => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);
      const xT = niceTicks(xMin, xMax, W < 520 ? 4 : 8).filter(t => t >= xMin && t <= xMax);

      let s = '<svg xmlns="' + svgNS + '" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H
        + '" role="img" aria-label="' + esc(cfg.title || 'График по ходам') + '">';
      s += yT.map(v => '<line class="grid" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/>'
        + '<text class="ax" x="' + (padL - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + esc(num(v)) + '</text>').join('');
      s += xT.map(t => '<text class="ax" x="' + X(t) + '" y="' + (H - 10) + '" text-anchor="middle">' + t + '</text>').join('');
      // Сначала приглушённые, потом цветные, подсвеченная — последней (поверх).
      const orderIdx = lines.map((l, i) => i).sort((a, b) => (lines[b].color === MUTED) - (lines[a].color === MUTED) || a - b);
      const pathOf = l => l.turns.map((t, i) => (i ? 'L' : 'M') + X(t).toFixed(1) + ',' + Y(l.values[i]).toFixed(1)).join('');
      orderIdx.forEach(i => {
        const l = lines[i];
        const cls = 'ln' + (hot != null && hot !== i ? ' dim' : '') + (hot === i ? ' hot' : '');
        s += '<path class="' + cls + '" d="' + pathOf(l) + '" stroke="' + l.color + '"'
          + (l.strong ? ' stroke-width="2.6"' : '') + (l.dash ? ' stroke-dasharray="6 4"' : '') + '/>';
      });
      if (hot != null) s += '<path class="ln hot" d="' + pathOf(lines[hot]) + '" stroke="' + (lines[hot].color === MUTED ? WIN : lines[hot].color) + '"/>';
      s += '<g class="cross" visibility="hidden"><line x1="0" x2="0" y1="' + padT + '" y2="' + (H - padB) + '"/></g>';
      s += '<rect class="hit" x="' + padL + '" y="0" width="' + (W - padL - padR) + '" height="' + (H - padB) + '"/>';
      s += '</svg><div class="chart-tip" hidden></div>';
      wrap.innerHTML = s;

      const svg = wrap.querySelector('svg'), cross = svg.querySelector('.cross'), tip = wrap.querySelector('.chart-tip');
      const move = ev => {
        const r = svg.getBoundingClientRect();
        const px = (ev.clientX - r.left) * (W / r.width);
        const t = Math.round(xMin + (px - padL) / (W - padL - padR) * (xMax - xMin));
        if (t < xMin || t > xMax) return;
        const rows = [];
        lines.forEach((l, i) => { const v = lookup[i].get(t); if (v != null) rows.push({ l, v, i }); });
        cross.querySelectorAll('circle').forEach(c => c.remove());
        cross.querySelector('line').setAttribute('x1', X(t)); cross.querySelector('line').setAttribute('x2', X(t));
        rows.forEach(r2 => {
          if (r2.l.color === MUTED && hot !== r2.i && rows.length > 10) return;
          const c = document.createElementNS(svgNS, 'circle');
          c.setAttribute('cx', X(t)); c.setAttribute('cy', Y(r2.v)); c.setAttribute('r', 4);
          c.setAttribute('fill', r2.l.color === MUTED ? WIN : r2.l.color);
          cross.appendChild(c);
        });
        cross.setAttribute('visibility', 'visible');
        rows.sort((a, b) => b.v - a.v);
        const shown = rows.slice(0, 8);
        tip.innerHTML = '<b>Ход ' + t + '</b>' + (rows.length ? shown.map(r2 =>
          '<div><i style="background:' + (r2.l.color === MUTED ? WIN : r2.l.color) + '"></i><span>' + esc(r2.l.label)
          + '</span><em>' + esc(num(r2.v)) + '</em></div>').join('')
          + (rows.length > shown.length ? '<div class="more">и ещё ' + (rows.length - shown.length) + '</div>' : '')
          : '<div class="more">нет данных на этом ходу</div>');
        tip.hidden = false;
        const wx = X(t) * (r.width / W);
        const tw = tip.offsetWidth;
        tip.style.left = (wx + 14 + tw > r.width ? Math.max(0, wx - 14 - tw) : wx + 14) + 'px';
        tip.style.top = '8px';
      };
      const leave = () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; };
      const hit = svg.querySelector('.hit');
      hit.addEventListener('pointermove', move);
      hit.addEventListener('pointerdown', move);
      hit.addEventListener('pointerleave', leave);
    }

    legend.innerHTML = lines.map((l, i) => '<li data-i="' + i + '" tabindex="0"><i style="background:'
      + (l.color === MUTED ? 'var(--line)' : l.color) + (l.dash ? ';background:repeating-linear-gradient(90deg,' + l.color + ' 0 5px,transparent 5px 8px)' : '')
      + '"></i><span>' + (l.html || esc(l.label)) + '</span>' + (l.sub ? '<small>' + esc(l.sub) + '</small>' : '') + '</li>').join('');
    const setHot = i => { if (hot !== i) { hot = i; draw(); } };
    legend.querySelectorAll('li').forEach(li => {
      const i = +li.dataset.i;
      li.addEventListener('mouseenter', () => setHot(i));
      li.addEventListener('focus', () => setHot(i));
      li.addEventListener('mouseleave', () => setHot(null));
      li.addEventListener('blur', () => setHot(null));
    });

    draw();
    if ('ResizeObserver' in window) {
      let last = wrap.clientWidth;
      new ResizeObserver(() => { if (Math.abs(wrap.clientWidth - last) > 4) { last = wrap.clientWidth; draw(); } }).observe(wrap);
    }

    // Таблица значений: для тех, кто не различает цвета, и для копирования чисел.
    const step = xMax - xMin > 120 ? 20 : 10;
    const turns = [];
    for (let t = Math.ceil(xMin / step) * step; t <= xMax; t += step) turns.push(t);
    if (turns[turns.length - 1] !== xMax) turns.push(xMax);
    const det = document.createElement('details');
    det.className = 'st-values';
    det.innerHTML = '<summary>Таблица значений</summary>' + tableWrap('<table class="st"><thead><tr><th scope="col">Ход</th>'
      + lines.map(l => '<th scope="col" class="num">' + esc(l.label) + '</th>').join('') + '</tr></thead><tbody>'
      + turns.map(t => '<tr><td>' + t + '</td>' + lines.map((l, i) => '<td class="num">' + esc(num(lookup[i].get(t))) + '</td>').join('') + '</tr>').join('')
      + '</tbody></table>');
    host.appendChild(det);
  }

  const scaled = (s, ds) => { const d = divOf(ds); return d === 1 ? s.values : s.values.map(v => v / d); };

  /* ------------------------------------------------------------ вкладки */

  const app = () => $('#stats-app');

  function tabs(st) {
    const t = [['Overview', 'Обзор'], ['Player', 'Игрок'], ['Match', 'Партия']];
    return '<nav class="filters st-tabs" aria-label="Вкладки статистики">' + t.map(([k, title]) =>
      '<a href="' + esc(hashOf({ Tab: k })) + '"' + (st.Tab === k ? ' aria-current="page"' : '') + '>' + title + '</a>').join('') + '</nav>';
  }

  function emptyState() {
    return '<div class="todo st-nodata"><p><b>Партий пока нет.</b> Здесь появятся сетевые партии, сыгранные через '
      + 'лаунчер Nova: после выхода из игры лаунчер сам отправляет журнал партии, и партия попадает в статистику, '
      + 'когда журналы прислали хотя бы два её участника.</p>'
      + '<ul><li>Одиночные партии, «горячее кресло» и игры по переписке не публикуются.</li>'
      + '<li>Показываются ники из партии, цивилизации, места и ряды по ходам. Номер Steam не публикуется никогда.</li></ul></div>';
  }

  function failState(why) {
    const text = why === 'mixed'
      ? 'Источник статистики настроен на адрес по http, а сайт открыт по https — браузер такие запросы запрещает. Нужен https-адрес или срезы рядом с сайтом.'
      : why === 'bad' ? 'Источник статистики настроен неверно (data/stats-source.json).'
        : 'Статистику сейчас получить не удалось. Попробуйте обновить страницу позже — сами партии никуда не деваются.';
    return '<div class="note stop">' + esc(text) + '</div>';
  }

  function versionsOf(matches) {
    return [...new Set(matches.map(m => m.modVersion).filter(Boolean))].sort((a, b) =>
      b.localeCompare(a, undefined, { numeric: true }));
  }

  function renderOverview(st, idx) {
    const all = idx.matches;
    const versions = versionsOf(all);
    const ver = versions.includes(st.Version) ? st.Version : '';
    const ms = ver ? all.filter(m => m.modVersion === ver) : all;
    const ps = players(ms);
    const turns = ms.map(m => m.turns).filter(t => t > 0).sort((a, b) => a - b);
    const median = turns.length ? turns[Math.floor((turns.length - 1) / 2)] : null;
    const avg = turns.length ? turns.reduce((a, b) => a + b, 0) / turns.length : null;

    let h = '<div class="skin-controls st-controls"><label>Версия мода<select id="st-ver"><option value="">Все версии</option>'
      + versions.map(v => '<option' + (v === ver ? ' selected' : '') + '>' + esc(v) + '</option>').join('')
      + '</select></label><span class="dim small skin-count">' + (idx.generated ? 'Данные на ' + esc(shortDate(idx.generated)) : '') + '</span></div>';

    h += '<div class="badges"><div><b>' + ms.length + '</b><span>' + plural(ms.length, 'партия', 'партии', 'партий') + '</span></div>'
      + '<div><b>' + ps.length + '</b><span>' + plural(ps.length, 'игрок', 'игрока', 'игроков') + '</span></div>'
      + '<div><b>' + (median != null ? median : '—') + '</b><span>ходов, медиана</span></div>'
      + '<div><b>' + (avg != null ? num(avg) : '—') + '</b><span>ходов в среднем</span></div></div>';

    // Типы побед
    const vt = new Map();
    ms.forEach(m => vt.set(m.victoryType || '', (vt.get(m.victoryType || '') || 0) + 1));
    const vRows = [...vt.entries()].map(([k, n]) => ({ label: victoryName(k), n })).sort((a, b) => b.n - a.n);
    h += '<div class="st-two"><section><h2>Типы побед</h2>' + bars(vRows, ms.length) + '</section>';

    // Длительность
    const edges = [0, 100, 150, 200, 250, 300, Infinity];
    const dRows = edges.slice(0, -1).map((lo, i) => {
      const hi = edges[i + 1];
      return { label: hi === Infinity ? lo + ' и больше' : lo === 0 ? 'до ' + hi : lo + '–' + (hi - 1), n: turns.filter(t => t >= lo && t < hi).length };
    });
    h += '<section><h2>Длительность партий, ходов</h2>' + bars(dRows, turns.length) + '</section></div>';

    // Цивилизации
    const cs = civStats(ms);
    h += '<h2>Цивилизации</h2><p class="small dim">Винрейт — доля побед среди партий с итогом, где цивилизацию взял человек. '
      + 'Партии без победителя и цивилизации ИИ в подсчёт не входят. Меньше ' + SMALL_SAMPLE
      + ' партий — это случайность, а не сила цивилизации: такие строки помечены.</p>';
    h += cs.length ? tableWrap('<table class="st"><thead><tr><th scope="col">Цивилизация</th><th scope="col" class="num">Партий</th>'
      + '<th scope="col" class="num">Побед</th><th scope="col">Винрейт</th><th scope="col" class="num">Ср. место</th></tr></thead><tbody>'
      + cs.map(c => {
        const small = c.n < SMALL_SAMPLE;
        const w = c.wins / c.n;
        return '<tr' + (small ? ' class="small-n"' : '') + '><td><b>' + esc(civName(c.civ)) + '</b></td><td class="num">' + c.n + '</td>'
          + '<td class="num">' + c.wins + '</td><td class="wr"><span class="wr-bar"><i style="width:' + (100 * w).toFixed(1) + '%"></i></span>'
          + '<span class="wr-v">' + pct(c.wins, c.n) + '</span>' + (small ? ' <span class="tag st-small">мало данных</span>' : '') + '</td>'
          + '<td class="num">' + num(c.placeSum / c.n) + '</td></tr>';
      }).join('') + '</tbody></table>') : '<p class="dim">Партий с итогом пока нет.</p>';

    // Игроки
    h += '<h2>Игроки</h2>' + tableWrap('<table class="st"><thead><tr><th scope="col">Игрок</th><th scope="col" class="num">Партий</th>'
      + '<th scope="col" class="num">Побед</th><th scope="col" class="num">Винрейт</th><th scope="col" class="num">Ср. место</th><th scope="col">Чаще всего</th></tr></thead><tbody>'
      + ps.map(p => {
        const fav = [...p.civs.entries()].sort((a, b) => b[1] - a[1])[0];
        return '<tr><td>' + linkPlayer(p.name) + '</td><td class="num">' + p.matches + '</td><td class="num">' + p.wins + '</td>'
          + '<td class="num">' + pct(p.wins, p.decisive) + '</td><td class="num">' + (p.placeN ? num(p.placeSum / p.placeN) : '—') + '</td>'
          + '<td>' + (fav ? esc(civName(fav[0])) : '—') + '</td></tr>';
      }).join('') + '</tbody></table>');

    h += '<h2>Последние партии</h2>' + matchRows(ms.slice(0, 15));
    app().innerHTML = tabs(st) + h;
    $('#st-ver').addEventListener('change', e => replace(Object.assign({}, st, { Version: e.target.value || undefined })));
  }

  async function renderPlayer(st, idx) {
    const ps = players(idx.matches);
    const name = st.Player || '';
    const me = ps.find(p => p.name === name) || ps.find(p => p.name.toLowerCase() === name.toLowerCase());
    let h = tabs(st) + '<form class="skin-controls st-controls" id="st-pick"><label>Игрок<input id="st-player" list="st-players" autocomplete="off" value="'
      + esc(me ? me.name : name) + '" placeholder="ник из партии"></label><datalist id="st-players">'
      + ps.map(p => '<option value="' + esc(p.name) + '">').join('') + '</datalist><button class="btn" type="submit">Показать</button></form>';

    if (!me) {
      h += (name ? '<div class="note">Партий с игроком «' + esc(name) + '» в статистике нет. Ник сравнивается с тем, под которым человек сидел в партии.</div>' : '')
        + '<h2>Все игроки</h2><div class="st-people">' + ps.map(p => '<a class="card link" href="' + esc(hashOf({ Tab: 'Player', Player: p.name }))
          + '"><h3>' + esc(p.name) + '</h3><p>' + p.matches + ' ' + plural(p.matches, 'партия', 'партии', 'партий') + ' · побед ' + p.wins + '</p></a>').join('') + '</div>';
      app().innerHTML = h;
      bindPick(st);
      return;
    }

    const ds = DS_RE.test(st.Dataset || '') ? st.Dataset : DEFAULT_DATASET;
    const list = me.list.slice().sort((a, b) => String(b.m.at).localeCompare(String(a.m.at)));
    const turnsAvg = list.reduce((a, x) => a + (x.m.turns || 0), 0) / list.length;
    h += '<div class="badges"><div><b>' + me.matches + '</b><span>' + plural(me.matches, 'партия', 'партии', 'партий') + '</span></div>'
      + '<div><b>' + me.wins + '</b><span>побед · ' + pct(me.wins, me.decisive) + '</span></div>'
      + '<div><b>' + (me.placeN ? num(me.placeSum / me.placeN) : '—') + '</b><span>среднее место</span></div>'
      + '<div><b>' + num(turnsAvg) + '</b><span>ходов в среднем</span></div></div>';

    const chartList = list.slice(0, PLAYER_CHART_LIMIT);
    const keys = [...new Set(chartList.flatMap(x => Array.isArray(x.m.keys) ? x.m.keys : []))];
    h += '<h2>По ходам</h2><div class="skin-controls st-controls">' + datasetSelect('st-ds', ds, keys)
      + '<span class="dim small skin-count">линия — одна партия' + (list.length > PLAYER_CHART_LIMIT ? ', последние ' + PLAYER_CHART_LIMIT : '')
      + (Math.min(list.length, PLAYER_CHART_LIMIT) > PALETTE.length ? '; светлые — победы' : '') + '</span></div>'
      + '<p class="small dim st-unit">' + esc(dsTitle(ds)) + esc(unitNote(ds)) + '</p>'
      + '<div id="st-chart" class="st-chart"><p class="dim">Загружаю ряды…</p></div>';

    h += '<h2>Партии</h2>' + tableWrap('<table class="st"><thead><tr><th scope="col">Партия</th><th scope="col">Дата</th><th scope="col">Цивилизация</th>'
      + '<th scope="col" class="num">Место</th><th scope="col" class="num">Очки</th><th scope="col">Итог</th><th scope="col" class="num">Ходов</th></tr></thead><tbody>'
      + list.map(x => '<tr><td>' + linkMatch(x.m) + '</td><td>' + esc(shortDate(x.m.at)) + '</td><td>' + esc(civName(x.p.civ)) + '</td>'
        + '<td class="num">' + (x.p.place ? x.p.place + ' <small class="dim">из ' + x.total + '</small>' : '—') + '</td>'
        + '<td class="num">' + num(x.p.score) + '</td><td>' + outcome(x.p, x.m) + '</td><td class="num">' + num(x.m.turns) + '</td></tr>').join('')
      + '</tbody></table>');

    app().innerHTML = h;
    bindPick(st);
    $('#st-ds').addEventListener('change', e => replace(Object.assign({}, st, { Player: me.name, Dataset: e.target.value })));

    const token = renderToken;
    const got = await pool(chartList, x => matchSeries(x.m.key, ds));
    if (token !== renderToken) return;
    const host = $('#st-chart');
    if (got.every(g => g === null)) { host.innerHTML = failState('net'); return; }
    const many = chartList.length > PALETTE.length;
    const lines = [];
    chartList.forEach((x, i) => {
      const s = (got[i] || []).find(z => z.playerId === x.p.playerId) || (got[i] || []).find(z => z.name === me.name);
      if (!s) return;
      lines.push({
        label: matchTitle(x.m), sub: shortDate(x.m.at) + ' · ' + civName(x.p.civ) + ' · ' + (x.p.won ? 'победа' : x.p.place + ' место'),
        color: many ? (x.p.won ? WIN : MUTED) : PALETTE[i], turns: s.turns, values: scaled(s, ds),
      });
    });
    lineChart(host, { lines, title: dsTitle(ds) + ' — ' + me.name });
  }

  function bindPick(st) {
    $('#st-pick').addEventListener('submit', e => {
      e.preventDefault();
      const v = $('#st-player').value.trim();
      go({ Tab: 'Player', Player: v || undefined, Dataset: st.Dataset });
    });
  }

  function outcome(p, m) {
    if (p.won) return '<span class="st-win">победа</span>';
    if (!p.isAlive && p.lastTurn > 0 && p.lastTurn < (m.turns || Infinity)) return 'выбыл на ходу ' + p.lastTurn;
    return decisive(m) ? 'дожил до конца' : '<span class="dim">без итога</span>';
  }

  async function renderMatch(st, idx) {
    const m = idx.matches.find(x => x.key === st.Match);
    if (!m) {
      app().innerHTML = tabs(st) + (st.Match ? '<div class="note">Такой партии в статистике нет.</div>' : '')
        + '<h2>Выберите партию</h2>' + matchRows(idx.matches.slice(0, 60));
      return;
    }
    const ds = DS_RE.test(st.Dataset || '') ? st.Dataset : DEFAULT_DATASET;
    const ps = m.players.slice().sort((a, b) => (a.place || 99) - (b.place || 99));
    let h = tabs(st) + '<div class="st-head"><h2>' + esc(matchTitle(m)) + '</h2><p class="dim">' + esc(shortDate(m.at))
      + ' · ' + num(m.turns) + ' ' + plural(m.turns || 0, 'ход', 'хода', 'ходов') + ' · ' + esc(victoryName(m.victoryType))
      + (m.modVersion ? ' · мод ' + esc(m.modVersion) : '') + '</p></div>';

    h += tableWrap('<table class="st"><thead><tr><th scope="col" class="num">Место</th><th scope="col">Участник</th><th scope="col">Цивилизация</th>'
      + '<th scope="col" class="num">Очки</th><th scope="col">Итог</th></tr></thead><tbody>'
      + ps.map((p, i) => '<tr><td class="num">' + (p.place || '—') + '</td><td><i class="sw" style="background:' + colorFor(i, ps.length) + '"></i>'
        + (p.isHuman ? linkPlayer(p.name) : esc(p.name) + ' <span class="tag">ИИ</span>') + '</td>'
        + '<td>' + esc(civName(p.civ)) + '</td><td class="num">' + num(p.score) + '</td><td>' + outcome(p, m) + '</td></tr>').join('')
      + '</tbody></table>');

    h += '<h2>По ходам</h2><div class="skin-controls st-controls">' + datasetSelect('st-ds', ds, m.keys) + '</div>'
      + '<p class="small dim st-unit">' + esc(dsTitle(ds)) + esc(unitNote(ds)) + '</p>'
      + '<div id="st-chart" class="st-chart"><p class="dim">Загружаю ряды…</p></div>';
    app().innerHTML = h;
    $('#st-ds').addEventListener('change', e => replace(Object.assign({}, st, { Dataset: e.target.value })));

    const token = renderToken;
    const series = await matchSeries(m.key, ds);
    if (token !== renderToken) return;
    const host = $('#st-chart');
    if (series === null) { host.innerHTML = failState('net'); return; }
    const lines = [];
    ps.forEach((p, i) => {
      const s = series.find(z => z.playerId === p.playerId);
      if (!s) return;
      lines.push({ label: p.name, sub: civName(p.civ) + (p.isHuman ? '' : ' · ИИ'), color: colorFor(i, ps.length),
        turns: s.turns, values: scaled(s, ds) });
    });
    lineChart(host, { lines, title: dsTitle(ds) + ' — ' + matchTitle(m) });
  }

  /* Цвет идёт за участником (порядок мест), девятый и дальше — приглушённые. */
  const colorFor = i => i < PALETTE.length ? PALETTE[i] : MUTED;

  /* ------------------------------------------------------------ главный */

  let renderToken = 0;
  async function render() {
    const token = ++renderToken;
    const st = readHash();
    const idx = await index();
    if (token !== renderToken) return;
    if (!idx.ok) { app().innerHTML = failState(idx.why); return; }
    if (!idx.matches.length) { app().innerHTML = emptyState(); return; }
    if (st.Tab === 'Player') return renderPlayer(st, idx);
    if (st.Tab === 'Match') return renderMatch(st, idx);
    return renderOverview(st, idx);
  }

  window.addEventListener('hashchange', render);
  render();
})();
