"use client";
import type { Step } from "@/lib/timeline";
export default function AgentTimeline({ steps }: { steps: Step[] }) {
  if (!steps?.length) return null;
  const total = steps.reduce((s, x) => s + x.ms, 0);
  return (<details className="timeline" data-testid="timeline"><summary>🧭 Agent steps · {steps.length} tool calls · {total} ms</summary>
    <ol>{steps.map((s, i) => <li key={i} className={s.ok ? "" : "err"}><b>{s.label}</b> <code>{s.tool}</code> <span className="note">{s.ms} ms{s.detail ? ` · ${s.detail}` : ""}</span>{!s.ok && " ✗"}</li>)}</ol></details>);
}
