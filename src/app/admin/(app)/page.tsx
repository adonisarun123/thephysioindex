import { PageHeader } from "@/components/admin/admin-shell";
import { requireStaff } from "@/lib/auth/session";

export default async function Page() {
  await requireStaff();
  return (
    <>
      <PageHeader title="Overview" description="Operational snapshot. Queues on the left update on every load." />
      <p className="text-sm text-muted">Overview panels arrive with the admin release.</p>
    </>
  );
}
