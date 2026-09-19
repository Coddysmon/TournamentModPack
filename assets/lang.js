/* ---------------------------------------------------------------------------
   Язык сайта: русские страницы лежат по прежним адресам, английские — в /en/.
   Site language: the Russian pages keep their original URLs, the English ones
   live under /en/.

   ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ И ПОЧЕМУ ОН В <head> БЕЗ defer. Переход на другой язык
   должен случиться ДО отрисовки, иначе человек видит вспышку чужого языка, а
   поисковик — переадресацию после загрузки. Файл маленький (несколько строк
   кода), лежит рядом с сайтом и кешируется.

   ПРАВИЛА (ровно эти, без догадок):
     1. ?lang=ru|en в адресе — сильнее всего: выбор запоминается, параметр
        убирается из адреса, при несовпадении с языком страницы — переход.
        Так делается ссылка «покажи мне сразу по-английски».
     2. Одна автоматическая переадресация на вкладку. Признак лежит в
        sessionStorage — поэтому зациклиться нельзя даже при странной
        настройке браузера: второй раз скрипт просто ничего не делает.
     3. Выбор человека (кнопка RU/EN) хранится в localStorage и главнее языка
        браузера. Пока выбора нет — смотрим navigator.languages: русский —
        значит русская страница, всё остальное — английская.
     4. Страница без пары (оферта — юридический документ по российскому праву,
        английской версии у неё нет) помечена data-lang-alt="none": с неё
        никуда не уводим.

   Ссылки переключателя в разметке настоящие (index.html ↔ en/index.html),
   поэтому он работает и без JavaScript. Скрипт только запоминает выбор.
   --------------------------------------------------------------------------- */

(function () {
  'use strict';

  var html = document.documentElement;
  var pageLang = String(html.getAttribute('lang') || 'ru').slice(0, 2).toLowerCase() === 'en' ? 'en' : 'ru';
  var LS_KEY = 'nova-lang';
  var SS_KEY = 'nova-lang-redirected';

  function get(store, key) {
    try { return window[store].getItem(key); } catch (e) { return null; }
  }
  function set(store, key, value) {
    try { window[store].setItem(key, value); } catch (e) { /* приватный режим — просто не запомним */ }
  }
  var ok = function (v) { return v === 'ru' || v === 'en' ? v : null; };

  /* Адрес той же страницы на другом языке. null — такой пары нет. */
  function counterpart(lang) {
    var path = location.pathname;
    var cut = path.lastIndexOf('/');
    var dir = path.slice(0, cut + 1);
    var file = path.slice(cut + 1);
    var inEn = /(^|\/)en\/$/.test(dir);
    if (lang === 'en') return inEn ? null : dir + 'en/' + file;
    return inEn ? dir.replace(/en\/$/, '') + file : null;
  }

  /* Язык браузера. Берём первый пункт списка: он и есть предпочтение. */
  function browserLang() {
    var list = navigator.languages && navigator.languages.length
      ? navigator.languages : [navigator.language || ''];
    var first = String(list[0] || '').toLowerCase();
    return first.indexOf('ru') === 0 ? 'ru' : 'en';
  }

  /* --------------------------------------------------- 1. явный ?lang= */

  var params = null;
  try { params = new URLSearchParams(location.search); } catch (e) { params = null; }
  var asked = params ? ok(String(params.get('lang') || '').toLowerCase()) : null;
  if (asked) {
    set('localStorage', LS_KEY, asked);
    set('sessionStorage', SS_KEY, '1');
    params.delete('lang');
    var rest = params.toString();
    if (asked !== pageLang) {
      var to = counterpart(asked);
      if (to) { location.replace(to + (rest ? '?' + rest : '') + location.hash); return; }
    }
    // Остались на месте — уберём параметр из адреса, чтобы ссылка не тиражировалась.
    if (history.replaceState) {
      history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
    }
  }

  /* --------------------------------------- 2–4. автоматическое определение */

  if (!asked && html.getAttribute('data-lang-alt') !== 'none' && !get('sessionStorage', SS_KEY)) {
    var want = ok(get('localStorage', LS_KEY)) || browserLang();
    if (want !== pageLang) {
      var target = counterpart(want);
      if (target) {
        set('sessionStorage', SS_KEY, '1');
        location.replace(target + location.search + location.hash);
        return;
      }
    }
    // Даже если переходить некуда, помечаем вкладку: одна попытка на сессию.
    set('sessionStorage', SS_KEY, '1');
  }

  /* ------------------------------------------------- кнопка RU/EN в шапке */

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[data-lang]') : null;
    if (!a) return;
    var lang = ok(a.getAttribute('data-lang'));
    if (!lang) return;
    set('localStorage', LS_KEY, lang);
    set('sessionStorage', SS_KEY, '1');   // на той странице нас не должно развернуть обратно
  });

  /* ------------------------------------------------------------- hreflang

     В разметке адреса относительные — так они переживут переезд с
     coddysmon.github.io на novamode.ru без правки всех страниц. Поисковики
     просят абсолютные, поэтому здесь же дописываем их из текущего адреса:
     разметка остаётся переносимой, а в готовой странице стоит полный адрес. */
  document.addEventListener('DOMContentLoaded', function () {
    var links = document.querySelectorAll('link[rel="alternate"][hreflang], link[rel="canonical"]');
    for (var i = 0; i < links.length; i++) {
      var raw = links[i].getAttribute('href');
      if (!raw || /^https?:/i.test(raw)) continue;
      try { links[i].setAttribute('href', new URL(raw, location.href).href); } catch (e) { /* оставим как есть */ }
    }
  });
})();
