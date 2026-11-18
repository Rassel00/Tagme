import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/common.css';
import { InviteApp } from './InviteApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <InviteApp />
  </StrictMode>,
);
