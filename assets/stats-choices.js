/* ---------------------------------------------------------------------------
   Статистика партий Nova: вкладки «Выборы», «Зал славы» (рекорды за партию,
   быстрейшие победы, рекорды за ход, номинации-средние, суммы за всё время) и
   «Сравнение» (2–4 игрока бок о бок и очные встречи); в профиле игрока — почерк
   и личные рекорды.

   ОТКУДА ДАННЫЕ. Служба разбирает журналы засчитанных партий (маршрут
   /stats/choices) и отдаёт по каждой партии и человеку: политики, ветки,
   идеологию, пантеон и верования, чудеса, технологии и эпохи, драфт, великих
   людей, дела с городами-государствами, войну, выход из партии; по партии —
   конгресс. Выгрузка кладёт это в choices.json рядом с index.json (режим static),
   в режиме live страница спрашивает службу сама. Разбор — в
   Client\src\Civ5Launcher.Rating\MatchChoices.cs.

   ИТОГИ СЧИТАЕТ СТРАНИЦА, как и весь остальной обзор (stats.js): фильтр по версии
   мода, профиль игрока и сочетания работают на одном и том же наборе записей, а
   правила подсчёта видны здесь:
     * партии — только те, что есть в списке (засчитанные, сетевые, шестеро);
     * люди — только участники-люди (isHuman), ИИ в журнал своих выборов не пишет;
     * «взяли» — в скольких участиях выбор был хотя бы раз; доля — от всех участий;
     * винрейт — доля побед среди взявших, ТОЛЬКО по доигранным партиям (поле
       finished службы); меньше SMALL_SAMPLE доигранных — пометка «мало данных»;
     * ход — когда выбор сделан впервые.
   Названия — assets/stats-choices-names*.js (собраны из базы игры скриптом
   Client/tools/gen-game-ids.py). Незнакомый ключ показывается как есть.

   Текст из сети — только через esc(), как и на остальной странице.
   --------------------------------------------------------------------------- */
'use strict';

