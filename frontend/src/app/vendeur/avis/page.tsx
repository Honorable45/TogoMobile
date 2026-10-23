'use client';

import Link from 'next/link';
import { MessageSquareText } from 'lucide-react';
import { ReportButton } from '@/components/report-button';
import { PageHeader } from '@/components/seller/seller-shell';
import { Alert, Badge, EmptyState, Skeleton, Stars } from '@/components/ui/misc';
import { formatDate, REVIEW_STATUS_LABELS } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Page, ReviewStatus, ReviewVerification } from '@/lib/types';

interface SellerReview {
  id: string;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  verification: ReviewVerification;
  authorName: string;
  product: { title: string; slug: string };
  saleRef: string;
  createdAt: string;
}

export default function SellerReviewsPage() {
  const { data, error } = useApi<Page<SellerReview>>('/seller/reviews?pageSize=50');
  return (
    <div className="space-y-5">
      <PageHeader
        title="Avis reçus"
        description="Les avis sont déposés par vos clients via le QR code. Vous ne pouvez ni les modifier ni les supprimer ; en cas d’abus, signalez-les à l’équipe de modération."
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {!data ? (
        <Skeleton className="h-48" />
      ) : data.items.length === 0 ? (
        <EmptyState icon={<MessageSquareText className="size-10" />} title="Aucun avis pour le moment">
          Enregistrez vos ventes et remettez le QR code à vos clients pour recevoir des avis vérifiés.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {data.items.map((r) => (
            <li key={r.id} className="space-y-1.5 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Stars value={r.rating} />
                <span className="text-sm font-semibold">{r.authorName}</span>
                <Badge tone={r.status === 'PUBLISHED' ? 'brand' : r.status === 'PENDING' ? 'warn' : 'muted'}>{REVIEW_STATUS_LABELS[r.status]}</Badge>
                {r.verification === 'VERIFIED_PURCHASE' && <Badge tone="brand">Achat vérifié</Badge>}
                <span className="text-xs text-subtle">{formatDate(r.createdAt)}</span>
              </div>
              <p className="text-xs text-muted">
                <Link href={`/produits/${r.product.slug}`} className="hover:underline">{r.product.title}</Link> · vente {r.saleRef}
              </p>
              {r.comment && <p className="text-[0.9375rem]">{r.comment}</p>}
              {r.status === 'PUBLISHED' && <ReportButton targetType="REVIEW" targetId={r.id} label="Signaler un abus" compact />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
