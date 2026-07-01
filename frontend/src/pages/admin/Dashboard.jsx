import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { Users, Calendar, QrCode, CheckCircle, Plus, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AdminDashboard = () => {
  const [stats, setStats] = useState({ events: 0, participants: 0, qrGenerated: 0, qrUsed: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const eventsRes = await api.get('/api/events');
      const eventsData = eventsRes.data;

      let totalParticipants = 0;
      let totalQR = 0;
      let usedQR = 0;

      for (const event of eventsData.slice(0, 5)) {
        try {
          const summary = await api.get(`/api/reports/summary/${event._id}`);
          totalParticipants += summary.data.total_participants || 0;
          totalQR += summary.data.total_qr || 0;
          usedQR += summary.data.used_qr || 0;
        } catch {}
      }

      setStats({
        events: eventsData.filter(e => e.activo).length,
        participants: totalParticipants,
        qrGenerated: totalQR,
        qrUsed: usedQR
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const statCards = [
    { label: 'Eventos Activos', value: stats.events, icon: Calendar, color: 'bg-blue-500' },
    { label: 'Total Participantes', value: stats.participants, icon: Users, color: 'bg-green-500' },
    { label: 'QR Generados', value: stats.qrGenerated, icon: QrCode, color: 'bg-purple-500' },
    { label: 'QR Utilizados', value: stats.qrUsed, icon: CheckCircle, color: 'bg-orange-500' },
  ];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Panel de Administración</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl shadow p-5 flex items-center gap-4">
            <div className={`${card.color} p-3 rounded-lg text-white`}>
              <card.icon size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{card.value}</p>
              <p className="text-sm text-gray-500">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => navigate('/admin/events')}
          className="bg-blue-600 text-white rounded-xl p-5 flex items-center gap-3 hover:bg-blue-700 transition-colors"
        >
          <Plus size={24} /> <span className="font-semibold">Crear Evento</span>
        </button>
        <button
          onClick={() => navigate('/admin/participants')}
          className="bg-green-600 text-white rounded-xl p-5 flex items-center gap-3 hover:bg-green-700 transition-colors"
        >
          <Upload size={24} /> <span className="font-semibold">Cargar Participantes</span>
        </button>
        <button
          onClick={() => navigate('/admin/qr')}
          className="bg-purple-600 text-white rounded-xl p-5 flex items-center gap-3 hover:bg-purple-700 transition-colors"
        >
          <QrCode size={24} /> <span className="font-semibold">Generar QR Masivo</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Formato Excel para Carga de Participantes</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border border-gray-200 text-sm">
            <thead>
              <tr className="bg-blue-50">
                {['No DOCUMENTO', 'SEDE', 'PROGRAMA', 'APELLIDOS Y NOMBRES', 'TEL1', 'EMAIL INSTITUCIONAL', 'COHORTE', 'PROMEDIO'].map(col => (
                  <th key={col} className="border border-gray-200 px-3 py-2 text-left font-semibold text-blue-800">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="text-gray-500 italic">
                <td className="border border-gray-200 px-3 py-2">123456789</td>
                <td className="border border-gray-200 px-3 py-2">Bogotá</td>
                <td className="border border-gray-200 px-3 py-2">Ingeniería de Sistemas</td>
                <td className="border border-gray-200 px-3 py-2">PÉREZ GARCÍA JUAN</td>
                <td className="border border-gray-200 px-3 py-2">3001234567</td>
                <td className="border border-gray-200 px-3 py-2">juan@politecnico.edu.co</td>
                <td className="border border-gray-200 px-3 py-2">2023-1</td>
                <td className="border border-gray-200 px-3 py-2">4.2</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
