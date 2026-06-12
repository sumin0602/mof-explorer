/* ============================================
   MOF Explorer — Report logic + AI 첨삭
   ============================================ */

(function () {

  const MOF_DATA = {
    hkust1: {
      name: 'HKUST-1', formula: 'Cu₃(BTC)₂',
      metal: '구리 (Cu²⁺)',
      ligand: 'BTC (벤젠트리카르복실산)',
      year: 1999, pore: '9 / 5', sa: '~1,500',
      apps: ['가스 저장', 'CO₂ 포집', '촉매 반응'],
    },
    mof5: {
      name: 'MOF-5', formula: 'Zn₄O(BDC)₃',
      metal: '아연 (Zn²⁺)',
      ligand: 'BDC (테레프탈산)',
      year: 1999, pore: '~12', sa: '~3,800',
      apps: ['가스 저장', '에너지 저장'],
    },
    zif8: {
      name: 'ZIF-8', formula: 'Zn(mIm)₂',
      metal: '아연 (Zn²⁺)',
      ligand: 'mIm (2-메틸이미다졸)',
      year: 2006, pore: '3.4', sa: '~1,800',
      apps: ['가스 저장', '분리막', '센서'],
    },
    mil101: {
      name: 'MIL-101(Cr)', formula: 'Cr₃O(BDC)₃',
      metal: '크롬 (Cr³⁺)',
      ligand: 'BDC (테레프탈산)',
      year: 2005, pore: '29 / 34', sa: '~5,900',
      apps: ['약물 전달', 'CO₂ 포집', '환경 정화'],
    },
    uio66: {
      name: 'UiO-66', formula: 'Zr₆O₄(OH)₄(BDC)₆',
      metal: '지르코늄 (Zr⁴⁺)',
      ligand: 'BDC (테레프탈산)',
      year: 2008, pore: '6 / 8', sa: '~1,200',
      apps: ['환경 정화', '촉매 반응', '에너지 저장'],
    },
  };

  const STEP_TOTAL = 5;
  const STORAGE_KEY = 'mof_report';

  /* ---------- Backend detection ---------- */
  // The AI proxy lives at one of these places, in priority order:
  //   1. window.MOF_API_BASE (set inline in report.html for manual override)
  //   2. https://api.mof-explorer.com  (production: separate Vercel subdomain)
  //   3. '' (same origin — works for `npm start` local Express server)
  function apiBase() {
    // 1) explicit override (e.g. inline <script> in report.html)
    if (typeof window.MOF_API_BASE === 'string') return window.MOF_API_BASE;
    const h = location.hostname;
    // 2) local dev or same-origin host (Express + frontend together)
    if (!h || h === 'localhost' || h === '127.0.0.1') return '';
    // 3) hosted on Vercel directly → API is same origin
    if (h.endsWith('.vercel.app')) return '';
    // 4) production default — separate API subdomain
    return 'https://api.mof-explorer.com';
  }
  const API_BASE = apiBase();

  let SERVER = { available: false, ai: false, model: null, db: false };
  (async function probe() {
    try {
      const r = await fetch(API_BASE + '/api/health', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        SERVER = {
          available: true,
          ai: !!j.ai,
          model: j.model || null,
          db: !!j.db,
        };
        const intro = document.getElementById('aiIntro');
        if (intro && SERVER.ai) {
          const p = intro.querySelector('p.muted');
          if (p) p.innerHTML = `백엔드(${j.model})에 연결되었습니다. 실제 AI 첨삭을 받을 수 있어요.`;
        }
        showServerBanner();
      }
    } catch (_) { /* no backend — fallback mode */ }
  })();

  function showServerBanner() {
    // Only show "save to server" if the backend actually has a DB
    // (Express + SQLite during `npm start`). On Vercel-only deployments,
    // there's no persistent storage, so we hide the button.
    if (!SERVER.available || !SERVER.db) return;
    const saveBox = document.getElementById('serverSaveBox');
    if (saveBox) saveBox.style.display = 'block';
  }

  /* ---------- Step indicator ---------- */
  const indEl = document.getElementById('stepInd');
  for (let i = 1; i <= STEP_TOTAL; i++) {
    const d = document.createElement('div');
    d.className = 'step-dot';
    d.dataset.step = i;
    d.textContent = i;
    indEl.appendChild(d);
    if (i < STEP_TOTAL) {
      const l = document.createElement('div');
      l.className = 'step-line';
      l.dataset.line = i;
      indEl.appendChild(l);
    }
  }

  let stepIdx = 1;
  function goStep(n) {
    n = Math.max(1, Math.min(STEP_TOTAL, n));
    stepIdx = n;
    for (let i = 1; i <= STEP_TOTAL; i++) {
      const dot  = indEl.querySelector(`.step-dot[data-step="${i}"]`);
      const sec  = document.getElementById('step' + i);
      const line = indEl.querySelector(`.step-line[data-line="${i}"]`);
      dot.classList.toggle('active', i === n);
      dot.classList.toggle('done',   i < n);
      if (i < n) dot.innerHTML = '✓'; else dot.textContent = i;
      if (line) line.classList.toggle('done', i < n);
      sec.classList.toggle('active', i === n);
    }
    if (n === 5) renderPreview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    persist();
  }

  document.querySelectorAll('[data-go]').forEach(b => {
    b.addEventListener('click', () => {
      const target = +b.dataset.go;
      // Only validate when MOVING FORWARD (target > current).
      // Backward navigation is always allowed.
      if (target > stepIdx) {
        const err = validateStep(stepIdx);
        if (err) {
          showStepError(stepIdx, err);
          return;
        }
      }
      clearStepError(stepIdx);
      goStep(target);
    });
  });

  /* ---------- Step validation (added per spec 수정 5/6/7) ---------- */
  function validateStep(n) {
    if (n === 1) {
      if (!selMOF) return { target: '#mofPick', msg: '조사할 MOF를 선택해주세요.' };
    }
    if (n === 2) {
      const fields = [
        { id: 'f_formula', label: '화학식' },
        { id: 'f_year',    label: '발견·합성 연도' },
        { id: 'f_metal',   label: '구성 금속 이온' },
        { id: 'f_ligand',  label: '유기 리간드' },
        { id: 'f_pore',    label: '기공 크기' },
        { id: 'f_sa',      label: '비표면적' },
        { id: 'f_struct',  label: '구조 특징 설명' },
      ];
      for (const f of fields) {
        if (!val(f.id)) return { target: '#' + f.id, msg: `${f.label}에 직접 조사한 내용을 입력해주세요.` };
      }
    }
    if (n === 3) {
      if (getCheckedApps().length === 0) {
        return { target: '#appsPills', msg: '응용 분야를 1개 이상 선택해주세요.' };
      }
    }
    return null;
  }

  function showStepError(step, err) {
    // 1) box-shadow / outline on the offending region
    const node = document.querySelector(err.target);
    if (node) {
      node.classList.add('field-error');
      const focusEl = node.matches('input, textarea, select') ? node : null;
      if (focusEl) focusEl.focus();
      // also scroll into view
      try { node.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
    }
    // 2) inline banner under the step's "다음 →" action area
    const sec = document.getElementById('step' + step);
    if (!sec) return;
    let banner = sec.querySelector('.step-error');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'step-error';
      sec.querySelector('.step-actions')?.parentNode?.insertBefore(banner, sec.querySelector('.step-actions'));
    }
    banner.innerHTML = `⚠ ${err.msg}`;
  }

  function clearStepError(step) {
    const sec = document.getElementById('step' + step);
    if (!sec) return;
    sec.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
    const banner = sec.querySelector('.step-error');
    if (banner) banner.remove();
  }

  /* ---------- Today's date ---------- */
  const todayInput = document.getElementById('f_date');
  if (todayInput && !todayInput.value) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    todayInput.value = `${yyyy}-${mm}-${dd}`;
  }

  /* ---------- MOF pick ---------- */
  let selMOF = null;
  const picks = document.querySelectorAll('#mofPick .pick');
  picks.forEach(p => {
    p.addEventListener('click', () => {
      picks.forEach(x => x.classList.toggle('sel', x === p));
      selMOF = p.dataset.mof;
      const d = MOF_DATA[selMOF];

      // NOTE (per spec 수정 7): NO autofill into form fields.
      // The student must investigate and type each value themselves.
      // The hint box still shows the canonical values as a *reference*
      // so the student can verify their own research.

      const hint = document.getElementById('hintBox');
      const kv = document.getElementById('hintKv');
      kv.innerHTML = `
        <div class="k">화학식</div><div>${d.formula}</div>
        <div class="k">금속 이온</div><div>${d.metal}</div>
        <div class="k">유기 리간드</div><div>${d.ligand}</div>
        <div class="k">기공 크기</div><div>${d.pore} Å</div>
        <div class="k">비표면적</div><div>${d.sa} m²/g</div>
        <div class="k">주요 응용</div><div>${d.apps.join(', ')}</div>
      `;
      hint.classList.add('show');

      // Clear any 1-step "select a MOF" warning
      clearStepError(1);

      persist();
    });
  });

  /* ---------- Helpers ---------- */
  function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function set(id, v) {
    const el = document.getElementById(id);
    if (el) { el.value = v == null ? '' : String(v); }
  }
  function getCheckedApps() {
    return Array.from(document.querySelectorAll('#appsPills input:checked')).map(c => c.value);
  }

  /* ---------- Pills ---------- */
  document.querySelectorAll('#appsPills .pill').forEach(p => {
    const cb = p.querySelector('input');
    p.addEventListener('click', e => {
      // prevent double-toggle when label fires
      if (e.target !== cb) {
        cb.checked = !cb.checked;
      }
      p.classList.toggle('on', cb.checked);
      persist();
    });
  });

  /* ---------- Character counters ---------- */
  function countersUpdate() {
    document.querySelectorAll('.char-count').forEach(el => {
      const tgt = document.getElementById(el.dataset.for);
      if (!tgt) return;
      const target = parseInt(tgt.dataset.target || '100', 10);
      const len = tgt.value.length;
      el.textContent = `${len} / ${target}자`;
      el.classList.remove('warn', 'ok');
      if (len >= target) el.classList.add('ok');
      else if (len >= target * 0.6) el.classList.add('warn');
    });
  }
  document.querySelectorAll('textarea').forEach(t => {
    t.addEventListener('input', () => { countersUpdate(); persist(); });
  });
  document.querySelectorAll('input').forEach(i => {
    i.addEventListener('input', persist);
  });
  countersUpdate();

  /* ---------- Persistence ---------- */
  function persist() {
    try {
      const payload = {
        step: stepIdx,
        selMOF,
        fields: {},
        apps: getCheckedApps(),
      };
      ['f_name','f_id','f_date','f_formula','f_year','f_metal','f_ligand','f_pore','f_sa',
       'f_struct','f_app','f_pros','f_cons','f_ref'].forEach(id => {
        payload.fields[id] = val(id);
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {}
  }

  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.fields) {
        Object.entries(d.fields).forEach(([k, v]) => set(k, v));
      }
      if (d.selMOF) {
        const p = document.querySelector(`#mofPick .pick[data-mof="${d.selMOF}"]`);
        if (p) {
          selMOF = d.selMOF;
          p.classList.add('sel');
          const md = MOF_DATA[selMOF];
          if (md) {
            const hint = document.getElementById('hintBox');
            const kv = document.getElementById('hintKv');
            kv.innerHTML = `
              <div class="k">화학식</div><div>${md.formula}</div>
              <div class="k">금속 이온</div><div>${md.metal}</div>
              <div class="k">유기 리간드</div><div>${md.ligand}</div>
              <div class="k">기공 크기</div><div>${md.pore} Å</div>
              <div class="k">비표면적</div><div>${md.sa} m²/g</div>
              <div class="k">주요 응용</div><div>${md.apps.join(', ')}</div>
            `;
            hint.classList.add('show');
          }
        }
      }
      if (Array.isArray(d.apps)) {
        document.querySelectorAll('#appsPills input').forEach(cb => {
          cb.checked = d.apps.includes(cb.value);
          cb.parentElement.classList.toggle('on', cb.checked);
        });
      }
      countersUpdate();
    } catch (e) {}
  }
  restore();

  /* ---------- Server save ---------- */
  document.getElementById('serverSaveBtn').addEventListener('click', async () => {
    const btn  = document.getElementById('serverSaveBtn');
    const stat = document.getElementById('serverSaveStatus');
    const name = val('f_name').trim();
    if (!name) {
      stat.textContent = '⚠ 이름을 먼저 입력해주세요.';
      stat.style.color = 'var(--err)';
      goStep(1);
      setTimeout(() => document.getElementById('f_name').focus(), 200);
      return;
    }

    btn.disabled = true;
    stat.textContent = '저장 중...';
    stat.style.color = 'var(--txm)';

    try {
      const payload = {
        name,
        student_id: val('f_id'),
        date:       val('f_date'),
        mof:        selMOF ? MOF_DATA[selMOF].name : '',
        formula:    val('f_formula'),
        metal:      val('f_metal'),
        ligand:     val('f_ligand'),
        year:       val('f_year'),
        pore:       val('f_pore'),
        sa:         val('f_sa'),
        struct:     val('f_struct'),
        apps:       getCheckedApps(),
        app_text:   val('f_app'),
        pros:       val('f_pros'),
        cons:       val('f_cons'),
        refs:       val('f_ref'),
      };

      const r = await fetch(API_BASE + '/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error || 'HTTP ' + r.status);

      stat.innerHTML = `✓ 저장됨 (ID #${j.id})`;
      stat.style.color = 'var(--ok)';
      btn.textContent = '✓ 제출 완료';
    } catch (e) {
      stat.textContent = '저장 실패: ' + (e?.message || e);
      stat.style.color = 'var(--err)';
      btn.disabled = false;
    }
  });

  /* ---------- Reset ---------- */
  document.getElementById('resetBtn').addEventListener('click', () => {
    if (!confirm('보고서 내용을 모두 초기화하시겠습니까?')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    location.reload();
  });

  /* ---------- AI feedback ---------- */
  document.getElementById('runAI').addEventListener('click', runAI);

  async function runAI() {
    document.getElementById('aiIntro').style.display = 'none';
    document.getElementById('aiLoading').style.display = 'block';
    document.getElementById('aiResult').style.display = 'none';

    const reportText = buildReportText();
    let fb = null;
    let usedFallback = false;

    try {
      fb = await callClaude(reportText);
    } catch (err) {
      console.warn('AI call failed, using fallback:', err);
      fb = fallbackFeedback();
      usedFallback = true;
    }

    if (!fb) { fb = fallbackFeedback(); usedFallback = true; }
    renderFeedback(fb, usedFallback);
  }

  function buildReportText() {
    return `
MOF 이름: ${selMOF ? MOF_DATA[selMOF].name : '미선택'}
화학식: ${val('f_formula')}
금속 이온: ${val('f_metal')}
유기 리간드: ${val('f_ligand')}
합성 연도: ${val('f_year')}
기공 크기: ${val('f_pore')} Å
비표면적: ${val('f_sa')} m²/g
구조 특징 설명: ${val('f_struct')}
응용 분야: ${getCheckedApps().join(', ')}
응용 사례 설명: ${val('f_app')}
장점: ${val('f_pros')}
단점: ${val('f_cons')}
참고문헌: ${val('f_ref')}
    `.trim();
  }

  async function callClaude(reportText) {
    // Prefer the backend proxy if available (keeps API key off the client + avoids CORS)
    if (SERVER.available && SERVER.ai) {
      const r = await fetch(API_BASE + '/api/ai-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportText }),
      });
      if (!r.ok) throw new Error('proxy HTTP ' + r.status);
      return await r.json();
    }
    throw new Error('NO_BACKEND');
  }

  function fallbackFeedback() {
    // simple scoring based on filled fields & lengths
    const fields = ['f_formula','f_metal','f_ligand','f_year','f_pore','f_sa','f_struct','f_app','f_pros','f_cons','f_ref'];
    const filled = fields.filter(f => val(f).length > 0).length;
    const completeness = Math.round(40 + (filled / fields.length) * 55);

    const structLen = val('f_struct').length;
    const appLen    = val('f_app').length;
    const prosLen   = val('f_pros').length;
    const consLen   = val('f_cons').length;
    const totalLen = structLen + appLen + prosLen + consLen;
    const depth = Math.min(95, Math.round(30 + (totalLen / 410) * 60));

    // accuracy: if selMOF and at least f_formula/f_metal match the dataset → bonus
    let accuracy = 55;
    if (selMOF) {
      const d = MOF_DATA[selMOF];
      if (val('f_formula') === d.formula) accuracy += 10;
      if (val('f_metal').includes(d.metal.split(' ')[0])) accuracy += 8;
      if (val('f_ligand').includes(d.ligand.split(' ')[0])) accuracy += 8;
    }
    accuracy = Math.min(92, accuracy + (val('f_ref').length > 30 ? 8 : 0));

    const good = [], improve = [], suggest = [];

    if (selMOF) good.push(`${MOF_DATA[selMOF].name}을(를) 선택해 명확한 조사 대상을 정한 점이 좋습니다.`);
    else        improve.push('조사할 MOF를 명확히 선택하지 않았습니다. 한 가지 MOF에 집중해서 조사해주세요.');

    if (structLen >= 150) good.push('구조 특징 설명이 충분한 분량으로 작성되었습니다.');
    else if (structLen > 30) improve.push(`구조 특징 설명이 짧습니다(${structLen}자). 노드-리간드 연결 방식이나 기공의 형태도 추가해보세요.`);
    else improve.push('구조 특징 설명이 거의 비어있습니다. 직접 그림을 떠올리며 설명해보세요.');

    if (appLen >= 100) good.push('응용 사례 설명이 구체적입니다.');
    else improve.push('응용 사례 설명에 실제 연구나 활용 예시를 1~2개 더 추가해보세요.');

    if (prosLen < 50 || consLen < 50) improve.push('장단점은 각각 80자 이상으로 구체적인 이유와 함께 설명해보세요.');

    if (val('f_ref').split('\n').filter(s => s.trim()).length < 2)
      improve.push('참고문헌은 최소 2개 이상 기재하는 것이 좋습니다.');

    suggest.push('IUPAC, RCSR 토폴로지 코드를 찾아보면 구조를 더 정확히 표현할 수 있어요.');
    suggest.push('해당 MOF가 최근 발표된 논문(2020년 이후)에서 어떻게 활용되는지 검색해보세요.');
    if (selMOF === 'hkust1') suggest.push('HKUST-1의 paddle-wheel 클러스터 그림을 직접 그려보면 이해가 깊어집니다.');

    let improvedStruct = val('f_struct');
    if (selMOF) {
      const d = MOF_DATA[selMOF];
      improvedStruct = `${d.name}은(는) ${d.metal} 이온이 ${d.ligand}와 결합해 만드는 3차원 다공성 결정 구조입니다. 약 ${d.pore} Å 크기의 균일한 기공이 골격 전체에 규칙적으로 배치되어 있어, ${d.sa} m²/g에 달하는 매우 높은 비표면적을 가집니다. 이러한 구조적 특성 덕분에 ${d.apps.slice(0, 2).join('과 ')} 같은 응용 분야에서 차세대 소재로 주목받고 있습니다.`;
    } else {
      improvedStruct = '조사할 MOF를 먼저 선택한 뒤, 금속 노드 종류·리간드 형태·기공의 모양과 크기를 차례로 설명해보세요. 마지막으로 이러한 구조가 어떤 응용 분야에 유리한지 연결지어 마무리하면 자연스럽습니다.';
    }

    return {
      scores: { completeness, accuracy, depth },
      good, improve, suggest, improvedStruct,
    };
  }

  function renderFeedback(fb, usedFallback) {
    document.getElementById('aiLoading').style.display = 'none';
    const r = document.getElementById('aiResult');
    r.style.display = 'block';

    const s = fb.scores || {};
    const modelLabel = SERVER.model ? `${SERVER.model} 모델` : 'AI';
    const banner = usedFallback ? `
      <div style="background:rgba(245,158,11,0.10); border:1px solid rgba(245,158,11,0.40); border-radius:10px; padding:0.75rem 1rem; margin-bottom:1.25rem; font-size:0.85rem; color:var(--goldl);">
        ⓘ AI 서버에 연결할 수 없어 <strong>오프라인 기본 첨삭</strong>이 실행되었습니다. 실제 AI 첨삭은 백엔드 + <code>GEMINI_API_KEY</code> 설정 후 사용할 수 있어요.
      </div>` : `
      <div style="background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.40); border-radius:10px; padding:0.75rem 1rem; margin-bottom:1.25rem; font-size:0.85rem; color:var(--ok);">
        ✓ ${modelLabel} 첨삭 결과입니다.
      </div>`;
    r.innerHTML = banner + `
      <div class="ai-scores">
        <div class="ai-score"><div class="n" style="color:#60a5fa">${s.completeness ?? '-'}</div><div class="l">완성도</div></div>
        <div class="ai-score"><div class="n" style="color:#22c55e">${s.accuracy ?? '-'}</div><div class="l">정확도</div></div>
        <div class="ai-score"><div class="n" style="color:#fbbf24">${s.depth ?? '-'}</div><div class="l">서술 깊이</div></div>
      </div>

      <div class="fb-group fb-good">
        <h4>✅ 잘 작성된 부분</h4>
        <ul class="fb-list">${(fb.good || []).map(t => `<li>${escapeHtml(t)}</li>`).join('') || '<li>특별히 칭찬할 부분을 찾지 못했어요. 내용을 더 보강해보세요.</li>'}</ul>
      </div>

      <div class="fb-group fb-improve">
        <h4>⚠ 보완하면 좋은 부분</h4>
        <ul class="fb-list">${(fb.improve || []).map(t => `<li>${escapeHtml(t)}</li>`).join('') || '<li>큰 보완점은 없어요. 잘 작성했어요!</li>'}</ul>
      </div>

      <div class="fb-group fb-suggest">
        <h4>💡 추가 학습 제안</h4>
        <ul class="fb-list">${(fb.suggest || []).map(t => `<li>${escapeHtml(t)}</li>`).join('') || '<li>이 분야의 최신 논문도 함께 살펴보세요.</li>'}</ul>
      </div>

      ${fb.improvedStruct ? `
        <button class="btn btn-accent" id="showImprove" style="margin-top:0.5rem;">📝 개선 내용 제안받기</button>
        <div class="improved-block" id="improveBlock">
          <h5>개선된 구조 특징 설명 (예시)</h5>
          <p style="line-height:1.7;">${escapeHtml(fb.improvedStruct)}</p>
          <button class="btn btn-ghost" id="applyImprove" style="margin-top:0.75rem;">이 문장으로 교체하기</button>
        </div>
      ` : ''}
    `;

    const sb = document.getElementById('showImprove');
    if (sb) sb.addEventListener('click', () => {
      document.getElementById('improveBlock').classList.toggle('show');
    });
    const ai = document.getElementById('applyImprove');
    if (ai) ai.addEventListener('click', () => {
      const ta = document.getElementById('f_struct');
      ta.value = fb.improvedStruct;
      countersUpdate();
      persist();
      ai.textContent = '✓ 적용됨';
      ai.disabled = true;
    });
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  /* ---------- Preview ---------- */
  function renderPreview() {
    const apps = getCheckedApps();
    const refs = val('f_ref').split('\n').map(s => s.trim()).filter(Boolean);

    const name    = val('f_name') || '(이름 미입력)';
    const sid     = val('f_id')   || '(학번 미입력)';
    const date    = val('f_date') || '-';
    const mofName = selMOF ? MOF_DATA[selMOF].name : (val('f_formula') ? '직접 입력 MOF' : '(미선택)');

    const pv = document.getElementById('preview');
    pv.innerHTML = `
      <div class="pv-title">MOF 조사 보고서</div>
      <div class="pv-meta">
        <strong>${escapeHtml(name)}</strong> · 학번 ${escapeHtml(sid)} · ${escapeHtml(date)}
      </div>

      <div class="pv-section">
        <h2>1. 조사 대상 MOF</h2>
        <p><strong>${escapeHtml(mofName)}</strong></p>
        <div class="pv-tags">
          ${val('f_formula') ? `<span class="pv-tag">화학식: ${escapeHtml(val('f_formula'))}</span>` : ''}
          ${val('f_metal')   ? `<span class="pv-tag">금속: ${escapeHtml(val('f_metal'))}</span>` : ''}
          ${val('f_ligand')  ? `<span class="pv-tag">리간드: ${escapeHtml(val('f_ligand'))}</span>` : ''}
          ${val('f_year')    ? `<span class="pv-tag">합성 ${escapeHtml(val('f_year'))}년</span>` : ''}
        </div>
      </div>

      <div class="pv-section">
        <h2>2. 구조적 특징</h2>
        <div class="pv-tags">
          ${val('f_pore') ? `<span class="pv-tag">기공 ${escapeHtml(val('f_pore'))} Å</span>` : ''}
          ${val('f_sa')   ? `<span class="pv-tag">비표면적 ${escapeHtml(val('f_sa'))} m²/g</span>` : ''}
        </div>
        <p>${nl2br(escapeHtml(val('f_struct'))) || '<em style="color:#94a3b8;">(미작성)</em>'}</p>
      </div>

      <div class="pv-section">
        <h2>3. 응용 분야</h2>
        ${apps.length ? `<div class="pv-tags">${apps.map(a => `<span class="pv-tag">${escapeHtml(a)}</span>`).join('')}</div>` : ''}
        <p>${nl2br(escapeHtml(val('f_app'))) || '<em style="color:#94a3b8;">(미작성)</em>'}</p>
      </div>

      <div class="pv-section">
        <h2>4. 장단점 분석</h2>
        <p><strong>장점:</strong> ${nl2br(escapeHtml(val('f_pros'))) || '<em style="color:#94a3b8;">(미작성)</em>'}</p>
        <p><strong>단점·한계:</strong> ${nl2br(escapeHtml(val('f_cons'))) || '<em style="color:#94a3b8;">(미작성)</em>'}</p>
      </div>

      ${refs.length ? `
        <div class="pv-section">
          <h2>5. 참고 문헌</h2>
          ${refs.map((r, i) => `<p>[${i + 1}] ${escapeHtml(r)}</p>`).join('')}
        </div>
      ` : ''}

      <div class="pv-foot">
        MOF Explorer · 고등학생을 위한 나노 과학 교육 플랫폼
      </div>
    `;
  }

  function nl2br(s) {
    return String(s).replace(/\n/g, '<br>');
  }

  /* ---------- Init step ---------- */
  goStep(1);

})();
