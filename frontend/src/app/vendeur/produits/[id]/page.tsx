'use client';

import { use } from 'react';
import { ProductEditor } from '@/components/seller/product-editor';
import type { SellerProduct } from '@/components/seller/types';
import { Alert, Skeleton } from '@/components/ui/misc';
import { useApi } from '@/lib/hooks';

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error } = useApi<SellerProduct>(`/seller/products/${id}`);
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) return <Skeleton className="h-96" />;
  return <ProductEditor key={data.id} initial={data} />;
}
