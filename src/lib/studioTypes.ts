export interface ColorPresetOption {
  id: string;
  label: string;
  labelMy: string;
  ffmpegFilter: string;
  previewFilter: string;
  swatchGradient: string;
}

export const COLOR_PRESETS: ColorPresetOption[] = [
  {
    id: 'original',
    label: 'Original',
    labelMy: 'Original (မူရင်းအတိုင်း)',
    ffmpegFilter: '',
    previewFilter: 'none',
    swatchGradient: 'linear-gradient(135deg, #3f3f46 0%, #18181b 100%)',
  },
  {
    id: 'teal_orange',
    label: 'Cinematic Teal & Orange',
    labelMy: 'Cinematic Teal & Orange (ရုပ်ရှင်စတိုင်)',
    ffmpegFilter:
      'colorbalance=rs=-0.12:gs=-0.02:bs=0.15:rm=0.04:gm=0.0:bm=-0.04:rh=0.14:gh=0.04:bh=-0.12,eq=contrast=1.10:saturation=1.15',
    previewFilter: 'contrast(1.10) saturate(1.15) sepia(0.12) hue-rotate(-6deg)',
    swatchGradient: 'linear-gradient(135deg, #0e7490 0%, #ea580c 100%)',
  },
  {
    id: 'warm_sunset',
    label: 'Warm Sunset',
    labelMy: 'Warm Sunset (နွေးထွေးအရောင်)',
    ffmpegFilter:
      'colorbalance=rs=0.12:gs=0.04:bs=-0.12:rh=0.14:gh=0.05:bh=-0.10,eq=contrast=1.06:saturation=1.18',
    previewFilter: 'contrast(1.06) saturate(1.18) sepia(0.22)',
    swatchGradient: 'linear-gradient(135deg, #f59e0b 0%, #be123c 100%)',
  },
  {
    id: 'moody_aesthetic',
    label: 'Moody Aesthetic',
    labelMy: 'Moody Aesthetic (အေးအေးမှောင်မှောင်)',
    ffmpegFilter:
      'colorbalance=rs=-0.08:gs=-0.03:bs=0.10,eq=brightness=-0.04:contrast=1.16:saturation=0.82',
    previewFilter: 'brightness(0.92) contrast(1.16) saturate(0.82) hue-rotate(8deg)',
    swatchGradient: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
  },
  {
    id: 'vibrant_pop',
    label: 'Vibrant Pop',
    labelMy: 'Vibrant Pop (အရောင်စိုစို)',
    ffmpegFilter: 'eq=contrast=1.10:saturation=1.35:brightness=0.02',
    previewFilter: 'brightness(1.03) contrast(1.10) saturate(1.35)',
    swatchGradient: 'linear-gradient(135deg, #ec4899 0%, #eab308 100%)',
  },
  {
    id: 'vintage_film',
    label: 'Vintage Film',
    labelMy: 'Vintage Film (ဗီဒီယိုအဟောင်းစတိုင်)',
    ffmpegFilter:
      'colorbalance=rs=0.10:gs=0.06:bs=-0.08:rh=0.08:gh=0.07:bh=-0.12,eq=contrast=0.95:saturation=0.78:brightness=0.02',
    previewFilter: 'brightness(1.03) contrast(0.95) saturate(0.78) sepia(0.26)',
    swatchGradient: 'linear-gradient(135deg, #a16207 0%, #44403c 100%)',
  },
  {
    id: 'black_white',
    label: 'Black & White',
    labelMy: 'Black & White (အဖြူအမည်း)',
    ffmpegFilter: 'hue=s=0,eq=contrast=1.18',
    previewFilter: 'grayscale(1) contrast(1.18)',
    swatchGradient: 'linear-gradient(135deg, #e4e4e7 0%, #18181b 100%)',
  },
];

export type SubtitleModeId =
  | 'burmese_to_burmese'
  | 'english_to_burmese'
  | 'dual'
  | 'burmese_to_english';

export interface SubtitleModeOption {
  id: SubtitleModeId;
  labelMy: string;
  shortLabel: string;
}

