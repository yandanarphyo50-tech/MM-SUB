import React, { useRef } from 'react';
import { Eye, EyeOff, ImagePlus, RotateCcw, Sparkles, Trash2, Type } from 'lucide-react';
import { getSessionRefreshHref } from '../lib/api';
import {
  DEFAULT_LOGO_CONFIG,
  DEFAULT_TEXT_LOGO_CONFIG,
  LOGO_ANIMATIONS,
  LOGO_POSITIONS,
  SUBTITLE_COLORS,
  TEXT_LOGO_ANIMATIONS,
  TEXT_LOGO_STYLES,
  type LogoOverlayConfig,
  type LogoPositionId,
  type SubtitleColorId,
  type TextLogoConfig,
  type UploadedLogoMeta,
} from '../lib/studioTypes';

interface LogoStudioPanelProps {
  logoMeta: UploadedLogoMeta | null;
  logoConfig: LogoOverlayConfig;
  textLogoConfig: TextLogoConfig;
  fontName: string;
  isUploadingLogo: boolean;
  logoError: string | null;
  cookieAuthNeeded?: boolean;
  onUploadLogoFile: (file: File) => void;
  onChangeLogoConfig: (next: LogoOverlayConfig) => void;
  onChangeTextLogoConfig: (next: TextLogoConfig) => void;
  onRemoveLogo: () => void;
}

