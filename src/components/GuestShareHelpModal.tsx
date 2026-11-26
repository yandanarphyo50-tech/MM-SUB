import React from 'react';
import { Check, ExternalLink, Globe, Share2, X } from 'lucide-react';
import { CREATOR_FACEBOOK_URL } from '../lib/studioTypes';

interface GuestShareHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareableUrl: string;
  copiedShareLink: boolean;
  onCopyShareLink: () => void;
}

export const GuestShareHelpModal: React.FC<GuestShareHelpModalProps> = ({
  isOpen,
  onClose,
  shareableUrl,
  copiedShareLink,
  onCopyShareLink,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-share-help-title"
        className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl bg-[#0F1420] border border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-800/80 bg-[#0B0F19] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Globe className="w-4 h-4 text-blue-400 shrink-0" />
            <h3
              id="guest-share-help-title"
              className="text-sm sm:text-base font-semibold text-slate-100 truncate"
            >
              တခြားသူများ သုံးမရလျှင် ဖြေရှင်းနည်း
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs sm:text-sm text-slate-300 leading-relaxed">
          <div className="p-3.5 rounded-xl bg-[#080B12] border border-slate-800/80 space-y-1.5">
            <p className="font-semibold text-slate-100">
              ၁။ Share ထဲတွင် Default to fullscreen ဖွင့်ပြီး Copy link ယူပါ
            </p>
            <p className="text-xs text-slate-400">
              အပေါ်ဘက် <span className="text-slate-200 font-medium">Share</span> Tab ထဲတွင်{' '}
              <span className="text-slate-200 font-medium">General access</span> ကို{' '}
              <span className="text-slate-200 font-medium">Public: Anyone with the link can view</span>{' '}
              ထားပါ။ အောက်ရှိ{' '}
              <span className="text-slate-200 font-medium">Default to fullscreen</span> ခလုတ်ကို{' '}
              <span className="text-emerald-300 font-medium">ဖွင့် (ON)</span> ပြီးမှ အောက်ဆုံးရှိ{' '}
              <span className="text-slate-200 font-medium">Copy link</span> ကို နှိပ်၍ မျှဝေပါ (Preview box ထဲ မပိတ်မိဘဲ တိုက်ရိုက်ပွင့်စေရန် ဖြစ်ပါသည်)။
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#080B12] border border-slate-800/80 space-y-1.5">
            <p className="font-semibold text-slate-100">
              ၂။ သုံးမည့်သူများ Browser တွင် Google Login &amp; Refresh စစ်ရန်
            </p>
            <p className="text-xs text-slate-400">
              အခမဲ့ Share Link သည် Google Security စစ်ဆေးမှု ပါရှိသောကြောင့် ဖွင့်သုံးမည့်သူများသည် Chrome/Safari တွင် Gmail/Google Account တစ်ခု ဝင်ထားပြီး ဖွင့်ပေးရပါမည် (Billing ချိတ်ထားသည့် Project ရှိမှသာ Publish Tab မှ Google Login မလိုဘဲ Public တင်နိုင်မည်ဖြစ်ပါသည်)။
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#080B12] border border-slate-800/80 space-y-1.5">
            <p className="font-semibold text-slate-100">
              ၃။ Messenger / Facebook App အတွင်းမှ တိုက်ရိုက်မဖွင့်ရန်
            </p>
            <p className="text-xs text-slate-400">
              Facebook / Messenger App အတွင်းရှိ Browser သည် ဗီဒီယို Upload နှင့် Security Cookie များကို ပိတ်ထားတတ်ပါသည်။ ညာဘက်အပေါ် <span className="text-slate-200 font-medium">⋮ → Open in Chrome / Safari</span> ဖြင့် ဖွင့်သုံးခိုင်းပါ။
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#080B12] border border-slate-800/80 space-y-1.5">
            <p className="font-semibold text-slate-100">
              ၄။ &quot;Error: Page not found&quot; ပေါ်လာလျှင် ဖြေရှင်းနည်း (အရေးကြီး)
            </p>
            <p className="text-xs text-slate-400">
              AI Studio ၏ <span className="text-slate-200 font-medium">ais-pre-...</span> Share Link သည် ယာယီ Preview Link ဖြစ်သောကြောင့် ဆော့ဝဲပြင်ဆင်ပြီးချိန် သို့မဟုတ် အချိန်ကြာလျှင် <span className="text-red-300 font-medium">Page not found</span> ပြတတ်ပါသည်။ ထိုအခါ <span className="text-slate-200 font-medium">AI Studio → Share</span> ကို ပြန်ဖွင့်၍ Link အသစ် Copy ယူပေးပါ။ အခြားသူများ ၂၄ နာရီလုံး မပြတ်တမ်း ဖုန်းထဲတင်သုံးနိုင်ရန် AI Studio အပေါ်ညာဘက်ရှိ <span className="text-emerald-300 font-medium">Deploy app (🚀)</span> ဖြင့် Deploy လုပ်ပြီး ရလာသော Link ကို မျှဝေပေးပါ။
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#080B12] border border-slate-800/80 space-y-1.5">
            <p className="font-semibold text-slate-100">
              ၅။ တခြားသူများ ဖုန်း Screen ပေါ်တွင် App အဖြစ် တင်သုံးနည်း
            </p>
            <p className="text-xs text-slate-400">
              Link ကို <span className="text-slate-200 font-medium">Google Chrome</span> (⋮ → Add to Home screen / Install app),{' '}
              <span className="text-slate-200 font-medium">Xiaomi Mi Browser</span> (≡ → Add to Home screen သို့မဟုတ် Chrome ဖြင့်ဖွင့်ခလုတ်) သို့မဟုတ်{' '}
              <span className="text-slate-200 font-medium">iPhone Safari</span> (Share ↑ → Add to Home Screen) မှတစ်ဆင့် ဖုန်းထဲ App အဖြစ် ထည့်သုံးနိုင်ပါသည်။
            </p>
          </div>

          {shareableUrl && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onCopyShareLink}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
              >
                {copiedShareLink ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Link ကူးယူပြီးပါပြီ</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
                    <span>Share Link ကူးယူမည်</span>
                  </>
                )}
              </button>
              <a
                href={CREATOR_FACEBOOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                <span>အကူအညီ</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
