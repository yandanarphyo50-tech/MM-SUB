import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import dns from 'node:dns/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import express from 'express';
import multer from 'multer';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import {
  GoogleGenAI,
  ThinkingLevel,
  Type,
  createPartFromUri,
  createUserContent,
  type Part,
} from '@google/genai';
import {
  COLOR_PRESETS,
  LOGO_POSITIONS,
  MYANMAR_FONTS,
  SUBTITLE_COLORS,
  SUBTITLE_POSITIONS,
  VIDEO_ASPECT_PRESETS,
  type DownloadQualityId,
  type GeminiModelId,
  type LogoAnimationId,
  type LogoPositionId,
  type SubtitleAnimationId,
  type SubtitleColorId,
  type SubtitleModeId,
  type SubtitlePositionId,
  type TextLogoAnimationId,
  type TextLogoStyleId,
  type VideoAspectId,
  type VideoFitModeId,
} from './src/lib/studioTypes.ts';
import {
  buildAssFromCues,
  formatSecondsToSrt,
  parseFlexInputTime,
  parseFlexibleTimestamp,
  parseSrt,
  serializeSrt,
  shiftAndClampCues,
  stripStageDirectionCues,
  type AssTextLogoOptions,
  type SrtCue,
} from './src/lib/srt.ts';

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT) || 3000;
const WORKSPACE_ROOT = path.join(os.tmpdir(), 'myanmar_mv_studio');
const UPLOADS_DIR = path.join(WORKSPACE_ROOT, 'uploads');
const LOGOS_DIR = path.join(WORKSPACE_ROOT, 'logos');
const DOWNLOADED_VIDEOS_DIR = path.join(WORKSPACE_ROOT, 'downloads');
const RENDERS_DIR = path.join(WORKSPACE_ROOT, 'renders');
const BIN_DIR = path.join(WORKSPACE_ROOT, 'bin');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(LOGOS_DIR, { recursive: true });
fs.mkdirSync(DOWNLOADED_VIDEOS_DIR, { recursive: true });
fs.mkdirSync(RENDERS_DIR, { recursive: true });
fs.mkdirSync(BIN_DIR, { recursive: true });

interface UploadedVideoRecord {
  videoId: string;
  filePath: string;
  originalName: string;
  sizeBytes: number;
  mimeType: string;
  createdAt: number;
}

interface UploadedLogoRecord {
  logoId: string;
  filePath: string;
  originalName: string;
  sizeBytes: number;
  mimeType: string;
  createdAt: number;
}

interface DownloadedVideoRecord {
  downloadId: string;
  workDir: string;
  filePath: string;
  filename: string;
  title: string;
  platform: string;
  sizeBytes: number;
  mimeType: string;
  durationSec?: number;
  qualityId: DownloadQualityId;
  isAudioOnly: boolean;
  createdAt: number;
}

interface RenderedOutputRecord {
  renderId: string;
  workDir: string;
  videoPath: string;
  srtPath: string | null;
  filename: string;
  sizeBytes: number;
  createdAt: number;
}

const uploadedVideos = new Map<string, UploadedVideoRecord>();
const uploadedLogos = new Map<string, UploadedLogoRecord>();
const downloadedVideos = new Map<string, DownloadedVideoRecord>();
const renderedOutputs = new Map<string, RenderedOutputRecord>();

const ALLOWED_MODELS = new Set<GeminiModelId>([
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
]);

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB via 8 MB streaming chunks
const MYANMAR_SCRIPT_RE = /[\u1000-\u109F]/;

const FFMPEG_BIN =
  typeof ffmpegStatic === 'string' && fs.existsSync(ffmpegStatic)
    ? ffmpegStatic
    : 'ffmpeg';
const FFPROBE_BIN =
  ffprobeStatic?.path && fs.existsSync(ffprobeStatic.path)
    ? ffprobeStatic.path
    : 'ffprobe';

if (FFMPEG_BIN !== 'ffmpeg') {
  try {
    fs.chmodSync(FFMPEG_BIN, 0o755);
  } catch {
    // Ignore chmod errors
  }
}
if (FFPROBE_BIN !== 'ffprobe') {
  try {
    fs.chmodSync(FFPROBE_BIN, 0o755);
  } catch {
    // Ignore chmod errors
  }
}

const BUNDLED_FONTS_DIR = path.resolve(process.cwd(), 'fonts');
const PORTABLE_FONTCONFIG_PATH = path.join(WORKSPACE_ROOT, 'fonts.conf');

try {
  const fontDirs = [
    fs.existsSync(BUNDLED_FONTS_DIR) ? `<dir>${BUNDLED_FONTS_DIR}</dir>` : '',
    '<dir>/usr/share/fonts</dir>',
  ]
    .filter(Boolean)
    .join('\n  ');
  const fcXml = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  ${fontDirs}
  <alias>
    <family>sans-serif</family>
    <prefer><family>Noto Sans Myanmar</family></prefer>
  </alias>
  <cachedir>${path.join(WORKSPACE_ROOT, 'fc-cache')}</cachedir>
</fontconfig>
`;
  fs.writeFileSync(PORTABLE_FONTCONFIG_PATH, fcXml, 'utf8');
} catch {
  // Ignore fontconfig write error
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
  let cleaned = trimmed.replace(/^```(?:srt)?\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/, '');
  return cleaned.trim();
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

const ALLOWED_FONT_FAMILIES = new Set(MYANMAR_FONTS.map((f) => f.fontFamily));

function sanitizeFontName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Noto Sans Myanmar';
  const trimmed = raw.trim();
  if (ALLOWED_FONT_FAMILIES.has(trimmed)) {
    return trimmed;
  }
  if (!trimmed || trimmed.length > 64 || !/^[a-zA-Z0-9\s\-_]+$/.test(trimmed)) {
    return 'Noto Sans Myanmar';
  }
  return trimmed;
}

const ALLOWED_VIDEO_EXTS = new Set([
  '.mp4',
  '.mov',
  '.webm',
  '.mkv',
  '.avi',
  '.m4v',
  '.3gp',
  '.mpeg',
  '.mpg',
  '.ts',
  '.mts',
  '.flv',
  '.wmv',
]);

function inferVideoMimeType(filename: string, providedMime?: string): string {
  if (providedMime && providedMime.startsWith('video/')) {
    return providedMime;
  }
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    case '.mkv':
      return 'video/x-matroska';
    case '.avi':
      return 'video/x-msvideo';
    case '.m4v':
      return 'video/x-m4v';
    case '.3gp':
      return 'video/3gpp';
    case '.mpeg':
    case '.mpg':
      return 'video/mpeg';
    case '.ts':
    case '.mts':
      return 'video/mp2t';
    case '.flv':
      return 'video/x-flv';
    case '.wmv':
      return 'video/x-ms-wmv';
    default:
      return 'video/mp4';
  }
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
  const myanmarCount = (text.match(/[\u1000-\u104F]/g) || []).length;
  if (myanmarCount < 2) return false;
  const latinCount = (text.match(/[A-Za-z]/g) || []).length;
  return latinCount === 0 || myanmarCount >= latinCount * 0.5;
}

const modelCooldownUntil = new Map<GeminiModelId, number>();

function isDailyQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /PerDay|GenerateRequestsPerDay|RequestsPerDay|retry in \d+h/i.test(msg);
}

function isTransientGeminiError(err: unknown): boolean {
  if (isDailyQuotaError(err)) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return /429|503|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|timeout|ETIMEDOUT|ECONNRESET|fetch failed|EAI_AGAIN/i.test(
    msg
  );
}

function markModelUnavailable(model: GeminiModelId, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (isDailyQuotaError(err)) {
    modelCooldownUntil.set(model, Date.now() + 15 * 60_000);
  } else if (/503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded/i.test(msg)) {
    modelCooldownUntil.set(model, Date.now() + 45_000);
  }
}

function orderCandidateModels(preferred: GeminiModelId): GeminiModelId[] {
  const other: GeminiModelId =
    preferred === 'gemini-4-hydrogen' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';
  const now = Date.now();
  const prefCool = (modelCooldownUntil.get(preferred) ?? 0) > now;
  const otherCool = (modelCooldownUntil.get(other) ?? 0) > now;
  if (prefCool && !otherCool) {
    return [other, preferred];
  }
  return [preferred, other];
}

function formatGeminiErrorMessage(err: unknown, defaultMsg: string): string {
  const rawMsg = err instanceof Error ? err.message : String(err ?? '');
  if (/503|UNAVAILABLE|high demand|overloaded/i.test(rawMsg)) {
    return 'AI Server ယာယီအသုံးများနေပါသည် (503)။ စက္ကန့်အနည်းငယ်စောင့်ပြီး ထပ်မံကြိုးစားကြည့်ပါ။';
  }
  if (/403|PERMISSION_DENIED|API_KEY_INVALID|API key not valid/i.test(rawMsg)) {
    return 'Gemini API Key မမှန်ကန်ပါ သို့မဟုတ် ခွင့်ပြုချက်မရှိပါ။ Settings > Secrets တွင် စစ်ဆေးပေးပါ။';
  }
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(rawMsg)) {
    return 'AI အသုံးပြုမှု Limit ယာယီပြည့်နေပါသည် (429)။ ခေတ္တစောင့်ပြီး ထပ်မံကြိုးစားပေးပါ။';
  }
  if (/404|NOT_FOUND/i.test(rawMsg)) {
    return 'AI Model ချိတ်ဆက်မှု မတွေ့ပါ (404)။ ခေတ္တစောင့်ပြီး ထပ်မံကြိုးစားပေးပါ။';
  }
  if (/timeout|ETIMEDOUT|ECONNRESET|fetch failed|EAI_AGAIN/i.test(rawMsg)) {
    return 'AI Server ချိတ်ဆက်ချိန် ကြာမြင့်နေပါသည်။ အပိုင်းခွဲ၍ (သို့) ခေတ္တစောင့်ပြီး ထပ်မံကြိုးစားပေးပါ။';
  }
  const trimmed = rawMsg.trim();
  if (trimmed && !trimmed.startsWith('{') && trimmed.length < 280) {
    return trimmed;
  }
  return defaultMsg;
}

function getServerBuildVersion(): string {
  if (process.env.NODE_ENV !== 'production') {
    return 'dev';
  }
  const distDir = path.resolve(process.cwd(), 'dist');
  const versionJsonPath = path.join(distDir, 'version.json');
  try {
    if (fs.existsSync(versionJsonPath)) {
      const parsed = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8')) as {
        version?: string;
      };
      if (typeof parsed.version === 'string' && parsed.version.trim()) {
        return parsed.version.trim();
      }
    }
  } catch {
    // Fallback to index.html mtime
  }
  try {
    const indexPath = path.join(distDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      return `prod-${Math.round(fs.statSync(indexPath).mtimeMs).toString(36)}`;
    }
  } catch {
    // Ignore stat errors
  }
  return 'prod';
}

async function checkFfmpegAvailable(): Promise<boolean> {
  try {
    await execFileAsync(FFMPEG_BIN, ['-version']);
    return true;
  } catch {
    return false;
  }
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error(
      'GEMINI_API_KEY ကို Server တွင် မတွေ့ပါ။ Settings > Secrets တွင် ထည့်သွင်းပေးပါ။'
    );
  }
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function runFfmpeg(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (fs.existsSync(PORTABLE_FONTCONFIG_PATH)) {
      env.FONTCONFIG_FILE = PORTABLE_FONTCONFIG_PATH;
    }
    const child = spawn(FFMPEG_BIN, args, { cwd, shell: false, env });
    let stderr = '';

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 24000) {
        stderr = stderr.slice(-16000);
      }
    });

    child.on('error', (err) => {
      reject(new Error(`FFmpeg ဖွင့်၍မရပါ: ${err.message}`));
    });

    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        const lines = stderr
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        const summary = lines.slice(-14).join('\n');
        const reason = signal ? ` (signal: ${signal})` : code !== null ? ` (code: ${code})` : '';
        reject(new Error(`FFmpeg Error${reason}:\n${summary}`));
      }
    });
  });
}

async function probeVideoDimensions(
  filePath: string
): Promise<{ width: number; height: number; durationSec?: number } | null> {
  try {
    const { stdout } = await execFileAsync(FFPROBE_BIN, [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height,side_data_list:stream_tags=rotate:format=duration',
      '-of',
      'json',
      filePath,
    ]);
    const parsed = JSON.parse(stdout) as {
      streams?: Array<{
        width?: number;
        height?: number;
        tags?: { rotate?: string | number };
        side_data_list?: Array<{ rotation?: number }>;
      }>;
      format?: { duration?: string | number };
    };
    const stream = parsed.streams?.[0];
    const parsedDuration = parsed.format?.duration !== undefined ? Number(parsed.format.duration) : NaN;
    const durationSec =
      Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : undefined;
    if (
      stream &&
      typeof stream.width === 'number' &&
      stream.width > 1 &&
      typeof stream.height === 'number' &&
      stream.height > 1
    ) {
      const sideRot = stream.side_data_list?.find((s) => typeof s.rotation === 'number')?.rotation;
      const tagRot = stream.tags?.rotate !== undefined ? Number(stream.tags.rotate) : 0;
      const rot = Math.abs(Math.round(sideRot ?? tagRot ?? 0)) % 360;
      const swapped = rot === 90 || rot === 270;
      const rawW = swapped ? stream.height : stream.width;
      const rawH = swapped ? stream.width : stream.height;
      return {
        width: Math.floor(rawW / 2) * 2,
        height: Math.floor(rawH / 2) * 2,
        durationSec,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function findUploadedVideo(videoId: string): UploadedVideoRecord | null {
  const existing = uploadedVideos.get(videoId);
  if (existing && fs.existsSync(existing.filePath)) {
    return existing;
  }
  if (!/^[a-f0-9-]+$/i.test(videoId)) return null;
  const files = fs.readdirSync(UPLOADS_DIR);
  const match = files.find((f) => f.startsWith(`${videoId}.`));
  if (!match) return null;
  const filePath = path.join(UPLOADS_DIR, match);
  const stats = fs.statSync(filePath);
  const rec: UploadedVideoRecord = {
    videoId,
    filePath,
    originalName: `video${path.extname(match)}`,
    sizeBytes: stats.size,
    mimeType: inferVideoMimeType(match),
    createdAt: stats.mtimeMs,
  };
  uploadedVideos.set(videoId, rec);
  return rec;
}

function findRenderedOutput(renderId: string): RenderedOutputRecord | null {
  const existing = renderedOutputs.get(renderId);
  if (existing && fs.existsSync(existing.videoPath)) {
    return existing;
  }
  if (!/^[a-f0-9-]+$/i.test(renderId)) return null;
  const workDir = path.join(RENDERS_DIR, renderId);
  const videoPath = path.join(workDir, 'output_final.mp4');
  if (!fs.existsSync(videoPath)) return null;
  const srtCandidate = path.join(workDir, 'subs.srt');
  const srtPath = fs.existsSync(srtCandidate) ? srtCandidate : null;
  const stats = fs.statSync(videoPath);
  const rec: RenderedOutputRecord = {
    renderId,
    workDir,
    videoPath,
    srtPath,
    filename: 'output_graded.mp4',
    sizeBytes: stats.size,
    createdAt: stats.mtimeMs,
  };
  renderedOutputs.set(renderId, rec);
  return rec;
}

function inferImageMimeType(filename: string, providedMime?: string): string {
  if (providedMime && providedMime.startsWith('image/')) {
    return providedMime;
  }
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'image/png';
  }
}

function findUploadedLogo(logoId: string): UploadedLogoRecord | null {
  const existing = uploadedLogos.get(logoId);
  if (existing && fs.existsSync(existing.filePath)) {
    return existing;
  }
  if (!/^[a-f0-9-]+$/i.test(logoId)) return null;
  const files = fs.readdirSync(LOGOS_DIR);
  const match = files.find((f) => f.startsWith(`${logoId}.`));
  if (!match) return null;
  const filePath = path.join(LOGOS_DIR, match);
  const stats = fs.statSync(filePath);
  const rec: UploadedLogoRecord = {
    logoId,
    filePath,
    originalName: `logo${path.extname(match)}`,
    sizeBytes: stats.size,
    mimeType: inferImageMimeType(match),
    createdAt: stats.mtimeMs,
  };
  uploadedLogos.set(logoId, rec);
  return rec;
}

function findDownloadedVideo(downloadId: string): DownloadedVideoRecord | null {
  if (!/^[a-f0-9-]+$/i.test(downloadId)) return null;
  const existing = downloadedVideos.get(downloadId);
  if (existing && fs.existsSync(existing.filePath)) {
    return existing;
  }
  const workDir = path.join(DOWNLOADED_VIDEOS_DIR, downloadId);
  const resolvedBase = path.resolve(DOWNLOADED_VIDEOS_DIR) + path.sep;
  const resolvedWorkDir = path.resolve(workDir);
  if (!resolvedWorkDir.startsWith(resolvedBase) || !fs.existsSync(resolvedWorkDir)) {
    return null;
  }
  const files = fs.readdirSync(resolvedWorkDir);
  const mediaFile = files.find((f) => {
    const ext = path.extname(f).toLowerCase();
    return ext === '.mp4' || ext === '.mp3' || ext === '.webm' || ext === '.mkv' || ext === '.mov';
  });
  if (!mediaFile) return null;
  const filePath = path.resolve(resolvedWorkDir, mediaFile);
  if (!filePath.startsWith(resolvedWorkDir + path.sep)) return null;
  const stats = fs.statSync(filePath);
  const isAudioOnly = path.extname(mediaFile).toLowerCase() === '.mp3';
  const rec: DownloadedVideoRecord = {
    downloadId,
    workDir: resolvedWorkDir,
    filePath,
    filename: mediaFile,
    title: path.basename(mediaFile, path.extname(mediaFile)),
    platform: 'Downloaded',
    sizeBytes: stats.size,
    mimeType: isAudioOnly ? 'audio/mpeg' : inferVideoMimeType(mediaFile),
    qualityId: isAudioOnly ? 'audio_mp3' : 'best',
    isAudioOnly,
    createdAt: stats.mtimeMs,
  };
  downloadedVideos.set(downloadId, rec);
  return rec;
}

// Cleanup temporary files older than 4 hours (2 hours for downloaded links)
setInterval(() => {
  const now = Date.now();
  const cutoff = now - 4 * 60 * 60 * 1000;
  const dlCutoff = now - 2 * 60 * 60 * 1000;
  for (const [id, rec] of uploadedVideos.entries()) {
    if (rec.createdAt < cutoff) {
      fs.rmSync(rec.filePath, { force: true });
      uploadedVideos.delete(id);
    }
  }
  for (const [id, rec] of uploadedLogos.entries()) {
    if (rec.createdAt < cutoff) {
      fs.rmSync(rec.filePath, { force: true });
      uploadedLogos.delete(id);
    }
  }
  for (const [id, rec] of downloadedVideos.entries()) {
    if (rec.createdAt < dlCutoff) {
      fs.rmSync(rec.workDir, { recursive: true, force: true });
      downloadedVideos.delete(id);
    }
  }
  for (const [id, rec] of renderedOutputs.entries()) {
    if (rec.createdAt < cutoff) {
      fs.rmSync(rec.workDir, { recursive: true, force: true });
      renderedOutputs.delete(id);
    }
  }
}, 30 * 60 * 1000).unref();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const videoId = crypto.randomUUID();
      (req as express.Request & { generatedVideoId?: string }).generatedVideoId = videoId;
      const ext = path.extname(file.originalname) || '.mp4';
      const safeExt = /^[.a-zA-Z0-9]+$/.test(ext) ? ext : '.mp4';
      cb(null, `${videoId}${safeExt}`);
    },
  }),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isVideoExt = ALLOWED_VIDEO_EXTS.has(ext);
    if (file.mimetype.startsWith('video/') || isVideoExt) {
      cb(null, true);
    } else {
      cb(new Error('ဗီဒီယိုဖိုင် (MP4, MOV, WebM, MKV, 3GP, AVI) များသာ တင်ခွင့်ရှိပါသည်။'));
    }
  },
});

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, LOGOS_DIR),
    filename: (req, file, cb) => {
      const logoId = crypto.randomUUID();
      (req as express.Request & { generatedLogoId?: string }).generatedLogoId = logoId;
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)
        ? ext
        : '.png';
      cb(null, `${logoId}${safeExt}`);
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max for logo images
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isAllowedExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);
    const isAllowedMime = file.mimetype.startsWith('image/');
    if (isAllowedMime || isAllowedExt) {
      cb(null, true);
    } else {
      cb(new Error('Logo အတွက် PNG, JPG, WebP, GIF ပုံဖိုင်များသာ တင်ခွင့်ရှိပါသည်။'));
    }
  },
});

