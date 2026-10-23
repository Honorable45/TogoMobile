import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container-page flex min-h-[70vh] flex-col items-center justify-center text-center">
      <p className="eyebrow">Erreur 404</p>
      <h1 className="display mt-3 text-[40px]">Page introuvable</h1>
      <p className="mt-2 text-muted">Le lien est peut-être incorrect, ou le contenu a été retiré.</p>
      <Link href="/" className="glass-dark mt-8 inline-flex h-11 items-center rounded-full px-5 font-medium text-white">
        Retour à l’accueil
      </Link>
    </main>
  );
}
