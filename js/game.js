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
    normal: { name: '일반 모드',    pores: 5,  time: 0,  penalty: 0, pointPerPore: 10, timeBonus: false, cols: 7, rows: 5 },
    time:   { name: '타임 챌린지',  pores: 8,  time: 30, penalty: 0, pointPerPore: 10, timeBonus: true,  cols: 7, rows: 5 },
    hard:   { name: '하드 모드',    pores: 10, time: 0,  penalty: 5, pointPerPore: 15, timeBonus: false, cols: 7, rows: 5 },
    blitz:  { name: '블리츠',       pores: 15, time: 60, penalty: 3, pointPerPore: 12, timeBonus: true,  cols: 9, rows: 7 },
  };

  const RANK_KEY = 'mof_ranking';
  const MAX_RANK = 20;

  /* ---------- Screen mgmt ---------- */
  const screens = ['screenTitle', 'screenName', 'screenGame', 'screenResult'];
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

  /* ---------- Initial render ---------- */
  renderRank();
  show('screenTitle');
})();
