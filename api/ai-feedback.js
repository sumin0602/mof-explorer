/* Vercel Serverless Function — POST /api/ai-feedback
   Proxies the Claude API. The ANTHROPIC_API_KEY is read from Vercel env
   vars (Project Settings → Environment Variables) and never sent to the
   browser. CORS is permissive so the static frontend on GitHub Pages
   (mof-explorer.com) can call this endpoint. */

const ALLOWED_ORIGINS = new Set([
  'https://mof-explorer.com',
  'https://www.mof-explorer.com',
  'https://sumin0602.github.io',
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:8080',
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

  const KEY   = process.env.ANTHROPIC_API_KEY;
  const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';

  if (!KEY) {
    return res.status(503).json({
      error: 'AI_NOT_CONFIGURED',
      message: 'ANTHROPIC_API_KEY가 Vercel 환경변수에 설정되지 않았습니다.',
    });
  }

  // Vercel auto-parses JSON when Content-Type is application/json.
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

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         KEY,
        'anthropic-version': '2023-06-01',
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

    try {
      const parsed = JSON.parse(raw);
      return res.status(200).json(parsed);
    } catch (_) {
      console.warn('Failed to parse model JSON:', raw.slice(0, 200));
      return res.status(502).json({ error: 'PARSE_FAILED', raw });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'SERVER_ERROR', message: String(e?.message || e) });
  }
}