export const LogoStudioPanel: React.FC<LogoStudioPanelProps> = ({
  logoMeta,
  logoConfig,
  textLogoConfig,
  fontName,
  isUploadingLogo,
  logoError,
  cookieAuthNeeded = false,
  onUploadLogoFile,
  onChangeLogoConfig,
  onChangeTextLogoConfig,
  onRemoveLogo,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadLogoFile(file);
    }
    e.target.value = '';
  };

  const updateLogoConfig = (patch: Partial<LogoOverlayConfig>) => {
    onChangeLogoConfig({ ...logoConfig, ...patch });
  };

  const updateTextLogo = (patch: Partial<TextLogoConfig>) => {
    onChangeTextLogoConfig({ ...textLogoConfig, ...patch });
  };

  const positionSlots: Array<{ id: LogoPositionId; gridClass: string }> = [
    { id: 'top_left', gridClass: 'justify-self-start self-start' },
    { id: 'top_center', gridClass: 'justify-self-center self-start' },
    { id: 'top_right', gridClass: 'justify-self-end self-start' },
    { id: 'center', gridClass: 'col-start-2 justify-self-center self-center' },
    { id: 'bottom_left', gridClass: 'row-start-3 col-start-1 justify-self-start self-end' },
    { id: 'bottom_right', gridClass: 'row-start-3 col-start-3 justify-self-end self-end' },
  ];

  const activeImgPosLabel =
    logoConfig.position === 'custom'
      ? `စိတ်ကြိုက် (${logoConfig.xPct}%, ${logoConfig.yPct}%)`
      : LOGO_POSITIONS.find((p) => p.id === logoConfig.position)?.labelMy ?? 'ညာအပေါ်';

  const hasTextLogoText = textLogoConfig.text.trim().length > 0;
  const activeTextLogoColor =
    SUBTITLE_COLORS[textLogoConfig.colorId] ?? SUBTITLE_COLORS.rainbow;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ImagePlus className="w-4 h-4 text-amber-400 shrink-0" />
          <h2 className="text-sm font-semibold text-zinc-100">
            စိတ်ကြိုက် Logo / Animated စာသား Logo
          </h2>
        </div>

        {logoMeta && (
          <button
            type="button"
            onClick={() => updateLogoConfig({ enabled: !logoConfig.enabled })}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              logoConfig.enabled
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {logoConfig.enabled ? (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span>ပုံ Logo ပြထား</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                <span>ပုံ Logo ဖျောက်</span>
              </>
            )}
          </button>
        )}
      </div>

      {logoError && (
        <div className="px-3 py-2 rounded-lg bg-red-950/50 border border-red-900/70 text-xs text-red-300 space-y-2">
          <p>{logoError}</p>
          {cookieAuthNeeded && typeof window !== 'undefined' && (
            <a
              href={`${getSessionRefreshHref()}?ts=${Date.now()}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-3 py-1.5 rounded-md bg-sky-500 hover:bg-sky-400 text-zinc-950 font-semibold"
            >
              Chrome Tab အသစ်တွင် ဖွင့်မည်
            </a>
          )}
        </div>
      )}

      {/* SECTION 1: Animated Text Logo (Per-Letter Movement in Preview & MP4) */}
      <div className="p-3 rounded-lg bg-[#090B0E] border border-zinc-800/90 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-xs font-semibold text-zinc-100 truncate">
              စာလုံးလေးတွေ လှုပ်နေမယ့် Animated Text Logo
            </span>
          </div>
          {hasTextLogoText && (
            <button
              type="button"
              onClick={() => updateTextLogo({ enabled: !textLogoConfig.enabled })}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border cursor-pointer whitespace-nowrap shrink-0 ${
                textLogoConfig.enabled
                  ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {textLogoConfig.enabled ? (
                <>
                  <Eye className="w-3 h-3" />
                  <span>On</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3 h-3" />
                  <span>Off</span>
                </>
              )}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <Type className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={textLogoConfig.text}
              onChange={(e) => {
                const nextVal = e.target.value;
                updateTextLogo({
                  text: nextVal,
                  enabled: nextVal.trim().length > 0,
                });
              }}
              placeholder="Channel / Page နာမည် ရိုက်ထည့်ပါ..."
              maxLength={36}
              className="w-full h-9 pl-8 pr-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/70"
            />
          </div>
          {hasTextLogoText && (
            <button
              type="button"
              onClick={() =>
                onChangeTextLogoConfig({
                  ...DEFAULT_TEXT_LOGO_CONFIG,
                })
              }
              title="စာသား Logo ဖျက်မည်"
              className="h-9 px-2.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-red-900/60 text-zinc-400 hover:text-red-300 cursor-pointer shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <p className="text-[11px] text-zinc-400 leading-relaxed">
          စာရိုက်ထည့်လိုက်သည်နှင့် Video ပေါ်တွင် စာလုံးတစ်လုံးချင်း လှုပ်ရှားပြပေးပြီး လက်ဖြင့်ဆွဲ၍ ကြိုက်တဲ့နေရာ ထားနိုင်ပါသည်။ ({fontName})
        </p>

        {/* Per-Letter Animation Mode */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-medium text-zinc-400">
            စာလုံးလှုပ်ရှားမှု (Letter Animation)
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {TEXT_LOGO_ANIMATIONS.map((anim) => {
              const active = textLogoConfig.animationId === anim.id;
              return (
                <button
                  key={anim.id}
                  type="button"
                  onClick={() =>
                    updateTextLogo({
                      animationId: anim.id,
                      ...(hasTextLogoText ? { enabled: true } : {}),
                    })
                  }
                  className={`px-2.5 py-1.5 rounded-md border text-[11px] font-medium text-left transition-colors cursor-pointer truncate ${
                    active
                      ? 'bg-amber-500/15 border-amber-500/70 text-amber-300'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  {anim.labelMy}
                </button>
              );
            })}
          </div>
        </div>

        {/* Text Logo Color & Style */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-zinc-400">စာသား Logo အရောင်</span>
            <span className="text-amber-300/90">{activeTextLogoColor.labelMy}</span>
          </div>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-zinc-950 border border-zinc-800">
            {(Object.keys(SUBTITLE_COLORS) as SubtitleColorId[]).map((cid) => {
              const item = SUBTITLE_COLORS[cid];
              const active = textLogoConfig.colorId === cid;
              return (
                <button
                  key={cid}
                  type="button"
                  onClick={() => updateTextLogo({ colorId: cid })}
                  className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap border ${
                    active
                      ? 'bg-zinc-800 border-amber-500/70 text-zinc-100'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    style={{ background: item.swatchCss }}
                    className="w-3 h-3 rounded-sm shrink-0 border border-white/20"
                  />
                  <span className="truncate">{item.labelMy.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {TEXT_LOGO_STYLES.map((st) => {
            const active = textLogoConfig.styleId === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => updateTextLogo({ styleId: st.id })}
                className={`px-2 py-1.5 rounded-md border text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-amber-500/15 border-amber-500/60 text-amber-300'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {st.labelMy}
              </button>
            );
          })}
        </div>

        {/* Text Logo Position Quick Presets + X/Y Sliders */}
        <div className="space-y-2 pt-1 border-t border-zinc-800/70">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-zinc-400">စာသား Logo နေရာ</span>
            <span className="font-mono tabular-nums text-amber-300">
              X: {textLogoConfig.xPct}% · Y: {textLogoConfig.yPct}%
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {LOGO_POSITIONS.map((pos) => {
              const selected =
                textLogoConfig.xPct === pos.xPct && textLogoConfig.yPct === pos.yPct;
              return (
                <button
                  key={`tpos-${pos.id}`}
                  type="button"
                  onClick={() => updateTextLogo({ xPct: pos.xPct, yPct: pos.yPct })}
                  className={`px-2 py-1 rounded text-[11px] font-medium border cursor-pointer whitespace-nowrap ${
                    selected
                      ? 'bg-amber-500 border-amber-400 text-zinc-950'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {pos.labelMy}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <label htmlFor="slider-tlogo-x" className="text-zinc-400">
                  Horizontal X
                </label>
                <span className="font-mono tabular-nums text-zinc-300">
                  {textLogoConfig.xPct}%
                </span>
              </div>
              <input
                id="slider-tlogo-x"
                type="range"
                min={8}
                max={92}
                step={1}
                value={textLogoConfig.xPct}
                onChange={(e) => updateTextLogo({ xPct: Number(e.target.value) })}
                className="studio-slider w-full cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <label htmlFor="slider-tlogo-y" className="text-zinc-400">
                  Vertical Y
                </label>
                <span className="font-mono tabular-nums text-zinc-300">
                  {textLogoConfig.yPct}%
                </span>
              </div>
              <input
                id="slider-tlogo-y"
                type="range"
                min={8}
                max={92}
                step={1}
                value={textLogoConfig.yPct}
                onChange={(e) => updateTextLogo({ yPct: Number(e.target.value) })}
                className="studio-slider w-full cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <label htmlFor="slider-tlogo-size" className="text-zinc-400">
                  စာလုံးဆိုဒ်
                </label>
                <span className="font-mono tabular-nums text-zinc-300">
                  {textLogoConfig.size}px
                </span>
              </div>
              <input
                id="slider-tlogo-size"
                type="range"
                min={14}
                max={42}
                step={1}
                value={textLogoConfig.size}
                onChange={(e) => updateTextLogo({ size: Number(e.target.value) })}
                className="studio-slider w-full cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <label htmlFor="slider-tlogo-opacity" className="text-zinc-400">
                  Opacity
                </label>
                <span className="font-mono tabular-nums text-zinc-300">
                  {Math.round(textLogoConfig.opacity * 100)}%
                </span>
              </div>
              <input
                id="slider-tlogo-opacity"
                type="range"
                min={0.2}
                max={1.0}
                step={0.05}
                value={textLogoConfig.opacity}
                onChange={(e) => updateTextLogo({ opacity: Number(e.target.value) })}
                className="studio-slider w-full cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: Custom Image Logo Upload & Lively Animation + Free Positioning */}
      <div className="pt-2 border-t border-zinc-800/80 space-y-3">
        <span className="block text-xs font-medium text-zinc-300">
          ကိုယ်ပိုင် Logo ပုံ (Image Watermark)
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
          className="hidden"
          onChange={handleFileChange}
        />

        {logoMeta ? (
          <div className="p-2.5 rounded-lg bg-[#090B0E] border border-zinc-800 flex items-center gap-3">
            <div className="w-14 h-14 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-center p-1.5 shrink-0 overflow-hidden">
              <img
                src={logoMeta.previewUrl}
                alt={logoMeta.filename}
                referrerPolicy="no-referrer"
                className="max-w-full max-h-full object-contain"
              />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-xs font-medium text-zinc-100 truncate">
                {logoMeta.filename}
              </p>
              <p className="text-[11px] font-mono tabular-nums text-zinc-400">
                {(logoMeta.sizeBytes / 1024).toFixed(0)} KB · {activeImgPosLabel}
              </p>
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  disabled={isUploadingLogo}
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[11px] font-medium text-amber-400 hover:text-amber-300 cursor-pointer whitespace-nowrap"
                >
                  Logo ပုံပြောင်းမည်
                </button>
                <span aria-hidden="true" className="text-zinc-700">
                  ·
                </span>
                <button
                  type="button"
                  onClick={onRemoveLogo}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-red-400 hover:text-red-300 cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>ဖယ်ရှားမည်</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={isUploadingLogo}
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3.5 px-3 rounded-lg bg-[#090B0E] border border-dashed border-zinc-700 hover:border-amber-500/60 flex flex-col items-center justify-center gap-1.5 text-center transition-colors cursor-pointer disabled:opacity-50"
          >
            <ImagePlus className="w-5 h-5 text-amber-400" />
            <span className="text-xs font-medium text-zinc-200">
              {isUploadingLogo
                ? 'Logo တင်နေပါသည်...'
                : 'ကိုယ်ပိုင် Logo ပုံရွေးထည့်ရန် နှိပ်ပါ'}
            </span>
            <span className="text-[11px] text-zinc-500">
              PNG (နောက်ခံကြည်), JPG, WebP, SVG
            </span>
          </button>
        )}

        {/* Image Logo Animation Selector */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-zinc-400">
            Logo ပုံ လှုပ်ရှားမှု (Image Logo Animation)
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {LOGO_ANIMATIONS.map((anim) => {
              const active = logoConfig.animation === anim.id;
              return (
                <button
                  key={anim.id}
                  type="button"
                  onClick={() => updateLogoConfig({ animation: anim.id })}
                  className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium text-left transition-colors cursor-pointer truncate ${
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

        {/* Image Logo Position & Free X/Y Placement */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-zinc-300">
              Logo ပုံနေရာ ({activeImgPosLabel})
            </span>
            <button
              type="button"
              onClick={() =>
                onChangeLogoConfig({ ...DEFAULT_LOGO_CONFIG, enabled: logoConfig.enabled })
              }
              className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>

          {/* Visual 6-Point Screen Frame Picker */}
          <div className="aspect-video w-full rounded-lg bg-[#090B0E] border border-zinc-800 p-2 grid grid-cols-3 grid-rows-3 gap-1.5">
            {positionSlots.map((slot) => {
              const posInfo = LOGO_POSITIONS.find((p) => p.id === slot.id);
              const selected =
                logoConfig.position === slot.id ||
                (posInfo &&
                  logoConfig.xPct === posInfo.xPct &&
                  logoConfig.yPct === posInfo.yPct);
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() =>
                    updateLogoConfig({
                      position: slot.id,
                      xPct: posInfo?.xPct ?? logoConfig.xPct,
                      yPct: posInfo?.yPct ?? logoConfig.yPct,
                    })
                  }
                  title={posInfo?.labelMy}
                  className={`${slot.gridClass} px-2 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                    selected
                      ? 'bg-amber-500 border-amber-400 text-zinc-950'
                      : 'bg-zinc-900/90 border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700'
                  }`}
                >
                  {posInfo?.labelMy}
                </button>
              );
            })}
          </div>

          {/* Free X / Y Sliders + Size / Opacity */}
          <div className="p-2.5 rounded-lg bg-[#090B0E] border border-zinc-800/90 space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <label htmlFor="slider-logo-x" className="text-zinc-300">
                    Horizontal X
                  </label>
                  <span className="font-mono tabular-nums text-amber-300">
                    {logoConfig.xPct}%
                  </span>
                </div>
                <input
                  id="slider-logo-x"
                  type="range"
                  min={6}
                  max={94}
                  step={1}
                  value={logoConfig.xPct}
                  onChange={(e) =>
                    updateLogoConfig({
                      position: 'custom',
                      xPct: Number(e.target.value),
                    })
                  }
                  className="studio-slider w-full cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <label htmlFor="slider-logo-y" className="text-zinc-300">
                    Vertical Y
                  </label>
                  <span className="font-mono tabular-nums text-amber-300">
                    {logoConfig.yPct}%
                  </span>
                </div>
                <input
                  id="slider-logo-y"
                  type="range"
                  min={6}
                  max={94}
                  step={1}
                  value={logoConfig.yPct}
                  onChange={(e) =>
                    updateLogoConfig({
                      position: 'custom',
                      yPct: Number(e.target.value),
                    })
                  }
                  className="studio-slider w-full cursor-pointer"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="slider-logo-scale" className="text-zinc-300">
                  Logo အရွယ်အစား (Size)
                </label>
                <span className="font-mono tabular-nums text-zinc-400">
                  {logoConfig.scalePct}%
                </span>
              </div>
              <input
                id="slider-logo-scale"
                type="range"
                min={6}
                max={32}
                step={1}
                value={logoConfig.scalePct}
                onChange={(e) => updateLogoConfig({ scalePct: Number(e.target.value) })}
                className="studio-slider w-full cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="slider-logo-opacity" className="text-zinc-300">
                  အလင်းဖောက်မှု (Opacity)
                </label>
                <span className="font-mono tabular-nums text-zinc-400">
                  {Math.round(logoConfig.opacity * 100)}%
                </span>
              </div>
              <input
                id="slider-logo-opacity"
                type="range"
                min={0.2}
                max={1.0}
                step={0.05}
                value={logoConfig.opacity}
                onChange={(e) => updateLogoConfig({ opacity: Number(e.target.value) })}
                className="studio-slider w-full cursor-pointer"
              />
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Video Preview ပေါ်ရှိ Logo ကိုလည်း လက်ဖြင့်တိုက်ရိုက် ဆွဲရွှေ့၍ မိမိစိတ်ကြိုက်နေရာ ထားနိုင်ပါသည်။
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
