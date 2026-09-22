import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type Theme = 'light' | 'dark';

interface UiState {
  theme: Theme;
  sidebarCollapsed: boolean;
  /**
   * The location the user is working in — the warehouse a stock screen defaults to, the counter
   * a POS shift opens against.
   *
   * Persisted, because a storekeeper works from the same warehouse every day and re-picking it
   * after each reload is friction with no purpose. It is a **preference**, never an authority:
   * the server derives the permitted set from the user's `locationIds` and rejects a request
   * naming anything outside it (`requireLocation`), so a tampered value buys nothing.
   *
   * Null means "not chosen yet" — `LocationSwitcher` resolves it against the caller's actual
   * locations once they load, which is also what corrects a stale id after a reassignment.
   */
  activeLocationId: string | null;
}

const STORAGE_KEY = 'pos-wholesale.ui';

function loadInitial(): UiState {
  const fallback: UiState = { theme: 'light', sidebarCollapsed: false, activeLocationId: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<UiState>) } : fallback;
  } catch {
    // Private windows and blocked site data both throw here.
    return fallback;
  }
}

function persist(state: UiState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Preference persistence is a convenience, never a requirement.
  }
}

const uiSlice = createSlice({
  name: 'ui',
  initialState: loadInitial(),
  reducers: {
    setTheme(state, action: PayloadAction<Theme>) {
      state.theme = action.payload;
      persist(state);
    },
    toggleTheme(state) {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      persist(state);
    },
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      persist(state);
    },
    setActiveLocation(state, action: PayloadAction<string | null>) {
      state.activeLocationId = action.payload;
      persist(state);
    },
  },
});

export const { setTheme, toggleTheme, toggleSidebar, setActiveLocation } = uiSlice.actions;
export default uiSlice.reducer;
