import webpush from "web-push";
import nodemailer from "nodemailer";
import { query, run } from "../db";
import type { Alert } from "./rules";

export interface NotificationChannel { name: string; enabled(): boolean | Promise<boolean>; send(a: Alert): Promise<{ sent: number; detail?: string }> }
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** VAPID keys from env, else generated once and stored in the DB so push works with zero setup. */
export async function vapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  const row = (await query("SELECT v FROM kv WHERE k = 'vapid'"))[0];
  if (row) return JSON.parse(String(row.v));
  const k = webpush.generateVAPIDKeys(); await run("INSERT INTO kv VALUES ('vapid', ?)", [JSON.stringify(k)]); return k;
}

export const inAppChannel: NotificationChannel = {
  name: "in-app", enabled: () => true,
  async send(a) { await run("INSERT INTO notifications (product_id, title, body, url, created) VALUES (?,?,?,?,?)", [a.productId, a.title, a.body, a.url, new Date().toISOString()]); return { sent: 1 }; },
};

export const webPushChannel: NotificationChannel = {
  name: "web-push", enabled: () => true,
  async send(a) {
    const k = await vapidKeys(); webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:alerts@pricescout.local", k.publicKey, k.privateKey);
    const subs = await query("SELECT endpoint, json FROM push_subs"); let sent = 0; const errs: string[] = [];
    for (const s of subs) {
      try { await webpush.sendNotification(JSON.parse(String(s.json)), JSON.stringify({ title: a.title, body: a.body, url: a.url })); sent++; }
      catch (e: any) { errs.push(String(e.statusCode ?? e.message)); if (e.statusCode === 404 || e.statusCode === 410) await run("DELETE FROM push_subs WHERE endpoint = ?", [String(s.endpoint)]); }
    }
    return { sent, detail: errs.length ? `errors: ${errs.join(",")}` : undefined };
  },
};

const emailTo = () => process.env.ALERT_EMAIL_TO;
export const emailChannel: NotificationChannel = {
  name: "email", enabled: () => Boolean(emailTo() && (process.env.RESEND_API_KEY || process.env.SMTP_HOST)),
  async send(a) {
    const from = process.env.ALERT_EMAIL_FROM || "PriceScout <onboarding@resend.dev>";
    const html = `<h2>${esc(a.title)}</h2><p>${esc(a.body)}</p><p><a href="${esc(a.url)}" style="background:#ffc439;color:#111;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Buy with PayPal</a></p>`;
    if (process.env.RESEND_API_KEY) {
      const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: emailTo(), subject: a.title, html, text: `${a.body}\nBuy with PayPal: ${a.url}` }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`Resend ${r.status}: ${j.message ?? ""}`); return { sent: 1, detail: `resend id ${j.id}` };
    }
    const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined });
    await t.sendMail({ from, to: emailTo(), subject: a.title, html, text: `${a.body}\nBuy with PayPal: ${a.url}` }); return { sent: 1 };
  },
};

export const smsChannel: NotificationChannel = {
  name: "sms", enabled: () => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM && process.env.ALERT_SMS_TO),
  async send(a) {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: process.env.TWILIO_FROM!, To: process.env.ALERT_SMS_TO!, Body: `${a.title}: ${a.body} Buy: ${a.url}`.slice(0, 600) }) });
    if (!r.ok) throw new Error(`Twilio ${r.status}`); return { sent: 1 };
  },
};

export const channels: NotificationChannel[] = [inAppChannel, webPushChannel, emailChannel, smsChannel];
export async function dispatch(a: Alert, list = channels) {
  const results: Record<string, string> = {};
  for (const c of list) {
    if (!(await c.enabled())) { results[c.name] = "disabled (not configured)"; continue; }
    try { const r = await c.send(a); results[c.name] = `sent ${r.sent}${r.detail ? ` (${r.detail})` : ""}`; } catch (e) { results[c.name] = `error: ${(e as Error).message}`; }
  }
  return results;
}
