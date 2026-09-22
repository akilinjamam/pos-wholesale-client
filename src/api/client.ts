import axios, { AxiosError, type AxiosInstance } from 'axios';
import { toast } from 'sonner';

import { env } from '@/config/env';

import type {
  ApiFailure,
  ApiFieldError,
  ApiSuccess,
  Paginated,
  TokenPair,
} from '@shared/types';
import type { InternalAxiosRequestConfig } from 'axios';

/**
 * The single axios instance.
 *
 * Two things the retail client does not do, and pays for daily:
 *  1. The auth header is attached HERE, once, by an interceptor — not hand-written into every
 *     fetch function, where it is routinely forgotten on PATCH and DELETE.
 *  2. `/api/v1` is appended here, so the env var is a plain host. The retail app bakes the
 *     version into VITE_DATA_URL, which is why nobody can remember whether to include it.
 */
const BASE_URL = `${env.apiUrl.replace(/\/+$/, '')}/api/v1`;

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 20_000,
  headers: { Accept: 'application/json' },
  // Required for the refresh flow: the server sets the refresh token as an httpOnly cookie
  // scoped to /api/v1/auth, and the browser will not send it cross-origin (5174 → 5100)
  // without this. httpOnly is what keeps the long-lived credential out of reach of any XSS
  // on the page, which is why the cookie is preferred over storing it in localStorage.
  withCredentials: true,
});

/** Set by AuthProvider on login and cleared on logout. Held in memory, not read from storage. */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

api.interceptors.request.use((request) => {
  if (accessToken) {
    // A real Bearer prefix on both sides. The retail app sends the bare JWT, which forces the
    // server to parse the header by hand in several places.
    request.headers.Authorization = `Bearer ${accessToken}`;
  }
  return request;
});

/** Pull a readable message out of whatever came back. */
export function errorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const body = error.response?.data as ApiFailure | undefined;
    if (body?.error?.message) return body.error.message;
    if (error.code === 'ECONNABORTED') return 'The request timed out.';
    if (!error.response) return 'Cannot reach the server.';
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

/** The machine-readable code, for callers that branch on a specific failure. */
export function errorCode(error: unknown): string | null {
  if (error instanceof AxiosError) {
    const body = error.response?.data as ApiFailure | undefined;
    return body?.error?.code ?? null;
  }
  return null;
}

/**
 * A 422's field errors, ready to hand to react-hook-form's `setError`.
 *
 * The interceptor deliberately stays silent on 422 because a validation failure belongs on the
 * offending field, not in a toast that disappears while the user is looking for what is wrong.
 * This is how a form collects them. Returns an empty array for any other failure, so callers
 * can fall back to a toast when it comes back empty.
 */
export function fieldErrors(error: unknown): ApiFieldError[] {
  if (!(error instanceof AxiosError)) return [];

  const details = (error.response?.data as ApiFailure | undefined)?.error?.details;
  if (!Array.isArray(details)) return [];

  return details.filter(
    (d): d is ApiFieldError =>
      typeof d === 'object' && d !== null && 'path' in d && 'message' in d,
  );
}

// ─── Silent token refresh ───────────────────────────────────────────────────────────────

/**
 * Called when a refresh succeeds or fails. AuthProvider registers these so this module never
 * imports the Redux store — which would be a cycle (`store` → `authSlice`, and any slice that
 * wanted to call the API would come back here).
 */
interface AuthBridge {
  onRefreshed: (accessToken: string) => void;
  onSignOut: () => void;
}

let bridge: AuthBridge | null = null;

export function registerAuthBridge(handlers: AuthBridge): void {
  bridge = handlers;
}

/** Endpoints that must never trigger a refresh — a 401 from these *is* the answer. */
function isAuthEndpoint(url: string | undefined): boolean {
  return Boolean(url && /\/auth\/(login|refresh|logout)$/.test(url));
}

