import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { VaultProvider } from './state/vault';
import App from './App';
import './index.css';

// Service worker: pré-cacheia todo o app → funciona offline após o primeiro acesso.
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VaultProvider>
      <App />
    </VaultProvider>
  </StrictMode>,
);
