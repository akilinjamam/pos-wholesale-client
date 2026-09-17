import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type Theme = 'light' | 'dark';

interface UiState {
  theme: Theme;
  sidebarCollapsed: boolean;
}

const STORAGE_KEY = 'pos-wholesale.ui';

function loadInitial(): UiState {
  const fallback: UiState = { theme: 'light', sidebarCollapsed: false };
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
  },
});

export const { setTheme, toggleTheme, toggleSidebar } = uiSlice.actions;
export default uiSlice.reducer;
