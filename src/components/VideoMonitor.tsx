import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Eye,
  Film,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipBack,
  SkipForward,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  canRequestStorageAccess,
  getSessionRefreshHref,
  isEmbeddedIframe,
  isInAppBrowser,
} from '../lib/api';
import {
  formatTimecodeDisplay,
  segmentLineIntoTokens,
  segmentLogoTextTokens,
  type SrtCue,
} from '../lib/srt';
import {
  COLOR_PRESETS,
  SUBTITLE_COLORS,
  VIDEO_ASPECT_PRESETS,
  type LogoOverlayConfig,
  type RenderResult,
  type StudioVideoMeta,
  type SubtitleAnimationId,
  type SubtitleColorId,
  type SubtitlePositionId,
  type TextLogoConfig,
  type UploadedLogoMeta,
  type VideoAspectId,
  type VideoFitModeId,
} from '../lib/studioTypes';

interface VideoMonitorProps {
  localVideoUrl: string | null;
  videoMeta: StudioVideoMeta | null;
  isUploading: boolean;
  uploadProgress: number | null;
  uploadError: string | null;
  onSelectFile: (file: File) => void;
  onRetryUpload?: () => void;
  cues: SrtCue[];
  seekRequestTime: number | null;
  onSeekHandled: () => void;
  onTimeUpdateExternal?: (time: number) => void;
  onDurationChangeExternal?: (duration: number) => void;
  colorPresetId: string;
  brightness: number;
  contrast: number;
  saturation: number;
  fontName: string;
  fontSize: number;
  textColorId: SubtitleColorId;
  positionId: SubtitlePositionId;
  subtitleX: number;
  subtitleY: number;
  onChangeSubtitlePosition?: (xPct: number, yPct: number) => void;
  showPositionGuide?: boolean;
  subtitleAnimation: SubtitleAnimationId;
  videoAspectId: VideoAspectId;
  videoFitMode: VideoFitModeId;
  cookieAuthNeeded?: boolean;
  onUnlockPreviewCookies?: () => void;
  logoMeta: UploadedLogoMeta | null;
  logoConfig: LogoOverlayConfig;
  onChangeLogoPosition?: (xPct: number, yPct: number) => void;
  textLogoConfig: TextLogoConfig;
  onChangeTextLogoPosition?: (xPct: number, yPct: number) => void;
  renderResult: RenderResult | null;
  activeMonitorTab: 'preview' | 'rendered';
  onChangeMonitorTab: (tab: 'preview' | 'rendered') => void;
}

type DragTarget = 'subtitle' | 'logo' | 'text_logo';

