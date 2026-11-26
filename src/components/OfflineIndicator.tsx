import React from 'react';
import { useOnlineStatus } from '../hooks/usePWAInstall';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 shadow-lg">
      <span className="h-2 w-2 rounded-full bg-zinc-950 animate-pulse" />
      <span>Offline Mode — Internet ချိတ်ဆက်မှု ပြတ်တောက်နေပါသည်</span>
    </div>
  );
};
