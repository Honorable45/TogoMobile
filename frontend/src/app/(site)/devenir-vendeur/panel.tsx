'use client';

import { useRouter } from 'next/navigation';
import { useSession } from '@/components/session';
import { ShopForm } from '@/components/shop/shop-form';
import { ButtonLink } from '@/components/ui/button';
import { Alert, Card, Skeleton } from '@/components/ui/misc';

export function BecomeSellerPanel() {
  const { user, loading, refresh } = useSession();
  const router = useRouter();

  if (loading) return <Skeleton className="h-96" />;

  if (!user) {
    return (
      <Card className="h-fit rounded-3xl p-6 sm:p-8">
        <h2 className="display text-2xl">Commencez par créer votre compte</h2>
        <p className="mt-1 text-sm text-muted">Votre compte personnel servira à gérer votre boutique en toute sécurité.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <ButtonLink href="/inscription?next=/devenir-vendeur">Créer un compte</ButtonLink>
          <ButtonLink href="/connexion?next=/devenir-vendeur" variant="outline">J’ai déjà un compte</ButtonLink>
        </div>
      </Card>
    );
  }
  if (user.role === 'ADMIN') {
    return <Alert tone="info">Un compte administrateur ne peut pas ouvrir de boutique. Utilisez un compte distinct.</Alert>;
  }
  if (user.shop) {
    return (
      <Card className="h-fit rounded-3xl p-6 sm:p-8">
        <h2 className="display text-2xl">Vous avez déjà une boutique : {user.shop.name}</h2>
        <p className="mt-1 text-sm text-muted">
          {user.shop.status === 'PENDING' ? 'Votre demande est en cours d’examen. Vous pouvez déjà préparer vos annonces.' : 'Gérez-la depuis votre espace vendeur.'}
        </p>
        <ButtonLink href="/vendeur" className="mt-5">Ouvrir mon espace vendeur</ButtonLink>
      </Card>
    );
  }
  return (
    <Card className="h-fit rounded-3xl p-6 sm:p-8">
      <h2 className="display mb-6 text-2xl">Demande d’ouverture de boutique</h2>
      <ShopForm
        mode="create"
        initial={{ whatsapp: user.phone ?? '' }}
        onSaved={async () => {
          await refresh();
          router.push('/vendeur?bienvenue=1');
        }}
      />
    </Card>
  );
}
