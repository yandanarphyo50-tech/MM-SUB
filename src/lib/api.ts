export function isEmbeddedIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function getSessionRefreshHref(): string {
  return '/api/session-entry';
}

export function canRequestStorageAccess(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof (document as Document & { requestStorageAccess?: () => Promise<void> })
      .requestStorageAccess === 'function'
  );
}

export async function tryRequestStorageAccess(): Promise<boolean> {
  if (!canRequestStorageAccess()) return false;
  try {
    await (
      document as Document & { requestStorageAccess: () => Promise<void> }
    ).requestStorageAccess();
    return true;
  } catch {
    return false;
  }
}

export interface SessionCheckDetail {
  sessionOk: boolean;
  authBlocked: boolean;
  offline: boolean;
}

export async function checkServerSessionDetailed(): Promise<SessionCheckDetail> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { sessionOk: false, authBlocked: false, offline: true };
  }
  try {
    const probe = await fetch(`/api/health?_=${Date.now()}`, {
      method: 'GET',
      credentials: 'include',
      redirect: 'manual',
      cache: 'no-store',
    });
    const ct = probe.headers.get('content-type') || '';
    if (
      probe.type === 'opaqueredirect' ||
      probe.status === 0 ||
      probe.status === 401 ||
      probe.status === 403 ||
      ct.includes('text/html')
    ) {
      return { sessionOk: false, authBlocked: true, offline: false };
    }
    return { sessionOk: probe.ok, authBlocked: false, offline: false };
  } catch {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const likelyBlockedRedirect = !offline && (isEmbeddedIframe() || isInAppBrowser());
    return { sessionOk: false, authBlocked: likelyBlockedRedirect, offline };
  }
}

export async function checkServerSessionOk(): Promise<boolean> {
  const detail = await checkServerSessionDetailed();
  return detail.sessionOk || detail.offline;
}

export class CookieCheckError extends Error {
  constructor() {
    super(
      isEmbeddedIframe()
        ? 'AI Studio Preview box အတွင်း၌ Browser သည် Security Cookie ကို ပိတ်ထားတတ်ပါသည်။ "Chrome Tab အသစ်တွင် ဖွင့်မည်" ကို နှိပ်၍ Tab အသစ်တွင် ဖွင့်သုံးပေးပါ။'
        : 'Browser Security / Google Login စစ်ဆေးမှု လိုအပ်နေပါသည်။ "Chrome Tab အသစ်တွင် ဖွင့်မည်" ကို နှိပ်၍ ဝင်ရောက်ပြီးမှ "ပြန်တင်မည် (Retry)" နှိပ်ပေးပါ။'
    );
    this.name = 'CookieCheckError';
  }
}

export function isNetworkFetchError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    err.name === 'TypeError' ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('network request failed') ||
    msg.includes('err_')
  );
}

export async function diagnoseFetchFailure(fallbackMessage?: string): Promise<Error> {
  const detail = await checkServerSessionDetailed();
  if (detail.offline) {
    return new Error(
      'အင်တာနက် ချိတ်ဆက်မှု ပြတ်တောက်နေပါသည်။ Wi-Fi / Mobile Data ကို စစ်ဆေးပြီး ပြန်တင်မည် နှိပ်ပါ။'
    );
  }
  if (detail.authBlocked) {
    return new CookieCheckError();
  }
  if (!detail.sessionOk && isEmbeddedIframe()) {
    return new CookieCheckError();
  }

  return new Error(
    fallbackMessage ||
      'Server နှင့် ချိတ်ဆက်မှု ယာယီပြတ်တောက်သွားပါသည်။ Chrome Tab အသစ်တွင် ဖွင့်ကြည့်ပါ (သို့) "ပြန်တင်မည် (Retry)" ကို နှိပ်ပေးပါ။'
  );
}