export const VideoMonitor: React.FC<VideoMonitorProps> = ({
  localVideoUrl,
  videoMeta,
  isUploading,
  uploadProgress,
  uploadError,
  onSelectFile,
  onRetryUpload,
  cues,
  seekRequestTime,
  onSeekHandled,
  onTimeUpdateExternal,
  onDurationChangeExternal,
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
  onChangeSubtitlePosition,
  showPositionGuide = false,
  subtitleAnimation,
  videoAspectId,
  videoFitMode,
  cookieAuthNeeded = false,
  onUnlockPreviewCookies,
  logoMeta,
  logoConfig,
  onChangeLogoPosition,
  textLogoConfig,
  onChangeTextLogoPosition,
  renderResult,
  activeMonitorTab,
  onChangeMonitorTab,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const videoFrameRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragOriginRef = useRef<{
    target: DragTarget;
    pointerX: number;
    pointerY: number;
    startX: number;
    startY: number;
    frameW: number;
    frameH: number;
  } | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [draggingTarget, setDraggingTarget] = useState<DragTarget | null>(null);
  const [bypassFilter, setBypassFilter] = useState(false);
  const [videoPlaybackError, setVideoPlaybackError] = useState<string | null>(null);
  const [videoDimensions, setVideoDimensions] = useState<{ w: number; h: number }>({
    w: 1920,
    h: 1080,
  });
  const [frameWidth, setFrameWidth] = useState<number>(640);

  useEffect(() => {
    const el = videoFrameRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 20) {
        setFrameWidth(rect.width);
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [
    localVideoUrl,
    renderResult?.renderId,
    activeMonitorTab,
    videoDimensions.w,
    videoDimensions.h,
    videoAspectId,
    videoFitMode,
  ]);

  useEffect(() => {
    if (seekRequestTime !== null && videoRef.current) {
      videoRef.current.currentTime = seekRequestTime;
      if (bgVideoRef.current) {
        bgVideoRef.current.currentTime = seekRequestTime;
      }
      setCurrentTime(seekRequestTime);
      onSeekHandled();
    }
  }, [seekRequestTime, onSeekHandled]);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setVideoPlaybackError(null);
  }, [activeMonitorTab, localVideoUrl, renderResult?.renderId]);

  const activePreset = useMemo(
    () => COLOR_PRESETS.find((p) => p.id === colorPresetId) ?? COLOR_PRESETS[0],
    [colorPresetId]
  );

  const computedCssFilter = useMemo(() => {
    if (activeMonitorTab === 'rendered' || bypassFilter) {
      return 'none';
    }
    const parts: string[] = [];
    if (activePreset.previewFilter && activePreset.previewFilter !== 'none') {
      parts.push(activePreset.previewFilter);
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
  }, [activeMonitorTab, bypassFilter, activePreset, brightness, contrast, saturation]);

  const activeCue = useMemo(() => {
    if (activeMonitorTab === 'rendered') return null;
    return cues.find((c) => currentTime >= c.startSec && currentTime <= c.endSec) ?? null;
  }, [cues, currentTime, activeMonitorTab]);

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      if (bgVideoRef.current) {
        bgVideoRef.current.currentTime = el.currentTime;
        void bgVideoRef.current.play().catch(() => {});
      }
    } else {
      el.pause();
      bgVideoRef.current?.pause();
    }
  };

  const toggleMute = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setIsMuted(el.muted);
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = nextTime;
    }
    if (bgVideoRef.current) {
      bgVideoRef.current.currentTime = nextTime;
    }
    setCurrentTime(nextTime);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSelectFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onSelectFile(file);
    }
  };

  const videoSrc =
    activeMonitorTab === 'rendered' && renderResult
      ? renderResult.blobUrl || renderResult.videoUrl
      : localVideoUrl;

  const subtitleColorSpec = SUBTITLE_COLORS[textColorId] ?? SUBTITLE_COLORS.white;
  const activeAspectPreset = useMemo(
    () => VIDEO_ASPECT_PRESETS.find((p) => p.id === videoAspectId) ?? VIDEO_ASPECT_PRESETS[0],
    [videoAspectId]
  );
  const videoAspect =
    videoDimensions.w > 0 && videoDimensions.h > 0
      ? videoDimensions.w / videoDimensions.h
      : 16 / 9;
  const isCustomAspect = activeMonitorTab === 'preview' && activeAspectPreset.ratio !== null;
  const targetRatio =
    activeMonitorTab === 'rendered'
      ? videoAspect
      : activeAspectPreset.ratio ?? videoAspect;
  const isPortraitStage = Boolean(videoSrc) && targetRatio < 0.95;

  // Scale subtitle font proportionally to the actual video frame width so lines stay horizontal
  const scaledSubtitlePx = useMemo(() => {
    const widthRatio = 0.038 + ((fontSize - 14) / (42 - 14)) * 0.034;
    const rawPx = frameWidth * widthRatio;
    return Math.max(9.5, Math.min(44, Number(rawPx.toFixed(1))));
  }, [frameWidth, fontSize]);

  const displayCue = useMemo(() => {
    if (activeCue) return activeCue;
    if (activeMonitorTab === 'preview' && showPositionGuide) {
      return {
        index: 0,
        startSec: 0,
        endSec: 2.5,
        startTimestamp: '00:00:00,000',
        endTimestamp: '00:00:02,500',
        text: 'စာတန်းနေရာ နမူနာ (ဆွဲရွှေ့နိုင်သည်)',
      };
    }
    return null;
  }, [activeCue, activeMonitorTab, showPositionGuide]);

  const renderedCueTokens = useMemo(() => {
    if (!displayCue) return null;
    const palette = subtitleColorSpec.palette;
    const hasMultiColor = Array.isArray(palette) && palette.length > 1;
    const lines = displayCue.text.split('\n');
    const tokenizedLines = lines.map((line) => segmentLineIntoTokens(line));
    const totalWords = tokenizedLines.reduce(
      (sum, toks) => sum + toks.filter((t) => !/^\s+$/.test(t)).length,
      0
    );
    const durMs = Math.max(450, Math.round((displayCue.endSec - displayCue.startSec) * 1000));
    const spreadWindowMs = Math.max(250, Math.min(durMs * 0.72, totalWords * 220));
    const stepMs = totalWords > 1 ? spreadWindowMs / totalWords : 0;
    const shouldAnimateWordPop = Boolean(activeCue) && subtitleAnimation === 'word_pop';

    let wordIdx = 0;
    return tokenizedLines.map((toks, lineIdx) => (
      <React.Fragment key={`line-${lineIdx}`}>
        {lineIdx > 0 && <br />}
        {toks.map((tok, tokIdx) => {
          if (/^\s+$/.test(tok)) {
            return (
              <span key={`sp-${lineIdx}-${tokIdx}`} className="whitespace-pre">
                {tok}
              </span>
            );
          }
          const color = hasMultiColor
            ? palette[wordIdx % palette.length].cssHex
            : subtitleColorSpec.cssHex;
          const delayMs = Math.round(wordIdx * stepMs);
          wordIdx++;
          return (
            <span
              key={`tok-${lineIdx}-${tokIdx}`}
              style={{
                color,
                ...(shouldAnimateWordPop ? { animationDelay: `${delayMs}ms` } : {}),
              }}
              className={shouldAnimateWordPop ? 'inline-block mv-sub-word-pop' : 'inline'}
            >
              {tok}
            </span>
          );
        })}
      </React.Fragment>
    ));
  }, [displayCue, activeCue, subtitleColorSpec, subtitleAnimation]);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const scaledTextLogoPx = useMemo(() => {
    const widthRatio = 0.036 + ((textLogoConfig.size - 14) / (42 - 14)) * 0.036;
    const rawPx = frameWidth * widthRatio;
    return Math.max(9.5, Math.min(44, Number(rawPx.toFixed(1))));
  }, [frameWidth, textLogoConfig.size]);

  const textLogoColorSpec =
    SUBTITLE_COLORS[textLogoConfig.colorId] ?? SUBTITLE_COLORS.rainbow;

  const renderedTextLogoTokens = useMemo(() => {
    const trimmed = textLogoConfig.text.trim();
    if (!trimmed) return null;
    const tokens = segmentLogoTextTokens(trimmed);
    const palette = textLogoColorSpec.palette;
    const hasMultiColor = Array.isArray(palette) && palette.length > 1;
    const stepMs = textLogoConfig.animationId === 'pulse' ? 85 : 100;
    let wordIdx = 0;

    return tokens.map((tok, idx) => {
      if (/^\s+$/.test(tok)) {
        return (
          <span key={`lspace-${idx}`} className="whitespace-pre">
            {tok}
          </span>
        );
      }
      const color = hasMultiColor
        ? palette[wordIdx % palette.length].cssHex
        : textLogoColorSpec.cssHex;
      const delayMs = wordIdx * stepMs;
      wordIdx++;
      return (
        <span
          key={`ltok-${idx}`}
          style={{
            color,
            ...(textLogoConfig.animationId !== 'static'
              ? { animationDelay: `${delayMs}ms` }
              : {}),
          }}
          className={
            textLogoConfig.animationId !== 'static'
              ? `inline-block mv-logo-letter-${textLogoConfig.animationId}`
              : 'inline-block'
          }
        >
          {tok}
        </span>
      );
    });
  }, [textLogoConfig.text, textLogoConfig.animationId, textLogoColorSpec]);

  const textLogoBadgeClass = useMemo(() => {
    switch (textLogoConfig.styleId) {
      case 'dark_glass':
        return 'px-3 py-1 rounded-lg bg-black/65 backdrop-blur-sm border border-white/15 shadow-lg';
      case 'amber_gold':
        return 'px-3 py-1 rounded-lg bg-amber-500/20 border border-amber-400/75 shadow-md';
      case 'outline_badge':
        return 'px-3 py-1 rounded-md bg-black/35 border-2 border-amber-400/85';
      case 'minimal_white':
      default:
        return 'px-1.5 py-0.5';
    }
  }, [textLogoConfig.styleId]);

  const startOverlayDrag = (
    target: DragTarget,
    e: React.PointerEvent<HTMLElement>,
    startX: number,
    startY: number
  ) => {
    if (!videoFrameRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = videoFrameRef.current.getBoundingClientRect();
    if (rect.width <= 10 || rect.height <= 10) return;
    dragOriginRef.current = {
      target,
      pointerX: e.clientX,
      pointerY: e.clientY,
      startX,
      startY,
      frameW: rect.width,
      frameH: rect.height,
    };
    setDraggingTarget(target);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture optional
    }
  };

  const handleOverlayDragMove = (e: React.PointerEvent<HTMLElement>) => {
    const origin = dragOriginRef.current;
    if (!origin || draggingTarget !== origin.target) return;
    e.preventDefault();
    e.stopPropagation();

    const rawX = origin.startX + ((e.clientX - origin.pointerX) / origin.frameW) * 100;
    const rawY = origin.startY + ((e.clientY - origin.pointerY) / origin.frameH) * 100;
    const snappedX = Math.abs(rawX - 50) <= 2 ? 50 : rawX;
    const snappedY = Math.abs(rawY - 50) <= 2 ? 50 : rawY;

    if (origin.target === 'subtitle' && onChangeSubtitlePosition) {
      const clampedX = Math.round(Math.max(15, Math.min(85, snappedX)));
      const clampedY = Math.round(Math.max(8, Math.min(92, snappedY)));
      onChangeSubtitlePosition(clampedX, clampedY);
    } else if (origin.target === 'logo' && onChangeLogoPosition) {
      const clampedX = Math.round(Math.max(6, Math.min(94, snappedX)));
      const clampedY = Math.round(Math.max(6, Math.min(94, snappedY)));
      onChangeLogoPosition(clampedX, clampedY);
    } else if (origin.target === 'text_logo' && onChangeTextLogoPosition) {
      const clampedX = Math.round(Math.max(8, Math.min(92, snappedX)));
      const clampedY = Math.round(Math.max(8, Math.min(92, snappedY)));
      onChangeTextLogoPosition(clampedX, clampedY);
    }
  };

  const endOverlayDrag = (e?: React.PointerEvent<HTMLElement>) => {
    if (!draggingTarget) return;
    e?.stopPropagation();
    setDraggingTarget(null);
    dragOriginRef.current = null;
    if (e) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }
  };

  const seekRelative = (deltaSec: number) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const next = Math.max(0, Math.min(duration, v.currentTime + deltaSec));
    v.currentTime = next;
    if (bgVideoRef.current) {
      bgVideoRef.current.currentTime = next;
    }
    setCurrentTime(next);
  };

  return (
    <section
      aria-label="Video Monitor"
      className="flex flex-col border border-slate-800/80 bg-[#0B101B] rounded-2xl overflow-hidden"
    >
      {/* Monitor Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-800/80 bg-[#090D16]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-zinc-900 border border-zinc-800">
            <button
              type="button"
              onClick={() => onChangeMonitorTab('preview')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeMonitorTab === 'preview'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Live Preview
            </button>
            <button
              type="button"
              disabled={!renderResult}
              onClick={() => renderResult && onChangeMonitorTab('rendered')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                !renderResult
                  ? 'text-zinc-600 cursor-not-allowed'
                  : activeMonitorTab === 'rendered'
                  ? 'bg-amber-500 text-zinc-950 cursor-pointer'
                  : 'text-zinc-300 hover:text-white cursor-pointer'
              }`}
            >
              Final Render
            </button>
          </div>

          {videoMeta && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400 truncate">
              <span className="truncate max-w-[200px] text-zinc-300">{videoMeta.filename}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{formatBytes(videoMeta.sizeBytes)}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {videoDimensions.w}×{videoDimensions.h}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {videoSrc && activeMonitorTab === 'preview' && (
            <button
              type="button"
              onMouseDown={() => setBypassFilter(true)}
              onMouseUp={() => setBypassFilter(false)}
              onMouseLeave={() => setBypassFilter(false)}
              onClick={() => setBypassFilter((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                bypassFilter
                  ? 'bg-zinc-800 border-amber-500/60 text-amber-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
              }`}
              title="Compare Original vs Graded"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{bypassFilter ? 'Showing Original' : 'Compare Original'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-zinc-900 border border-zinc-800 text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{videoMeta ? 'ဗီဒီယိုပြောင်းမည်' : 'Upload Video'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,.mp4,.mov,.mkv,.webm,.avi,.m4v,.3gp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {/* Main Viewport Stage */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
        className={`relative w-full bg-[#06080B] flex items-center justify-center overflow-hidden ${
          isPortraitStage ? 'h-[60vh] min-h-[340px] max-h-[540px]' : 'aspect-video'
        } ${isDraggingOver ? 'ring-2 ring-inset ring-amber-500/80' : ''}`}
      >
        {!videoSrc ? (
          <div className="flex flex-col items-center justify-center gap-3 p-6 text-center max-w-md">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex flex-col items-center justify-center gap-3.5 p-4 text-center cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-2xl disabled:opacity-60"
            >
              <div className="w-16 h-16 rounded-full bg-blue-500/15 border border-blue-500/35 flex items-center justify-center text-blue-400 group-hover:bg-blue-500/25 group-hover:border-blue-400/60 transition-colors">
                <Upload className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-base sm:text-lg font-semibold text-slate-100">
                  {isUploading
                    ? uploadProgress !== null
                      ? `ဗီဒီယိုဖိုင် တင်နေပါသည် (${uploadProgress}%)...`
                      : 'ဗီဒီယိုဖိုင် တင်နေပါသည်...'
                    : 'ဗီဒီယို ထည့်ရန် နှိပ်ပါ'}
                </p>
                <p className="text-xs text-slate-400">
                  MP4, MOV, WebM, MKV · AI စာတန်းထိုး · Color Grading · Logo
                </p>
              </div>
            </button>

            {uploadError && (
              <div className="space-y-2 w-full">
                <p className="text-xs text-red-300 bg-red-950/60 border border-red-900/70 px-3 py-2 rounded-lg">
                  {uploadError}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {cookieAuthNeeded && typeof window !== 'undefined' && (
                    <a
                      href={`${getSessionRefreshHref()}?ts=${Date.now()}`}
                      target={isEmbeddedIframe() || isInAppBrowser() ? '_blank' : undefined}
                      rel={isEmbeddedIframe() || isInAppBrowser() ? 'noopener noreferrer' : undefined}
                      className="px-3 py-1.5 rounded-md bg-sky-500 hover:bg-sky-400 text-zinc-950 text-xs font-semibold"
                    >
                      Chrome Tab အသစ်တွင် ဖွင့်မည်
                    </a>
                  )}
                  {onRetryUpload && (
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={onRetryUpload}
                      className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      ပြန်တင်မည် (Retry)
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            ref={videoFrameRef}
            style={{ aspectRatio: String(targetRatio) }}
            className={`relative flex items-center justify-center overflow-hidden bg-black ${
              isPortraitStage
                ? 'h-full max-w-full'
                : targetRatio >= 16 / 9
                ? 'w-full max-h-full'
                : 'h-full max-w-full'
            }`}
          >
            {/* Blurred Bokeh Video Backdrop for Custom Aspect Blur Fit */}
            {isCustomAspect && videoFitMode === 'blur_fit' && (
              <video
                ref={bgVideoRef}
                src={videoSrc}
                muted
                playsInline
                aria-hidden="true"
                style={{
                  filter:
                    computedCssFilter !== 'none'
                      ? `${computedCssFilter} blur(18px) brightness(0.76)`
                      : 'blur(18px) brightness(0.76)',
                }}
                className="pointer-events-none absolute inset-0 w-full h-full object-cover scale-110 select-none"
              />
            )}

            <video
              ref={videoRef}
              src={videoSrc}
              playsInline
              controls={activeMonitorTab === 'rendered'}
              onClick={activeMonitorTab === 'rendered' ? undefined : togglePlay}
              onLoadedMetadata={(e) => {
                setVideoPlaybackError(null);
                const v = e.currentTarget;
                const d = v.duration || 0;
                setDuration(d);
                onDurationChangeExternal?.(d);
                if (v.videoWidth && v.videoHeight) {
                  setVideoDimensions({ w: v.videoWidth, h: v.videoHeight });
                }
              }}
              onCanPlay={() => setVideoPlaybackError(null)}
              onError={() => {
                setVideoPlaybackError(
                  'ဤဗီဒီယို Format/Codec ကို ဖုန်း Browser Preview တွင် တိုက်ရိုက်မဖွင့်နိုင်သော်လည်း Server သို့ တင်ပြီး AI စာတန်းထိုးနှင့် MP4 Export ပြုလုပ်နိုင်ပါသည် (သို့မဟုတ် MP4/MOV ဖိုင် ပြောင်းရွေးနိုင်ပါသည်)။'
                );
              }}
              onTimeUpdate={(e) => {
                const t = e.currentTarget.currentTime;
                setCurrentTime(t);
                onTimeUpdateExternal?.(t);
                if (bgVideoRef.current && Math.abs(bgVideoRef.current.currentTime - t) > 0.25) {
                  bgVideoRef.current.currentTime = t;
                }
              }}
              onSeeked={(e) => {
                if (bgVideoRef.current) {
                  bgVideoRef.current.currentTime = e.currentTarget.currentTime;
                }
              }}
              onPlay={() => {
                setIsPlaying(true);
                if (bgVideoRef.current && videoRef.current) {
                  bgVideoRef.current.currentTime = videoRef.current.currentTime;
                  void bgVideoRef.current.play().catch(() => {});
                }
              }}
              onPause={() => {
                setIsPlaying(false);
                bgVideoRef.current?.pause();
              }}
              onEnded={() => {
                setIsPlaying(false);
                bgVideoRef.current?.pause();
              }}
              style={{ filter: computedCssFilter }}
              className={`relative z-10 w-full h-full ${
                isCustomAspect && videoFitMode === 'crop_fill'
                  ? 'object-cover'
                  : 'object-contain'
              } cursor-pointer transition-[filter] duration-150`}
            />

            {/* Alignment Crosshair Guides while Dragging Overlays */}
            {activeMonitorTab === 'preview' && draggingTarget !== null && (
              <>
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-amber-400/40 z-20"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-amber-400/40 z-20"
                />
              </>
            )}

            {/* Synchronized & Draggable Custom Image Logo Overlay */}
            {activeMonitorTab === 'preview' &&
              logoMeta &&
              logoConfig.enabled &&
              !bypassFilter && (
                <div
                  style={{
                    left: `${logoConfig.xPct}%`,
                    top: `${logoConfig.yPct}%`,
                    transform: 'translate(-50%, -50%)',
                    width: `${logoConfig.scalePct}%`,
                    opacity: logoConfig.opacity,
                  }}
                  onPointerDown={(e) => {
                    if (!onChangeLogoPosition) return;
                    startOverlayDrag('logo', e, logoConfig.xPct, logoConfig.yPct);
                  }}
                  onPointerMove={handleOverlayDragMove}
                  onPointerUp={endOverlayDrag}
                  onPointerCancel={() => endOverlayDrag()}
                  onClick={(e) => e.stopPropagation()}
                  title="Logo ကို လက်ဖြင့်ဆွဲ၍ စိတ်ကြိုက်နေရာ ရွှေ့နိုင်ပါသည်"
                  className={`absolute z-30 flex flex-col items-center touch-none select-none ${
                    onChangeLogoPosition
                      ? 'pointer-events-auto cursor-grab active:cursor-grabbing'
                      : 'pointer-events-none'
                  }`}
                >
                  {draggingTarget === 'logo' && (
                    <span className="mb-1 px-2 py-0.5 rounded bg-amber-500 text-zinc-950 font-mono text-[10px] font-semibold tabular-nums whitespace-nowrap shadow">
                      Logo X: {logoConfig.xPct}% · Y: {logoConfig.yPct}%
                    </span>
                  )}
                  <img
                    src={logoMeta.previewUrl}
                    alt="Custom Logo Preview"
                    referrerPolicy="no-referrer"
                    className={`w-full h-auto object-contain select-none rounded ${
                      draggingTarget === 'logo' ? 'ring-1 ring-amber-400/90' : ''
                    } ${
                      logoConfig.animation !== 'static'
                        ? `mv-logo-anim-${logoConfig.animation}`
                        : ''
                    }`}
                  />
                </div>
              )}

            {/* Synchronized & Draggable Per-Letter Animated Text Logo Overlay */}
            {activeMonitorTab === 'preview' &&
              textLogoConfig.enabled &&
              renderedTextLogoTokens &&
              !bypassFilter && (
                <div
                  style={{
                    left: `${textLogoConfig.xPct}%`,
                    top: `${textLogoConfig.yPct}%`,
                    transform: 'translate(-50%, -50%)',
                    maxWidth: '90%',
                    opacity: textLogoConfig.opacity,
                  }}
                  onPointerDown={(e) => {
                    if (!onChangeTextLogoPosition) return;
                    startOverlayDrag('text_logo', e, textLogoConfig.xPct, textLogoConfig.yPct);
                  }}
                  onPointerMove={handleOverlayDragMove}
                  onPointerUp={endOverlayDrag}
                  onPointerCancel={() => endOverlayDrag()}
                  onClick={(e) => e.stopPropagation()}
                  title="စာသား Logo ကို လက်ဖြင့်ဆွဲ၍ စိတ်ကြိုက်နေရာ ရွှေ့နိုင်ပါသည်"
                  className={`absolute z-30 flex flex-col items-center touch-none select-none ${
                    onChangeTextLogoPosition
                      ? 'pointer-events-auto cursor-grab active:cursor-grabbing'
                      : 'pointer-events-none'
                  }`}
                >
                  {draggingTarget === 'text_logo' && (
                    <span className="mb-1 px-2 py-0.5 rounded bg-amber-500 text-zinc-950 font-mono text-[10px] font-semibold tabular-nums whitespace-nowrap shadow">
                      Text X: {textLogoConfig.xPct}% · Y: {textLogoConfig.yPct}%
                    </span>
                  )}
                  <div
                    key={`text-logo-${textLogoConfig.animationId}-${textLogoConfig.colorId}-${textLogoConfig.styleId}`}
                    style={{
                      fontFamily: `"${fontName}", "Noto Sans Myanmar", sans-serif`,
                      fontSize: `${scaledTextLogoPx}px`,
                      textShadow:
                        '0 2px 4px rgba(0,0,0,0.95), -1px -1px 0 rgba(0,0,0,0.9), 1px -1px 0 rgba(0,0,0,0.9), -1px 1px 0 rgba(0,0,0,0.9), 1px 1px 0 rgba(0,0,0,0.9)',
                    }}
                    className={`w-max max-w-full text-center font-bold leading-tight whitespace-nowrap ${textLogoBadgeClass} ${
                      draggingTarget === 'text_logo' ? 'ring-1 ring-amber-400/90' : ''
                    }`}
                  >
                    {renderedTextLogoTokens}
                  </div>
                </div>
              )}

            {/* Synchronized Live Subtitle Overlay during Preview (Draggable) */}
            {displayCue && activeMonitorTab === 'preview' && (
              <div
                style={{
                  left: `${subtitleX}%`,
                  top: `${subtitleY}%`,
                  transform: 'translate(-50%, -50%)',
                  maxWidth: '94%',
                }}
                onPointerDown={(e) => {
                  if (!onChangeSubtitlePosition) return;
                  startOverlayDrag('subtitle', e, subtitleX, subtitleY);
                }}
                onPointerMove={handleOverlayDragMove}
                onPointerUp={endOverlayDrag}
                onPointerCancel={() => endOverlayDrag()}
                onClick={(e) => e.stopPropagation()}
                title={positionId ? 'စာတန်းကို လက်ဖြင့်ဆွဲ၍ နေရာရွှေ့နိုင်ပါသည်' : undefined}
                className={`absolute z-30 flex flex-col items-center touch-none select-none ${
                  onChangeSubtitlePosition
                    ? 'pointer-events-auto cursor-grab active:cursor-grabbing'
                    : 'pointer-events-none'
                }`}
              >
                {draggingTarget === 'subtitle' && (
                  <span className="mb-1 px-2 py-0.5 rounded bg-amber-500 text-zinc-950 font-mono text-[10px] font-semibold tabular-nums whitespace-nowrap shadow">
                    X: {subtitleX}% · Y: {subtitleY}%
                  </span>
                )}
                <div
                  key={
                    activeCue
                      ? `${displayCue.index}-${displayCue.startSec}-${subtitleAnimation}-${textColorId}`
                      : `guide-${textColorId}`
                  }
                  style={{
                    fontFamily: `"${fontName}", "Noto Sans Myanmar", sans-serif`,
                    fontSize: `${scaledSubtitlePx}px`,
                    color: subtitleColorSpec.cssHex,
                    textShadow:
                      '0 2px 4px rgba(0,0,0,0.95), -1px -1px 0 rgba(0,0,0,0.9), 1px -1px 0 rgba(0,0,0,0.9), -1px 1px 0 rgba(0,0,0,0.9), 1px 1px 0 rgba(0,0,0,0.9)',
                  }}
                  className={`w-max max-w-full text-center font-semibold leading-snug break-words px-2 py-0.5 rounded bg-black/40 ${
                    draggingTarget === 'subtitle' || (!activeCue && showPositionGuide)
                      ? 'ring-1 ring-amber-400/80'
                      : ''
                  } ${
                    activeCue &&
                    subtitleAnimation !== 'static' &&
                    subtitleAnimation !== 'word_pop'
                      ? `mv-sub-anim-${subtitleAnimation}`
                      : ''
                  }`}
                >
                  {renderedCueTokens}
                </div>
              </div>
            )}

            {/* Uploading Overlay */}
            {isUploading && (
              <div className="absolute inset-0 z-40 bg-black/70 flex flex-col items-center justify-center gap-2">
                <div className="w-7 h-7 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                <p className="text-xs font-medium text-zinc-200 tabular-nums">
                  {uploadProgress !== null
                    ? `Server သို့ ဗီဒီယိုပို့နေပါသည် (${uploadProgress}%)...`
                    : 'Server သို့ ဗီဒီယိုပို့နေပါသည်...'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Visible Codec Preview Warning Banner (if mobile browser cannot decode MKV/HEVC) */}
      {videoPlaybackError && videoSrc && !isUploading && (
        <div className="px-4 py-2 bg-amber-500/10 border-t border-amber-500/30 flex items-center justify-between gap-2">
          <p className="text-xs text-amber-200 leading-relaxed">{videoPlaybackError}</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
          >
            ဗီဒီယိုပြောင်းမည်
          </button>
        </div>
      )}

      {/* Visible Upload Error Banner (even when local video preview is playing) */}
      {uploadError && videoSrc && (
        <div className="px-4 py-2.5 bg-red-950/60 border-t border-red-900/70 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-red-200">{uploadError}</p>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {cookieAuthNeeded &&
              isEmbeddedIframe() &&
              canRequestStorageAccess() &&
              onUnlockPreviewCookies && (
                <button
                  type="button"
                  onClick={onUnlockPreviewCookies}
                  className="px-3 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Preview ထဲတွင် ခွင့်ပြုချက်စမ်းမည်
                </button>
              )}
            {cookieAuthNeeded && typeof window !== 'undefined' && (
              <a
                href={`${getSessionRefreshHref()}?ts=${Date.now()}`}
                target={isEmbeddedIframe() || isInAppBrowser() ? '_blank' : undefined}
                rel={isEmbeddedIframe() || isInAppBrowser() ? 'noopener noreferrer' : undefined}
                className="px-3 py-1 rounded-md bg-sky-500 hover:bg-sky-400 text-zinc-950 text-xs font-semibold whitespace-nowrap shrink-0"
              >
                {isEmbeddedIframe() || isInAppBrowser()
                  ? 'Chrome Tab အသစ်တွင် ဖွင့်မည်'
                  : 'Security / Login ပြန်ချိတ်ဆက်မည်'}
              </a>
            )}
            {onRetryUpload && (
              <button
                type="button"
                disabled={isUploading}
                onClick={onRetryUpload}
                className="px-3 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                ပြန်တင်မည် (Retry)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Transport Controls */}
      <div className="px-4 py-3 border-t border-slate-800/80 bg-[#090D16] flex flex-col gap-2.5">
        {duration > 0 && (
          <div className="relative flex items-center">
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.05}
              value={Math.min(currentTime, duration || 1)}
              onChange={handleScrub}
              aria-label="Video timeline"
              className="studio-slider w-full cursor-pointer"
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!videoSrc}
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = 0;
                  if (bgVideoRef.current) {
                    bgVideoRef.current.currentTime = 0;
                  }
                  setCurrentTime(0);
                }
              }}
              aria-label="Restart"
              title="အစမှပြန်ဖွင့်မည်"
              className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={!videoSrc}
              onClick={toggleMute}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              title={isMuted ? 'အသံဖွင့်မည်' : 'အသံပိတ်မည်'}
              className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!videoSrc}
              onClick={() => seekRelative(-5)}
              aria-label="Back 5 seconds"
              title="5s နောက်ဆုတ်မည်"
              className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              type="button"
              disabled={!videoSrc}
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="w-11 h-11 rounded-full bg-blue-600/25 border border-blue-500/60 flex items-center justify-center text-blue-100 hover:bg-blue-600/40 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>

            <button
              type="button"
              disabled={!videoSrc}
              onClick={() => seekRelative(5)}
              aria-label="Forward 5 seconds"
              title="5s ရှေ့တိုးမည်"
              className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          <div className="font-mono text-xs tabular-nums text-slate-300 text-right shrink-0">
            <span>{formatTimecodeDisplay(currentTime)}</span>
            <span className="text-slate-600 mx-1">/</span>
            <span className="text-slate-500">{formatTimecodeDisplay(duration)}</span>
          </div>
        </div>
      </div>

      {/* Mini Interactive Timeline Track (matching NLE workflow) */}
      <div className="px-4 py-2.5 border-t border-slate-800/80 bg-[#080B12] flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          aria-label={videoSrc ? 'ဗီဒီယိုပြောင်းမည်' : 'ဗီဒီယိုထည့်မည်'}
          title={videoSrc ? 'ဗီဒီယိုပြောင်းမည်' : 'ဗီဒီယိုထည့်မည်'}
          className="w-11 h-11 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors disabled:opacity-50"
        >
          <Plus className="w-5 h-5" />
        </button>

        <div className="relative flex-1 h-11 rounded-xl border border-dashed border-slate-700/80 bg-[#0D121F] overflow-hidden flex items-center px-2">
          {!videoSrc ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-full flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <Film className="w-3.5 h-3.5 text-slate-500" />
              <span>ဗီဒီယို ထည့်ရန် + ကို နှိပ်ပါ</span>
            </button>
          ) : (
            <>
              <div className="w-full h-6 relative rounded-md bg-slate-900/90 border border-slate-800/80 overflow-hidden">
                {duration > 0 &&
                  cues.map((cue, idx) => {
                    const leftPct = Math.max(0, Math.min(100, (cue.startSec / duration) * 100));
                    const widthPct = Math.max(
                      1.2,
                      Math.min(100 - leftPct, ((cue.endSec - cue.startSec) / duration) * 100)
                    );
                    const isCueActive =
                      currentTime >= cue.startSec && currentTime <= cue.endSec;
                    return (
                      <button
                        key={`${cue.index}-${idx}`}
                        type="button"
                        onClick={() => {
                          if (videoRef.current) {
                            videoRef.current.currentTime = cue.startSec;
                            if (bgVideoRef.current) {
                              bgVideoRef.current.currentTime = cue.startSec;
                            }
                            setCurrentTime(cue.startSec);
                          }
                        }}
                        title={cue.text}
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        className={`absolute top-0.5 bottom-0.5 rounded-sm transition-colors cursor-pointer ${
                          isCueActive
                            ? 'bg-blue-500/85 border border-blue-300/70'
                            : 'bg-blue-500/30 hover:bg-blue-500/50 border border-blue-400/20'
                        }`}
                      />
                    );
                  })}
                {cues.length === 0 && (
                  <div className="w-full h-full flex items-center justify-between px-2.5 text-[11px] text-slate-400 truncate">
                    <span className="truncate">{videoMeta?.filename || 'Loaded Video Track'}</span>
                    <span className="font-mono tabular-nums text-slate-500 shrink-0 ml-2">
                      {activeAspectPreset.shortMy} · {activePreset.label}
                    </span>
                  </div>
                )}
              </div>

              {duration > 0 && (
                <div
                  aria-hidden="true"
                  style={{
                    left: `${Math.max(0, Math.min(100, (currentTime / duration) * 100))}%`,
                  }}
                  className="pointer-events-none absolute top-1 bottom-1 w-0.5 bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.9)]"
                />
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
};
