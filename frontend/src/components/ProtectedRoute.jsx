import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children, roles }) => {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  if (roles && !roles.includes(user.role)) {
    const redirectMap = {
      admin: '/admin',
      logistico: '/logistico',
      scanner: '/scanner'
    };
    return <Navigate to={redirectMap[user.role] || '/login'} replace />;
  }

  return children;
};

export default ProtectedRoute;