export async function resilientFetch(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = 90_000,
  timeoutMessage = 'Server ချိတ်ဆက်ချိန် ကြာမြင့်နေပါသည်။ ထပ်မံကြိုးစားပေးပါ။',
  networkFallbackMessage?: string
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, {
      redirect: 'manual',
      ...init,
      signal: controller.signal,
    });
    const ct = res.headers.get('content-type') || '';
    if (
      res.type === 'opaqueredirect' ||
      res.status === 0 ||
      res.status === 401 ||
      res.status === 403
    ) {
      throw new CookieCheckError();
    }
    if (ct.includes('text/html')) {
      const html = await res.clone().text();
      if (
        html.includes('Cookie check') ||
        html.includes('Authenticate in new window') ||
        html.includes('accounts.google.com')
      ) {
        throw new CookieCheckError();
      }
    }
    return res;
  } catch (err) {
    if (err instanceof CookieCheckError) {
      throw err;
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(timeoutMessage);
    }
    if (isNetworkFetchError(err)) {
      throw await diagnoseFetchFailure(networkFallbackMessage);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function parseApiResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    const html = await res.text();
    if (
      html.includes('Cookie check') ||
      html.includes('Authenticate in new window') ||
      html.includes('accounts.google.com')
    ) {
      throw new CookieCheckError();
    }
    throw new Error(`Server returned unexpected HTML (${res.status}).`);
  }

  let data: T & { error?: string };
  try {
    data = (await res.json()) as T & { error?: string };
  } catch {
    throw new Error(`Server response error (${res.status}).`);
  }

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status}).`);
  }
  return data;
}

function postFormDataViaXhr<T>(
  url: string,
  formData: FormData,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.withCredentials = true;
    xhr.timeout = timeoutMs;

    xhr.onload = () => {
      const ct = xhr.getResponseHeader('content-type') || '';
      const text = xhr.responseText || '';
      if (
        xhr.status === 401 ||
        xhr.status === 403 ||
        (xhr.responseURL &&
          (xhr.responseURL.includes('accounts.google.com') ||
            xhr.responseURL.includes('aistudio.google.com'))) ||
        (ct.includes('text/html') &&
          (text.includes('Cookie check') ||
            text.includes('Authenticate in new window') ||
            text.includes('accounts.google.com')))
      ) {
        reject(new CookieCheckError());
        return;
      }
      if (ct.includes('text/html')) {
        reject(new Error(`Server returned unexpected HTML (${xhr.status}).`));
        return;
      }
      try {
        const parsed = JSON.parse(text) as T & { error?: string };
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(parsed.error || `Upload failed (${xhr.status}).`));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new Error(`Server response error (${xhr.status}).`));
      }
    };

    xhr.ontimeout = () => {
      reject(new Error(timeoutMessage));
    };

    xhr.onerror = async () => {
      reject(await diagnoseFetchFailure());
    };

    xhr.send(formData);
  });
}

function postRawBytesViaXhr<T>(
  url: string,
  bytes: ArrayBuffer,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.withCredentials = true;
    xhr.timeout = timeoutMs;
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');

    xhr.onload = () => {
      const ct = xhr.getResponseHeader('content-type') || '';
      const text = xhr.responseText || '';
      if (
        xhr.status === 401 ||
        xhr.status === 403 ||
        (xhr.responseURL &&
          (xhr.responseURL.includes('accounts.google.com') ||
            xhr.responseURL.includes('aistudio.google.com'))) ||
        (ct.includes('text/html') &&
          (text.includes('Cookie check') ||
            text.includes('Authenticate in new window') ||
            text.includes('accounts.google.com')))
      ) {
        reject(new CookieCheckError());
        return;
      }
      if (ct.includes('text/html')) {
        reject(new Error(`Server returned unexpected HTML (${xhr.status}).`));
        return;
      }
      try {
        const parsed = JSON.parse(text) as T & { error?: string };
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(parsed.error || `Upload failed (${xhr.status}).`));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new Error(`Server response error (${xhr.status}).`));
      }
    };

    xhr.ontimeout = () => {
      reject(new Error(timeoutMessage));
    };

    xhr.onerror = async () => {
      reject(await diagnoseFetchFailure());
    };

    xhr.send(bytes);
  });
}

export async function postRawChunkResilient<T>(
  url: string,
  bytes: ArrayBuffer,
  timeoutMs = 60_000,
  timeoutMessage = 'Upload လုပ်ချိန် ကြာမြင့်နေပါသည်။ ထပ်မံကြိုးစားပေးပါ။'
): Promise<T> {
  try {
    const res = await resilientFetch(
      url,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: bytes,
      },
      timeoutMs,
      timeoutMessage
    );
    return await parseApiResponse<T>(res);
  } catch (err) {
    if (err instanceof CookieCheckError) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('ပြတ်တောက်') || isNetworkFetchError(err)) {
      return await postRawBytesViaXhr<T>(url, bytes, timeoutMs, timeoutMessage);
    }
    throw err;
  }
}

export async function postFormDataResilient<T>(
  url: string,
  formData: FormData,
  timeoutMs = 90_000,
  timeoutMessage = 'Upload လုပ်ချိန် ကြာမြင့်နေပါသည်။ ထပ်မံကြိုးစားပေးပါ။'
): Promise<T> {
  try {
    const res = await resilientFetch(
      url,
      {
        method: 'POST',
        credentials: 'include',
        body: formData,
      },
      timeoutMs,
      timeoutMessage
    );
    return await parseApiResponse<T>(res);
  } catch (err) {
    if (err instanceof CookieCheckError) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : '';
    if (
      msg.includes('ပြတ်တောက်') ||
      isNetworkFetchError(err)
    ) {
      return await postFormDataViaXhr<T>(url, formData, timeoutMs, timeoutMessage);
    }
    throw err;
  }
}

export async function fetchAuthenticatedBlob(url: string): Promise<Blob> {
  const res = await resilientFetch(
    url,
    { credentials: 'include' },
    90_000,
    'Download ချိန် ကြာမြင့်နေပါသည်။ ထပ်မံကြိုးစားပေးပါ။'
  );
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new CookieCheckError();
  }
  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return await res.blob();
}

const DOWNLOAD_CHUNK_BYTES = 6 * 1024 * 1024; // 6 MB per Range chunk to stay well below Cloud Run 32 MB response cap

export async function fetchVideoBlobInChunks(
  url: string,
  totalBytes: number,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  if (!totalBytes || totalBytes <= DOWNLOAD_CHUNK_BYTES) {
    onProgress?.(50);
    const blob = await fetchAuthenticatedBlob(url);
    onProgress?.(100);
    return blob;
  }

  const parts: Blob[] = [];
  let offset = 0;

  while (offset < totalBytes) {
    const end = Math.min(totalBytes - 1, offset + DOWNLOAD_CHUNK_BYTES - 1);
    const res = await resilientFetch(
      url,
      {
        credentials: 'include',
        headers: {
          Range: `bytes=${offset}-${end}`,
        },
      },
      90_000,
      'ဗီဒီယို Download အပိုင်းဆွဲချိန် ကြာမြင့်နေပါသည်။'
    );

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      throw new CookieCheckError();
    }

    if (res.status === 200) {
      const fullBlob = await res.blob();
      onProgress?.(100);
      return fullBlob;
    }

    if (res.status !== 206 && !res.ok) {
      let message = `Download failed (${res.status})`;
      try {
        const json = (await res.json()) as { error?: string };
        if (json.error) message = json.error;
      } catch {
        // ignore
      }
      throw new Error(message);
    }

    const chunkBlob = await res.blob();
    if (chunkBlob.size === 0) {
      throw new Error('Server မှ ဗီဒီယိုအပိုင်း ဖတ်၍မရပါ။');
    }
    parts.push(chunkBlob);
    offset += chunkBlob.size;
    onProgress?.(Math.min(99, Math.round((offset / totalBytes) * 100)));
  }

  onProgress?.(100);
  return new Blob(parts, { type: 'video/mp4' });
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
  const sep = url.includes('?') ? '&' : '?';
  const downloadHref = url.includes('download=1') ? url : `${url}${sep}download=1`;
  const a = document.createElement('a');
  a.href = downloadHref;
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
