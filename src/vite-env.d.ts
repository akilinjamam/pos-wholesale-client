/// <reference types="vite/client" />

/**
 * Typed environment variables.
 *
 * Declaring them here means `import.meta.env.VITE_API_URL` is a known string rather than
 * `any`, and a typo in a variable name is a compile error instead of an `undefined` that
 * renders as "undefined" in the UI.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_CURRENCY?: string;
  readonly VITE_CURRENCY_SYMBOL?: string;
  readonly VITE_TZ?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
