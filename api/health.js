/* Vercel Serverless Function — GET /api/health
   Public endpoint, returns whether the Gemini proxy is configured. */

export default function handler(req, res) {
  // Permissive CORS — the static frontend (GitHub Pages, file://, local) hits this.
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  res.status(200).json({
    ok:       true,
    ai:       Boolean(process.env.GEMINI_API_KEY),
    provider: 'google-gemini',
    model:    process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    db:       false,                // Vercel serverless has no persistent SQLite
    runtime:  'vercel',
    time:     Date.now(),
  });
}
