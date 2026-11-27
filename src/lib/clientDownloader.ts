import { extractFirstHttpUrl, getAsciiSafeMediaFilename, isOwnAppUrl } from './api';
import type {
  DownloadQualityId,
  DownloadedVideoItem,
  InspectedVideoLinkInfo,
} from './studioTypes';

const DIRECT_MEDIA_EXT_RE = /\.(mp4|mov|webm|m4v|mkv|mp3|wav|aac|m4a)(?:$|[?#])/i;

export function detectLinkPlatform(rawUrl: string): {
  platform: string;
  isDirectMediaExt: boolean;
  isAudioExt: boolean;
} {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const pathAndQuery = `${parsed.pathname}${parsed.search}`;
    const isDirectMediaExt = DIRECT_MEDIA_EXT_RE.test(pathAndQuery);
    const isAudioExt = /\.(mp3|wav|aac|m4a)(?:$|[?#])/i.test(pathAndQuery);

    if (host.includes('tiktok.com') || host.includes('douyin.com')) {
      return { platform: 'TikTok', isDirectMediaExt, isAudioExt };
    }
    if (host.includes('facebook.com') || host.includes('fb.watch') || host.includes('fb.com')) {
      return { platform: 'Facebook', isDirectMediaExt, isAudioExt };
    }
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      return { platform: 'YouTube', isDirectMediaExt, isAudioExt };
    }
    if (host.includes('instagram.com')) {
      return { platform: 'Instagram', isDirectMediaExt, isAudioExt };
    }
    if (host.includes('twitter.com') || host.includes('x.com')) {
      return { platform: 'X (Twitter)', isDirectMediaExt, isAudioExt };
    }
    return {
      platform: isDirectMediaExt ? 'Direct Media Link' : 'Web Video Link',
      isDirectMediaExt,
      isAudioExt,
    };
  } catch {
    return { platform: 'Video Link', isDirectMediaExt: false, isAudioExt: false };
  }
}

function deriveFilenameFromUrl(rawUrl: string, fallbackExt: string): string {
  try {
    const parsed = new URL(rawUrl);
    const seg = parsed.pathname.split('/').filter(Boolean).pop() || '';
    if (seg) {
      const cleaned = decodeURIComponent(seg.split('?')[0]);
      if (/\.[a-z0-9]{2,5}$/i.test(cleaned)) {
        return getAsciiSafeMediaFilename(cleaned, fallbackExt);
      }
      return getAsciiSafeMediaFilename(`${cleaned}${fallbackExt}`, fallbackExt);
    }
  } catch {
    // Ignore URL filename parse error
  }
  return `downloaded_video${fallbackExt}`;
}

export async function inspectVideoLinkClient(
  rawInput: string
): Promise<InspectedVideoLinkInfo> {
  const url = extractFirstHttpUrl(rawInput);
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error('မှန်ကန်သော Video Link (https://...) ထည့်ပေးပါ။');
  }
  if (isOwnAppUrl(url)) {
    throw new Error(
      'ဤ Link သည် Myanmar MV Studio App ၏ Link ဖြစ်နေပါသည် — ကျေးဇူးပြု၍ MP4 Direct Link သို့မဟုတ် Video Link အစစ် ထည့်ပေးပါ။'
    );
  }

  const { platform, isDirectMediaExt } = detectLinkPlatform(url);

  if (!isDirectMediaExt && ['TikTok', 'Facebook', 'YouTube', 'Instagram'].includes(platform)) {
    return {
      url,
      title: `${platform} Video Page`,
      platform,
      isDirectFile: false,
    };
  }

  // Probe HEAD to check CORS / Content-Type for direct media links
  try {
    const res = await fetch(url, { method: 'HEAD', mode: 'cors' });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const isMedia = ct.startsWith('video/') || ct.startsWith('audio/') || isDirectMediaExt;
    return {
      url,
      title: deriveFilenameFromUrl(url, ct.startsWith('audio/') ? '.mp3' : '.mp4'),
      platform: isMedia ? 'Direct Media Link' : platform,
      isDirectFile: isMedia,
    };
  } catch {
    return {
      url,
      title: isDirectMediaExt ? deriveFilenameFromUrl(url, '.mp4') : `${platform} Link`,
      platform,
      isDirectFile: isDirectMediaExt,
    };
  }
}

export async function downloadVideoLinkClient(
  rawInput: string,
  qualityId: DownloadQualityId
): Promise<DownloadedVideoItem> {
  const url = extractFirstHttpUrl(rawInput);
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error('မှန်ကန်သော Video Link (https://...) ထည့်ပေးပါ။');
  }
  if (isOwnAppUrl(url)) {
    throw new Error(
      'ဤ Link သည် Myanmar MV Studio App ၏ Link ဖြစ်နေပါသည် — ကျေးဇူးပြု၍ MP4 Video Link အစစ် ထည့်ပေးပါ။'
    );
  }

  const { platform, isDirectMediaExt, isAudioExt } = detectLinkPlatform(url);
  const wantAudio = qualityId === 'audio_mp3' || isAudioExt;
  const fallbackExt = wantAudio ? '.mp3' : '.mp4';

  // For social web pages (non-direct links), explain browser CORS limitation clearly in Burmese
  if (!isDirectMediaExt && ['TikTok', 'Facebook', 'YouTube', 'Instagram', 'X (Twitter)'].includes(platform)) {
    throw new Error(
      `${platform} Link များကို Browser/APK မှ တိုက်ရိုက်ဒေါင်းလုဒ်ဆွဲခြင်းကို ${platform} ၏ Browser Security (CORS) မှ ပိတ်ထားပါသည်။ Direct MP4 Link (.mp4) ထည့်၍ ဒေါင်းနိုင်သလို ဖုန်းထဲ Video သိမ်းပြီးပါက Video Edit Studio ထဲသို့ တိုက်ရိုက်ထည့်ပြင်နိုင်ပါသည်။`
    );
  }

  const downloadId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `dl_${Date.now()}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    const res = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok) {
      throw new Error(`ဖိုင်ဒေါင်းယူ၍မရပါ (HTTP ${res.status})။`);
    }
    if (ct.includes('text/html')) {
      throw new Error(
        `ဤ Link သည် Web Page HTML ဖြစ်နေသောကြောင့် MP4 ဖိုင်တိုက်ရိုက်မဟုတ်ပါ။ Direct .mp4 / .mp3 Media Link ထည့်ပေးပါ။`
      );
    }

    const blob = await res.blob();
    if (blob.size === 0) {
      throw new Error('ဒေါင်းယူရရှိသော ဖိုင်အလွတ်ဖြစ်နေပါသည်။');
    }

    const isAudio = ct.startsWith('audio/') || isAudioExt;
    const filename = deriveFilenameFromUrl(url, isAudio ? '.mp3' : fallbackExt);
    const blobUrl = URL.createObjectURL(blob);

    return {
      downloadId,
      sourceUrl: url,
      title: filename,
      platform: 'Direct Media Link',
      filename,
      sizeBytes: blob.size,
      mimeType: blob.type || (isAudio ? 'audio/mpeg' : 'video/mp4'),
      downloadUrl: blobUrl,
      isAudioOnly: isAudio,
      createdAt: Date.now(),
    };
  } catch (err) {
    // If direct .mp4/.mov/.mp3 URL blocked CORS fetch, allow direct browser anchor download
    if (isDirectMediaExt) {
      const filename = deriveFilenameFromUrl(url, fallbackExt);
      return {
        downloadId,
        sourceUrl: url,
        title: `${filename} (Direct Link)`,
        platform: 'Direct MP4 Link',
        filename,
        sizeBytes: 0,
        mimeType: isAudioExt ? 'audio/mpeg' : 'video/mp4',
        downloadUrl: url,
        isAudioOnly: isAudioExt,
        createdAt: Date.now(),
      };
    }

    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Download ချိန် ကြာမြင့်နေပါသည်။ Link ကို စစ်ဆေးပြီး ထပ်စမ်းပါ။');
    }
    if (err instanceof TypeError) {
      throw new Error(
        'ဤ Website ၏ Server သည် Browser CORS ခွင့်ပြုမထားသောကြောင့် တိုက်ရိုက်ဆွဲမရပါ။ Direct .mp4 Link ထည့်ပါ သို့မဟုတ် Browser ဖြင့် သီးသန့်ဖွင့်ပြီး Save ယူပါ။'
      );
    }
    throw err instanceof Error
      ? err
      : new Error('Video Link မှ ဒေါင်းယူရာတွင် အမှားဖြစ်ပွားပါသည်။');
  }
}
