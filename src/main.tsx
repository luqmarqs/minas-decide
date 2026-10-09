import '@/styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { Providers } from '@/app/providers';
import { createAppRouter } from '@/app/router';
import { initBrand } from '@/lib/brand';

// Official identity by default; `?brand=0` / localStorage mm.brand=provisorio = old theme (rollback).
initBrand();

const router = createAppRouter();
const root = document.getElementById('root');
if (!root) throw new Error('#root ausente em index.html');

// ClerkProvider (inside Providers) uses the data router for SPA redirects (ADR 0005).
const navigate = (to: string, opts?: { replace?: boolean }) =>
  void router.navigate(to, { replace: opts?.replace ?? false });

createRoot(root).render(
  <StrictMode>
    <Providers navigate={navigate}>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
