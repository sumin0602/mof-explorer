/* ============================================
   MOF Explorer — Node/Express server
   - Serves the static site
   - Proxies Claude API (keeps API key off the client)
   - Stores reports in SQLite
   ============================================ */

import express from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const PORT  = Number(process.env.PORT) || 8080;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const KEY   = process.env.GEMINI_API_KEY || '';

const app = express();
app.use(express.json({ limit: '1mb' }));

// CORS (useful if you serve the static site separately during dev)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

/* ---------- SQLite ---------- */
const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT,
    student_id  TEXT,
    date        TEXT,
    mof         TEXT,
    formula     TEXT,
    metal       TEXT,
    ligand      TEXT,
    year        TEXT,
    pore        TEXT,
    sa          TEXT,
    struct      TEXT,
    apps        TEXT,
    app_text    TEXT,
    pros        TEXT,
    cons        TEXT,
    refs        TEXT,
    created_at  INTEGER NOT NULL
  );
`);

const insertReport = db.prepare(`
  INSERT INTO reports
    (name, student_id, date, mof, formula, metal, ligand, year, pore, sa,
     struct, apps, app_text, pros, cons, refs, created_at)
  VALUES
    (@name, @student_id, @date, @mof, @formula, @metal, @ligand, @year, @pore, @sa,
     @struct, @apps, @app_text, @pros, @cons, @refs, @created_at)
`);

const listReports = db.prepare(`
  SELECT id, name, student_id, mof, created_at
  FROM reports
  ORDER BY created_at DESC
  LIMIT 100
`);

const getReport    = db.prepare(`SELECT * FROM reports WHERE id = ?`);
const deleteReport = db.prepare(`DELETE FROM reports WHERE id = ?`);

/* ---------- Health ---------- */
app.get('/api/health', (req, res) => {
  res.json({
    ok:       true,
    ai:       Boolean(KEY),
    provider: 'google-gemini',
    model:    MODEL,
    db:       true,         // boolean — frontend keys on this
    dbKind:   'sqlite',
    runtime:  'express',
    time:     Date.now(),
  });
});

/* ---------- AI proxy (Google Gemini) ---------- */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    scores: {
      type: 'object',
      properties: {
        completeness: { type: 'integer' },
        accuracy:     { type: 'integer' },
        depth:        { type: 'integer' },
      },
      required: ['completeness', 'accuracy', 'depth'],
    },
    good:           { type: 'array', items: { type: 'string' } },
    improve:        { type: 'array', items: { type: 'string' } },
    suggest:        { type: 'array', items: { type: 'string' } },
    improvedStruct: { type: 'string' },
  },
  required: ['scores', 'good', 'improve', 'suggest', 'improvedStruct'],
};

app.post('/api/ai-feedback', async (req, res) => {
  try {
    if (!KEY) {
      return res.status(503).json({
        error: 'AI_NOT_CONFIGURED',
        message: 'GEMINI_API_KEY가 서버 .env 파일에 설정되지 않았습니다.',
      });
    }

    const { reportText } = req.body || {};
    if (!reportText || typeof reportText !== 'string') {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'reportText가 필요합니다.' });
    }
    if (reportText.length > 8000) {
      return res.status(413).json({ error: 'TOO_LARGE' });
    }

    const prompt = `당신은 고등학교 화학 선생님입니다. 학생이 작성한 MOF(금속-유기 골격체) 조사 보고서를 첨삭해주세요.

학생 보고서:
${reportText}

평가 기준:
- completeness (내용 완성도, 0~100): 필수 항목이 모두 채워졌고 분량이 충분한가
- accuracy (과학적 정확도, 0~100): 화학식·금속·리간드·기공 크기 등 사실관계가 맞는가
- depth (서술 깊이, 0~100): 자신의 언어로 구조·응용을 잘 설명하는가

각 배열(good/improve/suggest)에는 2~3개의 한국어 문장을 담으세요.
improvedStruct는 "구조 특징 설명" 항목을 더 풍부하게 개선한 2~3문장입니다.

