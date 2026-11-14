import { GoogleGenAI } from '@google/genai';
import mammoth from 'mammoth';

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

async function buildContents(prompt: string, fileData: any): Promise<any> {
  const safePrompt = prompt || '';
  if (fileData && (fileData.base64 || fileData.text)) {
    const fileName = (fileData.name || '').toLowerCase();
    const mimeType = (fileData.mimeType || '').toLowerCase();
    const rawBase64 = fileData.base64 ? String(fileData.base64).replace(/^data:[^;]+;base64,/, '') : '';

    if (rawBase64 && (mimeType.includes('pdf') || fileName.endsWith('.pdf'))) {
      return {
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: rawBase64 } },
          { text: safePrompt },
        ],
      };
    }

    if (rawBase64 && (mimeType.includes('word') || mimeType.includes('docx') || fileName.endsWith('.docx'))) {
      try {
        const buffer = Buffer.from(rawBase64, 'base64');
        const extracted = await mammoth.extractRawText({ buffer });
        return `[NỘI DUNG TÀI LIỆU WORD GỐC ĐÍNH KÈM]:\n"""\n${extracted.value || ''}\n"""\n\n${safePrompt}`;
      } catch {
        return safePrompt;
      }
    }

    if (rawBase64 && fileData.mimeType) {
      return {
        parts: [
          { inlineData: { mimeType: fileData.mimeType, data: rawBase64 } },
          { text: safePrompt },
        ],
      };
    }

    if (fileData.text) {
      return `[NỘI DUNG TÀI LIỆU VĂN BẢN ĐÍNH KÈM]:\n"""\n${fileData.text}\n"""\n\n${safePrompt}`;
    }
  }
  return safePrompt;
}

export default async function handler(req: any, res: any) {
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

  const { prompt, systemInstruction, responseJson, fileData, model, temperature } = req.body || {};
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  try {
    const contents = await buildContents(prompt, fileData);
    const targetModel = sanitizeModelName(model);
    const candidateModels = [targetModel, ...RECOMMENDED_MODELS.filter((m) => m !== targetModel)];

    let responseStream: AsyncIterable<any> | null = null;
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        const config: Record<string, any> = {};
        if (systemInstruction) config.systemInstruction = systemInstruction;
        if (responseJson) config.responseMimeType = 'application/json';
        if (typeof temperature === 'number' && !modelName.startsWith('gemini-4-')) {
          config.temperature = temperature;
        }

        responseStream = await ai.models.generateContentStream({
          model: modelName,
          contents,
          config: Object.keys(config).length > 0 ? config : undefined,
        });
        break;
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!responseStream) {
      throw lastError || new Error('Không thể khởi tạo luồng phản hồi AI.');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    for await (const chunk of responseStream) {
      if (chunk && chunk.text) {
        res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: any) {
    const msg = String(err?.message || 'Lỗi streaming AI').replace(/AIza[a-zA-Z0-9_-]{20,60}/g, '[REDACTED_KEY]');
    if (!res.headersSent) {
      res.status(500).json({ error: msg });
    } else {
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      res.end();
    }
  }
}
