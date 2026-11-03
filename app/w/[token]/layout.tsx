import { notFound } from "next/navigation";
import { shareOwner } from "@/lib/share";
export const dynamic = "force-dynamic";
/** Server-side guard: an unknown, malformed, or revoked token renders the 404 page (HTTP 404). */
export default async function WishlistLayout({ children, params }: { children: React.ReactNode; params: { token: string } }) {
  if (!(await shareOwner(params.token))) notFound();
  return <>{children}</>;
}
