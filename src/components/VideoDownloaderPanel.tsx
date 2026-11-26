import React, { useState } from 'react';
import {
  Check,
  Clapperboard,
  ClipboardPaste,
  Download,
  ExternalLink,
  Film,
  Link2,
  Loader2,
  Music,
  Search,
  Share2,
  X,
} from 'lucide-react';
import {
  extractFirstHttpUrl,
  getAsciiSafeMediaFilename,
  getSessionRefreshHref,
  isEmbeddedIframe,
  isIOSDevice,
  isInAppBrowser,
  isOwnAppUrl,
} from '../lib/api';
import { formatSecondsToClock } from '../lib/srt';
import {
  CREATOR_FACEBOOK_URL,
  DOWNLOAD_QUALITY_OPTIONS,
  type DownloadQualityId,
  type DownloadedVideoItem,
  type InspectedVideoLinkInfo,
} from '../lib/studioTypes';

interface VideoDownloaderPanelProps {
  urlInput: string;
  onChangeUrlInput: (val: string) => void;
  qualityId: DownloadQualityId;
  onChangeQuality: (q: DownloadQualityId) => void;
  inspectedInfo: InspectedVideoLinkInfo | null;
  isInspecting: boolean;
  isDownloadingLink: boolean;
  downloadError: string | null;
  cookieAuthNeeded?: boolean;
  downloadedItems: DownloadedVideoItem[];
  savingItemId: string | null;
  savingProgress: number | null;
  loadingToStudioId: string | null;
  canShareFile: boolean;
  onInspectLink: () => void;
  onDownloadFromLink: () => void;
  onSaveDownloadedFile: (item: DownloadedVideoItem) => void;
  onShareDownloadedFile: (item: DownloadedVideoItem) => void;
  onUseDownloadedInStudio: (item: DownloadedVideoItem) => void;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const VideoDownloaderPanel: React.FC<VideoDownloaderPanelProps> = ({
  urlInput,
  onChangeUrlInput,
  qualityId,
  onChangeQuality,
  inspectedInfo,
  isInspecting,
  isDownloadingLink,
  downloadError,
  cookieAuthNeeded = false,
  downloadedItems,
  savingItemId,
  savingProgress,
  loadingToStudioId,
  canShareFile,
  onInspectLink,
  onDownloadFromLink,
  onSaveDownloadedFile,
  onShareDownloadedFile,
  onUseDownloadedInStudio,
}) => {
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const [failedThumbUrl, setFailedThumbUrl] = useState<string | null>(null);

  const inIframe = isEmbeddedIframe();
  const isIOS = isIOSDevice();

  const safeThumbnailUrl = (() => {
    const raw = inspectedInfo?.thumbnailUrl;
    if (!raw || raw === failedThumbUrl) return null;
    try {
      const u = new URL(raw);
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
    } catch {
      return null;
    }
  })();

  const handlePasteClipboard = async () => {
    setPasteNotice(null);
    try {
      if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          const cleanUrl = extractFirstHttpUrl(text);
          onChangeUrlInput(cleanUrl);
          setPasteNotice('Link ထည့်ပြီးပါပြီ');
          setTimeout(() => setPasteNotice(null), 1800);
          return;
        }
      }
      setPasteNotice('Clipboard ထဲတွင် Link မတွေ့ပါ — Input ထဲသို့ ဖိနှိပ် Paste ချပါ');
      setTimeout(() => setPasteNotice(null), 2600);
    } catch {
      setPasteNotice('Input အကွက်ထဲသို့ ဖိနှိပ်ပြီး Paste ချပေးပါ');
      setTimeout(() => setPasteNotice(null), 2600);
    }
  };

  const trimmedUrl = extractFirstHttpUrl(urlInput);
  const ownAppUrlPasted = Boolean(trimmedUrl && isOwnAppUrl(trimmedUrl));
  const isBusy = isInspecting || isDownloadingLink;

  return (
    <div className="space-y-4">
      {/* URL Input Card */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="video-link-input" className="text-xs font-medium text-zinc-300">
            Video Link ထည့်ရန် (URL)
          </label>
          <span className="text-[11px] text-zinc-400">
            TikTok · FB · YouTube · IG · MP4
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <Link2 className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="video-link-input"
              type="url"
              inputMode="url"
              value={urlInput}
              onChange={(e) => onChangeUrlInput(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData?.getData('text');
                if (pasted) {
                  const extracted = extractFirstHttpUrl(pasted);
                  if (extracted !== pasted.trim() && /^https?:\/\//i.test(extracted)) {
                    e.preventDefault();
                    onChangeUrlInput(extracted);
                    setPasteNotice('စာသားထဲမှ Video Link ကို အလိုအလျောက် ထုတ်ယူပြီးပါပြီ');
                    setTimeout(() => setPasteNotice(null), 2000);
                  }
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && trimmedUrl && !isBusy) {
                  e.preventDefault();
                  onDownloadFromLink();
                }
              }}
              placeholder="https://www.tiktok.com/... သို့မဟုတ် Video Link"
              className="w-full h-11 pl-9 pr-9 rounded-xl bg-[#090B0E] border border-zinc-800 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-sky-500/80"
            />
            {urlInput && (
              <button
                type="button"
                onClick={() => onChangeUrlInput('')}
                aria-label="Clear link"
                className="w-8 h-8 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 flex items-center justify-center absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handlePasteClipboard}
            className="h-11 px-3 rounded-xl bg-[#090B0E] border border-zinc-800 hover:border-sky-500/60 text-zinc-200 hover:text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <ClipboardPaste className="w-4 h-4 text-sky-400" />
            <span>Paste</span>
          </button>
        </div>

        {pasteNotice && (
          <p className="text-[11px] text-sky-300">{pasteNotice}</p>
        )}

        {ownAppUrlPasted && (
          <p className="text-[11px] leading-relaxed text-amber-200 bg-amber-500/10 border border-amber-500/35 rounded-lg px-2.5 py-1.5">
            ဤ Link သည် Myanmar MV Studio App ၏ Link ဖြစ်နေပါသည် — ကျေးဇူးပြု၍ TikTok, Facebook, Instagram သို့မဟုတ် MP4 Video Link အစစ် ထည့်ပေးပါ။
          </p>
        )}
      </div>

      {/* Quality Selector */}
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-zinc-400 block">
          ဒေါင်းမည့် အရည်အသွေး (Quality / Format)
        </span>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
          {DOWNLOAD_QUALITY_OPTIONS.map((opt) => {
            const active = qualityId === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeQuality(opt.id)}
                className={`min-h-[40px] px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap truncate ${
                  active
                    ? 'bg-sky-500/15 border-sky-500/80 text-sky-200'
                    : 'bg-[#090B0E] border-zinc-800 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          type="button"
          onClick={onInspectLink}
          disabled={!trimmedUrl || isBusy}
          className="h-11 px-3 rounded-xl bg-[#090B0E] border border-zinc-800 hover:border-zinc-700 text-zinc-200 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {isInspecting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
              <span>စစ်နေသည်...</span>
            </>
          ) : (
            <>
              <Search className="w-4 h-4 text-sky-400" />
              <span>Link စစ်ဆေးမည်</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onDownloadFromLink}
          disabled={!trimmedUrl || isBusy}
          className="sm:col-span-2 h-11 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {isDownloadingLink ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Video ဆွဲယူနေပါသည်...</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>
                {qualityId === 'audio_mp3'
                  ? 'MP3 အသံ ဒေါင်းယူမည်'
                  : 'Video ဒေါင်းယူမည်'}
              </span>
            </>
          )}
        </button>
      </div>

      {/* Inspected Video Preview Info */}
      {inspectedInfo && (
        <div className="p-3 rounded-xl bg-[#090B0E] border border-slate-800 flex items-center gap-3">
          {safeThumbnailUrl ? (
            <img
              src={safeThumbnailUrl}
              alt={inspectedInfo.title}
              referrerPolicy="no-referrer"
              onError={() => setFailedThumbUrl(safeThumbnailUrl)}
              className="w-20 h-14 rounded-lg object-cover bg-slate-900 shrink-0"
            />
          ) : (
            <div className="w-20 h-14 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-sky-400 shrink-0">
              <Film className="w-5 h-5" />
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-semibold text-zinc-100 line-clamp-2 leading-snug">
              {inspectedInfo.title}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
              <span className="text-sky-300 font-medium">{inspectedInfo.platform}</span>
              {inspectedInfo.uploader && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate max-w-[140px]">{inspectedInfo.uploader}</span>
                </>
              )}
              {typeof inspectedInfo.durationSec === 'number' &&
                inspectedInfo.durationSec > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {formatSecondsToClock(inspectedInfo.durationSec)}
                    </span>
                  </>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Error Box */}
      {downloadError && (
        <div className="px-3 py-2.5 rounded-xl bg-red-950/50 border border-red-900/70 text-xs text-red-200 space-y-1.5">
          <p className="leading-relaxed">{downloadError}</p>
          <div className="flex flex-wrap items-center gap-2">
            {cookieAuthNeeded && typeof window !== 'undefined' && (
              <a
                href={`${getSessionRefreshHref()}?ts=${Date.now()}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded bg-sky-500 hover:bg-sky-400 text-zinc-950 font-semibold"
              >
                Chrome Tab အသစ်တွင် ဖွင့်မည်
              </a>
            )}
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

      {/* Downloaded Files Ready to Preview, Save to Phone, or Load into Edit Studio */}
      {downloadedItems.length > 0 && (
        <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
          <p className="text-xs font-semibold text-zinc-200">
            ဖုန်းထဲ Save ရန် အသင့်ဖြစ်သော ဖိုင်များ ({downloadedItems.length})
          </p>

          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-0.5">
            {downloadedItems.map((item) => {
              const isSaving = savingItemId === item.downloadId;
              const isLoadingStudio = loadingToStudioId === item.downloadId;
              const safeFilename = getAsciiSafeMediaFilename(
                item.filename,
                item.isAudioOnly ? '.mp3' : '.mp4'
              );
              const directDownloadHref = `${item.downloadUrl}?download=1`;

              return (
                <div
                  key={item.downloadId}
                  className="p-3 rounded-xl bg-[#090B0E] border border-slate-800 space-y-2.5"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0 mt-0.5">
                      {item.isAudioOnly ? (
                        <Music className="w-4 h-4" />
                      ) : (
                        <Film className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-xs font-semibold text-zinc-100 line-clamp-2 leading-snug">
                        {item.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
                        <span className="text-emerald-400 inline-flex items-center gap-1 font-medium">
                          <Check className="w-3 h-3" />
                          <span>Ready</span>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{item.platform}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {formatBytes(item.sizeBytes)}
                        </span>
                        {typeof item.durationSec === 'number' && item.durationSec > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {formatSecondsToClock(item.durationSec)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Inline Media Preview */}
                  {item.isAudioOnly ? (
                    <audio
                      controls
                      preload="metadata"
                      src={item.downloadUrl}
                      className="w-full h-10"
                    />
                  ) : (
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      src={item.downloadUrl}
                      className="w-full max-h-52 rounded-lg bg-black border border-slate-800/80 object-contain"
                    />
                  )}

                  {/* Primary Action Row: Native Phone Download & Edit Studio */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {!inIframe && !isIOS ? (
                      <a
                        href={directDownloadHref}
                        download={safeFilename}
                        className="min-h-[42px] px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <Download className="w-4 h-4" />
                        <span>
                          {item.isAudioOnly
                            ? 'MP3 ဖုန်းထဲ Save မည်'
                            : 'Video ဖုန်းထဲ Save မည်'}
                        </span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSaveDownloadedFile(item)}
                        disabled={isSaving}
                        className="min-h-[42px] px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        <Download className="w-4 h-4" />
                        <span className="tabular-nums">
                          {isSaving
                            ? savingProgress !== null
                              ? `Saving ${savingProgress}%`
                              : 'Preparing...'
                            : item.isAudioOnly
                            ? 'MP3 ဖုန်းထဲ Save မည်'
                            : 'Video ဖုန်းထဲ Save မည်'}
                        </span>
                      </button>
                    )}

                    {!item.isAudioOnly ? (
                      <button
                        type="button"
                        onClick={() => onUseDownloadedInStudio(item)}
                        disabled={isLoadingStudio}
                        className="min-h-[42px] px-3 rounded-lg bg-amber-500/15 border border-amber-500/50 hover:bg-amber-500/25 text-amber-200 font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        {isLoadingStudio ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Studio ထည့်နေသည်...</span>
                          </>
                        ) : (
                          <>
                            <Clapperboard className="w-3.5 h-3.5 text-amber-400" />
                            <span>Edit Studio ထဲထည့်ပြင်မည်</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <a
                        href={directDownloadHref}
                        download={safeFilename}
                        target={inIframe ? '_blank' : undefined}
                        rel={inIframe ? 'noopener noreferrer' : undefined}
                        className="min-h-[42px] px-3 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-200 text-xs font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                        <span>Browser ဖြင့် တိုက်ရိုက်ဒေါင်း</span>
                      </a>
                    )}
                  </div>

                  {/* Secondary Mobile Share / Chunk Save / Direct Download Row */}
                  {!item.isAudioOnly && (
                    <div className="flex flex-wrap items-center gap-2">
                      {canShareFile && (
                        <button
                          type="button"
                          onClick={() => onShareDownloadedFile(item)}
                          disabled={isSaving}
                          className="flex-1 min-w-[130px] min-h-[36px] px-2.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-200 text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          <Share2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Gallery Save / Share</span>
                        </button>
                      )}
                      {!inIframe && !isIOS ? (
                        <button
                          type="button"
                          onClick={() => onSaveDownloadedFile(item)}
                          disabled={isSaving}
                          className="flex-1 min-w-[130px] min-h-[36px] px-2.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          <Download className="w-3.5 h-3.5 text-sky-400" />
                          <span className="tabular-nums">
                            {isSaving
                              ? savingProgress !== null
                                ? `Saving ${savingProgress}%`
                                : 'Saving...'
                              : 'Fast Save (Alternative)'}
                          </span>
                        </button>
                      ) : (
                        <a
                          href={directDownloadHref}
                          download={safeFilename}
                          target={inIframe ? '_blank' : undefined}
                          rel={inIframe ? 'noopener noreferrer' : undefined}
                          className="flex-1 min-w-[130px] min-h-[36px] px-2.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-xs font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                          <span>Browser ဖြင့် တိုက်ရိုက်ဒေါင်း</span>
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {isInAppBrowser() && (
            <p className="text-[11px] leading-relaxed text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
              Facebook / Messenger App Browser ထဲတွင် Download မဆင်းပါက ညာဘက်အပေါ် (⋮) မှ{' '}
              <span className="font-semibold">Open in Chrome / External Browser</span>{' '}
              ဖြင့် ဖွင့်ပြီး Download ဆွဲပါ။
            </p>
          )}
        </div>
      )}
    </div>
  );
};
