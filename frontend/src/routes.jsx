import { lazy } from 'react';
import { Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import { can, isRecurringEnabled } from './utils/permissions.js';

const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const MovementsPage = lazy(() => import('./pages/MovementsPage.jsx'));
const RegistryPage = lazy(() => import('./pages/RegistryPage.jsx'));
const PropertyDetailPage = lazy(() => import('./pages/PropertyDetailPage.jsx'));
const JobDetailPage = lazy(() => import('./pages/JobDetailPage.jsx'));
const RecurringTemplatesPage = lazy(() => import('./pages/RecurringTemplatesPage.jsx'));
const UsersAdminPage = lazy(() => import('./pages/UsersAdminPage.jsx'));
const RoadmapPage = lazy(() => import('./pages/RoadmapPage.jsx'));
const SettingsAdminPage = lazy(() => import('./pages/SettingsAdminPage.jsx'));
const AdvancedReportsPage = lazy(() => import('./pages/AdvancedReportsPage.jsx'));

const routes = ({ setTokenState, token, onBrandingChanged, brandLogoUrl }) => [
  {
    path: '/login',
    element: token ? (
      <Navigate to="/dashboard" replace />
    ) : (
      <LoginPage onLogin={(newToken) => setTokenState(newToken)} brandLogoUrl={brandLogoUrl} />
    ),
  },
  {
    path: '/dashboard',
    element: token ? <DashboardPage /> : <Navigate to="/login" replace />,
  },
  {
    path: '/movements',
    element: token ? <MovementsPage /> : <Navigate to="/login" replace />,
  },
  {
    path: '/registry',
    element: token ? <RegistryPage /> : <Navigate to="/login" replace />,
  },
  {
    path: '/registry/properties/:id',
    element: token ? <PropertyDetailPage /> : <Navigate to="/login" replace />,
  },
  {
    path: '/jobs/:id',
    element: token ? <JobDetailPage /> : <Navigate to="/login" replace />,
  },
  {
    path: '/recurring',
    element: token ? (isRecurringEnabled() ? <RecurringTemplatesPage /> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />,
  },

  {
    path: '/reports/advanced',
    element: token ? <AdvancedReportsPage /> : <Navigate to="/login" replace />,
  },
  {
    path: '/users',
    element: token ? (can('manage_users') ? <UsersAdminPage /> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />,
  },
  {
    path: '/roadmap',
    element: token ? (can('read', 'roadmap') ? <RoadmapPage /> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />,
  },

  {
    path: '/settings',
    element: token ? (can('manage_users') ? <SettingsAdminPage onBrandingChanged={onBrandingChanged} /> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />,
  },
  {
    path: '/',
    element: token ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />,
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
];

export default routes;
