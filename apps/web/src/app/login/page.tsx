'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Dumbbell } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { loginSchema } from '@fitflow/shared';
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input } from '@fitflow/ui';

type LoginForm = z.input<typeof loginSchema>;

function LoginCard() {
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm, unknown, z.output<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setError(
        body.message ??
          (res.status === 429 ? 'Too many attempts. Wait a minute and try again.' : 'Login failed'),
      );
      return;
    }
    // Only follow same-site relative paths after login.
    router.replace(next?.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
    router.refresh();
  });

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-fg">
          <Dumbbell size={22} aria-hidden />
        </div>
        <CardTitle className="text-xl">Sign in to FitFlow</CardTitle>
        <p className="text-sm text-fg-muted">Staff login for your gym</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field id="gymSlug" label="Gym ID" error={errors.gymSlug?.message} hint="e.g. demo">
            <Input
              id="gymSlug"
              autoComplete="organization"
              autoCapitalize="none"
              aria-invalid={!!errors.gymSlug}
              {...register('gymSlug')}
            />
          </Field>
          <Field id="email" label="Email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              aria-invalid={!!errors.email}
              {...register('email')}
            />
          </Field>
          <Field id="password" label="Password" error={errors.password?.message}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
          </Field>
          {error && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Suspense>
        <LoginCard />
      </Suspense>
    </main>
  );
}
