/* ============================================
   MOF Explorer — Common Navigation
   ============================================ */

(function () {
  const PAGES = [
    { href: 'index.html',     label: '홈' },
    { href: 'structure.html', label: '구조 특징' },
    { href: 'game.html',      label: '기공 게임' },
    { href: 'report.html',    label: '보고서' },
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
    btn.setAttribute('aria-label', currentTheme() === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환');
    btn.title = btn.getAttribute('aria-label');
  }
  // expose for other modules
  window.MOFTheme = { current: currentTheme, toggle: toggleTheme, apply: applyTheme };

  function currentPage() {
    const path = location.pathname.split('/').pop() || 'index.html';
    return path === '' ? 'index.html' : path;
  }

  function renderNav() {
    const here = currentPage();
    const nav = document.createElement('nav');
    nav.className = 'nav';
    nav.innerHTML = `
      <a href="index.html" class="logo">⬡ MOF Explorer</a>
      <div class="nav-right">
        <ul id="navList">
          ${PAGES.map(p => `<li><a href="${p.href}" class="${p.href === here ? 'active' : ''}">${p.label}</a></li>`).join('')}
        </ul>
        <button class="theme-toggle" id="themeToggle" aria-label="테마 전환">☀</button>
        <button class="ham" aria-label="메뉴 열기">☰</button>
      </div>
    `;
    document.body.insertBefore(nav, document.body.firstChild);

    const ham = nav.querySelector('.ham');
    const list = nav.querySelector('#navList');
    ham.addEventListener('click', () => list.classList.toggle('open'));

    const btn = nav.querySelector('#themeToggle');
    btn.addEventListener('click', toggleTheme);
    refreshToggleIcon();
  }

  function renderFooter() {
    if (document.querySelector('.footer')) return;
    const f = document.createElement('footer');
    f.className = 'footer';
    f.innerHTML = `© 2026 MOF Explorer · 고등학생을 위한 나노 과학 교육 플랫폼`;
    document.body.appendChild(f);
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
    // 1) register the service worker (skips file:// where SW is banned)
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js', { scope: './' })
          .catch(err => console.warn('[PWA] SW register failed:', err));
      });
    }

    // 2) capture the install prompt and show a small "앱으로 설치" button
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

    function showInstallButton() {
      if (document.getElementById('pwaInstallBtn')) return;
      const btn = document.createElement('button');
      btn.id = 'pwaInstallBtn';
      btn.setAttribute('aria-label', '앱으로 설치');
      btn.innerHTML = '📲 앱으로 설치';
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

  document.addEventListener('DOMContentLoaded', () => {
    renderNav();
    setupParticles();
    renderFooter();
    setupPWA();
  });
})();
