import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';

import authReducer from '@/store/authSlice';
import posCartReducer, { persistCart } from '@/store/posCartSlice';
import uiReducer from '@/store/uiSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    ui: uiReducer,
    posCart: posCartReducer,
  },
});

// Persist the till's cart on every change, so a reload mid-sale brings it back. Cheap: the cart
// is small, and only its own slice is written.
let lastCart = store.getState().posCart;
store.subscribe(() => {
  const cart = store.getState().posCart;
  if (cart !== lastCart) {
    lastCart = cart;
    persistCart(cart);
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
