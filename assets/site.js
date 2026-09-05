/* ---------------------------------------------------------------------------
   Живые данные сайта Nova.

   ПРАВИЛО ПЕРВОЕ: ничего про версии и цены не вписано в разметку руками.
   Версия мода, версия лаунчера, ссылка на него, состав уровней подписки и
   способы пожертвования берутся из тех же файлов, которыми пользуется сам
   лаунчер. Иначе сайт начинает врать на следующий же день после выпуска.

   ПРАВИЛО ВТОРОЕ: текст, пришедший по сети, — это ДАННЫЕ, а не разметка.
   Он вставляется только как текст (textContent) либо через esc(). То же
   правило записано в лаунчере (Core/Model/NewsFeed.cs) и по той же причине.

   ПРАВИЛО ТРЕТЬЕ: не доехало — так и сказать. Никаких «примерных» чисел:
   показываем последнее известное с датой и пометкой, что свежее получить
   не удалось.

   Откуда что берётся (всё — тот же репозиторий, который раздаёт GitHub Pages,
   поэтому пути относительные и CORS не участвует вовсе):

     manifest.json      версия мода, версия и адрес лаунчера, дата сборки
     cursor-tiers.json  уровни подписки: цены и состав
     donate.json        способы пожертвования
     news.txt           лента новостей (тот же файл, что читает лаунчер)
     data/changelog.md  история версий (кладётся при выкладке из Nova/CHANGELOG.md)
     data/skins.json    опись обликов войск (кладётся при выкладке из Nova/skins.json),
                        картинки к ней — assets/skins/ из Nova/Art/SkinShots/
     data/site.json     то, что знает только владелец: Discord, авторы, галерея
   --------------------------------------------------------------------------- */

'use strict';

