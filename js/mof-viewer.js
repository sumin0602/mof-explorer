/* ============================================================
   MOF Explorer — Shared 3D viewer library
   Used by structure.html (educational view) and game.html (3D
   minigames).

   Exposes a single global: window.MOFViewer

   API
     MOFViewer.parseCIF(text)      → { cell, atoms }
     MOFViewer.buildLattice(cell)  → lattice matrix
     MOFViewer.fractToCart(...)    → THREE.Vector3
     MOFViewer.ELEMS / BONDS       → element/bond maps
     MOFViewer.findPores(...)      → [{ position, radius }]
     MOFViewer.poreColor(r)        → { color, hex, label, bucket }
     MOFViewer.create(opts)        → viewer instance
     MOFViewer.REGISTRY            → metadata for the bundled MOFs
   ============================================================ */

(function () {
  if (!window.THREE) {
    console.warn('MOFViewer: THREE.js not loaded — viewer disabled.');
    return;
  }
  const THREE = window.THREE;

  /* ----- Element table (radius in Å, CPK-ish colors) ----- */
  const ELEMS = {
    Cu: { color: 0xfb923c, radius: 0.78, label: '구리 (Cu)' },
    Zn: { color: 0xa1a1aa, radius: 0.78, label: '아연 (Zn)' },
    Zr: { color: 0x22d3ee, radius: 0.88, label: '지르코늄 (Zr)' },
    Cr: { color: 0xc084fc, radius: 0.78, label: '크롬 (Cr)' },
    O:  { color: 0xef4444, radius: 0.40, label: '산소 (O)' },
    C:  { color: 0x64748b, radius: 0.34, label: '탄소 (C)' },
    H:  { color: 0xe2e8f0, radius: 0.20, label: '수소 (H)' },
    N:  { color: 0x60a5fa, radius: 0.36, label: '질소 (N)' },
  };
  const METALS = ['Cu', 'Zn', 'Zr', 'Cr'];

  /* ----- Bond distance cutoffs (Å) ----- */
  const BONDS = {
    'Cu-O': 2.6, 'Zn-O': 2.4, 'Zr-O': 2.6, 'Cr-O': 2.4,
    'C-O':  1.7, 'C-C':  1.8, 'C-H':  1.3, 'C-N':  1.6,
    'O-H':  1.2, 'N-H':  1.2,
  };
  function bondCutoff(a, b) {
    return BONDS[`${a}-${b}`] || BONDS[`${b}-${a}`] || 0;
  }

  /* ----- Pore color buckets (by radius in Å) ----- */
  function poreColor(r) {
    if (r < 4)  return { color: 0xfbbf24, hex: '#fbbf24', label: '소형 (≤4 Å)',     bucket: 0 };
    if (r < 7)  return { color: 0x06b6d4, hex: '#06b6d4', label: '중형 (4-7 Å)',    bucket: 1 };
    if (r < 10) return { color: 0x3b82f6, hex: '#3b82f6', label: '대형 (7-10 Å)',   bucket: 2 };
    if (r < 13) return { color: 0xa855f7, hex: '#a855f7', label: '초대형 (10-13 Å)',bucket: 3 };
    return        { color: 0xec4899, hex: '#ec4899', label: '특대형 (≥13 Å)',      bucket: 4 };
  }
  poreColor.PALETTE = [
    { hex: '#fbbf24', label: '소형 (≤4 Å)' },
    { hex: '#06b6d4', label: '중형 (4-7 Å)' },
    { hex: '#3b82f6', label: '대형 (7-10 Å)' },
    { hex: '#a855f7', label: '초대형 (10-13 Å)' },
    { hex: '#ec4899', label: '특대형 (≥13 Å)' },
  ];

  /* ----- Bundled MOFs (CIF in project root) ----- */
  const REGISTRY = {
    hkust1: {
      id: 'hkust1', name: 'HKUST-1', formula: 'Cu₃(BTC)₂',
      cif: 'HKUST1.cif', metal: 'Cu', metalLabel: '구리 (Cu²⁺)',
      ligand: 'BTC', sa: '~1,500 m²/g',
      pores: '9 / 5 Å 이중 기공',
      blurb: '구리 패들휠 + 1,3,5-벤젠트리카복실산. 9 Å·5 Å 이중 기공.',
      hint: '주황색 노드 (구리)',
    },
    mof5: {
      id: 'mof5', name: 'MOF-5', formula: 'Zn₄O(BDC)₃',
      cif: 'MOF5.cif', metal: 'Zn', metalLabel: '아연 (Zn²⁺)',
      ligand: 'BDC', sa: '~3,800 m²/g',
      pores: '~12 Å 단일 기공',
      blurb: '아연 클러스터 + 테레프탈산. 거대 단일 기공, 최고 비표면적.',
      hint: '은회색 노드 (아연), 초거대 단일 cage',
    },
    uio66: {
      id: 'uio66', name: 'UiO-66', formula: 'Zr₆O₄(OH)₄(BDC)₆',
      cif: 'UiO-66.cif', metal: 'Zr', metalLabel: '지르코늄 (Zr⁴⁺)',
      ligand: 'BDC', sa: '~1,200 m²/g',
      pores: '12 Å 팔면체 + 7.5 Å 사면체',
      blurb: '지르코늄 6개로 이뤄진 매우 안정한 클러스터. 팔면체+사면체 이중 cage.',
      hint: '사이언 노드 (지르코늄), 2가지 cage',
    },
  };

  /* ============================================================
     CIF parser
     ============================================================ */
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
            if (c === '_atom_site_label')            col.label = idx;
            else if (c === '_atom_site_fract_x')     col.fx = idx;
            else if (c === '_atom_site_fract_y')     col.fy = idx;
            else if (c === '_atom_site_fract_z')     col.fz = idx;
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
            if (Number.isFinite(fx) && ELEMS[elem]) {
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
    return { ax, bx, by, cx, cy, cz, a, b, c, al, be, ga };
  }

  function fractToCart(fx, fy, fz, L) {
    return new THREE.Vector3(
      fx * L.ax + fy * L.bx + fz * L.cx,
                  fy * L.by + fz * L.cy,
                              fz * L.cz,
    );
  }

  /* ============================================================
     Pore detection via 3D grid scan
     ============================================================ */
  function findPores(atomsCart, L, opts = {}) {
    const N        = opts.gridN || 8;
    const minR     = opts.minR  || 2.6;
    const maxOut   = opts.maxOut || 10;

    const cands = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        for (let k = 0; k < N; k++) {
          const fx = (i + 0.5) / N;
          const fy = (j + 0.5) / N;
          const fz = (k + 0.5) / N;
          const p  = fractToCart(fx, fy, fz, L);
          let d = Infinity;
          for (const a of atomsCart) {
            const dd = p.distanceTo(a);
            if (dd < d) { d = dd; if (d < minR) break; }
          }
          if (d >= minR) cands.push({ p, r: d });
        }
      }
    }
    // Non-max suppression: keep largest, suppress overlapping
    cands.sort((a, b) => b.r - a.r);
    const kept = [];
    for (const c of cands) {
      let occluded = false;
      for (const k of kept) {
        if (c.p.distanceTo(k.p) < Math.max(k.r, c.r) * 0.85) { occluded = true; break; }
      }
      if (!occluded) kept.push({ position: c.p, radius: c.r });
      if (kept.length >= maxOut) break;
    }
    return kept;
  }

  /* ============================================================
     Supercell expansion (N×N×N copies)
     ============================================================ */
  function expandSupercell(atoms, cart, L, N) {
    if (N <= 1) return { atoms, cart };
    const outAtoms = [];
    const outCart  = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        for (let k = 0; k < N; k++) {
          const off = new THREE.Vector3(
            i * L.ax + j * L.bx + k * L.cx,
                       j * L.by + k * L.cy,
                                  k * L.cz,
          );
          for (let a = 0; a < atoms.length; a++) {
            outAtoms.push(atoms[a]);
            outCart.push(cart[a].clone().add(off));
          }
        }
      }
    }
    return { atoms: outAtoms, cart: outCart };
  }

  /* ============================================================
     Geometry/material caches (shared across viewers)
     ============================================================ */
  const _atomGeom = {}, _atomMat = {};
  function atomMesh(elem) {
    const E = ELEMS[elem];
    if (!E) return null;
    if (!_atomGeom[elem]) {
      const seg = (elem === 'H') ? 8 : 14;
      _atomGeom[elem] = new THREE.SphereGeometry(E.radius, seg, Math.max(6, seg - 2));
      _atomMat[elem]  = new THREE.MeshPhongMaterial({ color: E.color, shininess: 80, specular: 0x222222 });
    }
    return new THREE.Mesh(_atomGeom[elem], _atomMat[elem]);
  }

  let _bondGeom = null;
  function bondGeometry() {
    if (!_bondGeom) _bondGeom = new THREE.CylinderGeometry(0.08, 0.08, 1, 6, 1);
    return _bondGeom;
  }
  const _bondMats = {};
  function bondMaterial(kind) {
    const key = kind;
    if (!_bondMats[key]) {
      const c = key === 'metal' ? 0xfb923c
              : key === 'ch'    ? 0xcbd5e1
              :                   0x94a3b8;
      _bondMats[key] = new THREE.MeshPhongMaterial({ color: c, shininess: 40 });
    }
    return _bondMats[key];
  }

  /* ============================================================
     Viewer factory
     ============================================================ */
  function create(opts) {
    const mount = opts.mount;
    if (!mount) throw new Error('MOFViewer.create: mount element required');

    const cfg = {
      showPores:    opts.showPores !== false,
      showBonds:    opts.showBonds !== false,
      showAtoms:    opts.showAtoms !== false,
      poreOpacity:  opts.poreOpacity || 0.20,
      autoRotate:   opts.autoRotate !== false,
      supercell:    Math.max(1, Math.min(3, opts.supercell || 1)),
      hiddenPores:  !!opts.hiddenPores,        // for game: pores start invisible
      poreClickRadius: opts.poreClickRadius || 1.0, // tolerance for "empty space" picking
      bondLimit:    opts.bondLimit || 4500,    // safety cap
      atomLimit:    opts.atomLimit || 4500,
    };

    const handlers = {
      onAtomClick:  opts.onAtomClick  || function () {},
      onPoreClick:  opts.onPoreClick  || function () {},
      onEmptyClick: opts.onEmptyClick || function () {},
      onReady:      opts.onReady      || function () {},
    };

    /* ----- scene ----- */
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 800);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.7);
    key.position.set(12, 18, 10); scene.add(key);
    const rim = new THREE.DirectionalLight(0x60a5fa, 0.25);
    rim.position.set(-10, -5, -8); scene.add(rim);

    const atomGroup = new THREE.Group();
    const bondGroup = new THREE.Group();
    const poreGroup = new THREE.Group();
    scene.add(bondGroup, atomGroup, poreGroup);

    /* ----- state ----- */
    const view = {
      rotX: 0.45, rotY: 0.7, zoom: 1,
      dragging: false, dragLast: null, downAt: null,
      autoRotate: cfg.autoRotate,
      target: new THREE.Vector3(),
      baseDist: 42,
    };

    let currentMOF = null;
    let currentAtoms = [];
    let currentCart = [];
    let currentPores = []; // [{ position, radius, mesh, found }]
    let raf = null;
    let disposed = false;

    function size() {
      const r = mount.getBoundingClientRect();
      if (r.width < 10) return;
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
    }

    function updateCam() {
      const d = view.baseDist * view.zoom;
      camera.position.x = d * Math.sin(view.rotY) * Math.cos(view.rotX);
      camera.position.y = d * Math.sin(view.rotX);
      camera.position.z = d * Math.cos(view.rotY) * Math.cos(view.rotX);
      camera.lookAt(view.target);
    }

    function clearGroup(g) {
      while (g.children.length) {
        const c = g.children.pop();
        if (c.geometry && c.geometry !== _bondGeom && !_atomGeom[c.userData?.element]) c.geometry.dispose?.();
        if (c.material && !Object.values(_atomMat).includes(c.material) && !Object.values(_bondMats).includes(c.material)) {
          c.material.dispose?.();
        }
      }
    }

    function buildScene(parsed) {
      clearGroup(atomGroup);
      clearGroup(bondGroup);
      clearGroup(poreGroup);

      const L = buildLattice(parsed.cell);
      const baseCart = parsed.atoms.map(a => fractToCart(a.fx, a.fy, a.fz, L));

      // expand supercell
      const ex = expandSupercell(parsed.atoms, baseCart, L, cfg.supercell);
      let atoms = ex.atoms, cart = ex.cart;

      // safety cap (don't render absurd sizes)
      if (atoms.length > cfg.atomLimit) {
        atoms = atoms.slice(0, cfg.atomLimit);
        cart  = cart.slice(0, cfg.atomLimit);
      }

      // center
      const c = new THREE.Vector3();
      cart.forEach(p => c.add(p));
      c.divideScalar(cart.length || 1);
      cart.forEach(p => p.sub(c));

      currentAtoms = atoms;
      currentCart  = cart;

      // adjust camera distance for size
      const span = Math.max(L.a, L.b, L.c) * cfg.supercell;
      view.baseDist = span * 1.4;

      // ----- atoms -----
      if (cfg.showAtoms) {
        atoms.forEach((a, i) => {
          const m = atomMesh(a.element);
          if (!m) return;
          m.position.copy(cart[i]);
          m.userData = { element: a.element, index: i };
          atomGroup.add(m);
        });
      }

      // ----- bonds -----
      if (cfg.showBonds) {
        const up = new THREE.Vector3(0, 1, 0);
        const bg = bondGeometry();
        let count = 0;
        outer:
        for (let i = 0; i < atoms.length; i++) {
          const pi = cart[i], ei = atoms[i].element;
          for (let j = i + 1; j < atoms.length; j++) {
            const ej = atoms[j].element;
            const cutoff = bondCutoff(ei, ej);
            if (!cutoff) continue;
            const pj = cart[j];
            const d = pi.distanceTo(pj);
            if (d > cutoff || d < 0.3) continue;
            const dir = new THREE.Vector3().subVectors(pj, pi);
            const mid = new THREE.Vector3().lerpVectors(pi, pj, 0.5);
            const kind = (METALS.includes(ei) || METALS.includes(ej)) ? 'metal'
                       : (ei === 'H' || ej === 'H')                   ? 'ch'
                       :                                                'organic';
            const m = new THREE.Mesh(bg, bondMaterial(kind));
            m.position.copy(mid);
            m.scale.y = d;
            m.quaternion.setFromUnitVectors(up, dir.normalize());
            bondGroup.add(m);
            count++;
            if (count >= cfg.bondLimit) break outer;
          }
        }
      }

      // ----- pores -----
      // detect on single unit cell first, then replicate to supercell positions
      const baseLatticeCart = baseCart.map(v => v.clone());
      const cellPores = findPores(baseLatticeCart, L, { gridN: 8, minR: 2.8, maxOut: 8 });

      const pores = [];
      const N = cfg.supercell;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          for (let k = 0; k < N; k++) {
            const off = new THREE.Vector3(
              i * L.ax + j * L.bx + k * L.cx,
                         j * L.by + k * L.cy,
                                    k * L.cz,
            );
            cellPores.forEach(po => {
              const pos = po.position.clone().add(off).sub(c);
              pores.push({ position: pos, radius: po.radius });
            });
          }
        }
      }

      pores.forEach(po => {
        const col = poreColor(po.radius);
        const geom = new THREE.SphereGeometry(po.radius, 24, 16);
        const mat = new THREE.MeshPhongMaterial({
          color: col.color, transparent: true,
          opacity: cfg.hiddenPores ? 0.0 : cfg.poreOpacity,
          shininess: 120, emissive: col.color, emissiveIntensity: 0.32,
          depthWrite: false,
        });
        const m = new THREE.Mesh(geom, mat);
        m.position.copy(po.position);
        m.userData = { isPore: true, radius: po.radius, bucket: col.bucket, hex: col.hex };
        m.visible = cfg.showPores;
        po.mesh = m;
        po.found = !cfg.hiddenPores;
        poreGroup.add(m);
      });

      currentPores = pores;

      // honor cfg toggles
      atomGroup.visible = cfg.showAtoms;
      bondGroup.visible = cfg.showBonds;
      poreGroup.visible = cfg.showPores;

      size();
      handlers.onReady({ pores: pores, bucketsUsed: uniqueBuckets(pores) });
    }

    function uniqueBuckets(pores) {
      const set = new Set();
      pores.forEach(p => set.add(poreColor(p.radius).bucket));
      return Array.from(set).sort();
    }

    /* ----- public ----- */
    async function loadFromText(text, key) {
      const parsed = parseCIF(text);
      if (!parsed.atoms.length || !parsed.cell.length_a) throw new Error('CIF parse failed');
      currentMOF = key || null;
      buildScene(parsed);
    }
    async function loadFromURL(url, key) {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const txt = await r.text();
      return loadFromText(txt, key);
    }
    /**
     * Robust loader. Tries the inline `window.MOF_CIF_DATA[key]` first
     * (so the page works via file://), falling back to fetch() of the
     * registered CIF URL. Use this in app code rather than loadFromURL.
     */
    async function loadFromKey(key) {
      if (window.MOF_CIF_DATA && window.MOF_CIF_DATA[key]) {
        return loadFromText(window.MOF_CIF_DATA[key], key);
      }
      const meta = REGISTRY[key];
      if (!meta) throw new Error('Unknown MOF key: ' + key);
      return loadFromURL(meta.cif, key);
    }
    function setSupercell(n) {
      // Pure config update — caller must call loadFromURL again to rebuild.
      cfg.supercell = Math.max(1, Math.min(3, n));
    }
    function setPoreVisibility(v) {
      cfg.showPores = !!v;
      poreGroup.visible = !!v;
      currentPores.forEach(p => p.mesh && (p.mesh.visible = !!v));
    }
    function setBondVisibility(v) { cfg.showBonds = !!v; bondGroup.visible = !!v; }
    function setAtomVisibility(v) { cfg.showAtoms = !!v; atomGroup.visible = !!v; }
    function revealPore(idx) {
      const p = currentPores[idx];
      if (!p || p.found) return false;
      p.found = true;
      if (p.mesh) {
        p.mesh.visible = true;
        p.mesh.material.opacity = cfg.poreOpacity;
      }
      return true;
    }
    function resetCamera() {
      view.rotX = 0.45; view.rotY = 0.7; view.zoom = 1; view.autoRotate = cfg.autoRotate;
    }
    function setAutoRotate(v) { view.autoRotate = !!v; cfg.autoRotate = !!v; }
    function pores() { return currentPores; }
    function mofKey() { return currentMOF; }

    /* ----- interaction ----- */
    const raycaster = new THREE.Raycaster();
    const ndc       = new THREE.Vector2();

    function pickAt(cx, cy) {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x =  ((cx - rect.left) / rect.width)  * 2 - 1;
      ndc.y = -((cy - rect.top)  / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);

      // 1) visible pores
      const visiblePores = poreGroup.children.filter(m => m.visible && m.material.opacity > 0.01);
      const ph = raycaster.intersectObjects(visiblePores);
      if (ph.length) {
        const idx = currentPores.findIndex(p => p.mesh === ph[0].object);
        handlers.onPoreClick({ index: idx, pore: currentPores[idx], world: ph[0].point });
        return;
      }

      // 2) atoms
      const ah = raycaster.intersectObjects(atomGroup.children);
      if (ah.length) {
        const ud = ah[0].object.userData;
        handlers.onAtomClick({ element: ud.element, world: ah[0].point });
        return;
      }

      // 3) empty space — synthesize a world point on the focal plane
      const dir = raycaster.ray.direction.clone();
      const origin = raycaster.ray.origin.clone();
      // intersect with sphere of radius baseDist around target
      const t = view.baseDist * 0.6;
      const world = origin.add(dir.multiplyScalar(t));

      // also detect if click is near any hidden pore (for game)
      let nearest = -1, nearestDist = Infinity;
      currentPores.forEach((p, i) => {
        const d = p.position.distanceTo(world);
        const tol = (p.radius * cfg.poreClickRadius) + 1.2;
        if (d < tol && d < nearestDist) { nearestDist = d; nearest = i; }
      });
      handlers.onEmptyClick({ world, nearestPore: nearest, nearestDist });
    }

    function onMouseDown(e) {
      view.dragging = true;
      view.dragLast = { x: e.clientX, y: e.clientY };
      view.downAt   = { x: e.clientX, y: e.clientY, t: Date.now() };
      view.autoRotate = false;
      e.preventDefault();
    }
    function onMouseMove(e) {
      if (!view.dragging) return;
      const dx = e.clientX - view.dragLast.x;
      const dy = e.clientY - view.dragLast.y;
      view.rotY += dx * 0.008;
      view.rotX += dy * 0.008;
      view.rotX = Math.max(-1.4, Math.min(1.4, view.rotX));
      view.dragLast = { x: e.clientX, y: e.clientY };
    }
    function onMouseUp(e) {
      if (!view.dragging) return;
      view.dragging = false;
      if (view.downAt) {
        const dx = e.clientX - view.downAt.x, dy = e.clientY - view.downAt.y;
        const dt = Date.now() - view.downAt.t;
        if (dt < 350 && Math.hypot(dx, dy) < 5) pickAt(e.clientX, e.clientY);
      }
      view.downAt = null;
    }
    function onWheel(e) {
      e.preventDefault();
      view.zoom *= e.deltaY > 0 ? 1.1 : 0.9;
      view.zoom = Math.max(0.3, Math.min(3.5, view.zoom));
    }
    function onDbl() { view.autoRotate = !view.autoRotate; }

    let tStart = null;
    function onTStart(e) {
      if (e.touches.length === 1) {
        tStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
        view.autoRotate = false;
      }
    }
    function onTMove(e) {
      if (!tStart || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - tStart.x;
      const dy = t.clientY - tStart.y;
      view.rotY += dx * 0.008;
      view.rotX += dy * 0.008;
      view.rotX = Math.max(-1.4, Math.min(1.4, view.rotX));
      tStart.x = t.clientX; tStart.y = t.clientY;
    }
    function onTEnd(e) {
      if (tStart && (Date.now() - tStart.t) < 250) {
        const ch = e.changedTouches[0];
        pickAt(ch.clientX, ch.clientY);
      }
      tStart = null;
    }

    const dom = renderer.domElement;
    dom.addEventListener('mousedown',  onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    dom.addEventListener('wheel',      onWheel, { passive: false });
    dom.addEventListener('dblclick',   onDbl);
    dom.addEventListener('touchstart', onTStart, { passive: true });
    dom.addEventListener('touchmove',  onTMove,  { passive: true });
    dom.addEventListener('touchend',   onTEnd);
    window.addEventListener('resize', size);

    /* ----- loop ----- */
    function tick() {
      if (disposed) return;
      raf = requestAnimationFrame(tick);
      if (view.autoRotate) view.rotY += 0.0035;
      updateCam();
      renderer.render(scene, camera);
    }
    size();
    tick();

    function dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
      dom.removeEventListener('wheel',     onWheel);
      dom.removeEventListener('dblclick',  onDbl);
      dom.removeEventListener('touchstart',onTStart);
      dom.removeEventListener('touchmove', onTMove);
      dom.removeEventListener('touchend',  onTEnd);
      window.removeEventListener('resize', size);
      clearGroup(atomGroup); clearGroup(bondGroup); clearGroup(poreGroup);
      try { mount.removeChild(renderer.domElement); } catch (_) {}
      renderer.dispose();
    }

    return {
      loadFromText, loadFromURL, loadFromKey,
      setSupercell, setPoreVisibility, setBondVisibility, setAtomVisibility, revealPore,
      resetCamera, setAutoRotate,
      pores, mofKey,
      dispose,
      _scene: scene, _camera: camera,
    };
  }

  window.MOFViewer = {
    parseCIF, buildLattice, fractToCart,
    findPores, poreColor, expandSupercell,
    ELEMS, BONDS, METALS, REGISTRY,
    create,
  };
})();
