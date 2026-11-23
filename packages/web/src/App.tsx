import { AdminPage } from './pages/AdminPage.js';
import { DebugPage } from './pages/DebugPage.js';
import { DisplayPage } from './pages/DisplayPage.js';

export function App() {
  const path = window.location.pathname;
  if (path.startsWith('/admin')) {
    return <AdminPage />;
  }
  if (path.startsWith('/debug')) {
    return <DebugPage />;
  }
  return <DisplayPage />;
}
