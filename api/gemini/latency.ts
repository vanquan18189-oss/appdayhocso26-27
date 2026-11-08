export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const { customKey } = req.body || {};
  const startTime = Date.now();
  const apiKey = customKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(400).json({
      latencyMs: Date.now() - startTime,
      status: 'error',
      modelName: 'gemini-3.8-flash',
      message: 'Chưa cấu hình API Key. Vui lòng nhập Personal API Key hoặc lưu Global API Key.',
    });
  }

  try {
    const directRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Xin chào, trả lời "OK" để kiểm tra độ trễ.' }] }],
        }),
      }
    );

    const data = await directRes.json();
    if (directRes.ok && data?.candidates?.length > 0) {
      return res.status(200).json({
        latencyMs: Date.now() - startTime,
        status: 'online',
        modelName: 'gemini-3.8-flash',
        message: 'Kết nối máy chủ Gemini thành công!',
      });
    }

    const errMsg = data?.error?.message || `Lỗi Gemini API (${directRes.status})`;
    return res.status(500).json({
      latencyMs: Date.now() - startTime,
      status: 'error',
      modelName: 'gemini-3.8-flash',
      message: errMsg,
    });
  } catch (err: any) {
    return res.status(500).json({
      latencyMs: Date.now() - startTime,
      status: 'error',
      modelName: 'gemini-3.8-flash',
      message: err?.message || 'Lỗi kết nối máy chủ Gemini',
    });
  }
}
