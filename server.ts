import 'dotenv/config';
import http from 'http';
import express from 'express';
import path from 'path';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import mammoth from 'mammoth';

const firebaseConfig = {
  apiKey: "AIzaSyAazNo3xjmQAHXbjq8aC9Blqy_PSpAHTtI",
  authDomain: "appdayhoc-dcb36.firebaseapp.com",
  projectId: "appdayhoc-dcb36",
  storageBucket: "appdayhoc-dcb36.firebasestorage.app",
  messagingSenderId: "498653089335",
  appId: "1:498653089335:web:3d9453134dc6ca238379b2",
  measurementId: "G-JNQPGWC6F4"
};

const appFb = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(appFb);

// Modern supported models (excluding deprecated models)
const RECOMMENDED_MODELS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];
const DEFAULT_MODEL = 'gemini-4-hydrogen';
const LIVE_MODEL = 'gemini-3.8-live';
const ALLOWED_LIVE_MODELS = new Set(['gemini-3.8-live', 'gemini-3.8-live-extended-thinking']);
const ALLOWED_LIVE_VOICES = new Set(['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr']);

function sanitizeModelName(model?: string): string {
  if (!model || typeof model !== 'string') return DEFAULT_MODEL;
  const trimmed = model.trim();
  const m = trimmed.toLowerCase();
  // Map deprecated or non-text models to standard modern default model
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

function sanitizeErrorText(msg: string): string {
  if (!msg) return '';
  return String(msg)
    .replace(/AIza[a-zA-Z0-9_-]{20,60}/g, '[REDACTED_KEY]')
    .replace(/(key=)[a-zA-Z0-9_-]{10,60}/gi, '$1[REDACTED_KEY]');
}

function formatGeminiError(error: any): {
  httpStatus: number;
  userMessage: string;
  rawDetails: string;
} {
  const rawMsg = sanitizeErrorText(error?.message || String(error || ''));
  let httpStatus = Number(error?.status || error?.code || 500);
  if (!Number.isFinite(httpStatus) || httpStatus < 400 || httpStatus > 599) {
    httpStatus = 500;
  }

  let userMessage = 'Hệ thống AI đang quá tải tạm thời. Thầy/Cô vui lòng bấm "Thử lại ngay" hoặc thử lại sau ít phút nhé!';

  if (rawMsg.includes('Chưa cấu hình GEMINI_API_KEY')) {
    httpStatus = 500;
    userMessage = 'Máy chủ chưa được cấu hình GEMINI_API_KEY trong biến môi trường.';
  } else if (rawMsg.includes('429') || rawMsg.includes('Quota') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
    httpStatus = 429;
    userMessage = 'Hạn mức API Gemini đã hết (Quota Exceeded). Vui lòng thử lại sau.';
  } else if (rawMsg.includes('503') || rawMsg.includes('UNAVAILABLE') || rawMsg.includes('high demand') || rawMsg.includes('overloaded')) {
    httpStatus = 503;
    userMessage = 'Hệ thống AI đang quá tải tạm thời. Thầy/Cô vui lòng bấm "Thử lại ngay" hoặc thử lại sau ít phút nhé!';
  } else if (rawMsg.includes('API key not valid') || rawMsg.includes('API_KEY_INVALID') || rawMsg.includes('PERMISSION_DENIED') || rawMsg.includes('403')) {
    httpStatus = 403;
    userMessage = 'Khóa Gemini API trên máy chủ không hợp lệ hoặc chưa được cấp quyền. Vui lòng kiểm tra Settings > Secrets.';
  } else if (rawMsg.includes('NOT_FOUND') || rawMsg.includes('404')) {
    httpStatus = 404;
    userMessage = 'Mô hình Gemini được yêu cầu không khả dụng. Đang chuyển về mô hình chuẩn.';
  } else if (rawMsg) {
    try {
      const parsed = JSON.parse(rawMsg);
      if (parsed?.error?.code === 503 || parsed?.error?.status === 'UNAVAILABLE') {
        httpStatus = 503;
        userMessage = 'Hệ thống AI đang quá tải tạm thời. Thầy/Cô vui lòng bấm "Thử lại ngay" hoặc thử lại sau ít phút nhé!';
      } else if (parsed?.error?.message) {
        userMessage = sanitizeErrorText(parsed.error.message);
      }
    } catch {
      if (rawMsg.length < 240) {
        userMessage = rawMsg;
      }
    }
  }

  return {
    httpStatus,
    userMessage,
    rawDetails: rawMsg,
  };
}

function buildGenerateConfig(
  modelName: string,
  options: {
    systemInstruction?: string;
    responseJson?: boolean;
    temperature?: number;
  }
): Record<string, any> {
  const config: Record<string, any> = {};
  if (options.systemInstruction) {
    config.systemInstruction = options.systemInstruction;
  }
  if (options.responseJson) {
    config.responseMimeType = 'application/json';
  }
  // Do not pass deprecated sampling parameters (temperature, topP, topK, candidateCount) to gemini-4-* models
  if (typeof options.temperature === 'number' && !modelName.startsWith('gemini-4-')) {
    config.temperature = options.temperature;
  }
  return config;
}

async function getServerApiKey(): Promise<string> {
  let apiKey = process.env.GEMINI_API_KEY?.trim() || '';
  if (!apiKey) {
    try {
      const configDocRef = doc(db, 'settings', 'ai_config');
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
      const configSnap = await Promise.race([getDoc(configDocRef), timeoutPromise]);
      if (configSnap && 'exists' in configSnap && configSnap.exists()) {
        const data = configSnap.data() as any;
        apiKey = (data?.globalApiKey || data?.apiKey || '').trim();
      }
    } catch (e) {
      console.error('Error fetching server fallback config from Firestore:', e);
    }
  }
  if (!apiKey) {
    throw new Error('Chưa cấu hình GEMINI_API_KEY trên hệ thống máy chủ.');
  }
  return apiKey;
}

async function getGeminiClient(): Promise<GoogleGenAI> {
  const apiKey = await getServerApiKey();
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
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
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: rawBase64,
            },
          },
          {
            text: safePrompt,
          },
        ],
      };
    }

    if (rawBase64 && (mimeType.includes('word') || mimeType.includes('docx') || fileName.endsWith('.docx'))) {
      try {
        const buffer = Buffer.from(rawBase64, 'base64');
        const extracted = await mammoth.extractRawText({ buffer });
        const docxText = extracted.value || '';
        return `[NỘI DUNG TÀI LIỆU WORD GỐC ĐÍNH KÈM]:\n"""\n${docxText}\n"""\n\n${safePrompt}`;
      } catch (mErr) {
        console.warn('Docx parsing error:', mErr);
        return safePrompt;
      }
    }

    if (rawBase64 && fileData.mimeType) {
      return {
        parts: [
          {
            inlineData: {
              mimeType: fileData.mimeType,
              data: rawBase64,
            },
          },
          {
            text: safePrompt,
          },
        ],
      };
    }

    if (fileData.text) {
      return `[NỘI DUNG TÀI LIỆU VĂN BẢN ĐÍNH KÈM]:\n"""\n${fileData.text}\n"""\n\n${safePrompt}`;
    }
  }
  return safePrompt;
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = 3000;

  app.use(express.json({ limit: '25mb' }));

  // API Health Endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'EduPlay Pro Backend' });
  });

  // API Gemini Available Models
  app.get('/api/gemini/models', (_req, res) => {
    res.json({
      models: RECOMMENDED_MODELS,
      defaultModel: DEFAULT_MODEL,
      liveModel: LIVE_MODEL,
    });
  });

  // API Gemini Live Latency Test (Server-side only)
  app.post('/api/gemini/latency', async (req, res) => {
    const startTime = Date.now();
    const requestedModel = sanitizeModelName(req.body?.model);
    const candidateModels = [requestedModel, ...RECOMMENDED_MODELS.filter((m) => m !== requestedModel)];

    try {
      const ai = await getGeminiClient();
      let lastError: any = null;

      for (const modelName of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: 'Xin chào, trả lời "OK" để kiểm tra độ trễ.',
          });
          const durationMs = Date.now() - startTime;
          return res.json({
            latencyMs: durationMs,
            status: 'online',
            modelName,
            message: response?.text ? 'Kết nối máy chủ Gemini thành công!' : 'Không có phản hồi.',
          });
        } catch (err: any) {
          lastError = err;
          console.warn(`Latency check with ${modelName} failed, trying next model...`, sanitizeErrorText(err?.message || ''));
        }
      }

      throw lastError || new Error('Không thể kết nối với các model Gemini.');
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      const formatted = formatGeminiError(error);
      res.status(500).json({
        latencyMs: durationMs,
        status: 'error',
        modelName: requestedModel,
        message: formatted.userMessage,
        httpStatus: formatted.httpStatus,
        rawErrorDetails: formatted.rawDetails,
      });
    }
  });

  // API Gemini Live API Session Config Check (Server-side bridge metadata, never returns keys)
  app.post('/api/gemini/live-token', async (req, res) => {
    try {
      await getGeminiClient();
      const requestedLiveModel =
        typeof req.body?.model === 'string' && ALLOWED_LIVE_MODELS.has(req.body.model.trim())
          ? req.body.model.trim()
          : LIVE_MODEL;
      res.json({
        model: requestedLiveModel,
        wsPath: '/api/gemini/live',
        status: 'ready',
        message: 'Live API server bridge initialized',
      });
    } catch (error: any) {
      const formatted = formatGeminiError(error);
      res.status(formatted.httpStatus).json({ error: formatted.userMessage });
    }
  });

  // API Gemini General Generation (Server-side only)
  app.post('/api/gemini/generate', async (req, res) => {
    const { prompt, systemInstruction, responseJson, fileData, model, temperature } = req.body || {};
    try {
      const ai = await getGeminiClient();
      const contents = await buildContents(prompt, fileData);
      const targetModel = sanitizeModelName(model);
      const candidateModels = [targetModel, ...RECOMMENDED_MODELS.filter((m) => m !== targetModel)];

      let response: any = null;
      let usedModel = targetModel;
      let lastError: any = null;

      for (const modelName of candidateModels) {
        try {
          const config = buildGenerateConfig(modelName, {
            systemInstruction,
            responseJson,
            temperature,
          });
          response = await ai.models.generateContent({
            model: modelName,
            contents,
            config: Object.keys(config).length > 0 ? config : undefined,
          });
          if (response && response.text) {
            usedModel = modelName;
            break;
          }
        } catch (modelErr: any) {
          lastError = modelErr;
          console.warn(`Model ${modelName} encountered error, trying next available model...`, sanitizeErrorText(modelErr?.message || ''));
        }
      }

      if (!response || !response.text) {
        throw lastError || new Error('Không nhận được phản hồi từ mô hình AI.');
      }

      res.json({ text: response.text, model: usedModel });
    } catch (error: any) {
      console.error('Gemini Generate Error:', sanitizeErrorText(error?.message || String(error)));
      const formatted = formatGeminiError(error);
      res.status(formatted.httpStatus).json({
        error: formatted.userMessage,
        httpStatus: formatted.httpStatus,
      });
    }
  });

  // API Gemini Streaming Generation (Server-side SSE)
  app.post('/api/gemini/stream', async (req, res) => {
    const { prompt, systemInstruction, responseJson, fileData, model, temperature } = req.body || {};
    try {
      const ai = await getGeminiClient();
      const contents = await buildContents(prompt, fileData);
      const targetModel = sanitizeModelName(model);
      const candidateModels = [targetModel, ...RECOMMENDED_MODELS.filter((m) => m !== targetModel)];

      let responseStream: AsyncIterable<any> | null = null;
      let lastError: any = null;

      for (const modelName of candidateModels) {
        try {
          const config = buildGenerateConfig(modelName, {
            systemInstruction,
            responseJson,
            temperature,
          });
          responseStream = await ai.models.generateContentStream({
            model: modelName,
            contents,
            config: Object.keys(config).length > 0 ? config : undefined,
          });
          break;
        } catch (err: any) {
          lastError = err;
          console.warn(`Stream model ${modelName} failed, trying next model...`, sanitizeErrorText(err?.message || ''));
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
    } catch (error: any) {
      console.error('Gemini Stream Error:', sanitizeErrorText(error?.message || String(error)));
      const formatted = formatGeminiError(error);
      if (!res.headersSent) {
        res.status(formatted.httpStatus).json({ error: formatted.userMessage });
      } else {
        res.write(`data: ${JSON.stringify({ error: formatted.userMessage })}\n\n`);
        res.end();
      }
    }
  });

  // Server-side WebSocket Bridge for Gemini Live API (/api/gemini/live)
  const liveWss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const reqUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (reqUrl.pathname === '/api/gemini/live') {
        liveWss.handleUpgrade(request, socket, head, (ws) => {
          liveWss.emit('connection', ws, request);
        });
      }
    } catch {
      socket.destroy();
    }
  });

  liveWss.on('connection', async (clientWs: WebSocket, req) => {
    let session: any = null;
    try {
      const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const rawModel = reqUrl.searchParams.get('model') || LIVE_MODEL;
      const liveModel = ALLOWED_LIVE_MODELS.has(rawModel) ? rawModel : LIVE_MODEL;
      const rawVoice = reqUrl.searchParams.get('voiceName') || 'Zephyr';
      const voiceName = ALLOWED_LIVE_VOICES.has(rawVoice) ? rawVoice : 'Zephyr';
      const systemInstruction =
        reqUrl.searchParams.get('systemInstruction') ||
        'Bạn là trợ lý sư phạm thân thiện hỗ trợ giáo viên và học sinh tiểu học Việt Nam.';

      const ai = await getGeminiClient();

      session = await ai.live.connect({
        model: liveModel,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'ready', model: liveModel }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(JSON.stringify({ inputTranscript: content.inputTranscription.text }));
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(JSON.stringify({ outputTranscript: content.outputTranscription.text }));
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ turnComplete: true }));
            }
          },
          onerror: (err: any) => {
            console.error('Gemini Live Session Error:', sanitizeErrorText(err?.message || String(err)));
            if (clientWs.readyState === WebSocket.OPEN) {
              const formatted = formatGeminiError(err);
              clientWs.send(JSON.stringify({ error: formatted.userMessage }));
            }
          },
          onclose: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.close();
            }
          },
        },
      });

      clientWs.on('message', (data) => {
        if (!session) return;
        try {
          const payload = JSON.parse(data.toString());
          if (payload.audio) {
            session.sendRealtimeInput({
              audio: { data: payload.audio, mimeType: payload.mimeType || 'audio/pcm;rate=16000' },
            });
          } else if (payload.video) {
            session.sendRealtimeInput({
              video: { data: payload.video, mimeType: payload.mimeType || 'image/jpeg' },
            });
          } else if (payload.text) {
            session.sendRealtimeInput({
              text: String(payload.text),
            });
          }
        } catch (parseErr) {
          console.warn('Invalid Live WebSocket client message:', parseErr);
        }
      });

      clientWs.on('close', () => {
        try {
          session?.close?.();
        } catch {}
        session = null;
      });
    } catch (err: any) {
      const formatted = formatGeminiError(err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ error: formatted.userMessage }));
        clientWs.close();
      }
      try {
        session?.close?.();
      } catch {}
    }
  });

  // Vite Middleware setup for dev vs prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`EduPlay Pro Server running on http://localhost:${PORT}`);
  });
}

startServer();
