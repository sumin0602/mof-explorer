/* ============================================
   MOF Explorer — Structure page logic
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Stepper ---------- */
  const tabs = document.querySelectorAll('.step-tab');
  const secs = document.querySelectorAll('.sec');
  const prev = document.getElementById('prevBtn');
  const next = document.getElementById('nextBtn');
  let stepIdx = 1;

  function goStep(n) {
    n = Math.max(1, Math.min(5, n));
    stepIdx = n;
    tabs.forEach(t => t.classList.toggle('active', +t.dataset.step === n));
    secs.forEach(s => s.classList.toggle('active', s.id === 'sec' + n));
    prev.disabled = n === 1;
    next.disabled = n === 5;
    prev.style.opacity = n === 1 ? '0.4' : '1';
    next.style.opacity = n === 5 ? '0.4' : '1';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (n === 3) animateBars();
  }

  tabs.forEach(t => t.addEventListener('click', () => goStep(+t.dataset.step)));
  prev.addEventListener('click', () => goStep(stepIdx - 1));
  next.addEventListener('click', () => goStep(stepIdx + 1));
  goStep(1);

  /* ---------- Section 1: HKUST-1 interactive canvas ---------- */
  const cv  = document.getElementById('hkustCanvas');
  const ctx = cv.getContext('2d');
  const info = document.getElementById('infoPanel');

  let nodes = [];   // {x,y,r,type,label,desc}

  function fitCanvas(c) {
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width  = rect.width  * dpr;
    c.height = rect.height * dpr;
    c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    return rect;
  }

  function buildHkust() {
    const rect = fitCanvas(cv);
    const W = rect.width, H = rect.height;
    const cx = W / 2, cy = H / 2;
    nodes = [];

    // 7 Cu nodes (1 center + 6 outer)
    nodes.push({ x: cx, y: cy, r: 16, type: 'cu',
      label: '중심 구리 노드 (Cu²⁺)',
      desc: 'HKUST-1 구조의 핵심은 두 개의 구리 이온이 4개의 BTC 카르복실기와 결합한 패들휠(paddle-wheel) 클러스터입니다. 이 클러스터가 골격체의 모서리 역할을 하며, 3차원 네트워크의 강성을 제공합니다.' });

    const R = Math.min(W, H) * 0.32;
    const cuOuter = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
      const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
      cuOuter.push({ x, y });
      nodes.push({ x, y, r: 12, type: 'cu',
        label: '구리 노드 (Cu²⁺)',
        desc: '구리 이온이 BTC 리간드의 카르복실기와 결합해 격자의 모서리를 이룹니다. 활성점으로 작용해 촉매·CO₂ 흡착 자리로도 활용됩니다.' });
    }

    // 6 linkers between adjacent outer Cus
    for (let i = 0; i < 6; i++) {
      const a = cuOuter[i], b = cuOuter[(i + 1) % 6];
      nodes.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: 9, type: 'linker',
        label: 'BTC 리간드 (벤젠트리카르복실산)',
        desc: '세 개의 카르복실기를 가진 평면형 유기 분자입니다. 구리 노드 사이를 잇는 막대 역할을 하며, MOF의 형태와 기공 크기를 결정합니다.' });
    }

    // 3 pore zones (cyan dashed)
    const pr = R * 0.55;
    for (let i = 0; i < 3; i++) {
      const a = (Math.PI * 2 * i) / 3 - Math.PI / 2;
      nodes.push({
        x: cx + pr * Math.cos(a),
        y: cy + pr * Math.sin(a),
        r: 22, type: 'pore',
        label: '기공 (Pore, ~9 Å)',
        desc: 'HKUST-1의 큰 기공은 약 9 Å 크기로, CO₂·N₂·CH₄ 같은 작은 가스 분자를 흡착하기에 적합합니다. 균일한 크기 덕분에 분자 선택적 흡착이 가능합니다.'
      });
    }

    drawHkust();
  }

  let hoverIdx = -1, selIdx = -1;

  function drawHkust() {
    const W = cv.clientWidth, H = cv.clientHeight;
    ctx.clearRect(0, 0, W, H);

    // bonds (center→outer Cu)
    ctx.strokeStyle = 'rgba(96,165,250,0.45)';
    ctx.lineWidth = 2;
    const center = nodes[0];
    for (let i = 1; i <= 6; i++) {
      const n = nodes[i];
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(n.x, n.y);
      ctx.stroke();
    }
    // bonds (outer Cu ↔ linker)
    for (let i = 0; i < 6; i++) {
      const cu  = nodes[1 + i];
      const cuN = nodes[1 + ((i + 1) % 6)];
      const lk  = nodes[7 + i];
      ctx.beginPath();
      ctx.moveTo(cu.x, cu.y); ctx.lineTo(lk.x, lk.y); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cuN.x, cuN.y); ctx.lineTo(lk.x, lk.y); ctx.stroke();
    }

    // pores (dashed)
    nodes.forEach((n, i) => {
      if (n.type !== 'pore') return;
      const hov = (i === hoverIdx || i === selIdx);
      ctx.save();
      ctx.strokeStyle = hov ? 'rgba(6,182,212,0.9)' : 'rgba(6,182,212,0.55)';
      ctx.fillStyle = hov ? 'rgba(6,182,212,0.10)' : 'rgba(6,182,212,0.04)';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + (hov ? 3 : 0), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    // nodes (Cu + linker)
    nodes.forEach((n, i) => {
      if (n.type === 'pore') return;
      const hov = (i === hoverIdx || i === selIdx);
      const r = n.r + (hov ? 3 : 0);

      ctx.save();
      if (n.type === 'cu') {
        ctx.fillStyle = hov ? '#fdba74' : '#fb923c';
        ctx.shadowColor = 'rgba(251,146,60,0.7)';
        ctx.shadowBlur  = hov ? 16 : 8;
      } else {
        ctx.fillStyle = hov ? '#60a5fa' : '#3b82f6';
        ctx.shadowColor = 'rgba(59,130,246,0.7)';
        ctx.shadowBlur  = hov ? 16 : 8;
      }
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // text inside Cu
      if (n.type === 'cu' && n.r >= 12) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Cu', n.x, n.y);
      }
    });
  }

  function hitTest(x, y) {
    // pores first (large area, lowest priority visually)
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].type !== 'pore') continue;
      const dx = nodes[i].x - x, dy = nodes[i].y - y;
      if (Math.hypot(dx, dy) < nodes[i].r) return i;
    }
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].type === 'pore') continue;
      const dx = nodes[i].x - x, dy = nodes[i].y - y;
      if (Math.hypot(dx, dy) < nodes[i].r + 4) return i;
    }
    return -1;
  }

  cv.addEventListener('mousemove', e => {
    const r = cv.getBoundingClientRect();
    const idx = hitTest(e.clientX - r.left, e.clientY - r.top);
    if (idx !== hoverIdx) {
      hoverIdx = idx;
      cv.style.cursor = idx >= 0 ? 'pointer' : 'crosshair';
      drawHkust();
    }
  });
  cv.addEventListener('mouseleave', () => { hoverIdx = -1; drawHkust(); });

  cv.addEventListener('click', e => {
    const r = cv.getBoundingClientRect();
    const idx = hitTest(e.clientX - r.left, e.clientY - r.top);
    if (idx < 0) return;
    selIdx = idx;
    const n = nodes[idx];
    info.innerHTML = `
      <h4>${n.label}</h4>
      <p class="muted" style="margin-bottom:1rem;">${n.type === 'cu' ? '금속 노드' : n.type === 'linker' ? '유기 리간드' : '빈 공간 (분자 흡착 영역)'}</p>
      <p>${n.desc}</p>
    `;
    info.querySelector('h4').style.animation = 'fadeIn 0.4s ease both';
    drawHkust();
  });

  buildHkust();
  window.addEventListener('resize', buildHkust);

  /* ---------- Section 2: pore slider ---------- */
  const slider  = document.getElementById('poreSlider');
  const valTxt  = document.getElementById('poreVal');
  const cls     = document.getElementById('poreClass');
  const pCv     = document.getElementById('poreCanvas');
  const pCtx    = pCv.getContext('2d');
  const molGrid = document.getElementById('molGrid');

  const MOLS = [
    { name: 'H₂O (물)',         sz: 2.8 },
    { name: 'CO₂',             sz: 3.3 },
    { name: 'O₂',              sz: 3.5 },
    { name: 'N₂',              sz: 3.6 },
    { name: 'CH₄ (메탄)',       sz: 3.8 },
    { name: '벤젠',             sz: 5.9 },
    { name: '비타민C',          sz: 8.0 },
    { name: '이부프로펜',       sz: 10.2 },
  ];

  function renderMols(p) {
    molGrid.innerHTML = MOLS.map(m => {
      const pass = p >= m.sz;
      return `
        <div class="mol-card ${pass ? 'pass' : 'fail'}">
          <div class="name">${m.name}</div>
          <div class="size">분자 크기 ≈ ${m.sz} Å</div>
          <div class="status">${pass ? '✓ 통과 가능' : '✗ 통과 불가'}</div>
        </div>
      `;
    }).join('');
  }

  function classify(p) {
    if (p < 4)  return '초소형 기공 (작은 가스만)';
    if (p < 7)  return 'HKUST-1 작은 기공급';
    if (p < 12) return 'HKUST-1 큰 기공 / MOF-5급';
    if (p < 20) return '대형 기공 (큰 분자 가능)';
    return 'MIL-101급 초대형 기공';
  }

  /* ----- animated pore visualization ----- */
  const poreAnim = {
    radius: 30,       // current displayed radius (lerps to target)
    targetR: 30,
    W: 0, H: 0,
    cx: 0, cy: 0,
    bgMols: [],       // floating molecules around the pore (visual only)
    inside: [],       // particles inside the pore
    started: false,
  };

  function resizePoreCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = pCv.getBoundingClientRect();
    pCv.width  = rect.width  * dpr;
    pCv.height = rect.height * dpr;
    pCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    poreAnim.W = rect.width;
    poreAnim.H = rect.height;
    poreAnim.cx = rect.width / 2;
    poreAnim.cy = rect.height / 2;
  }

  function seedBgMols() {
    // 8 molecules orbiting at different speeds/orbits
    poreAnim.bgMols = MOLS.map((m, i) => ({
      sz: m.sz,
      name: m.name,
      orbit: 0.55 + (i * 0.045),   // fraction of half-min dim
      angle: (Math.PI * 2 * i) / MOLS.length + Math.random() * 0.4,
      speed: 0.0006 + Math.random() * 0.0008,
      r: 4 + Math.min(10, m.sz * 0.45),
    }));
    // 14 inside particles
    poreAnim.inside = new Array(14).fill(0).map(() => ({
      a: Math.random() * Math.PI * 2,
      d: Math.random(),
      v: 0.002 + Math.random() * 0.005,
      r: 1 + Math.random() * 1.5,
    }));
  }

  function targetRadiusFromVal(p) {
    const minR = 20, maxR = Math.min(poreAnim.W || 300, poreAnim.H || 300) * 0.36;
    const t = (p - 2) / 28;
    return minR + (maxR - minR) * t;
  }

  function poreFrame(now) {
    if (!poreAnim.W) resizePoreCanvas();
    const p = parseFloat(slider.value);

    // lerp radius
    poreAnim.targetR = targetRadiusFromVal(p);
    poreAnim.radius += (poreAnim.targetR - poreAnim.radius) * 0.14;

    const t = now / 1000;
    const breathe = 1 + Math.sin(t * 1.6) * 0.04;
    const drawR = poreAnim.radius * breathe;
    const cx = poreAnim.cx, cy = poreAnim.cy;
    const W = poreAnim.W,  H = poreAnim.H;
    const minSide = Math.min(W, H);

    pCtx.clearRect(0, 0, W, H);

    // ---- glow halo (theme-aware) ----
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const halo = pCtx.createRadialGradient(cx, cy, drawR * 0.4, cx, cy, drawR * 2.2);
    halo.addColorStop(0, isLight ? 'rgba(6,182,212,0.20)' : 'rgba(6,182,212,0.28)');
    halo.addColorStop(1, 'rgba(6,182,212,0)');
    pCtx.fillStyle = halo;
    pCtx.beginPath(); pCtx.arc(cx, cy, drawR * 2.2, 0, Math.PI * 2); pCtx.fill();

    // ---- Cu/linker outer ring (slowly rotating) ----
    const ringR = drawR + 28;
    const ringRot = t * 0.18;
    pCtx.save();
    pCtx.translate(cx, cy);
    pCtx.rotate(ringRot);
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12;
      const x = ringR * Math.cos(a);
      const y = ringR * Math.sin(a);
      const isCu = i % 2 === 0;

      // bond to next
      const a2 = (Math.PI * 2 * (i + 1)) / 12;
      const x2 = ringR * Math.cos(a2), y2 = ringR * Math.sin(a2);
      pCtx.strokeStyle = 'rgba(96,165,250,0.40)';
      pCtx.lineWidth = 1.4;
      pCtx.beginPath(); pCtx.moveTo(x, y); pCtx.lineTo(x2, y2); pCtx.stroke();

      pCtx.beginPath();
      pCtx.arc(x, y, isCu ? 9 : 6, 0, Math.PI * 2);
      pCtx.fillStyle = isCu ? '#fb923c' : '#3b82f6';
      pCtx.shadowColor = isCu ? 'rgba(251,146,60,0.7)' : 'rgba(59,130,246,0.7)';
      pCtx.shadowBlur = 6;
      pCtx.fill();
    }
    pCtx.shadowBlur = 0;
    pCtx.restore();

    // ---- pore (wavy + breathing) ----
    pCtx.save();
    pCtx.fillStyle = 'rgba(6,182,212,0.10)';
    pCtx.strokeStyle = 'rgba(6,182,212,0.85)';
    pCtx.lineWidth = 2;
    pCtx.setLineDash([6, 4]);
    pCtx.lineDashOffset = -t * 30;
    pCtx.beginPath();
    const STEPS = 80;
    for (let i = 0; i <= STEPS; i++) {
      const a = (Math.PI * 2 * i) / STEPS;
      const wave = drawR + Math.sin(a * 6 + t * 2.4) * 1.5;
      const x = cx + wave * Math.cos(a);
      const y = cy + wave * Math.sin(a);
      if (i === 0) pCtx.moveTo(x, y); else pCtx.lineTo(x, y);
    }
    pCtx.closePath();
    pCtx.fill();
    pCtx.stroke();
    pCtx.restore();

    // ---- particles inside the pore ----
    poreAnim.inside.forEach(pt => {
      pt.a += pt.v;
      const rad = drawR * 0.78 * (0.3 + 0.7 * pt.d);
      const x = cx + Math.cos(pt.a) * rad;
      const y = cy + Math.sin(pt.a) * rad;
      pCtx.beginPath();
      pCtx.arc(x, y, pt.r, 0, Math.PI * 2);
      pCtx.fillStyle = 'rgba(6,182,212,0.65)';
      pCtx.fill();
    });

    // ---- floating molecules ----
    poreAnim.bgMols.forEach((m, i) => {
      m.angle += m.speed;
      const pass = p >= m.sz;
      const dist = (m.orbit) * (minSide / 2) + Math.sin(t * 1.2 + i) * 4;
      let x, y;

      if (pass) {
        // attracted inward: orbit closer
        const attract = (drawR + 18 + Math.sin(t * 2 + i) * 6);
        x = cx + Math.cos(m.angle) * attract;
        y = cy + Math.sin(m.angle) * attract;
      } else {
        x = cx + Math.cos(m.angle) * dist;
        y = cy + Math.sin(m.angle) * dist;
      }

      // marker
      pCtx.save();
      if (pass) {
        pCtx.shadowColor = 'rgba(34,197,94,0.7)';
        pCtx.shadowBlur = 10;
        pCtx.fillStyle = 'rgba(34,197,94,0.85)';
      } else {
        pCtx.shadowBlur = 0;
        pCtx.fillStyle = 'rgba(148,163,184,0.55)';
      }
      pCtx.beginPath();
      pCtx.arc(x, y, m.r, 0, Math.PI * 2);
      pCtx.fill();
      pCtx.restore();

      // label
      if (m.r >= 5) {
        pCtx.fillStyle = pass ? 'rgba(34,197,94,0.9)' : 'rgba(148,163,184,0.65)';
        pCtx.font = '10px JetBrains Mono, monospace';
        pCtx.textAlign = 'center';
        pCtx.textBaseline = 'middle';
        pCtx.fillText(m.sz + 'Å', x, y - m.r - 7);
      }
    });

    // ---- center label ----
    const labelColor = isLight ? 'rgba(15,23,42,0.9)' : 'rgba(226,232,240,0.95)';
    pCtx.fillStyle = labelColor;
    pCtx.font = 'bold 18px Orbitron, sans-serif';
    pCtx.textAlign = 'center';
    pCtx.textBaseline = 'middle';
    pCtx.fillText(`${p.toFixed(1)} Å`, cx, cy);

    requestAnimationFrame(poreFrame);
  }

  function startPoreLoop() {
    if (poreAnim.started) return;
    poreAnim.started = true;
    resizePoreCanvas();
    seedBgMols();
    poreAnim.radius = targetRadiusFromVal(parseFloat(slider.value));
    requestAnimationFrame(poreFrame);
  }

  function syncSlider() {
    const p = parseFloat(slider.value);
    valTxt.textContent = p.toFixed(1);
    cls.textContent = classify(p);
    renderMols(p);
    // visual pop on the value text
    valTxt.style.transform = 'scale(1.15)';
    valTxt.style.transition = 'transform 0.18s ease';
    setTimeout(() => { valTxt.style.transform = 'scale(1)'; }, 180);
  }
  slider.addEventListener('input', syncSlider);
  window.addEventListener('resize', () => { resizePoreCanvas(); });
  syncSlider();
  startPoreLoop();

  /* ---------- Section 3: bar chart ---------- */
  const MATS = [
    { name: 'MIL-101',   val: 5900, max: 7000, color: '#60a5fa' },
    { name: 'MOF-5',     val: 3800, max: 7000, color: '#3b82f6' },
    { name: 'ZIF-8',     val: 1800, max: 7000, color: '#2563eb' },
    { name: 'HKUST-1',   val: 1500, max: 7000, color: '#1e40af' },
    { name: '활성탄',     val: 1200, max: 7000, color: '#64748b' },
    { name: '제올라이트', val: 600,  max: 7000, color: '#475569' },
    { name: '실리카겔',   val: 300,  max: 7000, color: '#334155' },
  ];

  const barChart = document.getElementById('barChart');
  barChart.innerHTML = MATS.map(m => `
    <div class="bar-row">
      <div class="lbl">${m.name}</div>
      <div class="bar-track"><div class="bar-fill" data-w="${(m.val / m.max) * 100}" style="background:${m.color}; box-shadow:0 0 12px ${m.color}88;"></div></div>
      <div class="val">${m.val.toLocaleString()} m²/g</div>
    </div>
  `).join('');

  let barsAnimated = false;
  function animateBars() {
    if (barsAnimated) return;
    barsAnimated = true;
    setTimeout(() => {
      barChart.querySelectorAll('.bar-fill').forEach((el, i) => {
        setTimeout(() => { el.style.width = el.dataset.w + '%'; }, i * 90);
      });
    }, 150);
  }

  /* ---------- Section 4: app cards ---------- */
  document.querySelectorAll('[data-toggle]').forEach(card => {
    card.addEventListener('click', () => card.classList.toggle('open'));
  });

  /* ---------- Section 5: filter tabs ---------- */
  const filterTabs = document.querySelectorAll('.filter-tab');
  const mofRows = document.querySelectorAll('.mof-row');
  filterTabs.forEach(t => {
    t.addEventListener('click', () => {
      filterTabs.forEach(x => x.classList.toggle('active', x === t));
      const f = t.dataset.filter;
      mofRows.forEach(r => {
        const tags = r.dataset.tags.split(',');
        r.classList.toggle('hide', f !== 'all' && !tags.includes(f));
      });
    });
  });

});