(() => {
  const S = window.NOVA_STATS;
  if (!S) return;
  const { EN, L, esc, num, pct, word, civName, linkPlayer, linkMatch, hashOf, replace, done,
    tableWrap, bars, lineChart, dsTitle, divOf, versionsOf, source, getJson, SMALL_SAMPLE, PALETTE, MUTED, WIN } = S;

  const NAMES = EN && typeof NOVA_CHOICE_NAMES_EN !== 'undefined' ? NOVA_CHOICE_NAMES_EN
    : typeof NOVA_CHOICE_NAMES !== 'undefined' ? NOVA_CHOICE_NAMES : {};
  const PREFIX = /^(POLICY_BRANCH_|POLICY_|BELIEF_|BUILDING_|TECH_|ERA_|RELIGION_|RESOLUTION_|UNITCLASS_|UNIT_)/;
  const nm = k => {
    if (!k) return L('неизвестно', 'unknown');
    if (k[0] === '#') return L('№', '#') + k.slice(1) + L(' (нет в словаре)', ' (not in the dictionary)');
    return NAMES[k] || S.pretty(k.replace(PREFIX, 'X_')).replace(/^X /, '');
  };
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const median = a => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return b[Math.floor((b.length - 1) / 2)]; };
  const vcmp = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

  /* ------------------------------------------------------------ данные */

  let choicesP = null;
  function choices() {
    if (!choicesP) choicesP = (async () => {
      const src = await source();
      if (src.problem) return { ok: false };
      const url = src.base + (src.mode === 'live' ? 'stats/choices' : 'choices.json');
      try {
        const j = await getJson(url);
        if (j.missing) return { ok: false, missing: true };
        if (j.schema !== 1 || !Array.isArray(j.matches)) return { ok: false };
        return { ok: true, data: j };
      } catch (e) {
        console.warn(e);
        return { ok: false };
      }
    })();
    return choicesP;
  }

  /* Записи «человек в партии»: сводка службы + строка игрока из списка партий.
     Партии, которой нет в списке, нет и здесь — один отбор на всю страницу. */
  function rowsOf(idx, cj, version) {
    const byKey = new Map(idx.matches.map(m => [m.key, m]));
    const rows = [], matches = [];
    for (const c of cj.matches) {
      const m = byKey.get(c.key);
      if (!m || (version && m.modVersion !== version)) continue;
      const entry = { m, c, rows: [] };
      for (const pc of c.players || []) {
        const p = m.players.find(x => x.playerId === pc.slot && x.isHuman);
        if (!p) continue;
        const name = String(p.name || '').trim();
        if (!name) continue;
        const r = { m, c, p, pc, name, civ: p.civ, fin: done(m), won: done(m) && !!p.won };
        entry.rows.push(r);
        rows.push(r);
      }
      matches.push(entry);
    }
    return { rows, matches };
  }

  const isIdeo = (cj, policy) => (cj.meta.ideologies || []).includes((cj.meta.policyBranch || {})[policy]);
  const branchOf = (cj, policy) => (cj.meta.policyBranch || {})[policy] || '';

  /* Сводка «что выбрали»: pick(запись) → [[ход, ключ], …]. В одном участии ключ
     считается один раз (первый ход). */
  function tally(rows, pick) {
    const map = new Map();
    for (const r of rows) {
      const seen = new Set();
      for (const it of pick(r) || []) {
        const t = it[0], k = it[1];
        if (!k || seen.has(k)) continue;
        seen.add(k);
        let a = map.get(k);
        if (!a) map.set(k, a = { key: k, n: 0, fn: 0, wins: 0, turns: [], best: [], rows: [] });
        a.n++;
        a.rows.push(r);
        if (r.fin) { a.fn++; if (r.won) a.wins++; }
        if (typeof t === 'number' && t >= 0) {
          a.turns.push(t);
          if (!a.best.length || t < a.best[0].t) a.best = [{ t, r }];
          else if (t === a.best[0].t) a.best.push({ t, r });
        }
      }
    }
    for (const a of map.values()) { a.avg = avg(a.turns); a.med = median(a.turns); }
    return [...map.values()].sort((x, y) => y.n - x.n || (x.avg ?? 1e9) - (y.avg ?? 1e9));
  }

  /* ----------------------------------------------------------- разметка */

  const th = (t, isNum) => '<th scope="col"' + (isNum ? ' class="num"' : '') + '>' + t + '</th>';
  const td = (v, isNum) => '<td' + (isNum ? ' class="num"' : '') + '>' + v + '</td>';
  const table = (head, body) => tableWrap('<table class="st"><thead><tr>' + head.join('') + '</tr></thead><tbody>'
    + (body.length ? body.join('') : '<tr><td colspan="' + head.length + '" class="dim">' + L('Нет данных.', 'No data.') + '</td></tr>')
    + '</tbody></table>');
  const SMALL = '<span class="tag st-small">' + L('мало данных', 'small sample') + '</span>';

  function wrCell(wins, n) {
    if (!n) return '<td class="wr"><span class="dim">—</span></td>';
    return '<td class="wr"><span class="wr-bar"><i style="width:' + (100 * wins / n).toFixed(1) + '%"></i></span>'
      + '<span class="wr-v">' + pct(wins, n) + '</span> <small class="dim">' + wins + '/' + n + '</small>'
      + (n < SMALL_SAMPLE ? ' ' + SMALL : '') + '</td>';
  }
  const tr = (cells, fn) => '<tr' + (fn < SMALL_SAMPLE ? ' class="small-n"' : '') + '>' + cells.join('') + '</tr>';

  /* «Раньше всех»: ход, кто, цивилизация, партия; при равенстве — сколько ещё. */
  function whoFirst(best) {
    if (!best || !best.length) return '—';
    const b = best[0];
    return '<b>' + b.t + '</b> · ' + linkPlayer(b.r.name) + ' <small class="dim">' + esc(civName(b.r.civ)) + ', '
      + linkMatch(b.r.m) + '</small>' + (best.length > 1 ? ' <small class="dim">' + L('и ещё ', '+') + (best.length - 1) + '</small>' : '');
  }

  function intro(text) { return '<p class="small dim">' + text + '</p>'; }
  const COMMON = L('Взяли — в скольких участиях человек сделал этот выбор (доля — от всех участий людей в выбранных партиях). '
    + 'Винрейт — доля побед среди сделавших выбор, только по доигранным партиям. Ход — когда выбор сделан впервые. '
    + 'Меньше ' + SMALL_SAMPLE + ' доигранных партий — случайность, такие строки помечены.',
    'Taken — in how many appearances a person made this choice (the share is of all human appearances in the selected matches). '
    + 'Win rate — the share of wins among those who made it, played-out matches only. Turn — when it was first chosen. '
    + 'Fewer than ' + SMALL_SAMPLE + ' played-out matches is chance; such rows are marked.');

  /* Стандартная таблица по сводке tally(). extra — доп. колонки [заголовок, функция(a)]. */
  function choiceTable(list, total, firstTitle, extra = []) {
    return table([th(firstTitle)].concat(extra.map(e => th(e[0], e[2])), [th(L('Взяли', 'Taken'), true), th(L('Доля', 'Share'), true),
      th(L('Винрейт', 'Win rate')), th(L('Ср. ход', 'Avg. turn'), true), th(L('Медиана', 'Median'), true), th(L('Раньше всех', 'Earliest'))]),
      list.map(a => tr([td('<b>' + esc(nm(a.key)) + '</b>')].concat(extra.map(e => td(e[1](a), e[2])),
        [td(a.n, true), td(pct(a.n, total), true), wrCell(a.wins, a.fn), td(num(a.avg), true), td(num(a.med), true), td(whoFirst(a.best))]), a.fn)));
  }

  /* --------------------------------------------------------- разделы */

  function secPolicies(rows, matches, cj) {
    const total = rows.length;
    // Ветки: открыл, открыл первой, закрыл.
    const br = new Map();
    const get = k => { let a = br.get(k); if (!a) br.set(k, a = { key: k, open: 0, ofn: 0, owins: 0, first: 0, ffn: 0, fwins: 0, closed: 0, cfn: 0, cwins: 0, cturns: [], oturns: [], cbest: [] }); return a; };
    for (const r of rows) {
      const opened = r.pc.branches || [];
      opened.forEach(([t, k], i) => {
        const a = get(k);
        a.open++; a.oturns.push(t);
        if (r.fin) { a.ofn++; if (r.won) a.owins++; }
        if (i === 0) { a.first++; if (r.fin) { a.ffn++; if (r.won) a.fwins++; } }
      });
      for (const [t, k] of r.pc.closed || []) {
        const a = get(k);
        a.closed++; a.cturns.push(t);
        if (r.fin) { a.cfn++; if (r.won) a.cwins++; }
        if (!a.cbest.length || t < a.cbest[0].t) a.cbest = [{ t, r }]; else if (t === a.cbest[0].t) a.cbest.push({ t, r });
      }
    }
    const brs = [...br.values()].sort((x, y) => y.first - x.first || y.open - x.open);
    let h = '<h2>' + L('Ветки политик', 'Policy branches') + '</h2>'
      + intro(L('Первой — какую ветку человек открыл первой в партии. Закрыта — взяты все политики ветки. '
        + 'Винрейт считается отдельно для открывших первой и для закрывших. Идеологии — в своём разделе.',
        'First — the branch a person opened first in the match. Closed — every policy of the branch taken. '
        + 'The win rate is counted separately for those who opened it first and those who closed it. Ideologies have their own section.'));
    h += table([th(L('Ветка', 'Branch')), th(L('Открыли', 'Opened'), true), th(L('Ср. ход', 'Avg. turn'), true),
      th(L('Первой', 'First'), true), th(L('Доля первой', 'First share'), true), th(L('Винрейт открывших первой', 'Win rate, opened first')),
      th(L('Закрыли', 'Closed'), true), th(L('Ср. ход закрытия', 'Avg. turn closed'), true), th(L('Винрейт закрывших', 'Win rate, closed')),
      th(L('Закрыл раньше всех', 'Closed earliest'))],
      brs.map(a => tr([td('<b>' + esc(nm(a.key)) + '</b>'), td(a.open, true), td(num(avg(a.oturns)), true), td(a.first, true),
        td(pct(a.first, total), true), wrCell(a.fwins, a.ffn), td(a.closed, true), td(num(avg(a.cturns)), true), wrCell(a.cwins, a.cfn),
        td(whoFirst(a.cbest))], Math.max(a.ffn, a.cfn))));

    // Политики по веткам (без принципов идеологий).
    const list = tally(rows, r => (r.pc.policies || []).filter(([, k]) => !isIdeo(cj, k)));
    const groups = new Map();
    list.forEach(a => { const b = branchOf(cj, a.key) || ''; if (!groups.has(b)) groups.set(b, []); groups.get(b).push(a); });
    const order = brs.map(a => a.key).concat([...groups.keys()].filter(k => !br.has(k)));
    h += '<h2>' + L('Политики', 'Policies') + '</h2>' + intro(COMMON);
    order.filter(b => groups.has(b)).forEach((b, i) => {
      const g = groups.get(b);
      h += '<details class="st-group"' + (i < 3 ? ' open' : '') + '><summary><b>' + esc(b ? nm(b) : L('Без ветки', 'No branch')) + '</b> <span class="dim">· '
        + g.length + ' ' + word(g.length, 'политика', 'политики', 'политик', 'policy', 'policies') + '</span></summary>'
        + choiceTable(g, total, L('Политика', 'Policy')) + '</details>';
    });
    return h;
  }

  function secIdeologies(rows, matches, cj) {
    const total = rows.length;
    const withIdeo = rows.filter(r => (r.pc.ideology || []).some(x => x[1]));
    const first = tally(rows, r => { const x = (r.pc.ideology || []).find(i => i[1]); return x ? [[x[0], x[1]]] : []; });
    const sw = new Map();
    let switches = 0, unknownSwitch = 0;
    for (const r of rows) {
      const list = r.pc.ideology || [];
      for (let i = 1; i < list.length; i++) {
        if (!list[i][2]) continue;
        switches++;
        if (!list[i][1]) { unknownSwitch++; continue; }
        const k = (list[i - 1][1] || '?') + '→' + list[i][1];
        sw.set(k, (sw.get(k) || 0) + 1);
      }
    }
    let h = '<div class="badges"><div><b>' + withIdeo.length + '</b><span>' + L('приняли идеологию', 'adopted an ideology') + ' · ' + pct(withIdeo.length, total) + '</span></div>'
      + '<div><b>' + switches + '</b><span>' + word(switches, 'смена', 'смены', 'смен', 'switch', 'switches') + L(' идеологии', ' of ideology') + '</span></div></div>';
    h += '<h2>' + L('Идеологии', 'Ideologies') + '</h2>' + intro(L('Первая принятая идеология. Доля — от тех, кто вообще принял идеологию.',
      'The first ideology adopted. The share is of everyone who adopted one at all.'));
    h += table([th(L('Идеология', 'Ideology')), th(L('Приняли', 'Adopted'), true), th(L('Доля', 'Share'), true), th(L('Винрейт', 'Win rate')),
      th(L('Ср. ход', 'Avg. turn'), true), th(L('Медиана', 'Median'), true), th(L('Раньше всех', 'Earliest'))],
      first.map(a => tr([td('<b>' + esc(nm(a.key)) + '</b>'), td(a.n, true), td(pct(a.n, withIdeo.length), true), wrCell(a.wins, a.fn),
        td(num(a.avg), true), td(num(a.med), true), td(whoFirst(a.best))], a.fn)));
    if (sw.size || unknownSwitch) {
      h += '<h3>' + L('Смены', 'Switches') + '</h3>' + bars([...sw.entries()].map(([k, n]) => {
        const [a, b] = k.split('→');
        return { label: nm(a === '?' ? '' : a) + ' → ' + nm(b), n };
      }).sort((a, b) => b.n - a.n), switches)
        + (unknownSwitch ? '<p class="small dim">' + L('Ещё ', 'Another ') + unknownSwitch + L(' — новая идеология по журналу не видна.', ' — the new ideology is not visible in the log.') + '</p>' : '');
    }
    const tenets = tally(rows, r => (r.pc.policies || []).filter(([, k]) => isIdeo(cj, k)));
    h += '<h2>' + L('Принципы идеологий', 'Ideology tenets') + '</h2>' + intro(COMMON)
      + choiceTable(tenets, total, L('Принцип', 'Tenet'), [[L('Идеология', 'Ideology'), a => esc(nm(branchOf(cj, a.key)))]]);
    return h;
  }

  function secReligion(rows, matches, cj) {
    const total = rows.length;
    const pan = tally(rows, r => r.pc.pantheon ? [r.pc.pantheon] : []);
    const withPan = rows.filter(r => r.pc.pantheon).length;
    const founders = rows.filter(r => r.pc.religion);
    const rel = tally(rows, r => r.pc.religion ? [r.pc.religion] : []);
    const fF = founders.filter(r => r.fin), nF = rows.filter(r => r.fin && !r.pc.religion);
    let h = '<div class="badges"><div><b>' + withPan + '</b><span>' + L('основали пантеон', 'founded a pantheon') + ' · ' + pct(withPan, total) + '</span></div>'
      + '<div><b>' + founders.length + '</b><span>' + L('основали религию', 'founded a religion') + ' · ' + pct(founders.length, total) + '</span></div>'
      + '<div><b>' + pct(fF.filter(r => r.won).length, fF.length) + '</b><span>' + L('винрейт основавших религию', 'win rate, religion founders') + '</span></div>'
      + '<div><b>' + pct(nF.filter(r => r.won).length, nF.length) + '</b><span>' + L('винрейт без религии', 'win rate, no religion') + '</span></div></div>';
    h += '<h2>' + L('Пантеоны', 'Pantheons') + '</h2>' + intro(COMMON) + choiceTable(pan, total, L('Пантеон', 'Pantheon'));
    const KINDS = [['founder', L('Верования основателя', 'Founder beliefs')], ['follower', L('Верования последователей', 'Follower beliefs')],
      ['enhancer', L('Верования усиления', 'Enhancer beliefs')], ['reformation', L('Верования Реформации', 'Reformation beliefs')]];
    h += '<h2>' + L('Религии', 'Religions') + '</h2>' + intro(L('Какая религия основана (основатель выбирает и её). Доля — от всех участий.',
      'Which religion was founded. The share is of all appearances.')) + choiceTable(rel, total, L('Религия', 'Religion'));
    KINDS.forEach(([kind, title]) => {
      const list = tally(rows, r => (r.pc.beliefs || []).filter(b => b[2] === kind));
      h += '<h2>' + title + '</h2>' + choiceTable(list, total, L('Верование', 'Belief'));
    });
    return h;
  }

  function secWonders(rows) {
    const total = rows.length;
    const list = tally(rows, r => r.pc.wonders || []);
    return '<h2>' + L('Мировые чудеса', 'World wonders') + '</h2>'
      + intro(L('Построено — в скольких участиях человек построил чудо. Чудо достраивают двое на одном ходу — оно засчитывается обоим (так пишет игра). ',
        'Built — in how many appearances a person built the wonder. When two finish it on the same turn, both are counted (that is what the game records). ') + COMMON)
      + choiceTable(list, total, L('Чудо', 'Wonder'));
  }

  function secTechs(rows, matches, cj) {
    const total = rows.length;
    const eras = tally(rows, r => r.pc.eras || []).sort((a, b) => (a.avg ?? 1e9) - (b.avg ?? 1e9));
    let h = '<h2>' + L('Эпохи', 'Eras') + '</h2>' + intro(L('Ход входа в эпоху. Древний мир — с начала партии, его в журнале нет.',
      'The turn the era was entered. The Ancient era starts the match and is not in the log.'));
    h += table([th(L('Эпоха', 'Era')), th(L('Дошли', 'Reached'), true), th(L('Доля', 'Share'), true), th(L('Ср. ход', 'Avg. turn'), true),
      th(L('Медиана', 'Median'), true), th(L('Винрейт дошедших', 'Win rate')), th(L('Быстрее всех', 'Fastest'))],
      eras.map(a => tr([td('<b>' + esc(nm(a.key)) + '</b>'), td(a.n, true), td(pct(a.n, total), true), td(num(a.avg), true), td(num(a.med), true),
        wrCell(a.wins, a.fn), td(whoFirst(a.best))], a.fn)));
    const techs = tally(rows, r => r.pc.techs || []).sort((a, b) => (a.avg ?? 1e9) - (b.avg ?? 1e9));
    const era = cj.meta.techEra || {};
    h += '<h2>' + L('Технологии: средний ход и рекорды', 'Technologies: average turn and records') + '</h2>'
      + intro(L('Стартовые технологии игра не записывает. Рекорд — самый ранний ход изучения во всех партиях выборки.',
        'Starting technologies are not recorded. The record is the earliest turn it was learned in any match of the selection.'));
    h += table([th(L('Технология', 'Technology')), th(L('Эпоха', 'Era')), th(L('Изучили', 'Learned'), true), th(L('Ср. ход', 'Avg. turn'), true),
      th(L('Медиана', 'Median'), true), th(L('Рекорд', 'Record'))],
      techs.map(a => '<tr>' + td('<b>' + esc(nm(a.key)) + '</b>') + td(esc(nm(era[a.key] || ''))) + td(a.n, true) + td(num(a.avg), true)
        + td(num(a.med), true) + td(whoFirst(a.best)) + '</tr>'));
    return h;
  }

  function secDraft(rows, matches) {
    const dm = matches.filter(x => x.c.draft);
    const civ = new Map();
    const get = k => { let a = civ.get(k); if (!a) civ.set(k, a = { key: k, bannedIn: 0, banned: 0, offered: 0, picked: 0, pfn: 0, pwins: 0 }); return a; };
    for (const x of dm) {
      const bannedHere = new Set();
      for (const r of x.rows) {
        (r.pc.bans || []).forEach(k => { get(k).banned++; bannedHere.add(k); });
        (r.pc.picks || []).forEach(k => {
          const a = get(k);
          a.offered++;
          if (k === r.civ) { a.picked++; if (r.fin) { a.pfn++; if (r.won) a.pwins++; } }
        });
      }
      bannedHere.forEach(k => get(k).bannedIn++);
    }
    const list = [...civ.values()].sort((a, b) => b.bannedIn - a.bannedIn || b.picked - a.picked);
    let h = '<div class="badges"><div><b>' + dm.length + '</b><span>' + L('партий с драфтом', 'matches with a draft') + '</span></div></div>';
    h += '<h2>' + L('Драфт цивилизаций', 'Civilization draft') + '</h2>'
      + intro(L('Банрейт — в какой доле партий с драфтом цивилизацию забанил хоть кто-то. Предложена — сколько раз выпадала игроку на выбор; '
        + 'пикрейт — как часто её брали, когда она выпадала. Винрейт после пика — доля побед взявших её из драфта (доигранные партии).',
        'Ban rate — the share of draft matches where someone banned the civilization. Offered — how many times a player was offered it; '
        + 'pick rate — how often it was taken when offered. Win rate after pick — wins of those who took it from the draft (played-out matches).'));
    h += table([th(L('Цивилизация', 'Civilization')), th(L('Банов', 'Bans'), true), th(L('Банрейт', 'Ban rate'), true), th(L('Предложена', 'Offered'), true),
      th(L('Взяли', 'Picked'), true), th(L('Пикрейт', 'Pick rate'), true), th(L('Винрейт после пика', 'Win rate after pick'))],
      list.map(a => tr([td('<b>' + esc(civName(a.key)) + '</b>'), td(a.banned, true), td(pct(a.bannedIn, dm.length), true), td(a.offered, true),
        td(a.picked, true), td(pct(a.picked, a.offered), true), wrCell(a.pwins, a.pfn)], a.pfn)));
    return h;
  }

  function secGreatPeople(rows) {
    const cls = new Map();
    const who = new Map();
    for (const r of rows) {
      const seenFaith = new Set();
      for (const [, k, how] of r.pc.gp || []) {
        let a = cls.get(k);
        if (!a) cls.set(k, a = { key: k, choice: 0, faith: 0, maya: 0, buyers: 0, fn: 0, wins: 0 });
        a[how] = (a[how] || 0) + 1;
        if (how === 'faith' && !seenFaith.has(k)) { seenFaith.add(k); a.buyers++; if (r.fin) { a.fn++; if (r.won) a.wins++; } }
        if (how === 'faith') who.set(r.name, (who.get(r.name) || 0) + 1);
      }
    }
    const list = [...cls.values()].sort((a, b) => (b.faith + b.choice + b.maya) - (a.faith + a.choice + a.maya));
    let h = '<h2>' + L('Великие люди', 'Great people') + '</h2>'
      + intro(L('Что есть в журналах: бесплатный великий человек на выбор (за политику, чудо, верование), покупка великого человека за веру в городе '
        + 'и бактун майя. Отдельного события «выбор за веру» игра в этих партиях не записала ни разу. Винрейт — у тех, кто покупал этого человека за веру.',
        'What the logs contain: a free great person of one\'s choice (from a policy, wonder or belief), buying a great person with faith in a city, '
        + 'and the Maya baktun. The separate “faith choice” event never occurred in these matches. Win rate — of those who bought this person with faith.'));
    h += table([th(L('Великий человек', 'Great person')), th(L('На выбор', 'Free choice'), true), th(L('За веру', 'With faith'), true),
      th(L('Майя', 'Maya'), true), th(L('Покупали', 'Buyers'), true), th(L('Винрейт покупавших', 'Win rate, buyers'))],
      list.map(a => tr([td('<b>' + esc(nm(a.key)) + '</b>'), td(a.choice || 0, true), td(a.faith || 0, true), td(a.maya || 0, true), td(a.buyers, true),
        wrCell(a.wins, a.fn)], a.fn)));
    const top = [...who.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (top.length) h += '<h3>' + L('Больше всех купили за веру', 'Most bought with faith') + '</h3>'
      + bars(top.map(([n, v]) => ({ label: n, n: v })), top.reduce((s, x) => s + x[1], 0));
    return h;
  }

  /* По игрокам: сумма по его участиям. */
  function perPlayer(rows, add) {
    const map = new Map();
    for (const r of rows) {
      let a = map.get(r.name);
      if (!a) map.set(r.name, a = { name: r.name, n: 0 });
      a.n++;
      add(a, r);
    }
    return [...map.values()];
  }

  function secCityStates(rows) {
    const list = perPlayer(rows, (a, r) => {
      const cs = r.pc.cs || {};
      for (const k of ['coups', 'coupsOk', 'liberated', 'liberatedCs', 'tributeGold', 'tributeGoldSum', 'tributeUnits', 'gifts', 'giftsSum', 'buyouts', 'pledges', 'quests'])
        a[k] = (a[k] || 0) + (cs[k] || 0);
    }).sort((a, b) => b.quests / b.n - a.quests / a.n);
    const sum = k => list.reduce((s, a) => s + (a[k] || 0), 0);
    let h = '<div class="badges"><div><b>' + sum('coupsOk') + '/' + sum('coups') + '</b><span>' + L('переворотов удалось', 'coups succeeded') + ' · ' + pct(sum('coupsOk'), sum('coups')) + '</span></div>'
      + '<div><b>' + sum('liberatedCs') + '</b><span>' + L('городов-государств освобождено', 'city-states liberated') + '</span></div>'
      + '<div><b>' + num(sum('tributeGoldSum')) + '</b><span>' + L('золота взято данью', 'gold taken as tribute') + '</span></div>'
      + '<div><b>' + num(sum('giftsSum')) + '</b><span>' + L('золота подарено', 'gold gifted') + '</span></div>'
      + '<div><b>' + sum('quests') + '</b><span>' + L('заданий выполнено', 'quests completed') + '</span></div></div>';
    h += '<h2>' + L('Города-государства по игрокам', 'City-states by player') + '</h2>'
      + intro(L('Суммы по всем партиям игрока в выборке; «в среднем» — на одну партию. Переворот — попытка шпиона; удался — если игрок на том же ходу стал союзником этого города-государства (признак успеха в событии Nova не заполняет). '
        + 'Освобождения — городов-государств (в скобках — всего, с державами).',
        'Totals over all of the player\'s matches in the selection; “per match” is an average. A coup is a spy\'s attempt; it succeeded if the player became that city-state\'s ally on the same turn (Nova does not fill in the event\'s success flag). '
        + 'Liberations — of city-states (all liberations in brackets).'));
    h += table([th(L('Игрок', 'Player')), th(L('Партий', 'Matches'), true), th(L('Перевороты', 'Coups'), true), th(L('Успех', 'Success'), true),
      th(L('Освобождения', 'Liberations'), true), th(L('Дань золотом', 'Gold tribute'), true), th(L('Дань юнитами', 'Unit tribute'), true),
      th(L('Подарки золотом', 'Gold gifts'), true), th(L('Задания', 'Quests'), true), th(L('Заданий в среднем', 'Quests per match'), true),
      th(L('Покровительство', 'Pledges'), true)],
      list.map(a => '<tr>' + td(linkPlayer(a.name)) + td(a.n, true) + td(a.coupsOk + '/' + a.coups, true) + td(pct(a.coupsOk, a.coups), true)
        + td(a.liberatedCs + ' <small class="dim">(' + a.liberated + ')</small>', true)
        + td(a.tributeGold + ' <small class="dim">· ' + num(a.tributeGoldSum) + '</small>', true) + td(a.tributeUnits, true)
        + td(a.gifts + ' <small class="dim">· ' + num(a.giftsSum) + '</small>', true) + td(a.quests, true) + td(num(a.quests / a.n), true)
        + td(a.pledges, true) + '</tr>'));
    return h;
  }

  const FK = k => 'REPLAYDATASET_' + k;
  const fin = (r, k) => (r.pc.final || {})[FK(k)];

  function secWar(rows) {
    const list = perPlayer(rows, (a, r) => {
      const w = r.pc.war || {};
      const kills = fin(r, 'NUMKILLEDUNITS'), lost = fin(r, 'NUMLOSTUNITS');
      a.kills = (a.kills || 0) + (kills ?? w.kills ?? 0);
      a.lost = (a.lost || 0) + (lost ?? 0);
      a.lostKnown = (a.lostKnown || 0) + (lost != null ? 1 : 0);
      a.barb = (a.barb || 0) + (w.killsBarb || 0);
      a.cs = (a.cs || 0) + (w.killsCs || 0);
      a.major = (a.major || 0) + (w.killsMajor || 0);
      a.byHumans = (a.byHumans || 0) + (w.lostToHumans || 0);
      a.conq = (a.conq || 0) + (fin(r, 'CONQUEREDCITIES') || 0);
    }).sort((a, b) => b.kills / b.n - a.kills / a.n);
    const k = list.reduce((s, a) => s + a.kills, 0), l = list.reduce((s, a) => s + a.lost, 0);
    let h = '<div class="badges"><div><b>' + num(k) + '</b><span>' + L('юнитов убито', 'units killed') + '</span></div>'
      + '<div><b>' + num(l) + '</b><span>' + L('юнитов потеряно', 'units lost') + '</span></div>'
      + '<div><b>' + (l ? num(k / l) : '—') + '</b><span>' + L('убито на одного потерянного', 'killed per unit lost') + '</span></div></div>';
    h += '<h2>' + L('Война по игрокам', 'War by player') + '</h2>'
      + intro(L('Убито и потеряно — ряды игры «Убито юнитов» и «Потеряно юнитов» на последнем ходу, пока слотом правил человек. '
        + 'Разбивка по жертвам — по событиям журнала (их игра пишет только за людей): варвары, города-государства, державы. '
        + '«От людей» — сколько юнитов игрока убили другие люди.',
        'Killed and lost — the game\'s “Units killed” and “Units lost” rows on the last turn the slot was human-controlled. '
        + 'The split by victims comes from log events (the game writes them for humans only): barbarians, city-states, major civs. '
        + '“By humans” — how many of the player\'s units other people killed.'));
    h += table([th(L('Игрок', 'Player')), th(L('Партий', 'Matches'), true), th(L('Убито', 'Killed'), true), th(L('Потеряно', 'Lost'), true),
      th(L('Соотношение', 'Ratio'), true), th(L('Убито за партию', 'Killed per match'), true), th(L('Варваров', 'Barbarians'), true),
      th(L('Городов-государств', 'City-states'), true), th(L('Держав', 'Major civs'), true), th(L('Потерь от людей', 'Lost to humans'), true),
      th(L('Захвачено городов', 'Cities conquered'), true)],
      list.map(a => '<tr>' + td(linkPlayer(a.name)) + td(a.n, true) + td(a.kills, true) + td(a.lostKnown ? a.lost : '—', true)
        + td(a.lost ? num(a.kills / a.lost) : '—', true) + td(num(a.kills / a.n), true) + td(a.barb, true) + td(a.cs, true) + td(a.major, true)
        + td(a.byHumans, true) + td(a.conq, true) + '</tr>'));
    return h;
  }

  function secCongress(rows, matches) {
    const res = new Map();
    const proposers = new Map();
    const votes = new Map();
    // Виды — MPVotingSystemProposalTypes (CvVotingClasses.h), названия — как в окне голосования игры.
    const VOTE = [L('Признать иррелевантность (IRR)', 'Concede irrelevance (IRR)'), L('Признать превосходство (CC)', 'Concede to a player (CC)'),
      L('Скрапнуть игру, ничья', 'Scrap the game, draw'), L('Рестарт карты', 'Remap (restart)')];
    for (const x of matches) {
      const names = new Map(x.rows.map(r => [r.pc.slot, r.name]));
      for (const [, slot, key, verdict, kind] of x.c.congress || []) {
        const k = (kind === 'repeal' ? 'repeal:' : '') + key;
        let a = res.get(k);
        if (!a) res.set(k, a = { key, kind, n: 0, yes: 0, no: 0, open: 0 });
        a.n++;
        if (verdict === 1) a.yes++; else if (verdict === 0) a.no++; else a.open++;
        const who = names.get(slot);
        if (who) proposers.set(who, (proposers.get(who) || 0) + 1);
      }
      for (const [, , type, passed] of x.c.votes || []) {
        let a = votes.get(type);
        if (!a) votes.set(type, a = { type, n: 0, yes: 0 });
        a.n++; if (passed) a.yes++;
      }
    }
    const list = [...res.values()].sort((a, b) => b.n - a.n);
    const all = list.reduce((s, a) => s + a.n, 0), yes = list.reduce((s, a) => s + a.yes, 0), no = list.reduce((s, a) => s + a.no, 0);
    let h = '<div class="badges"><div><b>' + all + '</b><span>' + L('предложений в конгресс', 'proposals to the Congress') + '</span></div>'
      + '<div><b>' + yes + '</b><span>' + L('принято', 'passed') + ' · ' + pct(yes, yes + no) + '</span></div>'
      + '<div><b>' + no + '</b><span>' + L('отклонено', 'rejected') + '</span></div></div>';
    h += '<h2>' + L('Конгресс: резолюции', 'Congress: resolutions') + '</h2>'
      + intro(L('Принято — резолюция вступила в силу в ближайшую сессию после предложения (номер предложения игра не пишет, поэтому связь — по виду резолюции). '
        + 'Неизвестно — партия кончилась раньше сессии.',
        'Passed — the resolution came into force at the next session after the proposal (the game does not record the proposal number, so the link is by resolution type). '
        + 'Unknown — the match ended before the session.'));
    h += table([th(L('Резолюция', 'Resolution')), th(L('Вид', 'Kind')), th(L('Предложено', 'Proposed'), true), th(L('Принято', 'Passed'), true),
      th(L('Отклонено', 'Rejected'), true), th(L('Неизвестно', 'Unknown'), true), th(L('Проходимость', 'Pass rate'), true)],
      list.map(a => '<tr>' + td('<b>' + esc(nm(a.key)) + '</b>') + td(a.kind === 'repeal' ? L('отмена', 'repeal') : L('принятие', 'enact'))
        + td(a.n, true) + td(a.yes, true) + td(a.no, true) + td(a.open, true) + td(pct(a.yes, a.yes + a.no), true) + '</tr>'));
    const top = [...proposers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (top.length) h += '<h3>' + L('Чаще всех предлагают', 'Most proposals') + '</h3>' + bars(top.map(([n, v]) => ({ label: n, n: v })), all);
    if (votes.size) {
      h += '<h2>' + L('Голосования игроков', 'Player votes') + '</h2>' + table([th(L('Вид', 'Kind')), th(L('Голосований', 'Votes'), true),
        th(L('Прошло', 'Passed'), true), th(L('Доля', 'Share'), true)],
        [...votes.values()].sort((a, b) => b.n - a.n).map(a => '<tr>' + td(esc(VOTE[a.type] || String(a.type))) + td(a.n, true) + td(a.yes, true) + td(pct(a.yes, a.n), true) + '</tr>'));
    }
    return h;
  }

  function comboTable(rows, keyOf, titleA, titleB, nameA, nameB) {
    const map = new Map();
    for (const r of rows) {
      const k = keyOf(r);
      if (!k) continue;
      const id = k.join('|');
      let a = map.get(id);
      if (!a) map.set(id, a = { k, n: 0, fn: 0, wins: 0 });
      a.n++;
      if (r.fin) { a.fn++; if (r.won) a.wins++; }
    }
    const list = [...map.values()].sort((a, b) => b.n - a.n || b.wins - a.wins).slice(0, 40);
    return table([th(titleA), th(titleB), th(L('Раз', 'Times'), true), th(L('Винрейт', 'Win rate'))],
      list.map(a => tr([td('<b>' + esc(nameA(a.k[0])) + '</b>'), td(esc(nameB(a.k[1]))), td(a.n, true), wrCell(a.wins, a.fn)], a.fn)));
  }

  function secCombos(rows) {
    const ideo = r => { const x = (r.pc.ideology || []).find(i => i[1]); return x ? x[1] : ''; };
    const firstBranch = r => ((r.pc.branches || [])[0] || [])[1] || '';
    let h = intro(L('Сочетания с винрейтом: сколько раз встретилась пара и как часто она побеждала (доигранные партии). Показаны 40 самых частых.',
      'Combinations with a win rate: how often the pair occurred and how often it won (played-out matches). The 40 most frequent are shown.'));
    h += '<h2>' + L('Цивилизация + идеология', 'Civilization + ideology') + '</h2>'
      + comboTable(rows, r => ideo(r) ? [r.civ, ideo(r)] : null, L('Цивилизация', 'Civilization'), L('Идеология', 'Ideology'), civName, nm);
    h += '<h2>' + L('Пантеон + цивилизация', 'Pantheon + civilization') + '</h2>'
      + comboTable(rows, r => r.pc.pantheon ? [r.pc.pantheon[1], r.civ] : null, L('Пантеон', 'Pantheon'), L('Цивилизация', 'Civilization'), nm, civName);
    h += '<h2>' + L('Цивилизация + первая ветка', 'Civilization + first branch') + '</h2>'
      + comboTable(rows, r => firstBranch(r) ? [r.civ, firstBranch(r)] : null, L('Цивилизация', 'Civilization'), L('Первая ветка', 'First branch'), civName, nm);
    return h;
  }

  function secPatch(rows, matches, cj, st, idx) {
    const all = rowsOf(idx, cj, '').rows;
    const versions = versionsOf(idx.matches).slice().sort(vcmp);
    if (versions.length < 2) return '<p class="dim">' + L('Версий мода в данных меньше двух — сравнивать нечего.', 'Fewer than two mod versions in the data — nothing to compare.') + '</p>';
    const since = versions.includes(st.Since) ? st.Since : versions[Math.floor(versions.length / 2)];
    const A = all.filter(r => vcmp(r.m.modVersion, since) < 0), B = all.filter(r => vcmp(r.m.modVersion, since) >= 0);
    let h = '<div class="skin-controls st-controls"><label>' + L('Граница: версия мода', 'Boundary: mod version') + '<select id="st-since">'
      + versions.map(v => '<option' + (v === since ? ' selected' : '') + '>' + esc(v) + '</option>').join('') + '</select></label>'
      + '<span class="dim small skin-count">' + L('до: ', 'before: ') + A.length + L(' участий, с: ', ' appearances, from: ') + B.length + '</span></div>'
      + intro(L('Сравнение выборов до выбранной версии мода и начиная с неё. Фильтр версии сверху здесь не действует. Доля — от участий своей половины; винрейт — по доигранным.',
        'Choices before the selected mod version and from it on. The version filter above does not apply here. The share is of that half\'s appearances; the win rate is over played-out matches.'));
    const compare = (title, keyName, pick) => {
      const ta = new Map(tally(A, pick).map(a => [a.key, a])), tb = new Map(tally(B, pick).map(a => [a.key, a]));
      const keys = [...new Set([...ta.keys(), ...tb.keys()])].sort((x, y) => ((tb.get(y) || {}).n || 0) + ((ta.get(y) || {}).n || 0) - ((tb.get(x) || {}).n || 0) - ((ta.get(x) || {}).n || 0)).slice(0, 25);
      return '<h2>' + title + '</h2>' + table([th(keyName), th(L('Доля до', 'Share before'), true), th(L('Доля с', 'Share from'), true), th(L('Сдвиг', 'Shift'), true),
        th(L('Винрейт до', 'Win rate before')), th(L('Винрейт с', 'Win rate from'))],
        keys.map(k => {
          const a = ta.get(k) || { n: 0, wins: 0, fn: 0 }, b = tb.get(k) || { n: 0, wins: 0, fn: 0 };
          const sa = A.length ? 100 * a.n / A.length : 0, sb = B.length ? 100 * b.n / B.length : 0;
          const d = Math.round(sb - sa);
          return tr([td('<b>' + esc(nm(k)) + '</b>'), td(pct(a.n, A.length), true), td(pct(b.n, B.length), true),
            td((d > 0 ? '+' : '') + d + L(' п.', ' pt'), true), wrCell(a.wins, a.fn), wrCell(b.wins, b.fn)], Math.min(a.fn, b.fn));
        }));
    };
    h += compare(L('Первая ветка', 'First branch'), L('Ветка', 'Branch'), r => (r.pc.branches || []).slice(0, 1));
    h += compare(L('Идеология', 'Ideology'), L('Идеология', 'Ideology'), r => { const x = (r.pc.ideology || []).find(i => i[1]); return x ? [[x[0], x[1]]] : []; });
    h += compare(L('Пантеон', 'Pantheon'), L('Пантеон', 'Pantheon'), r => r.pc.pantheon ? [r.pc.pantheon] : []);
    h += compare(L('Чудеса', 'Wonders'), L('Чудо', 'Wonder'), r => r.pc.wonders || []);
    return {
      html: h,
      after: () => S.$('#st-since').addEventListener('change', e => replace(Object.assign({}, st, { Since: e.target.value }))),
    };
  }

  function secRaces(rows, matches) {
    const CATS = [
      ['pantheon', L('Первый пантеон', 'First pantheon'), r => r.pc.pantheon ? r.pc.pantheon[0] : null],
      ['religion', L('Первая религия', 'First religion'), r => r.pc.religion ? r.pc.religion[0] : null],
      ['wonder', L('Первое чудо', 'First wonder'), r => (r.pc.wonders || []).length ? Math.min(...r.pc.wonders.map(w => w[0])) : null],
      ['ideology', L('Первая идеология', 'First ideology'), r => { const x = (r.pc.ideology || []).find(i => i[1]); return x ? x[0] : null; }],
      ['renaissance', L('Первым в Новое время', 'First into the Renaissance'), r => { const x = (r.pc.eras || []).find(e => e[1] === 'ERA_RENAISSANCE'); return x ? x[0] : null; }],
    ];
    let h = intro(L('Гонка — кто в партии сделал это раньше всех (на одном ходу — все, кто успел). «Выиграл партию» — как часто победитель гонки потом побеждал в партии (доигранные).',
      'A race — who did it first in the match (on the same turn — everyone who made it). “Won the match” — how often the race winner went on to win (played-out matches).'));
    for (const [, title, turnOf] of CATS) {
      const firsts = [];
      const per = new Map();
      let won = 0, fn = 0;
      for (const x of matches) {
        const ts = x.rows.map(r => ({ r, t: turnOf(r) })).filter(z => z.t != null);
        if (!ts.length) continue;
        const t0 = Math.min(...ts.map(z => z.t));
        firsts.push(t0);
        ts.filter(z => z.t === t0).forEach(z => {
          let a = per.get(z.r.name);
          if (!a) per.set(z.r.name, a = { name: z.r.name, first: 0 });
          a.first++;
          if (z.r.fin) { fn++; if (z.r.won) won++; }
        });
      }
      const inMatches = new Map();
      rows.forEach(r => inMatches.set(r.name, (inMatches.get(r.name) || 0) + 1));
      const list = [...per.values()].sort((a, b) => b.first - a.first).slice(0, 10);
      h += '<h2>' + title + '</h2><p class="small dim">' + L('Партий с гонкой: ', 'Matches with the race: ') + firsts.length
        + L(' · средний ход победы в гонке: ', ' · average winning turn: ') + num(avg(firsts)) + L(' · самый ранний: ', ' · earliest: ') + (firsts.length ? Math.min(...firsts) : '—')
        + L(' · победитель гонки выиграл партию: ', ' · race winner won the match: ') + pct(won, fn) + ' <small>(' + won + '/' + fn + ')</small></p>'
        + table([th(L('Игрок', 'Player')), th(L('Первым', 'First'), true), th(L('Из партий', 'Of matches'), true), th(L('Доля', 'Share'), true)],
          list.map(a => '<tr>' + td(linkPlayer(a.name)) + td(a.first, true) + td(inMatches.get(a.name) || 0, true) + td(pct(a.first, inMatches.get(a.name) || 0), true) + '</tr>'));
    }
    return h;
  }

  function secFinish(rows, matches) {
    const withCtl = matches.filter(x => x.c.control);
    const rs = withCtl.flatMap(x => x.rows);
    const left = r => r.pc.left && !r.pc.left[2];
    const n = rs.length, l = rs.filter(left).length;
    const list = perPlayer(rs, (a, r) => { a.left = (a.left || 0) + (left(r) ? 1 : 0); a.dead = (a.dead || 0) + (!left(r) && !r.p.isAlive ? 1 : 0); })
      .sort((a, b) => b.left / b.n - a.left / a.n || b.n - a.n);
    const turnsLeft = rs.filter(left).map(r => r.pc.left[0] / Math.max(1, r.m.turns || r.pc.left[0]));
    let h = '<div class="badges"><div><b>' + withCtl.length + '</b><span>' + L('партий с отметками выхода', 'matches with leave marks') + '</span></div>'
      + '<div><b>' + pct(n - l, n) + '</b><span>' + L('участий доиграно до конца', 'appearances played to the end') + '</span></div>'
      + '<div><b>' + l + '</b><span>' + L('уходов до конца', 'early leaves') + '</span></div>'
      + '<div><b>' + (turnsLeft.length ? Math.round(100 * avg(turnsLeft)) + '%' : '—') + '</b><span>' + L('партии позади в среднем при уходе', 'of the match played, on average, when leaving') + '</span></div></div>';
    h += '<h2>' + L('Кто чаще уходит до конца', 'Who leaves early most often') + '</h2>'
      + intro(L('Ушёл — вышел или выпал из партии и не вернулся, пока его держава была жива и партия шла (за него доигрывал ИИ). '
        + 'Выбывший (держава уничтожена) — не ушёл. Отметки выхода пишет ядро мода с 1.5.142; более старые партии здесь не учитываются. '
        + 'Ушедшим считается то, что видело большинство машин: у потерявшего связь «вышли» все остальные.',
        'Left — quit or dropped out and did not come back while their civilization was alive and the match went on (the AI played for them). '
        + 'Eliminated is not “left”. The mod core records leave marks since 1.5.142; older matches are not counted here. '
        + 'A leave counts only if most machines saw it: to someone who lost connection, everybody else “left”.'));
    h += table([th(L('Игрок', 'Player')), th(L('Партий', 'Matches'), true), th(L('Ушёл до конца', 'Left early'), true), th(L('Доля', 'Share'), true),
      th(L('Выбыл', 'Eliminated'), true), th(L('Доиграл', 'Played out'), true)],
      list.map(a => '<tr>' + td(linkPlayer(a.name)) + td(a.n, true) + td(a.left, true) + td(pct(a.left, a.n), true) + td(a.dead, true)
        + td(a.n - a.left - a.dead, true) + '</tr>'));
    return h;
  }

  function secCurve(rows, matches, cj, st) {
    const keys = cj.curveKeys || [];
    const ds = keys.includes(st.Dataset) ? st.Dataset : keys[0];
    const step = cj.curveStep || 10;
    const div = divOf(ds);
    const finRows = rows.filter(r => r.fin);
    const lineOf = (list, label, color, strong) => {
      const sums = [], cnt = [];
      for (const r of list) {
        const v = (r.pc.curve || {})[ds];
        if (!v) continue;
        v.forEach((x, i) => { sums[i] = (sums[i] || 0) + x; cnt[i] = (cnt[i] || 0) + 1; });
      }
      const turns = [], values = [];
      sums.forEach((s, i) => { if (cnt[i] >= 3) { turns.push(i * step); values.push(s / cnt[i] / div); } });
      return { label, sub: list.length + ' ' + word(list.length, 'участие', 'участия', 'участий', 'appearance', 'appearances'), color, strong, turns, values };
    };
    const winners = finRows.filter(r => r.won), others = finRows.filter(r => !r.won);
    const h = '<div class="skin-controls st-controls"><label>' + L('Показатель', 'Data set') + '<select id="st-curve">'
      + keys.map(k => '<option value="' + esc(k) + '"' + (k === ds ? ' selected' : '') + '>' + esc(dsTitle(k)) + '</option>').join('')
      + '</select></label></div>'
      + intro(L('Среднее значение показателя по ходам у победителей и у всех остальных людей (доигранные партии; после ухода человека его ряд не берётся). '
        + 'Точка рисуется, если на этом ходу есть хотя бы три участия.',
        'The average of the data set by turn for winners and for all other people (played-out matches; a person\'s row stops when they leave). '
        + 'A point is drawn when at least three appearances reach that turn.'))
      + '<div id="st-curve-chart" class="st-chart"></div>';
    return {
      html: h,
      after: () => {
        S.$('#st-curve').addEventListener('change', e => replace(Object.assign({}, st, { Dataset: e.target.value })));
        lineChart(S.$('#st-curve-chart'), {
          title: dsTitle(ds),
          lines: [lineOf(winners, L('Победители', 'Winners'), WIN, true), lineOf(others, L('Остальные', 'Others'), PALETTE[1], false)],
        });
      },
    };
  }

  const SECTIONS = [
    ['Policies', L('Политики', 'Policies'), secPolicies],
    ['Ideologies', L('Идеологии', 'Ideologies'), secIdeologies],
    ['Religion', L('Религия', 'Religion'), secReligion],
    ['Wonders', L('Чудеса', 'Wonders'), secWonders],
    ['Techs', L('Технологии', 'Technologies'), secTechs],
    ['Draft', L('Драфт', 'Draft'), secDraft],
    ['GreatPeople', L('Великие люди', 'Great people'), secGreatPeople],
    ['CityStates', L('Города-государства', 'City-states'), secCityStates],
    ['War', L('Война', 'War'), secWar],
    ['Congress', L('Конгресс', 'Congress'), secCongress],
    ['Combos', L('Сочетания', 'Combinations'), secCombos],
    ['Patch', L('До и после патча', 'Before and after a patch'), secPatch],
    ['Races', L('Гонки', 'Races'), secRaces],
    ['Finish', L('Доигрываемость', 'Playing it out'), secFinish],
    ['Curve', L('Кривая партии', 'Match curve'), secCurve],
  ];

  function noData(res) {
    return '<div class="note">' + (res && res.missing
      ? L('Сводка выборов игроков ещё не выложена: её выгрузка появляется вместе со следующим срезом статистики.',
        'The player-choices summary has not been published yet: it arrives with the next statistics export.')
      : L('Сводку выборов игроков сейчас получить не удалось. Попробуйте обновить страницу позже.',
        'The player-choices summary could not be loaded right now. Try again later.')) + '</div>';
  }

  function header(st, idx, cj, ver, versions, rows, matches) {
    return '<div class="skin-controls st-controls"><label>' + L('Версия мода', 'Mod version')
      + '<select id="st-ver"><option value="">' + L('Все версии', 'All versions') + '</option>'
      + versions.map(v => '<option' + (v === ver ? ' selected' : '') + '>' + esc(v) + '</option>').join('')
      + '</select></label><span class="dim small skin-count">' + matches.length + ' ' + word(matches.length, 'партия', 'партии', 'партий', 'match', 'matches')
      + ' · ' + rows.length + ' ' + word(rows.length, 'участие', 'участия', 'участий', 'appearance', 'appearances') + L(' людей', ' by people')
      + (cj.generated ? L(' · данные на ', ' · data as of ') + esc(S.shortDate(cj.generated)) : '') + '</span></div>';
  }

  async function renderChoices(st, idx, token) {
    const app = S.$('#stats-app');
    const res = await choices();
    if (token !== S.current()) return;
    if (!res.ok) { app.innerHTML = S.tabs(st) + noData(res); return; }
    const cj = res.data;
    const versions = versionsOf(idx.matches);
    const ver = versions.includes(st.Version) ? st.Version : '';
    const { rows, matches } = rowsOf(idx, cj, ver);
    const sec = SECTIONS.find(s => s[0] === st.Section) || SECTIONS[0];
    const nav = '<nav class="filters st-tabs st-sub" aria-label="' + esc(L('Разделы выборов', 'Choice sections')) + '">'
      + SECTIONS.map(([k, title]) => '<a href="' + esc(hashOf(Object.assign({}, st, { Section: k }))) + '"'
        + (k === sec[0] ? ' aria-current="page"' : '') + '>' + title + '</a>').join('') + '</nav>';
    let body;
    try { body = sec[2](rows, matches, cj, st, idx); } catch (e) { console.error(e); body = '<div class="note stop">' + esc(L('Раздел не построился: ', 'The section failed to build: ') + e.message) + '</div>'; }
    app.innerHTML = S.tabs(st) + header(st, idx, cj, ver, versions, rows, matches) + nav
      + (rows.length ? (typeof body === 'string' ? body : body.html) : '<p class="dim">' + L('В выбранных партиях выборов нет.', 'There are no choices in the selected matches.') + '</p>');
    S.$('#st-ver').addEventListener('change', e => replace(Object.assign({}, st, { Version: e.target.value || undefined })));
    if (rows.length && body && body.after) body.after();
  }

  /* ------------------------------------------------ рекорды: общие части */

  /* Карты партий (replay.html). Список партий с картой лежит рядом со статистикой —
     <base>replay/index.json; stats.js читает его же, но наружу не отдаёт, поэтому здесь
     свой ленивый запрос. Нет списка (режим live, сбой) — нет и ссылок, остальное работает. */
  const KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{8}$/;
  let MAPS = new Set();
  let mapsP = null;
  function mapIds() {
    if (!mapsP) mapsP = (async () => {
      const src = await source();
      if (src.problem || src.mode !== 'static') return MAPS;
      try {
        const j = await getJson(src.base + 'replay/index.json');
        if (j && Array.isArray(j.matches)) MAPS = new Set(j.matches.map(x => x && x.id).filter(id => KEY_RE.test(id || '')));
      } catch (e) { console.warn(e); }
      return MAPS;
    })();
    return mapsP;
  }
  const mapLink = m => MAPS.has(m.key) ? ' <a class="st-map-s" href="' + esc(NOVA.BASE + 'replay.html#m=' + encodeURIComponent(m.key)) + '" title="'
    + esc(L('Карта партии по ходам', 'Match map by turn (in Russian)')) + '">' + L('карта', 'map') + '</a>' : '';
  /* «№12 · карта» — короткая ссылка на партию для строк рекордов. */
  const matchRef = m => linkMatch(m, m.no ? L('№', '#') + m.no : '') + mapLink(m);

  /* Показатели одной партии человека. Ряды игры — на последнем ходу, пока слотом правил
     человек (final), события войны — из журнала (war), очки и изменение рейтинга — из
     строки игрока в списке партий. null — показателя в этой партии нет. */
  const nz = v => typeof v === 'number' && isFinite(v) ? v : null;
  const warOf = r => r.pc.war || {};
  const peakOf = (r, k) => { const v = (r.pc.peaks || {})[FK(k)]; return v && nz(v[0]) != null ? v[0] / divOf(FK(k)) : null; };
  const signed = v => (v > 0 ? '+' : '') + num(v);
  const killsOf = r => nz(fin(r, 'NUMKILLEDUNITS') ?? warOf(r).kills);
  const lostOf = r => nz(fin(r, 'NUMLOSTUNITS'));
  const METRICS = [
    { id: 'kills', card: true, t: L('Убито юнитов', 'Units killed'), v: killsOf },
    { id: 'major', card: true, t: L('Убито юнитов людей', 'Human units killed'), v: r => nz(warOf(r).killsMajor) },
    { id: 'conq', card: true, t: L('Захвачено городов', 'Cities conquered'), v: r => nz(fin(r, 'CONQUEREDCITIES')) },
    { id: 'wonders', card: true, t: L('Построено чудес', 'Wonders built'), v: r => (r.pc.wonders || []).length },
    { id: 'quests', card: true, t: L('Заданий городов-государств', 'City-state quests'), v: r => nz(fin(r, 'CSQUESTSCOMPLETED')) },
    { id: 'bully', card: true, t: L('Золота данью с городов-государств', 'Gold extorted from city-states'), v: r => nz(fin(r, 'GOLDFROMBULLYING')) },
    { id: 'allied', card: true, t: L('Союзных городов-государств к концу', 'Allied city-states at the end'), v: r => nz(fin(r, 'ALLIEDCS')) },
    { id: 'score', card: true, t: L('Очки', 'Score'), v: r => nz(r.p.score) },
    { id: 'rating', card: true, t: L('Прирост рейтинга', 'Rating gain'), v: r => nz(r.p.ratingDelta), fmt: signed },
    { id: 'science', t: L('Наука за ход, пик', 'Science per turn, peak'), v: r => peakOf(r, 'SCIENCEPERTURN') },
    { id: 'culture', t: L('Культура за ход, пик', 'Culture per turn, peak'), v: r => peakOf(r, 'CULTUREPERTURN') },
  ];

  /* Лучшие по показателю: по убыванию (asc — по возрастанию), при равенстве выше тот, кто
     сделал это раньше. По убыванию нули не берутся: «рекорд 0» — не рекорд. n=0 — весь список. */
  function top(rows, f, n, asc) {
    const list = [];
    for (const r of rows) { const v = f(r); if (v != null && (asc || v > 0)) list.push({ r, v }); }
    list.sort((a, b) => (asc ? a.v - b.v : b.v - a.v) || String(a.r.m.at).localeCompare(String(b.r.m.at)));
    return n ? list.slice(0, n) : list;
  }

  /* Голосования игроков (MPVotingSystemProposalTypes): 1 — «признать превосходство» (CC),
     2 — «скрапнуть игру» (ничья). Партия со скрапом формально бывает «доиграна с победой»,
     но это не победа — в быстрейшие победы и в «победу с наименьшими потерями» не идёт. */
  const votePassed = (r, type) => (r.c.votes || []).some(v => v && v[2] === type && v[3]);
  const realWin = r => r.won && r.m.turns > 0 && !votePassed(r, 2);
  const CC_TAG = ' <span class="tag" title="' + esc(L('Партия кончилась голосованием «признать превосходство»: соперники уступили',
    'The match ended with a “concede to a player” vote: the rivals conceded')) + '">CC</span>';
  const turnsFmt = v => num(v) + ' ' + word(v, 'ход', 'хода', 'ходов', 'turn', 'turns');
  const winsPool = rows => rows.filter(realWin).map(r => ({ r, v: r.m.turns }));

  const whoLine = (r, extra) => linkPlayer(r.name) + '<small>' + esc(civName(r.civ)) + ' · ' + matchRef(r.m) + (extra || '') + '</small>';
  function recCard(title, hint, list, fmt, extraOf) {
    const f = fmt || num;
    return '<section class="card"><h3>' + title + '</h3>' + (hint ? '<p class="small dim">' + hint + '</p>' : '')
      + (list.length ? '<ol class="st-rec">' + list.map((x, i) => '<li><span class="n">' + (i + 1) + '</span><span class="w">'
        + whoLine(x.r, extraOf ? extraOf(x) : '') + '</span><span class="v">' + f(x.v) + '</span></li>').join('') + '</ol>'
        : '<p class="dim">' + L('Нет данных.', 'No data.') + '</p>') + '</section>';
  }

  /* ---------------------------------------------------------- зал славы */

  function renderFameBody(rows, matches, cj) {
    let h = '<h2>' + L('Рекорды за партию', 'Single-match records') + '</h2>'
      + intro(L('Пять лучших результатов одной партии по каждому показателю. Один игрок может стоять в списке несколько раз — это разные партии. '
        + 'Убито, потеряно, захвачено, задания, дань и союзники — ряды игры на последнем ходу, пока слотом правил человек; «юниты людей» — юниты других держав '
        + 'по событиям журнала (в партиях Nova все державы — люди, за ушедшего доигрывает ИИ). Чудеса — построенные самим игроком. Средние за партию — в «Номинациях» ниже.',
        'The top five results of a single match for each data set. One player can appear several times — those are different matches. '
        + 'Killed, lost, conquered, quests, tribute and allies are the game\'s data rows on the last turn the slot was human-controlled; “human units” are units of other major civs '
        + 'from the log events (in Nova matches every major civ is a person; the AI plays on for someone who left). Wonders — built by the player. Per-match averages are in “Awards” below.'))
      + '<div class="st-recs">' + METRICS.filter(x => x.card).map(x => recCard(x.t, '', top(rows, x.v, 5), x.fmt)).join('')
      + recCard(L('Победа с наименьшими потерями', 'Win with the fewest losses'),
        L('Потеряно юнитов у победителя доигранной партии.', 'Units lost by the winner of a played-out match.'),
        top(rows.filter(realWin), lostOf, 5, true), num,
        x => ' · ' + L('убито ', 'killed ') + num(killsOf(x.r)) + ' · ' + turnsFmt(x.r.m.turns) + (votePassed(x.r, 1) ? CC_TAG : ''))
      + '</div>';

    // Быстрейшие победы — по типу победы.
    const byType = new Map();
    for (const x of winsPool(rows)) {
      const k = x.r.m.victoryType || '';
      if (!byType.has(k)) byType.set(k, []);
      byType.get(k).push(x);
    }
    const fast = [...byType.entries()].map(([k, list]) => [k, list.sort((a, b) => a.v - b.v || String(a.r.m.at).localeCompare(String(b.r.m.at))).slice(0, 3)])
      .sort((a, b) => a[1][0].v - b[1][0].v);
    h += '<h2>' + L('Быстрейшие победы', 'Fastest wins') + '</h2>'
      + intro(L('Меньше всего ходов до победы, отдельно по каждому типу победы; только доигранные партии. Партии, свёрнутые голосованием «скрапнуть игру», '
        + 'и партии без итога в журналах не считаются. Метка CC — партия кончилась голосованием «признать превосходство»: соперники уступили.',
        'The fewest turns to victory, for each victory type separately; played-out matches only. Matches scrapped by a vote '
        + 'and matches with no result in the logs are left out. The CC mark means the match ended with a “concede to a player” vote: the rivals conceded.'))
      + '<div class="st-recs">' + fast.map(([k, list]) => recCard(esc(S.victoryName(k)), '', list, turnsFmt, x => votePassed(x.r, 1) ? CC_TAG : '')).join('') + '</div>';

    // Рекорды за ход.
    h += '<h2>' + L('Рекорды за ход', 'Single-turn records') + '</h2>'
      + intro(L('Наибольшее значение показателя на одном ходу за всю выборку — пока слотом правил человек.',
        'The highest value of the data set on a single turn across the selection — while the slot was human-controlled.'));
    const recs = (cj.peakKeys || []).map(k => {
      let best = null;
      for (const r of rows) {
        const v = (r.pc.peaks || {})[k];
        if (v && (!best || v[0] > best.v)) best = { v: v[0], t: v[1], r };
      }
      return { k, best };
    }).filter(x => x.best);
    h += table([th(L('Показатель', 'Data set')), th(L('Рекорд', 'Record'), true), th(L('Кто', 'Who')), th(L('Ход', 'Turn'), true), th(L('Партия', 'Match'))],
      recs.map(x => '<tr>' + td('<b>' + esc(dsTitle(x.k)) + '</b>') + td(num(x.best.v / divOf(x.k)), true)
        + td(linkPlayer(x.best.r.name) + ' <small class="dim">' + esc(civName(x.best.r.civ)) + '</small>') + td(x.best.t, true) + td(linkMatch(x.best.r.m)) + '</tr>'));

    // Шуточные номинации: СРЕДНЕЕ на одну партию, у кого не меньше трёх партий.
    // Средних путали с рекордами («Мясник 134,5» читали как рекорд партии), поэтому
    // «в среднем» стоит и в заголовке, и у числа, а рекорд одной партии — внизу карточки.
    const MIN = 3;
    const per = (key) => perPlayer(rows, (a, r) => {
      const v = fin(r, key);
      if (v == null) return;
      a.sum = (a.sum || 0) + v; a.k = (a.k || 0) + 1;
    }).filter(a => (a.k || 0) >= MIN);
    const NOM = [
      ['NUMTIMESOPENEDDEMOGRAPHICS', L('Главный по демографии', 'Chief demographer'), L('чаще всех открывает демографию (F9)', 'opens the demographics (F9) most often')],
      ['TIMESENTEREDCITYSCREEN', L('Градоначальник', 'The mayor'), L('чаще всех заходит в окно города', 'enters the city screen most often')],
      ['GOLDFROMBULLYING', L('Сборщик дани', 'Tax collector'), L('больше всех золота дани с городов-государств', 'most gold extorted from city-states')],
      ['CSQUESTSCOMPLETED', L('Посыльный', 'The courier'), L('больше всех заданий городов-государств', 'most city-state quests')],
      ['NUMKILLEDUNITS', L('Мясник', 'The butcher'), L('больше всех убитых юнитов', 'most units killed')],
    ];
    const AVG_NOTE = L('в среднем за партию (не меньше ' + MIN + ' партий)', 'average per match (at least ' + MIN + ' matches)');
    h += '<h2>' + L('Номинации', 'Awards') + '</h2>' + intro(L('Номинации — это СРЕДНЕЕ за партию, а не рекорд одной партии. В зачёт — игроки, у кого в выборке не меньше '
      + MIN + ' партий с этим показателем. Внизу карточки — рекорд одной партии по тому же показателю (среди всех игроков).',
      'Awards are an AVERAGE per match, not a single-match record. Only players with at least ' + MIN
      + ' matches with this data set in the selection count. At the bottom of each card is the single-match record for the same data set (among all players).'))
      + '<div class="st-people st-awards">';
    for (const [key, title, what] of NOM) {
      const list = per(key).sort((a, b) => b.sum / b.k - a.sum / a.k);
      if (!list.length) continue;
      const w = list[0];
      const rec = top(rows, r => nz(fin(r, key)), 1)[0];
      h += '<div class="card"><h3>' + title + '<small>' + AVG_NOTE + '</small></h3><p>' + what + '</p>'
        + '<p><b>' + linkPlayer(w.name) + '</b> — <b class="st-nom-v">' + num(w.sum / w.k) + '</b> ' + L('в среднем за партию', 'per match on average')
        + ' <span class="dim">(' + w.k + ' ' + word(w.k, 'партия', 'партии', 'партий', 'match', 'matches') + ')</span></p>'
        + (list.length > 1 ? '<p class="small dim">' + list.slice(1, 3).map(a => esc(a.name) + ' — ' + num(a.sum / a.k)).join(' · ') + '</p>' : '')
        + (rec ? '<p class="small st-nom-rec">' + L('Рекорд одной партии: ', 'Single-match record: ') + '<b>' + num(rec.v) + '</b> — '
          + linkPlayer(rec.r.name) + ', ' + matchRef(rec.r.m) + '</p>' : '') + '</div>';
    }
    h += '</div>';

    // За всё время — суммы по партиям выборки.
    const sumTop = f => perPlayer(rows, (a, r) => { const v = f(r); if (v != null) { a.s = (a.s || 0) + v; a.k = (a.k || 0) + 1; } })
      .filter(a => a.s > 0).sort((a, b) => b.s - a.s || a.k - b.k).slice(0, 5);
    const TOTALS = [
      [L('Побед', 'Wins'), r => r.fin ? (r.won ? 1 : 0) : null, (s, k) => L(' доиграно · винрейт ', ' played out · win rate ') + pct(s, k)],
      [L('Построено чудес', 'Wonders built'), METRICS[3].v],
      [L('Убито юнитов', 'Units killed'), killsOf],
      [L('Захвачено городов', 'Cities conquered'), METRICS[2].v],
    ];
    const perMatch = (s, k) => ' ' + word(k, 'партия', 'партии', 'партий', 'match', 'matches') + L(' · в среднем ', ' · avg ') + num(s / k);
    h += '<h2>' + L('За всё время', 'All-time totals') + '</h2>'
      + intro(L('Суммы по всем партиям игрока в выборке; рядом — сколько партий и среднее на партию (у побед — доигранные партии и винрейт).',
        'Totals over all of the player\'s matches in the selection; next to it — how many matches and the per-match average (for wins — played-out matches and the win rate).'))
      + '<div class="st-recs">' + TOTALS.map(([title, f, sub]) => {
        const list = sumTop(f);
        return '<section class="card"><h3>' + title + '</h3>' + (list.length ? '<ol class="st-rec">' + list.map((a, i) => '<li><span class="n">' + (i + 1)
          + '</span><span class="w">' + linkPlayer(a.name) + '<small>' + a.k + (sub || perMatch)(a.s, a.k)
          + (a.k < SMALL_SAMPLE && sub ? ' ' + SMALL : '') + '</small></span><span class="v">' + num(a.s) + '</span></li>').join('') + '</ol>'
          : '<p class="dim">' + L('Нет данных.', 'No data.') + '</p>') + '</section>';
      }).join('') + '</div>';
    return h;
  }

  async function renderFame(st, idx, token) {
    const app = S.$('#stats-app');
    const [res] = await Promise.all([choices(), mapIds()]);
    if (token !== S.current()) return;
    if (!res.ok) { app.innerHTML = S.tabs(st) + noData(res); return; }
    const versions = versionsOf(idx.matches);
    const ver = versions.includes(st.Version) ? st.Version : '';
    const { rows, matches } = rowsOf(idx, res.data, ver);
    app.innerHTML = S.tabs(st) + header(st, idx, res.data, ver, versions, rows, matches)
      + (rows.length ? renderFameBody(rows, matches, res.data) : '<p class="dim">' + L('В выбранных партиях данных нет.', 'No data in the selected matches.') + '</p>');
    S.$('#st-ver').addEventListener('change', e => replace(Object.assign({}, st, { Version: e.target.value || undefined })));
  }

  /* ----------------------------------------------------- почерк игрока */

  /* Личные рекорды: лучший результат игрока за одну партию по каждому показателю и место
     этого результата среди всех участий на сайте. */
  function personalRecords(mine, all, cj) {
    const placeOf = (best, pool, asc) => 1 + pool.filter(x => asc ? x.v < best.v : x.v > best.v).length;
    const placeCell = (place, n) => td(place + L(' из ', ' of ') + n + (place === 1 ? ' <span class="tag st-top">' + L('рекорд сайта', 'site record') + '</span>' : ''), true);
    const line = (title, best, pool, asc, fmt, extra) => !best ? '' : '<tr>' + td('<b>' + title + '</b>') + td((fmt || num)(best.v) + (extra || ''), true)
      + td(esc(civName(best.r.civ))) + td(matchRef(best.r.m)) + placeCell(placeOf(best, pool, asc), pool.length) + '</tr>';
    const byTurns = (a, b) => a.v - b.v || String(a.r.m.at).localeCompare(String(b.r.m.at));
    const myWins = winsPool(mine).sort(byTurns), allWins = winsPool(all);
    const lostMine = top(mine.filter(realWin), lostOf, 1, true)[0];
    let body = METRICS.map(x => line(x.t, top(mine, x.v, 1)[0], top(all, x.v, 0), false, x.fmt)).join('')
      + line(L('Самая быстрая победа', 'Fastest win'), myWins[0], allWins, true, turnsFmt,
        myWins[0] ? ' <small class="dim">' + esc(S.victoryName(myWins[0].r.m.victoryType)) + '</small>' + (votePassed(myWins[0].r, 1) ? CC_TAG : '') : '')
      + line(L('Победа с наименьшими потерями', 'Win with the fewest losses'), lostMine, top(all.filter(realWin), lostOf, 0, true), true, num);
    let h = '<h2>' + L('Личные рекорды', 'Personal records') + '</h2>'
      + intro(L('Лучший результат игрока за одну партию по каждому показателю (все версии мода). «Место» — где этот результат стоит среди участий людей на сайте, '
        + 'в которых показатель вообще был (больше нуля; у прироста рейтинга — только партии с приростом); '
        + 'быстрейшая победа — по любому типу, без партий, свёрнутых голосованием.',
        'The player\'s best result in a single match for each data set (all mod versions). “Rank” is where this result stands among human appearances on the site '
        + 'where the data set occurred at all (above zero; for the rating gain — only matches with a gain); '
        + 'the fastest win is of any type, without matches scrapped by a vote.'))
      + table([th(L('Показатель', 'Data set')), th(L('Рекорд', 'Record'), true), th(L('Цивилизация', 'Civilization')), th(L('Партия', 'Match')),
        th(L('Место', 'Rank'), true)], body ? [body] : []);
    const peaks = (cj.peakKeys || []).map(k => {
      const f = r => { const v = (r.pc.peaks || {})[k]; return v && nz(v[0]) != null ? v[0] / divOf(k) : null; };
      const best = top(mine, f, 1)[0];
      if (!best) return '';
      const pool = top(all, f, 0);
      return '<tr>' + td('<b>' + esc(dsTitle(k)) + '</b>') + td(num(best.v), true) + td(num(nz(((best.r.pc.peaks || {})[k] || [])[1])), true)
        + td(esc(civName(best.r.civ))) + td(matchRef(best.r.m)) + placeCell(placeOf(best, pool, false), pool.length) + '</tr>';
    }).join('');
    if (peaks) h += '<h3>' + L('Лучшее за один ход', 'Best on a single turn') + '</h3>'
      + table([th(L('Показатель', 'Data set')), th(L('Рекорд', 'Record'), true), th(L('Ход', 'Turn'), true), th(L('Цивилизация', 'Civilization')),
        th(L('Партия', 'Match')), th(L('Место', 'Rank'), true)], [peaks]);
    return h;
  }

  async function playerHand(me, idx, host, token) {
    if (!host) return;
    const [res] = await Promise.all([choices(), mapIds()]);
    if (token !== S.current() || !res.ok) return;
    const cj = res.data;
    const allRows = rowsOf(idx, cj, '').rows;
    const rows = allRows.filter(r => r.name === me.name);
    if (!rows.length) return;
    const mode = (list, keyOf) => {
      const m = new Map();
      list.forEach(r => { const k = keyOf(r); if (k) m.set(k, (m.get(k) || 0) + 1); });
      const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
      return top ? { k: top[0], n: top[1] } : null;
    };
    const winOf = (keyOf, k) => { const f = rows.filter(r => r.fin && keyOf(r) === k); return pct(f.filter(r => r.won).length, f.length); };
    const firstBranch = r => ((r.pc.branches || [])[0] || [])[1] || '';
    const ideo = r => { const x = (r.pc.ideology || []).find(i => i[1]); return x ? x[1] : ''; };
    const pan = r => r.pc.pantheon ? r.pc.pantheon[1] : '';
    const wonder = mode(rows.flatMap(r => (r.pc.wonders || []).map(w => ({ w: w[1] }))), x => x.w);
    const cards = [
      [L('Первая ветка', 'First branch'), mode(rows, firstBranch), firstBranch, nm],
      [L('Идеология', 'Ideology'), mode(rows, ideo), ideo, nm],
      [L('Пантеон', 'Pantheon'), mode(rows, pan), pan, nm],
      [L('Цивилизация', 'Civilization'), mode(rows, r => r.civ), r => r.civ, civName],
    ];
    let h = '<h2>' + L('Почерк', 'Playing style') + '</h2>' + intro(L('Что игрок выбирает чаще всего — по ' + rows.length + ' партиям со сводкой выборов; рядом — его винрейт с этим выбором (доигранные партии).',
      'What the player picks most often — over ' + rows.length + ' matches with a choices summary; next to it, their win rate with that pick (played-out matches).'))
      + '<div class="st-people st-hand">';
    for (const [title, top, keyOf, name] of cards) {
      if (!top) continue;
      h += '<div class="card"><h3>' + title + '</h3><p><b>' + esc(name(top.k)) + '</b></p><p class="small dim">' + top.n + L(' из ', ' of ') + rows.length
        + L(' · винрейт ', ' · win rate ') + winOf(keyOf, top.k) + '</p></div>';
    }
    if (wonder) h += '<div class="card"><h3>' + L('Чудо', 'Wonder') + '</h3><p><b>' + esc(nm(wonder.k)) + '</b></p><p class="small dim">'
      + L('построено ', 'built ') + wonder.n + L(' раз', ' times') + '</p></div>';
    const pol = tally(rows, r => (r.pc.policies || []).filter(([, k]) => !isIdeo(cj, k))).slice(0, 5);
    if (pol.length) h += '<div class="card"><h3>' + L('Любимые политики', 'Favourite policies') + '</h3><p class="small">'
      + pol.map(a => esc(nm(a.key)) + ' <span class="dim">' + a.n + '</span>').join('<br>') + '</p></div>';
    h += '</div>';
    h += '<p class="st-cmp-go"><a class="btn" href="' + esc(vsHash([me.name])) + '">' + L('Сравнить с другими игроками', 'Compare with other players') + '</a></p>';
    h += personalRecords(rows, allRows, cj);
    host.innerHTML = h;
  }

  /* -------------------------------------------------------- сравнение */

  /* Состояние сравнения — в адресе: #Tab:Compare/Vs:<ники>. hashOf из stats.js знает
     только свои ключи, поэтому адрес собирается здесь. readHash раскодирует значение один
     раз, а внутри — список через запятую; в каждом нике заранее заэкранированы только «%»
     и «,», чтобы запятая в нике не ломала список, а кириллица в адресе осталась читаемой.
     «/» закрывает внешнее кодирование. */
  const MAX_VS = 4;
  const vsHash = names => '#Tab:Compare' + (names.length
    ? '/Vs:' + encodeURIComponent(names.map(n => n.replace(/%/g, '%25').replace(/,/g, '%2C')).join(',')) : '');
  const parseVs = s => String(s || '').split(',').map(x => { try { return decodeURIComponent(x).trim(); } catch (e) { return ''; } }).filter(Boolean);

  /* Игроки по списку партий (все версии): партии, доигранные, победы, место, рейтинг
     после последней партии в статистике. */
  function peopleOf(matches) {
    const map = new Map();
    for (const m of matches) for (const p of m.players) {
      if (!p.isHuman) continue;
      const name = String(p.name || '').trim();
      if (!name) continue;
      let a = map.get(name);
      if (!a) map.set(name, a = { name, n: 0, fn: 0, wins: 0, placeSum: 0, placeN: 0, list: [], rating: null, ratingAt: '', delta: 0, deltaN: 0 });
      a.n++;
      a.list.push({ m, p });
      if (done(m)) { a.fn++; if (p.won) a.wins++; if (p.place > 0) { a.placeSum += p.place; a.placeN++; } }
      if (nz(p.ratingAfter) != null && String(m.at) > a.ratingAt) { a.rating = p.ratingAfter; a.ratingAt = String(m.at); }
      if (nz(p.ratingDelta) != null) { a.delta += p.ratingDelta; a.deltaN++; }
    }
    return [...map.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }

  const NA = { v: null, html: '<span class="dim">—</span>' };
  const modeOf = (list, keyOf) => {
    const m = new Map();
    list.forEach(x => { const k = keyOf(x); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  };

  function compareTable(cols, haveChoices) {
    const lines = [];
    const grp = t => lines.push({ grp: t });
    const line = (t, f, better = 1) => lines.push({ t, cells: cols.map(f), better });
    grp(L('Итоги', 'Results'));
    line(L('Партий', 'Matches'), c => ({ v: c.p.n, html: String(c.p.n) }));
    line(L('Доиграно', 'Played out'), c => ({ v: c.p.fn, html: String(c.p.fn) }), 0);
    line(L('Побед', 'Wins'), c => ({ v: c.p.wins, html: String(c.p.wins) }));
    line(L('Винрейт (доигранные)', 'Win rate (played out)'), c => c.p.fn ? { v: c.p.wins / c.p.fn, html: pct(c.p.wins, c.p.fn)
      + ' <small class="dim">' + c.p.wins + '/' + c.p.fn + '</small>' + (c.p.fn < SMALL_SAMPLE ? ' ' + SMALL : '') } : NA);
    line(L('Среднее место (доигранные)', 'Average place (played out)'), c => c.p.placeN ? { v: c.p.placeSum / c.p.placeN, html: num(c.p.placeSum / c.p.placeN) } : NA, -1);
    line(L('Рейтинг сейчас', 'Rating now'), c => c.p.rating != null ? { v: c.p.rating, html: num(c.p.rating)
      + ' <small class="dim">' + L('после партии ', 'after the match of ') + esc(S.shortDate(c.p.ratingAt)) + '</small>' } : NA);
    line(L('Рейтинг: изменение за всё время', 'Rating: total change'), c => c.p.deltaN ? { v: c.p.delta, html: signed(c.p.delta) } : NA);
    if (haveChoices) {
      const avgLine = (t, f, better = 1, fmt = num) => line(t, c => {
        const vs = c.rs.map(f).filter(v => v != null);
        return vs.length ? { v: avg(vs), html: fmt(avg(vs)) + (vs.length < 3 ? ' ' + SMALL : '') } : NA;
      }, better);
      grp(L('В среднем за партию', 'Average per match'));
      METRICS.forEach(x => avgLine(x.t, x.v, 1, x.fmt || num));
      avgLine(L('Потеряно юнитов', 'Units lost'), lostOf, -1);
      grp(L('Лучшее за одну партию', 'Best in a single match'));
      METRICS.forEach(x => line(x.t, c => {
        const b = top(c.rs, x.v, 1)[0];
        return b ? { v: b.v, html: (x.fmt || num)(b.v) + ' <small>' + matchRef(b.r.m) + '</small>' } : NA;
      }));
      line(L('Самая быстрая победа', 'Fastest win'), c => {
        const b = winsPool(c.rs).sort((a, z) => a.v - z.v)[0];
        return b ? { v: b.v, html: turnsFmt(b.v) + ' <small>' + esc(S.victoryName(b.r.m.victoryType)) + ' · ' + matchRef(b.r.m) + '</small>'
          + (votePassed(b.r, 1) ? CC_TAG : '') } : NA;
      }, -1);
      grp(L('Любимое', 'Favourites'));
      // listOf — по чему считать: участия из списка партий, участия со сводкой или сами чудеса.
      const fav = (t, listOf, keyOf, name, sub) => line(t, c => {
        const list = listOf(c);
        const top1 = modeOf(list, keyOf);
        return top1 ? { v: null, html: esc(name(top1[0])) + ' <small class="dim">' + sub(top1[1], list.length) + '</small>' } : NA;
      }, 0);
      const ofAll = (n, all) => n + L(' из ', ' of ') + all;
      fav(L('Цивилизация', 'Civilization'), c => c.p.list, x => x.p.civ, civName, ofAll);
      fav(L('Первая ветка политик', 'First policy branch'), c => c.rs, r => ((r.pc.branches || [])[0] || [])[1] || '', nm, ofAll);
      fav(L('Идеология', 'Ideology'), c => c.rs, r => { const x = (r.pc.ideology || []).find(i => i[1]); return x ? x[1] : ''; }, nm, ofAll);
      fav(L('Пантеон', 'Pantheon'), c => c.rs, r => r.pc.pantheon ? r.pc.pantheon[1] : '', nm, ofAll);
      fav(L('Чудо', 'Wonder'), c => c.rs.flatMap(r => (r.pc.wonders || []).map(w => w[1])), w => w, nm,
        n => L('построено ', 'built ') + n + ' ' + word(n, 'раз', 'раза', 'раз', 'time', 'times'));
    }
    return table([th(L('Показатель', 'Data set'))].concat(cols.map(c => th(linkPlayer(c.p.name), true))),
      lines.map(x => {
        if (x.grp) return '<tr class="st-grp"><th scope="colgroup" colspan="' + (cols.length + 1) + '">' + x.grp + '</th></tr>';
        const vals = x.cells.map(c => c.v).filter(v => v != null);
        let best = null;
        if (x.better && cols.length > 1 && vals.length > 1 && new Set(vals).size > 1) best = x.better > 0 ? Math.max(...vals) : Math.min(...vals);
        return '<tr><td>' + x.t + '</td>' + x.cells.map(c => '<td class="num' + (best != null && c.v === best ? ' st-best' : '') + '">' + c.html + '</td>').join('') + '</tr>';
      })).replace('<table class="st">', '<table class="st st-cmp">');   // своя вёрстка: перенос строк, чтобы на телефоне были видны игроки
  }

  /* Очные встречи. «Выше» — победитель партии выше всех, остальные — по месту; только
     доигранные партии (в не доигранной место — порядок по очкам, а не итог). */
  const rankOf = p => p.won ? 0 : (p.place > 0 ? p.place : 99);
  function pairOf(A, B) {
    const mine = new Map(A.list.map(x => [x.m.key, x.p]));
    const shared = [];
    for (const y of B.list) { const a = mine.get(y.m.key); if (a) shared.push({ m: y.m, a, b: y.p }); }
    shared.sort((p, q) => String(q.m.at).localeCompare(String(p.m.at)));
    const s = { shared, a: 0, b: 0, fin: 0, aw: 0, bw: 0 };
    for (const x of shared) {
      if (!done(x.m)) continue;
      s.fin++;
      if (x.a.won) s.aw++;
      if (x.b.won) s.bw++;
      if (rankOf(x.a) < rankOf(x.b)) s.a++; else if (rankOf(x.b) < rankOf(x.a)) s.b++;
    }
    return s;
  }

  const SHOW_SHARED = 8;
  function headToHead(sel) {
    let h = '<h2>' + L('Очные встречи', 'Head to head') + '</h2>'
      + intro(L('Общие партии — где оба играли. Счёт — кто кого опередил в доигранных общих партиях: победитель партии выше всех, остальные — по месту.',
        'Shared matches — where both played. The score is who finished ahead in the shared played-out matches: the match winner is above everyone, the rest go by place.'));
    if (sel.length > 2) {
      h += table([th('')].concat(sel.map(p => th(esc(p.name), true))), sel.map((A, i) => '<tr><td><b>' + linkPlayer(A.name) + '</b></td>'
        + sel.map((B, j) => {
          if (i === j) return '<td class="num dim">—</td>';
          const s = pairOf(A, B);
          if (!s.fin) return '<td class="num dim">—</td>';
          return '<td class="num' + (s.a > s.b ? ' st-best' : '') + '">' + s.a + ' : ' + s.b + ' <small class="dim">'
            + L('из ', 'of ') + s.fin + '</small></td>';
        }).join('') + '</tr>'))
        + '<p class="small dim">' + L('Строка — сколько раз игрок строки был выше игрока столбца, и наоборот.', 'A row shows how many times the row player finished above the column player, and vice versa.') + '</p>';
    }
    for (let i = 0; i < sel.length; i++) for (let j = i + 1; j < sel.length; j++) {
      const A = sel[i], B = sel[j], s = pairOf(A, B);
      const cell = p => esc(civName(p.civ)) + ' · ' + (p.won ? '<span class="st-win">' + L('победа', 'win') + '</span>' : (nz(p.place) ? num(p.place) : '—') + L(' место', ' place'));
      h += '<details class="st-group st-pair"' + (i === 0 && j === 1 ? ' open' : '') + '><summary><b>' + esc(A.name) + '</b> — <b>' + esc(B.name) + '</b> <span class="dim">· '
        + s.shared.length + ' ' + word(s.shared.length, 'общая партия', 'общие партии', 'общих партий', 'shared match', 'shared matches') + '</span></summary>';
      if (!s.shared.length) { h += '<p class="dim">' + L('Общих партий нет.', 'No shared matches.') + '</p></details>'; continue; }
      h += '<div class="st-h2h"><span class="st-h2h-n">' + linkPlayer(A.name) + '</span><b' + (s.a > s.b ? ' class="lead"' : '') + '>' + s.a + '</b><i>:</i><b'
        + (s.b > s.a ? ' class="lead"' : '') + '>' + s.b + '</b><span class="st-h2h-n">' + linkPlayer(B.name) + '</span></div>'
        + '<p class="small dim st-h2h-sub">' + L('Доиграно ', 'Played out: ') + s.fin + L(' из ', ' of ') + s.shared.length
        + L(' · победы в общих партиях: ', ' · wins in shared matches: ') + esc(A.name) + ' — ' + s.aw + ', ' + esc(B.name) + ' — ' + s.bw
        + (s.fin < SMALL_SAMPLE ? ' ' + SMALL : '') + '</p>';
      h += table([th(L('Партия', 'Match')), th(L('Дата', 'Date')), th(esc(A.name)), th(esc(B.name)), th(L('Победитель', 'Winner'))],
        s.shared.slice(0, SHOW_SHARED).map(x => {
          const w = done(x.m) ? x.m.players.find(p => p.won) : null;
          return '<tr>' + td(matchRef(x.m)) + td(esc(S.shortDate(x.m.at))) + td(cell(x.a)) + td(cell(x.b))
            + td(w ? (w.isHuman ? linkPlayer(String(w.name || '').trim()) : esc(w.name)) + ' <small class="dim">' + esc(S.victoryName(x.m.victoryType)) + '</small>'
              : '<span class="dim">' + L('не доиграна', 'not played out') + '</span>') + '</tr>';
        }));
      if (s.shared.length > SHOW_SHARED) h += '<p class="small dim">' + L('Показаны последние ', 'The latest ') + SHOW_SHARED + L(' из ', ' of ') + s.shared.length
        + L('; остальные — в профилях игроков.', ' are shown; the rest are in the player profiles.') + '</p>';
      h += '</details>';
    }
    return h;
  }

  async function renderCompare(st, idx, token) {
    const app = S.$('#stats-app');
    const [res] = await Promise.all([choices(), mapIds()]);
    if (token !== S.current()) return;
    const people = peopleOf(idx.matches);
    const find = n => people.find(p => p.name === n) || people.find(p => p.name.toLowerCase() === n.toLowerCase());
    const asked = parseVs(st.Vs);
    let sel = [];
    asked.forEach(n => { const p = find(n); if (p && !sel.includes(p) && sel.length < MAX_VS) sel.push(p); });
    const unknown = asked.filter(n => !find(n));
    const sample = !asked.length;
    if (sample) sel = people.slice(0, 2);
    const rowsAll = res.ok ? rowsOf(idx, res.data, '').rows : [];

    let h = S.tabs(st) + '<form class="skin-controls st-controls st-vs" id="st-vs">'
      + Array.from({ length: MAX_VS }, (_, i) => '<label>' + L('Игрок ', 'Player ') + (i + 1) + '<select data-i="' + i + '"><option value="">'
        + (i < 2 ? L('— выберите —', '— pick —') : L('— не нужен —', '— none —')) + '</option>'
        + people.map(p => '<option value="' + esc(p.name) + '"' + (sel[i] === p ? ' selected' : '') + '>' + esc(p.name) + ' (' + p.n + ')</option>').join('')
        + '</select></label>').join('')
      + '<button class="btn" type="button" id="st-vs-copy">' + L('Скопировать ссылку', 'Copy link') + '</button>'
      + '<span class="dim small skin-count" id="st-vs-msg"></span></form>';
    if (unknown.length) h += '<div class="note">' + L('Нет в статистике: ', 'Not in the statistics: ') + unknown.map(n => '«' + esc(n) + '»').join(', ')
      + L('. Ник сравнивается с тем, под которым человек сидел в партии.', '. The name is matched against the one used in the match.') + '</div>';
    h += intro((sample ? L('Для примера — два самых активных игрока; выберите своих. ', 'As an example — the two most active players; pick your own. ') : '')
      + L('Можно сравнить от двух до ' + MAX_VS + ' игроков; выбор хранится в адресе страницы — ссылкой можно поделиться. Все версии мода. '
        + 'Винрейт и место — только доигранные партии; средние и лучшее — по партиям со сводкой. Лучшее значение в строке выделено. '
        + 'Меньше ' + SMALL_SAMPLE + ' доигранных партий (у средних — меньше 3) — пометка «мало данных».',
        'Compare two to ' + MAX_VS + ' players; the choice is kept in the page address, so the link can be shared. All mod versions. '
        + 'Win rate and place — played-out matches only; averages and bests — matches with a choices summary. The best value in a row is highlighted. '
        + 'Fewer than ' + SMALL_SAMPLE + ' played-out matches (fewer than 3 for averages) is marked “small sample”.'));
    if (!sel.length) h += '<p class="dim">' + L('Выберите игроков выше.', 'Pick players above.') + '</p>';
    else {
      const cols = sel.map(p => ({ p, rs: rowsAll.filter(r => r.name === p.name) }));
      h += '<h2>' + L('Бок о бок', 'Side by side') + '</h2>' + compareTable(cols, res.ok);
      if (sel.length >= 2) h += headToHead(sel);
      else h += '<p class="dim">' + L('Добавьте второго игрока, чтобы увидеть очные встречи.', 'Add a second player to see the head-to-head record.') + '</p>';
    }
    app.innerHTML = h;

    const form = S.$('#st-vs');
    form.addEventListener('change', () => {
      const names = [];
      form.querySelectorAll('select').forEach(s => { if (s.value && !names.includes(s.value)) names.push(s.value); });
      history.replaceState(null, '', vsHash(names));
      S.rerender();
    });
    S.$('#st-vs-copy').addEventListener('click', async () => {
      if (sample) history.replaceState(null, '', vsHash(sel.map(p => p.name)));
      const msg = S.$('#st-vs-msg');
      try {
        await navigator.clipboard.writeText(location.href);
        msg.textContent = L('Ссылка скопирована.', 'Link copied.');
      } catch (e) {
        msg.textContent = location.href;   // нет доступа к буферу — показываем адрес, его можно выделить
      }
    });
  }

  S.addTab({ id: 'Choices', title: L('Выборы', 'Choices'), render: renderChoices });
  S.addTab({ id: 'Fame', title: L('Зал славы', 'Hall of fame'), render: renderFame });
  S.addTab({ id: 'Compare', title: L('Сравнение', 'Compare'), render: renderCompare });
  S.addPlayerHook(playerHand);
})();
