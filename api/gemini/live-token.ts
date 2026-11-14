const LIVE_MODEL = 'gemini-3.8-live';
const ALLOWED_LIVE_MODELS = new Set(['gemini-3.8-live', 'gemini-3.8-live-extended-thinking']);

export default function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({ error: 'Máy chủ chưa được cấu hình GEMINI_API_KEY trong biến môi trường.' });
  }

  const requestedModel =
    typeof req.body?.model === 'string' && ALLOWED_LIVE_MODELS.has(req.body.model.trim())
      ? req.body.model.trim()
      : LIVE_MODEL;

  return res.status(200).json({
    model: requestedModel,
    wsPath: '/api/gemini/live',
    status: 'ready',
    message: 'Live API server bridge initialized',
  });
}
