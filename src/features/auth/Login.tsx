import { zodResolver } from '@hookform/resolvers/zod';
import { motion, useReducedMotion } from 'framer-motion';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { useAppSelector } from '@/app/store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { env } from '@/config/env';
import { useLogin } from '@/hooks/data/useAuth';
import { selectAuthStatus } from '@/store/authSlice';

import { loginSchema, type LoginFormValues } from './loginSchema';

import type { Location } from 'react-router-dom';

interface FromState {
  from?: Location;
}

export function Login() {
  const status = useAppSelector(selectAuthStatus);
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const [showPassword, setShowPassword] = useState(false);

  const login = useLogin();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    // Validate on submit, then live once a field has been touched. Validating as you type from
    // the first keystroke marks an email invalid while you are still typing it.
    mode: 'onTouched',
  });

  // Already signed in — someone navigated to /login by hand, or used Back after logging in.
  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  const redirectTo = (location.state as FromState | null)?.from?.pathname ?? '/';

  const onSubmit = form.handleSubmit((values) => {
    login.mutate(values, {
      onSuccess: () => navigate(redirectTo, { replace: true }),
      onError: () => {
        // The toast is raised by the hook. Clearing the password matches what every login form
        // does and saves a manual select-all before retyping; the email is kept because it is
        // almost never the thing that was wrong.
        form.resetField('password');
        form.setFocus('password');
      },
    });
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        <Card>
          <CardHeader className="space-y-1">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              OW
            </div>
            <CardTitle className="text-xl">{env.appName}</CardTitle>
            <CardDescription>Sign in to continue</CardDescription>
          </CardHeader>

          <CardContent>
            {/* noValidate: the browser's own bubbles would pre-empt the accessible messages
                rendered by <Field>, and cannot be styled to match. */}
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <Field label="Email" required error={form.formState.errors.email?.message}>
                {(props) => (
                  <Input
                    {...props}
                    {...form.register('email')}
                    type="email"
                    autoComplete="username"
                    autoFocus
                    placeholder="you@company.com"
                    disabled={login.isPending}
                  />
                )}
              </Field>

              <Field label="Password" required error={form.formState.errors.password?.message}>
                {(props) => (
                  <div className="relative">
                    <Input
                      {...props}
                      {...form.register('password')}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      className="pr-10"
                      disabled={login.isPending}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      // tabIndex -1: a password manager or a keyboard user tabbing from the
                      // field expects to land on Sign in, not on a visibility toggle.
                      tabIndex={-1}
                      className="absolute right-0 top-0 flex h-full w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                )}
              </Field>

              <Button type="submit" className="w-full" disabled={login.isPending}>
                {login.isPending ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden="true" />
                    Signing in…
                  </>
                ) : (
                  <>
                    <LogIn aria-hidden="true" />
                    Sign in
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Accounts are created by an administrator. There is no self-registration.
        </p>
      </motion.div>
    </div>
  );
}
