import { GoogleGenAI } from '@google/genai';

const RECOMMENDED_MODELS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];
const DEFAULT_MODEL = 'gemini-4-hydrogen';

function sanitizeModelName(model?: string): string {
  if (!model || typeof model !== 'string') return DEFAULT_MODEL;
  const trimmed = model.trim();
  const m = trimmed.toLowerCase();
  if (
    !m ||
    m.includes('1.5') ||
    m.includes('2.0') ||
    m.includes('pro-latest') ||
    m.includes('flash-latest') ||
    m === 'gemini-pro' ||
    m === 'gemini-3.8-flash' ||
    m.includes('image') ||
    m.includes('tts') ||
    m.includes('audio') ||
    m.includes('live') ||
    m.includes('embed') ||
    m.includes('veo')
  ) {
    return DEFAULT_MODEL;
  }
  return trimmed;
}

function sanitizeError(msg: string): string {
  return String(msg || '')
    .replace(/AIza[a-zA-Z0-9_-]{20,60}/g, '[REDACTED_KEY]')
    .replace(/(key=)[a-zA-Z0-9_-]{10,60}/gi, '$1[REDACTED_KEY]');
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const startTime = Date.now();
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const requestedModel = sanitizeModelName(req.body?.model);

  if (!apiKey) {
    return res.status(500).json({
      latencyMs: Date.now() - startTime,
      status: 'error',
      modelName: requestedModel,
      message: 'Máy chủ chưa được cấu hình GEMINI_API_KEY trong biến môi trường.',
    });
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const candidateModels = [requestedModel, ...RECOMMENDED_MODELS.filter((m) => m !== requestedModel)];
  let lastError: any = null;

  for (const modelName of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: 'Xin chào, trả lời "OK" để kiểm tra độ trễ.',
      });

      return res.status(200).json({
        latencyMs: Date.now() - startTime,
        status: 'online',
        modelName,
        message: response?.text ? 'Kết nối máy chủ Gemini thành công!' : 'Không có phản hồi.',
      });
    } catch (err: any) {
      lastError = err;
    }
  }

  const rawMsg = sanitizeError(lastError?.message || 'Lỗi kết nối máy chủ Gemini');
  let userMsg = rawMsg;
  if (rawMsg.includes('429') || rawMsg.includes('Quota') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
    userMsg = 'Hạn mức API Gemini đã hết (Quota Exceeded). Vui lòng thử lại sau.';
  } else if (rawMsg.includes('API_KEY_INVALID') || rawMsg.includes('API key not valid') || rawMsg.includes('403')) {
    userMsg = 'Khóa Gemini API trên máy chủ không hợp lệ hoặc chưa được cấp quyền.';
  }

  return res.status(500).json({
    latencyMs: Date.now() - startTime,
    status: 'error',
    modelName: requestedModel,
    message: userMsg,
    rawErrorDetails: rawMsg,
  });
}
