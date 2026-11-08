export default function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  return res.status(200).json({
    models: ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite']
  });
}
