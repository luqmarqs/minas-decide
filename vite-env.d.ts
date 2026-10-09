/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public Supabase TARGET URL (operational project). Never the SOURCE. */
  readonly VITE_SUPABASE_URL: string;
  /** Public anon/publishable key of the TARGET project. */
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Turnstile public sitekey (test key in local/dev). */
  readonly VITE_TURNSTILE_SITE_KEY: string;
  /** Base path for electoral snapshot assets (default: /data). */
  readonly VITE_SNAPSHOT_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
