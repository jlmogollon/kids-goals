/* Service worker para notificaciones push en segundo plano (FCM) */
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBi3gWJKTUyJEa10fQvboc5AOYi6dyilZA",
  authDomain: "kids-goals.firebaseapp.com",
  projectId: "kids-goals",
  storageBucket: "kids-goals.firebasestorage.app",
  messagingSenderId: "674188476039",
  appId: "1:674188476039:web:d339b18f06f0f600968222",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const title = payload?.notification?.title || "Kids Goals";
  const options = {
    body: payload?.notification?.body || "Tu hijo ha registrado algo en la app",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: "kids-goals-" + (payload?.data?.type || "task"),
    requireInteraction: false,
  };
  return self.registration.showNotification(title, options);
});

// Al pulsar la notificación, abrir/enfocar la app
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf(self.registration.scope) >= 0 && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
