import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, X } from 'lucide-react';

const UsersManagement = () => {
  const [users, setUsers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ username: '', full_name: '', password: '', role: 'scanner', active: true });
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    try {
      const res = await api.get('/api/users');
      setUsers(res.data);
    } catch { toast.error('Error cargando usuarios'); }
  };

  const openCreate = () => {
    setEditUser(null);
    setForm({ username: '', full_name: '', password: '', role: 'scanner', active: true });
    setShowModal(true);
  };

  const openEdit = (user) => {
    setEditUser(user);
    setForm({ username: user.username, full_name: user.full_name, password: '', role: user.role, active: user.active });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;

      if (editUser) {
        await api.put(`/api/users/${editUser._id}`, payload);
        toast.success('Usuario actualizado');
      } else {
        await api.post('/api/users', payload);
        toast.success('Usuario creado');
      }
      setShowModal(false);
      loadUsers();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este usuario?')) return;
    try {
      await api.delete(`/api/users/${id}`);
      toast.success('Usuario eliminado');
      loadUsers();
    } catch { toast.error('Error eliminando usuario'); }
  };

  const toggleActive = async (user) => {
    try {
      await api.put(`/api/users/${user._id}`, { active: !user.active });
      toast.success(user.active ? 'Usuario desactivado' : 'Usuario activado');
      loadUsers();
    } catch { toast.error('Error'); }
  };

  const roleColors = { admin: 'bg-red-100 text-red-700', logistico: 'bg-yellow-100 text-yellow-700', scanner: 'bg-green-100 text-green-700' };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Gestión de Usuarios</h1>
        <button onClick={openCreate} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700">
          <Plus size={18} /> Crear Usuario
        </button>
      </div>

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              {['Usuario', 'Nombre Completo', 'Rol', 'Estado', 'Acciones'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-sm font-semibold text-gray-700">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((user) => (
              <tr key={user._id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium">{user.username}</td>
                <td className="px-4 py-3 text-sm">{user.full_name}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${roleColors[user.role]}`}>{user.role}</span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleActive(user)} className={`px-2 py-1 rounded-full text-xs font-medium ${user.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {user.active ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => openEdit(user)} className="text-blue-600 hover:text-blue-800"><Pencil size={16} /></button>
                  <button onClick={() => handleDelete(user._id)} className="text-red-600 hover:text-red-800"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex justify-between mb-4">
              <h2 className="text-lg font-bold">{editUser ? 'Editar Usuario' : 'Crear Usuario'}</h2>
              <button onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Usuario" value={form.username} onChange={e => setForm({...form, username: e.target.value})} required />
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Nombre Completo" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} required />
              <input className="w-full border rounded-lg px-3 py-2 text-sm" type="password" placeholder={editUser ? "Nueva contraseña (dejar vacío para no cambiar)" : "Contraseña"} value={form.password} onChange={e => setForm({...form, password: e.target.value})} required={!editUser} />
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                <option value="admin">Admin</option>
                <option value="logistico">Logístico</option>
                <option value="scanner">Scanner</option>
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.active} onChange={e => setForm({...form, active: e.target.checked})} />
                Usuario Activo
              </label>
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

export default UsersManagement;
