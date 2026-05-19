import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

console.log('[DEBUG] App initialization starting...');

const container = document.getElementById('root');

if (!container) {
  console.error('[FATAL] Root container not found');
} else {
  try {
    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log('[DEBUG] Initial render call completed');
  } catch (err) {
    console.error('[FATAL] Render failed:', err);
  }
}