export const SUBTITLE_MODES: SubtitleModeOption[] = [
  {
    id: 'english_to_burmese',
    labelMy: 'နိုင်ငံခြားသီချင်း (EN/Other) -> မြန်မာဘာသာပြန်',
    shortLabel: 'Foreign -> Burmese',
  },
  {
    id: 'dual',
    labelMy: 'မူရင်း + မြန်မာ နှစ်ထပ်စာတန်း (Dual)',
    shortLabel: 'Dual (Original + MY)',
  },
  {
    id: 'burmese_to_burmese',
    labelMy: 'မြန်မာသီချင်း -> မြန်မာစာတန်းထိုး',
    shortLabel: 'Burmese Lyrics',
  },
  {
    id: 'burmese_to_english',
    labelMy: 'မြန်မာသီချင်း -> English ဘာသာပြန်',
    shortLabel: 'Burmese -> English',
  },
];

export type GeminiModelId = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';

export interface GeminiModelOption {
  id: GeminiModelId;
  label: string;
  note: string;
}

export const GEMINI_MODELS: GeminiModelOption[] = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    note: 'Fast & High Precision · Recommended',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    note: 'Lite Alternative',
  },
];

export type SubtitleColorId =
  | 'rainbow'
  | 'neon_mix'
  | 'sunset_gold'
  | 'white'
  | 'yellow'
  | 'cyan'
  | 'pink'
  | 'mint'
  | 'coral';

export interface SubtitleColorOption {
  labelMy: string;
  assHex: string;
  cssHex: string;
  swatchCss: string;
  palette?: Array<{ cssHex: string; assHex: string }>;
}

export const SUBTITLE_COLORS: Record<SubtitleColorId, SubtitleColorOption> = {
  rainbow: {
    labelMy: 'ရောင်စုံ (Rainbow)',
    assHex: '&H0047E0FD&',
    cssHex: '#FDE047',
    swatchCss:
      'linear-gradient(135deg, #FDE047 0%, #38BDF8 33%, #F472B6 66%, #4ADE80 100%)',
    palette: [
      { cssHex: '#FDE047', assHex: '&H0047E0FD&' },
      { cssHex: '#38BDF8', assHex: '&H00F8BD38&' },
      { cssHex: '#F472B6', assHex: '&H00B672F4&' },
      { cssHex: '#4ADE80', assHex: '&H0080DE4A&' },
      { cssHex: '#FB923C', assHex: '&H003C92FB&' },
      { cssHex: '#C084FC', assHex: '&H00FC84C0&' },
    ],
  },
  neon_mix: {
    labelMy: 'Neon ရောင်စုံ',
    assHex: '&H00EED322&',
    cssHex: '#22D3EE',
    swatchCss: 'linear-gradient(135deg, #22D3EE 0%, #C084FC 50%, #F472B6 100%)',
    palette: [
      { cssHex: '#22D3EE', assHex: '&H00EED322&' },
      { cssHex: '#C084FC', assHex: '&H00FC84C0&' },
      { cssHex: '#F472B6', assHex: '&H00B672F4&' },
    ],
  },
  sunset_gold: {
    labelMy: 'နေဝင်ရောင်စုံ',
    assHex: '&H0047E0FD&',
    cssHex: '#FB923C',
    swatchCss: 'linear-gradient(135deg, #FDE047 0%, #FB923C 50%, #FB7185 100%)',
    palette: [
      { cssHex: '#FDE047', assHex: '&H0047E0FD&' },
      { cssHex: '#FB923C', assHex: '&H003C92FB&' },
      { cssHex: '#FB7185', assHex: '&H008571FB&' },
    ],
  },
  white: {
    labelMy: 'အဖြူ (White)',
    assHex: '&H00FFFFFF',
    cssHex: '#FFFFFF',
    swatchCss: '#FFFFFF',
  },
  yellow: {
    labelMy: 'ရွှေဝါ (Gold)',
    assHex: '&H0000FFFF',
    cssHex: '#FACC15',
    swatchCss: '#FACC15',
  },
  cyan: {
    labelMy: 'အပြာနု (Cyan)',
    assHex: '&H00FFFF00',
    cssHex: '#22D3EE',
    swatchCss: '#22D3EE',
  },
  pink: {
    labelMy: 'ပန်းရောင် (Pink)',
    assHex: '&H00B672F4&',
    cssHex: '#F472B6',
    swatchCss: '#F472B6',
  },
  mint: {
    labelMy: 'အစိမ်းနု (Mint)',
    assHex: '&H0099D334&',
    cssHex: '#34D399',
    swatchCss: '#34D399',
  },
  coral: {
    labelMy: 'ပုစွန်ဆီ (Coral)',
    assHex: '&H008571FB&',
    cssHex: '#FB7185',
    swatchCss: '#FB7185',
  },
};

