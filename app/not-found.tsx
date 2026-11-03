import Link from "next/link";
export default function NotFound() {
  return (<main className="container" data-testid="not-found" style={{ padding: 40, textAlign: "center" }}>
    <h1>Page not found</h1>
    <p className="note">This link is invalid, expired, or was revoked by its owner.</p>
    <p><Link href="/">Go to PriceScout</Link></p>
  </main>);
}
