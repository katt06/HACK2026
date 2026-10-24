/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" serves fake data from src/api/mockApi.ts instead of calling Cloud Functions. */
  readonly VITE_USE_MOCKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