export type SubtitlePositionId = 'top' | 'center' | 'bottom' | 'custom';

export const SUBTITLE_POSITIONS: Record<
  SubtitlePositionId,
  { labelMy: string; shortMy: string; alignment: number; marginV: number; xPct: number; yPct: number }
> = {
  top: {
    labelMy: 'အပေါ် (Top)',
    shortMy: 'အပေါ်',
    alignment: 8,
    marginV: 24,
    xPct: 50,
    yPct: 14,
  },
  center: {
    labelMy: 'အလယ် (Center)',
    shortMy: 'အလယ်',
    alignment: 5,
    marginV: 10,
    xPct: 50,
    yPct: 50,
  },
  bottom: {
    labelMy: 'အောက်ခြေ (Bottom)',
    shortMy: 'အောက်ခြေ',
    alignment: 2,
    marginV: 40,
    xPct: 50,
    yPct: 88,
  },
  custom: {
    labelMy: 'စိတ်ကြိုက် (Custom)',
    shortMy: 'စိတ်ကြိုက်',
    alignment: 5,
    marginV: 10,
    xPct: 50,
    yPct: 88,
  },
};

export type SubtitleAnimationId =
  | 'word_pop'
  | 'bounce'
  | 'slide_run'
  | 'karaoke_pop'
  | 'static';

export interface SubtitleAnimationOption {
  id: SubtitleAnimationId;
  labelMy: string;
  shortMy: string;
}

export const SUBTITLE_ANIMATIONS: SubtitleAnimationOption[] = [
  {
    id: 'word_pop',
    labelMy: 'တစ်လုံးချင်း ခုန်ဖောက် (Word Pop)',
    shortMy: 'တစ်လုံးချင်း ခုန်ဖောက်',
  },
  {
    id: 'bounce',
    labelMy: 'ခုန်စွခုန်စွ (Bounce)',
    shortMy: 'ခုန်စွခုန်စွ',
  },
  {
    id: 'slide_run',
    labelMy: 'စာတန်းပြေး (Slide Run)',
    shortMy: 'စာတန်းပြေး',
  },
  {
    id: 'karaoke_pop',
    labelMy: 'တေးသံပေါက် (Beat Pop)',
    shortMy: 'တေးသံပေါက်',
  },
  {
    id: 'static',
    labelMy: 'ရိုးရိုးတည်ငြိမ် (Static)',
    shortMy: 'တည်ငြိမ်',
  },
];

export type VideoAspectId =
  | 'original'
  | 'tiktok_9_16'
  | 'youtube_16_9'
  | 'portrait_4_5'
  | 'square_1_1';

export interface VideoAspectOption {
  id: VideoAspectId;
  label: string;
  labelMy: string;
  shortMy: string;
  width: number | null;
  height: number | null;
  ratio: number | null;
}

export const VIDEO_ASPECT_PRESETS: VideoAspectOption[] = [
  {
    id: 'original',
    label: 'Original',
    labelMy: 'Original (မူရင်းဆိုဒ်အတိုင်း)',
    shortMy: 'Original',
    width: null,
    height: null,
    ratio: null,
  },
  {
    id: 'tiktok_9_16',
    label: '9:16 TikTok',
    labelMy: 'TikTok / Reels (9:16 · 1080×1920)',
    shortMy: 'TikTok 9:16',
    width: 1080,
    height: 1920,
    ratio: 9 / 16,
  },
  {
    id: 'youtube_16_9',
    label: '16:9 YouTube',
    labelMy: 'YouTube (16:9 · 1920×1080)',
    shortMy: 'YouTube 16:9',
    width: 1920,
    height: 1080,
    ratio: 16 / 9,
  },
  {
    id: 'portrait_4_5',
    label: '4:5 FB / IG',
    labelMy: 'FB / IG Feed (4:5 · 1080×1350)',
    shortMy: 'FB / IG 4:5',
    width: 1080,
    height: 1350,
    ratio: 4 / 5,
  },
  {
    id: 'square_1_1',
    label: '1:1 Square',
    labelMy: 'Square (1:1 · 1080×1080)',
    shortMy: 'Square 1:1',
    width: 1080,
    height: 1080,
    ratio: 1,
  },
];

