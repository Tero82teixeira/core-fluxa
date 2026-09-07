self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = payload.title || "Novo alerta FLUXA";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "Há uma nova atualização para você.",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: payload.tag || "fluxa-alert",
      renotify: true,
      data: { url: payload.url || "/notificacoes" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || "/notificacoes", self.location.origin)
    .href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((windowClient) =>
        windowClient.url.startsWith(self.location.origin),
      );
      if (existing) {
        existing.navigate(destination);
        return existing.focus();
      }
      return self.clients.openWindow(destination);
    }),
  );
});
