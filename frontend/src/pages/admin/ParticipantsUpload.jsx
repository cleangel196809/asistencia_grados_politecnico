import React, { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Upload, Pencil, Trash2, X } from 'lucide-react';

const ParticipantsUpload = () => {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [participants, setParticipants] = useState([]);
  const [preview, setPreview] = useState([]);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [editParticipant, setEditParticipant] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    api.get('/api/events').then(r => setEvents(r.data)).catch(() => {});
  }, []);

  const loadParticipants = useCallback(async () => {
    if (!selectedEvent) return;

    try {
      const res = await api.get(`/api/participants/${selectedEvent}`);
      setParticipants(res.data);
    } catch {}
  }, [selectedEvent]);

  useEffect(() => {
    loadParticipants();
  }, [loadParticipants]);

  const onDrop = useCallback((acceptedFiles) => {
    const f = acceptedFiles[0];
    if (!f) return;
    setFile(f);
    toast.success(`Archivo seleccionado: ${f.name}`);
    setPreview([{ no_documento: '...', sede: '...', programa: '...', apellidos_nombres: '...', tel1: '...', email_institucional: '...', cohorte: '...', promedio: '...' }]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    multiple: false
  });

  const handleUpload = async () => {
    if (!file || !selectedEvent) { toast.error('Seleccione evento y archivo'); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(`/api/participants/upload/${selectedEvent}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(`${res.data.count} participantes cargados`);
      setFile(null);
      setPreview([]);
      loadParticipants();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error cargando archivo');
    } finally { setUploading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar participante?')) return;
    try {
      await api.delete(`/api/participants/${id}`);
      toast.success('Participante eliminado');
      loadParticipants();
    } catch { toast.error('Error'); }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/api/participants/${editParticipant._id}`, editForm);
      toast.success('Participante actualizado');
      setEditParticipant(null);
      const res = await api.get(`/api/participants/${selectedEvent}`);
      setParticipants(res.data);
    } catch { toast.error('Error'); }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Carga de Participantes</h1>

      <div className="bg-white rounded-xl shadow p-6">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Seleccionar Evento</label>
          <select className="w-full border rounded-lg px-3 py-2" value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}>
            <option value="">-- Seleccione un evento --</option>
            {events.map(ev => <option key={ev._id} value={ev._id}>{ev.nombre}</option>)}
          </select>
        </div>

        <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}>
          <input {...getInputProps()} />
          <Upload size={40} className="mx-auto text-gray-400 mb-3" />
          {isDragActive ? <p>Suelta el archivo aquí...</p> : <p className="text-gray-600">Arrastra un archivo .xlsx aquí, o haz clic para seleccionar</p>}
          {file && <p className="text-green-600 mt-2 font-medium">✓ {file.name}</p>}
        </div>

        {preview.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Vista previa (primeras filas):</p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border">
                <thead className="bg-gray-50">
                  <tr>{['No DOCUMENTO', 'SEDE', 'PROGRAMA', 'APELLIDOS Y NOMBRES', 'TEL1', 'EMAIL', 'COHORTE', 'PROMEDIO'].map(h => (
                    <th key={h} className="border px-2 py-1">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i}>
                      {[row.no_documento, row.sede, row.programa, row.apellidos_nombres, row.tel1, row.email_institucional, row.cohorte, row.promedio].map((v, j) => (
                        <td key={j} className="border px-2 py-1">{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <button onClick={handleUpload} disabled={!file || !selectedEvent || uploading}
          className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50">
          {uploading ? 'Cargando...' : 'Confirmar Carga'}
        </button>
      </div>

      {participants.length > 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Participantes ({participants.length})</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>{['Documento', 'Nombres', 'Sede', 'Programa', 'Tel', 'Email', 'Cohorte', 'Promedio', 'Acciones'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-700">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {participants.map(p => (
                  <tr key={p._id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{p.no_documento}</td>
                    <td className="px-3 py-2">{p.apellidos_nombres}</td>
                    <td className="px-3 py-2">{p.sede}</td>
                    <td className="px-3 py-2">{p.programa}</td>
                    <td className="px-3 py-2">{p.tel1}</td>
                    <td className="px-3 py-2">{p.email_institucional}</td>
                    <td className="px-3 py-2">{p.cohorte}</td>
                    <td className="px-3 py-2">{p.promedio}</td>
                    <td className="px-3 py-2 flex gap-2">
                      <button onClick={() => { setEditParticipant(p); setEditForm({no_documento: p.no_documento, sede: p.sede, programa: p.programa, apellidos_nombres: p.apellidos_nombres, tel1: p.tel1, email_institucional: p.email_institucional, cohorte: p.cohorte, promedio: p.promedio}); }} className="text-blue-600 hover:text-blue-800"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(p._id)} className="text-red-600 hover:text-red-800"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editParticipant && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg">
            <div className="flex justify-between mb-4">
              <h2 className="text-lg font-bold">Editar Participante</h2>
              <button onClick={() => setEditParticipant(null)}><X size={20} /></button>
            </div>
            <form onSubmit={handleEdit} className="space-y-3">
              {['no_documento', 'apellidos_nombres', 'sede', 'programa', 'tel1', 'email_institucional', 'cohorte'].map(field => (
                <input key={field} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder={field} value={editForm[field] || ''} onChange={e => setEditForm({...editForm, [field]: e.target.value})} />
              ))}
              <input type="number" step="0.1" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="promedio" value={editForm.promedio || ''} onChange={e => setEditForm({...editForm, promedio: parseFloat(e.target.value)})} />
              <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg">Guardar</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParticipantsUpload;