const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 16 * 1024 * 1024, // 16 MB per chunk
  },
});

async function getMediaDurationSec(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(FFPROBE_BIN, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const parsed = Number.parseFloat(stdout.trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

async function extractAudioForAi(
  videoPath: string,
  outMp3Path: string,
  normalizeAudio = false,
  vocalEnhance = false
): Promise<boolean> {
  try {
    const filters: string[] = [];
    if (vocalEnhance) {
      filters.push('highpass=f=110,lowpass=f=9000,equalizer=f=2800:t=q:w=1.2:g=4');
    }
    if (normalizeAudio || vocalEnhance) {
      filters.push('dynaudnorm=f=150:g=13');
    }
    const args = [
      '-y',
      '-i',
      videoPath,
      '-vn',
      ...(filters.length > 0 ? ['-af', filters.join(',')] : []),
      '-ac',
      vocalEnhance ? '1' : '2',
      '-ar',
      '24000',
      '-b:a',
      '128k',
      '-f',
      'mp3',
      outMp3Path,
    ];
    await runFfmpeg(args, path.dirname(outMp3Path));
    return fs.existsSync(outMp3Path) && fs.statSync(outMp3Path).size > 256;
  } catch {
    return false;
  }
}

async function extractAudioSegment(
  fullMp3Path: string,
  startSec: number,
  durationSec: number,
  outSegmentPath: string,
  normalizeAudio = false,
  vocalEnhance = false
): Promise<void> {
  const filters: string[] = [];
  if (vocalEnhance) {
    filters.push('highpass=f=110,lowpass=f=9000,equalizer=f=2800:t=q:w=1.2:g=4');
  }
  if (normalizeAudio || vocalEnhance) {
    filters.push('dynaudnorm=f=150:g=13');
  }
  await runFfmpeg(
    [
      '-y',
      '-ss',
      startSec.toFixed(3),
      '-t',
      durationSec.toFixed(3),
      '-i',
      fullMp3Path,
      ...(filters.length > 0 ? ['-af', filters.join(',')] : []),
      '-ac',
      vocalEnhance ? '1' : '2',
      '-ar',
      '24000',
      '-b:a',
      '128k',
      '-f',
      'mp3',
      outSegmentPath,
    ],
    path.dirname(outSegmentPath)
  );
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  if (fs.existsSync(BUNDLED_FONTS_DIR)) {
    app.use('/studio-fonts', express.static(BUNDLED_FONTS_DIR, { maxAge: '7d' }));
  }

  app.get('/api/version', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ version: getServerBuildVersion() });
  });

  app.get('/api/health', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const ffmpegAvailable = await checkFfmpegAvailable();
    const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
    res.json({
      ok: true,
      version: getServerBuildVersion(),
      ffmpegAvailable,
      geminiConfigured,
    });
  });

  app.get('/api/session-entry', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, '/');
  });

  // Self-destructing responder for any browser still polling legacy /dev-sw.js
  app.get('/dev-sw.js', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.send(`
      self.addEventListener('install', () => { self.skipWaiting(); });
      self.addEventListener('activate', (event) => {
        event.waitUntil((async () => {
          try {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          } catch {}
          try {
            await self.registration.unregister();
          } catch {}
          try {
            const clientList = await self.clients.matchAll({ type: 'window' });
            for (const client of clientList) {
              client.navigate(client.url);
            }
          } catch {}
        })());
      });
    `);
  });

  app.post('/api/videos/upload', upload.single('video'), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'ကျေးဇူးပြု၍ ဗီဒီယိုဖိုင် အရင်တင်ပေးပါ။' });
      return;
    }

    const videoId =
      (req as express.Request & { generatedVideoId?: string }).generatedVideoId ||
      crypto.randomUUID();
    const mimeType = inferVideoMimeType(req.file.originalname, req.file.mimetype);
    const record: UploadedVideoRecord = {
      videoId,
      filePath: req.file.path,
      originalName: req.file.originalname,
      sizeBytes: req.file.size,
      mimeType,
      createdAt: Date.now(),
    };
    uploadedVideos.set(videoId, record);

    res.json({
      videoId: record.videoId,
      filename: record.originalName,
      sizeBytes: record.sizeBytes,
      mimeType: record.mimeType,
    });
  });

  app.post('/api/logos/upload', logoUpload.single('logo'), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Logo ပုံဖိုင် အရင်ရွေးချယ်ပေးပါ။' });
      return;
    }

    const logoId =
      (req as express.Request & { generatedLogoId?: string }).generatedLogoId ||
      crypto.randomUUID();
    const mimeType = inferImageMimeType(req.file.originalname, req.file.mimetype);
    const record: UploadedLogoRecord = {
      logoId,
      filePath: req.file.path,
      originalName: req.file.originalname,
      sizeBytes: req.file.size,
      mimeType,
      createdAt: Date.now(),
    };
    uploadedLogos.set(logoId, record);

    res.json({
      logoId: record.logoId,
      filename: record.originalName,
      sizeBytes: record.sizeBytes,
      mimeType: record.mimeType,
    });
  });

  function processIncomingVideoChunk(
    params: {
      uploadId?: string;
      chunkIndex?: unknown;
      totalChunks?: unknown;
      filename?: string;
      mimeType?: string;
      buffer?: Buffer;
    },
    res: express.Response
  ) {
    const { uploadId, chunkIndex, totalChunks, filename, mimeType, buffer } = params;
    if (!buffer || buffer.length === 0) {
      res.status(400).json({ error: 'Chunk data missing.' });
      return;
    }

    if (!uploadId || !/^[a-f0-9-]+$/i.test(uploadId)) {
      res.status(400).json({ error: 'Invalid uploadId.' });
      return;
    }

    const idx = Number(chunkIndex);
    const total = Number(totalChunks);
    if (!Number.isInteger(idx) || !Number.isInteger(total) || idx < 0 || total < 1 || idx >= total) {
      res.status(400).json({ error: 'Invalid chunk index.' });
      return;
    }

    const originalName =
      typeof filename === 'string' && filename.trim() ? filename.trim() : 'video.mp4';
    const rawExt = path.extname(originalName).toLowerCase();
    const extFromMime =
      mimeType === 'video/quicktime'
        ? '.mov'
        : mimeType === 'video/webm'
        ? '.webm'
        : mimeType === 'video/x-matroska'
        ? '.mkv'
        : mimeType === 'video/3gpp'
        ? '.3gp'
        : mimeType === 'video/x-msvideo'
        ? '.avi'
        : '.mp4';
    const safeExt =
      ALLOWED_VIDEO_EXTS.has(rawExt) || /^[.a-zA-Z0-9]+$/.test(rawExt)
        ? rawExt || extFromMime
        : extFromMime;
    const partPath = path.join(UPLOADS_DIR, `${uploadId}.part_${idx}`);
    const destPath = path.join(UPLOADS_DIR, `${uploadId}${safeExt}`);

    // Idempotent per-chunk write so mobile retries never duplicate bytes
    fs.writeFileSync(partPath, buffer);

    if (idx === total - 1) {
      try {
        const partPaths: string[] = [];
        for (let i = 0; i < total; i++) {
          const p = path.join(UPLOADS_DIR, `${uploadId}.part_${i}`);
          if (!fs.existsSync(p)) {
            res.status(400).json({
              error: `Upload အပိုင်း (${i + 1}/${total}) ပျောက်ဆုံးနေပါသည်။ ပြန်တင်မည် (Retry) နှိပ်ပေးပါ။`,
            });
            return;
          }
          partPaths.push(p);
        }

        const outFd = fs.openSync(destPath, 'w');
        try {
          for (const p of partPaths) {
            const buf = fs.readFileSync(p);
            fs.writeSync(outFd, buf);
          }
        } finally {
          fs.closeSync(outFd);
        }

        for (const p of partPaths) {
          fs.rmSync(p, { force: true });
        }

        const stats = fs.statSync(destPath);
        if (stats.size > MAX_UPLOAD_BYTES) {
          fs.rmSync(destPath, { force: true });
          res.status(400).json({ error: 'ဗီဒီယိုဖိုင် 2 GB ထက် ကျော်လွန်နေပါသည်။' });
          return;
        }

        const resolvedMime = inferVideoMimeType(originalName, mimeType);
        const record: UploadedVideoRecord = {
          videoId: uploadId,
          filePath: destPath,
          originalName,
          sizeBytes: stats.size,
          mimeType: resolvedMime,
          createdAt: Date.now(),
        };
        uploadedVideos.set(uploadId, record);

        res.json({
          done: true,
          videoId: record.videoId,
          filename: record.originalName,
          sizeBytes: record.sizeBytes,
          mimeType: record.mimeType,
        });
        return;
      } catch (assembleErr) {
        res.status(500).json({
          error:
            assembleErr instanceof Error
              ? assembleErr.message
              : 'ဗီဒီယိုဖိုင် ပေါင်းစပ်ရာတွင် အမှားဖြစ်ပွားပါသည်။',
        });
        return;
      }
    }

    res.json({ done: false, chunkIndex: idx });
  }

  app.post('/api/videos/upload-chunk', chunkUpload.single('chunk'), (req, res) => {
    const { uploadId, chunkIndex, totalChunks, filename, mimeType } = req.body as {
      uploadId?: string;
      chunkIndex?: string;
      totalChunks?: string;
      filename?: string;
      mimeType?: string;
    };
    processIncomingVideoChunk(
      {
        uploadId,
        chunkIndex,
        totalChunks,
        filename,
        mimeType,
        buffer: req.file?.buffer,
      },
      res
    );
  });

  app.post(
    '/api/videos/upload-chunk-raw',
    express.raw({ type: 'application/octet-stream', limit: '2mb' }),
    (req, res) => {
      const q = req.query as {
        uploadId?: string;
        chunkIndex?: string;
        totalChunks?: string;
        filename?: string;
        mimeType?: string;
      };
      const buffer = Buffer.isBuffer(req.body) ? req.body : undefined;
      processIncomingVideoChunk(
        {
          uploadId: q.uploadId,
          chunkIndex: q.chunkIndex,
          totalChunks: q.totalChunks,
          filename: q.filename,
          mimeType: q.mimeType,
          buffer,
        },
        res
      );
    }
  );

  const translateCueBatch = async (
    ai: GoogleGenAI,
    candidateModels: GeminiModelId[],
    items: Array<{ idx: number; text: string }>,
    targetLanguage: 'burmese' | 'english',
    customPrompt?: string,
    throwOnTotalFailure = false
  ): Promise<Map<number, string>> => {
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
        const maxAttempts = hasFallback ? 2 : 2;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            const genPromise = ai.models.generateContent({
              model: candidate,
              contents: promptText,
              config: {
                ...(candidate === 'gemini-4-hydrogen'
                  ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                  : {}),
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    translations: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          idx: { type: Type.INTEGER },
                          translated: { type: Type.STRING },
                        },
                        required: ['idx', 'translated'],
                      },
                    },
                  },
                  required: ['translations'],
                },
              },
            });

            const response = await Promise.race([
              genPromise,
              new Promise<never>((_, reject) =>
                setTimeout(
                  () =>
                    reject(
                      new Error(`Translation model ${candidate} timeout after ${timeoutMs / 1000}s`)
                    ),
                  timeoutMs
                )
              ),
            ]);

            const parsed = safeParseJsonObject<{
              translations?: Array<{ idx: number; translated: string }>;
            }>(response.text);

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
            markModelUnavailable(candidate, batchErr);
            console.warn(
              `[translateCueBatch] ${candidate} (attempt ${attempt + 1}) failed:`,
              batchErr instanceof Error ? batchErr.message : String(batchErr)
            );
            if (attempt + 1 < maxAttempts && isTransientGeminiError(batchErr)) {
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

      // Recover any individual idx omitted by the model
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
      if (lastBatchError instanceof Error) {
        throw lastBatchError;
      }
      throw new Error('AI ဘာသာပြန်မှု မအောင်မြင်ပါ။ ခေတ္တစောင့်ပြီး ထပ်မံကြိုးစားပေးပါ။');
    }
    return resultMap;
  };

  const proofreadBurmeseLyricsText = async (
    ai: GoogleGenAI,
    candidateModels: GeminiModelId[],
    cues: SrtCue[],
    customPrompt?: string
  ): Promise<SrtCue[]> => {
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
          const res = await Promise.race([
            ai.models.generateContent({
              model: candidate,
              contents: promptText,
              config: {
                ...(candidate === 'gemini-4-hydrogen'
                  ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                  : {}),
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    corrections: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          idx: { type: Type.INTEGER },
                          text: { type: Type.STRING },
                        },
                        required: ['idx', 'text'],
                      },
                    },
                  },
                  required: ['corrections'],
                },
              },
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Burmese proofread timeout')), 45_000)
            ),
          ]);

          const parsed = safeParseJsonObject<{
            corrections?: Array<{ idx: number; text: string }>;
          }>(res.text);
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
        } catch (err) {
          markModelUnavailable(candidate, err);
          console.warn(
            `[proofreadBurmeseLyricsText] ${candidate} skipped:`,
            err instanceof Error ? err.message : String(err)
          );
        }
      }
    }

    if (updatedMap.size === 0) return cues;
    return cues.map((cue, idx) => ({
      ...cue,
      text: updatedMap.get(idx) ?? cue.text,
    }));
  };

  const ensureTargetLanguageCues = async (
    ai: GoogleGenAI,
    cues: SrtCue[],
    mode: SubtitleModeId,
    candidateModels: GeminiModelId[],
    customPrompt?: string,
    forceAll = false
  ): Promise<SrtCue[]> => {
    const cleaned = stripStageDirectionCues(cues);
    if (cleaned.length === 0) {
      return cleaned;
    }

    if (mode === 'burmese_to_burmese') {
      return await proofreadBurmeseLyricsText(ai, candidateModels, cleaned, customPrompt);
    }

    if (mode === 'english_to_burmese') {
      const toTranslate = cleaned
        .map((c, idx) => ({ idx, text: c.text }))
        .filter((item) => forceAll || !isPredominantlyMyanmar(item.text));

      if (toTranslate.length === 0) return cleaned;
      const translatedMap = await translateCueBatch(
        ai,
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
          const lines = c.text.split('\n').map((l) => l.trim()).filter(Boolean);
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
        ai,
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
        ai,
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
  };

  app.post('/api/subtitles/generate', async (req, res) => {
    req.setTimeout(0);
    res.setTimeout(0);

    const { videoId, mode, model, startSec, endSec, customPrompt } = req.body as {
      videoId?: string;
      mode?: SubtitleModeId;
      model?: GeminiModelId;
      startSec?: number;
      endSec?: number;
      customPrompt?: string;
    };

    const videoRecord = videoId ? findUploadedVideo(videoId) : null;
    if (!videoRecord) {
      res.status(400).json({ error: 'ကျေးဇူးပြု၍ ဗီဒီယိုဖိုင် အရင်တင်ပေးပါ။' });
      return;
    }

    const selectedMode: SubtitleModeId =
      mode && mode in SUBTITLE_INSTRUCTIONS ? mode : 'english_to_burmese';
    const selectedModel: GeminiModelId =
      model && ALLOWED_MODELS.has(model) ? model : 'gemini-4-hydrogen';
    const userCustomNote =
      typeof customPrompt === 'string' && customPrompt.trim()
        ? `\n\nUser Custom Instruction: ${customPrompt.trim()}`
        : '';
    const instruction = SUBTITLE_INSTRUCTIONS[selectedMode] + userCustomNote;

    let ai: GoogleGenAI;
    try {
      ai = createGeminiClient();
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gemini API Key configuration error.',
      });
      return;
    }

    const tempAiDir = fs.mkdtempSync(path.join(WORKSPACE_ROOT, 'ai_audio_'));
    const tempAudioPath = path.join(tempAiDir, 'audio.mp3');
    let uploadedFileName: string | null = null;

    const candidateModels = orderCandidateModels(selectedModel);

    const isBurmeseLyricsMode = selectedMode === 'burmese_to_burmese';

    const runModelWithFallback = async (
      contentsPayload: ReturnType<typeof createUserContent>
    ): Promise<{ text: string; usedModel: GeminiModelId; finishReason?: string }> => {
      let lastError: unknown = null;
      for (let i = 0; i < candidateModels.length; i++) {
        const candidate = candidateModels[i];
        const hasFallback = i < candidateModels.length - 1;
        const level =
          isBurmeseLyricsMode && candidate === 'gemini-4-hydrogen'
            ? ThinkingLevel.HIGH
            : ThinkingLevel.LOW;
        const timeoutMs =
          isBurmeseLyricsMode && candidate === 'gemini-4-hydrogen'
            ? hasFallback
              ? 65_000
              : 85_000
            : hasFallback
            ? 35_000
            : 55_000;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const genPromise = ai.models.generateContent({
              model: candidate,
              contents: contentsPayload,
              ...(candidate === 'gemini-4-hydrogen'
                ? {
                    config: {
                      thinkingConfig: {
                        thinkingLevel: level,
                      },
                    },
                  }
                : {}),
            });

            const response = await Promise.race([
              genPromise,
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error(`Model ${candidate} timeout after ${timeoutMs / 1000}s`)),
                  timeoutMs
                )
              ),
            ]);

            const finishReason = response.candidates?.[0]?.finishReason
              ? String(response.candidates[0].finishReason)
              : undefined;
            const responseText = (response.text ?? '').trim();
            if (!responseText) {
              console.warn(
                `[subtitles/generate] ${candidate} returned empty text (finishReason=${finishReason ?? 'UNKNOWN'})`
              );
              if (hasFallback) {
                break;
              }
            }

            return {
              text: responseText,
              usedModel: candidate,
              finishReason,
            };
          } catch (modelErr) {
            if (!lastError || !isDailyQuotaError(modelErr)) {
              lastError = modelErr;
            }
            markModelUnavailable(candidate, modelErr);
            console.warn(
              `[subtitles/generate] Model ${candidate} (attempt ${attempt + 1}) failed:`,
              modelErr instanceof Error ? modelErr.message : String(modelErr)
            );
            if (attempt === 0 && isTransientGeminiError(modelErr)) {
              await new Promise((r) => setTimeout(r, 1200));
              continue;
            }
            break;
          }
        }
      }
      throw lastError ?? new Error('AI request failed.');
    };

    const requestStartedAt = Date.now();
    const remainingBudgetMs = () => 235_000 - (Date.now() - requestStartedAt);

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
        const startSec = parseCueTime(item.start);
        if (startSec === null) continue;
        const endSecRaw = parseCueTime(item.end);
        const endSec =
          endSecRaw !== null ? Math.max(endSecRaw, startSec + 0.3) : startSec + 3.0;
        cues.push({
          index: cues.length + 1,
          startSec,
          endSec,
          startTimestamp: formatSecondsToSrt(startSec),
          endTimestamp: formatSecondsToSrt(endSec),
          text,
        });
      }
      return cues;
    };

    let lastUpstreamError: unknown = null;

    const runStructuredJsonFallback = async (
      mediaPart: Part,
      promptText: string,
      includeVisualHint = false
    ): Promise<{ cues: SrtCue[]; usedModel: GeminiModelId }> => {
      const jsonModels = orderCandidateModels(selectedModel);
      const jsonPrompt = includeVisualHint
        ? `This video may have silent, quiet, or visual on-screen lyrics. ` +
          `Inspect BOTH the video frames (read any on-screen lyrics, captions, or text shown on screen) AND any audible vocals, and output them in the JSON cues array.\n` +
          `Follow the target language & style requirements below:\n${promptText}\n\n` +
          `Format start and end timestamps as HH:MM:SS,mmm (for example 00:00:00,200 and 00:00:03,800). NEVER return an empty array if there is readable text or speech in the video.`
        : `${promptText}\n\n` +
          `Extract EVERY audible sung or spoken phrase in this media clip into the JSON cues array. ` +
          `Format start and end timestamps as HH:MM:SS,mmm (for example 00:00:02,500).`;

      for (const candidate of jsonModels) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const jsonPromise = ai.models.generateContent({
              model: candidate,
              contents: createUserContent([mediaPart, jsonPrompt]),
              config: {
                ...(candidate === 'gemini-4-hydrogen'
                  ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                  : {}),
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    cues: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          start: { type: Type.STRING },
                          end: { type: Type.STRING },
                          text: { type: Type.STRING },
                        },
                        required: ['start', 'end', 'text'],
                      },
                    },
                  },
                  required: ['cues'],
                },
              },
            });
            const response = await Promise.race([
              jsonPromise,
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error(`JSON fallback ${candidate} timeout after 55s`)),
                  55_000
                )
              ),
            ]);

            const finishReason = response.candidates?.[0]?.finishReason
              ? String(response.candidates[0].finishReason)
              : undefined;
            const cues = parseStructuredJsonCues(response.text ?? '');
            if (cues.length > 0) {
              return { cues, usedModel: candidate };
            }
            console.warn(
              `[subtitles/generate] JSON fallback (${candidate}) returned 0 cues (finishReason=${finishReason ?? 'UNKNOWN'})`
            );
            break;
          } catch (err) {
            if (!lastUpstreamError || !isDailyQuotaError(err)) {
              lastUpstreamError = err;
            }
            markModelUnavailable(candidate, err);
            console.warn(
              `[subtitles/generate] JSON fallback error (${candidate}, attempt ${attempt + 1}):`,
              err instanceof Error ? err.message : String(err)
            );
            if (attempt === 0 && isTransientGeminiError(err)) {
              await new Promise((r) => setTimeout(r, 1200));
              continue;
            }
            break;
          }
        }
      }
      return { cues: [], usedModel: jsonModels[0] };
    };

    const transcribePartToCues = async (
      mediaPart: Part,
      promptText: string,
      includeVisualHint = false
    ): Promise<{ cues: SrtCue[]; usedModel: GeminiModelId }> => {
      let tier1Text = '';
      let usedModel: GeminiModelId = selectedModel;

      const tier1Prompt = includeVisualHint
        ? `This video may have no audio or very quiet vocals. Read any on-screen text/lyrics shown in the video frames as well as any audio, and output valid SRT subtitles following these rules:\n\n${promptText}`
        : promptText;

      let tier1ApiError = false;
      try {
        const res1 = await runModelWithFallback(createUserContent([mediaPart, tier1Prompt]));
        tier1Text = res1.text;
        usedModel = res1.usedModel;
      } catch (err) {
        lastUpstreamError = err;
        tier1ApiError = true;
        console.warn(
          '[subtitles/generate] Tier 1 SRT failed:',
          err instanceof Error ? err.message : String(err)
        );
      }

      if (tier1ApiError) {
        return { cues: [], usedModel };
      }

      const cleaned = cleanSrtOutput(tier1Text);
      const parsedFromSrt = cleaned ? parseSrt(cleaned) : [];
      if (parsedFromSrt.length > 0) {
        return { cues: parsedFromSrt, usedModel };
      }

      // Check if model happened to output JSON directly
      if (cleaned.startsWith('{')) {
        const parsedJson = parseStructuredJsonCues(cleaned);
        if (parsedJson.length > 0) {
          return { cues: parsedJson, usedModel };
        }
      }

      // Tier 2: Automatic recovery with Structured JSON schema (only when Tier 1 answered without valid SRT)
      console.warn(
        `[subtitles/generate] Tier 1 returned 0 cues (rawLen=${cleaned.length}); running Tier 2 structured JSON fallback.`
      );
      return await runStructuredJsonFallback(mediaPart, promptText, includeVisualHint);
    };

    try {
      const hasAudio = await extractAudioForAi(
        videoRecord.filePath,
        tempAudioPath,
        false,
        isBurmeseLyricsMode
      );
      const totalDurationSec = await getMediaDurationSec(
        hasAudio ? tempAudioPath : videoRecord.filePath
      );

      const rangeStart =
        typeof startSec === 'number' && Number.isFinite(startSec)
          ? Math.max(0, startSec)
          : 0;
      if (totalDurationSec > 0 && rangeStart >= totalDurationSec) {
        res.status(400).json({
          error: 'ရွေးချယ်ထားသော စမည့်အချိန်သည် ဗီဒီယိုကြာချိန်ထက် ကျော်လွန်နေပါသည်။',
        });
        return;
      }

      const rawEnd =
        typeof endSec === 'number' && Number.isFinite(endSec) && endSec > 0
          ? endSec
          : totalDurationSec;
      const rangeEnd =
        totalDurationSec > 0 && rawEnd > 0
          ? Math.min(totalDurationSec, rawEnd)
          : rawEnd;

      if (rangeEnd > 0 && rangeEnd <= rangeStart) {
        res.status(400).json({
          error: 'ဆုံးမည့်အချိန်သည် စမည့်အချိန်ထက် ကြီးရပါမည်။',
        });
        return;
      }

      const targetDurationSec =
        rangeEnd > rangeStart ? rangeEnd - rangeStart : totalDurationSec;
      const isCustomRange =
        rangeStart > 0.5 ||
        (totalDurationSec > 0 && rangeEnd > 0 && rangeEnd < totalDurationSec - 0.5);

      let finalModel: GeminiModelId = selectedModel;
      let parsedCues: SrtCue[] = [];

      if (hasAudio && (targetDurationSec > 360 || isCustomRange)) {
        // Segment target window into 180s chunks (single call for normal songs <= 6 min)
        const CHUNK_SEC = 180;
        const effectiveDuration = Math.max(1, targetDurationSec);
        const segmentCount = Math.ceil(effectiveDuration / CHUNK_SEC);

        interface SegmentJob {
          segIdx: number;
          offsetSec: number;
          segDuration: number;
          segPath: string;
        }

        const jobs: SegmentJob[] = [];
        for (let segIdx = 0; segIdx < segmentCount; segIdx++) {
          const offsetSec = rangeStart + segIdx * CHUNK_SEC;
          const segDuration = Math.min(
            CHUNK_SEC,
            Math.max(1, effectiveDuration - segIdx * CHUNK_SEC)
          );
          const segPath = path.join(tempAiDir, `seg_${segIdx}.mp3`);
          await extractAudioSegment(tempAudioPath, offsetSec, segDuration, segPath);
          if (fs.existsSync(segPath) && fs.statSync(segPath).size >= 256) {
            jobs.push({ segIdx, offsetSec, segDuration, segPath });
          }
        }

        const segmentResults: SrtCue[][] = new Array(jobs.length);
        const CONCURRENCY = 2;
        for (let batchStart = 0; batchStart < jobs.length; batchStart += CONCURRENCY) {
          const batchJobs = jobs.slice(batchStart, batchStart + CONCURRENCY);
          await Promise.all(
            batchJobs.map(async (job, localIdx) => {
              const segEndTs = formatSecondsToSrt(job.segDuration);
              const segPrompt =
                `${instruction}\n\n` +
                `This audio clip is ${job.segDuration.toFixed(1)} seconds long (from 00:00:00,000 to ${segEndTs}), ` +
                `representing part ${job.segIdx + 1} of ${segmentCount}. ` +
                `Timestamps in your SRT output MUST start relative to this clip (00:00:00,000 to ${segEndTs}).`;

              const base64Data = fs.readFileSync(job.segPath).toString('base64');
              const { cues: segCues, usedModel } = await transcribePartToCues(
                {
                  inlineData: {
                    mimeType: 'audio/mpeg',
                    data: base64Data,
                  },
                },
                segPrompt
              );
              finalModel = usedModel;
              segmentResults[batchStart + localIdx] = shiftAndClampCues(
                segCues,
                job.offsetSec,
                job.segDuration
              );
            })
          );
        }

        const mergedCues: SrtCue[] = [];
        for (const shifted of segmentResults) {
          if (!shifted) continue;
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
      } else {
        // Full clip (<= 240s) or silent video fallback
        const mediaPath = hasAudio ? tempAudioPath : videoRecord.filePath;
        const mediaMime = hasAudio ? 'audio/mpeg' : videoRecord.mimeType;
        const mediaSize = fs.statSync(mediaPath).size;

        const durationHint =
          totalDurationSec > 0
            ? `\n\nThis audio is ${totalDurationSec.toFixed(1)} seconds long (00:00:00,000 to ${formatSecondsToSrt(totalDurationSec)}). Transcribe/translate all audible lyrics up to ${formatSecondsToSrt(totalDurationSec)}.`
            : '';

        let mediaPart: Part;
        if (mediaSize <= 15 * 1024 * 1024) {
          const base64Data = fs.readFileSync(mediaPath).toString('base64');
          mediaPart = {
            inlineData: {
              mimeType: mediaMime,
              data: base64Data,
            },
          };
        } else {
          let uploadedFile = await ai.files.upload({
            file: mediaPath,
            config: {
              mimeType: mediaMime,
            },
          });
          uploadedFileName = uploadedFile.name ?? null;

          const deadline = Date.now() + 300_000;
          while (uploadedFile.state === 'PROCESSING') {
            if (Date.now() >= deadline) {
              throw new Error('ဗီဒီယို Process လုပ်ချိန် ကျော်လွန်သွားပါပြီ။');
            }
            await new Promise((r) => setTimeout(r, 3000));
            if (!uploadedFile.name) {
              throw new Error('Uploaded file name missing from Gemini Files API.');
            }
            uploadedFile = await ai.files.get({ name: uploadedFile.name });
          }

          if (uploadedFile.state !== 'ACTIVE' || !uploadedFile.uri) {
            throw new Error(`Media upload failed with state: ${uploadedFile.state ?? 'UNKNOWN'}`);
          }

          mediaPart = createPartFromUri(uploadedFile.uri, uploadedFile.mimeType ?? mediaMime);
        }

        const { cues: clipCues, usedModel } = await transcribePartToCues(
          mediaPart,
          instruction + durationHint,
          !hasAudio
        );
        finalModel = usedModel;
        parsedCues = clipCues;
      }

      // Tier 2b: Loud-normalized audio + non-verbatim meaning/translation recovery (only if models are healthy)
      const modelsCurrentlyBlocked =
        lastUpstreamError !== null &&
        (isDailyQuotaError(lastUpstreamError) || isTransientGeminiError(lastUpstreamError));
      if (parsedCues.length === 0 && hasAudio && !modelsCurrentlyBlocked && remainingBudgetMs() > 25_000) {
        try {
          const normAudioPath = path.join(tempAiDir, 'norm_audio.mp3');
          let normReady = false;
          if (isCustomRange && targetDurationSec > 0) {
            await extractAudioSegment(
              tempAudioPath,
              rangeStart,
              Math.min(240, targetDurationSec),
              normAudioPath,
              true
            );
            normReady = fs.existsSync(normAudioPath) && fs.statSync(normAudioPath).size > 256;
          } else {
            normReady = await extractAudioForAi(videoRecord.filePath, normAudioPath, true);
          }

          if (normReady && fs.statSync(normAudioPath).size <= 15 * 1024 * 1024) {
            console.warn('[subtitles/generate] Running Tier 2b normalized-audio semantic recovery.');
            const normB64 = fs.readFileSync(normAudioPath).toString('base64');
            const semanticLangPrompt =
              selectedMode === 'burmese_to_english'
                ? 'Listen carefully to every sung or spoken phrase in this loud-normalized audio clip and paraphrase/translate its emotional meaning into concise English subtitle lines (1-2 lines each) with timestamps. Do NOT copy copyrighted source lyrics verbatim—output natural English meaning subtitles.'
                : selectedMode === 'burmese_to_burmese'
                  ? 'Listen carefully to every sung or spoken phrase in this loud-normalized audio clip and output concise Myanmar Unicode subtitle lines matching the timestamps.'
                  : 'Listen carefully to every sung or spoken phrase in this loud-normalized audio clip and express its meaning naturally in Burmese (Myanmar Unicode script — မြန်မာစာ, 1-2 short lines each) with accurate timestamps. Output ONLY translated Burmese meaning lines so every vocal phrase has a Burmese subtitle.';
            const tier2b = await runStructuredJsonFallback(
              { inlineData: { mimeType: 'audio/mpeg', data: normB64 } },
              semanticLangPrompt + userCustomNote,
              false
            );
            if (tier2b.cues.length > 0) {
              parsedCues = isCustomRange
                ? shiftAndClampCues(tier2b.cues, rangeStart, Math.min(240, targetDurationSec))
                : tier2b.cues;
              finalModel = tier2b.usedModel;
            }
          }
        } catch (tier2bErr) {
          console.warn(
            '[subtitles/generate] Tier 2b normalized recovery error:',
            tier2bErr instanceof Error ? tier2bErr.message : String(tier2bErr)
          );
        }
      }

      // Tier 2.5: Specialist speech/audio transcription model fallback if audio cues came back empty
      if (
        parsedCues.length === 0 &&
        hasAudio &&
        !isCustomRange &&
        remainingBudgetMs() > 25_000 &&
        fs.existsSync(tempAudioPath) &&
        fs.statSync(tempAudioPath).size <= 15 * 1024 * 1024
      ) {
        try {
          console.warn('[subtitles/generate] Running gemini-3.5-transcribe fallback on audio.');
          const audioB64 = fs.readFileSync(tempAudioPath).toString('base64');
          const transcribePrompt = isBurmeseLyricsMode
            ? `This is a Burmese (Myanmar language) song${userCustomNote ? ` (${customPrompt?.trim()})` : ''}. Listen carefully to the vocals and transcribe EVERY sung Burmese lyric accurately in standard Myanmar Unicode script (မြန်မာစာ) with SRT timestamps (HH:MM:SS,mmm --> HH:MM:SS,mmm). Never output Romanized Burmese.`
            : 'Transcribe every spoken or sung lyric with timestamps in valid SRT format (HH:MM:SS,mmm --> HH:MM:SS,mmm). If unsure of exact milliseconds, estimate timestamps across the audio duration.';
          const tRes = await Promise.race([
            ai.models.generateContent({
              model: 'gemini-3.5-transcribe',
              contents: {
                parts: [
                  { inlineData: { mimeType: 'audio/mpeg', data: audioB64 } },
                  {
                    text: transcribePrompt,
                  },
                ],
              },
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('gemini-3.5-transcribe timeout after 55s')), 55_000)
            ),
          ]);
          const tText = cleanSrtOutput(tRes.text ?? '');
          const tCues = tText ? parseSrt(tText) : [];
          if (tCues.length > 0) {
            parsedCues = tCues;
          } else if (tText) {
            const rawLines = tText
              .split(/\n+|(?<=[.!?။])\s+/)
              .map((l) => l.trim())
              .filter(Boolean);
            if (rawLines.length > 0) {
              const span = Math.max(2, (totalDurationSec || rawLines.length * 3) / rawLines.length);
              parsedCues = rawLines.map((line, i) => {
                const s = i * span;
                const e = Math.max(s + 0.5, (i + 1) * span);
                return {
                  index: i + 1,
                  startSec: s,
                  endSec: e,
                  startTimestamp: formatSecondsToSrt(s),
                  endTimestamp: formatSecondsToSrt(e),
                  text: line,
                };
              });
            }
          }
        } catch (transcribeErr) {
          lastUpstreamError = transcribeErr;
          console.warn(
            '[subtitles/generate] gemini-3.5-transcribe fallback error:',
            transcribeErr instanceof Error ? transcribeErr.message : String(transcribeErr)
          );
        }
      }

      // Tier 3: Direct video visual + audio analysis (transcoding to lightweight 480p 2fps clip if original > 18 MB)
      if (
        parsedCues.length === 0 &&
        hasAudio &&
        !isCustomRange &&
        !modelsCurrentlyBlocked &&
        remainingBudgetMs() > 35_000
      ) {
        console.warn('[subtitles/generate] Audio passes returned 0 cues; running Tier 3 direct video analysis.');
        let visualVideoPath = videoRecord.filePath;
        let visualVideoMime = videoRecord.mimeType;
        if (videoRecord.sizeBytes > 18 * 1024 * 1024) {
          const liteVideoPath = path.join(tempAiDir, 'lite_preview.mp4');
          try {
            await runFfmpeg(
              [
                '-y',
                '-i',
                videoRecord.filePath,
                '-vf',
                'scale=480:-2,fps=2',
                '-c:v',
                'libx264',
                '-preset',
                'ultrafast',
                '-crf',
                '32',
                '-c:a',
                'aac',
                '-b:a',
                '64k',
                liteVideoPath,
              ],
              tempAiDir
            );
            if (fs.existsSync(liteVideoPath) && fs.statSync(liteVideoPath).size <= 18 * 1024 * 1024) {
              visualVideoPath = liteVideoPath;
              visualVideoMime = 'video/mp4';
            }
          } catch {
            // Ignore lite transcode error
          }
        }

        if (fs.statSync(visualVideoPath).size <= 18 * 1024 * 1024) {
          const videoBase64 = fs.readFileSync(visualVideoPath).toString('base64');
          const tier3 = await runStructuredJsonFallback(
            {
              inlineData: {
                mimeType: visualVideoMime,
                data: videoBase64,
              },
            },
            instruction,
            true
          );
          if (tier3.cues.length > 0) {
            parsedCues = tier3.cues;
            finalModel = tier3.usedModel;
          }
        }
      }

      // Pass 2 (Audio-backed Burmese acoustic & orthography verification for burmese_to_burmese)
      let burmeseAudioVerified = false;
      if (
        isBurmeseLyricsMode &&
        parsedCues.length > 0 &&
        hasAudio &&
        !isCustomRange &&
        remainingBudgetMs() > 30_000 &&
        fs.existsSync(tempAudioPath) &&
        fs.statSync(tempAudioPath).size <= 15 * 1024 * 1024
      ) {
        const verifyModel = orderCandidateModels(selectedModel)[0];
        try {
          const audioB64 = fs.readFileSync(tempAudioPath).toString('base64');
          const draftItems = parsedCues.map((c, idx) => ({
            idx,
            time: `${c.startTimestamp} --> ${c.endTimestamp}`,
            draft: c.text,
          }));
          const verifyPrompt =
            `Listen closely to this Burmese (Myanmar) song audio again alongside the draft SRT lines below.${userCustomNote}\n` +
            `Your job is to verify and fix EVERY draft line so the Burmese song lyrics and Myanmar Unicode spelling (သတ်ပုံ) are 100% faithful to what the singer actually sings.\n` +
            `Rules:\n` +
            `- Fix any misheard words, phonetic errors (က/ခ, စ/ဆ, တ/ထ, ပ/ဖ, -တ်/-ပ်/-က်, -န်/-မ်, င်/ဉ်), Zawgyi-order mistakes, or Romanized/English errors.\n` +
            `- Keep the exact idx numbering and return concise 1-2 line Myanmar Unicode subtitles.\n\n` +
            JSON.stringify(draftItems);

          const verifyRes = await Promise.race([
            ai.models.generateContent({
              model: verifyModel,
              contents: createUserContent([
                { inlineData: { mimeType: 'audio/mpeg', data: audioB64 } },
                verifyPrompt,
              ]),
              config: {
                ...(verifyModel === 'gemini-4-hydrogen'
                  ? { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } }
                  : {}),
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    lines: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          idx: { type: Type.INTEGER },
                          text: { type: Type.STRING },
                        },
                        required: ['idx', 'text'],
                      },
                    },
                  },
                  required: ['lines'],
                },
              },
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Audio Burmese verification timeout')), 55_000)
            ),
          ]);

          const parsedVerify = safeParseJsonObject<{
            lines?: Array<{ idx: number; text: string }>;
          }>(verifyRes.text);
          if (Array.isArray(parsedVerify?.lines) && parsedVerify.lines.length > 0) {
            const fixedMap = new Map<number, string>();
            for (const item of parsedVerify.lines) {
              if (
                typeof item.idx === 'number' &&
                typeof item.text === 'string' &&
                item.text.trim() &&
                MYANMAR_SCRIPT_RE.test(item.text)
              ) {
                fixedMap.set(item.idx, item.text.trim());
              }
            }
            if (fixedMap.size > 0) {
              parsedCues = parsedCues.map((cue, idx) => ({
                ...cue,
                text: fixedMap.get(idx) ?? cue.text,
              }));
              burmeseAudioVerified = true;
            }
          }
        } catch (verifyErr) {
          markModelUnavailable(verifyModel, verifyErr);
          console.warn(
            '[subtitles/generate] Burmese audio verification pass skipped:',
            verifyErr instanceof Error ? verifyErr.message : String(verifyErr)
          );
        }
      }

      // Guarantee target language & Burmese spelling consistency on every cue
      const allCuesAlreadyMyanmar =
        isBurmeseLyricsMode &&
        parsedCues.length > 0 &&
        parsedCues.every((c) => isPredominantlyMyanmar(c.text));
      const verifiedCues =
        burmeseAudioVerified && allCuesAlreadyMyanmar
          ? stripStageDirectionCues(parsedCues)
          : await ensureTargetLanguageCues(
              ai,
              parsedCues,
              selectedMode,
              orderCandidateModels(selectedModel),
              customPrompt,
              false
            );

      if (verifiedCues.length === 0) {
        if (lastUpstreamError) {
          throw lastUpstreamError instanceof Error
            ? lastUpstreamError
            : new Error(String(lastUpstreamError));
        }
        throw new Error(
          isCustomRange
            ? 'ရွေးချယ်ထားသော အချိန်ပိုင်းတွင် သီချင်းစာသား မတွေ့ရှိပါ။'
            : 'သီချင်းစာသားများ မတွေ့ရှိပါ (သို့) AI ထံမှ စာတန်းမရရှိပါ။'
        );
      }

      const finalSrt = serializeSrt(verifiedCues);
      res.json({
        srt: finalSrt,
        model: finalModel,
        mode: selectedMode,
        cueCount: verifiedCues.length,
        rangeStartSec: rangeStart,
        rangeEndSec: rangeEnd,
      });
    } catch (err) {
      res.status(500).json({
        error: formatGeminiErrorMessage(
          err,
          'AI စာတန်းထုတ်ရာတွင် အမှားဖြစ်ပွားပါသည်။'
        ),
      });
    } finally {
      fs.rmSync(tempAiDir, { recursive: true, force: true });
      if (uploadedFileName) {
        try {
          await ai.files.delete({ name: uploadedFileName });
        } catch {
          // Ignore cleanup failure
        }
      }
    }
  });

  app.post('/api/subtitles/translate-srt', async (req, res) => {
    req.setTimeout(180_000);
    res.setTimeout(180_000);

    const { srtText, mode, model, customPrompt } = req.body as {
      srtText?: string;
      mode?: SubtitleModeId;
      model?: GeminiModelId;
      customPrompt?: string;
    };

    if (!srtText || !srtText.trim()) {
      res.status(400).json({ error: 'ဘာသာပြန်ရန် .srt စာတန်းများ အရင်ထည့်ပေးပါ။' });
      return;
    }

    const parsedCues = parseSrt(srtText);
    if (parsedCues.length === 0) {
      res.status(400).json({
        error:
          'စာတန်း Format မမှန်ပါ (Timestamp များ မတွေ့ပါ)။ ဥပမာ- 00:00:01,000 --> 00:00:04,500 ပုံစံဖြင့် ထည့်သွင်းပါ။',
      });
      return;
    }

    const selectedMode: SubtitleModeId =
      mode && mode in SUBTITLE_INSTRUCTIONS && mode !== 'burmese_to_burmese'
        ? mode
        : 'english_to_burmese';
    const selectedModel: GeminiModelId =
      model && ALLOWED_MODELS.has(model) ? model : 'gemini-4-hydrogen';
    const candidateModels = orderCandidateModels(selectedModel);

    let ai: GoogleGenAI;
    try {
      ai = createGeminiClient();
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gemini API Key configuration error.',
      });
      return;
    }

    try {
      const translatedCues = await ensureTargetLanguageCues(
        ai,
        parsedCues,
        selectedMode,
        candidateModels,
        customPrompt,
        true
      );
      res.json({
        srt: serializeSrt(translatedCues),
        model: candidateModels[0],
        mode: selectedMode,
        cueCount: translatedCues.length,
      });
    } catch (err) {
      res.status(500).json({
        error: formatGeminiErrorMessage(
          err,
          'AI ဘာသာပြန်ရာတွင် အမှားဖြစ်ပွားပါသည်။'
        ),
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Video Link Downloader (SSRF-hardened URL inspection, download & Studio load)
  // ---------------------------------------------------------------------------
  const MAX_DOWNLOAD_BYTES = 250 * 1024 * 1024; // 250 MB max downloaded link size
  const MAX_DOWNLOAD_RECORDS = 30;
  const ALLOWED_DOWNLOAD_QUALITIES = new Set<DownloadQualityId>([
    'best',
    '1080',
    '720',
    '480',
    'audio_mp3',
  ]);
  const DOWNLOADER_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  let ytDlpEnsurePromise: Promise<string> | null = null;

  async function ensureYtDlpBinary(): Promise<string> {
    if (ytDlpEnsurePromise) return ytDlpEnsurePromise;
    ytDlpEnsurePromise = (async () => {
      const candidates = [
        path.resolve(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp'),
        path.join(BIN_DIR, 'yt-dlp'),
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          try {
            fs.chmodSync(candidate, 0o755);
            await execFileAsync(candidate, ['--version'], { timeout: 8000 });
            return candidate;
          } catch {
            // Try next candidate
          }
        }
      }
      try {
        await execFileAsync('yt-dlp', ['--version'], { timeout: 8000 });
        return 'yt-dlp';
      } catch {
        // Fallback: download official yt-dlp Linux binary into BIN_DIR
      }

      const destBin = path.join(BIN_DIR, 'yt-dlp');
      const tmpBin = path.join(BIN_DIR, `yt-dlp.tmp.${crypto.randomUUID()}`);
      const releaseUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
      const resp = await fetch(releaseUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(45_000),
        headers: { 'User-Agent': DOWNLOADER_USER_AGENT },
      });
      if (!resp.ok || !resp.body) {
        throw new Error('Video Downloader engine ကို စတင်ပြင်ဆင်၍ မရပါ။');
      }
      const arrBuf = await resp.arrayBuffer();
      fs.writeFileSync(tmpBin, Buffer.from(arrBuf));
      fs.chmodSync(tmpBin, 0o755);
      fs.renameSync(tmpBin, destBin);
      return destBin;
    })().catch((err) => {
      ytDlpEnsurePromise = null;
      throw err;
    });
    return ytDlpEnsurePromise;
  }

  function isPrivateOrReservedIp(ipRaw: string): boolean {
    let ip = ipRaw.trim().toLowerCase();
    if (!ip) return true;
    // Strip IPv6 zone ID if present
    const pctIdx = ip.indexOf('%');
    if (pctIdx !== -1) ip = ip.slice(0, pctIdx);

    // Handle IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
    if (ip.startsWith('::ffff:')) {
      const mapped = ip.slice(7);
      if (net.isIPv4(mapped)) {
        ip = mapped;
      } else {
        const hexParts = mapped.split(':');
        if (hexParts.length === 2) {
          const hi = parseInt(hexParts[0], 16);
          const lo = parseInt(hexParts[1], 16);
          if (Number.isFinite(hi) && Number.isFinite(lo)) {
            ip = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
          } else {
            return true;
          }
        }
      }
    }

    if (net.isIPv4(ip)) {
      const octets = ip.split('.').map((n) => Number.parseInt(n, 10));
      if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) {
        return true;
      }
      const [a, b, c] = octets;
      if (a === 0) return true; // 0.0.0.0/8
      if (a === 10) return true; // 10.0.0.0/8
      if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
      if (a === 127) return true; // 127.0.0.0/8 loopback
      if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
      if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
      if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
      if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
      if (a === 192 && b === 168) return true; // 192.168.0.0/16
      if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
      if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
      if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
      if (a >= 224) return true; // multicast & reserved 224.0.0.0/4+
      return false;
    }

    if (net.isIPv6(ip)) {
      if (ip === '::' || ip === '::1') return true;
      if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // fc00::/7 ULA
      if (/^fe[89ab][0-9a-f]/i.test(ip) || ip.startsWith('fe80')) return true; // fe80::/10 link-local
      if (ip.startsWith('ff')) return true; // multicast
      if (ip.startsWith('2001:db8') || ip.startsWith('2001:0db8')) return true;
      return false;
    }

    return true;
  }

  function extractFirstHttpUrlFromInput(rawInput: string): string {
    const trimmed = rawInput.trim();
    const match = trimmed.match(/https?:\/\/[^\s<>"']+/i);
    if (!match) return trimmed;
    return match[0].replace(/[),.;!?'"\]]+$/g, '');
  }

  async function validateExternalVideoUrl(rawInput: unknown): Promise<string> {
    if (typeof rawInput !== 'string') {
      throw new Error('Video Link (URL) ထည့်သွင်းပေးပါ။');
    }
    const trimmed = extractFirstHttpUrlFromInput(rawInput);
    if (!trimmed || trimmed.length > 2048) {
      throw new Error('Video Link ပုံစံ မမှန်ကန်ပါ။');
    }
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error('Video Link (https://...) ပုံစံအတိုင်း မှန်ကန်စွာ ထည့်သွင်းပေးပါ။');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('http:// သို့မဟုတ် https:// Video Link များသာ အသုံးပြုနိုင်ပါသည်။');
    }
    if (parsed.username || parsed.password) {
      throw new Error('လုံခြုံရေးအရ Password ပါဝင်သော Link များ ခွင့်မပြုပါ။');
    }
    const allowedPorts = new Set(['', '80', '443', '8080', '8443']);
    if (!allowedPorts.has(parsed.port)) {
      throw new Error('ခွင့်ပြုမထားသော Port ပါဝင်နေသည့် Link ဖြစ်နေပါသည်။');
    }

    const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (
      hostname.startsWith('ais-dev-') ||
      hostname.startsWith('ais-pre-') ||
      hostname === 'aistudio.google.com'
    ) {
      throw new Error(
        'ဤ Link သည် Myanmar MV Studio App ၏ Link ဖြစ်နေပါသည်။ Video ဒေါင်းယူရန် TikTok / Facebook / Instagram / MP4 Video Link ကို ထည့်သွင်းပေးပါ။'
      );
    }
    if (
      !hostname ||
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname === 'metadata.google.internal' ||
      hostname === 'metadata'
    ) {
      throw new Error('Internal သို့မဟုတ် Local Network Link များကို ခွင့်မပြုပါ။');
    }

    if (net.isIP(hostname)) {
      if (isPrivateOrReservedIp(hostname)) {
        throw new Error('Private IP သို့မဟုတ် Internal Address များကို ခွင့်မပြုပါ။');
      }
      return parsed.toString();
    }

    let records: Array<{ address: string }>;
    try {
      records = await dns.lookup(hostname, { all: true });
    } catch {
      throw new Error('Link ၏ Domain ကို ချိတ်ဆက်၍ မရပါ။ URL မှန်/မမှန် စစ်ဆေးပေးပါ။');
    }
    if (!records || records.length === 0) {
      throw new Error('Link ၏ Domain ကို ရှာမတွေ့ပါ။');
    }
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        throw new Error('လုံခြုံရေးအရ ခွင့်မပြုသော Network Address ဖြစ်နေပါသည်။');
      }
    }
    return parsed.toString();
  }

  async function safeFetchExternal(
    initialUrl: string,
    method: 'HEAD' | 'GET',
    timeoutMs = 20_000,
    extraHeaders?: Record<string, string>
  ): Promise<{ response: Response; finalUrl: string }> {
    let currentUrl = await validateExternalVideoUrl(initialUrl);
    for (let hop = 0; hop < 6; hop++) {
      const response = await fetch(currentUrl, {
        method,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': DOWNLOADER_USER_AGENT,
          Accept: '*/*',
          ...(extraHeaders ?? {}),
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new Error('Redirect target မတွေ့ပါ။');
        }
        try {
          await response.body?.cancel();
        } catch {
          // Ignore cancel error
        }
        const resolvedNext = new URL(location, currentUrl).toString();
        currentUrl = await validateExternalVideoUrl(resolvedNext);
        continue;
      }
      return { response, finalUrl: currentUrl };
    }
    throw new Error('Redirect အကြိမ်ရေ များလွန်းနေပါသည်။');
  }

  function sanitizeHttpUrl(rawUrl: unknown): string | undefined {
    if (typeof rawUrl !== 'string') return undefined;
    try {
      const u = new URL(rawUrl.trim());
      if (u.protocol === 'https:' || u.protocol === 'http:') {
        return u.toString();
      }
    } catch {
      // Ignore invalid URL
    }
    return undefined;
  }

  function detectPlatformLabel(urlStr: string, extractor?: string): string {
    const ext = (extractor || '').toLowerCase();
    const host = (() => {
      try {
        return new URL(urlStr).hostname.toLowerCase();
      } catch {
        return '';
      }
    })();
    if (ext.includes('tiktok') || host.includes('tiktok.com')) return 'TikTok';
    if (ext.includes('facebook') || host.includes('facebook.com') || host.includes('fb.watch')) {
      return 'Facebook';
    }
    if (ext.includes('youtube') || host.includes('youtube.com') || host.includes('youtu.be')) {
      return 'YouTube';
    }
    if (ext.includes('instagram') || host.includes('instagram.com')) return 'Instagram';
    if (ext.includes('twitter') || host.includes('x.com') || host.includes('twitter.com')) {
      return 'X / Twitter';
    }
    return host.replace(/^www\./, '') || 'Video Link';
  }

  function formatDownloaderError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err ?? '');
    if (
      /Internal သို့မဟုတ်|Private IP|လုံခြုံရေးအရ|http:\/\/|Video Link|Domain|ခွင့်ပြုမထားသော Port|Myanmar MV Studio App/i.test(raw)
    ) {
      return raw;
    }
    if (/larger than max-filesize|exceeds.*250/i.test(raw)) {
      return 'Video ဖိုင်အရွယ်အစား 250 MB ထက် ကျော်လွန်နေပါသည်။ Quality လျှော့၍ (720p / 480p) ထပ်မံဒေါင်းကြည့်ပါ။';
    }
    if (/confirm you.?re not a bot|sign in to confirm/i.test(raw)) {
      return 'YouTube သည် Cloud Server များကို Bot စစ်ဆေးမှုဖြင့် ယာယီပိတ်ထားပါသည်။ TikTok / Facebook / Instagram / Direct MP4 Link များကို အသုံးပြုကြည့်ပါ။';
    }
    if (/private|sign in|login|cookies|members-only/i.test(raw)) {
      return 'ဤ Video သည် Private (သို့) Login လိုအပ်နေသော Link ဖြစ်ပါသည်။ Public ဖွင့်ထားသော Link ကို အသုံးပြုပေးပါ။';
    }
    if (/unsupported url/i.test(raw)) {
      return 'ဤ Link ထဲတွင် ဒေါင်းယူနိုင်သော Video မတွေ့ပါ (သို့) Platform ကို Support မလုပ်သေးပါ။';
    }
    if (/404|not found|unavailable|removed|deleted|geo/i.test(raw)) {
      return 'Video ကို ရှာမတွေ့ပါ (ဖျက်ထားခြင်း သို့မဟုတ် နိုင်ငံကန့်သတ်ချက် ရှိနေခြင်း ဖြစ်နိုင်ပါသည်)။';
    }
    if (/timeout|ETIMEDOUT|timed out|abort/i.test(raw)) {
      return 'Video Server ချိတ်ဆက်ချိန် ကြာမြင့်နေပါသည်။ ခေတ္တစောင့်ပြီး ထပ်မံကြိုးစားပေးပါ။';
    }
    return 'Video Link မှ ဆွဲယူရာတွင် အဆင်မပြေပါ။ Link မှန်ကန်မှု နှင့် Public Video ဟုတ်/မဟုတ် စစ်ဆေးပေးပါ။';
  }

  function makeSafeAsciiStem(title: string, fallback = 'downloaded_video'): string {
    const cleaned = title
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48);
    return cleaned || fallback;
  }

  async function tryProbeDirectVideoHead(urlStr: string): Promise<{
    isDirectVideo: boolean;
    finalUrl: string;
    contentType: string;
    contentLength: number;
  }> {
    try {
      let { response, finalUrl } = await safeFetchExternal(urlStr, 'HEAD', 10_000);
      try {
        await response.body?.cancel();
      } catch {
        // Ignore
      }
      if (response.status === 405 || response.status === 403) {
        const ranged = await safeFetchExternal(urlStr, 'GET', 10_000, {
          Range: 'bytes=0-0',
        });
        response = ranged.response;
        finalUrl = ranged.finalUrl;
        try {
          await response.body?.cancel();
        } catch {
          // Ignore
        }
      }
      if (!response.ok && response.status !== 206) {
        return { isDirectVideo: false, finalUrl, contentType: '', contentLength: 0 };
      }
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      const contentRange = response.headers.get('content-range') || '';
      const rangeTotalMatch = contentRange.match(/\/(\d+)$/);
      const contentLength = rangeTotalMatch
        ? Number.parseInt(rangeTotalMatch[1], 10) || 0
        : Number.parseInt(response.headers.get('content-length') || '0', 10) || 0;
      const ext = path.extname(new URL(finalUrl).pathname).toLowerCase();
      const isDirectVideo =
        contentType.startsWith('video/') ||
        (contentType.includes('octet-stream') && ALLOWED_VIDEO_EXTS.has(ext));
      return { isDirectVideo, finalUrl, contentType, contentLength };
    } catch {
      return { isDirectVideo: false, finalUrl: urlStr, contentType: '', contentLength: 0 };
    }
  }

  function isYouTubeHostUrl(urlStr: string): boolean {
    try {
      const h = new URL(urlStr).hostname.toLowerCase();
      return h.includes('youtube.com') || h.includes('youtu.be');
    } catch {
      return false;
    }
  }

  function isTikTokHostUrl(urlStr: string): boolean {
    try {
      const h = new URL(urlStr).hostname.toLowerCase();
      return h === 'tiktok.com' || h.endsWith('.tiktok.com');
    } catch {
      return false;
    }
  }

  function isFacebookHostUrl(urlStr: string): boolean {
    try {
      const h = new URL(urlStr).hostname.toLowerCase();
      return (
        h === 'facebook.com' ||
        h.endsWith('.facebook.com') ||
        h === 'fb.watch' ||
        h.endsWith('.fb.watch') ||
        h === 'fb.com' ||
        h.endsWith('.fb.com')
      );
    } catch {
      return false;
    }
  }

  function decodeJsonEscapedUrl(raw: string): string {
    return raw
      .replace(/\\\//g, '/')
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16))
      )
      .replace(/&amp;/g, '&');
  }

  function decodeHtmlEntitiesBasic(raw: string): string {
    return raw
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#039;|&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  interface FacebookDirectMeta {
    finalUrl: string;
    title: string;
    thumbnailUrl?: string;
    hdVideoUrl?: string;
    sdVideoUrl?: string;
  }

  async function tryFetchFacebookDirectMeta(fbUrl: string): Promise<FacebookDirectMeta | null> {
    try {
      const { response, finalUrl } = await safeFetchExternal(fbUrl, 'GET', 18_000, {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Mode': 'navigate',
      });
      if (!response.ok) return null;
      const ct = (response.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('text/html') && !ct.includes('application/xhtml')) {
        try {
          await response.body?.cancel();
        } catch {
          // ignore
        }
        return null;
      }

      const rawHtml = await response.text();
      const html = rawHtml.length > 3_000_000 ? rawHtml.slice(0, 3_000_000) : rawHtml;

      const hdMatch =
        html.match(/"browser_native_hd_url"\s*:\s*"([^"]+)"/) ||
        html.match(/"playable_url_quality_hd"\s*:\s*"([^"]+)"/) ||
        html.match(/"hd_src(?:_no_ratelimit)?"\s*:\s*"([^"]+)"/);
      const sdMatch =
        html.match(/"browser_native_sd_url"\s*:\s*"([^"]+)"/) ||
        html.match(/"playable_url"\s*:\s*"([^"]+)"/) ||
        html.match(/"sd_src(?:_no_ratelimit)?"\s*:\s*"([^"]+)"/) ||
        html.match(/<meta[^>]+property="og:video(?::url|:secure_url)?"[^>]+content="([^"]+)"/i);

      const hdVideoUrl = hdMatch?.[1] ? sanitizeHttpUrl(decodeJsonEscapedUrl(hdMatch[1])) : undefined;
      const sdVideoUrl = sdMatch?.[1] ? sanitizeHttpUrl(decodeJsonEscapedUrl(sdMatch[1])) : undefined;

      const ogTitle =
        html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1] ||
        html.match(/<title>([^<]+)<\/title>/i)?.[1] ||
        'Facebook Video';
      const ogImage =
        html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1];

      return {
        finalUrl,
        title: decodeHtmlEntitiesBasic(ogTitle).trim() || 'Facebook Video',
        thumbnailUrl: ogImage ? sanitizeHttpUrl(decodeHtmlEntitiesBasic(ogImage)) : undefined,
        hdVideoUrl,
        sdVideoUrl,
      };
    } catch {
      return null;
    }
  }

  interface TikWmResult {
    title: string;
    durationSec?: number;
    coverUrl?: string;
    uploader?: string;
    videoUrl?: string;
    hdVideoUrl?: string;
    musicUrl?: string;
  }

  async function tryFetchTikWm(tiktokUrl: string): Promise<TikWmResult | null> {
    try {
      const resp = await fetch(
        `https://www.tikwm.com/api/?url=${encodeURIComponent(tiktokUrl)}&hd=1`,
        {
          headers: { 'User-Agent': DOWNLOADER_USER_AGENT },
          signal: AbortSignal.timeout(15_000),
        }
      );
      if (!resp.ok) return null;
      const json = (await resp.json()) as {
        code?: number;
        data?: {
          title?: string;
          duration?: number;
          cover?: string;
          author?: { nickname?: string; unique_id?: string };
          play?: string;
          hdplay?: string;
          music?: string;
        };
      };
      if (json.code !== 0 || !json.data) return null;
      return {
        title: (json.data.title || '').trim() || 'TikTok Video',
        durationSec:
          typeof json.data.duration === 'number' && json.data.duration > 0
            ? json.data.duration
            : undefined,
        coverUrl: sanitizeHttpUrl(json.data.cover),
        uploader:
          json.data.author?.nickname || json.data.author?.unique_id || undefined,
        videoUrl: sanitizeHttpUrl(json.data.play),
        hdVideoUrl: sanitizeHttpUrl(json.data.hdplay),
        musicUrl: sanitizeHttpUrl(json.data.music),
      };
    } catch {
      return null;
    }
  }

  async function streamExternalUrlToFile(
    rawExternalUrl: string,
    destPath: string,
    timeoutMs = 120_000
  ): Promise<void> {
    const { response } = await safeFetchExternal(rawExternalUrl, 'GET', timeoutMs);
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }
    const len = Number.parseInt(response.headers.get('content-length') || '0', 10) || 0;
    if (len > MAX_DOWNLOAD_BYTES) {
      throw new Error('File is larger than max-filesize (250M)');
    }
    const writer = fs.createWriteStream(destPath);
    let receivedBytes = 0;
    try {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          receivedBytes += value.byteLength;
          if (receivedBytes > MAX_DOWNLOAD_BYTES) {
            writer.destroy();
            throw new Error('File is larger than max-filesize (250M)');
          }
          writer.write(Buffer.from(value));
        }
      }
      await new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
        writer.end();
      });
    } catch (streamErr) {
      writer.destroy();
      throw streamErr;
    }
  }

  function runYtDlp(args: string[], cwd: string, timeoutMs = 150_000): Promise<string> {
    return ensureYtDlpBinary().then(
      (binPath) =>
        new Promise((resolve, reject) => {
          const child = spawn(binPath, args, { cwd, shell: false });
          let stdout = '';
          let stderr = '';
          let finished = false;
          const timer = setTimeout(() => {
            if (!finished) {
              finished = true;
              child.kill('SIGKILL');
              reject(new Error('yt-dlp timed out'));
            }
          }, timeoutMs);

          child.stdout.on('data', (chunk: Buffer) => {
            stdout += chunk.toString('utf8');
            if (stdout.length > 512_000) {
              stdout = stdout.slice(-256_000);
            }
          });
          child.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString('utf8');
            if (stderr.length > 64_000) {
              stderr = stderr.slice(-32_000);
            }
          });
          child.on('error', (err) => {
            clearTimeout(timer);
            if (!finished) {
              finished = true;
              reject(err);
            }
          });
          child.on('close', (code) => {
            clearTimeout(timer);
            if (finished) return;
            finished = true;
            if (code === 0) {
              resolve(stdout);
            } else {
              reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
            }
          });
        })
    );
  }

  app.post('/api/video-downloader/inspect', async (req, res) => {
    const { url } = req.body as { url?: string };
    let validatedUrl: string;
    try {
      validatedUrl = await validateExternalVideoUrl(url);
    } catch (err) {
      res.status(400).json({ error: formatDownloaderError(err) });
      return;
    }

    try {
      const headInfo = await tryProbeDirectVideoHead(validatedUrl);
      if (headInfo.isDirectVideo) {
        const u = new URL(headInfo.finalUrl);
        const rawName = decodeURIComponent(path.basename(u.pathname) || 'video.mp4');
        res.json({
          url: validatedUrl,
          title: rawName || 'Direct Video File',
          platform: 'Direct Video',
          uploader: u.hostname.replace(/^www\./, ''),
          isDirectFile: true,
        });
        return;
      }

      const isTikTok = isTikTokHostUrl(validatedUrl);
      const isFacebook = isFacebookHostUrl(validatedUrl);
      const cookiesPath = process.env.YTDLP_COOKIES_PATH?.trim();
      const baseInspectArgs = [
        '--dump-single-json',
        '--skip-download',
        '--no-warnings',
        '--no-playlist',
        '--no-exec',
        '--no-config',
        '--geo-bypass',
        '--retries',
        '3',
        '--extractor-retries',
        '3',
        '--js-runtimes',
        `node:${process.execPath}`,
        '--socket-timeout',
        '20',
        '--user-agent',
        DOWNLOADER_USER_AGENT,
        ...(cookiesPath && fs.existsSync(cookiesPath) ? ['--cookies', cookiesPath] : []),
        ...(isFacebook
          ? [
              '--add-header',
              'Accept-Language:en-US,en;q=0.9',
              '--add-header',
              'Referer:https://www.facebook.com/',
            ]
          : []),
        ...(isTikTok
          ? ['--extractor-args', 'tiktok:api_hostname=api16-normal-c-useast1a.tiktokv.com']
          : []),
      ];

      let stdout = '';
      let ytDlpInspectFailed: unknown = null;
      let fbDirectMeta: FacebookDirectMeta | null = null;
      try {
        stdout = await runYtDlp(
          [...baseInspectArgs, '--', validatedUrl],
          DOWNLOADED_VIDEOS_DIR,
          isTikTok ? 22_000 : 35_000
        );
      } catch (firstInspectErr) {
        const msg = firstInspectErr instanceof Error ? firstInspectErr.message : '';
        if (isTikTok) {
          try {
            stdout = await runYtDlp(
              [
                ...baseInspectArgs.filter(
                  (a) => a !== '--extractor-args' && !a.startsWith('tiktok:')
                ),
                '--extractor-args',
                'tiktok:api_hostname=api22-normal-c-useast1a.tiktokv.com',
                '--',
                validatedUrl,
              ],
              DOWNLOADED_VIDEOS_DIR,
              22_000
            );
          } catch (ttSecondErr) {
            ytDlpInspectFailed = ttSecondErr;
          }
        } else if (isFacebook) {
          fbDirectMeta = await tryFetchFacebookDirectMeta(validatedUrl);
          if (
            fbDirectMeta?.finalUrl &&
            fbDirectMeta.finalUrl !== validatedUrl &&
            !fbDirectMeta.finalUrl.includes('/login')
          ) {
            try {
              stdout = await runYtDlp(
                [...baseInspectArgs, '--', fbDirectMeta.finalUrl],
                DOWNLOADED_VIDEOS_DIR,
                25_000
              );
              fbDirectMeta = null;
            } catch (fbSecondErr) {
              ytDlpInspectFailed = fbSecondErr;
            }
          } else {
            ytDlpInspectFailed = firstInspectErr;
          }
        } else if (
          isYouTubeHostUrl(validatedUrl) &&
          /bot|sign in|403|forbidden|cookies/i.test(msg)
        ) {
          stdout = await runYtDlp(
            [
              ...baseInspectArgs,
              '-4',
              '--extractor-args',
              'youtube:player_client=tv,android_vr,ios,mweb',
              '--',
              validatedUrl,
            ],
            DOWNLOADED_VIDEOS_DIR,
            30_000
          );
        } else {
          throw firstInspectErr;
        }
      }

      if (ytDlpInspectFailed && isTikTok) {
        const tikwm = await tryFetchTikWm(validatedUrl);
        if (tikwm) {
          res.json({
            url: validatedUrl,
            title: tikwm.title,
            platform: 'TikTok',
            durationSec: tikwm.durationSec,
            thumbnailUrl: tikwm.coverUrl,
            uploader: tikwm.uploader,
            isDirectFile: false,
          });
          return;
        }
        throw ytDlpInspectFailed;
      }

      if (ytDlpInspectFailed && isFacebook) {
        if (fbDirectMeta && (fbDirectMeta.hdVideoUrl || fbDirectMeta.sdVideoUrl)) {
          res.json({
            url: validatedUrl,
            title: fbDirectMeta.title,
            platform: 'Facebook',
            thumbnailUrl: fbDirectMeta.thumbnailUrl,
            isDirectFile: false,
          });
          return;
        }
        throw ytDlpInspectFailed;
      }

      const meta = safeParseJsonObject<{
        title?: string;
        fulltitle?: string;
        duration?: number;
        thumbnail?: string;
        uploader?: string;
        channel?: string;
        extractor_key?: string;
        extractor?: string;
      }>(stdout);

      if (!meta) {
        throw new Error('Unsupported URL');
      }

      const title =
        (typeof meta.title === 'string' && meta.title.trim()) ||
        (typeof meta.fulltitle === 'string' && meta.fulltitle.trim()) ||
        'Video';
      const durationSec =
        typeof meta.duration === 'number' && Number.isFinite(meta.duration) && meta.duration > 0
          ? Number(meta.duration.toFixed(1))
          : undefined;
      const uploader =
        (typeof meta.uploader === 'string' && meta.uploader.trim()) ||
        (typeof meta.channel === 'string' && meta.channel.trim()) ||
        undefined;

      res.json({
        url: validatedUrl,
        title,
        platform: detectPlatformLabel(validatedUrl, meta.extractor_key || meta.extractor),
        durationSec,
        thumbnailUrl: sanitizeHttpUrl(meta.thumbnail),
        uploader,
        isDirectFile: false,
      });
    } catch (err) {
      res.status(400).json({ error: formatDownloaderError(err) });
    }
  });

  app.post('/api/video-downloader/download', async (req, res) => {
    req.setTimeout(0);
    res.setTimeout(0);

    const { url, quality } = req.body as {
      url?: string;
      quality?: DownloadQualityId;
    };

    let validatedUrl: string;
    try {
      validatedUrl = await validateExternalVideoUrl(url);
    } catch (err) {
      res.status(400).json({ error: formatDownloaderError(err) });
      return;
    }

    const selectedQuality: DownloadQualityId =
      quality && ALLOWED_DOWNLOAD_QUALITIES.has(quality) ? quality : 'best';
    const isAudioOnly = selectedQuality === 'audio_mp3';

    const downloadId = crypto.randomUUID();
    const workDir = path.join(DOWNLOADED_VIDEOS_DIR, downloadId);
    const resolvedBase = path.resolve(DOWNLOADED_VIDEOS_DIR) + path.sep;
    const resolvedWorkDir = path.resolve(workDir);
    if (!resolvedWorkDir.startsWith(resolvedBase)) {
      res.status(400).json({ error: 'Invalid download directory.' });
      return;
    }
    fs.mkdirSync(resolvedWorkDir, { recursive: true });

    try {
      const headInfo = !isAudioOnly
        ? await tryProbeDirectVideoHead(validatedUrl)
        : { isDirectVideo: false, finalUrl: validatedUrl, contentType: '', contentLength: 0 };

      let finalFilePath = '';
      let title = 'Video';
      let platform = detectPlatformLabel(validatedUrl);
      let durationSec = 0;

      if (headInfo.isDirectVideo) {
        if (headInfo.contentLength > MAX_DOWNLOAD_BYTES) {
          throw new Error('File is larger than max-filesize (250M)');
        }
        const { response, finalUrl } = await safeFetchExternal(headInfo.finalUrl, 'GET', 120_000);
        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }
        const u = new URL(finalUrl);
        const rawName = decodeURIComponent(path.basename(u.pathname) || 'video.mp4');
        const ext = ALLOWED_VIDEO_EXTS.has(path.extname(rawName).toLowerCase())
          ? path.extname(rawName).toLowerCase()
          : '.mp4';
        title = path.basename(rawName, path.extname(rawName)) || 'Direct Video';
        platform = 'Direct Video';

        finalFilePath = path.join(resolvedWorkDir, `media${ext}`);
        const writer = fs.createWriteStream(finalFilePath);
        let receivedBytes = 0;
        try {
          const reader = response.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              receivedBytes += value.byteLength;
              if (receivedBytes > MAX_DOWNLOAD_BYTES) {
                writer.destroy();
                throw new Error('File is larger than max-filesize (250M)');
              }
              writer.write(Buffer.from(value));
            }
          }
          await new Promise<void>((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
            writer.end();
          });
        } catch (streamErr) {
          writer.destroy();
          throw streamErr;
        }
      } else {
        const formatSelector =
          selectedQuality === '1080'
            ? 'bv*[vcodec^=avc][height<=1080][ext=mp4]+ba[ext=m4a]/b[vcodec^=avc][height<=1080][ext=mp4]/bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b[height<=1080]/b'
            : selectedQuality === '720'
            ? 'bv*[vcodec^=avc][height<=720][ext=mp4]+ba[ext=m4a]/b[vcodec^=avc][height<=720][ext=mp4]/bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/bv*[height<=720]+ba/b[height<=720]/b'
            : selectedQuality === '480'
            ? 'bv*[vcodec^=avc][height<=480][ext=mp4]+ba[ext=m4a]/b[vcodec^=avc][height<=480][ext=mp4]/bv*[height<=480][ext=mp4]+ba[ext=m4a]/b[height<=480][ext=mp4]/bv*[height<=480]+ba/b[height<=480]/b'
            : 'bv*[vcodec^=avc][ext=mp4]+ba[ext=m4a]/b[vcodec^=avc][ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b';

        const isTikTok = isTikTokHostUrl(validatedUrl);
        const isFacebook = isFacebookHostUrl(validatedUrl);
        const cookiesPath = process.env.YTDLP_COOKIES_PATH?.trim();
        const ytArgs: string[] = [
          '--no-warnings',
          '--no-playlist',
          '--no-exec',
          '--no-config',
          '--geo-bypass',
          '--retries',
          '3',
          '--fragment-retries',
          '3',
          '--extractor-retries',
          '3',
          '--js-runtimes',
          `node:${process.execPath}`,
          '--max-filesize',
          '250M',
          '--socket-timeout',
          '25',
          '--user-agent',
          DOWNLOADER_USER_AGENT,
          '--print-json',
          '--ffmpeg-location',
          FFMPEG_BIN === 'ffmpeg' ? 'ffmpeg' : path.dirname(FFMPEG_BIN),
          ...(cookiesPath && fs.existsSync(cookiesPath) ? ['--cookies', cookiesPath] : []),
          ...(isFacebook
            ? [
                '--add-header',
                'Accept-Language:en-US,en;q=0.9',
                '--add-header',
                'Referer:https://www.facebook.com/',
              ]
            : []),
          ...(isTikTok
            ? ['--extractor-args', 'tiktok:api_hostname=api16-normal-c-useast1a.tiktokv.com']
            : []),
          ...(isAudioOnly
            ? ['-x', '--audio-format', 'mp3', '--audio-quality', '192K']
            : ['-f', formatSelector, '--merge-output-format', 'mp4']),
          '-o',
          path.join(resolvedWorkDir, 'media.%(ext)s'),
        ];

        let stdout = '';
        let usedDirectStreamFallback = false;
        try {
          stdout = await runYtDlp(
            [...ytArgs, '--', validatedUrl],
            resolvedWorkDir,
            isTikTok ? 90_000 : 180_000
          );
        } catch (firstDlErr) {
          const msg = firstDlErr instanceof Error ? firstDlErr.message : '';
          if (isTikTok) {
            try {
              stdout = await runYtDlp(
                [
                  ...ytArgs.filter(
                    (a) => a !== '--extractor-args' && !a.startsWith('tiktok:')
                  ),
                  '--extractor-args',
                  'tiktok:api_hostname=api22-normal-c-useast1a.tiktokv.com',
                  '--',
                  validatedUrl,
                ],
                resolvedWorkDir,
                90_000
              );
            } catch (ttSecondErr) {
              const tikwm = await tryFetchTikWm(validatedUrl);
              const targetMediaUrl = isAudioOnly
                ? tikwm?.musicUrl || tikwm?.videoUrl
                : selectedQuality === 'best' || selectedQuality === '1080'
                ? tikwm?.hdVideoUrl || tikwm?.videoUrl
                : tikwm?.videoUrl;
              if (!tikwm || !targetMediaUrl) {
                throw ttSecondErr;
              }
              title = tikwm.title;
              platform = 'TikTok';
              durationSec = tikwm.durationSec ?? 0;
              if (isAudioOnly) {
                const rawPath = path.join(resolvedWorkDir, 'tikwm_raw.media');
                await streamExternalUrlToFile(targetMediaUrl, rawPath, 120_000);
                finalFilePath = path.join(resolvedWorkDir, 'media.mp3');
                await runFfmpeg(
                  ['-y', '-i', rawPath, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', finalFilePath],
                  resolvedWorkDir
                );
                fs.rmSync(rawPath, { force: true });
              } else {
                finalFilePath = path.join(resolvedWorkDir, 'media.mp4');
                await streamExternalUrlToFile(targetMediaUrl, finalFilePath, 120_000);
              }
              usedDirectStreamFallback = true;
            }
          } else if (isFacebook) {
            const fbMeta = await tryFetchFacebookDirectMeta(validatedUrl);
            let fbRecoveredByYtDlp = false;
            if (
              fbMeta?.finalUrl &&
              fbMeta.finalUrl !== validatedUrl &&
              !fbMeta.finalUrl.includes('/login')
            ) {
              try {
                stdout = await runYtDlp(
                  [...ytArgs, '--', fbMeta.finalUrl],
                  resolvedWorkDir,
                  120_000
                );
                fbRecoveredByYtDlp = true;
              } catch {
                // Fall through to direct stream if HD/SD URL extracted
              }
            }
            if (!fbRecoveredByYtDlp) {
              const targetFbUrl =
                selectedQuality === '480'
                  ? fbMeta?.sdVideoUrl || fbMeta?.hdVideoUrl
                  : fbMeta?.hdVideoUrl || fbMeta?.sdVideoUrl;
              if (!fbMeta || !targetFbUrl) {
                throw firstDlErr;
              }
              title = fbMeta.title;
              platform = 'Facebook';
              if (isAudioOnly) {
                const rawPath = path.join(resolvedWorkDir, 'fb_raw.mp4');
                await streamExternalUrlToFile(targetFbUrl, rawPath, 120_000);
                finalFilePath = path.join(resolvedWorkDir, 'media.mp3');
                await runFfmpeg(
                  ['-y', '-i', rawPath, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', finalFilePath],
                  resolvedWorkDir
                );
                fs.rmSync(rawPath, { force: true });
              } else {
                finalFilePath = path.join(resolvedWorkDir, 'media.mp4');
                await streamExternalUrlToFile(targetFbUrl, finalFilePath, 120_000);
              }
              usedDirectStreamFallback = true;
            }
          } else if (
            isYouTubeHostUrl(validatedUrl) &&
            /bot|sign in|403|forbidden|cookies/i.test(msg)
          ) {
            stdout = await runYtDlp(
              [
                ...ytArgs,
                '-4',
                '--extractor-args',
                'youtube:player_client=tv,android_vr,ios,mweb',
                '--',
                validatedUrl,
              ],
              resolvedWorkDir,
              150_000
            );
          } else {
            throw firstDlErr;
          }
        }

        if (!usedDirectStreamFallback) {
          const lastJsonLine = stdout
            .trim()
            .split('\n')
            .reverse()
            .find((l) => l.trim().startsWith('{'));
          const meta = safeParseJsonObject<{
            title?: string;
            fulltitle?: string;
            duration?: number;
            extractor_key?: string;
            extractor?: string;
          }>(lastJsonLine);

          if (meta) {
            title =
              (typeof meta.title === 'string' && meta.title.trim()) ||
              (typeof meta.fulltitle === 'string' && meta.fulltitle.trim()) ||
              'Video';
            platform = detectPlatformLabel(validatedUrl, meta.extractor_key || meta.extractor);
            if (typeof meta.duration === 'number' && Number.isFinite(meta.duration) && meta.duration > 0) {
              durationSec = Number(meta.duration.toFixed(1));
            }
          }

          const dirFiles = fs
            .readdirSync(resolvedWorkDir)
            .filter(
              (f) =>
                !f.endsWith('.part') &&
                !f.endsWith('.ytdl') &&
                !f.endsWith('.json') &&
                !f.startsWith('.')
            );
          const preferredExt = isAudioOnly ? '.mp3' : '.mp4';
          const chosen =
            dirFiles.find((f) => path.extname(f).toLowerCase() === preferredExt) || dirFiles[0];
          if (!chosen) {
            throw new Error('Downloaded media file not found');
          }
          finalFilePath = path.resolve(resolvedWorkDir, chosen);
          if (!finalFilePath.startsWith(resolvedWorkDir + path.sep)) {
            throw new Error('Invalid downloaded file path');
          }
        }
      }

      if (!finalFilePath || !fs.existsSync(finalFilePath)) {
        throw new Error('Download failed');
      }
      const stats = fs.statSync(finalFilePath);
      if (stats.size < 256) {
        throw new Error('Downloaded file is empty');
      }
      if (stats.size > MAX_DOWNLOAD_BYTES) {
        throw new Error('File is larger than max-filesize (250M)');
      }

      if (durationSec <= 0) {
        const probed = await getMediaDurationSec(finalFilePath);
        if (probed > 0) durationSec = Number(probed.toFixed(1));
      }

      const fileExt = path.extname(finalFilePath).toLowerCase() || (isAudioOnly ? '.mp3' : '.mp4');
      const mimeType = isAudioOnly ? 'audio/mpeg' : inferVideoMimeType(finalFilePath);
      const safeOutName = `${makeSafeAsciiStem(title)}_${selectedQuality}${fileExt}`;

      // Cap retained download items at MAX_DOWNLOAD_RECORDS
      if (downloadedVideos.size >= MAX_DOWNLOAD_RECORDS) {
        const sortedOldest = [...downloadedVideos.values()].sort(
          (a, b) => a.createdAt - b.createdAt
        );
        while (downloadedVideos.size >= MAX_DOWNLOAD_RECORDS && sortedOldest.length > 0) {
          const oldest = sortedOldest.shift()!;
          fs.rmSync(oldest.workDir, { recursive: true, force: true });
          downloadedVideos.delete(oldest.downloadId);
        }
      }

      const record: DownloadedVideoRecord = {
        downloadId,
        workDir: resolvedWorkDir,
        filePath: finalFilePath,
        filename: safeOutName,
        title,
        platform,
        sizeBytes: stats.size,
        mimeType,
        durationSec: durationSec > 0 ? durationSec : undefined,
        qualityId: selectedQuality,
        isAudioOnly,
        createdAt: Date.now(),
      };
      downloadedVideos.set(downloadId, record);

      res.json({
        downloadId: record.downloadId,
        title: record.title,
        platform: record.platform,
        filename: record.filename,
        sizeBytes: record.sizeBytes,
        mimeType: record.mimeType,
        durationSec: record.durationSec,
        qualityId: record.qualityId,
        isAudioOnly: record.isAudioOnly,
        downloadUrl: `/api/video-downloader/file/${record.downloadId}`,
      });
    } catch (err) {
      fs.rmSync(resolvedWorkDir, { recursive: true, force: true });
      res.status(400).json({ error: formatDownloaderError(err) });
    }
  });

  app.get('/api/video-downloader/file/:downloadId', (req, res) => {
    const record = findDownloadedVideo(req.params.downloadId);
    if (!record) {
      res.status(404).json({ error: 'Downloaded file not found or expired.' });
      return;
    }

    const stat = fs.statSync(record.filePath);
    const fileSize = stat.size;
    const isDownload = req.query.download === '1';

    res.setHeader('Cache-Control', 'private, no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'bytes');

    if (isDownload) {
      const rawExt = path.extname(record.filename) || (record.isAudioOnly ? '.mp3' : '.mp4');
      const asciiStem = makeSafeAsciiStem(path.basename(record.filename, rawExt));
      const asciiName = `${asciiStem}${rawExt}`;
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(asciiName)}`
      );
    }

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const MAX_OPEN_RANGE = 6 * 1024 * 1024;
      const requestedEnd = parts[1]
        ? parseInt(parts[1], 10)
        : Math.min(fileSize - 1, start + MAX_OPEN_RANGE - 1);
      const end = Math.min(fileSize - 1, requestedEnd);
      if (
        Number.isNaN(start) ||
        start < 0 ||
        start >= fileSize ||
        Number.isNaN(end) ||
        end >= fileSize ||
        start > end
      ) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
        return;
      }
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': record.mimeType,
      });
      fs.createReadStream(record.filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': record.mimeType,
      });
      fs.createReadStream(record.filePath).pipe(res);
    }
  });

  app.post('/api/video-downloader/use-in-studio', (req, res) => {
    const { downloadId } = req.body as { downloadId?: string };
    const record = downloadId ? findDownloadedVideo(downloadId) : null;
    if (!record) {
      res.status(404).json({ error: 'ဒေါင်းယူထားသော Video ဖိုင် သက်တမ်းကုန်သွားပါပြီ။ ထပ်မံဒေါင်းယူပေးပါ။' });
      return;
    }
    if (record.isAudioOnly) {
      res.status(400).json({ error: 'MP3 အသံဖိုင်ကို Edit Studio Video အဖြစ် ထည့်၍မရပါ။ MP4 Video ဒေါင်းပြီး ထည့်ပေးပါ။' });
      return;
    }

    const newVideoId = crypto.randomUUID();
    const ext = path.extname(record.filePath) || '.mp4';
    const destPath = path.join(UPLOADS_DIR, `${newVideoId}${ext}`);
    try {
      fs.copyFileSync(record.filePath, destPath);
    } catch {
      res.status(500).json({ error: 'Video ကို Studio ထဲသို့ ကူးယူရာတွင် အမှားဖြစ်ပွားပါသည်။' });
      return;
    }

    const stats = fs.statSync(destPath);
    const uploadedRec: UploadedVideoRecord = {
      videoId: newVideoId,
      filePath: destPath,
      originalName: record.filename,
      sizeBytes: stats.size,
      mimeType: record.mimeType,
      createdAt: Date.now(),
    };
    uploadedVideos.set(newVideoId, uploadedRec);

    res.json({
      videoId: uploadedRec.videoId,
      filename: uploadedRec.originalName,
      sizeBytes: uploadedRec.sizeBytes,
      mimeType: uploadedRec.mimeType,
    });
  });

  app.post('/api/videos/render', async (req, res) => {
    req.setTimeout(0);
    res.setTimeout(0);

    const ffmpegAvailable = await checkFfmpegAvailable();
    if (!ffmpegAvailable) {
      res.status(500).json({ error: 'FFmpeg မတွေ့ပါ။ Server တွင် FFmpeg ထည့်သွင်းထားရန် လိုအပ်ပါသည်။' });
      return;
    }

    const {
      videoId,
      srtText,
      colorPresetId,
      brightness,
      contrast,
      saturation,
      fontName,
      fontSize,
      textColorId,
      positionId,
      subtitleX,
      subtitleY,
      subtitleAnimation,
      videoAspectId,
      videoFitMode,
      logo,
      textLogo,
    } = req.body as {
      videoId?: string;
      srtText?: string;
      colorPresetId?: string;
      brightness?: number;
      contrast?: number;
      saturation?: number;
      fontName?: string;
      fontSize?: number;
      textColorId?: SubtitleColorId;
      positionId?: SubtitlePositionId;
      subtitleX?: number;
      subtitleY?: number;
      subtitleAnimation?: SubtitleAnimationId;
      videoAspectId?: VideoAspectId;
      videoFitMode?: VideoFitModeId;
      logo?: {
        logoId?: string;
        enabled?: boolean;
        position?: LogoPositionId;
        xPct?: number;
        yPct?: number;
        scalePct?: number;
        opacity?: number;
        marginPct?: number;
        animation?: LogoAnimationId;
      };
      textLogo?: {
        enabled?: boolean;
        text?: string;
        styleId?: TextLogoStyleId;
        colorId?: SubtitleColorId;
        animationId?: TextLogoAnimationId;
        xPct?: number;
        yPct?: number;
        size?: number;
        opacity?: number;
      };
    };

    const videoRecord = videoId ? findUploadedVideo(videoId) : null;
    if (!videoRecord) {
      res.status(400).json({ error: 'ကျေးဇူးပြု၍ ဗီဒီယိုဖိုင် အရင်တင်ပေးပါ။' });
      return;
    }

    const hasSubtitlesInput = typeof srtText === 'string' && srtText.trim().length > 0;
    const parsedCues = hasSubtitlesInput ? parseSrt(srtText!) : [];
    if (hasSubtitlesInput && parsedCues.length === 0) {
      res.status(400).json({
        error:
          'စာတန်း Format မမှန်ပါ (Timestamp များ မတွေ့ပါ)။ ဥပမာ- 00:00:01,000 --> 00:00:04,500 ပုံစံဖြင့် ထည့်သွင်းပါ။',
      });
      return;
    }

    const logoRecord =
      logo?.enabled && typeof logo.logoId === 'string'
        ? findUploadedLogo(logo.logoId)
        : null;
    if (logo?.enabled && typeof logo.logoId === 'string' && !logoRecord) {
      res.status(400).json({
        error: 'Logo ဖိုင် သက်တမ်းကုန်သွားပါပြီ။ ကျေးဇူးပြု၍ Logo ကို ပြန်တင်ပေးပါ။',
      });
      return;
    }

    const hasAnimatedTextLogo = Boolean(
      textLogo?.enabled && typeof textLogo.text === 'string' && textLogo.text.trim().length > 0
    );

    const renderId = crypto.randomUUID();
    const workDir = path.join(RENDERS_DIR, renderId);
    fs.mkdirSync(workDir, { recursive: true });

    const inputExt = path.extname(videoRecord.filePath) || '.mp4';
    const inputName = `input${inputExt}`;
    const outputName = 'output_final.mp4';
    const subName = 'subs.srt';
    const assName = 'subs.ass';

    const inputDest = path.join(workDir, inputName);
    const outputDest = path.join(workDir, outputName);
    try {
      fs.symlinkSync(videoRecord.filePath, inputDest);
    } catch {
      fs.copyFileSync(videoRecord.filePath, inputDest);
    }

    let logoInputName: string | null = null;
    if (logoRecord) {
      const logoExt = path.extname(logoRecord.filePath) || '.png';
      logoInputName = `logo_overlay${logoExt}`;
      fs.copyFileSync(logoRecord.filePath, path.join(workDir, logoInputName));
    }

    try {
      const probedDims = await probeVideoDimensions(inputDest);
      const vidW = probedDims?.width ?? 1280;
      const vidH = probedDims?.height ?? 720;
      const vidDurationSec = probedDims?.durationSec ?? 180;
      const maxDim = Math.max(vidW, vidH);

      const targetPreset =
        VIDEO_ASPECT_PRESETS.find((p) => p.id === videoAspectId && p.width && p.height) ?? null;
      const safeFitMode: VideoFitModeId = videoFitMode === 'crop_fill' ? 'crop_fill' : 'blur_fit';

      const outW = targetPreset?.width
        ? targetPreset.width
        : maxDim > 1920
        ? Math.max(2, Math.floor((vidW * (1920 / maxDim)) / 2) * 2)
        : Math.max(2, Math.floor(vidW / 2) * 2);
      const outH = targetPreset?.height
        ? targetPreset.height
        : maxDim > 1920
        ? Math.max(2, Math.floor((vidH * (1920 / maxDim)) / 2) * 2)
        : Math.max(2, Math.floor(vidH / 2) * 2);

      const baseScale = 720 / Math.min(outW, outH);
      const playResX = Math.max(240, Math.round(outW * baseScale));
      const playResY = Math.max(240, Math.round(outH * baseScale));

      interface FilterBuildResult {
        useComplex: boolean;
        resizePrefixComplex: string;
        linearResizeVf: string;
        postFiltersChain: string;
        srtPath: string | null;
      }

      const buildFilterChain = (includeFontsDir: boolean): FilterBuildResult => {
        const postFilters: string[] = [];

        // 1) Color Preset Filter
        const preset = COLOR_PRESETS.find((p) => p.id === colorPresetId);
        if (preset && preset.ffmpegFilter) {
          postFilters.push(preset.ffmpegFilter);
        }

        // 2) Fine-tune Sliders
        const safeBrightness = clampNumber(brightness, -0.3, 0.3, 0.0);
        const safeContrast = clampNumber(contrast, 0.7, 1.5, 1.0);
        const safeSaturation = clampNumber(saturation, 0.0, 2.0, 1.0);
        if (safeBrightness !== 0 || safeContrast !== 1 || safeSaturation !== 1) {
          postFilters.push(
            `eq=brightness=${safeBrightness.toFixed(2)}:contrast=${safeContrast.toFixed(2)}:saturation=${safeSaturation.toFixed(2)}`
          );
        }

        // 3) Burn subtitles &/or animated Text Logo via normalized ASS file
        let srtPath: string | null = null;
        if (parsedCues.length > 0) {
          srtPath = path.join(workDir, subName);
          if (!fs.existsSync(srtPath)) {
            fs.writeFileSync(srtPath, serializeSrt(parsedCues) + '\n', 'utf8');
          }
        }

        if (parsedCues.length > 0 || hasAnimatedTextLogo) {
          const assFilePath = path.join(workDir, assName);
          if (!fs.existsSync(assFilePath)) {
            const safeFont = sanitizeFontName(fontName);
            const sliderFontSize = clampNumber(fontSize, 14, 42, 22);
            const widthRatio = 0.036 + ((sliderFontSize - 14) / (42 - 14)) * 0.036;
            const assFontSize = Math.max(18, Math.round(playResX * widthRatio));
            const colorSpec =
              textColorId && textColorId in SUBTITLE_COLORS
                ? SUBTITLE_COLORS[textColorId]
                : SUBTITLE_COLORS.white;
            const posSpec =
              positionId && positionId in SUBTITLE_POSITIONS
                ? SUBTITLE_POSITIONS[positionId]
                : SUBTITLE_POSITIONS.bottom;
            const resolvedPosX =
              typeof subtitleX === 'number' && Number.isFinite(subtitleX)
                ? clampNumber(subtitleX, 10, 90, posSpec.xPct)
                : posSpec.xPct;
            const resolvedPosY =
              typeof subtitleY === 'number' && Number.isFinite(subtitleY)
                ? clampNumber(subtitleY, 6, 94, posSpec.yPct)
                : posSpec.yPct;
            const dynamicMarginV =
              positionId === 'center'
                ? 10
                : Math.max(24, Math.round(playResY * 0.06));

            const validAnimations = new Set<SubtitleAnimationId>([
              'word_pop',
              'bounce',
              'slide_run',
              'karaoke_pop',
              'static',
            ]);
            const resolvedAnim: SubtitleAnimationId =
              subtitleAnimation && validAnimations.has(subtitleAnimation)
                ? subtitleAnimation
                : 'word_pop';

            let assTextLogo: AssTextLogoOptions | undefined;
            if (hasAnimatedTextLogo && textLogo) {
              const logoColorSpec =
                textLogo.colorId && textLogo.colorId in SUBTITLE_COLORS
                  ? SUBTITLE_COLORS[textLogo.colorId]
                  : SUBTITLE_COLORS.rainbow;
              const logoSliderSize = clampNumber(textLogo.size, 14, 42, 22);
              const logoWidthRatio = 0.036 + ((logoSliderSize - 14) / (42 - 14)) * 0.036;
              const assLogoFontSize = Math.max(18, Math.round(playResX * logoWidthRatio));
              const validLogoAnims = new Set<TextLogoAnimationId>([
                'wave',
                'bounce',
                'rainbow_pop',
                'pulse',
                'static',
              ]);
              const resolvedTextLogoAnim: TextLogoAnimationId =
                textLogo.animationId && validLogoAnims.has(textLogo.animationId)
                  ? textLogo.animationId
                  : 'wave';
              const validLogoStyles = new Set<TextLogoStyleId>([
                'minimal_white',
                'dark_glass',
                'amber_gold',
                'outline_badge',
              ]);
              const resolvedTextLogoStyle: TextLogoStyleId =
                textLogo.styleId && validLogoStyles.has(textLogo.styleId)
                  ? textLogo.styleId
                  : 'minimal_white';

              assTextLogo = {
                text: textLogo.text!.trim(),
                fontName: safeFont,
                fontSize: assLogoFontSize,
                primaryColour: logoColorSpec.assHex,
                colorPalette: logoColorSpec.palette,
                animationId: resolvedTextLogoAnim,
                styleId: resolvedTextLogoStyle,
                xPct: clampNumber(textLogo.xPct, 8, 92, 50),
                yPct: clampNumber(textLogo.yPct, 8, 92, 14),
                opacity: clampNumber(textLogo.opacity, 0.2, 1.0, 0.95),
                durationSec: vidDurationSec,
              };
            }

            const assContent = buildAssFromCues(
              parsedCues,
              {
                fontName: safeFont,
                fontSize: assFontSize,
                primaryColour: colorSpec.assHex,
                colorPalette: colorSpec.palette,
                alignment: posSpec.alignment,
                marginV: dynamicMarginV,
                marginLR: Math.max(12, Math.round(playResX * 0.03)),
                playResX,
                playResY,
                posXPct: resolvedPosX,
                posYPct: resolvedPosY,
                animationId: resolvedAnim,
              },
              assTextLogo
            );
            fs.writeFileSync(assFilePath, assContent, 'utf8');
          }

          if (includeFontsDir && fs.existsSync(BUNDLED_FONTS_DIR)) {
            const escapedFontsDir = BUNDLED_FONTS_DIR.replace(/\\/g, '/')
              .replace(/:/g, '\\:')
              .replace(/'/g, "\\'")
              .replace(/ /g, '\\ ');
            postFilters.push(`ass=${assName}:fontsdir=${escapedFontsDir}`);
          } else {
            postFilters.push(`ass=${assName}`);
          }
        }

        postFilters.push('format=yuv420p');

        // 0) Target Aspect / Size Resize Filter
        let useComplex = false;
        let resizePrefixComplex = '';
        let linearResizeVf = '';

        if (targetPreset && safeFitMode === 'blur_fit') {
          useComplex = true;
          const bgW = Math.max(120, Math.floor((outW / 4) / 2) * 2);
          const bgH = Math.max(120, Math.floor((outH / 4) / 2) * 2);
          resizePrefixComplex =
            `[0:v]split=2[vbg][vfg];` +
            `[vbg]scale=${bgW}:${bgH}:force_original_aspect_ratio=increase,crop=${bgW}:${bgH},boxblur=8:2,scale=${outW}:${outH}:flags=bilinear,eq=brightness=-0.08,setsar=1[bgb];` +
            `[vfg]scale=${outW}:${outH}:force_original_aspect_ratio=decrease,setsar=1[fgb];` +
            `[bgb][fgb]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p`;
        } else if (targetPreset && safeFitMode === 'crop_fill') {
          linearResizeVf = `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},setsar=1,format=yuv420p`;
        } else if (maxDim > 1920 && outW > 0 && outH > 0) {
          linearResizeVf = `scale=${outW}:${outH},setsar=1,format=yuv420p`;
        } else {
          linearResizeVf = 'scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,format=yuv420p';
        }

        return {
          useComplex,
          resizePrefixComplex,
          linearResizeVf,
          postFiltersChain: postFilters.join(','),
          srtPath,
        };
      };

      const buildEncodeArgs = (srcFile: string, filterSpec: FilterBuildResult): string[] => {
        const baseOutputLabel = logoInputName ? '[vbase]' : '[vout]';

        if (filterSpec.useComplex || logoInputName) {
          const baseChain = filterSpec.useComplex
            ? `${filterSpec.resizePrefixComplex},${filterSpec.postFiltersChain}${baseOutputLabel}`
            : `[0:v]${filterSpec.linearResizeVf},${filterSpec.postFiltersChain}${baseOutputLabel}`;

          let fullFilterComplex = baseChain;
          let loopLogoInput = false;
          const logoStreamIdx = 1;

          if (logoInputName) {
            const safeScaleRatio = clampNumber(logo?.scalePct, 6, 32, 15) / 100;
            const safeOpacity = clampNumber(logo?.opacity, 0.2, 1.0, 0.9);
            const fallbackPosSpec =
              LOGO_POSITIONS.find((p) => p.id === logo?.position) ?? LOGO_POSITIONS[2];
            const safeXPct = clampNumber(logo?.xPct, 6, 94, fallbackPosSpec.xPct);
            const safeYPct = clampNumber(logo?.yPct, 6, 94, fallbackPosSpec.yPct);
            const xr = (safeXPct / 100).toFixed(4);
            const yr = (safeYPct / 100).toFixed(4);
            const targetLogoWidth = Math.max(28, Math.round(outW * safeScaleRatio));

            const validImageAnims = new Set<LogoAnimationId>([
              'float',
              'bounce',
              'sway',
              'pulse',
              'static',
            ]);
            const resolvedImageAnim: LogoAnimationId =
              logo?.animation && validImageAnims.has(logo.animation)
                ? logo.animation
                : 'float';

            loopLogoInput = resolvedImageAnim !== 'static';

            let logoStreamChain = `[${logoStreamIdx}:v]format=rgba,colorchannelmixer=aa=${safeOpacity.toFixed(2)}`;
            let overlayCoords = `x=W*${xr}-w/2:y=H*${yr}-h/2`;

            if (resolvedImageAnim === 'pulse') {
              logoStreamChain += `,scale=w=trunc(${targetLogoWidth}*(1+0.10*sin(t*3.6))/2)*2:h=-1:eval=frame,setsar=1[lg]`;
            } else if (resolvedImageAnim === 'sway') {
              logoStreamChain += `,scale=${targetLogoWidth}:-1,rotate=0.075*sin(t*2.8):ow=rotw(0.1):oh=roth(0.1):c=none,setsar=1[lg]`;
              overlayCoords = `x=W*${xr}-w/2+sin(t*2.4)*W*0.012:y=H*${yr}-h/2`;
            } else if (resolvedImageAnim === 'bounce') {
              logoStreamChain += `,scale=${targetLogoWidth}:-1,setsar=1[lg]`;
              overlayCoords = `x=W*${xr}-w/2:y=H*${yr}-h/2-abs(sin(t*3.2))*H*0.022`;
            } else if (resolvedImageAnim === 'float') {
              logoStreamChain += `,scale=${targetLogoWidth}:-1,setsar=1[lg]`;
              overlayCoords = `x=W*${xr}-w/2:y=H*${yr}-h/2+sin(t*2.6)*H*0.012`;
            } else {
              logoStreamChain += `,scale=${targetLogoWidth}:-1,setsar=1[lg]`;
            }

            const overlayTail = loopLogoInput
              ? `shortest=1:format=auto`
              : `eof_action=repeat:format=auto`;

            fullFilterComplex =
              `${baseChain};` +
              `${logoStreamChain};` +
              `[vbase][lg]overlay=${overlayCoords}:${overlayTail},format=yuv420p[vout]`;
          }

          return [
            '-y',
            '-i',
            srcFile,
            ...(logoInputName
              ? loopLogoInput
                ? ['-loop', '1', '-i', logoInputName]
                : ['-i', logoInputName]
              : []),
            '-filter_complex',
            fullFilterComplex,
            '-map',
            '[vout]',
            '-map',
            '0:a?',
            '-sn',
            '-dn',
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-crf',
            '22',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-b:a',
            '160k',
            '-max_muxing_queue_size',
            '1024',
            '-movflags',
            '+faststart',
            outputName,
          ];
        }

        const vfChain = `${filterSpec.linearResizeVf},${filterSpec.postFiltersChain}`;
        return [
          '-y',
          '-i',
          srcFile,
          '-map',
          '0:v:0',
          '-map',
          '0:a?',
          '-sn',
          '-dn',
          '-vf',
          vfChain,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '22',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '160k',
          '-max_muxing_queue_size',
          '1024',
          '-movflags',
          '+faststart',
          outputName,
        ];
      };

      const filterSpec = buildFilterChain(true);
      const { srtPath } = filterSpec;

      try {
        await runFfmpeg(buildEncodeArgs(inputName, filterSpec), workDir);
      } catch (primaryErr) {
        console.warn(
          '[videos/render] Primary render failed, normalizing input and retrying:',
          primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
        );
        // Pre-normalize erratic mobile/VFR/mid-stream-changing video into clean 30fps yuv420p MP4
        const normalizedName = 'normalized_input.mp4';
        const baseNormVf = 'scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,format=yuv420p';

        const buildNormArgs = (disableReinit: boolean, vf: string): string[] => [
          '-y',
          '-fflags',
          '+genpts',
          ...(disableReinit ? ['-reinit_filter', '0'] : []),
          '-i',
          inputName,
          '-map',
          '0:v:0',
          '-map',
          '0:a?',
          '-sn',
          '-dn',
          '-vf',
          vf,
          '-r',
          '30',
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-crf',
          '18',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-max_muxing_queue_size',
          '1024',
          normalizedName,
        ];

        try {
          await runFfmpeg(buildNormArgs(false, baseNormVf), workDir);
        } catch {
          try {
            await runFfmpeg(buildNormArgs(true, baseNormVf), workDir);
          } catch {
            const dims = await probeVideoDimensions(inputDest);
            const fixedVf = dims
              ? `scale=${dims.width}:${dims.height}:force_original_aspect_ratio=decrease,pad=${dims.width}:${dims.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p`
              : baseNormVf;
            await runFfmpeg(buildNormArgs(true, fixedVf), workDir);
          }
        }

        try {
          await runFfmpeg(buildEncodeArgs(normalizedName, filterSpec), workDir);
        } catch {
          const fallbackSpec = buildFilterChain(false);
          await runFfmpeg(buildEncodeArgs(normalizedName, fallbackSpec), workDir);
        }
      }

      // Clean up intermediate render inputs immediately so /tmp stays spacious across multiple renders
      for (const tempFile of [
        inputDest,
        path.join(workDir, 'normalized_input.mp4'),
        path.join(workDir, assName),
        logoInputName ? path.join(workDir, logoInputName) : '',
      ]) {
        if (tempFile) {
          fs.rmSync(tempFile, { force: true });
        }
      }

      const stats = fs.statSync(outputDest);
      const baseName = path.basename(
        videoRecord.originalName,
        path.extname(videoRecord.originalName)
      );
      const asciiStem = baseName
        .replace(/[^\x20-\x7E]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);
      const safeOutName = `${asciiStem || 'myanmar_mv'}_graded.mp4`;

      renderedOutputs.set(renderId, {
        renderId,
        workDir,
        videoPath: outputDest,
        srtPath,
        filename: safeOutName,
        sizeBytes: stats.size,
        createdAt: Date.now(),
      });

      res.json({
        renderId,
        videoUrl: `/api/renders/${renderId}/video`,
        srtUrl: srtPath ? `/api/renders/${renderId}/srt` : null,
        filename: safeOutName,
        sizeBytes: stats.size,
      });
    } catch (err) {
      fs.rmSync(workDir, { recursive: true, force: true });
      const message =
        err instanceof Error ? err.message : 'FFmpeg render error.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/renders/:renderId/video', (req, res) => {
    const record = findRenderedOutput(req.params.renderId);
    if (!record) {
      res.status(404).json({ error: 'Rendered video not found.' });
      return;
    }

    const stat = fs.statSync(record.videoPath);
    const fileSize = stat.size;
    const isDownload = req.query.download === '1';

    res.setHeader('Cache-Control', 'private, no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'bytes');

    if (isDownload) {
      const rawExt = path.extname(record.filename) || '.mp4';
      const rawStem = path.basename(record.filename, rawExt);
      const asciiStem = rawStem
        .replace(/[^\x20-\x7E]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '');
      const asciiName = `${asciiStem || 'myanmar_mv_graded'}${rawExt}`;
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(asciiName)}`
      );
    }

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const MAX_OPEN_RANGE = 6 * 1024 * 1024;
      const requestedEnd = parts[1] ? parseInt(parts[1], 10) : Math.min(fileSize - 1, start + MAX_OPEN_RANGE - 1);
      const end = Math.min(fileSize - 1, requestedEnd);
      if (Number.isNaN(start) || start < 0 || start >= fileSize || Number.isNaN(end) || end >= fileSize || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
        return;
      }
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4',
      });
      fs.createReadStream(record.videoPath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': 'video/mp4',
      });
      fs.createReadStream(record.videoPath).pipe(res);
    }
  });

  app.get('/api/renders/:renderId/srt', (req, res) => {
    const record = findRenderedOutput(req.params.renderId);
    if (!record || !record.srtPath || !fs.existsSync(record.srtPath)) {
      res.status(404).json({ error: 'SRT file not found.' });
      return;
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="subtitles.srt"');
    fs.createReadStream(record.srtPath).pipe(res);
  });

  // Multer & API error handler
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      next();
    }
  );

  // Vite dev middleware vs static production serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          if (
            filePath.endsWith('.html') ||
            filePath.endsWith('sw.js') ||
            filePath.endsWith('version.json') ||
            filePath.endsWith('manifest.webmanifest')
          ) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          } else if (
            filePath.endsWith('apple-touch-icon.png') ||
            filePath.endsWith('pwa-192x192.png') ||
            filePath.endsWith('pwa-512x512.png') ||
            filePath.endsWith('pwa-maskable-512x512.png')
          ) {
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Myanmar MV Studio running on http://0.0.0.0:${PORT}`);
  });
  server.requestTimeout = 0;
  server.keepAliveTimeout = 620_000;
  server.headersTimeout = 625_000;
}

startServer();
