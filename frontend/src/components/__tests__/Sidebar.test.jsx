import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import Sidebar from '../Sidebar';

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      full_name: 'Administrador',
      role: 'admin'
    }
  })
}));

describe('Sidebar', () => {
  it('shows admin links in the expected workflow order', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    const labels = screen.getAllByRole('link').map((link) => link.textContent.trim());
    expect(labels).toEqual([
      'Dashboard',
      'Eventos',
      'Participantes',
      'Gestión QR',
      'Usuarios',
      'Reportes'
    ]);
  });
});
