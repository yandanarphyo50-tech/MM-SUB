import {
  formatSecondsToSrt,
  parseFlexInputTime,
  parseFlexibleTimestamp,
  parseSrt,
  serializeSrt,
  shiftAndClampCues,
  stripStageDirectionCues,
  type SrtCue,
} from './srt';
import type { GeminiModelId, SubtitleModeId } from './studioTypes';

const GEMINI_API_KEY_STORAGE_KEY = 'myanmar_mv_studio_gemini_api_key';
const GEMINI_REST_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_UPLOAD_BASE = 'https://generativelanguage.googleapis.com/upload/v1beta/files';
const MYANMAR_SCRIPT_RE = /[\u1000-\u109F]/;

const SchemaType = {
  OBJECT: 'OBJECT',
  ARRAY: 'ARRAY',
  STRING: 'STRING',
  INTEGER: 'INTEGER',
} as const;

type RestPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType: string; fileUri: string } };

interface RestGeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

interface RestUploadedFile {
  name?: string;
  uri?: string;
  mimeType?: string;
  state?: string;
  error?: {
    message?: string;
  };
}

export function cleanGeminiApiKey(rawKey: string): string {
  return rawKey.trim().replace(/^['"]+|['"]+$/g, '').trim();
}

export function getStoredGeminiApiKey(): string {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY);
      if (saved && saved.trim()) {
        return cleanGeminiApiKey(saved);
      }
    } catch {
      // Ignore storage access errors
    }
  }
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const envKey = env?.VITE_GEMINI_API_KEY;
  return typeof envKey === 'string' ? cleanGeminiApiKey(envKey) : '';
}