export type VideoFitModeId = 'blur_fit' | 'crop_fill';

export const VIDEO_FIT_MODES: Array<{ id: VideoFitModeId; labelMy: string }> = [
  { id: 'blur_fit', labelMy: 'နောက်ခံဝါးအပြည့် (Blur Fit)' },
  { id: 'crop_fill', labelMy: 'မျက်နှာပြင်အပြည့် (Full Crop)' },
];

export type LogoPositionId =
  | 'top_left'
  | 'top_center'
  | 'top_right'
  | 'center'
  | 'bottom_left'
  | 'bottom_right'
  | 'custom';

export interface LogoPositionOption {
  id: LogoPositionId;
  label: string;
  labelMy: string;
  xPct: number;
  yPct: number;
}

export const LOGO_POSITIONS: LogoPositionOption[] = [
  { id: 'top_left', label: 'Top Left', labelMy: 'ဘယ်အပေါ်', xPct: 14, yPct: 12 },
  { id: 'top_center', label: 'Top Center', labelMy: 'အလယ်အပေါ်', xPct: 50, yPct: 12 },
  { id: 'top_right', label: 'Top Right', labelMy: 'ညာအပေါ်', xPct: 86, yPct: 12 },
  { id: 'center', label: 'Center', labelMy: 'အလယ်', xPct: 50, yPct: 50 },
  { id: 'bottom_left', labelMy: 'ဘယ်အောက်', label: 'Bottom Left', xPct: 14, yPct: 86 },
  { id: 'bottom_right', label: 'Bottom Right', labelMy: 'ညာအောက်', xPct: 86, yPct: 86 },
];

export type LogoAnimationId = 'float' | 'bounce' | 'sway' | 'pulse' | 'static';

export const LOGO_ANIMATIONS: Array<{
  id: LogoAnimationId;
  labelMy: string;
  shortMy: string;
}> = [
  { id: 'float', labelMy: 'လွင့်မျော (Float)', shortMy: 'လွင့်မျော' },
  { id: 'bounce', labelMy: 'ခုန်စွခုန်စွ (Bounce)', shortMy: 'ခုန်စွခုန်စွ' },
  { id: 'sway', labelMy: 'ယိမ်းနွဲ့ (Sway)', shortMy: 'ယိမ်းနွဲ့' },
  { id: 'pulse', labelMy: 'တုန်ခါပေါက် (Pulse)', shortMy: 'Pulse' },
  { id: 'static', labelMy: 'တည်ငြိမ် (Static)', shortMy: 'တည်ငြိမ်' },
];

export type TextLogoStyleId =
  | 'minimal_white'
  | 'dark_glass'
  | 'amber_gold'
  | 'outline_badge';

export interface TextLogoStyleOption {
  id: TextLogoStyleId;
  labelMy: string;
}

export const TEXT_LOGO_STYLES: TextLogoStyleOption[] = [
  { id: 'minimal_white', labelMy: 'Minimal Text' },
  { id: 'dark_glass', labelMy: 'Dark Glass' },
  { id: 'amber_gold', labelMy: 'Amber Gold' },
  { id: 'outline_badge', labelMy: 'Outline Frame' },
];

export type TextLogoAnimationId =
  | 'wave'
  | 'bounce'
  | 'rainbow_pop'
  | 'pulse'
  | 'static';

