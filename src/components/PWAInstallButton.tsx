import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Laptop,
  Share2,
  Smartphone,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import {
  getAndroidChromeIntentUrl,
  isInAppBrowser,
  isMiBrowser,
} from '../lib/api';

function getShareableAppUrl(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin.includes('ais-dev-')
    ? window.location.origin.replace('ais-dev-', 'ais-pre-')
    : window.location.origin;
}

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
}) => {
  const { isInstallable, isInstalled, isIOS, isInIframe, install } = usePWAInstall();
  const [showInstallModal, setShowInstallModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowInstallModal(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`${
          compact ? 'min-h-[38px] px-2.5 py-1.5' : 'min-h-[40px] px-3 py-2'
        } text-xs font-medium rounded-xl bg-zinc-900 border border-zinc-700/80 hover:border-amber-500/60 text-zinc-100 hover:text-amber-300 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer`}
        title="Mobile နှင့် PC တွင် App အဖြစ် တင်သုံးရန်"
      >
        <Download className="w-3.5 h-3.5 text-amber-400" />
        <span>
          {isInstallable
            ? 'App တင်သုံးမည်'
            : compact
            ? 'App Install'
            : 'ဖုန်းထဲ App တင်မည်'}
        </span>
      </button>

      {showInstallModal && (
        <PWAInstallGuideModal
          isInstallable={isInstallable}
          isIOS={isIOS}
          isInIframe={isInIframe}
          onInstall={install}
          onClose={() => setShowInstallModal(false)}
        />
      )}
    </>
  );
};

interface PWAInstallGuideModalProps {
  isInstallable: boolean;
  isIOS: boolean;
  isInIframe: boolean;
  onInstall: () => Promise<boolean>;
  onClose: () => void;
}

