/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_ORCHESTRATOR_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
