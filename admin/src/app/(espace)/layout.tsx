import { AdminHeader } from '@/components/admin/admin-header';
import { AdminShell } from '@/components/admin/admin-shell';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminHeader />
      <main id="contenu">
        <AdminShell>{children}</AdminShell>
      </main>
    </>
  );
}
