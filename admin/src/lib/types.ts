export type Condition = 'NEW' | 'LIKE_NEW' | 'REFURBISHED' | 'USED_GOOD' | 'USED_FAIR';
export type Availability = 'AVAILABLE' | 'OUT_OF_STOCK' | 'TEMPORARILY_UNAVAILABLE' | 'WITHDRAWN';
export type PublicationStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type ShopStatus = 'PENDING' | 'CHANGES_REQUESTED' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED' | 'REJECTED';
export type ProductModeration = 'PENDING' | 'APPROVED' | 'REJECTED';
export type MediaStatus = 'PROCESSING' | 'READY' | 'FAILED';
export type Role = 'CUSTOMER' | 'SELLER' | 'ADMIN';
export type SaleStatus = 'DECLARED' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'DISPUTED' | 'CANCELLED';
export type ReviewStatus = 'PENDING' | 'PUBLISHED' | 'HIDDEN' | 'REJECTED';
export type ReviewVerification = 'VERIFIED_PURCHASE' | 'PENDING' | 'REVOKED';
export type PromotionPhase = 'SCHEDULED' | 'RUNNING' | 'ENDED' | 'DISABLED' | 'SUSPENDED';

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PromotionView {
  id: string;
  promoPrice: number;
  referencePrice: number;
  discountPercent: number;
  startsAt: string;
  endsAt: string;
  conditions: string | null;
}

export interface ProductCard {
  id: string;
  slug: string;
  reference: string;
  title: string;
  model: string;
  brand: { name: string; slug: string };
  condition: Condition;
  availability: Availability;
  storageGb: number | null;
  ramGb: number | null;
  price: number;
  currentPrice: number;
  promotion: PromotionView | null;
  image: { url: string; mediumUrl?: string; thumbUrl: string; width: number | null; height: number | null } | null;
  shop: { name: string; slug: string; city: string; logoUrl: string | null; identityVerified: boolean };
  ratingAvg: number;
  ratingCount: number;
  isDemo: boolean;
}

export interface Specs {
  screen?: string | null;
  processor?: string | null;
  battery?: string | null;
  rearCamera?: string | null;
  frontCamera?: string | null;
  connectivity?: string | null;
  sim?: string | null;
  os?: string | null;
  dimensions?: string | null;
  weight?: string | null;
  batteryHealth?: string | null;
  extra?: Array<{ label: string; value: string }>;
}

export interface MediaItem {
  id: string;
  type: 'IMAGE' | 'VIDEO';
  status?: MediaStatus;
  error?: string | null;
  url: string | null;
  mediumUrl?: string | null;
  thumbUrl: string | null;
  posterUrl?: string | null;
  durationSec?: number | null;
  transcoded?: boolean;
  width: number | null;
  height: number | null;
  isPrimary: boolean;
  position?: number;
}

export type PublicMedia = MediaItem & { url: string };

export interface ProductDetail extends Omit<ProductCard, 'shop' | 'image'> {
  category: { name: string; slug: string } | null;
  orderable: boolean;
  color: string | null;
  warranty: string | null;
  accessories: string | null;
  defects: string | null;
  description: string | null;
  specs: Specs;
  publishedAt: string | null;
  updatedAt: string;
  image: { url: string; thumbUrl: string } | null;
  /** Médias publics : uniquement ceux dont le traitement est terminé. */
  media: PublicMedia[];
  shop: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    city: string;
    district: string | null;
    ratingAvg: number;
    ratingCount: number;
    productCount: number;
    validatedAt: string | null;
    identityVerified: boolean;
  };
}

export interface ShopCard {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  city: string;
  district?: string | null;
  description?: string | null;
  ratingAvg: number;
  ratingCount: number;
  identityVerified: boolean;
  productCount: number;
}

export interface PublicShop extends ShopCard {
  address: string | null;
  phone: string | null;
  whatsapp: string;
  socialLinks: Partial<Record<'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'website', string>>;
  openingHours: string | null;
  status: ShopStatus;
  validatedAt: string | null;
  isDemo: boolean;
  createdAt: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  productCount?: number;
  isActive?: boolean;
  featured?: boolean;
  sortOrder?: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface ReviewItem {
  id: string;
  rating: number;
  comment: string | null;
  authorName: string;
  createdAt: string;
  verifiedPurchase: boolean;
  isDemo: boolean;
  product?: { title: string; slug: string };
}

export interface ReviewsPage extends Page<ReviewItem> {
  summary: { average: number; count: number; distribution: Array<{ rating: number; count: number }> };
}

export interface Me {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  createdAt: string;
  shop: { id: string; name: string; slug: string; status: ShopStatus } | null;
}

export interface HomeData {
  brands: Brand[];
  newest: ProductCard[];
  popular: ProductCard[];
  promotions: ProductCard[];
  shops: ShopCard[];
}
