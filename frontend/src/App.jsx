import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import StatusPage from './pages/StatusPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* P1 — storefront */}

        {/* P2 — account */}

        <Route path="status" element={<StatusPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Full-screen tools, outside the storefront chrome. */}
    </Routes>
  );
}
