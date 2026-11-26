import React, { useState } from 'react';
import {
  ArrowRight,
  Check,
  Clapperboard,
  Download,
  ExternalLink,
  Globe,
  HelpCircle,
  MessageCircle,
  Settings,
  Share2,
  X,
} from 'lucide-react';
import {
  APP_BRAND_LOGO_URL,
  CREATOR_FACEBOOK_URL,
  type StudioToolId,
} from '../lib/studioTypes';
import { PhoneInstallBanner, PWAInstallButton } from './PWAInstallButton';

interface StudioHomeHubProps {
  hasVideo: boolean;
  videoFilename?: string;
  cuesCount: number;
  copiedShareLink: boolean;
  onCopyShareLink: () => void;
  onOpenEditor: (initialTool?: StudioToolId | null) => void;
  onOpenDownloader: () => void;
  onOpenToolsGuide: () => void;
  onOpenGuestShareHelp: () => void;
}

export const StudioHomeHub: React.FC<StudioHomeHubProps> = ({
  hasVideo,
  videoFilename,
  cuesCount,
  copiedShareLink,
  onCopyShareLink,
  onOpenEditor,
  onOpenDownloader,
  onOpenToolsGuide,
  onOpenGuestShareHelp,
}) => {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="min-h-screen bg-[#080B12] text-slate-100 flex flex-col">
      {/* Compact Studio Hub Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/70 bg-[#080B12]/90 backdrop-blur-md relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden"
        >
          <div className="h-full mv-toolstrip-ribbon" />
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={APP_BRAND_LOGO_URL}
              alt="Myanmar MV Studio Logo"
              className="w-10 h-10 rounded-xl object-contain bg-white p-0.5 border border-amber-400/60 shadow-sm shrink-0"
            />
            <div className="min-w-0">
              <p className="font-display text-base font-bold tracking-tight text-slate-100 truncate">
                Myanmar MV Studio
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                AI Subtitle · Color Grade · Video Downloader
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => setShowMenu(true)}
              aria-label="Menu and Settings"
              className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-[#0F1420] border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white inline-flex items-center justify-center gap-2 text-xs font-medium transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4 text-blue-400" />
              <span className="hidden sm:inline">Menu</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Hub Canvas: Hero Card + 2 Tool Cards */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
        {/* Hero Overview Card */}
        <section className="rounded-2xl bg-gradient-to-br from-[#101829] via-[#0D1320] to-[#0A0E17] border border-slate-800/80 p-5 sm:p-7 space-y-2.5">
          <p className="text-[11px] font-medium tracking-wide text-blue-400">
            4K / HD STUDIO · BURMESE AI · VIDEO LINK DOWNLOADER
          </p>
          <h1 className="font-display text-xl sm:text-3xl font-bold tracking-tight text-slate-100 text-balance leading-snug">
            ဖန်တီးမှုမြန်ဆန်သော 4K/HD Myanmar MV စတူဒီယို
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
            သီချင်းဗီဒီယိုများကို တင်၍ သို့မဟုတ် Video Link ဖြင့် ဒေါင်းယူပြီး AI မြန်မာစာတန်းထိုး၊
            ဖောင့် ၁၀ မျိုး၊ Color Grading နှင့် Logo များကို စနစ်တကျ တည်းဖြတ်ထုတ်ယူပါ။
          </p>
          {hasVideo && (
            <div className="pt-2 text-xs text-blue-300 flex flex-wrap items-center gap-2">
              <span className="font-medium">လက်ရှိပွင့်နေသော Project:</span>
              <span className="text-slate-200 truncate max-w-[240px]">
                {videoFilename || 'Selected Video'}
              </span>
              {cuesCount > 0 && (
                <>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="tabular-nums text-slate-300">{cuesCount} cues</span>
                </>
              )}
            </div>
          )}
        </section>

        {/* Exactly 2 Clean Tool Cards below the Hero */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Tool Card 1: Video Edit Studio */}
          <div className="rounded-2xl bg-gradient-to-br from-[#131E38] via-[#10172B] to-[#0C111E] border border-blue-500/35 p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-blue-500/15 border border-blue-400/25 flex items-center justify-center text-blue-400 shrink-0">
                <Clapperboard className="w-6 h-6" />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-[10px] sm:text-[11px] font-medium text-blue-300 tracking-wide">
                  AI SUBTITLE · COLOR · LOGO
                </p>
                <h2 className="font-display text-base sm:text-lg font-bold text-white leading-snug">
                  Video Edit Studio
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  စာတန်းထိုး · ဖောင့် ၁၀ မျိုး · Color &amp; MP4
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenEditor('ai_subtitle')}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer active:scale-[0.99]"
            >
              <span>{hasVideo ? 'ဆက်ပြင်မည်' : 'ဖွင့်မည်'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Tool Card 2: Video Link Downloader */}
          <div className="rounded-2xl bg-[#0F1420] border border-slate-800/80 p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-sky-500/15 border border-sky-400/25 flex items-center justify-center text-sky-400 shrink-0">
                <Download className="w-6 h-6" />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-[10px] sm:text-[11px] font-medium text-sky-300 tracking-wide">
                  TIKTOK · FB · YOUTUBE · MP4 LINK
                </p>
                <h2 className="font-display text-base sm:text-lg font-bold text-slate-100 leading-snug">
                  Video Link Downloader
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Link ထည့်၍ Video ဒေါင်းယူရန် &amp; Studio တွင်ပြင်ရန်
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenDownloader}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer active:scale-[0.99]"
            >
              <span>ဖွင့်မည်</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>

        {/* Phone Install & Share Card (auto-adapts when installed) */}
        <PhoneInstallBanner
          copiedShareLink={copiedShareLink}
          onCopyShareLink={onCopyShareLink}
        />
      </main>

      {/* Settings / Menu Modal (Tools Guide, Share, Guest Troubleshooting, Support) */}
      {showMenu && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setShowMenu(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Studio Menu"
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-[#0F1420] border border-slate-800 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-800/80 bg-[#0B0F19] flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-100">
                Studio Menu &amp; အကူအညီ
              </p>
              <button
                type="button"
                onClick={() => setShowMenu(false)}
                aria-label="Close menu"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  onOpenToolsGuide();
                }}
                className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#080B12] border border-slate-800 hover:border-slate-700 text-slate-100 text-xs sm:text-sm font-medium flex items-center justify-between gap-3 cursor-pointer"
              >
                <span className="inline-flex items-center gap-3">
                  <HelpCircle className="w-4 h-4 text-blue-400" />
                  <span>Tool များ ရှင်းလင်းချက်</span>
                </span>
                <ArrowRight className="w-4 h-4 text-slate-500" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  onOpenGuestShareHelp();
                }}
                className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#080B12] border border-slate-800 hover:border-blue-500/50 text-slate-100 text-xs sm:text-sm font-medium flex items-center justify-between gap-3 cursor-pointer"
              >
                <span className="inline-flex items-center gap-3">
                  <Globe className="w-4 h-4 text-amber-400" />
                  <span>တခြားသူများ သုံးမရလျှင် ဖြေရှင်းနည်း</span>
                </span>
                <ArrowRight className="w-4 h-4 text-slate-500" />
              </button>

              <button
                type="button"
                onClick={onCopyShareLink}
                className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#080B12] border border-slate-800 hover:border-slate-700 text-slate-100 text-xs sm:text-sm font-medium flex items-center justify-between gap-3 cursor-pointer"
              >
                <span className="inline-flex items-center gap-3">
                  {copiedShareLink ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-300">Share Link ကူးယူပြီးပါပြီ</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4 text-blue-400" />
                      <span>Share Link ကူးယူမည်</span>
                    </>
                  )}
                </span>
              </button>

              <a
                href={CREATOR_FACEBOOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#080B12] border border-slate-800 hover:border-slate-700 text-slate-100 text-xs sm:text-sm font-medium flex items-center justify-between gap-3"
              >
                <span className="inline-flex items-center gap-3">
                  <MessageCircle className="w-4 h-4 text-sky-400" />
                  <span>အကူအညီ / Facebook မှ ဆက်သွယ်ရန်</span>
                </span>
                <ExternalLink className="w-4 h-4 text-slate-500" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
