"use client";
import { useEffect, useState } from "react";
type S = { avgRating: number; count: number; pros: string[]; cons: string[]; complaints: string[]; via: string };
export default function Reviews({ productId }: { productId: string }) {
  const [s, setS] = useState<S | null>(null);
  useEffect(() => { setS(null); fetch(`/api/reviews?productId=${encodeURIComponent(productId)}`).then((r) => r.json()).then((j) => !j.error && setS(j)); }, [productId]);
  if (!s) return <div className="stat"><small>Reviews</small><b>…</b></div>;
  return (<div className="stat" data-testid="reviews" style={{ maxWidth: 260 }}>
    <small>Reviews <span className="tag mock">mock</span></small><b>{"★".repeat(Math.round(s.avgRating))} {s.avgRating}</b><small>{s.count} reviews · {s.via === "llm" ? "AI summary" : "rule summary"}</small>
    <div className="note" style={{ margin: "4px 0 0", textAlign: "left" }}>
      {s.pros.length > 0 && <div className="ok">👍 {s.pros.join(" · ")}</div>}
      {s.cons.length > 0 && <div>👎 {s.cons.join(" · ")}</div>}
      {s.complaints.length > 0 && <div className="err">⚠️ Common: {s.complaints.join(" · ")}</div>}
    </div></div>);
}
