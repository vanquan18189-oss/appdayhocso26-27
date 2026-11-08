export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const { prompt, systemInstruction, responseJson, fileData, customKey, model } = req.body || {};
  const apiKey = customKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(400).json({ error: 'Chưa cấu hình Gemini API Key trên hệ thống.' });
  }

  const selectedModel = model || 'gemini-3.8-flash';
  const parts: any[] = [{ text: prompt || '' }];
  if (fileData?.base64 && fileData?.mimeType) {
    parts.unshift({
      inlineData: {
        mimeType: fileData.mimeType,
        data: fileData.base64.replace(/^data:[^;]+;base64,/, '')
      }
    });
  }

  const payload: any = {
    contents: [{ parts }],
  };
  if (systemInstruction) {
    payload.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  if (responseJson) {
    payload.generationConfig = { responseMimeType: 'application/json' };
  }

  try {
    const directRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    const resData = await directRes.json();
    if (!directRes.ok) {
      return res.status(directRes.status).json({
        error: resData?.error?.message || `Lỗi Gemini API (${directRes.status})`
      });
    }

    const outText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof outText !== 'string') {
      return res.status(500).json({ error: 'Máy chủ phản hồi dữ liệu rỗng.' });
    }

    return res.status(200).json({ text: outText });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Lỗi xử lý Gemini AI' });
  }
}