export function saveStoredGeminiApiKey(rawKey: string): string {
  const cleaned = cleanGeminiApiKey(rawKey);
  if (typeof window !== 'undefined') {
    try {
      if (cleaned) {
        window.localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, cleaned);
      } else {
        window.localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }
  return cleaned;
}

export function normalizeGeminiModel(rawModel: string | undefined | null): string {
  const stripped = (rawModel ?? '').trim().replace(/^models\//i, '');
  if (!stripped) return 'gemini-3.5-flash-lite';

  const aliasMap: Record<string, string> = {
    'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite': 'gemini-3.5-flash-lite',
    'gemini-4-hydrogen': 'gemini-3.5-flash-lite',
  };
  return aliasMap[stripped] ?? stripped;
}

const SUBTITLE_INSTRUCTIONS: Record<SubtitleModeId, string> = {
  burmese_to_burmese:
    'Listen carefully to the ENTIRE audio from start to finish (Burmese / Myanmar language song or speech). ' +
    'Listen closely even when background music is loud or vocals are soft/emotional, and transcribe EVERY single audible sung or spoken Burmese line accurately—including repeated choruses, verses, bridge, and outro—into valid SRT subtitle format using standard Myanmar Unicode (မြန်မာယူနီကုဒ် စာလုံးပေါင်းသတ်ပုံ အမှန်). ' +
    'CRITICAL BURMESE ASR RULES:\n' +
    '1. Write ONLY authentic, meaningful Myanmar Unicode words (NEVER Zawgyi, NEVER Romanized/Burglish like "chit thu", NEVER Thai/English filler).\n' +
    '2. Pay careful attention to Burmese phonetics and spelling: aspirated vs unaspirated consonants (က/ခ, စ/ဆ, တ/ထ, ပ/ဖ), medials (ျ/ြ/ွ/ှ), and final consonants/athat (တ်/ပ်/က်, န်/မ်, င်/ဉ်).\n' +
    '3. Repeated choruses must have consistent, accurate Burmese wording.\n' +
    '4. Do NOT stop early, do NOT skip lines, and do NOT invent words during vocal-free instrumental gaps (never write [Music] or [Instrumental]).\n' +
    '5. Match timestamps (HH:MM:SS,mmm --> HH:MM:SS,mmm) tightly to the actual vocal start/end, keeping each block concise (1 short phrase or 1-2 lines).\n' +
    'Output ONLY raw SRT content with no markdown code blocks or explanations.',
  english_to_burmese:
    'Listen carefully to the ENTIRE audio from start to finish (English or any other foreign language song/speech). ' +
    'Listen closely even when background music is loud or vocals are soft/auto-tuned, and translate EVERY single audible sung or spoken line—including repeated choruses, verses, bridge, and outro—naturally and poetically into Burmese (Myanmar Unicode script — မြန်မာစာ) in valid SRT subtitle format. ' +
    'CRITICAL RULE: Every single subtitle line MUST be written in Burmese Myanmar Unicode script (မြန်မာဘာသာ). NEVER output English-only lyrics. ' +
    'Do NOT stop early, do NOT skip repeated choruses, and do NOT summarize. ' +
    'Only leave truly vocal-free instrumental gaps blank (never write [Music] or [Instrumental]). ' +
    'Sync the timestamps (HH:MM:SS,mmm --> HH:MM:SS,mmm) accurately with the actual vocals. ' +
    'Keep each subtitle block concise (1-2 lines). ' +
    'Output ONLY the raw SRT content with no markdown code blocks or explanations.',
  dual:
    'Listen carefully to the ENTIRE audio from start to finish (English or any other foreign language song/speech). ' +
    'Listen closely even when background music is loud or vocals are soft/auto-tuned, and transcribe and translate EVERY single audible sung or spoken line—including repeated choruses, verses, bridge, and outro—into bilingual (dual) subtitles in valid SRT format. ' +
    'CRITICAL FORMAT: Every single subtitle block MUST have EXACTLY TWO LINES: Line 1 = the original sung lyric, Line 2 = its natural, poetic Burmese translation written in Myanmar Unicode script (မြန်မာစာ). NEVER omit the Burmese second line. ' +
    'Do NOT stop early, do NOT skip repeated choruses, and do NOT summarize. ' +
    'Only leave truly vocal-free instrumental gaps blank (never write [Music] or [Instrumental]). ' +
    'Sync the timestamps (HH:MM:SS,mmm --> HH:MM:SS,mmm) accurately with the actual vocals. ' +
    'Output ONLY the raw SRT content with no markdown code blocks or explanations.',
  burmese_to_english:
    'Listen carefully to the ENTIRE audio from start to finish (Burmese language song/speech). ' +
    'Listen closely even when background music is loud or vocals are soft, and translate EVERY single audible sung or spoken line—including repeated choruses, verses, bridge, and outro—naturally and poetically into English in valid SRT subtitle format. ' +
    'CRITICAL RULE: Every single subtitle line MUST be written in English. ' +
    'Do NOT stop early, do NOT skip repeated choruses, and do NOT summarize. ' +
    'Only leave truly vocal-free instrumental gaps blank (never write [Music] or [Instrumental]). ' +
    'Sync the timestamps (HH:MM:SS,mmm --> HH:MM:SS,mmm) accurately with the actual vocals. ' +
    'Keep each subtitle block concise (1-2 lines). ' +
    'Output ONLY the raw SRT content with no markdown code blocks or explanations.',
};

function cleanSrtOutput(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:srt)?\s*\r?\n?([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) {
    return fencedMatch[1].trim();
  }
  return trimmed
    .replace(/^```(?:srt)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function safeParseJsonObject<T>(raw: string | undefined | null): T | null {
  if (!raw || typeof raw !== 'string') return null;
  let cleaned = raw.trim();
  const fenced = cleaned.match(/```(?:json)?\s*\r?\n?([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    cleaned = fenced[1].trim();
  } else {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function isPredominantlyMyanmar(text: string): boolean {
  const stripped = text.replace(/[\s\d.,!?'"()\-:;[\]/]+/g, '');
  if (!stripped) return true;
  const myanmarCount = (stripped.match(/[\u1000-\u109F]/g) || []).length;
  return myanmarCount / stripped.length >= 0.35;
}

function isDailyQuotaError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('429') ||
    msg.includes('perday')
  );
}

function isAuthKeyError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid') ||
    msg.includes('api key expired') ||
    msg.includes('permission_denied') ||
    msg.includes('unauthenticated') ||
    msg.includes('http 401') ||
    msg.includes('http 403')
  );
}

function isTransientGeminiError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('unavailable') ||
    msg.includes('http 503') ||
    msg.includes('http 500') ||
    msg.includes('overloaded') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('rate limit')
  );
}

function formatFriendlyGeminiError(err: unknown): Error {
  if (isAuthKeyError(err)) {
    return new Error(
      'ထည့်ထားသော Gemini API Key မှားယွင်းနေပါသည် (သို့) ခွင့်ပြုချက်မရှိပါ။ AIza... API Key အစစ်ကို ပြန်စစ်ထည့်ပေးပါ။'
    );
  }
  if (isDailyQuotaError(err)) {
    return new Error(
      'Gemini API Key ၏ အသုံးပြုနိုင်သော Quota ပြည့်သွားပါပြီ။ ခေတ္တစောင့်ပြီး ထပ်စမ်းပါ (သို့) Model ပြောင်းရွေးပါ။'
    );
  }
  if (err instanceof Error) {
    return err;
  }
  return new Error('AI စာတန်းထုတ်ရာတွင် အမှားဖြစ်ပွားပါသည်။');
}

function orderCandidateModels(preferred: GeminiModelId | string): string[] {
  const primary = normalizeGeminiModel(preferred);
  const defaults = ['gemini-3.5-flash-lite', 'gemini-2.5-flash'];
  return [primary, ...defaults.filter((m) => m !== primary)];
}

async function callGeminiRestGenerateContent({
  apiKey,
  model,
  parts,
  responseMimeType,
  responseSchema,
  timeoutMs = 70_000,
}: {
  apiKey: string;
  model: string;
  parts: RestPart[];
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<string> {
  const cleanKey = cleanGeminiApiKey(apiKey);
  const normalizedModel = normalizeGeminiModel(model);
  const endpoint = `${GEMINI_REST_BASE}/models/${encodeURIComponent(
    normalizedModel
  )}:generateContent?key=${encodeURIComponent(cleanKey)}`;

  const payload: Record<string, unknown> = {
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
  };

  if (responseMimeType || responseSchema) {
    payload.generationConfig = {
      ...(responseMimeType ? { responseMimeType } : {}),
      ...(responseSchema ? { responseSchema } : {}),
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Model ${normalizedModel} timeout after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw new Error(
      'Google Gemini API သို့ ချိတ်ဆက်၍မရပါ။ အင်တာနက်လိုင်း သို့မဟုတ် Browser Network ကို စစ်ဆေးပေးပါ။'
    );
  } finally {
    clearTimeout(timer);
  }

  let data: RestGeminiResponse | null = null;
  let rawText = '';
  try {
    rawText = await response.text();
    if (rawText) {
      data = JSON.parse(rawText) as RestGeminiResponse;
    }
  } catch {
    // Keep rawText fallback
  }

  if (!response.ok) {
    const errMsg = data?.error?.message || rawText || response.statusText || 'Request failed';
    const errStatus = data?.error?.status ? `${data.error.status}: ` : '';
    throw new Error(`Gemini API HTTP ${response.status} (${errStatus}${errMsg})`);
  }

  const textParts = data?.candidates?.[0]?.content?.parts ?? [];
  const combined = textParts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim();

  return combined;
}

async function uploadFileToGeminiRest(
  apiKey: string,
  file: File,
  mimeType: string
): Promise<RestUploadedFile> {
  const cleanKey = cleanGeminiApiKey(apiKey);
  const startUrl = `${GEMINI_UPLOAD_BASE}?key=${encodeURIComponent(cleanKey)}`;

  const startRes = await fetch(startUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(file.size),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file: {
        display_name: file.name || 'studio_video.mp4',
      },
    }),
  });

  if (!startRes.ok) {
    const errText = await startRes.text().catch(() => startRes.statusText);
    throw new Error(`Gemini Files API HTTP ${startRes.status}: ${errText}`);
  }

  const uploadUrl =
    startRes.headers.get('x-goog-upload-url') || startRes.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) {
    throw new Error('Gemini Files API upload URL မရရှိပါ။');
  }

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
      'Content-Type': mimeType,
    },
    body: file,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => uploadRes.statusText);
    throw new Error(`Gemini File upload HTTP ${uploadRes.status}: ${errText}`);
  }

  const json = (await uploadRes.json()) as { file?: RestUploadedFile } & RestUploadedFile;
  return json.file ?? json;
}

