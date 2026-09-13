import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WebRouter } from './WebRouter.tsx';
import './index.css';
import './theme-dark.css';

window.addEventListener('unhandledrejection', (event) => {
  if (
    event.reason &&
    (event.reason?.message?.includes('WebSocket') ||
      event.reason?.toString?.().includes('WebSocket'))
  ) {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WebRouter />
  </StrictMode>,
);
