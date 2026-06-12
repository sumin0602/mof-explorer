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
    pore3d:    { name: '3D 기공 헌트', time: 90, penalty: 3, supercell: 2, kind: 'pore3d' },
    detective: { name: 'MOF 탐정',     rounds: 5,                          kind: 'detective' },
    quiz:      { name: 'MOF 개념 마스터', kind: 'quiz',       total: 10, perQuestionSec: 20, fastBonusSec: 10 },
    adsorption:{ name: '기체 분리 실험실', kind: 'adsorption', rounds: 5 },
    flashcard: { name: 'MOF 플래시카드',   kind: 'flashcard',  sets: ['초급','중급','심화'] },
  };

  const RANK_KEY = 'mof_ranking';
  const MAX_RANK = 20;

  /* ---------- Screen mgmt ---------- */
  const screens = [
    'screenTitle', 'screenName', 'screenResult',
    'screenPore3D', 'screenDetective',
    'screenQuiz', 'screenAdsorption', 'screenFlashcard',
  ];
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
    // a11y: make the card focusable + announceable to screen readers
    c.setAttribute('role', 'button');
    c.setAttribute('tabindex', '0');
    const title = (c.querySelector('h4')?.textContent || '').trim();
    if (title) c.setAttribute('aria-label', `${title} 모드 선택`);

    function pick() {
      selectedMode = c.dataset.mode;
      document.getElementById('nameModeInfo').textContent = `모드: ${MODES[selectedMode].name}`;
      document.getElementById('playerName').value = '';
      show('screenName');
      setTimeout(() => document.getElementById('playerName').focus(), 50);
    }
    c.addEventListener('click', pick);
    c.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
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

  /* ---------- Shared minimal state (mode/cfg/player tracked across screens) ---------- */
  const state = {
    mode: 'pore3d',
    cfg:  null,
    player: '',
    score: 0,
  };


  function comboMultiplier(c) {
    if (c <= 1) return 1;
    if (c === 2) return 2;
    if (c === 3) return 3;
    if (c === 4) return 4;
    return 5;
  }

  /* ---------- Game start dispatcher ---------- */
  function startGame(mode) {
    state.mode = mode;
    state.cfg  = MODES[mode];
    if (!state.cfg) return;
    if (state.cfg.kind === 'pore3d')     return startPore3D();
    if (state.cfg.kind === 'detective')  return startDetective();
    if (state.cfg.kind === 'quiz')       return startQuiz();
    if (state.cfg.kind === 'adsorption') return startAdsorption();
    if (state.cfg.kind === 'flashcard')  return startFlashcard();
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
    const reportBtn = document.getElementById('goReportBtn');
    if (reportBtn) reportBtn.onclick = () => { location.href = 'report.html'; };
  }

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

    pore3d.viewer.loadFromKey(pore3d.mof.id).catch(err => {
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
    det.viewer.loadFromKey(correctKey).catch(err => {
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

  /* ============================================================
     CONCEPT QUIZ (MOF 개념 마스터) — OX + 4지선다
     ============================================================ */
  const QUIZ_POOL = [
    // OX 유형
    { type: 'ox', q: 'MOF는 금속 이온과 유기 리간드로 이루어진 다공성 결정이다.', answer: true, explanation: 'MOF = Metal-Organic Framework. 금속 노드와 유기 리간드가 배위결합으로 연결된 다공성 구조체입니다.' },
    { type: 'ox', q: 'HKUST-1의 금속 노드는 아연(Zn)이다.', answer: false, explanation: 'HKUST-1의 금속 노드는 구리(Cu)입니다. Zn 기반 MOF는 MOF-5입니다.' },
    { type: 'ox', q: 'MOF는 기공 크기를 설계 단계에서 조절할 수 있다.', answer: true, explanation: '리간드의 길이와 금속 노드의 종류를 바꾸면 기공 크기를 나노 수준에서 조절할 수 있습니다.' },
    { type: 'ox', q: 'MOF의 비표면적은 최대 1g당 7,000m²에 달할 수 있다.', answer: true, explanation: '일부 MOF는 기존 활성탄보다 훨씬 높은 비표면적을 가집니다.' },
    { type: 'ox', q: 'HKUST-1은 수분에 장기 노출되어도 구조 안정성이 유지된다.', answer: false, explanation: 'HKUST-1의 열린 Cu 사이트는 물 분자와 강하게 상호작용하여 장기 노출 시 구조 안정성이 저하됩니다.' },
    { type: 'ox', q: 'MOF-5의 네트 구조는 pcu(Primitive Cubic net)이다.', answer: true, explanation: 'MOF-5는 6면체 구조가 반복되는 pcu 네트입니다.' },
    { type: 'ox', q: 'MOF는 크로마토그래피의 고정상으로 활용될 수 없다.', answer: false, explanation: 'MOF는 넓은 비표면적과 균일한 기공으로 GC·HPLC 고정상으로 활용됩니다.' },
    { type: 'ox', q: '2차 빌딩유닛(SBU)은 MOF에서 반복적으로 배치되는 무기물 부분이다.', answer: true, explanation: 'SBU(Secondary Building Unit)는 금속 클러스터 부분으로 구조의 노드 역할을 합니다.' },
    { type: 'ox', q: 'UiO-66의 금속 노드는 구리(Cu)이다.', answer: false, explanation: 'UiO-66의 금속 노드는 지르코늄(Zr)입니다. 열·화학적 안정성이 높은 MOF입니다.' },
    { type: 'ox', q: 'MOF는 CO₂ 포집 및 저장 소재로 활용 가능하다.', answer: true, explanation: 'HKUST-1 등은 CO₂의 사중극자 모멘트와 강하게 상호작용해 선택적 흡착이 가능합니다.' },
    // 4지선다 유형
    { type: 'mc', q: 'HKUST-1의 유기 리간드는 무엇인가?', options: ['BDC (벤젠디카르복실산)', 'BTC (벤젠트리카르복실산)', 'BTB (벤젠트리벤조산)', 'BPY (바이피리딘)'], answer: 1, explanation: 'HKUST-1은 Cu₃(BTC)₂로, 1,3,5-벤젠트리카르복실산(BTC) 리간드를 사용합니다.' },
    { type: 'mc', q: 'MOF에서 기공(pore)의 역할로 가장 적절한 것은?', options: ['금속 이온 간 전자 전달', '게스트 분자의 저장 및 선택적 흡착', '유기 리간드의 산화 방지', '결정 구조의 열팽창 완충'], answer: 1, explanation: '기공은 외부 분자(기체, 액체)를 선택적으로 흡착·저장하는 핵심 공간입니다.' },
    { type: 'mc', q: 'MOF-5의 금속 노드를 구성하는 이온은?', options: ['Cu²⁺', 'Fe³⁺', 'Zn²⁺', 'Zr⁴⁺'], answer: 2, explanation: 'MOF-5는 Zn₄O(BDC)₃로, Zn²⁺ 4개가 산소 1개를 중심으로 클러스터를 형성합니다.' },
    { type: 'mc', q: '다음 중 MOF의 응용 분야가 아닌 것은?', options: ['수소 저장', 'CO₂ 포집', '반도체 소자 제작', '약물 전달'], answer: 2, explanation: '반도체 소자 제작은 주로 실리콘 기반 공정으로, 현재 MOF의 주요 응용 분야가 아닙니다.' },
    { type: 'mc', q: 'HKUST-1 활성화 후 형성되는 열린 금속 사이트가 특히 강하게 흡착하는 분자는?', options: ['N₂', 'CH₄', 'CO₂', 'H₂'], answer: 2, explanation: 'CO₂는 사중극자 모멘트가 커서 Cu 열린 금속 사이트와 강하게 상호작용합니다.' },
    { type: 'mc', q: 'MOF의 구조를 기술하는 명명법에서 pcu가 의미하는 것은?', options: ['Porous Copper Unit', 'Primitive Cubic net', 'Periodic Coordination Unit', 'Pore Cluster Union'], answer: 1, explanation: 'pcu는 Primitive Cubic net으로, MOF-5처럼 6면체 구조가 반복되는 네트입니다.' },
    { type: 'mc', q: '다음 중 수분 안정성이 가장 높은 MOF는?', options: ['MOF-5', 'HKUST-1', 'UiO-66', 'MOF-177'], answer: 2, explanation: 'UiO-66은 Zr 금속 노드 기반으로 열적·화학적 안정성이 높아 수분에 강합니다.' },
    { type: 'mc', q: '크로마토그래피에서 MOF를 고정상으로 사용할 때 장점이 아닌 것은?', options: ['균일한 기공 크기', '넓은 비표면적', '높은 전기전도성', '조절 가능한 표면 극성'], answer: 2, explanation: '대부분의 MOF는 전기 절연체입니다. 전기전도성은 MOF 고정상의 장점이 아닙니다.' },
    { type: 'mc', q: 'MOF의 기공 크기를 조절하는 가장 직접적인 방법은?', options: ['온도 변화', '유기 리간드의 길이 조절', '용매 교체', '압력 증가'], answer: 1, explanation: '리간드가 길수록 노드 간 거리가 늘어나 기공이 커집니다. 리간드 설계가 핵심입니다.' },
    { type: 'mc', q: 'IUPAC이 MOF를 정의할 때 핵심으로 제시한 개념은?', options: ['고온 안정성', '잠재적 공극을 갖는 배위화합물', '무기 결정 구조', '공유결합 네트워크'], answer: 1, explanation: 'IUPAC은 MOF를 "유기물 리간드와 잠재적 공극을 갖는 배위화합물"로 정의합니다.' },
  ];

  const quiz = {
    questions: [], idx: 0, score: 0, correct: 0, wrong: [],
    startedAt: 0, qStartedAt: 0, timer: null, timeLeft: 0, answered: false,
  };

  function startQuiz() {
    quiz.questions = [...QUIZ_POOL].sort(() => Math.random() - 0.5).slice(0, state.cfg.total);
    quiz.idx = 0; quiz.score = 0; quiz.correct = 0; quiz.wrong = [];
    quiz.startedAt = Date.now();
    show('screenQuiz');
    nextQuizQuestion();
  }

  function nextQuizQuestion() {
    if (quiz.timer) { clearInterval(quiz.timer); quiz.timer = null; }
    if (quiz.idx >= quiz.questions.length) return endQuiz();
    quiz.answered = false;
    const q = quiz.questions[quiz.idx];
    document.getElementById('quizScore').textContent = quiz.score;
    document.getElementById('quizProg').textContent = (quiz.idx + 1) + ' / ' + quiz.questions.length;
    document.getElementById('quizType').textContent = q.type === 'ox' ? '⭕❌ OX 문제' : '🔢 4지선다';
    document.getElementById('quizQ').textContent = q.q;
    document.getElementById('quizFeedback').innerHTML = '';
    document.getElementById('quizFeedback').classList.remove('show');

    const oxBox = document.getElementById('quizOX');
    const mcBox = document.getElementById('quizMC');
    if (q.type === 'ox') {
      oxBox.style.display = 'flex';
      mcBox.style.display = 'none';
      oxBox.innerHTML = `
        <button class="quiz-ox-btn" data-ans="true">⭕ O (맞다)</button>
        <button class="quiz-ox-btn" data-ans="false">❌ X (틀리다)</button>
      `;
      oxBox.querySelectorAll('button').forEach(b => {
        b.addEventListener('click', () => answerQuiz(b.dataset.ans === 'true', b));
      });
    } else {
      oxBox.style.display = 'none';
      mcBox.style.display = 'grid';
      mcBox.innerHTML = q.options.map((opt, i) => `
        <button class="quiz-mc-btn" data-idx="${i}">
          <span class="quiz-mc-num">${'①②③④'[i]}</span> ${opt}
        </button>
      `).join('');
      mcBox.querySelectorAll('button').forEach(b => {
        b.addEventListener('click', () => answerQuiz(parseInt(b.dataset.idx, 10), b));
      });
    }

    quiz.qStartedAt = Date.now();
    quiz.timeLeft = state.cfg.perQuestionSec;
    updateQuizTimer();
    quiz.timer = setInterval(() => {
      quiz.timeLeft--;
      updateQuizTimer();
      if (quiz.timeLeft <= 0) {
        clearInterval(quiz.timer); quiz.timer = null;
        if (!quiz.answered) answerQuiz(null, null);
      }
    }, 1000);
  }

  function updateQuizTimer() {
    const total = state.cfg.perQuestionSec;
    const pct = Math.max(0, quiz.timeLeft / total * 100);
    const bar = document.getElementById('quizTimerFill');
    if (bar) {
      bar.style.width = pct + '%';
      if (quiz.timeLeft <= 5)       bar.style.background = 'linear-gradient(90deg,#ef4444,#f87171)';
      else if (quiz.timeLeft <= 10) bar.style.background = 'linear-gradient(90deg,#f59e0b,#fbbf24)';
      else                          bar.style.background = 'linear-gradient(90deg,#3b82f6,#60a5fa)';
    }
    const txt = document.getElementById('quizTimerTxt');
    if (txt) txt.textContent = quiz.timeLeft + 's';
  }

  function answerQuiz(pick, btn) {
    if (quiz.answered) return;
    quiz.answered = true;
    if (quiz.timer) { clearInterval(quiz.timer); quiz.timer = null; }
    const q = quiz.questions[quiz.idx];
    const correct = pick === q.answer;
    const took = (Date.now() - quiz.qStartedAt) / 1000;

    document.querySelectorAll('#quizOX button, #quizMC button').forEach(b => b.classList.add('disabled'));

    if (correct) {
      if (btn) btn.classList.add('correct');
      let pts = 10;
      if (took <= state.cfg.fastBonusSec) pts += 5;
      quiz.score += pts;
      quiz.correct++;
      SFX.hit(2);
      document.getElementById('quizFeedback').innerHTML = `
        <div class="qf-good">✓ 정답! +${pts}점${took <= state.cfg.fastBonusSec ? ' (빠른 정답 보너스)' : ''}</div>
        <div class="qf-exp">${q.explanation}</div>
      `;
    } else {
      if (btn) btn.classList.add('wrong');
      if (q.type === 'mc') {
        const c = document.querySelector(`#quizMC button[data-idx="${q.answer}"]`);
        if (c) c.classList.add('correct');
      } else {
        const c = document.querySelector(`#quizOX button[data-ans="${q.answer}"]`);
        if (c) c.classList.add('correct');
      }
      const ansLabel = typeof q.answer === 'number' ? q.options[q.answer] : (q.answer ? 'O (맞다)' : 'X (틀리다)');
      quiz.wrong.push({ q: q.q, ans: ansLabel });
      SFX.miss();
      document.getElementById('quizFeedback').innerHTML = `
        <div class="qf-bad">${pick === null ? '⏰ 시간 초과' : '✗ 오답'} — 정답: <strong>${ansLabel}</strong></div>
        <div class="qf-exp">${q.explanation}</div>
      `;
    }
    document.getElementById('quizFeedback').classList.add('show');
    document.getElementById('quizScore').textContent = quiz.score;

    setTimeout(() => { quiz.idx++; nextQuizQuestion(); }, 2400);
  }

  function endQuiz() {
    const elapsed = Math.floor((Date.now() - quiz.startedAt) / 1000);
    const acc = quiz.questions.length === 0 ? 0 : Math.round((quiz.correct / quiz.questions.length) * 100);
    const grade = quiz.score >= 130 ? 'S' : quiz.score >= 100 ? 'A' : quiz.score >= 60 ? 'B' : 'C';
    setTimeout(() => SFX.win(grade), 200);
    state.score = quiz.score;
    // augment showResult with wrong-list (after it renders)
    showResult({ score: quiz.score, acc, elapsed, grade });
    if (quiz.wrong.length > 0) {
      const stats = document.querySelector('#screenResult .result-stats');
      if (stats && !document.getElementById('quizWrongList')) {
        const ul = document.createElement('div');
        ul.id = 'quizWrongList';
        ul.className = 'card';
        ul.style.cssText = 'margin-top:1rem; text-align:left; font-size:.85rem;';
        ul.innerHTML = `
          <div style="font-family:'Orbitron'; color:var(--err); margin-bottom:.4rem;">⚠ 틀린 문제 (${quiz.wrong.length})</div>
          ${quiz.wrong.map(w => `<div style="margin-bottom:.4rem;"><span class="muted">Q.</span> ${w.q}<br><span style="color:var(--ok)">정답: ${w.ans}</span></div>`).join('')}
        `;
        stats.parentNode.insertBefore(ul, stats.nextSibling);
      }
    } else {
      const old = document.getElementById('quizWrongList');
      if (old) old.remove();
    }
  }

  document.getElementById('quizQuit').addEventListener('click', () => {
    if (!confirm('정말 게임을 종료하시겠습니까?')) return;
    if (quiz.timer) { clearInterval(quiz.timer); quiz.timer = null; }
    endQuiz();
  });
  document.getElementById('quizMute').addEventListener('click', () => {
    SFX.setMuted(!SFX.muted);
    document.getElementById('quizMute').textContent = SFX.muted ? '🔇' : '🔊';
  });

  /* ============================================================
     ADSORPTION LAB (기체 분리 실험실)
     ============================================================ */
  const ADS_SCENARIOS = [
    { mof: 'HKUST-1', info: '구리(Cu) 열린 금속 사이트 보유 | 기공 크기 ~9Å | 사중극자 분자와 강한 상호작용',
      gases: ['CO₂', 'N₂', 'CH₄', 'H₂'], answer: 0,
      explanation: 'CO₂는 사중극자 모멘트가 커서 Cu 열린 금속 사이트와 강하게 상호작용합니다.' },
    { mof: 'HKUST-1', info: '구리(Cu) 열린 금속 사이트 보유 | 수분 노출 시 구조 변화 발생',
      gases: ['H₂O', 'CO₂', 'N₂', 'Ar'], answer: 0,
      explanation: '물 분자는 Cu 열린 사이트와 강하게 결합해 구조를 변화시킵니다 (단점이기도 함).' },
    { mof: 'MOF-5', info: '아연(Zn) 노드 | 큰 기공(~15Å) | 무극성 표면 | 수소 저장 연구에 활용',
      gases: ['H₂', 'CO₂', 'H₂O', 'SO₂'], answer: 0,
      explanation: 'MOF-5는 큰 기공과 무극성 표면으로 수소(H₂) 저장 연구에 주로 활용됩니다.' },
    { mof: 'UiO-66', info: '지르코늄(Zr) 노드 | 기공 크기 ~6Å | 높은 열·수분 안정성',
      gases: ['CO₂', 'H₂O', 'CH₄', 'N₂'], answer: 0,
      explanation: 'UiO-66은 수분 안정성이 높아 실제 환경(습기 존재)에서도 CO₂를 선택적으로 흡착할 수 있습니다.' },
    { mof: 'HKUST-1', info: '바이오가스 정제 조건 | CO₂/CH₄ 혼합 기체에서 선택적 분리 목표',
      gases: ['CH₄', 'CO₂', 'N₂', 'O₂'], answer: 1,
      explanation: 'HKUST-1은 CO₂/CH₄ 분리에서 CO₂를 우선 흡착해 바이오가스의 CH₄ 순도를 높입니다.' },
  ];

  const ads = { scenarios: [], round: 0, score: 0, hintUsed: false, answered: false, startedAt: 0 };

  function startAdsorption() {
    ads.scenarios = [...ADS_SCENARIOS].sort(() => Math.random() - 0.5);
    ads.round = 0; ads.score = 0; ads.startedAt = Date.now();
    show('screenAdsorption');
    nextAdsorptionRound();
  }

  function nextAdsorptionRound() {
    if (ads.round >= state.cfg.rounds) return endAdsorption();
    ads.answered = false; ads.hintUsed = false;
    const s = ads.scenarios[ads.round];
    document.getElementById('adsScore').textContent = ads.score;
    document.getElementById('adsRound').textContent = (ads.round + 1) + ' / ' + state.cfg.rounds;
    document.getElementById('adsMofName').textContent = s.mof;
    document.getElementById('adsMofInfo').textContent = s.info;
    document.getElementById('adsFeedback').innerHTML = '';
    document.getElementById('adsHintTxt').textContent = '';
    const hintBtn = document.getElementById('adsHintBtn');
    hintBtn.disabled = false; hintBtn.style.opacity = '1';

    const gasBox = document.getElementById('adsGases');
    gasBox.innerHTML = s.gases.map((g, i) => `
      <button class="ads-gas-card" data-idx="${i}">
        <div class="gas-symbol">${g}</div>
      </button>
    `).join('');
    gasBox.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => answerAdsorption(parseInt(b.dataset.idx, 10), b));
    });
  }

  function answerAdsorption(pick, btn) {
    if (ads.answered) return;
    ads.answered = true;
    const s = ads.scenarios[ads.round];
    const correct = pick === s.answer;
    document.querySelectorAll('#adsGases button').forEach(b => b.classList.add('disabled'));

    if (correct) {
      btn.classList.add('absorbed');
      let pts = 20;
      if (ads.hintUsed) pts -= 5;
      ads.score += pts;
      SFX.hit(2);
      document.getElementById('adsFeedback').innerHTML = `
        <div class="ads-good">✓ 정답! +${pts}점${ads.hintUsed ? ' (힌트 사용)' : ''}</div>
        <div>${s.explanation}</div>
      `;
    } else {
      btn.classList.add('repelled');
      const cBtn = document.querySelector(`#adsGases button[data-idx="${s.answer}"]`);
      if (cBtn) cBtn.classList.add('absorbed');
      SFX.miss();
      document.getElementById('adsFeedback').innerHTML = `
        <div class="ads-bad">✗ 오답 — 정답은 <strong>${s.gases[s.answer]}</strong></div>
        <div>${s.explanation}</div>
      `;
    }
    document.getElementById('adsScore').textContent = ads.score;
    setTimeout(() => { ads.round++; nextAdsorptionRound(); }, 2800);
  }

  function endAdsorption() {
    const elapsed = Math.floor((Date.now() - ads.startedAt) / 1000);
    const max = state.cfg.rounds * 20;
    const acc = max === 0 ? 0 : Math.round((ads.score / max) * 100);
    const grade = ads.score >= 90 ? 'S' : ads.score >= 70 ? 'A' : ads.score >= 40 ? 'B' : 'C';
    setTimeout(() => SFX.win(grade), 200);
    state.score = ads.score;
    showResult({ score: ads.score, acc, elapsed, grade });
  }

  document.getElementById('adsHintBtn').addEventListener('click', () => {
    if (ads.answered || ads.hintUsed) return;
    ads.hintUsed = true;
    const s = ads.scenarios[ads.round];
    document.getElementById('adsHintTxt').textContent = '💡 ' + s.info;
    const b = document.getElementById('adsHintBtn');
    b.disabled = true; b.style.opacity = '0.5';
  });
  document.getElementById('adsQuit').addEventListener('click', () => {
    if (confirm('정말 게임을 종료하시겠습니까?')) endAdsorption();
  });
  document.getElementById('adsMute').addEventListener('click', () => {
    SFX.setMuted(!SFX.muted);
    document.getElementById('adsMute').textContent = SFX.muted ? '🔇' : '🔊';
  });

  /* ============================================================
     FLASHCARD MATCH (MOF 플래시카드)
     ============================================================ */
  const CARD_SETS = {
    '초급': [
      { term: 'MOF', def: '금속 이온과 유기 리간드로 이루어진 다공성 결정 구조체' },
      { term: '기공 (Pore)', def: '게스트 분자가 저장·흡착되는 MOF 내부의 빈 공간' },
      { term: '리간드 (Ligand)', def: 'MOF에서 금속 노드를 연결하는 유기 분자 (스페이서)' },
      { term: '노드 (Node)', def: 'MOF 구조에서 금속 이온 또는 금속 클러스터 부분' },
      { term: 'HKUST-1', def: 'Cu₃(BTC)₂, 구리 노드와 BTC 리간드로 이루어진 대표적 MOF' },
      { term: '비표면적', def: '물질 1g이 가지는 총 표면적 (MOF는 최대 7,000m²/g)' },
    ],
    '중급': [
      { term: 'SBU', def: '2차 빌딩유닛, MOF에서 반복 배치되는 무기물(금속 클러스터) 부분' },
      { term: 'pcu 네트', def: 'Primitive Cubic net, MOF-5의 6면체 반복 구조 명칭' },
      { term: '열린 금속 사이트', def: '활성화 후 배위 용매가 제거되어 노출된 금속 이온 자리' },
      { term: 'CIF 파일', def: '결정 구조의 원자 좌표·격자 정보를 담은 결정학 데이터 파일' },
      { term: 'UiO-66', def: 'Zr 노드 기반 MOF, 열·수분 안정성이 높아 실제 환경 적용에 유리' },
      { term: '흡착 선택성', def: '특정 분자만 우선 흡착하는 MOF의 기공 특성 (크기·극성 기반)' },
    ],
    '심화': [
      { term: '사중극자 모멘트', def: 'CO₂가 가지는 전기적 비대칭 특성, HKUST-1과의 강한 상호작용 원인' },
      { term: 'breakthrough 실험', def: '혼합 기체를 흘려보내 특정 성분의 흡착·분리 성능을 측정하는 실험' },
      { term: '가역적 흡탈착', def: '조건 변화에 따라 흡착과 탈착이 반복 가능한 특성 (수소 저장 필수 조건)' },
      { term: '배위화합물', def: '금속 이온에 리간드가 배위결합으로 연결된 화합물 (MOF의 상위 개념)' },
      { term: '동적 기공', def: '외부 자극이나 게스트 분자에 반응해 크기·형태가 변하는 MOF 기공' },
      { term: 'MOF-5', def: 'Zn₄O(BDC)₃, 최초의 안정적·고기공성 MOF로 Yaghi가 1999년 Nature에 발표' },
    ],
  };

  const fc = {
    setIdx: 0, pairs: [], termOrder: [], defOrder: [],
    selectedTerm: -1, matched: 0, misses: 0, startedAt: 0,
  };

  function startFlashcard() {
    fc.setIdx = 0; fc.misses = 0; fc.startedAt = Date.now();
    show('screenFlashcard');
    loadFcSet();
  }

  function loadFcSet() {
    const setName = state.cfg.sets[fc.setIdx];
    fc.pairs = CARD_SETS[setName] || [];
    fc.matched = 0;
    fc.selectedTerm = -1;
    fc.termOrder = [...fc.pairs.keys()].sort(() => Math.random() - 0.5);
    fc.defOrder  = [...fc.pairs.keys()].sort(() => Math.random() - 0.5);
    document.getElementById('fcSetName').textContent =
      `${setName} (${fc.setIdx + 1}/${state.cfg.sets.length})`;
    document.getElementById('fcMisses').textContent = fc.misses;
    renderFcCards();
  }

  function renderFcCards() {
    const termsEl = document.getElementById('fcTerms');
    const defsEl  = document.getElementById('fcDefs');
    termsEl.innerHTML = fc.termOrder.map(i => `
      <button class="fc-card fc-term" data-i="${i}">${fc.pairs[i].term}</button>
    `).join('');
    defsEl.innerHTML = fc.defOrder.map(i => `
      <button class="fc-card fc-def" data-i="${i}">${fc.pairs[i].def}</button>
    `).join('');
    termsEl.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => pickFcTerm(parseInt(b.dataset.i, 10), b));
    });
    defsEl.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => pickFcDef(parseInt(b.dataset.i, 10), b));
    });
  }

  function pickFcTerm(i, btn) {
    if (btn.classList.contains('done')) return;
    document.querySelectorAll('#fcTerms .fc-card.selected').forEach(el => el.classList.remove('selected'));
    fc.selectedTerm = i;
    btn.classList.add('selected');
  }

  function pickFcDef(i, btn) {
    if (btn.classList.contains('done')) return;
    if (fc.selectedTerm < 0) return;
    if (fc.selectedTerm === i) {
      SFX.hit(1);
      const tBtn = document.querySelector(`#fcTerms .fc-card[data-i="${i}"]`);
      if (tBtn) { tBtn.classList.remove('selected'); tBtn.classList.add('done'); }
      btn.classList.add('done');
      fc.matched++;
      fc.selectedTerm = -1;
      if (fc.matched === fc.pairs.length) setTimeout(advanceFcSet, 700);
    } else {
      SFX.miss();
      fc.misses++;
      document.getElementById('fcMisses').textContent = fc.misses;
      btn.classList.add('shake-no');
      setTimeout(() => btn.classList.remove('shake-no'), 400);
      document.querySelectorAll('#fcTerms .fc-card.selected').forEach(el => el.classList.remove('selected'));
      fc.selectedTerm = -1;
    }
  }

  function advanceFcSet() {
    fc.setIdx++;
    if (fc.setIdx >= state.cfg.sets.length) return endFlashcard();
    loadFcSet();
  }

  function endFlashcard() {
    const elapsed = Math.floor((Date.now() - fc.startedAt) / 1000);
    const stars = fc.misses === 0 ? 3 : fc.misses <= 2 ? 2 : 1;
    const grade = stars === 3 ? 'S' : stars === 2 ? 'A' : 'B';
    // total pairs across sets
    const totalPairs = state.cfg.sets.reduce((s, n) => s + (CARD_SETS[n]?.length || 0), 0);
    const acc = totalPairs === 0 ? 0 : Math.max(0, Math.round((1 - fc.misses / (totalPairs * 2)) * 100));
    const score = stars * 50 + Math.max(0, 30 - fc.misses * 3);
    setTimeout(() => SFX.win(grade), 200);
    state.score = score;
    showResult({ score, acc, elapsed, grade });
  }

  document.getElementById('fcQuit').addEventListener('click', () => {
    if (confirm('정말 게임을 종료하시겠습니까?')) endFlashcard();
  });
  document.getElementById('fcMute').addEventListener('click', () => {
    SFX.setMuted(!SFX.muted);
    document.getElementById('fcMute').textContent = SFX.muted ? '🔇' : '🔊';
  });

  /* ---------- Initial render ---------- */
  renderRank();
  show('screenTitle');
})();
