import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WebRouter } from './WebRouter.tsx';
import { LiquidRefractionDefs } from './components/GlassUI.tsx';
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
    <LiquidRefractionDefs />
    <WebRouter />
  </StrictMode>,
);
