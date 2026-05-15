/* Vercel Serverless Function — GET /api/health
   Public endpoint, returns whether the Claude proxy is configured. */

export default function handler(req, res) {
  // Permissive CORS — the static frontend (GitHub Pages, file://, local) hits this.
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  res.status(200).json({
    ok: true,
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5',
    db: false,                // Vercel serverless has no persistent SQLite
    runtime: 'vercel',
    time: Date.now(),
  });
}
