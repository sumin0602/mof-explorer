/* ============================================================
   MOF Explorer — tiny i18n (한국어 / English)
   No framework, no build step. Works identically on GitHub Pages
   and inside the Capacitor Android app (same web assets).

   USAGE
     1) Load BEFORE your page scripts:
        <script src="i18n.js"></script>
     2) Mark translatable text in HTML:
        <h1 data-i18n="home.title">MOF 탐험대</h1>
        <button data-i18n="nav.game">기공 게임</button>
        <input data-i18n-attr="placeholder:report.hint">   (attribute text)
        <span data-i18n-html="home.tagline"></span>        (allows inline tags)
     3) Add a toggle button anywhere:
        <button id="langToggle"></button>
     4) On load:  I18N.init();
     5) In JS:    I18N.t('nav.game')  → current-language string

   The chosen language is saved in localStorage ('mofx_lang') so it
   persists across visits and app launches.
   ============================================================ */
(function () {
  var STORAGE_KEY = 'mofx_lang';
  var DEFAULT = 'ko';

  /* ---- Dictionary ---------------------------------------------------
     Keep KEYS identical across languages. Add keys as you migrate each
     page's hard-coded strings into data-i18n attributes.
     NOTE on "MOF" vs "MOFs": in English, use the plural "MOFs" whenever
     you mean the material class in general; keep it singular only for a
     specific single structure ("the HKUST-1 MOF"). Korean stays "MOF".  */
  var DICT = {
    ko: {
      'lang.name':       '한국어',
      'lang.other':      'English',
      'app.name':        'MOF 탐험대',
      'home.title':      'MOF 탐험대',
      'home.tagline':    '금속-유기 골격체(MOF)를 3D로 탐험해요',
      'home.subtitle':   '8종의 MOF 구조와 기공을 직접 살펴보세요',
      'nav.home':        '홈',
      'nav.structure':   '구조 특징',
      'nav.game':        '기공 게임',
      'nav.report':      '보고서',
      'nav.about':       '소개',
      'footer.text':     '© 2026 MOF Explorer · 고등학생을 위한 나노 과학 교육 플랫폼',
      'pwa.install':     '📲 앱으로 설치',
      'pwa.installStore':'Google Play에서 앱으로 설치',
      'theme.toDark':    '다크 모드로 전환',
      'theme.toLight':   '라이트 모드로 전환',
      'common.class':    'MOF',           /* 재료 종류 전체를 가리킬 때 */
      'common.start':    '시작하기',
      'common.next':     '다음',
      'common.back':     '뒤로',
      'common.close':    '닫기',
      'structure.pick':  'MOF를 선택하세요',
      'game.title':      '기공 찾기 게임',
      'game.desc':       '숨겨진 기공을 찾아 탭하세요',
      'report.hint':     '여기에 조사 내용을 입력하세요',
      'theme.dark':      '어두운 모드',
      'theme.light':     '밝은 모드'
    },
    en: {
      'lang.name':       'English',
      'lang.other':      '한국어',
      'app.name':        'MOF Explorer',
      'home.title':      'MOF Explorer',
      'home.tagline':    'Explore metal-organic frameworks (MOFs) in 3D',
      'home.subtitle':   'Inspect the structures and pores of 8 different MOFs',
      'nav.home':        'Home',
      'nav.structure':   'Structures',
      'nav.game':        'Pore Game',
      'nav.report':      'Report',
      'nav.about':       'About',
      'footer.text':     '© 2026 MOF Explorer · A nano-science learning platform for high-schoolers',
      'pwa.install':     '📲 Install app',
      'pwa.installStore':'Install from Google Play',
      'theme.toDark':    'Switch to dark mode',
      'theme.toLight':   'Switch to light mode',
      'common.class':    'MOFs',          /* the material class, plural */
      'common.start':    'Start',
      'common.next':     'Next',
      'common.back':     'Back',
      'common.close':    'Close',
      'structure.pick':  'Choose a MOF',
      'game.title':      'Find-the-Pore Game',
      'game.desc':       'Tap the hidden pores to find them',
      'report.hint':     'Type your findings here',
      'theme.dark':      'Dark mode',
      'theme.light':     'Light mode'
    }
  };

  var current = DEFAULT;

  function detect() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && DICT[saved]) return saved;
    } catch (e) {}
    var nav = (navigator.language || navigator.userLanguage || 'ko').toLowerCase();
    return nav.indexOf('ko') === 0 ? 'ko' : 'en';
  }

  function t(key) {
    var d = DICT[current] || DICT[DEFAULT];
    if (d[key] != null) return d[key];
    // fall back to the other language, then to the raw key
    return (DICT[DEFAULT][key] != null) ? DICT[DEFAULT][key] : key;
  }

  function apply(root) {
    root = root || document;
    // textContent
    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    // innerHTML (use only for trusted strings with inline markup)
    root.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    // attributes, e.g. data-i18n-attr="placeholder:report.hint;title:nav.game"
    root.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var kv = pair.split(':');
        if (kv.length === 2) el.setAttribute(kv[0].trim(), t(kv[1].trim()));
      });
    });
    // <html lang> for accessibility / correct fonts
    document.documentElement.setAttribute('lang', current);
    // refresh any toggle button label to show the OTHER language
    var btn = document.getElementById('langToggle');
    if (btn) btn.textContent = t('lang.other');
    // let pages react (e.g. re-render a canvas legend)
    document.dispatchEvent(new CustomEvent('i18n:changed', { detail: { lang: current } }));
  }

  function setLang(lang) {
    if (!DICT[lang]) return;
    current = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    apply();
  }

  function toggle() { setLang(current === 'ko' ? 'en' : 'ko'); }

  function init() {
    current = detect();
    var btn = document.getElementById('langToggle');
    if (btn && !btn._i18nBound) { btn.addEventListener('click', toggle); btn._i18nBound = true; }
    apply();
  }

  window.I18N = {
    init: init, apply: apply, t: t, setLang: setLang, toggle: toggle,
    get lang() { return current; },
    DICT: DICT   // exposed so pages can extend the dictionary at runtime
  };

  // auto-init once the DOM is ready (safe to also call I18N.init() yourself)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
