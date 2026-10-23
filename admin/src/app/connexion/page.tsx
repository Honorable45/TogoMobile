import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminLoginForm } from './form';

export const metadata: Metadata = { title: 'Connexion' };

export default function LoginPage() {
  return (
    <main id="contenu" className="container-page flex min-h-dvh items-center justify-center py-10">
      <Suspense>
        <AdminLoginForm />
      </Suspense>
    </main>
  );
}