export const TEXT_LOGO_ANIMATIONS: Array<{
  id: TextLogoAnimationId;
  labelMy: string;
  shortMy: string;
}> = [
  { id: 'wave', labelMy: 'စာလုံးလှိုင်းတွန့် (Wave)', shortMy: 'လှိုင်းတွန့်' },
  { id: 'bounce', labelMy: 'စာလုံးခုန်စွ (Bounce)', shortMy: 'ခုန်စွ' },
  { id: 'rainbow_pop', labelMy: 'ရောင်စုံခုန်ပေါက် (Rainbow)', shortMy: 'ရောင်စုံ' },
  { id: 'pulse', labelMy: 'တလက်လက် (Glow Pulse)', shortMy: 'Pulse' },
  { id: 'static', labelMy: 'တည်ငြိမ် (Static)', shortMy: 'တည်ငြိမ်' },
];

export interface TextLogoConfig {
  enabled: boolean;
  text: string;
  styleId: TextLogoStyleId;
  colorId: SubtitleColorId;
  animationId: TextLogoAnimationId;
  xPct: number;
  yPct: number;
  size: number;
  opacity: number;
}

export const DEFAULT_TEXT_LOGO_CONFIG: TextLogoConfig = {
  enabled: false,
  text: '',
  styleId: 'minimal_white',
  colorId: 'rainbow',
  animationId: 'wave',
  xPct: 50,
  yPct: 14,
  size: 22,
  opacity: 0.95,
};

export interface UploadedLogoMeta {
  logoId: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  previewUrl: string;
}

export interface LogoOverlayConfig {
  enabled: boolean;
  position: LogoPositionId;
  xPct: number;
  yPct: number;
  scalePct: number;
  opacity: number;
  marginPct: number;
  animation: LogoAnimationId;
}

export const DEFAULT_LOGO_CONFIG: LogoOverlayConfig = {
  enabled: true,
  position: 'top_right',
  xPct: 86,
  yPct: 12,
  scalePct: 15,
  opacity: 0.9,
  marginPct: 3,
  animation: 'float',
};

export interface MyanmarFontOption {
  id: string;
  fontFamily: string;
  label: string;
  styleTagMy: string;
  styleTagEn: string;
  sampleText: string;
  files: Array<{ file: string; weight: number }>;
}

