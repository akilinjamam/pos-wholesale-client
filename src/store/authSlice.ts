import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { AuthUser } from '@shared/types';

/**
 * Session state only. Server data belongs in TanStack Query — this slice must never become
 * the cross-screen aggregate dumping ground the retail app's `imgModal` slice turned into.
 *
 * Filled in properly on Day 3 when login lands.
 */
interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  status: 'idle' | 'authenticating' | 'authenticated' | 'anonymous';
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  status: 'idle',
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    signedIn(state, action: PayloadAction<{ user: AuthUser; accessToken: string }>) {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.status = 'authenticated';
    },
    signedOut(state) {
      state.user = null;
      state.accessToken = null;
      state.status = 'anonymous';
    },
  },
});

export const { signedIn, signedOut } = authSlice.actions;
export default authSlice.reducer;
