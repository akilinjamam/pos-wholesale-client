/**
 * Typed access to Vite env vars. One place that knows the variable names, so a rename is a
 * single edit and a missing value is obvious at startup rather than rendering "undefined".
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}. Copy .env.example to .env.`);
  }
  return value;
}

export const env = {
  /** Base URL WITHOUT the version segment — api/client.ts appends /api/v1. */
  apiUrl: required('VITE_API_URL', import.meta.env.VITE_API_URL),
  appName: import.meta.env.VITE_APP_NAME ?? 'Optical Wholesale',
  currency: import.meta.env.VITE_CURRENCY ?? 'BDT',
  currencySymbol: import.meta.env.VITE_CURRENCY_SYMBOL ?? '৳',
  timezone: import.meta.env.VITE_TZ ?? 'Asia/Dhaka',
  isDev: import.meta.env.DEV,
} as const;
