import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RegisterForm } from '@/components/auth-forms';

export const metadata: Metadata = { title: 'Créer un compte', robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
