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

  /* ---------- Section 1: Real 3D crystal viewer (CIF + Three.js + Supercell) ---------- */
  const info = document.getElementById('infoPanel');
  setupMofViewer();

  function setupMofViewer() {
    const mountEl  = document.getElementById('hkust3d');
    const loading  = document.getElementById('viewer3dLoading');
    const resetBtn = document.getElementById('viewerReset');
    if (!mountEl || !loading) return;

    if (!window.THREE || !window.MOFViewer) {
      loading.innerHTML = '<div style="color:var(--err); padding:1rem;">⚠ 3D 라이브러리(Three.js)를 불러올 수 없습니다.<br><span style="font-size:0.85rem; color:var(--txm);">인터넷 연결 또는 CDN 접근을 확인하세요.</span></div>';
      return;
    }
    const MV = window.MOFViewer;

    let currentMOF = 'hkust1';
    let supercell  = 1;
    let showPores  = true;
    let showBonds  = true;

    const viewer = MV.create({
      mount: mountEl,
      showPores: true,
      showBonds: true,
      autoRotate: true,
      onAtomClick: ({ element }) => {
        if (['Cu','Zn','Zr','Cr'].includes(element)) showMetal(element);
        else                                         showLigand(element);
      },
      onPoreClick: ({ pore, cageType }) => showPore(pore, cageType),
      onReady: ({ pores }) => {
        loading.style.display = 'none';
        renderPoreLegend(pores);
      },
    });

    function loadMOF(key) {
      const meta = MV.REGISTRY[key];
      if (!meta) return;
      currentMOF = key;
      // sync UiO-66-specific toggle visibility (수정 2)
      if (typeof syncToggleVisibility === 'function') syncToggleVisibility();
      loading.style.display = 'flex';
      loading.innerHTML = `<div class="viewer-spinner"></div><div>${meta.name} 결정 구조 로딩 중...</div>`;
      viewer.setSupercell(supercell);
      viewer.loadFromKey(key)
        .then(() => {
          updateCaption();
        })
        .catch(err => {
          loading.innerHTML = `
            <div style="color:var(--err); padding:1rem; text-align:center;">
              <div style="font-size:1.8rem; margin-bottom:0.5rem;">⚠</div>
              <strong>${meta.name}</strong> 결정 구조를 불러올 수 없습니다.
              <div style="margin-top:0.7rem; color:var(--txm); font-size:0.82rem; line-height:1.55;">
                CIF 데이터가 손상되었거나 Three.js를 불러올 수 없습니다.<br>
                <span style="opacity:0.7;">(${String(err.message || err)})</span>
              </div>
            </div>`;
          console.error('MOF load error:', err);
        });
    }

    function updateCaption() {
      const meta = MV.REGISTRY[currentMOF];
      const cap  = document.getElementById('viewerCaption');
      if (cap && meta) {
        let html = `🔬 <strong>${meta.name}</strong> · ${meta.formula} · ${meta.pores}` +
                   (supercell > 1 ? ` · ${supercell}×${supercell}×${supercell} 슈퍼셀` : '');
        // UiO-66 dual-cage explanation (수정 4)
        if (currentMOF === 'uio66') {
          html += `
            <div style="margin-top:0.6rem; padding:0.75rem 1rem; background:rgba(255,140,0,0.07);
                        border:1px solid rgba(255,140,0,0.30); border-radius:10px;
                        font-size:0.82rem; line-height:1.65; color:var(--tx); text-align:left;">
              <strong style="color:#FF8C00;">🔬 UiO-66의 이중 기공 구조</strong><br>
              UiO-66은 약 <strong style="color:#FFD700;">8 Å의 사면체형 기공</strong>과
              약 <strong style="color:#FF8C00;">11 Å의 팔면체형 기공</strong>,
              두 종류의 기공이 약 <strong style="color:#87CEEB;">6 Å의 삼각형 창</strong>으로
              연결된 구조를 가집니다. Zr₆O₄(OH)₄ 클러스터의 높은 배위수(12)가 이 구조의
              뛰어난 열·수분 안정성의 근거입니다.
            </div>
          `;
        }
        cap.innerHTML = html;
      }
    }

    function renderPoreLegend(pores) {
      const el = document.getElementById('poreLegend');
      if (!el) return;
      const buckets = new Map(); // bucket → {hex, label, count, sample}
      pores.forEach(p => {
        const col = MV.poreColor(p.radius);
        const cur = buckets.get(col.bucket) || { hex: col.hex, label: col.label, count: 0, radii: [] };
        cur.count++;
        cur.radii.push(p.radius);
        buckets.set(col.bucket, cur);
      });
      const sorted = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
      el.innerHTML = `
        <span style="font-size:0.7rem; color:var(--txm); font-family:'Orbitron'; letter-spacing:0.06em;">기공 색상:</span>
        ${sorted.map(([_, b]) => `
          <span class="pl-item" style="color:${b.hex}">
            <span class="pl-dot" style="background:${b.hex}"></span>
            <span style="color:var(--txm);">${b.label} · <strong style="color:${b.hex};">${b.count}개</strong></span>
          </span>
        `).join('') || '<span class="muted" style="font-size:.74rem;">기공이 탐지되지 않았습니다</span>'}
      `;
    }

    /* ---- toolbar wiring ---- */
    document.querySelectorAll('#mofSelect .vbtn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#mofSelect .vbtn').forEach(b => b.classList.toggle('active', b === btn));
        loadMOF(btn.dataset.mof);
      });
    });
    document.querySelectorAll('#cellSelect .vbtn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#cellSelect .vbtn').forEach(b => b.classList.toggle('active', b === btn));
        supercell = parseInt(btn.dataset.n, 10);
        loadMOF(currentMOF);  // reload with new supercell
      });
    });
    document.getElementById('togglePores').addEventListener('click', e => {
      showPores = !showPores;
      e.currentTarget.classList.toggle('active', showPores);
      e.currentTarget.classList.toggle('off',   !showPores);
      viewer.setPoreVisibility(showPores);
    });
    document.getElementById('toggleBonds').addEventListener('click', e => {
      showBonds = !showBonds;
      e.currentTarget.classList.toggle('active', showBonds);
      e.currentTarget.classList.toggle('off',   !showBonds);
      viewer.setBondVisibility(showBonds);
    });

    /* ---- UiO-66 전용 cage 토글 (수정 2) ---- */
    function makeCageToggle(btnId, cageType, defaultOn = true) {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      let on = defaultOn;
      btn.addEventListener('click', () => {
        on = !on;
        btn.classList.toggle('active', on);
        btn.classList.toggle('off',   !on);
        viewer.setCageTypeVisibility(cageType, on);
      });
    }
    makeCageToggle('toggleTet', 'tetrahedral');
    makeCageToggle('toggleOct', 'octahedral');
    makeCageToggle('toggleWin', 'window');

    /**
     * Show/hide the right set of toggles based on which MOF is loaded.
     * UiO-66 → 3 cage-specific toggles, hide the generic 💎 button.
     * Others  → single 💎 button, hide cage toggles.
     */
    function syncToggleVisibility() {
      const isUio = currentMOF === 'uio66';
      const generic = document.getElementById('togglePores');
      if (generic) generic.style.display = isUio ? 'none' : '';
      document.querySelectorAll('.uio-only').forEach(b => {
        b.style.display = isUio ? '' : 'none';
        // reset to active when shown
        if (isUio) { b.classList.add('active'); b.classList.remove('off'); }
      });
    }

    if (resetBtn) resetBtn.addEventListener('click', () => viewer.resetCamera());

    // ⭐ Initial load — without this, the loading spinner stays forever.
    loadMOF(currentMOF);

    /* ---- info panel handlers ---- */
    function metalName(el) {
      return ({ Cu: '구리', Zn: '아연', Zr: '지르코늄', Cr: '크롬' })[el] || el;
    }
    function showMetal(el) {
      const desc = ({
        Cu: 'HKUST-1의 패들휠 클러스터 — 두 개의 Cu 이온이 4개의 카르복실기 산소와 결합. CO₂·H₂O 흡착자리(외부 빈자리)로 활용.',
        Zn: 'MOF-5의 Zn₄O 사면체 클러스터 — 4개의 Zn 이온이 중심 산소를 둘러싸고 BDC 카르복실기와 결합. 결정의 모서리.',
        Zr: 'UiO-66의 Zr₆O₄(OH)₄ 옥타헤드론 — 6개의 Zr 이온이 8개의 산소/하이드록시드와 결합한 매우 안정한 클러스터. 열·물·산 안정성 최강.',
        Cr: 'MIL 계열에서 사용되는 크롬 클러스터로 거대 cage를 형성.',
      })[el] || '금속 노드는 격자의 모서리 역할을 합니다.';
      info.innerHTML = `
        <h4 style="color:#fb923c;">🟠 금속 노드 (${metalName(el)})</h4>
        <p class="muted" style="margin-bottom:0.8rem;">SBU · Secondary Building Unit</p>
        <p>${desc}</p>
        <ul style="margin-top:0.75rem; padding-left:1.1rem; color:var(--txm); font-size:0.88rem; line-height:1.75;">
          <li><strong>역할</strong>: 격자의 모서리·관절 + 활성 자리</li>
          <li><strong>색상(이 뷰어)</strong>: ${({Cu:'주황',Zn:'은회색',Zr:'시안',Cr:'보라'})[el] || '주황'}</li>
          <li><strong>결합</strong>: 카르복실기 O와 강한 배위결합</li>
        </ul>
      `;
      info.querySelector('h4').style.animation = 'fadeIn 0.4s ease both';
    }

    function showLigand(el) {
      const elemDesc = el === 'C' ? '탄소 (벤젠 고리 또는 카르복실기의 일부)'
                     : el === 'O' ? '산소 (카르복실기 -COOH의 일부)'
                     : el === 'N' ? '질소 (이미다졸 고리의 일부, ZIF계)'
                     :              '수소 (벤젠 고리 C-H)';
      info.innerHTML = `
        <h4 style="color:var(--bl2);">🔵 유기 리간드 (Linker)</h4>
        <p class="muted" style="margin-bottom:0.8rem;">${elemDesc}</p>
        <p>금속 노드 사이를 잇는 <strong>막대</strong> 역할을 합니다. 양 끝의 카르복실기(-COOH)가 금속 이온과 결합해 격자가 만들어집니다. MOF 종류별로 다른 리간드를 사용해 기공 크기와 화학적 성질을 조절합니다.</p>
        <div class="ligand-diagrams">
          ${btcSvg()}
          ${bdcSvg()}
        </div>
      `;
      info.querySelector('h4').style.animation = 'fadeIn 0.4s ease both';
    }

    function showPore(pore, cageType) {
      // UiO-66 cage-specific descriptions (수정 1·4)
      if (cageType === 'tetrahedral') {
        info.innerHTML = `
          <h4 style="color:#FFD700;">🟡 사면체형 기공 (Tetrahedral Cage)</h4>
          <p class="muted" style="margin-bottom:0.8rem;">크기 약 <strong style="color:#FFD700;">8 Å</strong> · UiO-66의 작은 기공</p>
          <p>Zr₆ 클러스터 <strong>4개</strong>로 둘러싸인 작은 공간입니다. 작은 기체 분자(CO₂, N₂ 등)가 드나드는 통로 역할을 합니다.</p>
          <div style="margin-top:1rem; padding:0.85rem; background:rgba(255,215,0,0.06); border:1px solid #FFD70055; border-radius:10px; text-align:center;">
            <div style="font-size:0.78rem; color:var(--txm); letter-spacing:0.06em;">cage 지름 ≈</div>
            <div style="margin-top:0.3rem; font-family:'Orbitron'; font-size:1.8rem; font-weight:700; color:#FFD700;">8 Å</div>
          </div>
        `;
      } else if (cageType === 'octahedral') {
        info.innerHTML = `
          <h4 style="color:#FF8C00;">🟠 팔면체형 기공 (Octahedral Cage)</h4>
          <p class="muted" style="margin-bottom:0.8rem;">크기 약 <strong style="color:#FF8C00;">11 Å</strong> · UiO-66의 큰 기공</p>
          <p>Zr₆ 클러스터 <strong>6개</strong>로 둘러싸인 넓은 공간입니다. 더 큰 분자의 흡착·저장이 이루어지는 주요 공간입니다.</p>
          <div style="margin-top:1rem; padding:0.85rem; background:rgba(255,140,0,0.08); border:1px solid #FF8C0055; border-radius:10px; text-align:center;">
            <div style="font-size:0.78rem; color:var(--txm); letter-spacing:0.06em;">cage 지름 ≈</div>
            <div style="margin-top:0.3rem; font-family:'Orbitron'; font-size:1.8rem; font-weight:700; color:#FF8C00;">11 Å</div>
          </div>
        `;
      } else if (cageType === 'window') {
        info.innerHTML = `
          <h4 style="color:#87CEEB;">🔵 삼각형 창 (Triangular Window)</h4>
          <p class="muted" style="margin-bottom:0.8rem;">크기 약 <strong style="color:#87CEEB;">6 Å</strong> · UiO-66의 통로</p>
          <p>사면체·팔면체 기공을 연결하는 <strong>통로</strong>입니다. 이 창보다 큰 분자는 기공 간 이동이 제한됩니다.</p>
          <div style="margin-top:1rem; padding:0.85rem; background:rgba(135,206,235,0.08); border:1px solid #87CEEB55; border-radius:10px; text-align:center;">
            <div style="font-size:0.78rem; color:var(--txm); letter-spacing:0.06em;">창 지름 ≈</div>
            <div style="margin-top:0.3rem; font-family:'Orbitron'; font-size:1.8rem; font-weight:700; color:#87CEEB;">6 Å</div>
          </div>
          <p class="muted" style="margin-top:0.85rem; font-size:0.82rem;">
            → UiO-66의 분자체(molecular sieve) 효과는 바로 이 창 크기가 결정합니다.
          </p>
        `;
      } else {
        // generic sphere pore (HKUST-1, MOF-5)
        const col = MV.poreColor(pore.radius);
        info.innerHTML = `
          <h4 style="color:${col.hex};">🔷 기공 (Pore)</h4>
          <p class="muted" style="margin-bottom:0.8rem;">반지름 약 <strong style="color:${col.hex}">${pore.radius.toFixed(2)} Å</strong> · ${col.label}</p>
          <p>이 빈 공간이 바로 MOF의 <strong>기공</strong>입니다. 다른 분자가 들어와 흡착되는 '방'이며, 균일한 크기 덕분에 분자 크기에 따른 선택적 흡착(분자체 효과)이 가능합니다.</p>
          <div style="margin-top:1rem; padding:0.85rem; background:rgba(255,255,255,0.04); border:1px solid ${col.hex}55; border-radius:10px; text-align:center;">
            <div style="font-size:0.78rem; color:var(--txm); letter-spacing:0.06em;">기공 지름 ≈</div>
            <div style="margin-top:0.3rem; font-family:'Orbitron'; font-size:1.8rem; font-weight:700; color:${col.hex};">${(pore.radius*2).toFixed(1)} Å</div>
          </div>
          <p class="muted" style="margin-top:0.85rem; font-size:0.82rem;">
            → 동일한 MOF 안에 <strong>서로 다른 크기의 기공</strong>이 공존할 수 있습니다. 색상 범례를 확인해보세요!
          </p>
        `;
      }
      info.querySelector('h4').style.animation = 'fadeIn 0.4s ease both';
    }

    /* ----- CIF parser (VESTA-style) ----- */
    function parseCIF(text) {
      const out = { cell: {}, atoms: [] };
      const lines = text.split(/\r?\n/);
      let i = 0;
      while (i < lines.length) {
        const line = lines[i].trim();
        const m = line.match(/^_cell_(length|angle)_(\w+)\s+([\-\d.]+)/i);
        if (m) out.cell[`${m[1]}_${m[2].toLowerCase()}`] = parseFloat(m[3]);

        if (line === 'loop_') {
          let j = i + 1;
          const cols = [];
          while (j < lines.length && lines[j].trim().startsWith('_')) {
            cols.push(lines[j].trim()); j++;
          }
          if (cols.some(c => c.startsWith('_atom_site_'))) {
            const col = {};
            cols.forEach((c, idx) => {
              if (c === '_atom_site_label')        col.label = idx;
              else if (c === '_atom_site_fract_x') col.fx    = idx;
              else if (c === '_atom_site_fract_y') col.fy    = idx;
              else if (c === '_atom_site_fract_z') col.fz    = idx;
              else if (c === '_atom_site_type_symbol') col.sym = idx;
            });
            while (j < lines.length) {
              const t = lines[j].trim();
              if (!t || t.startsWith('_') || t.startsWith('loop_') || t.startsWith('data_')) break;
              const p = t.split(/\s+/);
              const elem = (p[col.sym] || (p[col.label] || '').replace(/[\d]+$/, '')).trim();
              const fx = parseFloat(p[col.fx]);
              const fy = parseFloat(p[col.fy]);
              const fz = parseFloat(p[col.fz]);
              if (Number.isFinite(fx) && Number.isFinite(fy) && Number.isFinite(fz) && ELEMS[elem]) {
                out.atoms.push({ label: p[col.label], fx, fy, fz, element: elem });
              }
              j++;
            }
            i = j; continue;
          }
        }
        i++;
      }
      return out;
    }

    function buildLattice(cell) {
      const a = cell.length_a, b = cell.length_b, c = cell.length_c;
      const al = (cell.angle_alpha || 90) * Math.PI / 180;
      const be = (cell.angle_beta  || 90) * Math.PI / 180;
      const ga = (cell.angle_gamma || 90) * Math.PI / 180;
      const ax = a;
      const bx = b * Math.cos(ga),  by = b * Math.sin(ga);
      const cx = c * Math.cos(be);
      const cy = c * (Math.cos(al) - Math.cos(be) * Math.cos(ga)) / Math.sin(ga);
      const cz = Math.sqrt(Math.max(0, c * c - cx * cx - cy * cy));
      return { ax, bx, by, cx, cy, cz };
    }
    function fractToCart(fx, fy, fz, L) {
      return new THREE.Vector3(
        fx * L.ax + fy * L.bx + fz * L.cx,
                    fy * L.by + fz * L.cy,
                                fz * L.cz,
      );
    }

    /* ----- Three.js scene ----- */
    let scene, camera, renderer, atomGroup, bondGroup, poreGroup;
    const v = {
      rotX: 0.45, rotY: 0.7, zoom: 1,
      dragging: false, dragLast: null, downAt: null,
      autoRotate: true,
      target: new THREE.Vector3(),
    };
    const BASE_D = 42;

    function sizeRenderer() {
      if (!renderer) return;
      const r = mountEl.getBoundingClientRect();
      if (r.width < 10) return;
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
    }
    function updateCamera() {
      const d = BASE_D * v.zoom;
      camera.position.x = d * Math.sin(v.rotY) * Math.cos(v.rotX);
      camera.position.y = d * Math.sin(v.rotX);
      camera.position.z = d * Math.cos(v.rotY) * Math.cos(v.rotX);
      camera.lookAt(v.target);
    }

    function initScene() {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      mountEl.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const key = new THREE.DirectionalLight(0xffffff, 0.7);
      key.position.set(12, 18, 10); scene.add(key);
      const rim = new THREE.DirectionalLight(0x60a5fa, 0.25);
      rim.position.set(-10, -5, -8); scene.add(rim);

      atomGroup = new THREE.Group();
      bondGroup = new THREE.Group();
      poreGroup = new THREE.Group();
      scene.add(bondGroup, atomGroup, poreGroup);
      sizeRenderer();
    }

    function addAtoms(atoms, cart) {
      const geoms = {}, mats = {};
      Object.entries(ELEMS).forEach(([sym, e]) => {
        const seg = sym === 'H' ? 8 : 14;
        geoms[sym] = new THREE.SphereGeometry(e.radius, seg, Math.max(6, seg - 2));
        mats[sym]  = new THREE.MeshPhongMaterial({
          color: e.color, shininess: 80,
          specular: 0x222222,
        });
      });
      atoms.forEach((a, idx) => {
        const m = new THREE.Mesh(geoms[a.element], mats[a.element]);
        m.position.copy(cart[idx]);
        m.userData = { element: a.element };
        atomGroup.add(m);
      });
    }

    function addBonds(atoms, cart) {
      const geom = new THREE.CylinderGeometry(0.08, 0.08, 1, 6, 1);
      const matMetal  = new THREE.MeshPhongMaterial({ color: 0xfb923c, shininess: 60 });
      const matOrg    = new THREE.MeshPhongMaterial({ color: 0x94a3b8, shininess: 40 });
      const matCH     = new THREE.MeshPhongMaterial({ color: 0xcbd5e1, shininess: 30 });
      const up = new THREE.Vector3(0, 1, 0);

      for (let i = 0; i < atoms.length; i++) {
        const pi = cart[i], ei = atoms[i].element;
        for (let j = i + 1; j < atoms.length; j++) {
          const ej = atoms[j].element;
          const cutoff = BONDS[`${ei}-${ej}`];
          if (!cutoff) continue;
          const pj = cart[j];
          const d = pi.distanceTo(pj);
          if (d > cutoff || d < 0.3) continue;
          const dir = new THREE.Vector3().subVectors(pj, pi);
          const mid = new THREE.Vector3().lerpVectors(pi, pj, 0.5);
          const mat = (ei === 'Cu' || ej === 'Cu') ? matMetal
                    : (ei === 'H'  || ej === 'H')  ? matCH
                                                   : matOrg;
          const m = new THREE.Mesh(geom, mat);
          m.position.copy(mid);
          m.scale.y = d;
          m.quaternion.setFromUnitVectors(up, dir.normalize());
          bondGroup.add(m);
        }
      }
    }

    function addPores(L, cart) {
      // Candidate void centers in fractional coords (HKUST-1 large cage at body center)
      const cands = [[0.5, 0.5, 0.5], [0.25, 0.25, 0.25], [0.75, 0.75, 0.75]];
      cands.forEach(f => {
        const p = fractToCart(f[0], f[1], f[2], L);
        let minD = Infinity;
        for (const a of cart) { const d = p.distanceTo(a); if (d < minD) minD = d; }
        if (minD < 2.2) return;
        const r = Math.min(4.2, minD * 0.72);
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(r, 28, 18),
          new THREE.MeshPhongMaterial({
            color: 0x06b6d4, transparent: true, opacity: 0.18,
            shininess: 120, emissive: 0x06b6d4, emissiveIntensity: 0.30,
            depthWrite: false,
          }),
        );
        m.position.copy(p);
        m.userData = { isPore: true };
        poreGroup.add(m);
      });
    }

    function centerStructure(cart) {
      const c = new THREE.Vector3();
      cart.forEach(p => c.add(p));
      c.divideScalar(cart.length || 1);
      cart.forEach(p => p.sub(c));
      return c;
    }

    /* ----- Interaction ----- */
    function bindInput() {
      const dom = renderer.domElement;

      dom.addEventListener('mousedown', e => {
        v.dragging = true;
        v.dragLast = { x: e.clientX, y: e.clientY };
        v.downAt   = { x: e.clientX, y: e.clientY, t: Date.now() };
        v.autoRotate = false;
        e.preventDefault();
      });
      window.addEventListener('mousemove', e => {
        if (!v.dragging) return;
        const dx = e.clientX - v.dragLast.x;
        const dy = e.clientY - v.dragLast.y;
        v.rotY += dx * 0.008;
        v.rotX += dy * 0.008;
        v.rotX = Math.max(-1.4, Math.min(1.4, v.rotX));
        v.dragLast = { x: e.clientX, y: e.clientY };
      });
      window.addEventListener('mouseup', e => {
        if (!v.dragging) return;
        v.dragging = false;
        // click vs drag
        if (v.downAt) {
          const dx = e.clientX - v.downAt.x, dy = e.clientY - v.downAt.y;
          const dt = Date.now() - v.downAt.t;
          if (dt < 350 && Math.hypot(dx, dy) < 5) pickAt(e.clientX, e.clientY);
        }
        v.downAt = null;
      });

      dom.addEventListener('wheel', e => {
        e.preventDefault();
        v.zoom *= e.deltaY > 0 ? 1.1 : 0.9;
        v.zoom = Math.max(0.35, Math.min(3, v.zoom));
      }, { passive: false });

      dom.addEventListener('dblclick', () => { v.autoRotate = !v.autoRotate; });

      // touch
      let tStart = null;
      dom.addEventListener('touchstart', e => {
        if (e.touches.length === 1) {
          tStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
          v.autoRotate = false;
        }
      }, { passive: true });
      dom.addEventListener('touchmove', e => {
        if (!tStart || e.touches.length !== 1) return;
        const t = e.touches[0];
        const dx = t.clientX - tStart.x;
        const dy = t.clientY - tStart.y;
        v.rotY += dx * 0.008;
        v.rotX += dy * 0.008;
        v.rotX = Math.max(-1.4, Math.min(1.4, v.rotX));
        tStart.x = t.clientX; tStart.y = t.clientY;
      }, { passive: true });
      dom.addEventListener('touchend', e => {
        if (tStart && (Date.now() - tStart.t) < 250) {
          const ch = e.changedTouches[0];
          pickAt(ch.clientX, ch.clientY);
        }
        tStart = null;
      });

      if (resetBtn) resetBtn.addEventListener('click', () => {
        v.rotX = 0.45; v.rotY = 0.7; v.zoom = 1; v.autoRotate = true;
      });

      window.addEventListener('resize', sizeRenderer);
    }

    const raycaster = new THREE.Raycaster();
    const ndc       = new THREE.Vector2();
    function pickAt(cx, cy) {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x =  ((cx - rect.left) / rect.width)  * 2 - 1;
      ndc.y = -((cy - rect.top)  / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);

      // pore first (large translucent spheres)
      const ph = raycaster.intersectObjects(poreGroup.children);
      if (ph.length) { showPore(); return; }

      const ah = raycaster.intersectObjects(atomGroup.children);
      if (ah.length) {
        const el = ah[0].object.userData.element;
        if (el === 'Cu') showMetal();
        else showLigand(el);
      }
    }

    /* ----- Info panel content ----- */
    function showMetal() {
      info.innerHTML = `
        <h4 style="color:var(--cu);">🟠 금속 노드 (Cu²⁺)</h4>
        <p class="muted" style="margin-bottom:0.8rem;">SBU · Secondary Building Unit · 패들휠 클러스터</p>
        <p>HKUST-1의 모서리는 두 개의 구리 이온이 네 개의 BTC 카르복실기 산소와 결합한 <strong>패들휠(paddle-wheel)</strong> 구조입니다. 한 패들휠당 Cu 2개 · O 8개 · 외부에 빈 자리 1개씩이 있습니다.</p>
        <ul style="margin-top:0.75rem; padding-left:1.1rem; color:var(--txm); font-size:0.88rem; line-height:1.75;">
          <li><strong>활성점 역할</strong>: 외부 빈자리가 CO₂·H₂O 흡착 자리</li>
          <li><strong>강성 제공</strong>: 격자의 모서리/관절</li>
          <li><strong>색</strong>: 짙은 청록색 (산화구리의 특징)</li>
          <li><strong>좌표(CIF)</strong>: 12개의 Cu가 단위셀에 분포</li>
        </ul>
      `;
      info.querySelector('h4').style.animation = 'fadeIn 0.4s ease both';
    }

    function showLigand(el) {
      const elemDesc = el === 'C' ? '탄소 (벤젠 고리의 일부)'
                     : el === 'O' ? '산소 (카르복실기 -COOH의 일부)'
                     :              '수소 (벤젠 고리 C-H)';
      info.innerHTML = `
        <h4 style="color:var(--bl2);">🔵 유기 리간드 (Linker)</h4>
        <p class="muted" style="margin-bottom:0.8rem;">${elemDesc}</p>
        <p>금속 노드 사이를 잇는 <strong>막대</strong> 역할을 합니다. 양 끝의 카르복실기(-COOH)가 금속 이온과 결합해 격자가 만들어집니다. MOF 종류별로 다른 리간드를 사용해 기공 크기와 화학적 성질을 조절합니다.</p>
        <div class="ligand-diagrams">
          ${btcSvg()}
          ${bdcSvg()}
        </div>
      `;
      info.querySelector('h4').style.animation = 'fadeIn 0.4s ease both';
    }

    function showPore() {
      info.innerHTML = `
        <h4 style="color:var(--ac);">🔷 기공 (Pore)</h4>
        <p class="muted" style="margin-bottom:0.8rem;">~9 Å · 분자를 흡착하는 빈 공간</p>
        <p>HKUST-1은 약 <strong>9 Å</strong> 크기의 큰 기공과 <strong>5 Å</strong> 크기의 작은 기공이 함께 존재하는 <strong>이중 기공</strong> 구조입니다. 균일하기 때문에 CO₂·N₂·CH₄ 같은 작은 분자를 선택적으로 흡착할 수 있습니다.</p>
        <div style="margin-top:1rem; padding:0.85rem; background:rgba(6,182,212,.08); border:1px solid rgba(6,182,212,.3); border-radius:10px; text-align:center;">
          <div style="font-size:0.78rem; color:var(--txm); letter-spacing:0.06em;">단위 셀 내 빈 공간</div>
          <div style="margin-top:0.3rem; font-family:'Orbitron'; font-size:1.8rem; font-weight:700; color:var(--ac);">~70%</div>
        </div>
        <p class="muted" style="margin-top:0.85rem; font-size:0.82rem;">
          → 1 g의 HKUST-1 결정에 약 1,500 m² (= 축구장 1/5)의 표면적이 들어있습니다.
        </p>
      `;
      info.querySelector('h4').style.animation = 'fadeIn 0.4s ease both';
    }

    /* ----- BTC / BDC molecular structure SVG ----- */
    function btcSvg() {
      // pointy-top hexagon, COOH at vertices 1, 3, 5 (alternating)
      return `
        <div class="lig-card">
          <h5>BTC <span class="muted">(HKUST-1 에서 사용)</span></h5>
          <svg viewBox="0 0 240 220" class="lig-svg" xmlns="http://www.w3.org/2000/svg">
            <!-- benzene ring (pointy-top hexagon) -->
            <g stroke="#cbd5e1" stroke-width="2" fill="none" stroke-linejoin="round">
              <polygon points="120,72 161,96 161,144 120,168 79,144 79,96" />
              <circle cx="120" cy="120" r="22" stroke-dasharray="3 3" stroke="#94a3b8"/>
            </g>
            <!-- bonds to substituents -->
            <g stroke="#fb923c" stroke-width="2" fill="none">
              <line x1="120" y1="72"  x2="120" y2="36" />
              <line x1="161" y1="144" x2="196" y2="164" />
              <line x1="79"  y1="144" x2="44"  y2="164" />
            </g>
            <!-- COOH labels with O=C-OH detail -->
            <g font-family="JetBrains Mono" font-size="11" font-weight="700" text-anchor="middle">
              <text x="120" y="26" fill="#fb923c">HOOC</text>
              <text x="210" y="170" fill="#fb923c">COOH</text>
              <text x="30"  y="170" fill="#fb923c">HOOC</text>
            </g>
            <!-- ring C-H atoms on positions 2, 4, 6 (between COOH) -->
            <g font-family="JetBrains Mono" font-size="9" fill="#94a3b8" text-anchor="middle">
              <text x="172" y="92">H</text>
              <text x="120" y="184">H</text>
              <text x="68"  y="92">H</text>
            </g>
            <!-- ring C labels -->
            <g font-family="JetBrains Mono" font-size="8" fill="#64748b" text-anchor="middle">
              <text x="120" y="84">C1</text>
              <text x="155" y="105">C2</text>
              <text x="155" y="140">C3</text>
              <text x="120" y="158">C4</text>
              <text x="85"  y="140">C5</text>
              <text x="85"  y="105">C6</text>
            </g>
          </svg>
          <p class="desc">
            <strong>1,3,5-벤젠트리카복실산</strong><br>
            벤젠 고리에 -COOH가 3개 (평면 삼각형 배치)<br>
            화학식: C₉H₆O₆
          </p>
        </div>
      `;
    }

    function bdcSvg() {
      // flat-top hexagon, COOH at left (180°) and right (0°) — para positions
      return `
        <div class="lig-card">
          <h5>BDC <span class="muted">(MOF-5 · MIL-101 · UiO-66)</span></h5>
          <svg viewBox="0 0 320 150" class="lig-svg" xmlns="http://www.w3.org/2000/svg">
            <!-- benzene ring (flat-top hexagon) -->
            <g stroke="#cbd5e1" stroke-width="2" fill="none" stroke-linejoin="round">
              <polygon points="120,40 200,40 240,75 200,110 120,110 80,75" />
              <circle cx="160" cy="75" r="24" stroke-dasharray="3 3" stroke="#94a3b8"/>
            </g>
            <!-- bonds to COOH (left and right, para) -->
            <g stroke="#fb923c" stroke-width="2" fill="none">
              <line x1="80"  y1="75" x2="44"  y2="75" />
              <line x1="240" y1="75" x2="276" y2="75" />
            </g>
            <!-- COOH labels -->
            <g font-family="JetBrains Mono" font-size="11" font-weight="700" text-anchor="middle">
              <text x="26"  y="79" fill="#fb923c">HOOC</text>
              <text x="294" y="79" fill="#fb923c">COOH</text>
            </g>
            <!-- ring C-H atoms -->
            <g font-family="JetBrains Mono" font-size="9" fill="#94a3b8" text-anchor="middle">
              <text x="120" y="32">H</text>
              <text x="200" y="32">H</text>
              <text x="120" y="124">H</text>
              <text x="200" y="124">H</text>
            </g>
            <!-- ring C labels -->
            <g font-family="JetBrains Mono" font-size="8" fill="#64748b" text-anchor="middle">
              <text x="74"  y="79">C1</text>
              <text x="120" y="52">C2</text>
              <text x="200" y="52">C3</text>
              <text x="246" y="79">C4</text>
              <text x="200" y="100">C5</text>
              <text x="120" y="100">C6</text>
            </g>
          </svg>
          <p class="desc">
            <strong>1,4-벤젠다이카복실산 (테레프탈산)</strong><br>
            벤젠 고리 양쪽에 -COOH가 2개 (직선 배치)<br>
            화학식: C₈H₆O₄
          </p>
        </div>
      `;
    }

    /* ----- Animation loop ----- */
    function animate() {
      requestAnimationFrame(animate);
      if (v.autoRotate) v.rotY += 0.0035;
      updateCamera();
      if (renderer && scene) renderer.render(scene, camera);
    }

    /* ----- Load CIF and start ----- */
    fetch('HKUST1.cif', { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(text => {
        const parsed = parseCIF(text);
        if (!parsed.atoms.length || !parsed.cell.length_a) throw new Error('CIF 파싱 실패');

        initScene();
        const L = buildLattice(parsed.cell);
        const cart = parsed.atoms.map(a => fractToCart(a.fx, a.fy, a.fz, L));
        const c = centerStructure(cart);

        addBonds(parsed.atoms, cart);
        addAtoms(parsed.atoms, cart);
        addPores(L, cart);
        poreGroup.children.forEach(p => p.position.sub(c));

        bindInput();
        loading.style.display = 'none';
        animate();

        console.log(`✓ HKUST-1 loaded: ${parsed.atoms.length} atoms, cell a=${parsed.cell.length_a}Å`);
      })
      .catch(err => {
        loading.innerHTML = `
          <div style="color:var(--err); padding:1rem; text-align:center;">
            <div style="font-size:1.8rem; margin-bottom:0.5rem;">⚠</div>
            HKUST-1 3D 모델을 불러올 수 없습니다.
            <div style="margin-top:0.7rem; color:var(--txm); font-size:0.82rem; line-height:1.55;">
              <code>npm start</code>로 로컬 서버 실행 후 접속하면 표시됩니다.<br>
              <span style="opacity:0.7;">(${String(err.message || err)})</span>
            </div>
          </div>`;
        console.error('CIF load error:', err);
      });
  }

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
