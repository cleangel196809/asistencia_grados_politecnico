import React, { createContext, useContext, useEffect, useState } from 'react';

const OfflineContext = createContext(null);

export const useOfflineContext = () => {
  const context = useContext(OfflineContext);
  if (!context) throw new Error('useOfflineContext must be used within OfflineProvider');
  return context;
};

export const OfflineProvider = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <OfflineContext.Provider value={{ isOnline }}>
      {children}
    </OfflineContext.Provider>
  );
};
