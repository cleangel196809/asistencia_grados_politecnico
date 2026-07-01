import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../hooks/useOffline';
import { LogOut, Wifi, WifiOff } from 'lucide-react';

const Navbar = () => {
  const { user, logout } = useAuth();
  const isOnline = useOffline();

  const roleColors = {
    admin: 'bg-red-600',
    logistico: 'bg-yellow-600',
    scanner: 'bg-green-600'
  };

  return (
    <nav className="bg-blue-900 text-white px-6 py-3 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-3">
        <div className="text-xl font-bold">🎓 Politécnico Internacional</div>
        <span className="text-blue-300 text-sm hidden md:block">Control de Asistencia</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {isOnline ? (
            <Wifi size={16} className="text-green-400" />
          ) : (
            <WifiOff size={16} className="text-red-400" />
          )}
          <span className={`text-xs px-2 py-1 rounded-full text-white ${roleColors[user?.role] || 'bg-gray-600'}`}>
            {user?.role?.toUpperCase()}
          </span>
          <span className="text-sm">{user?.full_name}</span>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1 bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm transition-colors"
        >
          <LogOut size={14} />
          Salir
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
