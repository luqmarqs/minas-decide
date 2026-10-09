import { createBrowserRouter, type RouteObject } from 'react-router';
import AtividadePage from '@/pages/AtividadePage';
import AuthRetornoPage from '@/pages/AuthRetornoPage';
import CriarAtividadePage from '@/pages/CriarAtividadePage';
import HomePage from '@/pages/HomePage';
import MetodologiaPage from '@/pages/MetodologiaPage';
import MinhasAtividadesPage from '@/pages/MinhasAtividadesPage';
import NotFoundPage from '@/pages/NotFoundPage';
import ObrigadoPage from '@/pages/ObrigadoPage';
import ParticiparPage from '@/pages/ParticiparPage';
import PrivacidadePage from '@/pages/PrivacidadePage';
import ProporGrupoPage from '@/pages/ProporGrupoPage';
import TerritorioPage from '@/pages/TerritorioPage';
import TermosPage from '@/pages/TermosPage';
import { RootLayout, RouteError } from './layout';

export const routes: RouteObject[] = [
  {
    path: '/',
    Component: RootLayout,
    errorElement: <RouteError />,
    children: [
      { index: true, Component: HomePage },
      { path: 'territorio/:id', Component: TerritorioPage },
      { path: 'atividade/:id', Component: AtividadePage },
      { path: 'participar', Component: ParticiparPage },
      { path: 'obrigado', Component: ObrigadoPage },
      { path: 'propor-grupo', Component: ProporGrupoPage },
      { path: 'criar-atividade', Component: CriarAtividadePage },
      { path: 'minhas-atividades', Component: MinhasAtividadesPage },
      { path: 'autenticacao/retorno', Component: AuthRetornoPage },
      {
        // Separate lazy chunk; never linked from public navigation.
        path: 'admin/*',
        lazy: async () => {
          const m = await import('@/pages/admin/AdminPage');
          return { Component: m.default };
        },
      },
      { path: 'privacidade', Component: PrivacidadePage },
      { path: 'termos', Component: TermosPage },
      { path: 'metodologia', Component: MetodologiaPage },
      { path: '404', Component: NotFoundPage },
      { path: '*', Component: NotFoundPage },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
