import React from 'react';
import { useOffline } from '../hooks/useOffline';
import { WifiOff } from 'lucide-react';

const OfflineBanner = () => {
  const isOnline = useOffline();

  if (isOnline) return null;

  return (
    <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
      <WifiOff size={16} />
      <span>Sin conexión - Modo Offline Activo</span>
    </div>
  );
};

export default OfflineBanner;
