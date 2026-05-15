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
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';
const KEY   = process.env.ANTHROPIC_API_KEY || '';

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
    ok: true,
    ai: Boolean(KEY),
    model: MODEL,
    db: true,            // boolean — frontend keys on this
    dbKind: 'sqlite',    // informational
    runtime: 'express',
    time: Date.now(),
  });
});

/* ---------- AI proxy ---------- */
app.post('/api/ai-feedback', async (req, res) => {
  try {
    if (!KEY) {
      return res.status(503).json({
        error: 'AI_NOT_CONFIGURED',
        message: 'ANTHROPIC_API_KEY가 서버 .env 파일에 설정되지 않았습니다.',
      });
    }

    const { reportText } = req.body || {};
    if (!reportText || typeof reportText !== 'string') {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'reportText가 필요합니다.' });
    }

    const prompt = `당신은 고등학교 화학 선생님입니다. 학생이 작성한 MOF(금속-유기 골격체) 조사 보고서를 첨삭해주세요.

학생 보고서:
${reportText}

다음 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만:
{
  "scores": {
    "completeness": 0~100 사이 정수 (내용 완성도),
    "accuracy": 0~100 사이 정수 (과학적 정확도),
    "depth": 0~100 사이 정수 (서술 깊이)
  },
  "good": ["잘 작성된 부분 1", "잘 작성된 부분 2"],
  "improve": ["보완 필요한 부분 1", "보완 필요한 부분 2"],
  "suggest": ["추가 학습 제안 1", "추가 학습 제안 2"],
  "improvedStruct": "구조 특징 설명을 더 풍부하게 개선한 버전 (2~3문장)"
}

내용이 부족하거나 비어있으면 솔직하게 점수를 낮게 주고 구체적인 개선 방향을 제시해주세요. 고등학생 수준에 맞는 피드백을 한국어로 작성해주세요.`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':     'application/json',
        'x-api-key':        KEY,
        'anthropic-version':'2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      console.error('Claude API error:', data);
      return res.status(r.status).json({ error: 'UPSTREAM', detail: data });
    }

    const raw = (data.content || [])
      .map(c => c.text || '')
      .join('')
      .replace(/```json|```/g, '')
      .trim();

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) {
      console.warn('Failed to parse model JSON, returning raw:', raw.slice(0, 200));
      return res.status(502).json({ error: 'PARSE_FAILED', raw });
    }

    res.json(parsed);
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
  console.log(`  AI:       ${KEY ? `enabled (model: ${MODEL})` : 'disabled — set ANTHROPIC_API_KEY in .env'}`);
  console.log(`  DB:       ./data.db (SQLite)`);
  console.log('');
});
