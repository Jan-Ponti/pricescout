// Appends VAPID keys to .env.local if missing (never overwrites existing values).
import fs from "node:fs"; import webpush from "web-push";
const f = ".env.local"; const cur = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
if (/^VAPID_PUBLIC_KEY=/m.test(cur)) { console.log("VAPID keys already present in .env.local"); process.exit(0); }
const k = webpush.generateVAPIDKeys();
fs.appendFileSync(f, `${cur && !cur.endsWith("\n") ? "\n" : ""}VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\nVAPID_SUBJECT=mailto:you@example.com\n`);
console.log("Wrote VAPID keys to .env.local");
