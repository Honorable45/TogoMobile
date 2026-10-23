import { Skeleton } from '@/components/ui/misc';

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Chargement du catalogue">
      <div className="h-[340px] bg-navy md:h-[300px]" />
      <div className="container-page py-10">
        <div className="grid gap-8 lg:grid-cols-[15rem_1fr]">
          <Skeleton className="hidden h-96 lg:block" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="aspect-[3/4.4]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
