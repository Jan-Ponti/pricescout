"use client";
import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceDot, Legend } from "recharts";
const RANGES = ["1W", "1M", "3M", "1Y", "All"] as const;
const COLORS: Record<string, string> = { best: "#2fd38a", Amazon: "#ff9f43", "Best Buy": "#4dabf7", Walmart: "#ffd43b", Target: "#ff6b6b", eBay: "#b197fc" };
type Data = { range: string; rows: Record<string, number | string>[]; low: { date: string; price: number; retailer: string } | null };
export default function PriceChart({ productId }: { productId: string }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>("3M"); const [d, setD] = useState<Data | null>(null); const [all, setAll] = useState(false);
  useEffect(() => { fetch(`/api/history?productId=${productId}&range=${range}`).then((r) => r.json()).then(setD); }, [productId, range]);
  const retailers = d?.rows[0] ? Object.keys(d.rows[0]).filter((k) => k !== "date" && k !== "best") : [];
  return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h3 style={{ margin: 0 }}>Price history</h3>
      <div className="ranges">{RANGES.map((r) => <button key={r} className={`ghost ${r === range ? "active" : ""}`} onClick={() => setRange(r)}>{r}</button>)}
        <button className={`ghost ${all ? "active" : ""}`} onClick={() => setAll(!all)}>By retailer</button></div></div>
    {d?.low && <div className="lowbox" data-testid="lowest">▼ Lowest in {d.range}: <b>${d.low.price.toFixed(2)}</b> at {d.low.retailer} on {d.low.date}</div>}
    <div style={{ height: 320 }}><ResponsiveContainer><LineChart data={d?.rows ?? []}>
      <CartesianGrid stroke="#26325a" strokeDasharray="3 3" /><XAxis dataKey="date" stroke="#93a0c4" fontSize={11} minTickGap={40} />
      <YAxis stroke="#93a0c4" fontSize={11} domain={["auto", "auto"]} tickFormatter={(v) => `$${v}`} />
      <Tooltip contentStyle={{ background: "#121a33", border: "1px solid #26325a" }} formatter={(v: number) => `$${v.toFixed(2)}`} /><Legend />
      <Line type="monotone" dataKey="best" name="Lowest listed price (all retailers)" stroke={COLORS.best} strokeWidth={2.5} dot={false} />
      {all && retailers.map((r) => <Line key={r} type="monotone" dataKey={r} stroke={COLORS[r] ?? "#888"} dot={false} strokeWidth={1} />)}
      {d?.low && <ReferenceDot x={d.low.date} y={d.low.price} r={6} fill="#2fd38a" stroke="#fff" label={{ value: "Lowest", fill: "#2fd38a", position: "top", fontSize: 12 }} />}
    </LineChart></ResponsiveContainer></div></div>);
}
