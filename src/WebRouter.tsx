/**
 * Public web routes (WhatsApp-style links). Used when the Vite app is hosted on Vercel.
 * Capacitor builds still mount the main App for in-app UI.
 */
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import App from './App';
import InvitePage from './pages/InvitePage';
import WebLoginPage from './pages/WebLoginPage';

function InviteRoute({ kind }: { kind: 'group' | 'community' | 'channel' }) {
  const { token } = useParams();
  if (!token) return <Navigate to="/" replace />;
  return <InvitePage kind={kind} token={token} />;
}

export function WebRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<WebLoginPage />} />
        <Route path="/auth" element={<WebLoginPage />} />
        <Route path="/invite/:token" element={<InviteRoute kind="group" />} />
        <Route path="/g/:token" element={<InviteRoute kind="group" />} />
        <Route path="/group/:token" element={<InviteRoute kind="group" />} />
        <Route path="/c/:token" element={<InviteRoute kind="community" />} />
        <Route path="/community/:token" element={<InviteRoute kind="community" />} />
        <Route path="/channel/:token" element={<InviteRoute kind="channel" />} />
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  );
}

export default WebRouter;