export const MYANMAR_FONTS: MyanmarFontOption[] = [
  {
    id: 'noto_sans',
    fontFamily: 'Noto Sans Myanmar',
    label: 'Noto Sans Myanmar',
    styleTagMy: 'ခေတ်မီရိုးရှင်း',
    styleTagEn: 'Modern Sans',
    sampleText: 'ချစ်သူရယ် မင်းအတွက် MV',
    files: [
      { file: 'NotoSansMyanmar-Regular.ttf', weight: 400 },
      { file: 'NotoSansMyanmar-Bold.ttf', weight: 700 },
    ],
  },
  {
    id: 'noto_serif',
    fontFamily: 'Noto Serif Myanmar',
    label: 'Noto Serif Myanmar',
    styleTagMy: 'ဂန္ထဝင်စာအုပ်',
    styleTagEn: 'Classic Serif',
    sampleText: 'ချစ်သူရယ် မင်းအတွက် MV',
    files: [
      { file: 'NotoSerifMyanmar-Regular.ttf', weight: 400 },
      { file: 'NotoSerifMyanmar-Bold.ttf', weight: 700 },
    ],
  },
  {
    id: 'padauk',
    fontFamily: 'Padauk',
    label: 'Padauk',
    styleTagMy: 'ဝိုင်းစက်ချောမွေ့',
    styleTagEn: 'Soft Rounded',
    sampleText: 'ချစ်သူရယ် မင်းအတွက် MV',
    files: [
      { file: 'Padauk-Regular.ttf', weight: 400 },
      { file: 'Padauk-Bold.ttf', weight: 700 },
    ],
  },
  {
    id: 'pyidaungsu',
    fontFamily: 'Pyidaungsu',
    label: 'Pyidaungsu',
    styleTagMy: 'တရားဝင်စံ',
    styleTagEn: 'Official Crisp',
    sampleText: 'ချစ်သူရယ် မင်းအတွက် MV',
    files: [{ file: 'Pyidaungsu-Bold.ttf', weight: 700 }],
  },
  {
    id: 'myanmar_khyay',
    fontFamily: 'Myanmar Khyay',
    label: 'Myanmar Khyay',
    styleTagMy: 'အနုပညာစာလုံးထူ',
    styleTagEn: 'Artistic Bold',
    sampleText: 'ချစ်သူရယ် မင်းအတွက် MV',
    files: [{ file: 'Myanmar-Khyay.ttf', weight: 400 }],
  },
  {
    id: 'myanmar_yinmar',
    fontFamily: 'Myanmar Yinmar',
    label: 'Myanmar Yinmar',
    styleTagMy: 'ချစ်စဖွယ်အလှ',
    styleTagEn: 'Cute Chunky',
    sampleText: 'ချစ်သူရယ် မင်းအတွက် MV',
    files: [{ file: 'MyanmarYinmar.ttf', weight: 400 }],
  },
  {
    id: 'myanmar_tagu',
    fontFamily: 'Myanmar Tagu',
    label: 'Myanmar Tagu',
    styleTagMy: 'စောင်းလှပ',
    styleTagEn: 'Stylish Italic',
    sampleText: 'ချစ်သူရယ် မင်းအတွက် MV',
    files: [{ file: 'MyanmarTagu.ttf', weight: 400 }],
  },
  {
    id: 'myanmar_phetsot',
    fontFamily: 'Myanmar Phetsot',
    label: 'Myanmar Phetsot',
    styleTagMy: 'ကဗျာဆန်ဆန်',
    styleTagEn: 'Poetic Slim',
    sampleText: 'ချစ်သူရယ် မင်းအတွက် MV',
    files: [{ file: 'MyanmarPhetsot.ttf', weight: 400 }],
  },
  {
    id: 'yay_chan_zin',
    fontFamily: 'Masterpiece Yay Chan Zin',
    label: 'Yay Chan Zin',
    styleTagMy: 'လက်ရေးလှ',
    styleTagEn: 'Handwritten',
    sampleText: 'ချစ်သူရယ် မင်းအတွက် MV',
    files: [{ file: 'Masterpiece-YayChanZin.ttf', weight: 400 }],
  },
  {
    id: 'myanmar_head_one',
    fontFamily: 'Myanmar Head One',
    label: 'Myanmar Head One',
    styleTagMy: 'ခေါင်းစီးစတိုင်',
    styleTagEn: 'MV Headline',
    sampleText: 'ချစ်သူရယ် မင်းအတွက် MV',
    files: [{ file: 'MyanmarHeadOne.ttf', weight: 400 }],
  },
];

export type StudioToolId =
  | 'ai_subtitle'
  | 'srt_editor'
  | 'color'
  | 'subtitle_style'
  | 'logo'
  | 'video_size'
  | 'export';

export const APP_BRAND_LOGO_URL =
  '/assets/aistudio/Black_Yellow_Icon_Modern_Brand_Music_Logo_20261126_144416_0000_56d8a259.png';

export type DownloadQualityId = 'best' | '1080' | '720' | '480' | 'audio_mp3';

export const DOWNLOAD_QUALITY_OPTIONS: Array<{
  id: DownloadQualityId;
  label: string;
  labelMy: string;
}> = [
  { id: 'best', label: 'Best HD', labelMy: 'အကြည်ဆုံး (HD)' },
  { id: '1080', label: '1080p', labelMy: '1080p Full HD' },
  { id: '720', label: '720p', labelMy: '720p HD' },
  { id: '480', label: '480p', labelMy: '480p ဖိုင်သေး' },
  { id: 'audio_mp3', label: 'MP3', labelMy: 'MP3 အသံသီးသန့်' },
];

export interface InspectedVideoLinkInfo {
  url: string;
  title: string;
  platform: string;
  durationSec?: number;
  thumbnailUrl?: string;
  uploader?: string;
  isDirectFile?: boolean;
}

export interface DownloadedVideoItem {
  downloadId: string;
  sourceUrl: string;
  title: string;
  platform: string;
  durationSec?: number;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  downloadUrl: string;
  isAudioOnly: boolean;
  createdAt: number;
}

export interface StudioVideoMeta {
  videoId: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
}

export interface RenderResult {
  renderId: string;
  videoUrl: string;
  blobUrl?: string;
  srtUrl: string | null;
  filename: string;
  sizeBytes: number;
}

export const CREATOR_FACEBOOK_URL = 'https://www.facebook.com/share/1CMepoKrez/';