const PWAInstallGuideModal: React.FC<PWAInstallGuideModalProps> = ({
  isInstallable,
  isIOS,
  isInIframe,
  onInstall,
  onClose,
}) => {
  const inApp = isInAppBrowser();
  const miBrowser = isMiBrowser();
  const [copiedLink, setCopiedLink] = useState(false);
  const appUrl = getShareableAppUrl();
  const chromeIntentUrl =
    appUrl && (inApp || miBrowser) ? getAndroidChromeIntentUrl(appUrl) : null;

  const handleCopyAppUrl = async () => {
    if (!appUrl) return;
    try {
      await navigator.clipboard.writeText(appUrl);
    } catch {
      const input = document.createElement('input');
      input.value = appUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-title"
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-[#11141B] border border-zinc-800 p-5 shadow-2xl space-y-4 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h3
              id="pwa-install-title"
              className="text-sm sm:text-base font-semibold text-zinc-100"
            >
              ဖုန်းနှင့် PC ထဲတွင် App အဖြစ် တင်သုံးနည်း
            </h3>
            <p className="text-xs text-zinc-400">
              Myanmar MV Studio ကို ဖုန်း Home Screen ပေါ်တွင် App တစ်ခုကဲ့သို့ ထည့်သွင်းသုံးစွဲနိုင်ပါသည်။
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {(isInIframe || inApp || miBrowser) && typeof window !== 'undefined' && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/40 space-y-2">
            <p className="text-xs text-amber-200 leading-relaxed">
              {inApp
                ? 'Facebook / Messenger App Browser ထဲတွင် Install လုပ်မရပါ။ ညာဘက်အပေါ် (⋮) မှ Open in Chrome / Safari ဖြင့် အရင်ဖွင့်ပါ။'
                : miBrowser
                ? 'Mi Browser တွင် 1-Tap Install မပေါ်ပါက အောက်ခြေ Menu (≡) → Add to Home screen နှိပ်နိုင်သလို Link ကူးပြီး Google Chrome ဖြင့်ဖွင့်ပါက App အဖြစ် တိုက်ရိုက် Install တင်နိုင်ပါသည်။'
                : 'လက်ရှိ Preview Frame ထဲတွင် ဖွင့်ထားသောကြောင့် Browser Tab အသစ်ဖြင့် အရင်ဖွင့်ပြီးမှ Install နှိပ်ပေးပါ။'}
            </p>
            {isInIframe && !inApp && (
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-semibold"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Browser Tab အသစ်တွင် ဖွင့်မည်</span>
              </a>
            )}
          </div>
        )}

        <div className="space-y-2.5 text-xs">
          {!isIOS && (
            <>
              <div className="p-3 rounded-lg bg-[#090B0E] border border-zinc-800 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-zinc-100">
                  <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                  <span>Android ဖုန်း (Google Chrome — အကောင်းဆုံး)</span>
                </div>
                <p className="text-zinc-400 leading-relaxed">
                  ၁။ Chrome ညာဘက်အပေါ် Menu (<span className="text-zinc-200 font-semibold">⋮</span>) ကို နှိပ်ပါ။<br />
                  ၂။ <span className="text-zinc-200 font-semibold">Add to Home screen</span> → <span className="text-zinc-200 font-semibold">Install</span> ကို နှိပ်ပါ။
                </p>
              </div>

              <div className="p-3 rounded-lg bg-[#090B0E] border border-zinc-800 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-zinc-100">
                  <Smartphone className="w-3.5 h-3.5 text-orange-400" />
                  <span>Xiaomi Mi Browser / အခြား Android Browser များ</span>
                </div>
                <p className="text-zinc-400 leading-relaxed">
                  ၁။ Browser အောက်ခြေညာဘက် Menu (<span className="text-zinc-200 font-semibold">≡</span>) ကို နှိပ်ပါ။<br />
                  ၂။ <span className="text-zinc-200 font-semibold">Add to Home screen</span> (သို့) <span className="text-zinc-200 font-semibold">Save page / Shortcut</span> ကို ရွေးပါ။<br />
                  ၃။ Shortcut မတွေ့ပါက အောက်ပါ Link ကို ကူးပြီး <span className="text-zinc-200 font-semibold">Chrome</span> တွင် ဖွင့်တင်ပါ။
                </p>
              </div>
            </>
          )}

          <div className="p-3 rounded-lg bg-[#090B0E] border border-zinc-800 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-zinc-100">
              <Smartphone className="w-3.5 h-3.5 text-sky-400" />
              <span>iPhone / iPad (Safari Browser)</span>
            </div>
            <p className="text-zinc-400 leading-relaxed">
              ၁။ Safari အောက်ခြေရှိ <span className="text-zinc-200 font-semibold">Share</span> ခလုတ် (↑) ကို နှိပ်ပါ။<br />
              ၂။ အောက်သို့ဆွဲပြီး <span className="text-zinc-200 font-semibold">Add to Home Screen</span> ကို နှိပ်၍ Add လုပ်ပါ။
            </p>
          </div>

          <div className="p-3 rounded-lg bg-[#090B0E] border border-zinc-800 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-zinc-100">
              <Laptop className="w-3.5 h-3.5 text-emerald-400" />
              <span>PC / Laptop (Windows &amp; Mac — Chrome / Edge)</span>
            </div>
            <p className="text-zinc-400 leading-relaxed">
              ၁။ Address Bar ညာဘက်ထောင့်ရှိ <span className="text-zinc-200 font-semibold">Install (⊕ / Monitor)</span> Icon ကို နှိပ်ပါ။<br />
              ၂။ (သို့မဟုတ်) Browser Menu (<span className="text-zinc-200 font-semibold">⋮</span>) → <span className="text-zinc-200 font-semibold">Cast, save, and share</span> / <span className="text-zinc-200 font-semibold">Apps</span> → <span className="text-zinc-200 font-semibold">Install Myanmar MV Studio</span> ကို နှိပ်ပါ။
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {chromeIntentUrl && (
            <a
              href={chromeIntentUrl}
              className="w-full h-10 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Chrome ဖြင့် ဖွင့်ပြီး App တင်မည်</span>
            </a>
          )}

          {isInstallable && (
            <button
              type="button"
              onClick={async () => {
                const ok = await onInstall();
                if (ok) onClose();
              }}
              className="w-full h-10 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-semibold cursor-pointer"
            >
              ယခုချက်ချင်း App တင်မည် (Install Now)
            </button>
          )}

          {appUrl && (
            <button
              type="button"
              onClick={handleCopyAppUrl}
              className="w-full h-9 rounded-lg bg-blue-600/20 border border-blue-500/40 hover:bg-blue-600/30 text-xs font-medium text-blue-200 inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">App Link ကူးယူပြီးပါပြီ (Chrome တွင် Paste ချဖွင့်ပါ)</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-sky-400" />
                  <span>App Link ကူးယူမည် (Chrome / Safari တွင် ဖွင့်ရန်)</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full h-9 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs font-medium text-zinc-200 cursor-pointer"
          >
            ပိတ်မည်
          </button>
        </div>
      </div>
    </div>
  );
};

interface PhoneInstallBannerProps {
  copiedShareLink: boolean;
  onCopyShareLink: () => void;
}

export const PhoneInstallBanner: React.FC<PhoneInstallBannerProps> = ({
  copiedShareLink,
  onCopyShareLink,
}) => {
  const { isInstallable, isInstalled, isIOS, isInIframe, install } = usePWAInstall();
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [sharedNative, setSharedNative] = useState(false);

  const shareUrl = getShareableAppUrl();

  const handleInstallTap = async () => {
    if (isInstallable) {
      const ok = await install();
      if (ok) return;
    }
    setShowInstallModal(true);
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && shareUrl) {
      try {
        await navigator.share({
          title: 'Myanmar MV Studio',
          text: 'သီချင်း Video စာတန်းထိုး နှင့် Video Link Downloader App ကို ဖုန်းထဲတင်သုံးနိုင်ပါသည်',
          url: shareUrl,
        });
        setSharedNative(true);
        setTimeout(() => setSharedNative(false), 2000);
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    onCopyShareLink();
  };

  if (isInstalled) {
    return (
      <section className="rounded-2xl bg-[#0F1420] border border-slate-800/80 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-semibold text-slate-100">
              ဖုန်း App အဖြစ် တင်သုံးနေပါပြီ
            </p>
            <p className="text-xs text-slate-400">
              အခြားသူငယ်ချင်းများလည်း ဖုန်းထဲတင်သုံးနိုင်ရန် Link မျှဝေပေးနိုင်ပါသည်
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleNativeShare}
          className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
        >
          {copiedShareLink || sharedNative ? (
            <>
              <Check className="w-4 h-4" />
              <span>Link ကူးယူပြီးပါပြီ</span>
            </>
          ) : (
            <>
              <Share2 className="w-4 h-4" />
              <span>သူငယ်ချင်းများထံ မျှဝေမည်</span>
            </>
          )}
        </button>
      </section>
    );
  }

  return (
    <>
      <section className="rounded-2xl bg-[#0F1420] border border-amber-500/35 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <p className="text-xs sm:text-sm font-bold text-slate-100">
              ဖုန်းထဲတွင် App အဖြစ် ထည့်သွင်းသုံးစွဲရန် (Android / iPhone)
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              {isInAppBrowser()
                ? 'Messenger / FB Browser ထဲမှ ဖွင့်ထားလျှင် ⋮ → Open in Chrome / Safari ဖြင့် ဖွင့်ပြီး App တင်သုံးပါ'
                : isMiBrowser()
                ? 'Mi Browser အောက်ခြေ ≡ ခလုတ် → Add to Home screen နှိပ်နိုင်သလို Link ကူးပြီး Chrome ဖြင့် App တင်သုံးနိုင်ပါသည်'
                : isIOS
                ? 'Safari Share (↑) → Add to Home Screen နှိပ်၍ ဖုန်း App အဖြစ် သုံးနိုင်ပါသည်'
                : 'Chrome မှ Add to Home Screen နှိပ်၍ ဖုန်း Screen ပေါ်တွင် App ကဲ့သို့ အလွယ်တကူ ဖွင့်သုံးနိုင်ပါသည်'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isInIframe && typeof window !== 'undefined' ? (
            <a
              href={window.location.href}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Chrome ဖြင့်ဖွင့် &amp; App တင်မည်</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={handleInstallTap}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>{isInstallable ? 'ဖုန်းထဲ App တင်မည်' : 'App ထည့်သွင်းနည်း'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleNativeShare}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#080B12] border border-slate-700 hover:border-slate-600 text-slate-200 hover:text-white text-xs font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
          >
            {copiedShareLink || sharedNative ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">ကူးပြီးပါပြီ</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-sky-400" />
                <span>App မျှဝေမည်</span>
              </>
            )}
          </button>
        </div>
      </section>

      {showInstallModal && (
        <PWAInstallGuideModal
          isInstallable={isInstallable}
          isIOS={isIOS}
          isInIframe={isInIframe}
          onInstall={install}
          onClose={() => setShowInstallModal(false)}
        />
      )}
    </>
  );
};

export const StandaloneInstallStrip: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isInIframe, install } = usePWAInstall();
  const [showInstallModal, setShowInstallModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const appUrl = getShareableAppUrl();
  const chromeIntentUrl =
    appUrl && (isMiBrowser() || isInAppBrowser())
      ? getAndroidChromeIntentUrl(appUrl)
      : null;

  const handleInstallTap = async () => {
    if (isInstallable) {
      const ok = await install();
      if (ok) return;
    }
    setShowInstallModal(true);
  };

  return (
    <>
      <div className="rounded-2xl bg-[#0F1420] border border-amber-500/35 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
            <Smartphone className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-100 truncate">
              ဖုန်း Home Screen ပေါ်တွင် App အဖြစ် တင်သုံးရန်
            </p>
            <p className="text-[11px] text-slate-400 leading-snug">
              {isMiBrowser()
                ? 'Mi Browser (≡ → Add to Home screen) သို့မဟုတ် Chrome ဖြင့် တင်သုံးနိုင်ပါသည်'
                : isIOS
                ? 'Safari Share (↑) → Add to Home Screen ဖြင့် ဖုန်းထဲထည့်သုံးနိုင်ပါသည်'
                : 'Android Chrome / Mi Browser / iPhone Safari တွင် App အဖြစ် တင်သုံးနိုင်ပါသည်'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {chromeIntentUrl && (
            <a
              href={chromeIntentUrl}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Chrome ဖြင့် App တင်မည်</span>
            </a>
          )}
          <button
            type="button"
            onClick={handleInstallTap}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isInstallable ? 'ဖုန်းထဲ App တင်မည်' : 'App ထည့်သွင်းနည်း'}</span>
          </button>
        </div>
      </div>

      {showInstallModal && (
        <PWAInstallGuideModal
          isInstallable={isInstallable}
          isIOS={isIOS}
          isInIframe={isInIframe}
          onInstall={install}
          onClose={() => setShowInstallModal(false)}
        />
      )}
    </>
  );
};
