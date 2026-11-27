import React, { useEffect, useState } from 'react';
import {
  Check,
  Clapperboard,
  Clock,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileDown,
  FileText,
  ImagePlus,
  KeyRound,
  Languages,
  Maximize2,
  RotateCcw,
  Share2,
  Sliders,
  Sparkles,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import {
  isEmbeddedIframe,
  isInAppBrowser,
  triggerBlobDownload,
} from '../lib/api';
import { cleanGeminiApiKey } from '../lib/clientGemini';
import {
  formatSecondsToClock,
  offsetSrtCues,
  serializeSrt,
  type SrtCue,
} from '../lib/srt';
import {
  COLOR_PRESETS,
  CREATOR_FACEBOOK_URL,
  GEMINI_MODELS,
  LOGO_ANIMATIONS,
  LOGO_POSITIONS,
  MYANMAR_FONTS,
  SUBTITLE_ANIMATIONS,
  SUBTITLE_COLORS,
  SUBTITLE_MODES,
  SUBTITLE_POSITIONS,
  TEXT_LOGO_ANIMATIONS,
  VIDEO_ASPECT_PRESETS,
  VIDEO_FIT_MODES,
  type GeminiModelId,
  type LogoOverlayConfig,
  type RenderResult,
  type StudioToolId,
  type SubtitleAnimationId,
  type SubtitleColorId,
  type SubtitleModeId,
  type SubtitlePositionId,
  type TextLogoConfig,
  type UploadedLogoMeta,
  type VideoAspectId,
  type VideoFitModeId,
} from '../lib/studioTypes';
import { LogoStudioPanel } from './LogoStudioPanel';

interface StudioToolDeckProps {
  hasVideo: boolean;
  hasLocalVideo?: boolean;
  openToolId: StudioToolId | null;
  onToggleTool: (toolId: StudioToolId) => void;
  onOpenTool: (toolId: StudioToolId) => void;

  // Tool 1: AI Subtitle Generator (Direct Client-Side Gemini)
  geminiApiKey: string;
  onSaveGeminiApiKey: (key: string) => void;
  modeId: SubtitleModeId;
  onChangeMode: (mode: SubtitleModeId) => void;
  modelId: GeminiModelId;
  onChangeModel: (model: GeminiModelId) => void;
  translationScope: 'full' | 'range';
  onChangeTranslationScope: (scope: 'full' | 'range') => void;
  rangeStartInput: string;
  onChangeRangeStartInput: (val: string) => void;
  rangeEndInput: string;
  onChangeRangeEndInput: (val: string) => void;
  mergeRangeIntoExisting: boolean;
  onChangeMergeRangeIntoExisting: (val: boolean) => void;
  customPrompt: string;
  onChangeCustomPrompt: (val: string) => void;
  videoDuration: number;
  isGenerating: boolean;
  generateProgressText?: string | null;
  generateError: string | null;
  onGenerateSubtitles: () => void;

  // Tool 2: SRT Editor & Sync
  srtText: string;
  onChangeSrtText: (text: string) => void;
  cues: SrtCue[];
  currentTime: number;
  isTranslatingSrt: boolean;
  onTranslateExistingSrt: () => void;
  onSeekTo: (seconds: number) => void;

  // Tool 3: Color Grading
  colorPresetId: string;
  onChangeColorPreset: (id: string) => void;
  brightness: number;
  onChangeBrightness: (val: number) => void;
  contrast: number;
  onChangeContrast: (val: number) => void;
  saturation: number;
  onChangeSaturation: (val: number) => void;
  onResetAdjustments: () => void;

  // Tool 4: 10 Myanmar Fonts & Subtitle Style
  fontName: string;
  onChangeFontName: (name: string) => void;
  fontSize: number;
  onChangeFontSize: (size: number) => void;
  textColorId: SubtitleColorId;
  onChangeTextColor: (colorId: SubtitleColorId) => void;
  positionId: SubtitlePositionId;
  onChangePosition: (posId: SubtitlePositionId) => void;
  subtitleX: number;
  subtitleY: number;
  onChangeSubtitlePosition: (xPct: number, yPct: number) => void;
  onShowPositionGuide: () => void;
  subtitleAnimation: SubtitleAnimationId;
  onChangeSubtitleAnimation: (anim: SubtitleAnimationId) => void;

  // Tool 5: Custom Logo / Animated Text Logo
  logoMeta: UploadedLogoMeta | null;
  logoConfig: LogoOverlayConfig;
  textLogoConfig: TextLogoConfig;
  isUploadingLogo: boolean;
  logoError: string | null;
  onUploadLogoFile: (file: File) => void;
  onChangeLogoConfig: (next: LogoOverlayConfig) => void;
  onChangeTextLogoConfig: (next: TextLogoConfig) => void;
  onRemoveLogo: () => void;

  // Tool 6: Video Size / Aspect Ratio (TikTok / YouTube)
  videoAspectId: VideoAspectId;
  onChangeVideoAspect: (id: VideoAspectId) => void;
  videoFitMode: VideoFitModeId;
  onChangeVideoFitMode: (mode: VideoFitModeId) => void;

  // Export & Download
  isRendering: boolean;
  renderProgress?: number | null;
  isDownloadingMp4: boolean;
  downloadProgress?: number | null;
  renderError: string | null;
  renderResult: RenderResult | null;
  onRenderVideo: () => void;
  onDownloadMp4: () => void;
  onShareMp4?: () => void;
  canShareMp4?: boolean;
  onDownloadSrt: () => void;
  onPreviewRendered: () => void;
}

export const StudioToolDeck: React.FC<StudioToolDeckProps> = ({
  hasVideo,
  hasLocalVideo = false,
  openToolId,
  onToggleTool,
  onOpenTool,
  geminiApiKey,
  onSaveGeminiApiKey,
  modeId,
  onChangeMode,
  modelId,
  onChangeModel,
  translationScope,
  onChangeTranslationScope,
  rangeStartInput,
  onChangeRangeStartInput,
  rangeEndInput,
  onChangeRangeEndInput,
  mergeRangeIntoExisting,
  onChangeMergeRangeIntoExisting,
  customPrompt,
  onChangeCustomPrompt,
  videoDuration,
  isGenerating,
  generateProgressText = null,
  generateError,
  onGenerateSubtitles,
  srtText,
  onChangeSrtText,
  cues,
  currentTime,
  isTranslatingSrt,
  onTranslateExistingSrt,
  onSeekTo,
  colorPresetId,
  onChangeColorPreset,
  brightness,
  onChangeBrightness,
  contrast,
  onChangeContrast,
  saturation,
  onChangeSaturation,
  onResetAdjustments,
  fontName,
  onChangeFontName,
  fontSize,
  onChangeFontSize,
  textColorId,
  onChangeTextColor,
  positionId,
  onChangePosition,
  subtitleX,
  subtitleY,
  onChangeSubtitlePosition,
  onShowPositionGuide,
  subtitleAnimation,
  onChangeSubtitleAnimation,
  logoMeta,
  logoConfig,
  textLogoConfig,
  isUploadingLogo,
  logoError,
  onUploadLogoFile,
  onChangeLogoConfig,
  onChangeTextLogoConfig,
  onRemoveLogo,
  videoAspectId,
  onChangeVideoAspect,
  videoFitMode,
  onChangeVideoFitMode,
  isRendering,
  renderProgress = null,
  isDownloadingMp4,
  downloadProgress,
  renderError,
  renderResult,
  onRenderVideo,
  onDownloadMp4,
  onShareMp4,
  canShareMp4,
  onDownloadSrt,
  onPreviewRendered,
}) => {
  const [editorTab, setEditorTab] = useState<'raw' | 'cues'>('raw');
  const [apiKeyDraft, setApiKeyDraft] = useState<string>(geminiApiKey);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [showApiKeyEditor, setShowApiKeyEditor] = useState<boolean>(!geminiApiKey);
  const [apiKeySavedFlash, setApiKeySavedFlash] = useState<boolean>(false);

  useEffect(() => {
    setApiKeyDraft(geminiApiKey);
    if (!geminiApiKey.trim()) {
      setShowApiKeyEditor(true);
    }
  }, [geminiApiKey]);

  const commitApiKeySave = (raw: string) => {
    const clean = cleanGeminiApiKey(raw);
    setApiKeyDraft(clean);
    onSaveGeminiApiKey(clean);
    if (clean) {
      setShowApiKeyEditor(false);
      setApiKeySavedFlash(true);
      setTimeout(() => setApiKeySavedFlash(false), 2600);
    }
  };

  const activeModeShort =
    SUBTITLE_MODES.find((m) => m.id === modeId)?.shortLabel ?? 'Foreign -> Burmese';
  const activeModelLabel =
    GEMINI_MODELS.find((m) => m.id === modelId)?.label ?? 'Gemini 3.5 Flash Lite';
  const activePresetLabel =
    COLOR_PRESETS.find((p) => p.id === colorPresetId)?.label ?? 'Original';
  const activeFontSpec =
    MYANMAR_FONTS.find((f) => f.fontFamily === fontName) ?? MYANMAR_FONTS[0];
  const activeColorSpec = SUBTITLE_COLORS[textColorId] ?? SUBTITLE_COLORS.rainbow;
  const activePosLabel =
    positionId === 'custom'
      ? `စိတ်ကြိုက် (${subtitleY}%)`
      : SUBTITLE_POSITIONS[positionId].shortMy;
  const activeAnimLabel =
    SUBTITLE_ANIMATIONS.find((a) => a.id === subtitleAnimation)?.shortMy ?? 'တစ်လုံးချင်း ခုန်ဖောက်';
  const activeLogoPosLabel =
    logoConfig.position === 'custom'
      ? `${logoConfig.xPct}%,${logoConfig.yPct}%`
      : LOGO_POSITIONS.find((p) => p.id === logoConfig.position)?.labelMy ?? 'ညာအပေါ်';
  const activeLogoAnimShort =
    LOGO_ANIMATIONS.find((a) => a.id === logoConfig.animation)?.shortMy ?? 'လွင့်မျော';
  const activeTextLogoAnimShort =
    TEXT_LOGO_ANIMATIONS.find((a) => a.id === textLogoConfig.animationId)?.shortMy ?? 'လှိုင်းတွန့်';
  const hasActiveTextLogo =
    textLogoConfig.enabled && textLogoConfig.text.trim().length > 0;
  const activeAspectSpec =
    VIDEO_ASPECT_PRESETS.find((a) => a.id === videoAspectId) ?? VIDEO_ASPECT_PRESETS[0];
  const isColorModified = brightness !== 0 || contrast !== 1 || saturation !== 1;

  const handleCueTextChange = (cueIdx: number, nextText: string) => {
    const updated = cues.map((cue, idx) =>
      idx === cueIdx ? { ...cue, text: nextText } : cue
    );
    onChangeSrtText(serializeSrt(updated));
  };

  const handleShiftTiming = (deltaSec: number) => {
    if (cues.length === 0) return;
    onChangeSrtText(serializeSrt(offsetSrtCues(cues, deltaSec)));
  };

  const handleDownloadDraftSrt = () => {
    if (!srtText.trim()) return;
    const blob = new Blob([srtText.trim() + '\n'], { type: 'text/plain;charset=utf-8' });
    triggerBlobDownload(blob, 'subtitles.srt');
  };

  const canTranslateExisting =
    cues.length > 0 && modeId !== 'burmese_to_burmese' && !isGenerating && !isTranslatingSrt;

  const toolDockItems: Array<{
    id: StudioToolId;
    label: string;
    fullTitle: string;
    summary: string;
    icon: React.ReactNode;
    badgeDot?: boolean;
  }> = [
    {
      id: 'ai_subtitle',
      label: 'AI စာတန်း',
      fullTitle: '၁။ AI စာတန်းထိုးထုတ်မယ်',
      summary: `${activeModeShort} · ${activeModelLabel}${
        translationScope === 'range' ? ' · Range' : ''
      }`,
      icon: <Sparkles className="w-5 h-5" />,
    },
    {
      id: 'srt_editor',
      label: 'စာတန်းပြင်',
      fullTitle: '၂။ စာတန်းပြင် & Sync (.srt Editor)',
      summary:
        cues.length > 0
          ? `${cues.length} cues · Timing ညှိရန်`
          : 'စာတန်းမရှိသေးပါ · ကိုယ်တိုင်ထည့်နိုင်သည်',
      icon: <FileText className="w-5 h-5" />,
      badgeDot: cues.length > 0,
    },
    {
      id: 'color',
      label: 'အရောင်',
      fullTitle: '၃။ ကာလာပြောင်း (Color Grading)',
      summary: `${activePresetLabel}${isColorModified ? ' · Custom' : ''}`,
      icon: <Sliders className="w-5 h-5" />,
      badgeDot: colorPresetId !== 'original' || isColorModified,
    },
    {
      id: 'subtitle_style',
      label: 'ဖောင့်',
      fullTitle: '၄။ မြန်မာဖောင့် ၁၀ မျိုး & စာတန်းဒီဇိုင်း',
      summary: `${activeFontSpec.label} · ${activeColorSpec.labelMy.split(' ')[0]} · ${activeAnimLabel}`,
      icon: <Type className="w-5 h-5" />,
    },
    {
      id: 'logo',
      label: 'Logo',
      fullTitle: '၅။ စိတ်ကြိုက် Logo / Animated စာသား Logo',
      summary: hasActiveTextLogo
        ? `"${textLogoConfig.text.trim()}" · ${activeTextLogoAnimShort}`
        : logoMeta && logoConfig.enabled
        ? `ပုံ Logo · ${activeLogoPosLabel}`
        : 'Logo ပုံ သို့မဟုတ် စာလုံးလှုပ် Logo ထည့်ရန်',
      icon: <ImagePlus className="w-5 h-5" />,
      badgeDot: Boolean(hasActiveTextLogo || (logoMeta && logoConfig.enabled)),
    },
    {
      id: 'video_size',
      label: 'အချိုး',
      fullTitle: '၆။ ဗီဒီယိုဆိုဒ် (TikTok / YouTube)',
      summary:
        videoAspectId === 'original'
          ? 'Original (မူရင်းဆိုဒ်အတိုင်း)'
          : `${activeAspectSpec.shortMy} · ${
              videoFitMode === 'blur_fit' ? 'Blur Fit' : 'Full Crop'
            }`,
      icon: <Maximize2 className="w-5 h-5" />,
      badgeDot: videoAspectId !== 'original',
    },
    {
      id: 'export',
      label: 'Export Video',
      fullTitle: 'ဗီဒီယို ထုတ်ယူမည် & Download',
      summary: renderResult
        ? `Ready · ${renderResult.filename}`
        : `${activeAspectSpec.shortMy} · ${activePresetLabel} · ${cues.length} cues`,
      icon: <Clapperboard className="w-5 h-5" />,
      badgeDot: Boolean(renderResult),
    },
  ];

  const activeToolMeta = toolDockItems.find((t) => t.id === openToolId) ?? null;

  return (
    <aside
      aria-label="Studio Tools"
      className="border border-slate-800/80 bg-[#0B101B] rounded-2xl overflow-hidden flex flex-col"
    >
      {/* Horizontal Icon Tool Strip with Flowing Luminous Light Effects */}
      <div className="relative overflow-hidden border-b border-slate-800/80 bg-[#080C15]">
        {/* Top flowing multi-color light ribbon */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 right-0 h-[2px] overflow-hidden z-20"
        >
          <div className="h-full mv-toolstrip-ribbon" />
        </div>

        {/* Sweeping aurora glow sheen */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden z-0"
        >
          <div className="w-[140%] h-full mv-toolstrip-aurora" />
        </div>

        {/* Bottom hairline light flow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-[1px] overflow-hidden opacity-75 z-20"
        >
          <div className="h-full mv-toolstrip-ribbon" />
        </div>

        <div className="relative z-10 px-2.5 py-2.5 flex items-center gap-1.5 overflow-x-auto studio-no-scrollbar">
          {toolDockItems.map((item, idx) => {
            const isOpen = openToolId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={isOpen}
                onClick={() => onToggleTool(item.id)}
                className={`min-w-[68px] min-h-[58px] px-2.5 py-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all duration-150 shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                  isOpen
                    ? 'mv-tool-active-glow bg-gradient-to-b from-sky-500/25 via-blue-600/20 to-indigo-600/15 border-sky-400/75 text-white'
                    : 'bg-slate-900/35 border-slate-800/50 hover:bg-slate-800/70 hover:border-sky-500/40 text-slate-200 hover:text-white'
                }`}
              >
                <span
                  style={!isOpen ? { animationDelay: `${idx * 180}ms` } : undefined}
                  className={
                    isOpen
                      ? 'text-sky-300'
                      : 'text-sky-300/90 mv-tool-icon-pulse'
                  }
                >
                  {item.icon}
                </span>
                <span className="text-[11px] font-medium whitespace-nowrap leading-tight">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Tool Panel Header */}
      {activeToolMeta ? (
        <div className="px-4 py-3 border-b border-slate-800/70 bg-[#0D1320] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-semibold text-slate-100 truncate">
              {activeToolMeta.fullTitle}
            </h2>
            <p className="text-[11px] text-slate-400 truncate">
              {activeToolMeta.summary}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onToggleTool(activeToolMeta.id)}
            aria-label="Close active tool"
            className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-[11px] text-slate-300 hover:text-white inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>ပိတ်မည်</span>
          </button>
        </div>
      ) : (
        <div className="px-4 py-3 border-b border-slate-800/70 bg-[#0D1320] flex items-center justify-between gap-2">
          <p className="text-xs text-slate-400">
            အပေါ်မှ Tool Icon တစ်ခုကို နှိပ်၍ စတင်တည်းဖြတ်ပါ
          </p>
          <button
            type="button"
            onClick={() => onOpenTool('ai_subtitle')}
            className="px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-300 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer hover:bg-blue-600/30"
          >
            AI စာတန်းဖွင့်မည်
          </button>
        </div>
      )}

      {/* Single Active Tool Content Panel */}
      <div>
        {/* TOOL 1: AI Subtitle Generator */}
        {openToolId === 'ai_subtitle' && (
          <div className="px-4 py-4 space-y-3 bg-[#090D16]/40">
              {/* Gemini API Key Box (Saved locally in browser) */}
              {geminiApiKey.trim() && !showApiKeyEditor ? (
                <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/35 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 text-xs text-emerald-300">
                    <KeyRound className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {apiKeySavedFlash
                        ? 'Gemini API Key သိမ်းဆည်းပြီးပါပြီ ✓'
                        : 'Gemini API Key သိမ်းဆည်းပြီး (Browser ထဲတွင်သာ)'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setApiKeyDraft(geminiApiKey);
                      setShowApiKeyEditor(true);
                    }}
                    className="px-2 py-1 rounded bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-[11px] text-zinc-200 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    ပြင်မည်
                  </button>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-[#090B0E] border border-amber-500/40 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300">
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Gemini API Key (AI စာတန်းထိုးရန်)</span>
                    </span>
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-sky-400 hover:text-sky-300 underline whitespace-nowrap"
                    >
                      API Key အခမဲ့ယူရန် →
                    </a>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1 min-w-0">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={apiKeyDraft}
                        onChange={(e) => setApiKeyDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitApiKeySave(apiKeyDraft);
                          }
                        }}
                        placeholder="AIza... Gemini API Key ထည့်ပါ"
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full h-9 pl-2.5 pr-8 rounded-md bg-zinc-900 border border-zinc-800 font-mono text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/70"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey((v) => !v)}
                        aria-label={showApiKey ? 'Hide API Key' : 'Show API Key'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                      >
                        {showApiKey ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => commitApiKeySave(apiKeyDraft)}
                      className="h-9 px-3 rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Save
                    </button>
                    {geminiApiKey.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          setApiKeyDraft('');
                          onSaveGeminiApiKey('');
                        }}
                        title="Clear API Key"
                        className="h-9 px-2.5 rounded-md bg-zinc-900 border border-zinc-800 hover:border-red-800 text-zinc-400 hover:text-red-300 text-xs whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        ဖျက်
                      </button>
                    )}
                  </div>
                  {apiKeyDraft.trim() && !cleanGeminiApiKey(apiKeyDraft).startsWith('AIza') && (
                    <p className="text-[11px] text-amber-300 leading-relaxed">
                      Google AI Studio Gemini API Key များသည် ပုံမှန်အားဖြင့် <span className="font-mono">AIza</span> ဖြင့် စတင်ပါသည်။
                    </p>
                  )}
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    API Key ကို သင့် Browser/ဖုန်းထဲတွင်သာ သိမ်းဆည်းထားပြီး Google Gemini REST API သို့ တိုက်ရိုက်ချိတ်ဆက်အလုပ်လုပ်ပါသည် (Backend Server မလိုပါ)။
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-zinc-400">ဘာသာစကား Mode</span>
                  <select
                    value={modeId}
                    onChange={(e) => onChangeMode(e.target.value as SubtitleModeId)}
                    className="h-10 px-3 rounded-lg bg-[#090B0E] border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-amber-500/70"
                  >
                    {SUBTITLE_MODES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.labelMy}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-zinc-400">Gemini Model</span>
                  <select
                    value={modelId}
                    onChange={(e) => onChangeModel(e.target.value as GeminiModelId)}
                    className="h-10 px-3 rounded-lg bg-[#090B0E] border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-amber-500/70"
                  >
                    {GEMINI_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} ({m.note})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Scope Toggle */}
              <div className="space-y-2 pt-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>ဘာသာပြန်မည့် အပိုင်း</span>
                  </div>
                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#090B0E] border border-zinc-800">
                    <button
                      type="button"
                      onClick={() => onChangeTranslationScope('full')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        translationScope === 'full'
                          ? 'bg-zinc-800 text-zinc-100'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      တစ်ခုလုံး (Full)
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeTranslationScope('range')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        translationScope === 'range'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      စိတ်ကြိုက် (Range)
                    </button>
                  </div>
                </div>

                {translationScope === 'range' && (
                  <div className="p-2.5 rounded-lg bg-[#090B0E] border border-zinc-800/90 space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] text-zinc-400">စမည့်အချိန်</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={rangeStartInput}
                            onChange={(e) => onChangeRangeStartInput(e.target.value)}
                            placeholder="00:00"
                            className="flex-1 min-w-0 h-8 px-2.5 rounded-md bg-zinc-900 border border-zinc-800 font-mono text-xs text-zinc-100 focus:outline-none focus:border-amber-500/70"
                          />
                          <button
                            type="button"
                            disabled={!hasVideo}
                            onClick={() => onChangeRangeStartInput(formatSecondsToClock(currentTime))}
                            className="h-8 px-2 rounded-md bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-[11px] text-zinc-300 hover:text-white whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
                          >
                            Player မှယူ
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] text-zinc-400">
                          ဆုံးမည့်အချိန်{videoDuration > 0 ? ` · Max ${formatSecondsToClock(videoDuration)}` : ''}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={rangeEndInput}
                            onChange={(e) => onChangeRangeEndInput(e.target.value)}
                            placeholder={videoDuration > 0 ? formatSecondsToClock(videoDuration) : '02:00'}
                            className="flex-1 min-w-0 h-8 px-2.5 rounded-md bg-zinc-900 border border-zinc-800 font-mono text-xs text-zinc-100 focus:outline-none focus:border-amber-500/70"
                          />
                          <button
                            type="button"
                            disabled={!hasVideo}
                            onClick={() => onChangeRangeEndInput(formatSecondsToClock(currentTime))}
                            className="h-8 px-2 rounded-md bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-[11px] text-zinc-300 hover:text-white whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
                          >
                            Player မှယူ
                          </button>
                        </div>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={mergeRangeIntoExisting}
                        onChange={(e) => onChangeMergeRangeIntoExisting(e.target.checked)}
                        className="rounded border-zinc-700 bg-zinc-900 accent-amber-500"
                      />
                      <span>ရှိပြီးသား .srt ထဲသို့ ပေါင်းထည့်မည်</span>
                    </label>
                  </div>
                )}

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-zinc-400">
                    စိတ်ကြိုက် ဘာသာပြန် ညွှန်ကြားချက် (Optional)
                  </span>
                  <input
                    type="text"
                    value={customPrompt}
                    onChange={(e) => onChangeCustomPrompt(e.target.value)}
                    placeholder={
                      modeId === 'burmese_to_burmese'
                        ? 'ဥပမာ- သီချင်းနာမည် / အဆိုတော်နာမည် ထည့်ပေးပါက စာသားပိုတိကျပါသည်'
                        : 'ဥပမာ- ကဗျာဆန်ဆန် / လူငယ်စကား / ကိုရီးယားသီချင်း မြန်မာပြန်ပါ'
                    }
                    className="h-9 px-3 rounded-lg bg-[#090B0E] border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/70"
                  />
                </label>
              </div>

              {generateError && (
                <div className="px-3 py-2 rounded-lg bg-red-950/50 border border-red-900/70 text-xs text-red-300 space-y-1.5">
                  <p>{generateError}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={CREATOR_FACEBOOK_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-sky-300 hover:text-sky-200"
                    >
                      အဆင်မပြေမှုကို Facebook မှ ဆက်သွယ်ပြောပြရန်
                    </a>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  const cleanDraft = cleanGeminiApiKey(apiKeyDraft);
                  if (cleanDraft && cleanDraft !== cleanGeminiApiKey(geminiApiKey)) {
                    commitApiKeySave(cleanDraft);
                  }
                  onGenerateSubtitles();
                }}
                disabled={isGenerating || isTranslatingSrt}
                className={`w-full h-10 px-4 rounded-lg font-semibold text-xs inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                  hasVideo || hasLocalVideo
                    ? 'bg-amber-500 hover:bg-amber-400 text-zinc-950'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                }`}
              >
                {isGenerating ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-zinc-950 border-t-transparent animate-spin shrink-0" />
                    <span className="truncate">
                      {generateProgressText ||
                        (translationScope === 'range'
                          ? 'ရွေးချယ်ထားသောအပိုင်း ဘာသာပြန်နေသည်...'
                          : 'ဗီဒီယိုတစ်ခုလုံး ဘာသာပြန်နေသည်...')}
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>၁။ AI နဲ့ စာတန်းထိုးထုတ်မယ်</span>
                  </>
                )}
              </button>

              {cues.length > 0 && !isGenerating && (
                <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                  <span className="text-emerald-400 font-mono tabular-nums">
                    {cues.length} cues အသင့်ရှိပါသည်
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenTool('srt_editor')}
                    className="text-amber-400 hover:text-amber-300 font-medium cursor-pointer whitespace-nowrap"
                  >
                    .srt ဖွင့်ပြင်မည် →
                  </button>
                </div>
              )}
          </div>
        )}

        {/* TOOL 2: SRT Editor & Sync */}
        {openToolId === 'srt_editor' && (
          <div className="px-4 py-4 space-y-3 bg-[#090D16]/40">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center p-0.5 rounded-md bg-[#090B0E] border border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setEditorTab('raw')}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      editorTab === 'raw'
                        ? 'bg-zinc-800 text-zinc-100'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Raw .srt
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorTab('cues')}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      editorTab === 'cues'
                        ? 'bg-zinc-800 text-zinc-100'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Cue List ({cues.length})
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {cues.length > 0 && (
                    <div className="flex items-center p-0.5 rounded-md bg-[#090B0E] border border-zinc-800">
                      <button
                        type="button"
                        onClick={() => handleShiftTiming(-0.5)}
                        title="Shift subtitles 0.5s earlier"
                        className="px-2 py-1 text-xs font-mono tabular-nums text-zinc-300 hover:text-white hover:bg-zinc-800 rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        -0.5s
                      </button>
                      <button
                        type="button"
                        onClick={() => handleShiftTiming(0.5)}
                        title="Shift subtitles 0.5s later"
                        className="px-2 py-1 text-xs font-mono tabular-nums text-zinc-300 hover:text-white hover:bg-zinc-800 rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        +0.5s
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={!srtText.trim()}
                    onClick={handleDownloadDraftSrt}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-[#090B0E] border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Save .srt</span>
                  </button>

                  {srtText.trim() && (
                    <button
                      type="button"
                      onClick={() => onChangeSrtText('')}
                      title="Clear subtitles"
                      className="inline-flex items-center px-2 py-1 text-xs rounded-md bg-[#090B0E] border border-zinc-800 text-zinc-400 hover:text-red-300 hover:border-red-900/60 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {cues.length > 0 && modeId !== 'burmese_to_burmese' && (
                <button
                  type="button"
                  disabled={!canTranslateExisting}
                  onClick={() => {
                    const cleanDraft = cleanGeminiApiKey(apiKeyDraft);
                    if (cleanDraft && cleanDraft !== cleanGeminiApiKey(geminiApiKey)) {
                      commitApiKeySave(cleanDraft);
                    }
                    onTranslateExistingSrt();
                  }}
                  className="w-full h-9 px-3 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 text-xs font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <Languages className="w-3.5 h-3.5" />
                  <span>
                    {isTranslatingSrt
                      ? 'ဘာသာပြန်နေသည်...'
                      : modeId === 'burmese_to_english'
                      ? 'လက်ရှိ .srt ကို English ပြန်မည်'
                      : 'လက်ရှိ .srt ကို မြန်မာပြန်မည်'}
                  </span>
                </button>
              )}

              {generateError && (
                <div className="px-3 py-2 rounded-lg bg-red-950/50 border border-red-900/70 text-xs text-red-300 space-y-1.5">
                  <p>{generateError}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={CREATOR_FACEBOOK_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-sky-300 hover:text-sky-200"
                    >
                      အဆင်မပြေမှုကို Facebook မှ ဆက်သွယ်ပြောပြရန်
                    </a>
                  </div>
                </div>
              )}

              {editorTab === 'raw' ? (
                <textarea
                  value={srtText}
                  onChange={(e) => onChangeSrtText(e.target.value)}
                  rows={8}
                  spellCheck={false}
                  placeholder={`1\n00:00:01,000 --> 00:00:04,500\nဒီနေရာမှာ စာတန်းပေါ်လာပါမယ်...`}
                  className="w-full rounded-lg bg-[#090B0E] border border-zinc-800 p-3 text-xs sm:text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/70 font-sans resize-y"
                />
              ) : cues.length === 0 ? (
                <div className="py-8 text-center space-y-1.5 border border-dashed border-zinc-800 rounded-lg bg-[#090B0E]">
                  <p className="text-xs text-zinc-300">စာတန်းမရှိသေးပါ</p>
                  <p className="text-[11px] text-zinc-500">
                    AI နဲ့ စာတန်းထုတ်ပါ သို့မဟုတ် Raw .srt တွင် စာတန်းများ ထည့်သွင်းပါ။
                  </p>
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto divide-y divide-zinc-800/70 border border-zinc-800 rounded-lg bg-[#090B0E]">
                  {cues.map((cue, idx) => {
                    const isActive =
                      currentTime >= cue.startSec && currentTime <= cue.endSec;
                    return (
                      <div
                        key={`${cue.index}-${cue.startTimestamp}-${idx}`}
                        className={`flex items-start gap-2.5 p-2.5 transition-colors ${
                          isActive ? 'bg-amber-500/10' : 'hover:bg-zinc-900/60'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSeekTo(cue.startSec)}
                          className="shrink-0 text-left font-mono text-[11px] tabular-nums px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-amber-500/60 hover:text-amber-300 cursor-pointer"
                          title="Jump to timestamp"
                        >
                          {cue.startTimestamp.slice(0, 8)}
                        </button>
                        <textarea
                          rows={cue.text.includes('\n') ? 2 : 1}
                          value={cue.text}
                          onChange={(e) => handleCueTextChange(idx, e.target.value)}
                          className="flex-1 bg-transparent text-xs sm:text-sm text-zinc-100 focus:outline-none resize-none leading-snug"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
        )}

        {/* TOOL 3: Color Grading */}
        {openToolId === 'color' && (
          <div className="px-4 py-4 space-y-4 bg-[#090D16]/40">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-400">
                  Color Grading Presets
                </span>
                {isColorModified && (
                  <button
                    type="button"
                    onClick={onResetAdjustments}
                    className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-100 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Sliders</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-1.5">
                {COLOR_PRESETS.map((preset) => {
                  const selected = preset.id === colorPresetId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onChangeColorPreset(preset.id)}
                      className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                        selected
                          ? 'bg-amber-500/10 border-amber-500/70 text-zinc-100'
                          : 'bg-[#090B0E] border-zinc-800/80 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          aria-hidden="true"
                          style={{ background: preset.swatchGradient }}
                          className="w-5 h-5 rounded shrink-0 border border-white/10"
                        />
                        <span className="text-xs font-medium truncate">
                          {preset.labelMy}
                        </span>
                      </div>
                      {selected && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="slider-brightness" className="text-zinc-300">
                      အလင်း (Brightness)
                    </label>
                    <span className="font-mono tabular-nums text-zinc-400">
                      {brightness >= 0 ? `+${brightness.toFixed(2)}` : brightness.toFixed(2)}
                    </span>
                  </div>
                  <input
                    id="slider-brightness"
                    type="range"
                    min={-0.3}
                    max={0.3}
                    step={0.02}
                    value={brightness}
                    onChange={(e) => onChangeBrightness(Number(e.target.value))}
                    className="studio-slider w-full cursor-pointer"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="slider-contrast" className="text-zinc-300">
                      Contrast
                    </label>
                    <span className="font-mono tabular-nums text-zinc-400">
                      {contrast.toFixed(2)}
                    </span>
                  </div>
                  <input
                    id="slider-contrast"
                    type="range"
                    min={0.7}
                    max={1.5}
                    step={0.05}
                    value={contrast}
                    onChange={(e) => onChangeContrast(Number(e.target.value))}
                    className="studio-slider w-full cursor-pointer"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="slider-saturation" className="text-zinc-300">
                      အရောင်စို (Saturation)
                    </label>
                    <span className="font-mono tabular-nums text-zinc-400">
                      {saturation.toFixed(2)}
                    </span>
                  </div>
                  <input
                    id="slider-saturation"
                    type="range"
                    min={0.0}
                    max={2.0}
                    step={0.05}
                    value={saturation}
                    onChange={(e) => onChangeSaturation(Number(e.target.value))}
                    className="studio-slider w-full cursor-pointer"
                  />
                </div>
              </div>
            </div>
        )}

        {/* TOOL 4: 10 Stylish Myanmar Fonts & Subtitle Style */}
        {openToolId === 'subtitle_style' && (
          <div className="px-4 py-4 space-y-4 bg-[#090D16]/40">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-zinc-300">
                    မြန်မာအလှဖောင့် (၁၀ မျိုး)
                  </span>
                  <span className="text-[11px] text-zinc-400 truncate">
                    {activeFontSpec.label}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {MYANMAR_FONTS.map((font) => {
                    const selected = font.fontFamily === fontName;
                    return (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => onChangeFontName(font.fontFamily)}
                        className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer flex flex-col gap-1 ${
                          selected
                            ? 'bg-amber-500/10 border-amber-500/80 text-zinc-100'
                            : 'bg-[#090B0E] border-zinc-800/90 text-zinc-300 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-[11px] font-medium text-zinc-400 truncate">
                            {font.label}
                          </span>
                          <span
                            className={`text-[10px] shrink-0 ${
                              selected ? 'text-amber-300' : 'text-zinc-500'
                            }`}
                          >
                            {font.styleTagMy}
                          </span>
                        </div>
                        <span
                          style={{
                            fontFamily: `"${font.fontFamily}", "Noto Sans Myanmar", sans-serif`,
                          }}
                          className="text-sm sm:text-base leading-snug text-zinc-100 truncate"
                        >
                          {font.sampleText}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="slider-fontsize" className="text-zinc-300">
                    စာလုံးအရွယ်အစား (Font Size)
                  </label>
                  <span className="font-mono tabular-nums text-zinc-400">
                    {fontSize}px
                  </span>
                </div>
                <input
                  id="slider-fontsize"
                  type="range"
                  min={14}
                  max={42}
                  step={1}
                  value={fontSize}
                  onChange={(e) => onChangeFontSize(Number(e.target.value))}
                  className="studio-slider w-full cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-400">
                      စာတန်းအရောင် (Color &amp; Rainbow)
                    </span>
                    <span className="text-[11px] text-amber-300/90">
                      {activeColorSpec.labelMy}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-lg bg-[#090B0E] border border-zinc-800">
                    {(Object.keys(SUBTITLE_COLORS) as SubtitleColorId[]).map((cid) => {
                      const item = SUBTITLE_COLORS[cid];
                      const active = textColorId === cid;
                      return (
                        <button
                          key={cid}
                          type="button"
                          onClick={() => onChangeTextColor(cid)}
                          className={`px-2 py-1.5 rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap border ${
                            active
                              ? 'bg-zinc-800 border-amber-500/70 text-zinc-100'
                              : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            style={{ background: item.swatchCss }}
                            className="w-3.5 h-3.5 rounded-sm shrink-0 border border-white/20"
                          />
                          <span className="truncate">{item.labelMy.split(' ')[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-400">
                      စာတန်းနေရာ ({activePosLabel})
                    </span>
                    <button
                      type="button"
                      onClick={onShowPositionGuide}
                      className="text-[11px] font-medium text-amber-400 hover:text-amber-300 cursor-pointer whitespace-nowrap"
                    >
                      Player ပေါ် နေရာပြမည်
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#090B0E] border border-zinc-800">
                    {(['top', 'center', 'bottom'] as SubtitlePositionId[]).map((pid) => {
                      const item = SUBTITLE_POSITIONS[pid];
                      const active =
                        positionId === pid ||
                        (subtitleX === item.xPct && subtitleY === item.yPct);
                      return (
                        <button
                          key={pid}
                          type="button"
                          onClick={() => onChangePosition(pid)}
                          className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                            active
                              ? 'bg-zinc-800 text-amber-300 border border-amber-500/50'
                              : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                          }`}
                        >
                          {item.labelMy}
                        </button>
                      );
                    })}
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#090B0E] border border-zinc-800/90 space-y-2.5">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <label htmlFor="slider-sub-y" className="text-zinc-300">
                          အပေါ် / အောက် နေရာ (Vertical Y)
                        </label>
                        <span className="font-mono tabular-nums text-amber-300">
                          {subtitleY}%
                        </span>
                      </div>
                      <input
                        id="slider-sub-y"
                        type="range"
                        min={8}
                        max={92}
                        step={1}
                        value={subtitleY}
                        onChange={(e) =>
                          onChangeSubtitlePosition(subtitleX, Number(e.target.value))
                        }
                        className="studio-slider w-full cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <label htmlFor="slider-sub-x" className="text-zinc-300">
                          ဘယ် / ညာ နေရာ (Horizontal X)
                        </label>
                        <div className="flex items-center gap-2">
                          {subtitleX !== 50 && (
                            <button
                              type="button"
                              onClick={() => onChangeSubtitlePosition(50, subtitleY)}
                              className="text-[10px] text-sky-400 hover:text-sky-300 cursor-pointer"
                            >
                              အလယ်ချိန်
                            </button>
                          )}
                          <span className="font-mono tabular-nums text-amber-300">
                            {subtitleX}%
                          </span>
                        </div>
                      </div>
                      <input
                        id="slider-sub-x"
                        type="range"
                        min={15}
                        max={85}
                        step={1}
                        value={subtitleX}
                        onChange={(e) =>
                          onChangeSubtitlePosition(Number(e.target.value), subtitleY)
                        }
                        className="studio-slider w-full cursor-pointer"
                      />
                    </div>

                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      ဗီဒီယိုပေါ်ရှိ စာတန်းကိုလည်း လက်ဖြင့်တိုက်ရိုက် ဆွဲရွှေ့၍ မိမိစိတ်ကြိုက်နေရာ ထားနိုင်ပါသည်။
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-zinc-400">
                    စာတန်းလှုပ်ရှားမှု (Animation)
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {SUBTITLE_ANIMATIONS.map((anim) => {
                      const active = subtitleAnimation === anim.id;
                      const isFeatured = anim.id === 'word_pop';
                      return (
                        <button
                          key={anim.id}
                          type="button"
                          onClick={() => onChangeSubtitleAnimation(anim.id)}
                          className={`${
                            isFeatured ? 'col-span-2' : ''
                          } px-2.5 py-2 rounded-lg border text-xs font-medium text-left transition-colors cursor-pointer truncate ${
                            active
                              ? 'bg-amber-500/15 border-amber-500/70 text-amber-300'
                              : 'bg-[#090B0E] border-zinc-800 text-zinc-300 hover:border-zinc-700'
                          }`}
                        >
                          {anim.labelMy}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
          </div>
        )}

        {/* TOOL 5: Custom Logo / Animated Text Logo Studio */}
        {openToolId === 'logo' && (
          <div className="px-4 py-4 bg-[#090D16]/40">
              <LogoStudioPanel
                logoMeta={logoMeta}
                logoConfig={logoConfig}
                textLogoConfig={textLogoConfig}
                fontName={fontName}
                isUploadingLogo={isUploadingLogo}
                logoError={logoError}
                onUploadLogoFile={onUploadLogoFile}
                onChangeLogoConfig={onChangeLogoConfig}
                onChangeTextLogoConfig={onChangeTextLogoConfig}
                onRemoveLogo={onRemoveLogo}
              />
          </div>
        )}

        {/* TOOL 6: Video Size / Aspect Ratio (TikTok / YouTube) */}
        {openToolId === 'video_size' && (
          <div className="px-4 py-4 space-y-3 bg-[#090D16]/40">
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-zinc-400">
                  Platform နှင့် ဗီဒီယိုဆိုဒ် ရွေးချယ်ရန်
                </span>
                <div className="grid grid-cols-1 gap-1.5">
                  {VIDEO_ASPECT_PRESETS.map((preset) => {
                    const selected = preset.id === videoAspectId;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onChangeVideoAspect(preset.id)}
                        className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                          selected
                            ? 'bg-amber-500/15 border-amber-500/70 text-zinc-100'
                            : 'bg-[#090B0E] border-zinc-800/80 text-zinc-300 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 h-6 flex items-center justify-center shrink-0">
                            <span
                              aria-hidden="true"
                              className={`border rounded-[2px] ${
                                selected
                                  ? 'border-amber-400 bg-amber-500/20'
                                  : 'border-zinc-500 bg-zinc-900'
                              } ${
                                preset.id === 'tiktok_9_16'
                                  ? 'w-3 h-5'
                                  : preset.id === 'youtube_16_9'
                                  ? 'w-5 h-3'
                                  : preset.id === 'portrait_4_5'
                                  ? 'w-3.5 h-4.5'
                                  : preset.id === 'square_1_1'
                                  ? 'w-4 h-4'
                                  : 'w-5 h-3.5 border-dashed'
                              }`}
                            />
                          </span>
                          <span className="text-xs font-medium truncate">
                            {preset.labelMy}
                          </span>
                        </div>
                        {selected && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {videoAspectId !== 'original' && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs font-medium text-zinc-400">
                    ပုံအပြည့်ညှိပုံ (Fit Mode)
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {VIDEO_FIT_MODES.map((mode) => {
                      const active = videoFitMode === mode.id;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => onChangeVideoFitMode(mode.id)}
                          className={`px-2.5 py-2 rounded-lg border text-[11px] font-medium text-center transition-colors cursor-pointer ${
                            active
                              ? 'bg-zinc-800 border-amber-500/70 text-amber-300'
                              : 'bg-[#090B0E] border-zinc-800 text-zinc-300 hover:border-zinc-700'
                          }`}
                        >
                          {mode.labelMy}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
          </div>
        )}
      </div>

      {/* Pinned Export & Download Dock (always visible when Export tab active, rendering, or result/error present) */}
      {(openToolId === 'export' || isRendering || Boolean(renderResult) || Boolean(renderError)) && (
        <div className="p-4 bg-[#090D16] border-t border-slate-800/80 space-y-3">
        <div className="text-[11px] text-zinc-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-relaxed">
          <span>{activeAspectSpec.shortMy}</span>
          <span aria-hidden="true">·</span>
          <span>{activePresetLabel}</span>
          <span aria-hidden="true">·</span>
          <span>{activeFontSpec.label}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{cues.length} cues</span>
          <span aria-hidden="true">·</span>
          <span>
            {hasActiveTextLogo || (logoMeta && logoConfig.enabled)
              ? `Logo: ${
                  hasActiveTextLogo
                    ? `${textLogoConfig.text.trim().slice(0, 12)} (${activeTextLogoAnimShort})`
                    : activeLogoPosLabel
                }`
              : 'Logo: Off'}
          </span>
        </div>

        {renderError && (
          <div className="px-3 py-2.5 rounded-lg bg-red-950/50 border border-red-900/70 text-xs text-red-300 whitespace-pre-wrap break-words max-h-48 overflow-y-auto space-y-1.5">
            <p>{renderError}</p>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={CREATOR_FACEBOOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-sky-300 hover:text-sky-200"
              >
                အဆင်မပြေမှုကို Facebook မှ ဆက်သွယ်ပြောပြရန်
              </a>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onRenderVideo}
          disabled={(!hasVideo && !hasLocalVideo) || isRendering}
          className="w-full h-10 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {isRendering ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-zinc-950 border-t-transparent animate-spin" />
              <span>
                {renderProgress !== null && renderProgress !== undefined
                  ? `Browser ဖြင့် ဗီဒီယိုထုတ်နေသည် (${renderProgress}%)...`
                  : 'Browser ဖြင့် ဗီဒီယိုထုတ်နေသည်...'}
              </span>
            </>
          ) : (
            <>
              <Clapperboard className="w-4 h-4" />
              <span>ကာလာပြောင်း &amp; ဗီဒီယိုထုတ်မယ် (Export Video)</span>
            </>
          )}
        </button>

        {renderResult && (
          <div className="pt-2 border-t border-zinc-800/80 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-emerald-400 truncate">
                Export ပြီးပါပြီ · {renderResult.filename}
              </p>
              <button
                type="button"
                onClick={onPreviewRendered}
                className="text-xs font-medium text-amber-400 hover:text-amber-300 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Video ကြည့်မည်
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onDownloadMp4}
                disabled={isDownloadingMp4}
                className="h-10 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="tabular-nums">
                  {isDownloadingMp4
                    ? downloadProgress !== null && downloadProgress !== undefined
                      ? `Downloading ${downloadProgress}%`
                      : 'Preparing...'
                    : 'Download Video'}
                </span>
              </button>
              {renderResult.srtUrl || srtText.trim() ? (
                <button
                  type="button"
                  onClick={onDownloadSrt}
                  className="h-10 px-3 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-200 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Download .srt</span>
                </button>
              ) : (
                <div className="h-10 px-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50 text-zinc-600 text-xs inline-flex items-center justify-center">
                  No .srt file
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canShareMp4 && onShareMp4 && (
                <button
                  type="button"
                  onClick={onShareMp4}
                  disabled={isDownloadingMp4}
                  className="flex-1 min-w-[140px] h-9 px-3 rounded-lg bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25 text-emerald-300 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Save / Share (Gallery)</span>
                </button>
              )}

              <a
                href={renderResult.blobUrl || renderResult.videoUrl}
                download={renderResult.filename}
                target={isEmbeddedIframe() ? '_blank' : undefined}
                rel={isEmbeddedIframe() ? 'noopener noreferrer' : undefined}
                className="flex-1 min-w-[140px] h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-200 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                <span>{isEmbeddedIframe() ? 'Tab အသစ်တွင် ဖွင့်/ဒေါင်း' : 'Direct Save Video'}</span>
              </a>
            </div>

            {isInAppBrowser() && (
              <p className="text-[11px] leading-relaxed text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-md px-2.5 py-1.5">
                Facebook App Browser ထဲတွင် Download မဆင်းပါက ညာဘက်အပေါ် (⋮) မှ{' '}
                <span className="font-semibold">Open in Chrome / External Browser</span>{' '}
                ဖြင့် ဖွင့်ပြီး Download ဆွဲပါ။
              </p>
            )}
          </div>
        )}
        </div>
      )}
    </aside>
  );
};
