import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const CLIENT_VERSION =
  typeof __APP_VERSION__ === 'string' && __APP_VERSION__ ? __APP_VERSION__ : 'dev';

async function clearCachesAndServiceWorkers(includeAllSw = false): Promise<boolean> {
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {
      // Ignore cache cleanup failures
    }
  }

  let unregistered = false;
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        const scriptUrl =
          reg.active?.scriptURL ||
          reg.waiting?.scriptURL ||
          reg.installing?.scriptURL ||
          '';
        if (includeAllSw || scriptUrl.includes('dev-sw.js')) {
          const ok = await reg.unregister().catch(() => false);
          if (ok) unregistered = true;
        }
      }
    } catch {
      // Ignore SW cleanup failures
    }
  }
  return unregistered;
}

let isCheckingVersion = false;

async function checkAndApplyVersionUpgrade(): Promise<void> {
  if (typeof window === 'undefined' || CLIENT_VERSION === 'dev' || isCheckingVersion) {
    return;
  }
  isCheckingVersion = true;
  try {
    const res = await fetch(`/api/version?_=${Date.now()}`, {
      method: 'GET',
      credentials: 'include',
      redirect: 'manual',
      cache: 'no-store',
    });
    if (!res.ok) return;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return;
    const data = (await res.json()) as { version?: string };
    const serverVer = typeof data.version === 'string' ? data.version.trim() : '';
    if (!serverVer || serverVer === 'dev' || serverVer === CLIENT_VERSION) {
      return;
    }

    const upgradeKey = 'mv_studio_upgraded_ver';
    try {
      if (sessionStorage.getItem(upgradeKey) === serverVer) {
        return;
      }
      sessionStorage.setItem(upgradeKey, serverVer);
    } catch {
      // Ignore storage restriction
    }

    await clearCachesAndServiceWorkers(true);
    const url = new URL(window.location.href);
    url.searchParams.set('_v', serverVer);
    window.location.replace(url.toString());
  } catch {
    // Ignore transient offline/proxy errors during background check
  } finally {
    isCheckingVersion = false;
  }
}

if (typeof window !== 'undefined') {
  // Clean cache-busting query param from URL bar once upgraded bundle is active
  try {
    const curUrl = new URL(window.location.href);
    if (curUrl.searchParams.has('_v')) {
      curUrl.searchParams.delete('_v');
      window.history.replaceState({}, '', curUrl.toString());
    }
  } catch {
    // Ignore URL cleanup errors
  }

  void clearCachesAndServiceWorkers(false).then((hadLegacyDevSw) => {
    if (hadLegacyDevSw) {
      const reloadKey = 'mv_studio_devsw_cleared';
      try {
        if (!sessionStorage.getItem(reloadKey)) {
          sessionStorage.setItem(reloadKey, '1');
          window.location.reload();
        }
      } catch {
        // Ignore
      }
    }
  });

  if ('serviceWorker' in navigator) {
    let refreshing = false;
    const triggerSwReload = () => {
      if (refreshing) return;
      const key = 'mv_studio_sw_reloaded';
      try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, '1');
      } catch {
        // Ignore storage restrictions
      }
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', triggerSwReload);
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SW_UPDATED') {
        void checkAndApplyVersionUpgrade();
      }
    });

    void navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => reg.update().catch(() => {}))
      .catch(() => {});
  }

  void checkAndApplyVersionUpgrade();
  window.addEventListener('focus', () => {
    void checkAndApplyVersionUpgrade();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void checkAndApplyVersionUpgrade();
    }
  });
  window.setInterval(() => {
    void checkAndApplyVersionUpgrade();
  }, 60_000);
}

createRoot(document.getElementById('root')!).render(<App />);
