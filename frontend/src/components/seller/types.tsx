import { Badge } from '../ui/misc';
import type { Availability, Condition, MediaItem, ProductModeration, PromotionView, PublicationStatus } from '@/lib/types';

export interface SellerProduct {
  id: string;
  slug: string;
  reference: string;
  title: string;
  model: string;
  brandId: string;
  categoryId: string | null;
  brand: { id: string; name: string };
  condition: Condition;
  availability: Availability;
  status: PublicationStatus;
  moderation: ProductModeration;
  moderationNote: string | null;
  price: number;
  stock: number;
  storageGb: number | null;
  ramGb: number | null;
  color: string | null;
  warranty: string | null;
  accessories: string | null;
  defects: string | null;
  description: string | null;
  specs: Record<string, unknown>;
  media: MediaItem[];
  removedAt: string | null;
  removalReason: string | null;
  runningPromotion: PromotionView | null;
  viewCount: number;
  whatsappClicks: number;
  updatedAt: string;
}


export function StatusBadge({ p }: { p: Pick<SellerProduct, 'status' | 'removedAt' | 'moderation'> }) {
  if (p.removedAt) return <Badge tone="danger">Retirée par l’administration</Badge>;
  if (p.status === 'PUBLISHED' && p.moderation === 'PENDING') return <Badge tone="warn">En attente de validation</Badge>;
  if (p.status === 'PUBLISHED' && p.moderation === 'REJECTED') return <Badge tone="danger">Refusée — à corriger</Badge>;
  if (p.status === 'PUBLISHED') return <Badge tone="brand">Publiée</Badge>;
  if (p.status === 'DRAFT') return <Badge tone="muted">Brouillon</Badge>;
  return <Badge tone="neutral">Retirée</Badge>;
}

