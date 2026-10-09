import type { ComponentType } from 'react';
import { createBrowserRouter, redirect, type RouteObject } from 'react-router';
import HomePage from '@/pages/HomePage';
import { RootLayout, RouteError } from './layout';

/**
 * Only the home (map explorer) ships in the initial chunk. Every other page is a
 * lazy route chunk (P-PERF-1): forms, Zod contracts and the
 * admin panel never block the first paint of the public map.
 */
function page(load: () => Promise<{ default: ComponentType }>): Pick<RouteObject, 'lazy'> {
  return {
    lazy: async () => {
      const m = await load();
      return { Component: m.default };
    },
  };
}

export const routes: RouteObject[] = [
  {
    path: '/',
    Component: RootLayout,
    errorElement: <RouteError />,
    HydrateFallback: () => null,
    children: [
      { index: true, Component: HomePage },
      { path: 'territorio/:id', ...page(() => import('@/pages/TerritorioPage')) },
      { path: 'atividade/:id', ...page(() => import('@/pages/AtividadePage')) },
      { path: 'participar', ...page(() => import('@/pages/ParticiparPage')) },
      { path: 'obrigado', ...page(() => import('@/pages/ObrigadoPage')) },
      { path: 'propor-grupo', ...page(() => import('@/pages/ProporGrupoPage')) },
      { path: 'criar-atividade', ...page(() => import('@/pages/CriarAtividadePage')) },
      { path: 'minhas-atividades', ...page(() => import('@/pages/MinhasAtividadesPage')) },
      { path: 'entrar', ...page(() => import('@/pages/EntrarPage')) },
      // ADR 0005: magic-link return and TOTP pages no longer exist (old e-mails/bookmarks).
      { path: 'autenticacao/retorno', loader: () => redirect('/entrar') },
      { path: 'conta/seguranca', loader: () => redirect('/') },
      // Separate lazy chunk; never linked from public navigation.
      { path: 'admin/*', ...page(() => import('@/pages/admin/AdminPage')) },
      { path: 'privacidade', ...page(() => import('@/pages/PrivacidadePage')) },
      { path: 'termos', ...page(() => import('@/pages/TermosPage')) },
      { path: 'metodologia', ...page(() => import('@/pages/MetodologiaPage')) },
      { path: '404', ...page(() => import('@/pages/NotFoundPage')) },
      { path: '*', ...page(() => import('@/pages/NotFoundPage')) },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
