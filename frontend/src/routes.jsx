import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import MovementsPage from './pages/MovementsPage.jsx';
import RegistryPage from './pages/RegistryPage.jsx';
import { getToken } from './services/api.js';

const routes = ({ setTokenState, token }) => [
  {
    path: '/login',
    element: <LoginPage onLogin={(newToken) => setTokenState(newToken)} />,
  },
  {
    path: '/dashboard',
    element: token ? <DashboardPage /> : <LoginPage onLogin={setTokenState} />,
  },
  {
    path: '/movements',
    element: token ? <MovementsPage /> : <LoginPage onLogin={setTokenState} />,
  },
  {
    path: '/registry',
    element: token ? <RegistryPage /> : <LoginPage onLogin={setTokenState} />,
  },
  {
    path: '/',
    element: getToken() ? <DashboardPage /> : <LoginPage onLogin={setTokenState} />,
  },
];

export default routes;
