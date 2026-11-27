import React from 'react';
import {
  Clapperboard,
  Download,
  FileText,
  HelpCircle,
  ImagePlus,
  Maximize2,
  Sliders,
  Sparkles,
  Type,
  X,
} from 'lucide-react';
import type { StudioToolId } from '../lib/studioTypes';

export type GuideToolTargetId = StudioToolId | 'video_downloader';

interface ToolsGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTool: (toolId: GuideToolTargetId) => void;
}

const TOOL_ITEMS: Array<{
  id: GuideToolTargetId | 'export';
  title: string;
  desc: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'ai_subtitle',
    title: '၁။ AI စာတန်းထိုးထုတ်မယ် (AI Subtitle & Translation)',
    desc: 'သီချင်း/ဗီဒီယိုထဲမှ အသံကို နားထောင်ပြီး မြန်မာဘာသာပြန်၊ မူရင်း+မြန်မာ နှစ်ထပ် (Dual)၊ မြန်မာသီချင်း စာသားဖော်ထုတ်မှု နှင့် English ဘာသာပြန်တို့ကို တစ်ချက်တည်း ထုတ်ပေးပါသည်။ သီချင်းအပိုင်းခွဲ (Range) ဖြင့်လည်း ထုတ်နိုင်ပါသည်။',
    icon: <Sparkles className="w-4 h-4 text-amber-400" />,
  },
  {
    id: 'srt_editor',
    title: '၂။ စာတန်းပြင် & Sync (.srt Editor)',
    desc: 'ထွက်လာသော စာတန်းများ၏ စာလုံးပေါင်း ပြင်ဆင်ခြင်း၊ စာတန်းအချိန် (-0.5s / +0.5s) ရှေ့နောက်တိုးဆုတ်ခြင်း၊ မြန်မာပြန်ပြောင်းခြင်းနှင့် .srt ဖိုင်သီးသန့် Save ယူခြင်းတို့ ပြုလုပ်နိုင်ပါသည်။',
    icon: <FileText className="w-4 h-4 text-sky-400" />,
  },
  {
    id: 'color',
    title: '၃။ ကာလာပြောင်း (Color Grading)',
    desc: 'Cinematic Teal & Orange၊ Warm Sunset၊ Moody Aesthetic၊ Vibrant Pop၊ Vintage Film နှင့် Black & White Preset များအပြင် Brightness, Contrast, Saturation တို့ကို စိတ်ကြိုက် ချိန်ညှိနိုင်ပါသည်။',
    icon: <Sliders className="w-4 h-4 text-emerald-400" />,
  },
  {
    id: 'subtitle_style',
    title: '၄။ မြန်မာဖောင့် ၁၀ မျိုး & စာတန်းဒီဇိုင်း',
    desc: 'မြန်မာအလှဖောင့် ၁၀ မျိုး၊ Rainbow / Neon ရောင်စုံစာလုံး ၉ မျိုး၊ စာတန်းတစ်လုံးချင်း ခုန်ဖောက် (Word Pop) / ခုန်စွခုန်စွ / စာတန်းပြေး Animation များ ရွေးနိုင်ပြီး Video ပေါ်တွင် လက်ဖြင့်ဆွဲ၍ ကြိုက်သည့်နေရာ ထားနိုင်ပါသည်။',
    icon: <Type className="w-4 h-4 text-pink-400" />,
  },
  {
    id: 'logo',
    title: '၅။ စိတ်ကြိုက် Logo / Animated စာသား Logo',
    desc: 'Channel / Page နာမည်ကို စာလုံးတစ်လုံးချင်း လှုပ်နေမည့် (Wave / Bounce / Rainbow / Pulse) Animated စာသား Logo ဖန်တီးနိုင်သလို ကိုယ်ပိုင် PNG/JPG Logo ပုံတင်ပြီး လွင့်မျော/ခုန်စွ/ယိမ်းနွဲ့ Animation ဖြင့် Video ပေါ်တွင် လက်ဖြင့်ဆွဲ၍ ကြိုက်သည့်နေရာ ထားနိုင်ပါသည်။',
    icon: <ImagePlus className="w-4 h-4 text-amber-300" />,
  },
  {
    id: 'video_size',
    title: '၆။ ဗီဒီယိုဆိုဒ် (TikTok / YouTube Aspect Ratio)',
    desc: 'TikTok / Reels (9:16), YouTube (16:9), FB/IG Feed (4:5), Square (1:1) ဆိုဒ်များသို့ ပြောင်းပေးပြီး နောက်ခံဝါးအပြည့် (Blur Fit) သို့မဟုတ် မျက်နှာပြင်အပြည့် (Full Crop) ရွေးချယ်နိုင်ပါသည်။',
    icon: <Maximize2 className="w-4 h-4 text-violet-400" />,
  },
  {
    id: 'video_downloader',
    title: '၇။ Video Link ဖြင့် Video ဒေါင်းလုဒ် (Video Link Downloader)',
    desc: 'TikTok, Facebook, YouTube, Instagram သို့မဟုတ် Direct MP4 Link များကို ထည့်၍ HD/1080p/720p/MP3 အဖြစ် ဖုန်းထဲသို့ ဒေါင်းယူနိုင်ပြီး တစ်ချက်တည်းဖြင့် Edit Studio ထဲသို့ ထည့်၍ စာတန်းထိုး/ကာလာတည်းဖြတ်နိုင်ပါသည်။',
    icon: <Download className="w-4 h-4 text-sky-400" />,
  },
  {
    id: 'export',
    title: 'Export Video & Download',
    desc: 'ပြင်ဆင်ထားသမျှ Color, Font, Animation, Logo နှင့် Video Size အားလုံးကို Browser ထဲတွင် တိုက်ရိုက် HD Video အဖြစ် ပေါင်းစပ်ထုတ်ပေးပြီး Download / Gallery Save / .srt Download များ ပြုလုပ်နိုင်ပါသည်။',
    icon: <Clapperboard className="w-4 h-4 text-amber-500" />,
  },
];

export const ToolsGuideModal: React.FC<ToolsGuideModalProps> = ({
  isOpen,
  onClose,
  onSelectTool,
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
        aria-labelledby="tools-guide-title"
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl bg-[#11141B] border border-zinc-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-zinc-800 bg-[#0D1016] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <h3 id="tools-guide-title" className="text-sm sm:text-base font-semibold text-zinc-100 truncate">
              Myanmar MV Studio Tool များ အသုံးပြုနည်း လမ်းညွှန်
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-2.5">
          {TOOL_ITEMS.map((item) => {
            const clickable = item.id !== 'export';
            return (
              <div
                key={item.id}
                className="p-3 rounded-lg bg-[#090B0E] border border-zinc-800/90 flex items-start gap-3"
              >
                <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs sm:text-sm font-semibold text-zinc-100">
                      {item.title}
                    </h4>
                    {clickable && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectTool(item.id as GuideToolTargetId);
                          onClose();
                        }}
                        className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-[11px] font-medium text-amber-300 hover:bg-amber-500/25 cursor-pointer whitespace-nowrap"
                      >
                        ဖွင့်သုံးမည် →
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-zinc-800 bg-[#0D1016] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-100 cursor-pointer"
          >
            ပိတ်မည်
          </button>
        </div>
      </div>
    </div>
  );
};
