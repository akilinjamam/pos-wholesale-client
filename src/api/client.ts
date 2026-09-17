import axios, { AxiosError, type AxiosInstance } from 'axios';
import { toast } from 'sonner';

import { env } from '@/config/env';

import type { ApiFailure, ApiSuccess } from '@shared/types';

/**
 * The single axios instance.
 *
 * Two things the retail client does not do, and pays for daily:
 *  1. The auth header is attached HERE, once, by an interceptor — not hand-written into every
 *     fetch function, where it is routinely forgotten on PATCH and DELETE.
 *  2. `/api/v1` is appended here, so the env var is a plain host. The retail app bakes the
 *     version into VITE_DATA_URL, which is why nobody can remember whether to include it.
 */
export const api: AxiosInstance = axios.create({
  baseURL: `${env.apiUrl.replace(/\/+$/, '')}/api/v1`,
  timeout: 20_000,
  headers: { Accept: 'application/json' },
});

/** Set by the auth slice on login and cleared on logout (wired on Day 3). */
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

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (error instanceof AxiosError) {
      const status = error.response?.status;

      // 401 is handled by the auth layer (refresh, then redirect) — not worth a toast, which
      // would fire on every page during a routine token refresh.
      // 422 belongs on the form fields, so the form owns it.
      if (status !== 401 && status !== 422) {
        toast.error(errorMessage(error));
      }
    }
    return Promise.reject(error);
  },
);

/** Unwrap the success envelope so hooks get the payload, not the wrapper. */
export async function getData<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await api.get<ApiSuccess<T>>(url, { params });
  return data.data;
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