내용이 부족하거나 비어있으면 솔직하게 점수를 낮게 주고 구체적인 개선 방향을 제시하세요. 고등학생 수준에 맞는 친절한 톤으로 한국어 피드백을 작성해주세요.`;

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type':   'application/json',
          'x-goog-api-key': KEY,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature:      0.6,
            maxOutputTokens:  1800,
            responseMimeType: 'application/json',
            responseSchema:   RESPONSE_SCHEMA,
          },
        }),
      },
    );

    const data = await r.json();
    if (!r.ok) {
      console.error('Gemini API error:', data);
      return res.status(r.status).json({ error: 'UPSTREAM', detail: data });
    }

    const cand = (data.candidates || [])[0];
    if (!cand || cand.finishReason === 'SAFETY' || cand.finishReason === 'RECITATION') {
      return res.status(502).json({
        error: 'BLOCKED',
        message: '응답이 안전 필터에 의해 차단되었습니다.',
      });
    }
    const text = (cand.content?.parts || []).map(p => p.text || '').join('').trim();
    if (!text) return res.status(502).json({ error: 'EMPTY_RESPONSE' });

    let parsed;
    try { parsed = JSON.parse(text); }
    catch (_) {
      const cleaned = text.replace(/```json|```/g, '').trim();
      try { parsed = JSON.parse(cleaned); }
      catch (e2) {
        console.warn('Failed to parse model JSON:', text.slice(0, 200));
        return res.status(502).json({ error: 'PARSE_FAILED', raw: text });
      }
    }
    res.json(parsed);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'SERVER_ERROR', message: String(e?.message || e) });
  }
});

/* ---------- AI report chat (MOF Q&A, Google 검색 연동) ---------- */
app.post('/api/report-chat', async (req, res) => {
  try {
    if (!KEY) {
      return res.status(503).json({
        error: 'AI_NOT_CONFIGURED',
        message: 'GEMINI_API_KEY가 서버 .env 파일에 설정되지 않았습니다.',
      });
    }

    const { question, context, history } = req.body || {};
    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'question이 필요합니다.' });
    }
    if (question.length > 500) {
      return res.status(413).json({ error: 'TOO_LARGE' });
    }

    const ctx = context && typeof context === 'object' ? context : {};
    const ctxLines = [
      ctx.mof     ? `MOF 이름: ${ctx.mof}`      : '',
      ctx.formula ? `화학식: ${ctx.formula}`     : '',
      ctx.metal   ? `금속 노드: ${ctx.metal}`    : '',
      ctx.ligand  ? `유기 리간드: ${ctx.ligand}` : '',
    ].filter(Boolean).join('\n');

    const systemPrompt = `당신은 고등학생의 MOF(금속-유기 골격체) 조사 보고서 작성을 돕는 화학 튜터입니다.

