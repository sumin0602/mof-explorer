/* Vercel Serverless Function — POST /api/ai-feedback
   Proxies the Google Gemini API. The GEMINI_API_KEY is read from Vercel
   env vars (Project Settings → Environment Variables) and never sent to
   the browser. CORS is allowlisted so the static frontend on GitHub
   Pages (mof-explorer.com) can call this endpoint. */

const ALLOWED_ORIGINS = new Set([
  'https://mof-explorer.com',
  'https://www.mof-explorer.com',
  'https://sumin0602.github.io',
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:8080',
  // Capacitor WebView schemes — the packaged Android/iOS app uses one
  // of these as its runtime origin.
  'https://localhost',        // Android default (androidScheme=https)
  'capacitor://localhost',    // iOS default (iosScheme=capacitor)
]);

function setCors(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Vary', 'Origin');
  res.setHeader(
    'Access-Control-Allow-Origin',
    ALLOWED_ORIGINS.has(origin) ? origin : '*',
  );
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/* Structured JSON output schema (Gemini's responseSchema feature).
   Forces the model to return JSON with exactly these fields, so we
   don't have to parse markdown / strip code fences / repair output. */
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

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const KEY   = process.env.GEMINI_API_KEY;
  const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  if (!KEY) {
    return res.status(503).json({
      error: 'AI_NOT_CONFIGURED',
      message: 'GEMINI_API_KEY가 Vercel 환경변수에 설정되지 않았습니다.',
    });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const reportText = body.reportText;
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

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type':    'application/json',
          'x-goog-api-key':  KEY,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature:       0.6,
            maxOutputTokens:   1800,
            responseMimeType:  'application/json',
            responseSchema:    RESPONSE_SCHEMA,
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT',       threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
          ],
        }),
      },
    );

    const data = await r.json();
    if (!r.ok) {
      console.error('Gemini API error:', data);
      return res.status(r.status).json({ error: 'UPSTREAM', detail: data });
    }

    // Safety / finishReason guard
    const cand = (data.candidates || [])[0];
    if (!cand || cand.finishReason === 'SAFETY' || cand.finishReason === 'RECITATION') {
      return res.status(502).json({
        error: 'BLOCKED',
        message: '응답이 안전 필터에 의해 차단되었습니다. 보고서를 다시 작성해보세요.',
      });
    }

    const text = (cand.content?.parts || []).map(p => p.text || '').join('').trim();
    if (!text) {
      return res.status(502).json({ error: 'EMPTY_RESPONSE' });
    }

    try {
      const parsed = JSON.parse(text);
      return res.status(200).json(parsed);
    } catch (_) {
      // Gemini sometimes wraps in code fences despite responseMimeType.
      // Try a permissive cleanup pass.
      const cleaned = text.replace(/```json|```/g, '').trim();
      try {
        return res.status(200).json(JSON.parse(cleaned));
      } catch (e2) {
        console.warn('Failed to parse model JSON:', text.slice(0, 200));
        return res.status(502).json({ error: 'PARSE_FAILED', raw: text });
      }
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'SERVER_ERROR', message: String(e?.message || e) });
  }
}
