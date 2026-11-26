export interface SrtCue {
  index: number;
  startSec: number;
  endSec: number;
  startTimestamp: string;
  endTimestamp: string;
  text: string;
}

/**
 * Parses timestamps like:
 * - 00:01:02,345 or 00:01:02.345
 * - 01:02,345 or 01:02.345 (MM:SS,mmm)
 * - 01:02 or 00:01:02 (without millis)
 */
export function parseFlexibleTimestamp(raw: string): { seconds: number; srtTimestamp: string } | null {
  const cleaned = raw.trim().replace(/^[\[(]|[\])]$/g, '').trim();

  // HH:MM:SS[,.]mmm or HH:MM:SS
  let match = cleaned.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?$/);
  if (match) {
    const h = Number(match[1]);
    const m = Number(match[2]);
    const s = Number(match[3]);
    const ms = Number((match[4] ?? '0').padEnd(3, '0').slice(0, 3));
    const total = h * 3600 + m * 60 + s + ms / 1000;
    return {
      seconds: total,
      srtTimestamp: formatSecondsToSrt(total),
    };
  }

  // MM:SS[,.]mmm or MM:SS
  match = cleaned.match(/^(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?$/);
  if (match) {
    const m = Number(match[1]);
    const s = Number(match[2]);
    const ms = Number((match[3] ?? '0').padEnd(3, '0').slice(0, 3));
    const total = m * 60 + s + ms / 1000;
    return {
      seconds: total,
      srtTimestamp: formatSecondsToSrt(total),
    };
  }

  return null;
}

export function parseTimestampToSeconds(ts: string): number {
  return parseFlexibleTimestamp(ts)?.seconds ?? 0;
}

