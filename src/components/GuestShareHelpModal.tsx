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
              ၁။ ဖုန်းထဲတင် ၁၀၀% တိုက်ရိုက်သုံးနိုင်ပါသည် (Server မလိုပါ)
            </p>
            <p className="text-xs text-slate-400">
              ယခု Myanmar MV Studio သည် 100% Client-Side Static App ဖြစ်သွားပြီဖြစ်သောကြောင့် Netlify Link သို့မဟုတ် Android APK ထဲတွင် မည်သူမဆို Google Login ဝင်စရာမလိုဘဲ Video Preview, Color, ဖောင့် ၁၀ မျိုး, Logo နှင့် Video Export များကို တိုက်ရိုက်သုံးနိုင်ပါသည်။
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#080B12] border border-slate-800/80 space-y-1.5">
            <p className="font-semibold text-slate-100">
              ၂။ AI စာတန်းထိုးထုတ်ရန် Gemini API Key ထည့်သွင်းနည်း
            </p>
            <p className="text-xs text-slate-400">
              AI စာတန်းထိုး (သို့) ဘာသာပြန်သုံးလိုပါက Google AI Studio (aistudio.google.com/apikey) မှ အခမဲ့ Gemini API Key တစ်ခုယူပြီး AI စာတန်း Panel ထဲတွင် တစ်ကြိမ် Save ထားရုံဖြင့် မိမိဖုန်း Browser ထဲတွင် လုံခြုံစွာ သိမ်းဆည်းသုံးစွဲနိုင်ပါသည်။
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#080B12] border border-slate-800/80 space-y-1.5">
            <p className="font-semibold text-slate-100">
              ၃။ Messenger / Facebook App အတွင်းမှ တိုက်ရိုက်မဖွင့်ရန်
            </p>
            <p className="text-xs text-slate-400">
              Facebook / Messenger App အတွင်းရှိ Browser သည် ဗီဒီယိုဖိုင်ရွေးချယ်ခြင်းနှင့် Video Save Download များကို ပိတ်ထားတတ်ပါသည်။ ညာဘက်အပေါ် <span className="text-slate-200 font-medium">⋮ → Open in Chrome / Safari</span> ဖြင့် ဖွင့်သုံးပေးပါ။
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#080B12] border border-slate-800/80 space-y-1.5">
            <p className="font-semibold text-slate-100">
              ၄။ ဖုန်း Screen ပေါ်တွင် App / APK ကဲ့သို့ တင်သုံးနည်း
            </p>
            <p className="text-xs text-slate-400">
              Link ကို <span className="text-slate-200 font-medium">Google Chrome</span> (⋮ → Add to Home screen / Install app),{' '}
              <span className="text-slate-200 font-medium">Xiaomi Mi Browser</span> (≡ → Add to Home screen) သို့မဟုတ်{' '}
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
