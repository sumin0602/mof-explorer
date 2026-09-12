/* ============================================
   MOF Explorer — Common Navigation
   ============================================ */

(function () {
  // Safe translator: uses I18N when present, else falls back to the
  // Korean string passed in. So nav.js still works if i18n.js is absent.
  function T(key, fallback) {
    return (window.I18N && typeof I18N.t === 'function') ? I18N.t(key) : fallback;
  }
  function i18nApply() {
    if (window.I18N && typeof I18N.apply === 'function') I18N.apply();
  }

  const PAGES = [
    { href: 'index.html',     key: 'nav.home',      label: '홈' },
    { href: 'structure.html', key: 'nav.structure', label: '구조 특징' },
    { href: 'game.html',      key: 'nav.game',      label: '기공 게임' },
    { href: 'report.html',    key: 'nav.report',    label: '보고서' },
  ];

  /* ----- Theme (apply BEFORE render to avoid flash) ----- */
  const THEME_KEY = 'mof_theme';
  function applyTheme(t) {
    if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
  }
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light') applyTheme('light');
  } catch (_) {}

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }
  function toggleTheme() {
    const next = currentTheme() === 'light' ? 'dark' : 'light';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
    // notify other scripts (canvases, etc)
    document.dispatchEvent(new CustomEvent('mof:theme', { detail: { theme: next } }));
    refreshToggleIcon();
  }
  function refreshToggleIcon() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.textContent = currentTheme() === 'light' ? '🌙' : '☀';
    const lbl = currentTheme() === 'light'
      ? T('theme.toDark', '다크 모드로 전환')
      : T('theme.toLight', '라이트 모드로 전환');
    btn.setAttribute('aria-label', lbl);
    btn.title = lbl;
  }
  // expose for other modules
  window.MOFTheme = { current: currentTheme, toggle: toggleTheme, apply: applyTheme };

  function currentPage() {
    const path = location.pathname.split('/').pop() || 'index.html';
    return path === '' ? 'index.html' : path;
  }

  // Android edge-to-edge (targetSdk 35/36) lets app content slide under the
  // system status bar, so the fixed top nav gets clipped by the clock/battery.
  // Measure the real status-bar height (safe-area-inset-top) and push the nav
  // — and, if it's fixed, the body — down by exactly that much. On web mobile
  // the inset is 0, so nothing changes there.
  function applyTopSafeArea(nav) {
    const measure = () => {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top,0px);pointer-events:none;visibility:hidden;';
      document.body.appendChild(probe);
      const inset = Math.round(probe.getBoundingClientRect().height);
      probe.remove();
      return inset;
    };
    // remember the CSS base padding so re-applying (orientation change) doesn't stack
    if (nav._basePadTop == null) nav._basePadTop = parseFloat(getComputedStyle(nav).paddingTop) || 0;
    if (document.body._basePadTop == null) document.body._basePadTop = parseFloat(getComputedStyle(document.body).paddingTop) || 0;

    const apply = () => {
      const inset = measure();
      nav.style.paddingTop = (nav._basePadTop + inset) + 'px';
      // when the nav is taken out of flow, the body needs the same offset so
      // page content clears the now-taller bar
      if (getComputedStyle(nav).position === 'fixed') {
        document.body.style.paddingTop = (document.body._basePadTop + inset) + 'px';
      }
    };
    apply();
    // re-apply on rotation / viewport changes
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
  }

  function renderNav() {
    injectLangCss();
    // Android 15 엣지투엣지 강제 적용 대응: viewport-fit=cover 보장
    let vp = document.querySelector('meta[name="viewport"]');
    if (vp && !vp.content.includes('viewport-fit')) {
      vp.content += ', viewport-fit=cover';
    }

    const here = currentPage();
    const nav = document.createElement('nav');
    nav.className = 'nav';
    // NOTE: the "MOF Explorer" logo is the product name — it stays as-is
    // (singular) in both languages and gets no data-i18n.
    nav.innerHTML = `
      <a href="index.html" class="logo">⬡ MOF Explorer</a>
      <div class="nav-right">
        <ul id="navList">
          ${PAGES.map(p => `<li><a href="${p.href}" class="${p.href === here ? 'active' : ''}" data-i18n="${p.key}">${p.label}</a></li>`).join('')}
        </ul>
        <div class="lang-seg" id="langSeg" role="group" aria-label="Language / 언어">
          <button type="button" class="lang-seg-btn" data-lang="ko">한국어</button>
          <button type="button" class="lang-seg-btn" data-lang="en">EN</button>
        </div>
        <button class="theme-toggle" id="themeToggle" aria-label="테마 전환">☀</button>
        <button class="ham" aria-label="메뉴 열기">☰</button>
      </div>
    `;
    document.body.insertBefore(nav, document.body.firstChild);
    applyTopSafeArea(nav);

    const ham = nav.querySelector('.ham');
    const list = nav.querySelector('#navList');
    ham.addEventListener('click', () => list.classList.toggle('open'));

    const btn = nav.querySelector('#themeToggle');
    btn.addEventListener('click', toggleTheme);
    refreshToggleIcon();

    // language selector (한국어 / EN segmented control). The nav is injected
    // after i18n.js's initial pass, so nav.js owns the wiring.
    const seg = nav.querySelector('#langSeg');
    if (seg && window.I18N && typeof I18N.setLang === 'function') {
      seg.querySelectorAll('.lang-seg-btn').forEach(b => {
        b.addEventListener('click', () => I18N.setLang(b.dataset.lang));
      });
      updateLangSeg();
    } else if (seg) {
      seg.style.display = 'none';   // hide if i18n.js isn't loaded
    }
    // translate the freshly-built nav
    i18nApply();
  }

  // reflect the active language on the segmented control
  function updateLangSeg() {
    const seg = document.getElementById('langSeg');
    if (!seg || !window.I18N) return;
    const cur = window.I18N.lang;
    seg.querySelectorAll('.lang-seg-btn').forEach(b => {
      const on = b.dataset.lang === cur;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  // monochrome styling for the selector (injected once; no CSS-file edit needed)
  function injectLangCss() {
    if (document.getElementById('mofLangSegCss')) return;
    const st = document.createElement('style');
    st.id = 'mofLangSegCss';
    st.textContent =
      '.lang-seg{display:inline-flex;align-items:stretch;border:1px solid var(--border,#334155);' +
      'border-radius:8px;overflow:hidden;margin-right:.45rem;font-family:inherit;}' +
      '.lang-seg-btn{appearance:none;-webkit-appearance:none;background:transparent;border:none;' +
      'cursor:pointer;padding:.3rem .6rem;font-size:.78rem;font-weight:600;line-height:1;' +
      'color:var(--txm,#94a3b8);transition:background .15s,color .15s;}' +
      '.lang-seg-btn + .lang-seg-btn{border-left:1px solid var(--border,#334155);}' +
      '.lang-seg-btn:hover{color:var(--tx,#e5e7eb);}' +
      '.lang-seg-btn.active{background:var(--tx,#e5e7eb);color:var(--card,#0b1120);}';
    document.head.appendChild(st);
  }

  function renderFooter() {
    if (document.querySelector('.footer')) return;
    const f = document.createElement('footer');
    f.className = 'footer';
    f.innerHTML = `<span data-i18n="footer.text">© 2026 MOF Explorer · 중·고등학생을 위한 나노 과학 교육 플랫폼</span>`;
    document.body.appendChild(f);
    i18nApply();
  }

  /* ----- Background particle canvas ----- */
  function setupParticles() {
    const canvas = document.createElement('canvas');
    canvas.id = 'bgCanvas';
    document.body.insertBefore(canvas, document.body.firstChild);
    const ctx = canvas.getContext('2d');

    let W = 0, H = 0, parts = [];

    function resize() {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
      const total = Math.max(60, Math.min(110, Math.floor((W * H) / 18000)));
      parts = new Array(total).fill(0).map(() => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        r: 1.2 + Math.random() * 1.6,
        type: Math.random() < 0.3 ? 'cu' : 'linker',
      }));
    }
    resize();
    window.addEventListener('resize', resize);

    function tick() {
      const isLight = currentTheme() === 'light';
      const lineAlphaBase = isLight ? 0.10 : 0.06;
      const partAlpha     = isLight ? 0.55 : 0.85;
      const lineColor     = isLight ? '37,99,235' : '96,165,250';

      ctx.clearRect(0, 0, W, H);

      // connections
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          const a = parts[i], b = parts[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < 120) {
            const op = lineAlphaBase * (1 - d / 120);
            ctx.strokeStyle = `rgba(${lineColor},${op.toFixed(3)})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // particles
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        if (p.type === 'cu') {
          ctx.fillStyle = `rgba(251,146,60,${partAlpha})`;
          ctx.shadowColor = 'rgba(251,146,60,0.7)';
        } else {
          ctx.fillStyle = `rgba(59,130,246,${partAlpha})`;
          ctx.shadowColor = 'rgba(59,130,246,0.7)';
        }
        ctx.shadowBlur = isLight ? 3 : 6;
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      requestAnimationFrame(tick);
    }
    tick();
  }

/* ----- PWA: service-worker registration + install prompt ----- */
  function setupPWA() {
    // 이미 네이티브 앱(Capacitor) 안에서 실행 중이면 설치 버튼 자체를 띄우지 않음
    const isNativeApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (isNativeApp) return;

    // 1) register the service worker (skips file:// where SW is banned)
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js', { scope: './' })
          .catch(err => console.warn('[PWA] SW register failed:', err));
      });
    }

    const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.sumin0602.mofexplorer';
    const isAndroid = /Android/i.test(navigator.userAgent);

    if (isAndroid) {
      // 안드로이드 모바일 웹 → Play 스토어로 바로 연결
      showStoreButton();
      return;
    }

    // 2) (iOS/PC 등) 기존 PWA 설치 프롬프트 유지
    let deferred = null;
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferred = e;
      showInstallButton();
    });
    window.addEventListener('appinstalled', () => {
      hideInstallButton();
      deferred = null;
    });

    function showStoreButton() {
      if (document.getElementById('pwaInstallBtn')) return;
      const btn = document.createElement('a');
      btn.id = 'pwaInstallBtn';
      btn.href = PLAY_STORE_URL;
      btn.target = '_blank';
      btn.rel = 'noopener';
      btn.setAttribute('aria-label', T('pwa.installStore', 'Google Play에서 앱으로 설치'));
      btn.innerHTML = T('pwa.install', '📲 앱으로 설치');
      Object.assign(btn.style, {
        position: 'fixed', bottom: '18px', right: '18px', zIndex: 200,
        background: 'linear-gradient(135deg,#1e40af,#3b82f6)',
        color: '#fff', border: 'none', borderRadius: '100px',
        padding: '0.6rem 1.1rem', fontSize: '0.88rem', fontWeight: '600',
        boxShadow: '0 6px 20px rgba(30,64,175,0.45)', cursor: 'pointer',
        fontFamily: 'inherit', textDecoration: 'none', display: 'inline-block',
      });
      document.body.appendChild(btn);
    }

    function showInstallButton() {
      if (document.getElementById('pwaInstallBtn')) return;
      const btn = document.createElement('button');
      btn.id = 'pwaInstallBtn';
      btn.setAttribute('aria-label', T('pwa.install', '📲 앱으로 설치'));
      btn.innerHTML = T('pwa.install', '📲 앱으로 설치');
      Object.assign(btn.style, {
        position: 'fixed', bottom: '18px', right: '18px', zIndex: 200,
        background: 'linear-gradient(135deg,#1e40af,#3b82f6)',
        color: '#fff', border: 'none', borderRadius: '100px',
        padding: '0.6rem 1.1rem', fontSize: '0.88rem', fontWeight: '600',
        boxShadow: '0 6px 20px rgba(30,64,175,0.45)', cursor: 'pointer',
        fontFamily: 'inherit',
      });
      btn.addEventListener('click', async () => {
        if (!deferred) return;
        deferred.prompt();
        try { await deferred.userChoice; } catch (_) {}
        deferred = null;
        hideInstallButton();
      });
      document.body.appendChild(btn);
    }
    function hideInstallButton() {
      const b = document.getElementById('pwaInstallBtn');
      if (b) b.remove();
    }
  }

  // when the language changes, refresh bits that are set imperatively
  // (the theme button's emoji stays, but its aria-label is localized)
  document.addEventListener('i18n:changed', refreshToggleIcon);
  document.addEventListener('i18n:changed', updateLangSeg);

  document.addEventListener('DOMContentLoaded', () => {
    renderNav();
    setupParticles();
    renderFooter();
    setupPWA();
  });
})();