export function formatSecondsToSrt(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = Math.floor(clamped % 60);
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000);
  const adjustedSeconds = millis === 1000 ? seconds + 1 : seconds;
  const adjustedMillis = millis === 1000 ? 0 : millis;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(adjustedSeconds).padStart(2, '0')},${String(adjustedMillis).padStart(3, '0')}`;
}

export function formatSecondsToAss(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = Math.floor(clamped % 60);
  const centis = Math.min(99, Math.round((clamped - Math.floor(clamped)) * 100));
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

export function formatTimecodeDisplay(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '00:00.0';
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((totalSeconds % 1) * 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

const TIMESTAMP_LINE_REGEX =
  /^(?:[-*•]\s*|\d+\.\s*)?[\[(]?\s*(\d{1,2}:\d{1,2}(?::\d{1,2})?(?:[,.]\d{1,3})?)\s*(?:-->|->|–>|—>|[-–—])\s*(\d{1,2}:\d{1,2}(?::\d{1,2})?(?:[,.]\d{1,3})?)\s*[\])]?\s*:?\s*(.*)$/;

export function parseSrt(srtContent: string): SrtCue[] {
  if (!srtContent || !srtContent.trim()) return [];
  const normalized = srtContent
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const lines = normalized.split('\n');
  const cues: SrtCue[] = [];

  let currentStart: { seconds: number; srtTimestamp: string } | null = null;
  let currentEnd: { seconds: number; srtTimestamp: string } | null = null;
  let currentTextLines: string[] = [];

  const flushCurrent = () => {
    if (!currentStart || !currentEnd) return;
    // Strip trailing cue index line if the next block didn't have a blank line before its number
    const cleanedLines = [...currentTextLines];
    while (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1].trim() === '') {
      cleanedLines.pop();
    }
    const text = cleanedLines.join('\n').trim();
    if (text) {
      const endSec = Math.max(currentEnd.seconds, currentStart.seconds + 0.1);
      cues.push({
        index: cues.length + 1,
        startSec: currentStart.seconds,
        endSec,
        startTimestamp: currentStart.srtTimestamp,
        endTimestamp: formatSecondsToSrt(endSec),
        text,
      });
    }
    currentStart = null;
    currentEnd = null;
    currentTextLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const cleanedTsLine = trimmed.replace(/^[*_`]+|[*_`]+$/g, '').trim();
    const match = cleanedTsLine.match(TIMESTAMP_LINE_REGEX);
    if (match) {
      // If previous cue didn't have a blank line before this cue's numeric index, pop that index line
      if (
        currentStart &&
        currentTextLines.length > 0 &&
        /^\d+$/.test(currentTextLines[currentTextLines.length - 1].trim())
      ) {
        currentTextLines.pop();
      }
      flushCurrent();
      const parsedStart = parseFlexibleTimestamp(match[1]);
      const parsedEnd = parseFlexibleTimestamp(match[2]);
      if (parsedStart && parsedEnd) {
        currentStart = parsedStart;
        currentEnd = parsedEnd;
        const inlineText = (match[3] ?? '').trim();
        if (inlineText) {
          currentTextLines.push(inlineText);
        }
      }
      continue;
    }

    if (currentStart && currentEnd) {
      if (trimmed === '') {
        if (currentTextLines.length > 0) {
          flushCurrent();
        }
      } else {
        currentTextLines.push(lines[i].trimEnd());
      }
    }
  }

  flushCurrent();
  return cues;
}

export function serializeSrt(cues: SrtCue[]): string {
  return cues
    .map(
      (cue, idx) =>
        `${idx + 1}\n${cue.startTimestamp} --> ${cue.endTimestamp}\n${cue.text.trim()}`
    )
    .join('\n\n');
}

export function normalizeSrt(rawSrt: string): string {
  const cues = parseSrt(rawSrt);
  if (cues.length === 0) return rawSrt.trim();
  return serializeSrt(cues);
}

export function shiftAndClampCues(
  cues: SrtCue[],
  offsetSec: number,
  maxChunkDurationSec: number
): SrtCue[] {
  if (cues.length === 0) return [];
  // Detect if model returned absolute timestamps already aligned to offsetSec
  const alreadyAbsolute =
    offsetSec > 5 &&
    cues.every(
      (c) => c.startSec >= offsetSec - 0.5 && c.startSec < offsetSec + maxChunkDurationSec
    );

  const shifted: SrtCue[] = [];
  for (const cue of cues) {
    const relStart = alreadyAbsolute ? Math.max(0, cue.startSec - offsetSec) : cue.startSec;
    const relEnd = alreadyAbsolute ? Math.max(relStart + 0.25, cue.endSec - offsetSec) : cue.endSec;
    if (relStart >= maxChunkDurationSec) continue;
    const clampedStart = Math.max(0, relStart);
    const clampedEnd = Math.min(maxChunkDurationSec, Math.max(clampedStart + 0.25, relEnd));
    const absStart = offsetSec + clampedStart;
    const absEnd = offsetSec + clampedEnd;
    shifted.push({
      index: shifted.length + 1,
      startSec: absStart,
      endSec: absEnd,
      startTimestamp: formatSecondsToSrt(absStart),
      endTimestamp: formatSecondsToSrt(absEnd),
      text: cue.text,
    });
  }
  return shifted;
}

export function formatSecondsToClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '00:00';
  const rounded = Math.floor(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function parseFlexInputTime(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const val = Number(trimmed);
    return Number.isFinite(val) && val >= 0 ? val : null;
  }
  const parsed = parseFlexibleTimestamp(trimmed);
  return parsed ? parsed.seconds : null;
}

const STAGE_TAG_RE =
  /^[\[(]\s*(?:music|instrumental|music playing|guitar solo|piano solo|applause|laughter|silence|intro|outro|vocalizing|humming|singing|beat|bgm)\s*[\])]$/i;

export function stripStageDirectionCues(cues: SrtCue[]): SrtCue[] {
  const cleaned: SrtCue[] = [];
  for (const cue of cues) {
    const lines = cue.text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !STAGE_TAG_RE.test(l));
    if (lines.length === 0) continue;
    cleaned.push({
      ...cue,
      index: cleaned.length + 1,
      text: lines.join('\n'),
    });
  }
  return cleaned;
}

export function mergeSrtCues(
  existing: SrtCue[],
  incoming: SrtCue[],
  replaceStartSec?: number,
  replaceEndSec?: number
): SrtCue[] {
  const kept =
    typeof replaceStartSec === 'number' && typeof replaceEndSec === 'number'
      ? existing.filter(
          (c) => c.endSec <= replaceStartSec + 0.05 || c.startSec >= replaceEndSec - 0.05
        )
      : [...existing];

  const combined = [...kept, ...incoming].sort((a, b) => a.startSec - b.startSec);
  return combined.map((c, idx) => ({
    ...c,
    index: idx + 1,
  }));
}

export function offsetSrtCues(cues: SrtCue[], deltaSec: number): SrtCue[] {
  if (cues.length === 0 || deltaSec === 0) return cues;
  return cues.map((cue, idx) => {
    const duration = Math.max(0.25, cue.endSec - cue.startSec);
    const nextStart = Math.max(0, cue.startSec + deltaSec);
    const nextEnd = Math.max(nextStart + 0.25, nextStart + duration);
    return {
      ...cue,
      index: idx + 1,
      startSec: nextStart,
      endSec: nextEnd,
      startTimestamp: formatSecondsToSrt(nextStart),
      endTimestamp: formatSecondsToSrt(nextEnd),
    };
  });
}

export interface AssStyleOptions {
  fontName: string;
  fontSize: number;
  primaryColour: string;
  alignment: number;
  marginV: number;
  marginLR?: number;
  playResX?: number;
  playResY?: number;
  posXPct?: number;
  posYPct?: number;
  animationId?: 'word_pop' | 'bounce' | 'slide_run' | 'karaoke_pop' | 'static';
  colorPalette?: Array<{ assHex: string }>;
}

const MYANMAR_TOKEN_RE =
  /(?:[\u1000-\u102A\u103F\u104E](?:\u1004\u103A\u1039[\u1000-\u1021]|\u1039[\u1000-\u1021])*[\u102B-\u103E\u1056-\u1059\u1060-\u1064\u1071-\u1074\u1082-\u108D\u108F\u109A-\u109D]*(?:[\u1000-\u1021]\u103A[\u1037\u1038]?(?![\u102B-\u103E\u1039]))?|\s+|[^\s\u1000-\u109F]+)/gu;

const LOGO_CHAR_OR_MYANMAR_RE =
  /(?:[\u1000-\u102A\u103F\u104E](?:\u1004\u103A\u1039[\u1000-\u1021]|\u1039[\u1000-\u1021])*[\u102B-\u103E\u1056-\u1059\u1060-\u1064\u1071-\u1074\u1082-\u108D\u108F\u109A-\u109D]*(?:[\u1000-\u1021]\u103A[\u1037\u1038]?(?![\u102B-\u103E\u1039]))?|\s+|[^\s\u1000-\u109F])/gu;

export function segmentLineIntoTokens(line: string): string[] {
  if (!line) return [];
  return line.match(MYANMAR_TOKEN_RE) ?? [line];
}

export function segmentLogoTextTokens(text: string): string[] {
  if (!text) return [];
  return text.match(LOGO_CHAR_OR_MYANMAR_RE) ?? [text];
}

export interface AssTextLogoOptions {
  text: string;
  fontName: string;
  fontSize: number;
  primaryColour: string;
  colorPalette?: Array<{ assHex: string }>;
  animationId: 'wave' | 'bounce' | 'rainbow_pop' | 'pulse' | 'static';
  styleId: 'minimal_white' | 'dark_glass' | 'amber_gold' | 'outline_badge';
  xPct: number;
  yPct: number;
  opacity: number;
  durationSec: number;
}

function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\n/g, '\\N');
}

function resolvePosCoords(
  playResX: number,
  playResY: number,
  style: AssStyleOptions
): { useCustomPos: boolean; posX: number; posY: number } {
  if (
    typeof style.posXPct === 'number' &&
    typeof style.posYPct === 'number' &&
    Number.isFinite(style.posXPct) &&
    Number.isFinite(style.posYPct)
  ) {
    const clampedX = Math.max(10, Math.min(90, style.posXPct));
    const clampedY = Math.max(6, Math.min(94, style.posYPct));
    return {
      useCustomPos: true,
      posX: Math.round((clampedX / 100) * playResX),
      posY: Math.round((clampedY / 100) * playResY),
    };
  }
  const fallbackY =
    style.alignment === 5
      ? Math.round(playResY / 2)
      : style.alignment === 8
      ? Math.max(36, style.marginV)
      : Math.max(40, playResY - style.marginV);
  return {
    useCustomPos: false,
    posX: Math.round(playResX / 2),
    posY: fallbackY,
  };
}

function buildAnimationOverrideTags(
  cueDurationSec: number,
  playResX: number,
  playResY: number,
  style: AssStyleOptions
): string {
  const anim = style.animationId ?? 'word_pop';
  const { useCustomPos, posX, posY } = resolvePosCoords(playResX, playResY, style);
  const posPrefix = useCustomPos ? `\\an5\\pos(${posX},${posY})` : '';

  if (anim === 'static') {
    return `{${posPrefix}\\fad(80,80)}`;
  }

  const durMs = Math.max(400, Math.round(cueDurationSec * 1000));

  if (anim === 'slide_run') {
    const slideOffset = Math.max(40, Math.round(playResX * 0.14));
    const slideInMs = Math.min(340, Math.round(durMs * 0.45));
    const alignTag = useCustomPos ? '\\an5' : '';
    return `{${alignTag}\\fad(120,90)\\move(${posX + slideOffset},${posY},${posX},${posY},0,${slideInMs})}`;
  }

  if (anim === 'karaoke_pop') {
    const t1 = Math.min(160, Math.round(durMs * 0.3));
    const t2 = Math.min(320, Math.round(durMs * 0.6));
    return `{${posPrefix}\\fad(80,100)\\fscx72\\fscy72\\1c&H0066D9FF&\\t(0,${t1},\\fscx114\\fscy114)\\t(${t1},${t2},\\fscx100\\fscy100\\1c${style.primaryColour})}`;
  }

  // 'bounce' (ခုန်စွခုန်စွ): elastic pop-in + rhythmic beat hops & gentle playful tilt
  const parts: string[] = [];
  if (posPrefix) {
    parts.push(posPrefix);
  }
  parts.push(
    '\\fad(80,80)',
    '\\fscx78\\fscy78\\frz-1.5',
    '\\t(0,130,\\fscx112\\fscy118\\frz1.5)',
    '\\t(130,260,\\fscx97\\fscy95\\frz-0.8)',
    '\\t(260,360,\\fscx100\\fscy100\\frz0)'
  );

  const maxPulseMs = Math.min(durMs - 140, 8500);
  let beat = 0;
  for (let t = 440; t < maxPulseMs; t += 540) {
    const upEnd = Math.min(t + 170, durMs - 40);
    const downEnd = Math.min(t + 360, durMs - 20);
    const tilt = beat % 2 === 0 ? '1.4' : '-1.4';
    parts.push(`\\t(${t},${upEnd},\\fscx105\\fscy114\\frz${tilt})`);
    parts.push(`\\t(${upEnd},${downEnd},\\fscx99\\fscy98\\frz0)`);
    beat++;
    if (beat >= 14) break;
  }

  return `{${parts.join('')}}`;
}

function buildCueBodyText(
  rawText: string,
  cueDurationSec: number,
  playResX: number,
  playResY: number,
  style: AssStyleOptions
): string {
  const anim = style.animationId ?? 'word_pop';
  const palette = style.colorPalette;
  const hasMultiColor = Array.isArray(palette) && palette.length > 1;

  if (anim !== 'word_pop') {
    const lineAnimTag = buildAnimationOverrideTags(cueDurationSec, playResX, playResY, style);
    if (!hasMultiColor) {
      return `${lineAnimTag}${escapeAssText(rawText)}`;
    }
    const lines = rawText.split('\n');
    let wordIdx = 0;
    const coloredLines = lines.map((line) =>
      segmentLineIntoTokens(line)
        .map((tok) => {
          if (/^\s+$/.test(tok)) return tok;
          const color = palette[wordIdx % palette.length].assHex;
          wordIdx++;
          return `{\\1c${color}}${escapeAssText(tok)}`;
        })
        .join('')
    );
    return `${lineAnimTag}${coloredLines.join('\\N')}`;
  }

  // 'word_pop': sequential syllable-by-syllable / word-by-word bounce pop
  const { useCustomPos, posX, posY } = resolvePosCoords(playResX, playResY, style);
  const posPrefix = useCustomPos ? `\\an5\\pos(${posX},${posY})` : '';

  const lines = rawText.split('\n');
  const tokenizedLines = lines.map((line) => segmentLineIntoTokens(line));
  const totalWords = tokenizedLines.reduce(
    (sum, toks) => sum + toks.filter((t) => !/^\s+$/.test(t)).length,
    0
  );

  if (totalWords === 0) {
    return `${posPrefix ? `{${posPrefix}}` : ''}${escapeAssText(rawText)}`;
  }

  const durMs = Math.max(450, Math.round(cueDurationSec * 1000));
  const spreadWindowMs = Math.max(250, Math.min(durMs * 0.72, totalWords * 220));
  const stepMs = totalWords > 1 ? spreadWindowMs / totalWords : 0;

  let wordIdx = 0;
  const renderedLines = tokenizedLines.map((toks) =>
    toks
      .map((tok) => {
        if (/^\s+$/.test(tok)) return tok;
        const startMs = Math.round(wordIdx * stepMs);
        const fadeEndMs = Math.min(durMs - 80, startMs + 45);
        const peakMs = Math.min(durMs - 40, startMs + 165);
        const settleMs = Math.min(durMs - 10, startMs + 310);
        const colorHex = hasMultiColor
          ? palette[wordIdx % palette.length].assHex
          : style.primaryColour;
        wordIdx++;
        return `{\\1c${colorHex}\\alpha&HFF&\\fscx38\\fscy38\\t(${startMs},${fadeEndMs},\\alpha&H00&)\\t(${startMs},${peakMs},\\fscx124\\fscy124)\\t(${peakMs},${settleMs},\\fscx100\\fscy100)}${escapeAssText(tok)}`;
      })
      .join('')
  );

  return `{${posPrefix}\\fad(60,80)}${renderedLines.join('\\N')}`;
}

function buildTextLogoAssDialogue(
  logo: AssTextLogoOptions,
  playResX: number,
  playResY: number
): string {
  const posX = Math.round((Math.max(8, Math.min(92, logo.xPct)) / 100) * playResX);
  const posY = Math.round((Math.max(8, Math.min(92, logo.yPct)) / 100) * playResY);
  const clampedOpacity = Math.max(0.2, Math.min(1, logo.opacity));
  const alphaVal = Math.round((1 - clampedOpacity) * 255);
  const alphaTag =
    alphaVal > 2
      ? `\\alpha&H${alphaVal.toString(16).padStart(2, '0').toUpperCase()}&`
      : '';
  const totalDurSec = Math.max(8, Math.min(600, Math.ceil(logo.durationSec || 60)));
  const endTs = formatSecondsToAss(totalDurSec);
  const totalDurMs = totalDurSec * 1000;

  const tokens = segmentLogoTextTokens(logo.text.trim());
  const palette = logo.colorPalette;
  const hasMultiColor = Array.isArray(palette) && palette.length > 1;
  const anim = logo.animationId;

  if (anim === 'static' || tokens.length === 0) {
    if (!hasMultiColor) {
      return `Dialogue: 1,0:00:00.00,${endTs},LogoText,,0,0,0,,{\\an5\\pos(${posX},${posY})${alphaTag}}${escapeAssText(logo.text.trim())}`;
    }
    let idx = 0;
    const colored = tokens
      .map((tok) => {
        if (/^\s+$/.test(tok)) return tok;
        const c = palette[idx % palette.length].assHex;
        idx++;
        return `{\\1c${c}}${escapeAssText(tok)}`;
      })
      .join('');
    return `Dialogue: 1,0:00:00.00,${endTs},LogoText,,0,0,0,,{\\an5\\pos(${posX},${posY})${alphaTag}}${colored}`;
  }

  const cycleMs = anim === 'pulse' ? 1500 : anim === 'bounce' ? 1200 : 1300;
  const stepMs = anim === 'pulse' ? 85 : 100;

  let wordIdx = 0;
  const animatedTokens = tokens
    .map((tok) => {
      if (/^\s+$/.test(tok)) return tok;
      const baseColor = hasMultiColor
        ? palette[wordIdx % palette.length].assHex
        : logo.primaryColour;
      const phase = (wordIdx * stepMs) % cycleMs;
      const parts: string[] = [`\\1c${baseColor}`];

      for (let t = phase; t < totalDurMs; t += cycleMs) {
        if (anim === 'wave') {
          const t1 = t + 320;
          const t2 = t + 650;
          const t3 = t + 950;
          parts.push(`\\t(${t},${t1},\\fscx108\\fscy122\\frz3.5)`);
          parts.push(`\\t(${t1},${t2},\\fscx96\\fscy92\\frz-2.5)`);
          parts.push(`\\t(${t2},${t3},\\fscx100\\fscy100\\frz0)`);
        } else if (anim === 'bounce') {
          const t1 = t + 240;
          const t2 = t + 480;
          const t3 = t + 640;
          parts.push(`\\t(${t},${t1},\\fscx120\\fscy132\\frz4.5)`);
          parts.push(`\\t(${t1},${t2},\\fscx95\\fscy94\\frz-2.5)`);
          parts.push(`\\t(${t2},${t3},\\fscx100\\fscy100\\frz0)`);
        } else if (anim === 'rainbow_pop') {
          const t1 = t + 260;
          const t2 = t + 560;
          const nextColor = hasMultiColor
            ? palette[(wordIdx + 2) % palette.length].assHex
            : '&H0047E0FD&';
          parts.push(`\\t(${t},${t1},\\fscx124\\fscy124\\1c${nextColor})`);
          parts.push(`\\t(${t1},${t2},\\fscx100\\fscy100\\1c${baseColor})`);
        } else if (anim === 'pulse') {
          const t1 = t + 360;
          const t2 = t + 740;
          parts.push(`\\t(${t},${t1},\\fscx118\\fscy118)`);
          parts.push(`\\t(${t1},${t2},\\fscx100\\fscy100)`);
        }
      }

      wordIdx++;
      return `{${parts.join('')}}${escapeAssText(tok)}`;
    })
    .join('');

  return `Dialogue: 1,0:00:00.00,${endTs},LogoText,,0,0,0,,{\\an5\\pos(${posX},${posY})${alphaTag}}${animatedTokens}`;
}

export interface AssCartoonCaptionItem {
  startSec: number;
  endSec: number;
  titleMy: string;
}

export function buildAssFromCues(
  cues: SrtCue[],
  style: AssStyleOptions,
  textLogo?: AssTextLogoOptions,
  cartoonCaptions?: AssCartoonCaptionItem[]
): string {
  const playResX = Math.max(240, Math.round(style.playResX ?? 1280));
  const playResY = Math.max(240, Math.round(style.playResY ?? 720));
  const marginLR = Math.max(8, Math.round(style.marginLR ?? playResX * 0.03));
  const outline = Math.max(1.5, Number((Math.min(playResX, playResY) / 360).toFixed(1)));
  const shadow = Math.max(1, Number((outline * 0.5).toFixed(1)));
  const hasCustomPos =
    typeof style.posXPct === 'number' && typeof style.posYPct === 'number';
  const styleAlignment = hasCustomPos ? 5 : style.alignment;

  let logoStyleLine = '';
  const hasTextLogo = Boolean(textLogo && textLogo.text.trim().length > 0);
  if (hasTextLogo && textLogo) {
    const logoOutlineColour =
      textLogo.styleId === 'amber_gold'
        ? '&H000B9EF5&'
        : textLogo.styleId === 'outline_badge'
        ? '&H000BBFF5&'
        : '&H00000000';
    const logoOutlineSize =
      textLogo.styleId === 'dark_glass'
        ? Math.max(2.6, Number((outline * 1.4).toFixed(1)))
        : Math.max(2.0, Number((outline * 1.1).toFixed(1)));
    logoStyleLine = `\nStyle: LogoText,${textLogo.fontName},${textLogo.fontSize},${textLogo.primaryColour},&H000000FF,${logoOutlineColour},&H64000000,1,0,0,0,100,100,0,0,1,${logoOutlineSize},${shadow},5,${marginLR},${marginLR},12,1`;
  }

  let storyCaptionStyleLine = '';
  const validCaptions = (cartoonCaptions ?? []).filter(
    (c) => c.titleMy.trim().length > 0 && c.endSec > c.startSec
  );
  if (validCaptions.length > 0) {
    const captionFontSize = Math.max(16, Math.round(Math.min(playResX, playResY) * 0.034));
    storyCaptionStyleLine = `\nStyle: StoryCaption,${style.fontName},${captionFontSize},&H00D4F4FF&,&H000000FF,&H00120E14&,&H88000000,1,0,0,0,100,100,0,0,1,${Math.max(1.5, outline)},${shadow},7,${marginLR},${marginLR},18,1`;
  }

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontName},${style.fontSize},${style.primaryColour},&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,${outline},${shadow},${styleAlignment},${marginLR},${marginLR},${style.marginV},1${logoStyleLine}${storyCaptionStyleLine}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const events = cues.map((cue) => {
    const start = formatSecondsToAss(cue.startSec);
    const end = formatSecondsToAss(cue.endSec);
    const bodyText = buildCueBodyText(
      cue.text,
      cue.endSec - cue.startSec,
      playResX,
      playResY,
      style
    );
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${bodyText}`;
  });

  if (validCaptions.length > 0) {
    const capX = Math.max(24, Math.round(playResX * 0.045));
    const capY = Math.max(24, Math.round(playResY * 0.05));
    for (const cap of validCaptions) {
      const start = formatSecondsToAss(cap.startSec);
      const end = formatSecondsToAss(cap.endSec);
      events.push(
        `Dialogue: 0,${start},${end},StoryCaption,,0,0,0,,{\\an7\\pos(${capX},${capY})\\fad(380,380)}${escapeAssText(cap.titleMy.trim())}`
      );
    }
  }

  if (hasTextLogo && textLogo) {
    events.push(buildTextLogoAssDialogue(textLogo, playResX, playResY));
  }

  return `${header}\n${events.join('\n')}\n`;
}
