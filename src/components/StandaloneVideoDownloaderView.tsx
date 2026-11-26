import React from 'react';
import { ChevronLeft, Clapperboard, Download, ExternalLink, MessageCircle } from 'lucide-react';
import {
  APP_BRAND_LOGO_URL,
  CREATOR_FACEBOOK_URL,
  type DownloadQualityId,
  type DownloadedVideoItem,
  type InspectedVideoLinkInfo,
} from '../lib/studioTypes';
import { PWAInstallButton, StandaloneInstallStrip } from './PWAInstallButton';
import { VideoDownloaderPanel } from './VideoDownloaderPanel';

interface StandaloneVideoDownloaderViewProps {
  urlInput: string;
  onChangeUrlInput: (val: string) => void;
  qualityId: DownloadQualityId;
  onChangeQuality: (q: DownloadQualityId) => void;
  inspectedInfo: InspectedVideoLinkInfo | null;
  isInspecting: boolean;
  isDownloadingLink: boolean;
  downloadError: string | null;
  cookieAuthNeeded: boolean;
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
  onBackHome: () => void;
  onOpenStudio: () => void;
  cookieBanner?: React.ReactNode;
  inAppBrowserBanner?: React.ReactNode;
}

export const StandaloneVideoDownloaderView: React.FC<StandaloneVideoDownloaderViewProps> = ({
  urlInput,
  onChangeUrlInput,
  qualityId,
  onChangeQuality,
  inspectedInfo,
  isInspecting,
  isDownloadingLink,
  downloadError,
  cookieAuthNeeded,
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
  onBackHome,
  onOpenStudio,
  cookieBanner,
  inAppBrowserBanner,
}) => {
  return (
    <div className="min-h-screen bg-[#080B12] text-slate-100 flex flex-col">
      {/* Dedicated Standalone Downloader Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#080B12]/95 backdrop-blur-md relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden"
        >
          <div className="h-full mv-toolstrip-ribbon" />
        </div>

        <div className="max-w-3xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onBackHome}
              aria-label="Back to Home Hub"
              className="w-10 h-10 rounded-xl bg-[#0F1420] border border-slate-800 hover:border-slate-700 text-slate-200 hover:text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <img
              src={APP_BRAND_LOGO_URL}
              alt="Myanmar MV Studio Logo"
              className="w-9 h-9 rounded-xl object-contain bg-white p-0.5 border border-amber-400/60 shrink-0"
            />
            <div className="min-w-0">
              <h1 className="font-display text-sm sm:text-base font-bold tracking-tight text-slate-100 truncate">
                Video Link Downloader
              </h1>
              <p className="text-[11px] text-slate-400 truncate">
                TikTok · FB · YouTube · IG · MP4
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={onOpenStudio}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0F1420] border border-slate-800 hover:border-blue-500/50 text-xs font-medium text-slate-200 hover:text-white inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <Clapperboard className="w-3.5 h-3.5 text-blue-400" />
              <span>Edit Studio</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Standalone Downloader Workspace */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-4">
        {cookieBanner}
        {inAppBrowserBanner}
        <StandaloneInstallStrip />

        <section className="rounded-2xl border border-slate-800/80 bg-[#0B101B] overflow-hidden shadow-xl">
          {/* Glowing Tool Strip Banner */}
          <div className="relative overflow-hidden border-b border-slate-800/80 bg-[#080C15] px-4 sm:px-5 py-3.5">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 left-0 right-0 h-[2px] overflow-hidden"
            >
              <div className="h-full mv-toolstrip-ribbon" />
            </div>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden"
            >
              <div className="w-[140%] h-full mv-toolstrip-aurora" />
            </div>
            <div className="relative z-10 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-400/35 flex items-center justify-center text-sky-400 shrink-0 mv-tool-icon-pulse">
                <Download className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-slate-100 leading-snug">
                  Video Link ဖြင့် Video / MP3 ဒေါင်းယူမည်
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Link ထည့်ပြီး ဖုန်းထဲ တိုက်ရိုက် Save နိုင်သလို Edit Studio ထဲလည်း တစ်ချက်တည်း ထည့်ပြင်နိုင်ပါသည်
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-5 bg-[#090D16]/40">
            <VideoDownloaderPanel
              urlInput={urlInput}
              onChangeUrlInput={onChangeUrlInput}
              qualityId={qualityId}
              onChangeQuality={onChangeQuality}
              inspectedInfo={inspectedInfo}
              isInspecting={isInspecting}
              isDownloadingLink={isDownloadingLink}
              downloadError={downloadError}
              cookieAuthNeeded={cookieAuthNeeded}
              downloadedItems={downloadedItems}
              savingItemId={savingItemId}
              savingProgress={savingProgress}
              loadingToStudioId={loadingToStudioId}
              canShareFile={canShareFile}
              onInspectLink={onInspectLink}
              onDownloadFromLink={onDownloadFromLink}
              onSaveDownloadedFile={onSaveDownloadedFile}
              onShareDownloadedFile={onShareDownloadedFile}
              onUseDownloadedInStudio={onUseDownloadedInStudio}
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800/70 bg-[#080B12]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400">
          <span>Myanmar MV Studio — Video Link Downloader Tool</span>
          <a
            href={CREATOR_FACEBOOK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sky-400 hover:text-sky-300 font-medium whitespace-nowrap shrink-0"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Facebook မှ ဆက်သွယ်ရန်</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </footer>
    </div>
  );
};
