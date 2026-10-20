import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';
import { App } from './App';
import { registerAllCategories } from './categories';

// Register every category module before the first render so navigation,
// search and the dashboard are generated from a complete registry.
registerAllCategories();

const container = document.getElementById('root');
if (!container) throw new Error('Root container missing in index.html');

// A deploy replaces hashed chunks, so an already-open tab can ask for a file
// that no longer exists. Reload once to fetch the new index and chunk names.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  try {
    const key = 'gdt.chunk-reload-at';
    const last = Number(sessionStorage.getItem(key) ?? '0');
    if (Date.now() - last < 15000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    // Session storage can be unavailable; reloading once is still safe.
  }
  window.location.reload();
});

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