async function getGeminiRestFile(apiKey: string, fileName: string): Promise<RestUploadedFile> {
  const cleanKey = cleanGeminiApiKey(apiKey);
  const normalizedName = fileName.startsWith('files/') ? fileName : `files/${fileName}`;
  const res = await fetch(
    `${GEMINI_REST_BASE}/${normalizedName}?key=${encodeURIComponent(cleanKey)}`
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Gemini File status HTTP ${res.status}: ${errText}`);
  }
  const json = (await res.json()) as { file?: RestUploadedFile } & RestUploadedFile;
  return json.file ?? json;
}

async function deleteGeminiRestFile(apiKey: string, fileName: string): Promise<void> {
  const cleanKey = cleanGeminiApiKey(apiKey);
  const normalizedName = fileName.startsWith('files/') ? fileName : `files/${fileName}`;
  await fetch(`${GEMINI_REST_BASE}/${normalizedName}?key=${encodeURIComponent(cleanKey)}`, {
    method: 'DELETE',
  });
}

function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const sub = bytes.subarray(i, i + CHUNK);
    parts.push(String.fromCharCode(...sub));
  }
  return btoa(parts.join(''));
}

function encodeAudioBufferSliceToWavBytes(
  audioBuffer: AudioBuffer,
  startSec: number,
  durationSec: number,
  targetSampleRate = 16_000
): Uint8Array {
  const srcRate = audioBuffer.sampleRate;
  const srcTotalSamples = audioBuffer.length;
  const srcStart = Math.max(0, Math.min(srcTotalSamples - 1, Math.floor(startSec * srcRate)));
  const srcEnd = Math.max(
    srcStart + 1,
    Math.min(srcTotalSamples, Math.floor((startSec + durationSec) * srcRate))
  );
  const srcSliceLen = srcEnd - srcStart;
  const actualDuration = srcSliceLen / srcRate;
  const outSamples = Math.max(1, Math.floor(actualDuration * targetSampleRate));
  const numChannels = Math.max(1, audioBuffer.numberOfChannels);
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(audioBuffer.getChannelData(c));
  }

  const dataByteLen = outSamples * 2;
  const buffer = new ArrayBuffer(44 + dataByteLen);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, targetSampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataByteLen, true);

  const step = srcRate / targetSampleRate;
  let peak = 0;
  const mono = new Float32Array(outSamples);
  for (let i = 0; i < outSamples; i++) {
    const srcIdx = Math.min(srcTotalSamples - 1, srcStart + Math.floor(i * step));
    let sum = 0;
    for (let c = 0; c < numChannels; c++) {
      sum += channels[c][srcIdx];
    }
    const sample = sum / numChannels;
    mono[i] = sample;
    const abs = Math.abs(sample);
    if (abs > peak) peak = abs;
  }

  const gain = peak > 0.002 && peak < 0.7 ? Math.min(4.0, 0.85 / peak) : 1.0;
  let offset = 44;
  for (let i = 0; i < outSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, mono[i] * gain));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

async function decodeFileAudio(file: File): Promise<AudioBuffer | null> {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch {
    throw new Error(
      'ရွေးချယ်ထားသော ဗီဒီယိုဖိုင်ကို ဖတ်မရပါ (Google Drive / Cloud ဖိုင်ဖြစ်နိုင်သည်) — ဖုန်း Internal Storage (Downloads) ထဲသို့ အရင် Save ပြီးမှ ရွေးချယ်ပေးပါ။'
    );
  }

  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    if (!decoded || decoded.duration <= 0 || decoded.numberOfChannels === 0) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  } finally {
    await ctx.close().catch(() => {});
  }
}

async function translateCueBatch(
  apiKey: string,
  candidateModels: string[],
  items: Array<{ idx: number; text: string }>,
  targetLanguage: 'burmese' | 'english',
  customPrompt?: string,
  throwOnTotalFailure = false
): Promise<Map<number, string>> {
  const resultMap = new Map<number, string>();
  if (items.length === 0) return resultMap;

  let lastBatchError: unknown = null;
  const BATCH_SIZE = 40;

  const runSingleBatchPass = async (
    batch: Array<{ idx: number; text: string }>
  ): Promise<Map<number, string>> => {
    const batchMap = new Map<number, string>();
    const targetDesc =
      targetLanguage === 'burmese'
        ? 'natural, poetic Burmese written strictly in Myanmar Unicode script (မြန်မာစာ). EVERY single translated string MUST be in Myanmar Unicode script—NEVER leave it in English.'
        : 'natural, poetic English. EVERY single translated string MUST be in English.';

    const customNote = customPrompt?.trim()
      ? `\nAdditional style/translation instruction from user: ${customPrompt.trim()}`
      : '';

    const promptText =
      `Translate EVERY SINGLE song lyric subtitle item below into ${targetDesc}${customNote}\n` +
      `Keep each translation concise (1-2 short lines) for music video subtitles and return an object in the translations array for EVERY input idx (do not skip any idx).\n\n` +
      JSON.stringify(batch);

    for (let i = 0; i < candidateModels.length; i++) {
      const candidate = candidateModels[i];
      const hasFallback = i < candidateModels.length - 1;
      const timeoutMs = hasFallback ? 40_000 : 60_000;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const responseText = await callGeminiRestGenerateContent({
            apiKey,
            model: candidate,
            parts: [{ text: promptText }],
            responseMimeType: 'application/json',
            responseSchema: {
              type: SchemaType.OBJECT,
              properties: {
                translations: {
                  type: SchemaType.ARRAY,
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      idx: { type: SchemaType.INTEGER },
                      translated: { type: SchemaType.STRING },
                    },
                    required: ['idx', 'translated'],
                  },
                },
              },
              required: ['translations'],
            },
            timeoutMs,
          });

          const parsed = safeParseJsonObject<{
            translations?: Array<{ idx: number; translated: string }>;
          }>(responseText);

          const itemsList = Array.isArray(parsed?.translations) ? parsed.translations : [];
          if (itemsList.length === 0) {
            throw new Error(`Translation model ${candidate} returned empty translations`);
          }

          if (targetLanguage === 'burmese') {
            const hasAnyMyanmar = itemsList.some((item) =>
              MYANMAR_SCRIPT_RE.test(item.translated || '')
            );
            if (!hasAnyMyanmar) {
              throw new Error(`Translation model ${candidate} returned non-Myanmar text`);
            }
          }

          for (const item of itemsList) {
            if (
              typeof item.idx === 'number' &&
              typeof item.translated === 'string' &&
              item.translated.trim()
            ) {
              batchMap.set(item.idx, item.translated.trim());
            }
          }

          if (batchMap.size > 0) {
            return batchMap;
          }
        } catch (batchErr) {
          if (!lastBatchError || !isDailyQuotaError(batchErr)) {
            lastBatchError = batchErr;
          }
          if (isAuthKeyError(batchErr)) {
            throw batchErr;
          }
          if (attempt === 0 && isTransientGeminiError(batchErr)) {
            await new Promise((r) => setTimeout(r, 1100));
            continue;
          }
          break;
        }
      }
    }
    return batchMap;
  };

  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    const batch = items.slice(start, start + BATCH_SIZE);
    const batchMap = await runSingleBatchPass(batch);

    const missing = batch.filter((b) => !batchMap.has(b.idx));
    if (missing.length > 0 && missing.length < batch.length && batchMap.size > 0) {
      const recovered = await runSingleBatchPass(missing);
      for (const [k, v] of recovered.entries()) {
        batchMap.set(k, v);
      }
    }

    for (const [k, v] of batchMap.entries()) {
      resultMap.set(k, v);
    }
  }

  if (throwOnTotalFailure && resultMap.size === 0) {
    if (lastBatchError) {
      throw formatFriendlyGeminiError(lastBatchError);
    }
    throw new Error('AI ဘာသာပြန်မှု မအောင်မြင်ပါ။ ခေတ္တစောင့်ပြီး ထပ်မံကြိုးစားပေးပါ။');
  }
  return resultMap;
}

async function proofreadBurmeseLyricsText(
  apiKey: string,
  candidateModels: string[],
  cues: SrtCue[],
  customPrompt?: string
): Promise<SrtCue[]> {
  if (cues.length === 0) return cues;
  const customNote = customPrompt?.trim()
    ? `\nSong/User context hint: ${customPrompt.trim()}`
    : '';

  const BATCH_SIZE = 40;
  const updatedMap = new Map<number, string>();

  for (let start = 0; start < cues.length; start += BATCH_SIZE) {
    const batchCues = cues.slice(start, start + BATCH_SIZE);
    const payloadItems = batchCues.map((c, offset) => ({
      idx: start + offset,
      time: `${c.startTimestamp} --> ${c.endTimestamp}`,
      text: c.text,
    }));

    const promptText =
      `You are an expert Myanmar (Burmese) song lyric proofreader and Myanmar Unicode specialist.${customNote}\n` +
      `Below are auto-transcribed Burmese song lyrics. Fix any Myanmar Unicode spelling/orthography mistakes, phonetic mishearings (e.g., က/ခ, စ/ဆ, တ/ထ, ပ/ဖ, -တ်/-ပ်/-က်, -န်/-မ်, င်/ဉ်), Zawgyi-ordering glitches, or accidental English/Romanized words into natural, meaningful, grammatically accurate Myanmar Unicode song lyrics.\n` +
      `Keep the exact meaning and phrasing, keep repeated choruses consistent, and return matching idx values.\n\n` +
      JSON.stringify(payloadItems);

    for (const candidate of candidateModels) {
      try {
        const resText = await callGeminiRestGenerateContent({
          apiKey,
          model: candidate,
          parts: [{ text: promptText }],
          responseMimeType: 'application/json',
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              corrections: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    idx: { type: SchemaType.INTEGER },
                    text: { type: SchemaType.STRING },
                  },
                  required: ['idx', 'text'],
                },
              },
            },
            required: ['corrections'],
          },
          timeoutMs: 45_000,
        });

        const parsed = safeParseJsonObject<{
          corrections?: Array<{ idx: number; text: string }>;
        }>(resText);
        if (Array.isArray(parsed?.corrections) && parsed.corrections.length > 0) {
          let applied = 0;
          for (const item of parsed.corrections) {
            if (
              typeof item.idx === 'number' &&
              typeof item.text === 'string' &&
              item.text.trim() &&
              MYANMAR_SCRIPT_RE.test(item.text)
            ) {
              updatedMap.set(item.idx, item.text.trim());
              applied++;
            }
          }
          if (applied > 0) break;
        }
      } catch {
        // Non-fatal; keep original cues
      }
    }
  }

  if (updatedMap.size === 0) return cues;
  return cues.map((cue, idx) => ({
    ...cue,
    text: updatedMap.get(idx) ?? cue.text,
  }));
}

async function ensureTargetLanguageCues(
  apiKey: string,
  cues: SrtCue[],
  mode: SubtitleModeId,
  candidateModels: string[],
  customPrompt?: string,
  forceAll = false
): Promise<SrtCue[]> {
  const cleaned = stripStageDirectionCues(cues);
  if (cleaned.length === 0) return cleaned;

  if (mode === 'burmese_to_burmese') {
    return await proofreadBurmeseLyricsText(apiKey, candidateModels, cleaned, customPrompt);
  }

  if (mode === 'english_to_burmese') {
    const toTranslate = cleaned
      .map((c, idx) => ({ idx, text: c.text }))
      .filter((item) => forceAll || !isPredominantlyMyanmar(item.text));

    if (toTranslate.length === 0) return cleaned;
    const translatedMap = await translateCueBatch(
      apiKey,
      candidateModels,
      toTranslate,
      'burmese',
      customPrompt,
      forceAll
    );
    return cleaned.map((cue, idx) => ({
      ...cue,
      text: translatedMap.get(idx) ?? cue.text,
    }));
  }

  if (mode === 'dual') {
    const toTranslate = cleaned
      .map((c, idx) => {
        const lines = c.text
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        const firstLine = lines[0] || c.text.trim();
        const secondLine = lines[1] || '';
        return { idx, text: firstLine, secondLine, fullText: c.text };
      })
      .filter(
        (item) =>
          forceAll ||
          (!isPredominantlyMyanmar(item.secondLine) && !isPredominantlyMyanmar(item.fullText))
      );

    if (toTranslate.length === 0) return cleaned;
    const translatedMap = await translateCueBatch(
      apiKey,
      candidateModels,
      toTranslate.map(({ idx, text }) => ({ idx, text })),
      'burmese',
      customPrompt,
      forceAll
    );
    return cleaned.map((cue, idx) => {
      const translated = translatedMap.get(idx);
      if (!translated) return cue;
      const originalLine = cue.text.split('\n')[0]?.trim() || cue.text.trim();
      return {
        ...cue,
        text: isPredominantlyMyanmar(originalLine)
          ? translated
          : `${originalLine}\n${translated}`,
      };
    });
  }

  if (mode === 'burmese_to_english') {
    const toTranslate = cleaned
      .map((c, idx) => ({ idx, text: c.text }))
      .filter((item) => forceAll || MYANMAR_SCRIPT_RE.test(item.text));

    if (toTranslate.length === 0) return cleaned;
    const translatedMap = await translateCueBatch(
      apiKey,
      candidateModels,
      toTranslate,
      'english',
      customPrompt,
      forceAll
    );
    return cleaned.map((cue, idx) => ({
      ...cue,
      text: translatedMap.get(idx) ?? cue.text,
    }));
  }

  return cleaned;
}

export interface GenerateSubtitlesClientParams {
  apiKey: string;
  file: File;
  mode: SubtitleModeId;
  model: GeminiModelId | string;
  startSec?: number;
  endSec?: number;
  customPrompt?: string;
  onProgress?: (statusText: string) => void;
}

export async function generateSubtitlesClient({
  apiKey,
  file,
  mode,
  model,
  startSec,
  endSec,
  customPrompt,
  onProgress,
}: GenerateSubtitlesClientParams): Promise<{
  srt: string;
  rangeStartSec: number;
  rangeEndSec: number;
}> {
  const cleanKey = cleanGeminiApiKey(apiKey) || getStoredGeminiApiKey();
  if (!cleanKey) {
    throw new Error(
      'AI စာတန်းထိုးထုတ်ရန် Gemini API Key ကို အရင်ထည့်သွင်းပြီး Save နှိပ်ပေးပါ။'
    );
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error(
      'အင်တာနက် ချိတ်ဆက်မှု ပြတ်တောက်နေပါသည်။ Wi-Fi / Mobile Data ကို စစ်ဆေးပြီး ထပ်စမ်းပါ။'
    );
  }

  const candidateModels = orderCandidateModels(model);
  const isBurmeseLyricsMode = mode === 'burmese_to_burmese';
  const userCustomNote = customPrompt?.trim()
    ? `\n\nUser Custom Instruction: ${customPrompt.trim()}`
    : '';
  const instruction = SUBTITLE_INSTRUCTIONS[mode] + userCustomNote;

  const parseCueTime = (raw: string | undefined): number | null => {
    if (!raw || typeof raw !== 'string') return null;
    const parsed = parseFlexibleTimestamp(raw);
    if (parsed) return parsed.seconds;
    return parseFlexInputTime(raw);
  };

  const parseStructuredJsonCues = (rawJson: string): SrtCue[] => {
    const parsed = safeParseJsonObject<{
      cues?: Array<{ start?: string; end?: string; text?: string }>;
    }>(rawJson);
    if (!parsed || !Array.isArray(parsed.cues)) return [];
    const cues: SrtCue[] = [];
    for (const item of parsed.cues) {
      const text = typeof item.text === 'string' ? item.text.trim() : '';
      if (!text) continue;
      const s = parseCueTime(item.start);
      if (s === null) continue;
      const eRaw = parseCueTime(item.end);
      const e = eRaw !== null ? Math.max(eRaw, s + 0.3) : s + 3.0;
      cues.push({
        index: cues.length + 1,
        startSec: s,
        endSec: e,
        startTimestamp: formatSecondsToSrt(s),
        endTimestamp: formatSecondsToSrt(e),
        text,
      });
    }
    return cues;
  };

  let lastUpstreamError: unknown = null;

  const runModelWithFallback = async (
    parts: RestPart[]
  ): Promise<{ text: string; usedModel: string }> => {
    let lastError: unknown = null;
    for (let i = 0; i < candidateModels.length; i++) {
      const candidate = candidateModels[i];
      const hasFallback = i < candidateModels.length - 1;
      const timeoutMs =
        isBurmeseLyricsMode && candidate === 'gemini-2.5-pro' ? 95_000 : 75_000;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const responseText = await callGeminiRestGenerateContent({
            apiKey: cleanKey,
            model: candidate,
            parts,
            timeoutMs,
          });

          if (!responseText && hasFallback) {
            break;
          }
          return { text: responseText, usedModel: candidate };
        } catch (err) {
          if (!lastError || !isDailyQuotaError(err)) {
            lastError = err;
          }
          if (isAuthKeyError(err)) {
            throw err;
          }
          if (attempt === 0 && isTransientGeminiError(err)) {
            await new Promise((r) => setTimeout(r, 1200));
            continue;
          }
          break;
        }
      }
    }
    throw lastError ?? new Error('AI request failed.');
  };

  const runStructuredJsonFallback = async (
    mediaPart: RestPart,
    promptText: string,
    includeVisualHint = false
  ): Promise<{ cues: SrtCue[]; usedModel: string }> => {
    const jsonPrompt = includeVisualHint
      ? `This video may have silent, quiet, or visual on-screen lyrics. ` +
        `Inspect BOTH the video frames (read any on-screen lyrics, captions, or text shown on screen) AND any audible vocals, and output them in the JSON cues array.\n` +
        `Follow the target language & style requirements below:\n${promptText}\n\n` +
        `Format start and end timestamps as HH:MM:SS,mmm (for example 00:00:00,200 and 00:00:03,800). NEVER return an empty array if there is readable text or speech in the video.`
      : `${promptText}\n\n` +
        `Extract EVERY audible sung or spoken phrase in this media clip into the JSON cues array. ` +
        `Format start and end timestamps as HH:MM:SS,mmm (for example 00:00:02,500).`;

    for (const candidate of candidateModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const responseText = await callGeminiRestGenerateContent({
            apiKey: cleanKey,
            model: candidate,
            parts: [mediaPart, { text: jsonPrompt }],
            responseMimeType: 'application/json',
            responseSchema: {
              type: SchemaType.OBJECT,
              properties: {
                cues: {
                  type: SchemaType.ARRAY,
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      start: { type: SchemaType.STRING },
                      end: { type: SchemaType.STRING },
                      text: { type: SchemaType.STRING },
                    },
                    required: ['start', 'end', 'text'],
                  },
                },
              },
              required: ['cues'],
            },
            timeoutMs: 65_000,
          });
          const cues = parseStructuredJsonCues(responseText);
          if (cues.length > 0) {
            return { cues, usedModel: candidate };
          }
          break;
        } catch (err) {
          lastUpstreamError = err;
          if (isAuthKeyError(err)) throw err;
          if (attempt === 0 && isTransientGeminiError(err)) {
            await new Promise((r) => setTimeout(r, 1200));
            continue;
          }
          break;
        }
      }
    }
    return { cues: [], usedModel: candidateModels[0] };
  };

  const transcribePartToCues = async (
    mediaPart: RestPart,
    promptText: string,
    includeVisualHint = false
  ): Promise<{ cues: SrtCue[]; usedModel: string }> => {
    let tier1Text = '';
    let usedModel = candidateModels[0];
    const tier1Prompt = includeVisualHint
      ? `This video may have no audio or very quiet vocals. Read any on-screen text/lyrics shown in the video frames as well as any audio, and output valid SRT subtitles following these rules:\n\n${promptText}`
      : promptText;

    try {
      const res1 = await runModelWithFallback([mediaPart, { text: tier1Prompt }]);
      tier1Text = res1.text;
      usedModel = res1.usedModel;
    } catch (err) {
      lastUpstreamError = err;
      if (isAuthKeyError(err)) throw err;
      return { cues: [], usedModel };
    }

    const cleaned = cleanSrtOutput(tier1Text);
    const parsedFromSrt = cleaned ? parseSrt(cleaned) : [];
    if (parsedFromSrt.length > 0) {
      return { cues: parsedFromSrt, usedModel };
    }

    if (cleaned.startsWith('{')) {
      const parsedJson = parseStructuredJsonCues(cleaned);
      if (parsedJson.length > 0) {
        return { cues: parsedJson, usedModel };
      }
    }

    return await runStructuredJsonFallback(mediaPart, promptText, includeVisualHint);
  };

  onProgress?.('ဗီဒီယိုထဲမှ အသံကို ထုတ်ယူနေပါသည်...');
  const audioBuffer = await decodeFileAudio(file);

  let parsedCues: SrtCue[] = [];
  let rangeStart = 0;
  let rangeEnd = 0;

  try {
    if (audioBuffer) {
      const totalDurationSec = audioBuffer.duration;
      rangeStart =
        typeof startSec === 'number' && Number.isFinite(startSec) ? Math.max(0, startSec) : 0;

      if (rangeStart >= totalDurationSec) {
        throw new Error('ရွေးချယ်ထားသော စမည့်အချိန်သည် ဗီဒီယိုကြာချိန်ထက် ကျော်လွန်နေပါသည်။');
      }

      const rawEnd =
        typeof endSec === 'number' && Number.isFinite(endSec) && endSec > 0
          ? endSec
          : totalDurationSec;
      rangeEnd = Math.min(totalDurationSec, rawEnd);
      if (rangeEnd <= rangeStart) {
        throw new Error('ဆုံးမည့်အချိန်သည် စမည့်အချိန်ထက် ကြီးရပါမည်။');
      }

      const targetDurationSec = Math.max(0.5, rangeEnd - rangeStart);
      const CHUNK_SEC = 180;
      const segmentCount = Math.ceil(targetDurationSec / CHUNK_SEC);

      const mergedCues: SrtCue[] = [];
      for (let segIdx = 0; segIdx < segmentCount; segIdx++) {
        const offsetSec = rangeStart + segIdx * CHUNK_SEC;
        const segDuration = Math.min(
          CHUNK_SEC,
          Math.max(0.5, targetDurationSec - segIdx * CHUNK_SEC)
        );

        onProgress?.(
          segmentCount > 1
            ? `AI စာတန်းထိုး နားထောင်ဘာသာပြန်နေသည် (${segIdx + 1}/${segmentCount})...`
            : 'AI ဖြင့် အသံနားထောင်ပြီး စာတန်းထိုးထုတ်နေပါသည်...'
        );

        const wavBytes = encodeAudioBufferSliceToWavBytes(audioBuffer, offsetSec, segDuration);
        const base64Data = uint8ToBase64(wavBytes);
        const segEndTs = formatSecondsToSrt(segDuration);
        const segPrompt =
          segmentCount === 1 && rangeStart === 0
            ? `${instruction}\n\nAudio duration is ${segDuration.toFixed(1)} seconds (00:00:00,000 to ${segEndTs}). Ensure timestamps cover vocals across the clip without exceeding ${segEndTs}.`
            : `${instruction}\n\nThis audio clip is ${segDuration.toFixed(1)} seconds long (from 00:00:00,000 to ${segEndTs}), representing part ${segIdx + 1} of ${segmentCount}. Timestamps in your SRT output MUST start relative to this clip (00:00:00,000 to ${segEndTs}).`;

        const { cues: segCues } = await transcribePartToCues(
          {
            inlineData: {
              mimeType: 'audio/wav',
              data: base64Data,
            },
          },
          segPrompt,
          false
        );

        const shifted = shiftAndClampCues(segCues, offsetSec, segDuration);
        for (const cue of shifted) {
          const prev = mergedCues[mergedCues.length - 1];
          if (prev && cue.startSec < prev.endSec) {
            const adjustedStart = Math.min(cue.endSec - 0.15, prev.endSec);
            if (adjustedStart > cue.startSec) {
              cue.startSec = adjustedStart;
              cue.startTimestamp = formatSecondsToSrt(adjustedStart);
            }
          }
          mergedCues.push(cue);
        }
      }
      parsedCues = mergedCues;
    }

    if (parsedCues.length === 0) {
      onProgress?.('ဗီဒီယိုဖိုင်ကို AI ထံ တိုက်ရိုက်ပို့၍ စာတန်းထုတ်နေပါသည်...');
      const mimeType = file.type || 'video/mp4';
      const rangeHint =
        typeof startSec === 'number' || typeof endSec === 'number'
          ? `\nFocus ONLY on the time window from ${formatSecondsToSrt(startSec ?? 0)} to ${formatSecondsToSrt(endSec ?? 3600)}.`
          : '';

      if (file.size <= 16 * 1024 * 1024) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const base64Data = uint8ToBase64(bytes);
        const { cues: directCues } = await transcribePartToCues(
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          `${instruction}${rangeHint}`,
          true
        );
        parsedCues = directCues;
      } else {
        onProgress?.('ဗီဒီယိုဖိုင်ကြီးနေသဖြင့် Gemini File API သို့ ပို့နေပါသည်...');
        const uploaded = await uploadFileToGeminiRest(cleanKey, file, mimeType);
        const fileName = uploaded.name || '';
        try {
          let activeFile = uploaded;
          let waitTries = 0;
          while (activeFile.state === 'PROCESSING' && waitTries < 24 && fileName) {
            await new Promise((r) => setTimeout(r, 2500));
            activeFile = await getGeminiRestFile(cleanKey, fileName);
            waitTries++;
          }
          if (activeFile.uri) {
            const { cues: uploadedCues } = await transcribePartToCues(
              {
                fileData: {
                  mimeType: activeFile.mimeType || mimeType,
                  fileUri: activeFile.uri,
                },
              },
              `${instruction}${rangeHint}`,
              true
            );
            parsedCues = uploadedCues;
          }
        } finally {
          if (fileName) {
            void deleteGeminiRestFile(cleanKey, fileName).catch(() => {});
          }
        }
      }
    }

    if (parsedCues.length === 0) {
      if (lastUpstreamError) {
        throw formatFriendlyGeminiError(lastUpstreamError);
      }
      throw new Error(
        'ဗီဒီယိုထဲတွင် စကားပြောသံ / သီချင်းစာသား မတွေ့ရှိပါ (သို့) AI စာတန်းထုတ်၍ မရပါ။'
      );
    }

    onProgress?.('စာလုံးပေါင်းနှင့် ဘာသာပြန်များကို သပ်ရပ်အောင် ပြန်စစ်နေပါသည်...');
    const normalizedCues = await ensureTargetLanguageCues(
      cleanKey,
      parsedCues,
      mode,
      candidateModels,
      customPrompt,
      false
    );

    const finalCues = normalizedCues.length > 0 ? normalizedCues : parsedCues;
    return {
      srt: serializeSrt(finalCues),
      rangeStartSec: rangeStart,
      rangeEndSec: rangeEnd,
    };
  } catch (err) {
    throw formatFriendlyGeminiError(err);
  }
}

export async function translateSrtClient({
  apiKey,
  srtText,
  mode,
  model,
  customPrompt,
}: {
  apiKey: string;
  srtText: string;
  mode: SubtitleModeId;
  model: GeminiModelId | string;
  customPrompt?: string;
}): Promise<string> {
  const cleanKey = cleanGeminiApiKey(apiKey) || getStoredGeminiApiKey();
  if (!cleanKey) {
    throw new Error(
      'ဘာသာပြန်ရန် Gemini API Key ကို AI စာတန်း Panel ထဲတွင် အရင်ထည့်သွင်းပြီး Save နှိပ်ပေးပါ။'
    );
  }
  const parsed = parseSrt(srtText);
  if (parsed.length === 0) {
    throw new Error('ဘာသာပြန်ရန် .srt စာတန်းများ အရင်ထည့်ပေးပါ။');
  }
  const candidateModels = orderCandidateModels(model);
  try {
    const translated = await ensureTargetLanguageCues(
      cleanKey,
      parsed,
      mode,
      candidateModels,
      customPrompt,
      true
    );
    return serializeSrt(translated);
  } catch (err) {
    throw formatFriendlyGeminiError(err);
  }
}
