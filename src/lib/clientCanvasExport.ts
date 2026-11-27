import { isAndroidDevice, isIOSDevice } from './api';
import {
  segmentLineIntoTokens,
  segmentLogoTextTokens,
  type SrtCue,
} from './srt';
import {
  COLOR_PRESETS,
  SUBTITLE_COLORS,
  VIDEO_ASPECT_PRESETS,
  type LogoOverlayConfig,
  type RenderResult,
  type SubtitleAnimationId,
  type SubtitleColorId,
  type TextLogoConfig,
  type UploadedLogoMeta,
  type VideoAspectId,
  type VideoFitModeId,
} from './studioTypes';

export interface ClientVideoExportParams {
  videoUrl: string;
  sourceFilename?: string;
  cues: SrtCue[];
  colorPresetId: string;
  brightness: number;
  contrast: number;
  saturation: number;
  fontName: string;
  fontSize: number;
  textColorId: SubtitleColorId;
  subtitleX: number;
  subtitleY: number;
  subtitleAnimation: SubtitleAnimationId;
  videoAspectId: VideoAspectId;
  videoFitMode: VideoFitModeId;
  logoMeta: UploadedLogoMeta | null;
  logoConfig: LogoOverlayConfig;
  textLogoConfig: TextLogoConfig;
  onProgress?: (pct: number) => void;
}

function computeCssFilter(
  colorPresetId: string,
  brightness: number,
  contrast: number,
  saturation: number
): string {
  const preset = COLOR_PRESETS.find((p) => p.id === colorPresetId) ?? COLOR_PRESETS[0];
  const parts: string[] = [];
  if (preset.previewFilter && preset.previewFilter !== 'none') {
    parts.push(preset.previewFilter);
  }
  if (brightness !== 0) {
    parts.push(`brightness(${(1 + brightness * 1.4).toFixed(2)})`);
  }
  if (contrast !== 1) {
    parts.push(`contrast(${contrast.toFixed(2)})`);
  }
  if (saturation !== 1) {
    parts.push(`saturate(${saturation.toFixed(2)})`);
  }
  return parts.length > 0 ? parts.join(' ') : 'none';
}

function resolveCanvasDimensions(
  naturalW: number,
  naturalH: number,
  videoAspectId: VideoAspectId
): { width: number; height: number } {
  const mobile = isAndroidDevice() || isIOSDevice();
  const maxDim = mobile ? 960 : 1280;
  const aspectPreset = VIDEO_ASPECT_PRESETS.find((a) => a.id === videoAspectId);

  let targetW = naturalW > 1 ? naturalW : 1280;
  let targetH = naturalH > 1 ? naturalH : 720;

  if (aspectPreset && aspectPreset.width && aspectPreset.height) {
    targetW = aspectPreset.width;
    targetH = aspectPreset.height;
  }

  const scale = Math.min(1, maxDim / Math.max(targetW, targetH));
  const evenW = Math.max(240, Math.floor((targetW * scale) / 2) * 2);
  const evenH = Math.max(240, Math.floor((targetH * scale) / 2) * 2);
  return { width: evenW, height: evenH };
}

function selectBestRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264',
    'video/webm',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return '';
}

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export async function exportVideoInBrowser(
  params: ClientVideoExportParams
): Promise<RenderResult> {
  if (typeof document === 'undefined' || typeof MediaRecorder === 'undefined') {
    throw new Error('ဤ Browser တွင် ဗီဒီယို Render Export စနစ် (MediaRecorder) မပံ့ပိုးပါ။');
  }

  const {
    videoUrl,
    sourceFilename,
    cues,
    colorPresetId,
    brightness,
    contrast,
    saturation,
    fontName,
    fontSize,
    textColorId,
    subtitleX,
    subtitleY,
    subtitleAnimation,
    videoAspectId,
    videoFitMode,
    logoMeta,
    logoConfig,
    textLogoConfig,
    onProgress,
  } = params;

  onProgress?.(1);

  // Ensure Myanmar font is fully loaded for crisp Canvas text rendering
  try {
    await document.fonts.load(`700 32px "${fontName}"`);
    await document.fonts.ready;
  } catch {
    // Ignore font pre-load errors
  }

  const logoImg =
    logoMeta?.previewUrl && logoConfig.enabled
      ? await loadImageElement(logoMeta.previewUrl)
      : null;

  const videoEl = document.createElement('video');
  videoEl.src = videoUrl;
  videoEl.playsInline = true;
  videoEl.preload = 'auto';
  videoEl.muted = false;
  videoEl.volume = 1;
  videoEl.style.position = 'fixed';
  videoEl.style.left = '-99999px';
  videoEl.style.top = '-99999px';
  videoEl.style.width = '2px';
  videoEl.style.height = '2px';
  videoEl.style.opacity = '0.001';
  videoEl.style.pointerEvents = 'none';
  document.body.appendChild(videoEl);

  let audioCtx: AudioContext | null = null;
  let canvasStream: MediaStream | null = null;

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('ဗီဒီယိုဖိုင် Load လုပ်ချိန် ကြာမြင့်နေပါသည်။'));
      }, 25_000);

      const onReady = () => {
        clearTimeout(timeout);
        resolve();
      };
      const onErr = () => {
        clearTimeout(timeout);
        reject(
          new Error(
            'ဤဗီဒီယို Format ကို Browser မှ တိုက်ရိုက် Render လုပ်၍မရပါ။ MP4 / WebM / MOV ဖိုင်ဖြင့် ထပ်စမ်းကြည့်ပါ။'
          )
        );
      };
      if (videoEl.readyState >= 2) {
        onReady();
      } else {
        videoEl.addEventListener('loadeddata', onReady, { once: true });
        videoEl.addEventListener('error', onErr, { once: true });
      }
    });

    const duration = Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : 0;
    const { width: canvasW, height: canvasH } = resolveCanvasDimensions(
      videoEl.videoWidth,
      videoEl.videoHeight,
      videoAspectId
    );

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Canvas Context ဖန်တီး၍မရပါ။');
    }

    canvasStream = canvas.captureStream(30);
    const combinedTracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

    // Route video audio silently through Web Audio into MediaStreamAudioDestinationNode
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        audioCtx = new AudioCtx();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume().catch(() => {});
        }
        const sourceNode = audioCtx.createMediaElementSource(videoEl);
        const destNode = audioCtx.createMediaStreamDestination();
        sourceNode.connect(destNode);
        for (const aTrack of destNode.stream.getAudioTracks()) {
          combinedTracks.push(aTrack);
        }
      }
    } catch {
      // Fallback: continue export without audio if MediaElementSource fails
    }

    const combinedStream = new MediaStream(combinedTracks);
    const preferredMime = selectBestRecorderMimeType();
    const recorderOptions: MediaRecorderOptions = {
      videoBitsPerSecond: 4_500_000,
      audioBitsPerSecond: 128_000,
    };
    if (preferredMime) {
      recorderOptions.mimeType = preferredMime;
    }

    const recorder = new MediaRecorder(combinedStream, recorderOptions);
    const recordedChunks: Blob[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        recordedChunks.push(ev.data);
      }
    };

    const recorderStoppedPromise = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    const baseFilter = computeCssFilter(colorPresetId, brightness, contrast, saturation);
    const hasCustomAspect = videoAspectId !== 'original';
    const subColorSpec = SUBTITLE_COLORS[textColorId] ?? SUBTITLE_COLORS.white;
    const textLogoColorSpec = SUBTITLE_COLORS[textLogoConfig.colorId] ?? SUBTITLE_COLORS.rainbow;

    const drawVideoLayer = () => {
      const vw = videoEl.videoWidth || canvasW;
      const vh = videoEl.videoHeight || canvasH;
      const vRatio = vw / vh;
      const cRatio = canvasW / canvasH;

      ctx.save();
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvasW, canvasH);

      if (hasCustomAspect && videoFitMode === 'blur_fit') {
        // Draw blurred full-bleed backdrop
        let bw = canvasW;
        let bh = canvasH;
        if (vRatio > cRatio) {
          bh = canvasH * 1.1;
          bw = bh * vRatio;
        } else {
          bw = canvasW * 1.1;
          bh = bw / vRatio;
        }
        const bx = (canvasW - bw) / 2;
        const by = (canvasH - bh) / 2;
        ctx.filter =
          baseFilter !== 'none'
            ? `${baseFilter} blur(22px) brightness(0.76)`
            : 'blur(22px) brightness(0.76)';
        ctx.drawImage(videoEl, bx, by, bw, bh);
      }

      // Draw crisp foreground video
      let dw = canvasW;
      let dh = canvasH;
      if (hasCustomAspect && videoFitMode === 'crop_fill') {
        if (vRatio > cRatio) {
          dh = canvasH;
          dw = dh * vRatio;
        } else {
          dw = canvasW;
          dh = dw / vRatio;
        }
      } else {
        if (vRatio > cRatio) {
          dw = canvasW;
          dh = dw / vRatio;
        } else {
          dh = canvasH;
          dw = dh * vRatio;
        }
      }
      const dx = (canvasW - dw) / 2;
      const dy = (canvasH - dh) / 2;
      ctx.filter = baseFilter;
      ctx.drawImage(videoEl, dx, dy, dw, dh);
      ctx.restore();
    };

    const drawImageLogo = (tSec: number) => {
      if (!logoImg || !logoConfig.enabled) return;
      const targetW = Math.max(24, canvasW * (logoConfig.scalePct / 100));
      const aspect = (logoImg.naturalHeight || 1) / Math.max(1, logoImg.naturalWidth || 1);
      const targetH = targetW * aspect;
      const cx = (logoConfig.xPct / 100) * canvasW;
      const cy = (logoConfig.yPct / 100) * canvasH;

      let dy = 0;
      let dx = 0;
      let sx = 1;
      let sy = 1;
      let rot = 0;

      if (logoConfig.animation === 'float') {
        dy = -Math.sin((tSec * Math.PI * 2) / 2.4) * (canvasH * 0.008);
      } else if (logoConfig.animation === 'bounce') {
        const p = (tSec % 1.15) / 1.15;
        const hop = Math.max(0, Math.sin(p * Math.PI));
        dy = -hop * (canvasH * 0.015);
        sx = 1 + hop * 0.04;
        sy = 1 + hop * 0.07;
      } else if (logoConfig.animation === 'sway') {
        const s = Math.sin((tSec * Math.PI * 2) / 2.3);
        dx = s * (canvasW * 0.006);
        rot = s * 0.07;
      } else if (logoConfig.animation === 'pulse') {
        const sc = 1 + 0.09 * ((Math.sin((tSec * Math.PI * 2) / 1.75) + 1) / 2);
        sx = sc;
        sy = sc;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0.2, Math.min(1, logoConfig.opacity));
      ctx.translate(cx + dx, cy + dy);
      if (rot !== 0) ctx.rotate(rot);
      ctx.scale(sx, sy);
      ctx.drawImage(logoImg, -targetW / 2, -targetH / 2, targetW, targetH);
      ctx.restore();
    };

    const drawTextLogo = (tSec: number) => {
      const trimmed = textLogoConfig.text.trim();
      if (!textLogoConfig.enabled || !trimmed) return;

      const widthRatio = 0.036 + ((textLogoConfig.size - 14) / (42 - 14)) * 0.036;
      const pxSize = Math.max(14, Math.round(canvasW * widthRatio));
      ctx.save();
      ctx.globalAlpha = Math.max(0.2, Math.min(1, textLogoConfig.opacity));
      ctx.font = `700 ${pxSize}px "${fontName}", "Noto Sans Myanmar", sans-serif`;
      ctx.textBaseline = 'middle';

      const tokens = segmentLogoTextTokens(trimmed);
      const tokenWidths = tokens.map((tok) => ctx.measureText(tok).width);
      const totalWidth = tokenWidths.reduce((a, b) => a + b, 0);
      const cx = (textLogoConfig.xPct / 100) * canvasW;
      const cy = (textLogoConfig.yPct / 100) * canvasH;

      // Badge container if style is not minimal
      if (textLogoConfig.styleId !== 'minimal_white') {
        const padX = pxSize * 0.6;
        const padY = pxSize * 0.35;
        const boxW = Math.min(canvasW * 0.92, totalWidth + padX * 2);
        const boxH = pxSize * 1.25 + padY * 2;
        const bx = cx - boxW / 2;
        const by = cy - boxH / 2;
        drawRoundedRectPath(ctx, bx, by, boxW, boxH, 10);
        if (textLogoConfig.styleId === 'dark_glass') {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (textLogoConfig.styleId === 'amber_gold') {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)';
          ctx.lineWidth = 1.8;
          ctx.stroke();
        } else if (textLogoConfig.styleId === 'outline_badge') {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      }

      const palette = textLogoColorSpec.palette;
      const hasMulti = Array.isArray(palette) && palette.length > 1;
      let cursorX = cx - totalWidth / 2;
      let wordIdx = 0;

      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        const w = tokenWidths[i];
        if (/^\s+$/.test(tok)) {
          cursorX += w;
          continue;
        }

        const baseColor = hasMulti
          ? palette[wordIdx % palette.length].cssHex
          : textLogoColorSpec.cssHex;
        const stepSec = textLogoConfig.animationId === 'pulse' ? 0.085 : 0.1;
        const phase = tSec - wordIdx * stepSec;

        let dy = 0;
        let scale = 1;
        let rot = 0;
        let fillHex = baseColor;

        if (textLogoConfig.animationId === 'wave') {
          const s = Math.sin((phase * Math.PI * 2) / 1.3);
          dy = -Math.max(0, s) * (pxSize * 0.22);
          scale = 1 + Math.max(0, s) * 0.08;
          rot = s * 0.05;
        } else if (textLogoConfig.animationId === 'bounce') {
          const cycle = (((phase % 1.2) + 1.2) % 1.2) / 1.2;
          const hop = Math.sin(cycle * Math.PI);
          dy = -hop * (pxSize * 0.28);
          scale = 1 + hop * 0.14;
          rot = Math.sin(cycle * Math.PI * 2) * 0.05;
        } else if (textLogoConfig.animationId === 'rainbow_pop') {
          const cycle = (((phase % 1.25) + 1.25) % 1.25) / 1.25;
          const pop = Math.max(0, Math.sin(cycle * Math.PI));
          dy = -pop * (pxSize * 0.2);
          scale = 1 + pop * 0.16;
          if (hasMulti && pop > 0.5) {
            fillHex = palette[(wordIdx + 2) % palette.length].cssHex;
          }
        } else if (textLogoConfig.animationId === 'pulse') {
          const p = (Math.sin((phase * Math.PI * 2) / 1.5) + 1) / 2;
          scale = 1 + p * 0.14;
        }

        ctx.save();
        ctx.translate(cursorX + w / 2, cy + dy);
        if (rot !== 0) ctx.rotate(rot);
        ctx.scale(scale, scale);
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.92)';
        ctx.lineWidth = Math.max(3, pxSize * 0.16);
        ctx.strokeText(tok, 0, 0);
        ctx.fillStyle = fillHex;
        ctx.fillText(tok, 0, 0);
        ctx.restore();

        cursorX += w;
        wordIdx++;
      }

      ctx.restore();
    };

    const drawSubtitles = (tSec: number) => {
      const cue = cues.find((c) => tSec >= c.startSec && tSec <= c.endSec);
      if (!cue) return;

      const widthRatio = 0.038 + ((fontSize - 14) / (42 - 14)) * 0.034;
      const pxSize = Math.max(15, Math.round(canvasW * widthRatio));
      const lineHeight = pxSize * 1.32;

      ctx.save();
      ctx.font = `600 ${pxSize}px "${fontName}", "Noto Sans Myanmar", sans-serif`;
      ctx.textBaseline = 'middle';

      const maxLineWidth = canvasW * 0.88;
      const rawLines = cue.text.split('\n');
      const wrappedTokenLines: string[][] = [];

      for (const rawLine of rawLines) {
        const toks = segmentLineIntoTokens(rawLine);
        let currentLine: string[] = [];
        let currentWidth = 0;

        for (const tok of toks) {
          const tw = ctx.measureText(tok).width;
          if (currentLine.length > 0 && currentWidth + tw > maxLineWidth) {
            wrappedTokenLines.push(currentLine);
            currentLine = /^\s+$/.test(tok) ? [] : [tok];
            currentWidth = /^\s+$/.test(tok) ? 0 : tw;
          } else {
            currentLine.push(tok);
            currentWidth += tw;
          }
        }
        if (currentLine.length > 0) {
          wrappedTokenLines.push(currentLine);
        }
      }

      if (wrappedTokenLines.length === 0) {
        ctx.restore();
        return;
      }

      const lineWidths = wrappedTokenLines.map((toks) =>
        toks.reduce((sum, tok) => sum + ctx.measureText(tok).width, 0)
      );
      const boxW = Math.min(canvasW * 0.94, Math.max(...lineWidths) + pxSize * 1.1);
      const boxH = wrappedTokenLines.length * lineHeight + pxSize * 0.45;
      const cx = (subtitleX / 100) * canvasW;
      const cy = (subtitleY / 100) * canvasH;

      const elapsed = Math.max(0, tSec - cue.startSec);
      const cueDur = Math.max(0.45, cue.endSec - cue.startSec);

      let lineOffsetX = 0;
      let lineOffsetY = 0;
      let lineScale = 1;
      let lineAlpha = 1;

      if (subtitleAnimation === 'slide_run') {
        const p = Math.min(1, elapsed / 0.32);
        const eased = 1 - Math.pow(1 - p, 3);
        lineOffsetX = (1 - eased) * (canvasW * 0.08);
        lineAlpha = Math.min(1, p * 1.5);
      } else if (subtitleAnimation === 'karaoke_pop') {
        const p = Math.min(1, elapsed / 0.34);
        lineAlpha = Math.min(1, p * 2);
        lineScale = p < 0.55 ? 0.78 + (p / 0.55) * 0.32 : 1.1 - ((p - 0.55) / 0.45) * 0.1;
      } else if (subtitleAnimation === 'bounce') {
        const hop = Math.sin(elapsed * Math.PI * 2.1);
        lineOffsetY = -Math.max(0, hop) * (pxSize * 0.24);
        lineScale = 1 + Math.max(0, hop) * 0.05;
      }

      ctx.globalAlpha = lineAlpha;
      ctx.translate(cx + lineOffsetX, cy + lineOffsetY);
      if (lineScale !== 1) ctx.scale(lineScale, lineScale);

      // Subtle translucent dark backing for legibility (matching VideoMonitor bg-black/40)
      drawRoundedRectPath(ctx, -boxW / 2, -boxH / 2, boxW, boxH, 8);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.fill();

      const palette = subColorSpec.palette;
      const hasMulti = Array.isArray(palette) && palette.length > 1;
      const totalWords = wrappedTokenLines.reduce(
        (sum, toks) => sum + toks.filter((t) => !/^\s+$/.test(t)).length,
        0
      );
      const spreadSec = Math.max(0.25, Math.min(cueDur * 0.72, totalWords * 0.22));
      const stepSec = totalWords > 1 ? spreadSec / totalWords : 0;

      let wordIdx = 0;
      const topY = -((wrappedTokenLines.length - 1) * lineHeight) / 2;

      for (let lineIdx = 0; lineIdx < wrappedTokenLines.length; lineIdx++) {
        const toks = wrappedTokenLines[lineIdx];
        const totalLineW = lineWidths[lineIdx];
        let cursorX = -totalLineW / 2;
        const ly = topY + lineIdx * lineHeight;

        for (const tok of toks) {
          const tw = ctx.measureText(tok).width;
          if (/^\s+$/.test(tok)) {
            cursorX += tw;
            continue;
          }

          const fillHex = hasMulti
            ? palette[wordIdx % palette.length].cssHex
            : subColorSpec.cssHex;

          let wAlpha = 1;
          let wDy = 0;
          let wScale = 1;

          if (subtitleAnimation === 'word_pop') {
            const wordStart = wordIdx * stepSec;
            const localElapsed = elapsed - wordStart;
            if (localElapsed < 0) {
              wAlpha = 0;
            } else if (localElapsed < 0.33) {
              const p = localElapsed / 0.33;
              if (p < 0.58) {
                const subP = p / 0.58;
                wAlpha = subP;
                wDy = (1 - subP) * (pxSize * 0.35) - subP * (pxSize * 0.22);
                wScale = 0.42 + subP * 0.8;
              } else {
                const subP = (p - 0.58) / 0.42;
                wAlpha = 1;
                wDy = -(1 - subP) * (pxSize * 0.22);
                wScale = 1.22 - subP * 0.22;
              }
            }
          }

          if (wAlpha > 0.01) {
            ctx.save();
            ctx.globalAlpha = lineAlpha * wAlpha;
            ctx.translate(cursorX + tw / 2, ly + wDy);
            if (wScale !== 1) ctx.scale(wScale, wScale);
            ctx.textAlign = 'center';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = 'rgba(0,0,0,0.95)';
            ctx.lineWidth = Math.max(3.5, pxSize * 0.17);
            ctx.strokeText(tok, 0, 0);
            ctx.fillStyle = fillHex;
            ctx.fillText(tok, 0, 0);
            ctx.restore();
          }

          cursorX += tw;
          wordIdx++;
        }
      }

      ctx.restore();
    };

    const drawFrameAt = (tSec: number) => {
      drawVideoLayer();
      drawImageLogo(tSec);
      drawTextLogo(tSec);
      drawSubtitles(tSec);
    };

    videoEl.currentTime = 0;
    await new Promise<void>((resolve) => {
      if (videoEl.currentTime <= 0.05) {
        resolve();
        return;
      }
      videoEl.addEventListener('seeked', () => resolve(), { once: true });
    });

    drawFrameAt(0);
    recorder.start(250);

    await videoEl.play().catch(() => {
      throw new Error('ဗီဒီယို Render စတင်ဖွင့်၍မရပါ။ Play ခလုတ်နှိပ်ကြည့်ပြီး ထပ်စမ်းပါ။');
    });

    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };

      const renderLoop = () => {
        if (done) return;
        const t = videoEl.currentTime || 0;
        drawFrameAt(t);
        if (duration > 0) {
          onProgress?.(Math.min(99, Math.max(1, Math.round((t / duration) * 100))));
        }
        if (videoEl.ended || (duration > 0 && t >= duration - 0.03)) {
          finish();
          return;
        }
        const rvfc = (
          videoEl as HTMLVideoElement & {
            requestVideoFrameCallback?: (cb: () => void) => number;
          }
        ).requestVideoFrameCallback;
        if (typeof rvfc === 'function') {
          rvfc.call(videoEl, renderLoop);
        } else {
          requestAnimationFrame(renderLoop);
        }
      };

      videoEl.addEventListener('ended', finish, { once: true });
      renderLoop();
    });

    if (recorder.state !== 'inactive') {
      recorder.stop();
    }
    await recorderStoppedPromise;
    onProgress?.(100);

    const actualMime =
      recorder.mimeType || preferredMime || 'video/webm';
    const ext = actualMime.includes('mp4') ? 'mp4' : 'webm';
    const baseName = (sourceFilename || 'myanmar_mv_studio')
      .replace(/\.[^.]+$/, '')
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);
    const outFilename = `${baseName || 'myanmar_mv'}_graded.${ext}`;
    const finalBlob = new Blob(recordedChunks, { type: actualMime });
    if (finalBlob.size === 0) {
      throw new Error('Browser မှ ထုတ်လိုက်သော Video ဖိုင် အလွတ်ဖြစ်နေပါသည်။');
    }

    const blobUrl = URL.createObjectURL(finalBlob);
    const renderId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `render_${Date.now()}`;

    return {
      renderId,
      videoUrl: blobUrl,
      blobUrl,
      srtUrl: null,
      filename: outFilename,
      sizeBytes: finalBlob.size,
    };
  } finally {
    try {
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
    } catch {
      // Ignore cleanup errors
    }
    if (videoEl.parentNode) {
      videoEl.parentNode.removeChild(videoEl);
    }
    if (canvasStream) {
      for (const track of canvasStream.getTracks()) {
        track.stop();
      }
    }
    if (audioCtx) {
      void audioCtx.close().catch(() => {});
    }
  }
}
