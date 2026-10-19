self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data.json(); } catch { d = { title: "PriceScout", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || "PriceScout", { body: d.body, data: { url: d.url }, actions: [{ action: "buy", title: "Buy with PayPal" }], tag: d.url }),
    self.clients.matchAll({ includeUncontrolled: true }).then((cs) => cs.forEach((c) => c.postMessage({ type: "push", payload: d }))),
  ]));
});
self.addEventListener("notificationclick", (e) => { e.notification.close(); const url = (e.notification.data && e.notification.data.url) || "/"; e.waitUntil(self.clients.openWindow(url)); });
