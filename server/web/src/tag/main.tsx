import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/common.css';
import { TagApp } from './TagApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TagApp />
  </StrictMode>,
);