규칙:
- MOF, 화학, 재료과학과 직접 관련된 질문에만 답하세요.
- 관련 없는 질문(다른 과목 숙제, 잡담 등)에는 "이 챗봇은 MOF 조사 보고서 관련 질문만 도와줄 수 있어요"라고 정중히 안내하고 답하지 마세요.
- 보고서 문장을 대신 써주지 마세요. 개념을 설명하고 방향을 제시하는 역할만 하세요.
- 고등학생이 이해할 수 있는 쉬운 한국어로, 3~5문장 이내로 간결하게 답하세요.
- 실제 존재하지 않는 논문·자료를 지어내지 마세요. 확실하지 않으면 모른다고 답하세요.
${ctxLines ? `\n현재 학생이 조사 중인 MOF 정보:\n${ctxLines}` : ''}`;

    const histArr = Array.isArray(history) ? history.slice(-8) : [];
    const contents = [
      { role: 'user',  parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: '알겠습니다. MOF 관련 질문에만 쉽고 간결하게 답할게요.' }] },
      ...histArr.map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(h.text || '').slice(0, 1000) }],
      })),
      { role: 'user', parts: [{ text: question.trim().slice(0, 500) }] },
    ];

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type':   'application/json',
          'x-goog-api-key': KEY,
        },
        body: JSON.stringify({
          contents,
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature:     0.4,
            maxOutputTokens: 700,
          },
        }),
      },
    );

    const data = await r.json();
    if (!r.ok) {
      console.error('Gemini API error:', data);
      return res.status(r.status).json({ error: 'UPSTREAM', detail: data });
    }

    const cand = (data.candidates || [])[0];
    if (!cand || cand.finishReason === 'SAFETY' || cand.finishReason === 'RECITATION') {
      return res.status(502).json({
        error: 'BLOCKED',
        message: '응답이 안전 필터에 의해 차단되었습니다.',
      });
    }
    const text = (cand.content?.parts || []).map(p => p.text || '').join('').trim();
    if (!text) return res.status(502).json({ error: 'EMPTY_RESPONSE' });

    // 검색 연동으로 인용된 출처 (있으면) 프런트에서 칩으로 보여줄 수 있도록 정리
    const chunks = cand.groundingMetadata?.groundingChunks || [];
    const sources = chunks
      .map(c => (c.web ? { title: c.web.title || c.web.uri, uri: c.web.uri } : null))
      .filter(Boolean)
      .filter((s, i, arr) => arr.findIndex(x => x.uri === s.uri) === i)
      .slice(0, 5);

    res.json({ answer: text, sources });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'SERVER_ERROR', message: String(e?.message || e) });
  }
});

/* ---------- Reports ---------- */
app.post('/api/reports', (req, res) => {
  try {
    const b = req.body || {};
    const payload = {
      name:       String(b.name       || '').slice(0, 60),
      student_id: String(b.student_id || '').slice(0, 30),
      date:       String(b.date       || '').slice(0, 20),
      mof:        String(b.mof        || '').slice(0, 60),
      formula:    String(b.formula    || '').slice(0, 120),
      metal:      String(b.metal      || '').slice(0, 120),
      ligand:     String(b.ligand     || '').slice(0, 200),
      year:       String(b.year       || '').slice(0, 10),
      pore:       String(b.pore       || '').slice(0, 40),
      sa:         String(b.sa         || '').slice(0, 40),
      struct:     String(b.struct     || '').slice(0, 4000),
      apps:       JSON.stringify(Array.isArray(b.apps) ? b.apps.slice(0, 20) : []),
      app_text:   String(b.app_text   || b.app || '').slice(0, 4000),
      pros:       String(b.pros       || '').slice(0, 2000),
      cons:       String(b.cons       || '').slice(0, 2000),
      refs:       String(b.refs       || '').slice(0, 4000),
      created_at: Date.now(),
    };

    if (!payload.name) {
      return res.status(400).json({ error: 'NAME_REQUIRED', message: '이름을 입력해주세요.' });
    }

    const info = insertReport.run(payload);
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'SERVER_ERROR', message: String(e?.message || e) });
  }
});

app.get('/api/reports', (req, res) => {
  try {
    const rows = listReports.all();
    res.json({ reports: rows });
  } catch (e) {
    res.status(500).json({ error: 'SERVER_ERROR', message: String(e?.message || e) });
  }
});

app.get('/api/reports/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_ID' });
  const row = getReport.get(id);
  if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
  try { row.apps = JSON.parse(row.apps || '[]'); } catch (_) { row.apps = []; }
  res.json(row);
});

app.delete('/api/reports/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_ID' });
  deleteReport.run(id);
  res.json({ ok: true });
});

/* ---------- Static site ---------- */
app.use(express.static(__dirname, {
  index: ['index.html'],
  extensions: ['html'],
}));

app.listen(PORT, () => {
  console.log('');
  console.log('  ⬡  MOF Explorer');
  console.log('  ─────────────────────────────────────');
  console.log(`  Local:    http://localhost:${PORT}`);
  console.log(`  AI:       ${KEY ? `enabled (Gemini · ${MODEL})` : 'disabled — set GEMINI_API_KEY in .env'}`);
  console.log(`  DB:       ./data.db (SQLite)`);
  console.log('');
});
