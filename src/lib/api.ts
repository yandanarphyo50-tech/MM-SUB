export function isEmbeddedIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function extractFirstHttpUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return trimmed;
  return match[0].replace(/[),.;!?'"\]]+$/g, '');
}

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function getAsciiSafeMediaFilename(
  raw: string,
  fallbackExt = '.mp4'
): string {
  const extMatch = raw.match(/\.([a-zA-Z0-9]{2,5})$/);
  const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : fallbackExt;
  const withoutExt = raw.replace(/\.[^.]+$/, '');
  const ascii = withoutExt
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return `${ascii || 'myanmar_mv_media'}${ext}`;
}

export function getAsciiSafeMp4Filename(raw: string): string {
  return getAsciiSafeMediaFilename(raw, '.mp4');
}

export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /FBAN|FBAV|FB_IAB|FB4A|Messenger|Instagram|Line|MicroMessenger|BytedanceWebview|musical_ly|TikTok|Viber|Zalo|;\s*wv\b/i.test(
    navigator.userAgent
  );
}

export function isMiBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /MiuiBrowser|XiaoMi/i.test(navigator.userAgent);
}

export function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android/i.test(navigator.userAgent);
}

export function getAndroidChromeIntentUrl(targetUrl: string): string | null {
  if (!isAndroidDevice()) return null;
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'https:') return null;
    const hostAndPath = `${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
    return `intent://${hostAndPath}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(
      parsed.toString()
    )};end`;
  } catch {
    return null;
  }
}

export function isOwnAppUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname.toLowerCase();
    if (typeof window !== 'undefined' && host === window.location.hostname.toLowerCase()) {
      return true;
    }
    if (/^ais-(dev|pre)-[a-z0-9-]+\..+\.run\.app$/i.test(host)) {
      return true;
    }
    if (host === 'aistudio.google.com' || host.endsWith('.aistudio.google.com')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function triggerObjectUrlDownload(objectUrl: string, filename: string): void {
  const safeName = getAsciiSafeMediaFilename(filename, '.mp4');
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = safeName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) {
      a.parentNode.removeChild(a);
    }
  }, 1000);
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const safeName = getAsciiSafeMediaFilename(filename, '.mp4');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) {
      a.parentNode.removeChild(a);
    }
    URL.revokeObjectURL(url);
  }, 60_000);
}

export function triggerDirectDownload(url: string, filename: string): void {
  const safeName = getAsciiSafeMediaFilename(filename, '.mp4');
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) {
      a.parentNode.removeChild(a);
    }
  }, 1000);
}
