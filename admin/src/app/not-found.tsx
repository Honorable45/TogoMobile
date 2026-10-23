import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container-page flex min-h-[70vh] flex-col items-center justify-center text-center">
      <h1 className="display text-[40px]">Page introuvable</h1>
      <Link href="/" className="glass-dark mt-8 inline-flex h-11 items-center rounded-full px-5 font-medium text-white">
        Tableau de bord
      </Link>
    </main>
  );
}
