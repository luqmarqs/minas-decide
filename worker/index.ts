/**
 * Cloudflare Worker entry. Only /api/* reaches this code (wrangler `run_worker_first`);
 * static assets (SPA + /data snapshot) are served by Workers Static Assets.
 * Talks ONLY to the operational Supabase (TARGET). No SOURCE access exists here.
 */
import { createApp } from './app.ts';

const app = createApp();

export default app;
