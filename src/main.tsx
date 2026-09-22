import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';

import { AuthProvider } from '@/app/AuthProvider';
import { queryClient } from '@/app/queryClient';
import { router } from '@/app/router';
import { store } from '@/app/store';
import { Toaster } from '@/components/ui/sonner';

import '@/styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        {/* Inside QueryClientProvider (it clears the cache on sign-out) and outside the
            router (it must push the restored token into axios before any route renders). */}
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
        <Toaster />
      </QueryClientProvider>
    </Provider>
  </StrictMode>,
);
