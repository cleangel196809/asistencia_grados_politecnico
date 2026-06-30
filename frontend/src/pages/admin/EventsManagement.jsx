import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, X, QrCode } from 'lucide-react';

const defaultForm = {
  nombre: '', fecha: '', lugar: '', capacidad_auditorio: 100,
  modo: 'online', horario: [], invitaciones_por_participante: 2, activo: true
};

const EventsManagement = () => {
  const [events, setEvents] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editEvent, setEditEvent] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [generatingQR, setGeneratingQR] = useState(null);

  useEffect(() => { loadEvents(); }, []);

  const loadEvents = async () => {
    try {
      const res = await api.get('/api/events');
      setEvents(res.data);
    } catch { toast.error('Error cargando eventos'); }
  };

  const openCreate = () => {
    setEditEvent(null);
    setForm(defaultForm);
    setShowModal(true);
  };

  const openEdit = (event) => {
    setEditEvent(event);
    setForm({
      nombre: event.nombre, fecha: event.fecha?.substring(0, 16) || '',
      lugar: event.lugar, capacidad_auditorio: event.capacidad_auditorio,
      modo: event.modo, horario: event.horario || [],
      invitaciones_por_participante: event.invitaciones_por_participante || 2,
      activo: event.activo
    });
    setShowModal(true);
  };

  const addHorario = () => {
    setForm(f => ({ ...f, horario: [...f.horario, { hora_inicio: '', hora_fin: '', descripcion: '' }] }));
  };

  const updateHorario = (idx, field, value) => {
    setForm(f => {
      const h = [...f.horario];
      h[idx] = { ...h[idx], [field]: value };
      return { ...f, horario: h };
    });
  };

  const removeHorario = (idx) => {
    setForm(f => ({ ...f, horario: f.horario.filter((_, i) => i !== idx) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form, fecha: new Date(form.fecha).toISOString() };
      if (editEvent) {
        await api.put(`/api/events/${editEvent._id}`, payload);
        toast.success('Evento actualizado');
      } else {
        await api.post('/api/events', payload);
        toast.success('Evento creado');
      }
      setShowModal(false);
      loadEvents();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este evento?')) return;
    try {
      await api.delete(`/api/events/${id}`);
      toast.success('Evento eliminado');
      loadEvents();
    } catch { toast.error('Error'); }
  };

  const generateQRMass = async (eventId) => {
    setGeneratingQR(eventId);
    try {
      const res = await api.post(`/api/qr/generate/${eventId}`);
      toast.success(`${res.data.count} códigos QR generados`);
    } catch { toast.error('Error generando QR'); }
    finally { setGeneratingQR(null); }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Gestión de Eventos</h1>
        <button onClick={openCreate} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700">
          <Plus size={18} /> Crear Evento
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {events.map((event) => (
          <div key={event._id} className="bg-white rounded-xl shadow p-5 space-y-3">
            <div className="flex justify-between items-start">
              <h3 className="font-bold text-gray-800">{event.nombre}</h3>
              <span className={`px-2 py-1 rounded-full text-xs ${event.modo === 'online' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                {event.modo?.toUpperCase()}
              </span>
            </div>
            <p className="text-sm text-gray-600">📍 {event.lugar}</p>
            <p className="text-sm text-gray-600">📅 {event.fecha ? new Date(event.fecha).toLocaleDateString('es-CO') : ''}</p>
            <p className="text-sm text-gray-600">👥 Capacidad: {event.capacidad_auditorio}</p>
            <p className="text-sm text-gray-600">🎫 Invitaciones/participante: {event.invitaciones_por_participante}</p>
            {event.horario?.length > 0 && (
              <div className="text-xs text-gray-500">
                <p className="font-medium">Horario:</p>
                {event.horario.map((h, i) => (
                  <p key={i}>{h.hora_inicio} - {h.hora_fin}: {h.descripcion}</p>
                ))}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button onClick={() => generateQRMass(event._id)} disabled={generatingQR === event._id}
                className="flex-1 bg-purple-600 text-white py-1 px-2 rounded text-xs flex items-center justify-center gap-1 hover:bg-purple-700 disabled:opacity-50">
                <QrCode size={14} /> {generatingQR === event._id ? 'Generando...' : 'Generar QR'}
              </button>
              <button onClick={() => openEdit(event)} className="bg-blue-100 text-blue-700 py-1 px-3 rounded text-xs hover:bg-blue-200">
                <Pencil size={14} />
              </button>
              <button onClick={() => handleDelete(event._id)} className="bg-red-100 text-red-700 py-1 px-3 rounded text-xs hover:bg-red-200">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-screen overflow-y-auto">
            <div className="flex justify-between mb-4">
              <h2 className="text-lg font-bold">{editEvent ? 'Editar Evento' : 'Crear Evento'}</h2>
              <button onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Nombre del evento" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} required />
              <input type="datetime-local" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.fecha} onChange={e => setForm({...form, fecha: e.target.value})} required />
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Lugar" value={form.lugar} onChange={e => setForm({...form, lugar: e.target.value})} required />
              <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Capacidad del auditorio" value={form.capacidad_auditorio} onChange={e => setForm({...form, capacidad_auditorio: parseInt(e.target.value, 10) || 0})} />
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" value="online" checked={form.modo === 'online'} onChange={() => setForm({...form, modo: 'online'})} /> ONLINE
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" value="offline" checked={form.modo === 'offline'} onChange={() => setForm({...form, modo: 'offline'})} /> OFFLINE
                </label>
              </div>
              <div>
                <label className="text-sm font-medium">Invitaciones por Participante</label>
                <input type="number" min="1" max="10" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" value={form.invitaciones_por_participante} onChange={e => setForm({...form, invitaciones_por_participante: parseInt(e.target.value, 10) || 1})} />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium">Horario</label>
                  <button type="button" onClick={addHorario} className="text-blue-600 text-xs flex items-center gap-1"><Plus size={14} /> Agregar</button>
                </div>
                {form.horario.map((h, i) => (
                  <div key={i} className="flex gap-2 mb-2 items-center">
                    <input className="border rounded px-2 py-1 text-xs w-24" placeholder="Inicio" value={h.hora_inicio} onChange={e => updateHorario(i, 'hora_inicio', e.target.value)} />
                    <input className="border rounded px-2 py-1 text-xs w-24" placeholder="Fin" value={h.hora_fin} onChange={e => updateHorario(i, 'hora_fin', e.target.value)} />
                    <input className="border rounded px-2 py-1 text-xs flex-1" placeholder="Descripción" value={h.descripcion} onChange={e => updateHorario(i, 'descripcion', e.target.value)} />
                    <button type="button" onClick={() => removeHorario(i)} className="text-red-500"><X size={14} /></button>
                  </div>
                ))}
              </div>
              <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventsManagement;
