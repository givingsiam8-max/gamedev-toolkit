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

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