const NOVA = (() => {

  /* Последнее известное на момент сборки страницы. Показывается ТОЛЬКО когда
     живые данные не доехали, и всегда с пометкой. Дата обязательна: без неё
     число выглядит свежим. */
  const FALLBACK = {
    asOf: '2026-09-05',
    modVersion: '1.5.55',
    clientVersion: '0.3.37',
    clientUrl: 'https://github.com/Coddysmon/TournamentModPack/releases',
    clientSize: 61578668,
  };

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const mb = bytes => (bytes / 1048576).toFixed(1).replace('.', ',') + ' МБ';

  const RU_MONTH = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  function ruDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.getUTCDate() + ' ' + RU_MONTH[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  /* --------------------------------------------------------------- загрузка */

  async function grab(path, kind) {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) throw new Error(path + ': HTTP ' + r.status);
    // Response.text() по спецификации декодирует как UTF-8 независимо от
    // Content-Type — поэтому русский текст из .txt приходит целым.
    return kind === 'json' ? r.json() : r.text();
  }

  const cache = {};
  function once(key, fn) {
    if (!cache[key]) cache[key] = fn().catch(e => { console.warn(e); return null; });
    return cache[key];
  }

  /* Манифест весит около полумегабайта: это список всех 2600 файлов модпака
     с хешами. Нам из него нужны четыре строчки, поэтому вытаскиваем их один
     раз за посещение и кладём в sessionStorage — переход по страницам сайта
     больше не платит за загрузку.
     Если когда-нибудь понадобится дешевле: сборка выпуска (build-release.ps1)
     может рядом с манифестом класть маленький файл только с этими полями. */
  function release() {
    return once('release', async () => {
      const cached = sessionStorage.getItem('nova-release');
      if (cached) return JSON.parse(cached);
      const m = await grab('manifest.json', 'json');
      const small = {
        modVersion: m.packageVersion,
        created: m.createdUtc,
        client: m.client || null,
        cursorCount: m.cursors && m.cursors.premium ? m.cursors.premium.length : 0,
        live: true,
      };
      try { sessionStorage.setItem('nova-release', JSON.stringify(small)); } catch (e) { }
      return small;
    });
  }

  const tiers = () => once('tiers', () => grab('cursor-tiers.json', 'json'));
  const donate = () => once('donate', () => grab('donate.json', 'json'));
  const news = () => once('news', () => grab('news.txt', 'text'));
  const changelog = () => once('changelog', () => grab('data/changelog.md', 'text'));
  const site = () => once('site', () => grab('data/site.json', 'json'));
  /* Опись обликов войск: та же, что читает лаунчер (Nova\skins.json), кладётся
     при выкладке. 57 КБ — качаем только на тех страницах, где она нужна. */
  const skins = () => once('skins', () => grab('data/skins.json', 'json'));

  /* ------------------------------------------------- отложенная загрузка */

  /* Картинок обликов 247 штук, вместе — почти 4 МБ. Грузим только те, что
     доехали до экрана: атрибут loading="lazy" делает это сам в нынешних
     браузерах, но полагаться на него одного нельзя (Safari научился только
     в 16.4), поэтому адрес лежит в data-src и проставляется наблюдателем.
     Наблюдателя нет вовсе — грузим всё сразу: медленно, но не пусто. */
  function lazyImages(root) {
    const imgs = $$('img[data-src]', root || document);
    if (!imgs.length) return;
    if (!('IntersectionObserver' in window)) {
      imgs.forEach(i => { i.src = i.dataset.src; i.removeAttribute('data-src'); });
      return;
    }
    const io = new IntersectionObserver((entries, obs) => {
      for (const e of entries) {
        const i = e.target;
        // Картинку мог уже загрузить другой наблюдатель (фильтр подписывает
        // показавшиеся заново). Без этой проверки второй заход выставлял
        // src="undefined" поверх уже загруженного адреса — картинка исчезала.
        if (!i.dataset.src) { obs.unobserve(i); continue; }
        if (!e.isIntersecting) continue;
        i.src = i.dataset.src;
        i.removeAttribute('data-src');
        obs.unobserve(i);
      }
    }, { rootMargin: '400px 0px' });
    imgs.forEach(i => io.observe(i));
    loadNearViewport(root);
    return io;
  }

  /* Догрузка «сейчас же, не дожидаясь наблюдателя».
     Нужна там, где картинка стала видимой не из-за прокрутки, а из-за того,
     что её показал фильтр: наблюдатель узнаёт об этом только на следующем
     кадре отрисовки, и если кадра нет (скрытая вкладка, безголовый браузер),
     картинка так и остаётся пустой. Замерено: после фильтра на последний вид
     войск ни одна из трёх его картинок не получала адреса, пока эта функция
     не появилась. Прямоугольник нулевого размера — это display:none, такие
     пропускаем. */
  function loadNearViewport(root) {
    const h = window.innerHeight || document.documentElement.clientHeight || 0;
    $$('img[data-src]', root || document).forEach(i => {
      const r = i.getBoundingClientRect();
      if (!r.width && !r.height) return;
      if (r.top > h + 400 || r.bottom < -400) return;
      i.src = i.dataset.src;
      i.removeAttribute('data-src');
    });
  }

  /* ------------------------------------------------------- лента новостей */

  /* Разбор ровно тот же, что у лаунчера (Core/Model/NewsFeed.cs):
     «=== ГГГГ-ММ-ДД | ТЕГ | Заголовок», дальше текст до следующей такой
     строки, строка «url: …» становится ссылкой. Формат один на оба места —
     владелец пишет новость один раз. */
  function parseNews(text) {
    const out = [];
    let cur = null;
    for (const raw of String(text).replace(/\r\n/g, '\n').split('\n')) {
      if (raw.startsWith('===')) {
        if (cur) out.push(cur);
        const parts = raw.replace(/^[=\s]+/, '').split('|');
        cur = { date: (parts[0] || '').trim(), tag: null, title: '', url: null, body: [] };
        if (parts.length === 2) cur.title = parts[1].trim();
        else if (parts.length >= 3) { cur.tag = parts[1].trim().toUpperCase(); cur.title = parts.slice(2).join('|').trim(); }
        continue;
      }
      if (!cur) continue;
      if (/^url:/i.test(raw)) { cur.url = raw.slice(4).trim(); continue; }
      cur.body.push(raw);
    }
    if (cur) out.push(cur);

    return out
      .map(e => ({
        date: e.date, tag: e.tag, title: e.title, url: e.url,
        // Пустая строка разделяет абзацы, перенос внутри абзаца — просто вёрстка
        // исходного файла и в вебе не нужен.
        paras: e.body.join('\n').trim().split(/\n\s*\n/).map(p => p.replace(/\n/g, ' ').trim()).filter(Boolean),
      }))
      .filter(e => e.title && e.paras.length && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  const TAG_CLASS = {
    'ОБНОВЛЕНИЕ': 'upd', 'ВЕРСИЯ': 'upd', 'НАЦИИ': 'upd',
    'ИСПРАВЛЕНИЕ': 'fix', 'ИСПРАВЛЕНИЯ': 'fix', 'ПОЧИНКА': 'fix',
    'БАЛАНС': 'bal', 'ЛАУНЧЕР': 'cli', 'ТУРНИР': 'cli',
  };

  function newsHtml(e) {
    const cls = TAG_CLASS[e.tag] || '';
    return '<article class="entry">'
      + '<div class="meta">'
      + (e.tag ? '<span class="tag ' + cls + '">' + esc(e.tag) + '</span>' : '')
      + '<span>' + esc(ruDate(e.date)) + '</span></div>'
      + '<h3>' + esc(e.title) + '</h3>'
      + e.paras.map(p => '<p>' + esc(p) + '</p>').join('')
      + (e.url && /^https?:\/\//i.test(e.url)
        ? '<p><a href="' + esc(e.url) + '" rel="noopener">Подробнее</a></p>' : '')
      + '</article>';
  }

  /* ------------------------------------------------------ разметка Markdown */

  /* Мини-разбор Markdown под наш CHANGELOG.md, а не библиотека: нам нужны
     заголовки, списки, жирный, ссылки и код. Всё остальное едет обычным
     абзацем. Экранирование делается ПЕРВЫМ действием, до любых замен, —
     иначе собственная разметка станет дырой. */
  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[\s(])_([^_]+)_(?=[\s.,;:)]|$)/g, '$1<i>$2</i>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
  }

  function mdBlocks(lines) {
    /* Перенос строки внутри абзаца — это вёрстка исходного файла, а не новый
       абзац: в CHANGELOG.md строки разбиты по ширине окна. Поэтому подряд
       идущие строки собираются в один абзац (и в один пункт списка), а границей
       служит пустая строка. Без этого каждая строка файла становилась
       отдельным абзацем, и текст рассыпался. */
    let html = '', list = false, para = [], li = null;
    const flushPara = () => { if (para.length) { html += '<p>' + inline(para.join(' ')) + '</p>'; para = []; } };
    const flushLi = () => { if (li) { html += '<li>' + inline(li.join(' ')) + '</li>'; li = null; } };
    const closeList = () => { flushLi(); if (list) { html += '</ul>'; list = false; } };

    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');
      const t = line.trim();
      if (!t || /^---+$/.test(t)) { flushPara(); closeList(); continue; }
      let m;
      if ((m = t.match(/^#{3,4}\s+(.*)$/))) { flushPara(); closeList(); html += '<h4>' + inline(m[1]) + '</h4>'; continue; }
      if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
        flushPara(); flushLi();
        if (!list) { html += '<ul>'; list = true; }
        li = [m[1]];
        continue;
      }
      if (li) { li.push(t); continue; }
      para.push(t);
    }
    flushPara(); closeList();
    return html;
  }

  /* CHANGELOG режется по «## [версия] — дата» на раскрывающиеся блоки:
     784 строки одним полотном никто читать не станет. */
  function changelogHtml(text) {
    const lines = String(text).replace(/\r\n/g, '\n').split('\n');
    const intro = [];
    const versions = [];
    let cur = null;
    for (const line of lines) {
      const m = line.match(/^##\s+(?!#)(.*)$/);
      if (m) {
        const head = m[1].trim();
        const parts = head.split(/\s+[—-]\s+/);
        cur = {
          title: parts[0].replace(/^\[|\]$/g, '').replace(/\]$/, ''),
          date: parts[1] || '',
          body: [],
        };
        versions.push(cur);
        continue;
      }
      if (line.startsWith('# ')) continue;
      (cur ? cur.body : intro).push(line);
    }
    let html = '';
    const introHtml = mdBlocks(intro).trim();
    if (introHtml) html += '<div class="lead">' + introHtml + '</div>';
    versions.forEach((v, i) => {
      html += '<details class="ver"' + (i === 0 ? ' open' : '') + '>'
        + '<summary><span>' + esc(v.title) + '</span>'
        + (v.date ? '<span class="date">' + esc(v.date) + '</span>' : '')
        + '</summary><div class="body">' + mdBlocks(v.body) + '</div></details>';
    });
    return html;
  }

  /* ------------------------------------------------- общие куски страницы */

  function markStale(el) {
    el.title = 'Свежие данные получить не удалось, показано последнее известное на '
      + FALLBACK.asOf;
    el.classList.add('dim');
  }

  /* Заполняет всё, что помечено data-nova="…" на любой странице. */
  async function fillCommon() {
    const r = await release();
    const live = r || {
      modVersion: FALLBACK.modVersion, created: null, live: false,
      client: { version: FALLBACK.clientVersion, url: FALLBACK.clientUrl, size: FALLBACK.clientSize },
      cursorCount: 18,
    };
    const c = live.client || {};

    $$('[data-nova="mod-version"]').forEach(el => {
      el.textContent = live.modVersion || '—';
      if (!live.live) markStale(el);
    });
    $$('[data-nova="client-version"]').forEach(el => {
      el.textContent = c.version || '—';
      if (!live.live) markStale(el);
    });
    $$('[data-nova="client-size"]').forEach(el => {
      el.textContent = c.size ? mb(c.size) : '—';
    });
    $$('[data-nova="built"]').forEach(el => {
      el.textContent = live.created ? ruDate(live.created) : '—';
    });
    $$('[data-nova="cursor-count"]').forEach(el => {
      el.textContent = live.cursorCount || '—';
    });
    // Заметки к выпуску лаунчера бывают не у каждой версии. Нет их — прячем
    // весь абзац целиком, иначе на странице повисает подпись без содержимого.
    $$('[data-nova="client-notes"]').forEach(el => { el.textContent = c.notes || ''; });
    $$('[data-nova="client-notes-box"]').forEach(el => { el.hidden = !c.notes; });

    // Кнопка скачивания. Пока адрес не приехал — она выключена и так и
    // выглядит: мёртвая ссылка хуже отсутствующей.
    $$('[data-nova="download"]').forEach(el => {
      if (c.url) {
        el.href = c.url;
        el.removeAttribute('aria-disabled');
        const v = $('[data-nova="download-label"]', el);
        if (v) v.textContent = 'Скачать лаунчер' + (c.version ? ' ' + c.version : '');
      } else {
        el.href = FALLBACK.clientUrl;
        el.removeAttribute('aria-disabled');
      }
    });

    // Discord: ссылку знает только владелец, она лежит в data/site.json.
    const s = await site();
    const invite = s && s.discordInvite ? String(s.discordInvite).trim() : '';
    $$('[data-nova="discord"]').forEach(el => {
      if (/^https:\/\/(discord\.gg|discord\.com)\//i.test(invite)) {
        el.href = invite;
        el.removeAttribute('aria-disabled');
      } else {
        el.href = '#';
        el.setAttribute('aria-disabled', 'true');
        el.title = 'Ссылка-приглашение ещё не получена от владельца';
      }
    });
    $$('[data-nova="discord-missing"]').forEach(el => {
      el.hidden = /^https:\/\/(discord\.gg|discord\.com)\//i.test(invite);
    });

    // Свой домен показываем только после того, как владелец подтвердил, что он
    // РЕАЛЬНО открывается (domainLive). Адрес, который не работает, хуже, чем
    // отсутствие адреса: по нему пойдут и решат, что проект умер.
    const dom = s && s.domainLive && s.domain ? String(s.domain).trim() : '';
    $$('[data-nova="domain"]').forEach(el => { el.textContent = dom; });
    $$('[data-nova="domain-box"]').forEach(el => { el.hidden = !dom; });

    // Числа по обликам войск (38 видов / 247 обликов) — только из описи,
    // руками их не пишем: при следующей починке они снова разойдутся.
    if ($('[data-nova="skin-units"]') || $('[data-nova="skin-variants"]')) {
      const sk = await skins().catch(() => null);
      const units = sk && Array.isArray(sk.units) ? sk.units : [];
      const variants = units.reduce((n, u) => n + (u.variants ? u.variants.length : 0), 0);
      $$('[data-nova="skin-units"]').forEach(el => { el.textContent = units.length || '—'; });
      $$('[data-nova="skin-variants"]').forEach(el => { el.textContent = variants || '—'; });
    }
    return { release: live, site: s };
  }

  /* ------------------------------------------------------------ меню */

  /* Тема на сайте одна и тёмная — как у лаунчера, у которого светлой нет
     вовсе. Переключателя больше нет: вторая палитра ничего не давала, а
     расходиться с программой начала бы в первый же день.

     Зато появилось то, чего у окна программы быть не может: на узком экране
     боковое меню уезжает за край и открывается кнопкой. Сайт смотрят с
     телефона чаще, чем с ноутбука. */
  function menu() {
    const side = document.getElementById('side');
    const burger = document.getElementById('burger');
    const scrim = document.getElementById('scrim');
    if (!side || !burger) return;

    const set = open => {
      side.classList.toggle('open', open);
      if (scrim) scrim.classList.toggle('on', open);
      burger.setAttribute('aria-expanded', String(open));
      // Прокрутку под открытым меню подпираем, иначе страница уезжает под
      // затемнением и человек теряет место, на котором читал.
      document.body.style.overflow = open ? 'hidden' : '';
    };

    burger.addEventListener('click', () => set(!side.classList.contains('open')));
    if (scrim) scrim.addEventListener('click', () => set(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
    // Переход по ссылке меню закрывает его сам: иначе на телефоне после
    // возврата «назад» страница открывается с распахнутым меню поверх текста.
    $$('.menu a', side).forEach(a => a.addEventListener('click', () => set(false)));
    // Экран расширили (поворот телефона) — меню снова обычное, подпорку снимаем.
    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) set(false);
    });
  }

  /* Текущий раздел подсвечен в меню. Разметка уже несёт aria-current, это
     страховка на случай, если страницу откроют по адресу без имени файла
     (например, /index.html против /). */
  function nav() {
    const here = location.pathname.replace(/.*\//, '') || 'index.html';
    $$('.menu a').forEach(a => {
      if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
    });
  }

  document.addEventListener('DOMContentLoaded', () => { menu(); nav(); });

  return {
    esc, $, $$, mb, ruDate, FALLBACK,
    release, tiers, donate, news, changelog, site, skins,
    parseNews, newsHtml, changelogHtml, fillCommon,
    lazyImages, lazyNow: loadNearViewport,
  };
})();
