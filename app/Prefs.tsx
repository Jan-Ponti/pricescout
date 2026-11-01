"use client";
import { useEffect, useState } from "react";

type Prefs = {
  zip?: string; budget?: number; needBy?: string; allowOpenBox?: boolean; allowRefurbished?: boolean;
  memberships?: string[];
};

const MEMBERS = ["prime", "walmart+", "plus"] as const;

export default function PrefsPanel({ onChange }: { onChange?: (p: Prefs) => void }) {
  const [p, setP] = useState<Prefs>({ memberships: [] });
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { fetch("/api/prefs").then((r) => r.json()).then(setP); }, []);
  async function save() {
    const r = await (await fetch("/api/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) })).json();
    setP(r); onChange?.(r); setMsg("Prefs saved — re-ranking uses tax, memberships, and budget");
  }
  function toggleMem(m: string) {
    const cur = new Set(p.memberships ?? []);
    if (cur.has(m)) cur.delete(m); else cur.add(m);
    setP({ ...p, memberships: [...cur] });
  }
  return (
    <div className="card" data-testid="prefs">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Shopping prefs</h3>
        <button className="ghost" onClick={() => setOpen(!open)}>{open ? "Hide" : "Edit"}</button>
      </div>
      {!open ? (
        <div className="note" style={{ marginTop: 8 }}>
          ZIP {p.zip || "—"} · budget {p.budget != null ? `$${p.budget}` : "—"} · need by {p.needBy || "—"} · {(p.memberships ?? []).join(", ") || "no memberships"}
          {(p.allowOpenBox || p.allowRefurbished) ? ` · ${[p.allowOpenBox && "open-box", p.allowRefurbished && "refurb"].filter(Boolean).join("/")}` : ""}
        </div>
      ) : (
        <div className="prefsform">
          <label>ZIP<input value={p.zip ?? ""} onChange={(e) => setP({ ...p, zip: e.target.value })} placeholder="48201" /></label>
          <label>Budget $<input type="number" value={p.budget ?? ""} onChange={(e) => setP({ ...p, budget: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="200" /></label>
          <label>Need by<input type="date" value={p.needBy ?? ""} onChange={(e) => setP({ ...p, needBy: e.target.value })} /></label>
          <div className="mems">
            {MEMBERS.map((m) => <button key={m} type="button" className={`ghost ${p.memberships?.includes(m) ? "active" : ""}`} onClick={() => toggleMem(m)}>{m}</button>)}
          </div>
          <label className="check"><input type="checkbox" checked={!!p.allowOpenBox} onChange={(e) => setP({ ...p, allowOpenBox: e.target.checked })} /> Open-box OK</label>
          <label className="check"><input type="checkbox" checked={!!p.allowRefurbished} onChange={(e) => setP({ ...p, allowRefurbished: e.target.checked })} /> Refurbished OK</label>
          <button onClick={save}>Save prefs</button>
          {msg && <div className="note ok">{msg}</div>}
        </div>
      )}
    </div>
  );
}
