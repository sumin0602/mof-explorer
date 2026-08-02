/* Vercel Serverless Function — POST /api/report-chat
   MOF 질문 챗봇 프록시. Gemini API + Google 검색 연동(grounding)을 사용해
   학생의 MOF 관련 질문에 답하고, 가능하면 출처 링크를 함께 반환한다.
   GEMINI_API_KEY는 Vercel 환경변수에서 읽고 브라우저로 노출되지 않는다. */

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
  const question = body.question;
  const context  = body.context && typeof body.context === 'object' ? body.context : {};
  const history  = Array.isArray(body.history) ? body.history.slice(-8) : [];

  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'question이 필요합니다.' });
  }
  if (question.length > 500) {
    return res.status(413).json({ error: 'TOO_LARGE' });
  }

  const ctxLines = [
    context.mof     ? `MOF 이름: ${context.mof}`      : '',
    context.formula ? `화학식: ${context.formula}`     : '',
    context.metal   ? `금속 노드: ${context.metal}`    : '',
    context.ligand  ? `유기 리간드: ${context.ligand}` : '',
  ].filter(Boolean).join('\n');

  const systemPrompt = `당신은 고등학생의 MOF(금속-유기 골격체) 조사 보고서 작성을 돕는 화학 튜터입니다.

규칙:
- MOF, 화학, 재료과학과 직접 관련된 질문에만 답하세요.
- 관련 없는 질문(다른 과목 숙제, 잡담 등)에는 "이 챗봇은 MOF 조사 보고서 관련 질문만 도와줄 수 있어요"라고 정중히 안내하고 답하지 마세요.
- 보고서 문장을 대신 써주지 마세요. 개념을 설명하고 방향을 제시하는 역할만 하세요.
- 고등학생이 이해할 수 있는 쉬운 한국어로, 3~5문장 이내로 간결하게 답하세요.
- 실제 존재하지 않는 논문·자료를 지어내지 마세요. 확실하지 않으면 모른다고 답하세요.
${ctxLines ? `\n현재 학생이 조사 중인 MOF 정보:\n${ctxLines}` : ''}`;

  const contents = [
    { role: 'user',  parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: '알겠습니다. MOF 관련 질문에만 쉽고 간결하게 답할게요.' }] },
    ...history.map(h => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(h.text || '').slice(0, 1000) }],
    })),
    { role: 'user', parts: [{ text: question.trim().slice(0, 500) }] },
  ];

  try {
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

    const cand = (data.candidates || [])[0];
    if (!cand || cand.finishReason === 'SAFETY' || cand.finishReason === 'RECITATION') {
      return res.status(502).json({
        error: 'BLOCKED',
        message: '응답이 안전 필터에 의해 차단되었습니다.',
      });
    }

    const text = (cand.content?.parts || []).map(p => p.text || '').join('').trim();
    if (!text) return res.status(502).json({ error: 'EMPTY_RESPONSE' });

    const chunks = cand.groundingMetadata?.groundingChunks || [];
    const sources = chunks
      .map(c => (c.web ? { title: c.web.title || c.web.uri, uri: c.web.uri } : null))
      .filter(Boolean)
      .filter((s, i, arr) => arr.findIndex(x => x.uri === s.uri) === i)
      .slice(0, 5);

    return res.status(200).json({ answer: text, sources });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'SERVER_ERROR', message: String(e?.message || e) });
  }
}
