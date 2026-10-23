import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ForgotForm } from '@/components/auth-forms';

export const metadata: Metadata = { title: 'Mot de passe oublié', robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <ForgotForm />
    </Suspense>
  );
}
