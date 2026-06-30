import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { OfflineProvider } from './contexts/OfflineContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import OfflineBanner from './components/OfflineBanner';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/Dashboard';
import UsersManagement from './pages/admin/UsersManagement';
import EventsManagement from './pages/admin/EventsManagement';
import ParticipantsUpload from './pages/admin/ParticipantsUpload';
import QRManagement from './pages/admin/QRManagement';
import Reports from './pages/admin/Reports';
import LogisticoDashboard from './pages/logistico/Dashboard';
import ParticipantsList from './pages/logistico/ParticipantsList';
import IndividualInvitation from './pages/logistico/IndividualInvitation';
import ScannerDashboard from './pages/scanner/ScannerDashboard';

const Layout = ({ children }) => (
  <div className="flex flex-col min-h-screen">
    <OfflineBanner />
    <Navbar />
    <div className="flex flex-1">
      <Sidebar />
      <main className="flex-1 bg-gray-50 overflow-auto">
        {children}
      </main>
    </div>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <OfflineProvider>
        <Router>
          <Toaster position="top-right" />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/admin" element={
              <ProtectedRoute roles={['admin']}>
                <Layout><AdminDashboard /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/admin/users" element={
              <ProtectedRoute roles={['admin']}>
                <Layout><UsersManagement /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/admin/events" element={
              <ProtectedRoute roles={['admin']}>
                <Layout><EventsManagement /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/admin/participants" element={
              <ProtectedRoute roles={['admin']}>
                <Layout><ParticipantsUpload /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/admin/qr" element={
              <ProtectedRoute roles={['admin']}>
                <Layout><QRManagement /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/admin/reports" element={
              <ProtectedRoute roles={['admin']}>
                <Layout><Reports /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/logistico" element={
              <ProtectedRoute roles={['logistico']}>
                <Layout><LogisticoDashboard /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/logistico/participants" element={
              <ProtectedRoute roles={['logistico']}>
                <Layout><ParticipantsList /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/logistico/invitation" element={
              <ProtectedRoute roles={['logistico']}>
                <Layout><IndividualInvitation /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/scanner" element={
              <ProtectedRoute roles={['scanner']}>
                <div className="flex flex-col min-h-screen">
                  <OfflineBanner />
                  <Navbar />
                  <main className="flex-1 bg-gray-50">
                    <ScannerDashboard />
                  </main>
                </div>
              </ProtectedRoute>
            } />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Router>
      </OfflineProvider>
    </AuthProvider>
  );
}

export default App;
