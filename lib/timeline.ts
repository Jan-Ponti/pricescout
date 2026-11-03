/** Records the real tool calls the chat agent makes so the UI can show an agent timeline. */
export interface Step { tool: string; label: string; ms: number; ok: boolean; detail?: string }
export class Timeline {
  steps: Step[] = [];
  constructor(private now: () => number = () => Date.now()) {}
  async run<T>(tool: string, label: string, fn: () => Promise<T> | T, detail?: (r: T) => string | undefined): Promise<T> {
    const t0 = this.now();
    try {
      const r = await fn();
      this.steps.push({ tool, label, ms: Math.max(0, Math.round(this.now() - t0)), ok: true, detail: detail?.(r) });
      return r;
    } catch (e) {
      this.steps.push({ tool, label, ms: Math.max(0, Math.round(this.now() - t0)), ok: false, detail: (e as Error).message?.slice(0, 120) });
      throw e;
    }
  }
}
