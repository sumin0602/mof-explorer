/* ============================================
   MOF Explorer — HKUST-1 Pore Hunt
   ============================================ */

(function () {

  /* ---------- Sound effects (Web Audio API) ---------- */
  const SFX = (function () {
    const KEY = 'mof_sfx_muted';
    let ctx = null;
    let muted = false;
    try { muted = localStorage.getItem(KEY) === '1'; } catch (_) {}

    function ensure() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }

    function blip({ freq = 800, freqEnd = freq, dur = 0.15, type = 'sine', vol = 0.18, attack = 0.005, slide = 'exp' }) {
      if (muted) return;
      ensure();
      if (!ctx) return;
      // resume if suspended (autoplay policy)
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (freqEnd !== freq) {
        if (slide === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
        else osc.frequency.linearRampToValueAtTime(freqEnd, t + dur);
      }
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }

    function noise({ dur = 0.18, vol = 0.12, freq = 200, q = 1 }) {
      if (muted) return;
      ensure();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const t = ctx.currentTime;
      const bufSize = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
      const src  = ctx.createBufferSource();
      const filt = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      src.buffer = buf;
      filt.type = 'bandpass';
      filt.frequency.value = freq;
      filt.Q.value = q;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filt).connect(gain).connect(ctx.destination);
      src.start(t);
    }

    return {
      get muted() { return muted; },
      setMuted(v) {
        muted = !!v;
        try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (_) {}
      },
      unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
      hit(combo = 0) {
        // higher combo → higher pitch
        const base = 660 + Math.min(combo, 5) * 110;
        blip({ freq: base, freqEnd: base * 2, dur: 0.13, type: 'triangle', vol: 0.18 });
      },
      miss() {
        blip({ freq: 280, freqEnd: 90,  dur: 0.22, type: 'sawtooth', vol: 0.10 });
        noise({ dur: 0.12, vol: 0.06, freq: 200, q: 0.7 });
      },
      combo(n) {
        // ascending chord tap
        const f = 520 + (n - 2) * 90;
        blip({ freq: f, freqEnd: f * 1.8, dur: 0.10, type: 'sine',     vol: 0.10 });
        setTimeout(() => blip({ freq: f * 1.5, freqEnd: f * 2.2, dur: 0.10, type: 'sine', vol: 0.08 }), 60);
      },
      hint() {
        blip({ freq: 880,  freqEnd: 1320, dur: 0.18, type: 'sine',     vol: 0.10 });
        setTimeout(() => blip({ freq: 1320, freqEnd: 1760, dur: 0.18, type: 'sine', vol: 0.07 }), 90);
      },
      win(grade) {
        // grade: S/A/B/C
        const seqs = {
          S: [523.25, 659.25, 783.99, 1046.5],
          A: [523.25, 659.25, 783.99],
          B: [523.25, 659.25],
          C: [392.0,  523.25],
        };
        const seq = seqs[grade] || seqs.B;
        seq.forEach((f, i) => setTimeout(() =>
          blip({ freq: f, freqEnd: f, dur: 0.22, type: 'triangle', vol: 0.14 }), i * 130));
      },
      gameOver() {
        blip({ freq: 440, freqEnd: 220, dur: 0.4, type: 'sawtooth', vol: 0.12 });
      },
      tick() {
        blip({ freq: 1100, freqEnd: 1100, dur: 0.05, type: 'square', vol: 0.05 });
      },
    };
  })();
  // unlock audio on first interaction anywhere
  ['click', 'keydown', 'touchstart'].forEach(ev =>
    window.addEventListener(ev, () => SFX.unlock(), { once: true }));

  const MODES = {
    normal: { name: '일반 모드',    pores: 5,  time: 0,  penalty: 0, pointPerPore: 10, timeBonus: false, cols: 7, rows: 5, kind: '2d' },
    time:   { name: '타임 챌린지',  pores: 8,  time: 30, penalty: 0, pointPerPore: 10, timeBonus: true,  cols: 7, rows: 5, kind: '2d' },
    hard:   { name: '하드 모드',    pores: 10, time: 0,  penalty: 5, pointPerPore: 15, timeBonus: false, cols: 7, rows: 5, kind: '2d' },
    blitz:  { name: '블리츠',       pores: 15, time: 60, penalty: 3, pointPerPore: 12, timeBonus: true,  cols: 9, rows: 7, kind: '2d' },
    pore3d: { name: '3D 기공 헌트', time: 90, penalty: 3, supercell: 2, kind: 'pore3d' },
    detective: { name: 'MOF 탐정', rounds: 5, kind: 'detective' },
  };

  const RANK_KEY = 'mof_ranking';
  const MAX_RANK = 20;

  /* ---------- Screen mgmt ---------- */
  const screens = ['screenTitle', 'screenName', 'screenGame', 'screenPore3D', 'screenDetective', 'screenResult'];
  function show(id) {
    screens.forEach(s => {
      document.getElementById(s).classList.toggle('active', s === id);
    });
    window.scrollTo({ top: 0 });
  }

  /* ---------- LocalStorage ranking ---------- */
  function loadRank() {
    try {
      const raw = localStorage.getItem(RANK_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function saveRank(arr) {
    try { localStorage.setItem(RANK_KEY, JSON.stringify(arr)); } catch (e) {}
  }
  function renderRank() {
    const list = loadRank();
    const top = list.slice(0, 8);
    const el = document.getElementById('rankList');
    if (top.length === 0) {
      el.innerHTML = `<div class="rank-empty">아직 기록이 없습니다. 첫 탐험가가 되어보세요!</div>`;
      return;
    }
    el.innerHTML = top.map((r, i) => {
      const cls = i === 0 ? 'first' : i === 1 ? 'second' : i === 2 ? 'third' : '';
      return `
        <div class="rank-row ${cls}">
          <div class="pos">${i + 1}위</div>
          <div class="name">${escapeHtml(r.name)}</div>
          <div class="mode">${escapeHtml(r.mode)}</div>
          <div class="score">${r.score}점</div>
          <div class="acc">${r.acc}%</div>
        </div>
      `;
    }).join('');
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  document.getElementById('clearRank').addEventListener('click', () => {
    if (confirm('랭킹을 모두 초기화하시겠습니까?')) {
      saveRank([]);
      renderRank();
    }
  });

  /* ---------- Mode selection ---------- */
  let selectedMode = 'normal';
  document.querySelectorAll('#modeCards .mode-card').forEach(c => {
    c.addEventListener('click', () => {
      selectedMode = c.dataset.mode;
      document.getElementById('nameModeInfo').textContent = `모드: ${MODES[selectedMode].name}`;
      document.getElementById('playerName').value = '';
      show('screenName');
      setTimeout(() => document.getElementById('playerName').focus(), 50);
    });
  });

  document.getElementById('nameBack').addEventListener('click', () => show('screenTitle'));
  document.getElementById('nameStart').addEventListener('click', startGameFromName);
  document.getElementById('playerName').addEventListener('keydown', e => {
    if (e.key === 'Enter') startGameFromName();
  });

  function startGameFromName() {
    const n = document.getElementById('playerName').value.trim();
    if (!n) {
      document.getElementById('playerName').focus();
      return;
    }
    state.player = n;
    startGame(selectedMode);
  }

  /* ---------- Game state ---------- */
  const state = {
    mode: 'normal',
    cfg: null,
    score: 0,
    combo: 0,
    bestCombo: 0,
    attempts: 0,
    hits: 0,
    hintsLeft: 2,
    timeLeft: 0,
    timeTotal: 0,
    timer: null,
    startedAt: 0,
    running: false,
    player: '',
    cells: [],       // [{cx, cy, isPore, found, hintShown}]
    cols: 7, rows: 5,
    cellW: 0, cellH: 0,
    pad: 0,
    toasts: [],      // {x,y,text,color,t}
    animateUntil: 0,
  };

  const cv  = document.getElementById('gameCanvas');
  const ctx = cv.getContext('2d');
  const boardWrap = document.getElementById('boardWrap');

  const tcv  = document.getElementById('timerRing');
  const tctx = tcv.getContext('2d');

  /* ---------- Layout ---------- */
  function fitCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const r = boardWrap.getBoundingClientRect();
    cv.width  = r.width  * dpr;
    cv.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return r;
  }

  function buildBoard(mode) {
    state.mode = mode;
    state.cfg  = MODES[mode];
    state.cols = state.cfg.cols;
    state.rows = state.cfg.rows;
    state.score = 0;
    state.combo = 0;
    state.bestCombo = 0;
    state.attempts = 0;
    state.hits = 0;
    state.hintsLeft = 2;
    state.toasts = [];

    const rect = fitCanvas();
    const W = rect.width, H = rect.height;
    state.pad = Math.min(W, H) * 0.08;
    state.cellW = (W - state.pad * 2) / state.cols;
    state.cellH = (H - state.pad * 2) / state.rows;

    // build cells
    const all = [];
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        all.push({
          cx: state.pad + state.cellW * (c + 0.5),
          cy: state.pad + state.cellH * (r + 0.5),
          isPore: false,
          found: false,
          hintShown: false,
        });
      }
    }
    // shuffle + assign pores
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    const poreCount = Math.min(state.cfg.pores, all.length);
    for (let i = 0; i < poreCount; i++) all[i].isPore = true;
    state.cells = all;
  }

  /* ---------- Timer ---------- */
  function startTimer() {
    state.startedAt = Date.now();
    if (state.cfg.time > 0) {
      state.timeTotal = state.cfg.time;
      state.timeLeft  = state.cfg.time;
      updateTimerRing(1, state.timeLeft);
      state.timer = setInterval(() => {
        state.timeLeft--;
        updateTimerRing(state.timeLeft / state.timeTotal, state.timeLeft);
        document.getElementById('progressFill').style.width = (state.timeLeft / state.timeTotal * 100) + '%';
        const pf = document.getElementById('progressFill');
        if (state.timeLeft <= 5) {
          pf.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
          if (state.timeLeft > 0) SFX.tick();
        } else if (state.timeLeft <= 15) {
          pf.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
        }
        if (state.timeLeft <= 0) endGame(false);
      }, 1000);
    } else {
      state.timeTotal = 0;
      state.timeLeft  = 0;
      updateTimerRing(1, 0);
      document.getElementById('progressFill').style.width = '100%';
    }
  }
  function stopTimer() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
  }

  function updateTimerRing(frac, sec) {
    const W = tcv.width, H = tcv.height;
    tctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 8;

    // bg ring
    tctx.strokeStyle = 'rgba(59,130,246,0.15)';
    tctx.lineWidth = 6;
    tctx.beginPath();
    tctx.arc(cx, cy, r, 0, Math.PI * 2);
    tctx.stroke();

    if (state.cfg && state.cfg.time > 0) {
      const col = sec <= 5  ? '#f87171'
                : sec <= 15 ? '#fbbf24'
                :             '#3b82f6';
      tctx.strokeStyle = col;
      tctx.lineWidth = 6;
      tctx.lineCap = 'round';
      tctx.beginPath();
      tctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      tctx.stroke();

      tctx.fillStyle = col;
      tctx.font = 'bold 18px Orbitron, sans-serif';
      tctx.textAlign = 'center';
      tctx.textBaseline = 'middle';
      tctx.fillText(String(Math.max(0, sec)), cx, cy);
    } else {
      tctx.strokeStyle = '#3b82f6';
      tctx.lineWidth = 6;
      tctx.beginPath();
      tctx.arc(cx, cy, r, 0, Math.PI * 2);
      tctx.stroke();
      tctx.fillStyle = '#60a5fa';
      tctx.font = 'bold 22px Orbitron, sans-serif';
      tctx.textAlign = 'center';
      tctx.textBaseline = 'middle';
      tctx.fillText('∞', cx, cy);
    }
  }

  /* ---------- HUD ---------- */
  function updateHud() {
    document.getElementById('hudScore').textContent = state.score;
    const left = state.cells.filter(c => c.isPore && !c.found).length;
    document.getElementById('hudPores').textContent = left;
    document.getElementById('hudHints').textContent = state.hintsLeft;
    const cb = document.getElementById('comboBadge');
    if (state.combo >= 2) {
      cb.classList.add('show');
      document.getElementById('comboNum').textContent = comboMultiplier(state.combo);
    } else {
      cb.classList.remove('show');
    }
  }

  function comboMultiplier(c) {
    if (c <= 1) return 1;
    if (c === 2) return 2;
    if (c === 3) return 3;
    if (c === 4) return 4;
    return 5;
  }

  /* ---------- Drawing ---------- */
  function draw() {
    if (!state.running) return;

    const rect = boardWrap.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);

    // grid bg
    ctx.fillStyle = 'rgba(4,9,26,0.4)';
    ctx.fillRect(0, 0, W, H);

    // grid lines
    ctx.strokeStyle = 'rgba(59,130,246,0.22)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= state.cols; c++) {
      const x = state.pad + state.cellW * c;
      ctx.beginPath(); ctx.moveTo(x, state.pad); ctx.lineTo(x, H - state.pad); ctx.stroke();
    }
    for (let r = 0; r <= state.rows; r++) {
      const y = state.pad + state.cellH * r;
      ctx.beginPath(); ctx.moveTo(state.pad, y); ctx.lineTo(W - state.pad, y); ctx.stroke();
    }

    // linkers at cell mid-edges
    ctx.fillStyle = '#3b82f6';
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        // right edge
        if (c < state.cols - 1) {
          const x = state.pad + state.cellW * (c + 1);
          const y = state.pad + state.cellH * (r + 0.5);
          drawLinker(x, y);
        }
        // bottom edge
        if (r < state.rows - 1) {
          const x = state.pad + state.cellW * (c + 0.5);
          const y = state.pad + state.cellH * (r + 1);
          drawLinker(x, y);
        }
      }
    }

    // Cu nodes at intersections
    for (let r = 0; r <= state.rows; r++) {
      for (let c = 0; c <= state.cols; c++) {
        const x = state.pad + state.cellW * c;
        const y = state.pad + state.cellH * r;
        drawCu(x, y);
      }
    }

    // found pores + hint pores
    const t = performance.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);

    state.cells.forEach(cell => {
      if (cell.found) {
        const rad = Math.min(state.cellW, state.cellH) * 0.36;
        ctx.save();
        ctx.strokeStyle = `rgba(34,197,94,${0.55 + 0.35 * pulse})`;
        ctx.lineWidth = 2.4;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(cell.cx, cell.cy, rad + pulse * 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // check mark
        ctx.fillStyle = '#22c55e';
        ctx.font = 'bold 18px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✓', cell.cx, cell.cy);
      } else if (cell.hintShown && cell.isPore) {
        const rad = Math.min(state.cellW, state.cellH) * 0.36;
        ctx.save();
        ctx.strokeStyle = `rgba(245,158,11,${0.55 + 0.35 * pulse})`;
        ctx.lineWidth = 2.4;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(cell.cx, cell.cy, rad + pulse * 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 14px Orbitron';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', cell.cx, cell.cy);
      }
    });

    // toasts
    const now = performance.now();
    state.toasts = state.toasts.filter(t => now - t.t0 < 900);
    state.toasts.forEach(t => {
      const dt = (now - t.t0) / 900;
      const alpha = 1 - dt;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = t.color;
      ctx.font = 'bold 22px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x, t.y - dt * 40);
      ctx.restore();
    });

    requestAnimationFrame(draw);
  }

  function drawCu(x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#fb923c';
    ctx.shadowColor = 'rgba(251,146,60,0.6)';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Cu', x, y);
  }
  function drawLinker(x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#3b82f6';
    ctx.shadowColor = 'rgba(59,130,246,0.6)';
    ctx.shadowBlur = 5;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  /* ---------- Interaction ---------- */
  cv.addEventListener('click', e => {
    if (!state.running) return;
    const r = cv.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;

    // find candidate cell whose center is within 44% of cell size
    let hit = null;
    let bestD = Infinity;
    for (const cell of state.cells) {
      const dx = cell.cx - x, dy = cell.cy - y;
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; hit = cell; }
    }
    const tol = Math.min(state.cellW, state.cellH) * 0.44;

    state.attempts++;

    if (hit && bestD <= tol && hit.isPore && !hit.found) {
      // HIT
      hit.found = true;
      hit.hintShown = false;
      state.hits++;
      state.combo++;
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      const mult = comboMultiplier(state.combo);
      const pts = state.cfg.pointPerPore * mult;
      state.score += pts;
      pushToast(x, y, '+' + pts, '#22c55e');
      SFX.hit(state.combo);
      if (state.combo >= 2 && state.combo <= 5) SFX.combo(state.combo);
      updateHud();
      // any left?
      const left = state.cells.filter(c => c.isPore && !c.found).length;
      if (left === 0) {
        // time bonus
        if (state.cfg.timeBonus && state.cfg.time > 0) {
          const bonus = state.timeLeft * 2;
          state.score += bonus;
        }
        endGame(true);
      }
    } else {
      // MISS
      state.combo = 0;
      if (state.cfg.penalty) {
        state.score = Math.max(0, state.score - state.cfg.penalty);
        pushToast(x, y, '-' + state.cfg.penalty, '#ef4444');
      } else {
        pushToast(x, y, '✗', '#ef4444');
      }
      SFX.miss();
      updateHud();
      boardWrap.classList.remove('shake');
      void boardWrap.offsetWidth;
      boardWrap.classList.add('shake');
    }
  });

  function pushToast(x, y, text, color) {
    state.toasts.push({ x, y, text, color, t0: performance.now() });
  }

  /* ---------- Hint ---------- */
  document.getElementById('useHint').addEventListener('click', () => {
    if (!state.running) return;
    if (state.hintsLeft <= 0) return;
    const remaining = state.cells.filter(c => c.isPore && !c.found && !c.hintShown);
    if (remaining.length === 0) return;
    const choice = remaining[Math.floor(Math.random() * remaining.length)];
    choice.hintShown = true;
    state.hintsLeft--;
    state.combo = 0;
    SFX.hint();
    updateHud();
  });

  document.getElementById('quitGame').addEventListener('click', () => {
    if (confirm('정말 게임을 종료하시겠습니까?')) endGame(false);
  });

  /* ---------- Mute toggle ---------- */
  const muteBtn = document.getElementById('muteBtn');
  function refreshMuteIcon() { muteBtn.textContent = SFX.muted ? '🔇' : '🔊'; }
  muteBtn.addEventListener('click', () => {
    SFX.setMuted(!SFX.muted);
    refreshMuteIcon();
    if (!SFX.muted) SFX.hit(1);
  });
  refreshMuteIcon();

  /* ---------- Game start / end ---------- */
  function startGame(mode) {
    state.mode = mode;
    state.cfg  = MODES[mode];

    if (state.cfg.kind === 'pore3d')    { startPore3D();    return; }
    if (state.cfg.kind === 'detective') { startDetective(); return; }

    // ----- 2D classic flow -----
    buildBoard(mode);
    state.running = true;
    document.getElementById('modeBadge').textContent = '모드: ' + state.cfg.name;
    updateHud();
    show('screenGame');
    setTimeout(() => {
      buildBoard(mode);
      updateHud();
      startTimer();
      requestAnimationFrame(draw);
    }, 30);
  }

  function endGame(victorious) {
    state.running = false;
    stopTimer();
    const elapsed = state.cfg.time > 0
      ? (state.cfg.time - state.timeLeft)
      : Math.floor((Date.now() - state.startedAt) / 1000);
    const acc = state.attempts === 0 ? 0 : Math.round((state.hits / state.attempts) * 100);

    const grade = state.score >= 200 ? 'S' : state.score >= 120 ? 'A' : state.score >= 60 ? 'B' : 'C';
    if (victorious) setTimeout(() => SFX.win(grade), 200);
    else            setTimeout(() => SFX.gameOver(), 100);

    showResult({ score: state.score, acc, elapsed, grade });
  }

  /* ---------- Result ---------- */
  function showResult({ score, acc, elapsed, grade }) {
    if (!grade) grade = score >= 200 ? 'S' : score >= 120 ? 'A' : score >= 60 ? 'B' : 'C';
    const msgs = {
      S: '완벽한 탐험가!',
      A: '훌륭한 실력!',
      B: '잘했어요!',
      C: '도전 완료! 한 번 더?',
    };
    const gt = document.getElementById('gradeText');
    gt.textContent = grade;
    gt.className = 'grade grade-' + grade;
    document.getElementById('gradeMsg').textContent = msgs[grade];
    document.getElementById('resScore').textContent = score;
    document.getElementById('resAcc').textContent   = acc + '%';
    document.getElementById('resTime').textContent  = elapsed + 's';

    document.getElementById('resName').value = state.player || '';

    show('screenResult');

    // bind dynamic events
    const saveBtn = document.getElementById('saveRankBtn');
    const retry   = document.getElementById('retryBtn');
    const home    = document.getElementById('backHomeBtn');

    saveBtn.onclick = () => {
      const n = document.getElementById('resName').value.trim();
      if (!n) {
        document.getElementById('resName').focus();
        return;
      }
      const list = loadRank();
      list.push({
        name: n,
        score,
        mode: state.cfg.name,
        acc,
        time: elapsed,
        ts: Date.now(),
      });
      list.sort((a, b) => b.score - a.score);
      saveRank(list.slice(0, MAX_RANK));
      renderRank();
      saveBtn.textContent = '✓ 등록됨';
      saveBtn.disabled = true;
    };

    retry.onclick = () => {
      saveBtn.disabled = false;
      saveBtn.textContent = '랭킹 등록';
      startGame(state.mode);
    };
    home.onclick = () => {
      saveBtn.disabled = false;
      saveBtn.textContent = '랭킹 등록';
      show('screenTitle');
      renderRank();
    };
  }

  /* ---------- Resize ---------- */
  window.addEventListener('resize', () => {
    if (state.running) {
      // rebuild board layout while preserving pore positions logically
      const wasFound = state.cells.map(c => c.found);
      const wasHint  = state.cells.map(c => c.hintShown);
      const wasPore  = state.cells.map(c => c.isPore);

      const rect = fitCanvas();
      const W = rect.width, H = rect.height;
      state.pad = Math.min(W, H) * 0.08;
      state.cellW = (W - state.pad * 2) / state.cols;
      state.cellH = (H - state.pad * 2) / state.rows;

      let i = 0;
      for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
          const cell = state.cells[i];
          if (!cell) { i++; continue; }
          cell.cx = state.pad + state.cellW * (c + 0.5);
          cell.cy = state.pad + state.cellH * (r + 0.5);
          cell.isPore    = wasPore[i];
          cell.found     = wasFound[i];
          cell.hintShown = wasHint[i];
          i++;
        }
      }
    }
  });

  /* ============================================================
     3D MODES (require Three.js + MOFViewer)
     ============================================================ */

  const pore3d = {
    viewer: null, mof: null, pores: [], timer: null, totalT: 90,
    score: 0, combo: 0, hits: 0, attempts: 0, timeLeft: 0, running: false,
  };
  const det = {
    viewer: null, round: 0, score: 0, correctMof: null,
    answered: false, hintUsed: false,
  };

  function require3D() {
    if (!window.MOFViewer || !window.THREE) {
      alert('3D 라이브러리(Three.js)를 불러올 수 없습니다.\n로컬 서버(npm start)에서 실행하거나 인터넷 연결을 확인해주세요.');
      show('screenTitle');
      return false;
    }
    return true;
  }

  /* ---------- 3D PORE HUNT ---------- */
  function startPore3D() {
    if (!require3D()) return;

    const pool = ['hkust1', 'uio66'];   // skip MOF-5 (heavy for 2x2x2)
    const mofKey = pool[Math.floor(Math.random() * pool.length)];
    pore3d.mof = window.MOFViewer.REGISTRY[mofKey];

    pore3d.score = 0;
    pore3d.combo = 0;
    pore3d.hits = 0;
    pore3d.attempts = 0;
    pore3d.totalT  = state.cfg.time || 90;
    pore3d.timeLeft = pore3d.totalT;
    pore3d.running = false;
    pore3d.pores = [];

    document.getElementById('hud3dScore').textContent = '0';
    document.getElementById('hud3dPores').textContent = '...';
    document.getElementById('mode3dBadge').textContent = `${pore3d.mof.name} · ${state.cfg.supercell || 2}×${state.cfg.supercell || 2}×${state.cfg.supercell || 2} 슈퍼셀`;
    document.getElementById('combo3d').classList.remove('show');
    document.getElementById('progress3dFill').style.width = '100%';

    show('screenPore3D');

    const loading = document.getElementById('pore3dLoading');
    loading.style.display = 'flex';
    loading.innerHTML = '<div class="viewer-spinner"></div><div>3D 구조 준비 중...</div>';

    if (pore3d.viewer) { try { pore3d.viewer.dispose(); } catch (_) {} pore3d.viewer = null; }
    document.getElementById('pore3dMount').innerHTML = '';

    pore3d.viewer = window.MOFViewer.create({
      mount: document.getElementById('pore3dMount'),
      showPores: true,
      showBonds: true,
      autoRotate: false,
      supercell: state.cfg.supercell || 2,
      hiddenPores: true,        // pores exist but invisible until found
      poreClickRadius: 1.2,
      onPoreClick: () => {},     // pores can't be directly hit while hidden
      onAtomClick: () => {},
      onEmptyClick: ({ nearestPore }) => {
        if (!pore3d.running) return;
        pore3d.attempts++;
        if (nearestPore < 0) {
          // MISS
          pore3d.combo = 0;
          if (state.cfg.penalty) pore3d.score = Math.max(0, pore3d.score - state.cfg.penalty);
          SFX.miss();
          const bw = document.getElementById('board3dWrap');
          bw.classList.remove('shake'); void bw.offsetWidth; bw.classList.add('shake');
          updatePore3DHud();
          return;
        }
        const p = pore3d.pores[nearestPore];
        if (!p || p.found) return;
        // HIT
        p.found = true;
        pore3d.viewer.revealPore(nearestPore);
        pore3d.hits++;
        pore3d.combo++;
        const bucket = window.MOFViewer.poreColor(p.radius).bucket;
        const basePts = 10 + bucket * 5;
        const mult = comboMultiplier(pore3d.combo);
        const pts = basePts * mult;
        pore3d.score += pts;
        SFX.hit(pore3d.combo);
        if (pore3d.combo >= 2 && pore3d.combo <= 5) SFX.combo(pore3d.combo);
        updatePore3DHud();
        if (pore3d.pores.every(p => p.found)) {
          // win — time bonus
          if (pore3d.timeLeft > 0) pore3d.score += pore3d.timeLeft * 2;
          endPore3D(true);
        }
      },
      onReady: ({ pores }) => {
        pore3d.pores = pores.map(p => ({ position: p.position, radius: p.radius, found: false }));
        document.getElementById('hud3dPores').textContent = pore3d.pores.length;
        renderPore3DLegend(pore3d.pores);
        loading.style.display = 'none';
        pore3d.running = true;
        startPore3DTimer();
      },
    });

    pore3d.viewer.loadFromURL(pore3d.mof.cif, pore3d.mof.id).catch(err => {
      loading.innerHTML = `<div style="color:var(--err); padding:1rem; text-align:center;">⚠ ${pore3d.mof.name} 로드 실패<br><span style="font-size:0.82rem; opacity:0.7;">${String(err.message || err)}</span></div>`;
    });
  }

  function renderPore3DLegend(pores) {
    const el = document.getElementById('pore3dLegend');
    if (!el || !window.MOFViewer) return;
    const buckets = new Map();
    pores.forEach(p => {
      const c = window.MOFViewer.poreColor(p.radius);
      const cur = buckets.get(c.bucket) || { hex: c.hex, label: c.label, count: 0 };
      cur.count++;
      buckets.set(c.bucket, cur);
    });
    const sorted = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
    el.innerHTML = `
      <span style="font-size:0.7rem; color:var(--txm); font-family:'Orbitron';">숨겨진 기공:</span>
      ${sorted.map(([_, b]) => `
        <span class="pl-item">
          <span class="pl-dot" style="background:${b.hex}; color:${b.hex};"></span>
          <span style="color:var(--txm);">${b.label} · <strong style="color:${b.hex};">${b.count}개</strong></span>
        </span>
      `).join('')}
    `;
  }

  function updatePore3DHud() {
    document.getElementById('hud3dScore').textContent = pore3d.score;
    const left = pore3d.pores.filter(p => !p.found).length;
    document.getElementById('hud3dPores').textContent = left;
    const cb = document.getElementById('combo3d');
    if (pore3d.combo >= 2) {
      cb.classList.add('show');
      document.getElementById('combo3dNum').textContent = comboMultiplier(pore3d.combo);
    } else cb.classList.remove('show');
  }

  function startPore3DTimer() {
    if (pore3d.timer) clearInterval(pore3d.timer);
    drawTimerRing3d(1, pore3d.timeLeft);
    pore3d.timer = setInterval(() => {
      pore3d.timeLeft--;
      const frac = pore3d.timeLeft / pore3d.totalT;
      drawTimerRing3d(frac, pore3d.timeLeft);
      const pf = document.getElementById('progress3dFill');
      pf.style.width = (frac * 100) + '%';
      if (pore3d.timeLeft <= 5) {
        pf.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
        if (pore3d.timeLeft > 0) SFX.tick();
      } else if (pore3d.timeLeft <= 15) {
        pf.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
      }
      if (pore3d.timeLeft <= 0) endPore3D(false);
    }, 1000);
  }

  function drawTimerRing3d(frac, sec) {
    const c = document.getElementById('timerRing3d');
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 8;
    ctx.strokeStyle = 'rgba(59,130,246,0.15)';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    const col = sec <= 5 ? '#f87171' : sec <= 15 ? '#fbbf24' : '#3b82f6';
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, frac));
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.font = 'bold 18px Orbitron, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.max(0, sec)), cx, cy);
  }

  function endPore3D(victorious) {
    pore3d.running = false;
    if (pore3d.timer) { clearInterval(pore3d.timer); pore3d.timer = null; }
    const elapsed = pore3d.totalT - pore3d.timeLeft;
    const acc = pore3d.attempts === 0 ? 0 : Math.round((pore3d.hits / pore3d.attempts) * 100);
    const grade = pore3d.score >= 220 ? 'S' : pore3d.score >= 140 ? 'A' : pore3d.score >= 70 ? 'B' : 'C';
    if (victorious) setTimeout(() => SFX.win(grade), 200);
    else            setTimeout(() => SFX.gameOver(), 100);
    if (pore3d.viewer) { try { pore3d.viewer.dispose(); } catch (_) {} pore3d.viewer = null; }
    state.score = pore3d.score;
    showResult({ score: pore3d.score, acc, elapsed, grade });
  }

  document.getElementById('quit3dBtn').addEventListener('click', () => {
    if (confirm('정말 게임을 종료하시겠습니까?')) endPore3D(false);
  });
  document.getElementById('mute3dBtn').addEventListener('click', () => {
    SFX.setMuted(!SFX.muted);
    document.getElementById('mute3dBtn').textContent = SFX.muted ? '🔇' : '🔊';
    if (!SFX.muted) SFX.hit(1);
  });

  /* ---------- MOF DETECTIVE ---------- */
  function startDetective() {
    if (!require3D()) return;
    det.round = 0;
    det.score = 0;
    document.getElementById('hudDetScore').textContent = '0';
    document.getElementById('detRound').textContent = `0 / ${state.cfg.rounds}`;
    show('screenDetective');
    if (det.viewer) { try { det.viewer.dispose(); } catch (_) {} det.viewer = null; }
    document.getElementById('detMount').innerHTML = '';
    nextDetectiveRound();
  }

  function nextDetectiveRound() {
    det.round++;
    if (det.round > state.cfg.rounds) {
      // game over
      const grade = det.score >= 90 ? 'S' : det.score >= 60 ? 'A' : det.score >= 30 ? 'B' : 'C';
      setTimeout(() => SFX.win(grade), 200);
      if (det.viewer) { try { det.viewer.dispose(); } catch (_) {} det.viewer = null; }
      state.score = det.score;
      const acc = Math.round((det.score / (state.cfg.rounds * 20)) * 100);
      showResult({ score: det.score, acc, elapsed: 0, grade });
      return;
    }
    document.getElementById('detRound').textContent = `${det.round} / ${state.cfg.rounds}`;
    document.getElementById('detFeedback').innerHTML = '';
    document.getElementById('detHintTxt').textContent = '';
    document.getElementById('detHintBtn').disabled = false;
    document.getElementById('detHintBtn').style.opacity = '1';
    det.answered = false;
    det.hintUsed = false;

    const pool = ['hkust1', 'mof5', 'uio66'];
    const correctKey = pool[Math.floor(Math.random() * pool.length)];
    const correct = window.MOFViewer.REGISTRY[correctKey];
    det.correctMof = { id: correctKey, ...correct };

    // choices: 3 from registry + 1 decoy (ZIF-8, no CIF in project)
    const decoy = { id: 'zif8', name: 'ZIF-8', formula: 'Zn(mIm)₂' };
    let choices = [
      { id: 'hkust1', name: 'HKUST-1', formula: 'Cu₃(BTC)₂' },
      { id: 'mof5',   name: 'MOF-5',   formula: 'Zn₄O(BDC)₃' },
      { id: 'uio66',  name: 'UiO-66',  formula: 'Zr₆O₄(OH)₄(BDC)₆' },
      decoy,
    ];
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }

    const cbox = document.getElementById('detChoices');
    cbox.innerHTML = choices.map(c => `
      <button class="det-choice" data-id="${c.id}">
        ${c.name}
        <span class="formula">${c.formula}</span>
      </button>
    `).join('');
    cbox.querySelectorAll('.det-choice').forEach(btn => {
      btn.addEventListener('click', () => answerDetective(btn, btn.dataset.id, correctKey));
    });

    // load 3D structure (no labels)
    const loading = document.getElementById('detLoading');
    loading.style.display = 'flex';
    loading.innerHTML = '<div class="viewer-spinner"></div><div>다음 문제 준비 중...</div>';

    if (det.viewer) { try { det.viewer.dispose(); } catch (_) {} det.viewer = null; }
    document.getElementById('detMount').innerHTML = '';

    det.viewer = window.MOFViewer.create({
      mount: document.getElementById('detMount'),
      showPores: false,
      showBonds: true,
      showAtoms: true,
      autoRotate: true,
      supercell: 1,
      onAtomClick: () => {},
      onPoreClick: () => {},
      onEmptyClick: () => {},
      onReady: () => { loading.style.display = 'none'; },
    });
    det.viewer.loadFromURL(correct.cif, correctKey).catch(err => {
      loading.innerHTML = `<div style="color:var(--err); padding:1rem; text-align:center;">⚠ 로드 실패<br><span style="font-size:0.82rem;">${String(err.message || err)}</span></div>`;
    });
  }

  function answerDetective(btn, pickedId, correctId) {
    if (det.answered) return;
    det.answered = true;
    const all = document.getElementById('detChoices').querySelectorAll('.det-choice');
    all.forEach(b => b.classList.add('disabled'));

    const isCorrect = pickedId === correctId;
    if (isCorrect) {
      btn.classList.add('correct');
      let pts = 20;
      if (det.hintUsed) pts -= 5;
      det.score += pts;
      SFX.hit(2);
      document.getElementById('detFeedback').innerHTML =
        `<span style="color:var(--ok); font-weight:600;">✓ 정답입니다! +${pts}점</span>` +
        `<br><span class="muted" style="font-size:0.82rem;">${det.correctMof.blurb || ''}</span>`;
    } else {
      btn.classList.add('wrong');
      SFX.miss();
      all.forEach(b => { if (b.dataset.id === correctId) b.classList.add('correct'); });
      document.getElementById('detFeedback').innerHTML =
        `<span style="color:var(--err); font-weight:600;">✗ 정답은 <strong>${det.correctMof.name}</strong>입니다.</span>` +
        `<br><span class="muted" style="font-size:0.82rem;">${det.correctMof.blurb || ''}</span>`;
    }
    document.getElementById('hudDetScore').textContent = det.score;
    setTimeout(nextDetectiveRound, 2600);
  }

  document.getElementById('detHintBtn').addEventListener('click', () => {
    if (det.answered || det.hintUsed) return;
    det.hintUsed = true;
    document.getElementById('detHintTxt').textContent = `🔍 단서: ${det.correctMof.hint || '특별한 단서가 없습니다'}`;
    const b = document.getElementById('detHintBtn');
    b.disabled = true;
    b.style.opacity = '0.5';
  });
  document.getElementById('quitDetBtn').addEventListener('click', () => {
    if (!confirm('정말 게임을 종료하시겠습니까?')) return;
    if (det.viewer) { try { det.viewer.dispose(); } catch (_) {} det.viewer = null; }
    state.score = det.score;
    showResult({ score: det.score, acc: 0, elapsed: 0, grade: 'C' });
  });
  document.getElementById('muteDetBtn').addEventListener('click', () => {
    SFX.setMuted(!SFX.muted);
    document.getElementById('muteDetBtn').textContent = SFX.muted ? '🔇' : '🔊';
    if (!SFX.muted) SFX.hit(1);
  });

  /* ---------- Initial render ---------- */
  renderRank();
  show('screenTitle');
})();
