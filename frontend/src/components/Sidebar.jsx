import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, Users, Calendar, Upload, QrCode,
  FileBarChart, List, Mail, Scan
} from 'lucide-react';

const adminLinks = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/users', icon: Users, label: 'Usuarios' },
  { to: '/admin/events', icon: Calendar, label: 'Eventos' },
  { to: '/admin/participants', icon: Upload, label: 'Participantes' },
  { to: '/admin/qr', icon: QrCode, label: 'Gestión QR' },
  { to: '/admin/reports', icon: FileBarChart, label: 'Reportes' },
];

const logisticoLinks = [
  { to: '/logistico', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/logistico/participants', icon: List, label: 'Participantes' },
  { to: '/logistico/invitation', icon: Mail, label: 'Invitación Individual' },
];

const scannerLinks = [
  { to: '/scanner', icon: Scan, label: 'Scanner' },
];

const Sidebar = () => {
  const { user } = useAuth();

  const links = user?.role === 'admin' ? adminLinks
    : user?.role === 'logistico' ? logisticoLinks
    : scannerLinks;

  return (
    <aside className="bg-blue-800 text-white w-64 min-h-screen flex flex-col">
      <div className="p-4 border-b border-blue-700">
        <p className="text-sm text-blue-300">Bienvenido</p>
        <p className="font-semibold">{user?.full_name}</p>
      </div>
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {links.map(({ to, icon: Icon, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/admin' || to === '/logistico' || to === '/scanner'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive ? 'bg-blue-600 text-white' : 'text-blue-200 hover:bg-blue-700 hover:text-white'
                  }`
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;