/**
 * One refresh at a time.
 *
 * A page that fires five queries on mount will get five simultaneous 401s when the access
 * token expires. Without this, each would start its own refresh; the server rotates the
 * refresh token on every call, so four of the five would present a token that had just been
 * superseded and the user would be thrown out mid-session. Instead the first caller does the
 * work and the rest await the same promise.
 */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= (async () => {
    try {
      // A bare axios call, not `api` — going through the instance would re-enter this
      // interceptor on failure and recurse.
      const { data } = await axios.post<ApiSuccess<TokenPair>>(
        `${BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true, timeout: 20_000 },
      );
      setAccessToken(data.data.accessToken);
      bridge?.onRefreshed(data.data.accessToken);
      return data.data.accessToken;
    } catch {
      // The refresh token is gone, expired, or its tokenVersion no longer matches — which is
      // what a role change, a password reset or a logout elsewhere looks like from here.
      setAccessToken(null);
      bridge?.onSignOut();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/** Axios does not type its own retry marker, so we add one. */
type RetriableRequest = InternalAxiosRequestConfig & { _retried?: boolean };

/**
 * Marks a request whose failure must not raise a toast.
 *
 * For anything the user did not ask for: the chrome that loads on every screen, and polling.
 * The location switcher is the case that forced it — it sits in the topbar, so a failure there
 * would toast on every single navigation, about something nobody clicked.
 */
type SilentRequest = InternalAxiosRequestConfig & { _silent?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!(error instanceof AxiosError)) return Promise.reject(error);

    const status = error.response?.status;
    const request = error.config as RetriableRequest | undefined;

    // A 401 means "your access token is no longer good". Try once to renew it and replay the
    // request, so an expired token is invisible to the user rather than an interruption.
    if (status === 401 && request && !request._retried && !isAuthEndpoint(request.url)) {
      request._retried = true;
      const renewed = await refreshAccessToken();
      if (renewed) {
        request.headers.Authorization = `Bearer ${renewed}`;
        return api.request(request);
      }
    }

    // 401 is owned by the auth layer above — a toast here would fire on every routine refresh.
    // 422 belongs on the form fields, so the form owns it.
    // `silent` is for background requests the user did not initiate (see `getData`).
    if (status !== 401 && status !== 422 && !(request as SilentRequest | undefined)?._silent) {
      toast.error(errorMessage(error));
    }

    return Promise.reject(error);
  },
);

export interface GetOptions {
  /** Suppress the error toast — for background requests the user did not initiate. */
  silent?: boolean;
}

/** Unwrap the success envelope so hooks get the payload, not the wrapper. */
export async function getData<T>(
  url: string,
  params?: Record<string, unknown>,
  options?: GetOptions,
): Promise<T> {
  const { data } = await api.get<ApiSuccess<T>>(url, {
    params,
    ...(options?.silent ? { _silent: true } : {}),
  } as Parameters<typeof api.get>[1]);
  return data.data;
}

/**
 * A list endpoint's response.
 *
 * `meta` sits on the envelope beside `data`, not inside it (see `sendPage` on the server), so
 * `getData` would throw the page count away — which is how a list screen ends up with no
 * pagination and a "load more" button that never knows when to stop.
 */
export async function getPage<T>(
  url: string,
  params?: Record<string, unknown>,
): Promise<Paginated<T>> {
  const { data } = await api.get<ApiSuccess<T[]>>(url, { params });
  return {
    items: data.data,
    // Defensive: an endpoint that forgets `sendPage` would otherwise crash the table rather
    // than render one unpaginated page.
    meta: data.meta ?? {
      page: 1,
      limit: data.data.length,
      total: data.data.length,
      totalPages: 1,
    },
  };
}

export async function postData<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.post<ApiSuccess<T>>(url, body);
  return data.data;
}

export async function patchData<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.patch<ApiSuccess<T>>(url, body);
  return data.data;
}

export async function deleteData<T>(url: string): Promise<T> {
  const { data } = await api.delete<ApiSuccess<T>>(url);
  return data.data;
}
