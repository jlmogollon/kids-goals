# 🔔 Sistema de Notificaciones Push - Kids Goals

## Resumen Ejecutivo

El sistema de **notificaciones push end-to-end** está completamente implementado usando **Firebase Cloud Messaging (FCM)** y **Cloud Functions**. Las notificaciones se envían automáticamente a padres e hijos cuando ocurren eventos importantes en la app.

---

## 📱 Eventos de Notificaciones

### Para PADRES 👨‍👩‍👧

| Evento | Descripción | Ícono |
|--------|-------------|-------|
| **Niño completa tarea** | Se envía cuando un niño marca una tarea como completada | ✅ |
| **Niño canjea privilegio** | Se envía cuando un niño canjea un privilegio | 🎁 |

### Para NIÑOS 👧‍👦

| Evento | Descripción | Ícono |
|--------|-------------|-------|
| **Tarea aprobada** | Se envía cuando papá/mamá aprueba una tarea | ⭐ |
| **Tarea rechazada** | Se envía cuando papá/mamá rechaza una tarea | ❌ |
| **Tarea nueva asignada** | Se envía cuando se asigna una tarea nueva | 📝 |
| **Reto nuevo asignado** | Se envía cuando se asigna un reto nuevo | 🎯 |
| **Reto aprobado** | Se envía cuando papá/mamá aprueba un reto | ⭐ |
| **Privilegio nuevo recibido** | Se envía cuando recibe un privilegio nuevo | 🎁 |
| **Mensaje de los padres** | Se envía con mensajes de papá/mamá | 💬 |

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENTE REACT (App)                           │
├─────────────────────────────────────────────────────────────────┤
│ • Solicita permisos de notificación (Notification.requestPerm)  │
│ • Obtiene token FCM (getToken from Firebase Messaging)          │
│ • Envía token a Firestore (setParentFcmToken / setChildFcmToken)│
│ • Service Worker registrado: public/firebase-messaging-sw.js    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              FIRESTORE - appData/{familyId}                      │
├─────────────────────────────────────────────────────────────────┤
│ parentFcmTokens: {    ← Tokens de los padres                    │
│   father: "...",      ← Token del papá                          │
│   mother: "..."       ← Token de la mamá                        │
│ }                                                               │
│                                                                 │
│ childFcmTokens: {     ← Tokens de los niños                    │
│   jose: "...",        ← Token de José                          │
│   david: "..."        ← Token de David                         │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│        FIREBASE CLOUD FUNCTIONS (functions/index.js)            │
├─────────────────────────────────────────────────────────────────┤
│ • Escucha cambios en appData/{familyId}                         │
│ • Detecta 8 tipos diferentes de eventos                         │
│ • Genera payloads de notificación personalizados               │
│ • Envía usando messaging.send() (FCM API)                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│           FIREBASE CLOUD MESSAGING (FCM) SERVERS                │
├─────────────────────────────────────────────────────────────────┤
│ • Google Cloud Infrastructure                                   │
│ • Encripta y entrega payloads a dispositivos                   │
│ • Compatible con iOS y Android (a través del navegador PWA)     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              DISPOSITIVO DEL USUARIO (iPhone/Android)           │
├─────────────────────────────────────────────────────────────────┤
│ • Service Worker recibe el mensaje de push                     │
│ • Activa: self.addEventListener('push', fn)                    │
│ • Muestra notificación visual al usuario                        │
│ • onClick: navegava a la app (public/firebase-messaging-sw.js) │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Setup Completado

### ✅ Cliente (src/App.jsx)

```javascript
// 1. Importar Firebase Messaging
import { getMessaging, getToken, onMessage } from "firebase/messaging";

// 2. Registrar Service Worker
const FCM_VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY || "";
registerFcmSw(); // Al cargar la app

// 3. Función: Solicitar permisos y obtener token (PADRES)
const requestParentNotif = useCallback(async () => {
  if (!FCM_VAPID_KEY || !familyId) return;
  
  // Solicitar permiso al navegador
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;
  
  // Obtener token
  const messaging = getMessaging(_app);
  const token = await getToken(messaging, { vapidKey: FCM_VAPID_KEY });
  
  // Guardar en Firestore
  await setParentFcmToken(familyId, parentRole, token);
  dispatch({ type: "TOAST", msg: "🔔 Notificaciones activadas" });
}, [familyId, parentRole]);

// 4. Función: Similar para niños
const requestChildNotif = useCallback(async () => {
  // ... similar a requestParentNotif
  await setChildFcmToken(familyId, childKidId, token);
}, [familyId, childKidId]);
```

### ✅ Service Worker (public/firebase-messaging-sw.js)

```javascript
// Recibe notificaciones en segundo plano
messaging.onBackgroundMessage(function (payload) {
  const title = payload?.notification?.title || "Kids Goals";
  const options = {
    body: payload?.notification?.body || "Acción requerida",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: "kids-goals-" + (payload?.data?.type || "task"),
  };
  return self.registration.showNotification(title, options);
});

// Al hacer click en la notificación
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then(function (clientList) {
      // Abrir la app o enfocar ventana existente
      for (var i = 0; i < clientList.length; i++) {
        if (client.url.indexOf(self.registration.scope) >= 0) {
          return client.focus();
        }
      }
      return clients.openWindow("/");
    })
  );
});
```

### ✅ Cloud Functions (functions/index.js)

```javascript
export const notifyParentOnNewNotification = onDocumentUpdated(
  { document: "appData/main", region: "europe-west1" },
  async (change) => {
    const after = change.after?.data();
    const before = change.before?.data();
    const messaging = getMessaging();
    
    // 1. Detectar cambios en notifications (tareas completadas)
    // 2. Detectar cambios en completions (tareas aprobadas/rechazadas)
    // 3. Detectar cambios en challenges (retos asignados/aprobados)
    // 4. Detectar cambios en privileges (privilegios nuevos)
    // 5. Detectar cambios en messages (mensajes nuevos)
    
    // Para cada evento detectado:
    for (const token of tokensToNotify) {
      await messaging.send({
        token,
        notification: { title, body },
        data: { type, familyId, kidId, ... },
        webpush: { notification: { ... } },
      });
    }
  }
);
```

---

## 🔑 Variables de Entorno Requeridas

### En `.env` (cliente)

```bash
VITE_FCM_VAPID_KEY=BNY... # Clave VAPID pública de Firebase
```

**¿Cómo obtenerla?**

1. Ir a [Firebase Console](https://console.firebase.google.com)
2. Proyecto "kids-goals" → Configuración del proyecto
3. Cloud Messaging → Web push certificates
4. Generar par de claves si no existe
5. Copiar "Clave pública" a `.env`

---

## 🧪 Pruebas Manuales

### 1. Verificar que los tokens se guardan

En [Firebase Console](https://console.firebase.google.com):

1. kids-goals → Firestore
2. appData collection → main document
3. Buscar `parentFcmTokens` y `childFcmTokens`
4. Deben tener valores como: `"exp...xyz123..."`

### 2. Simular un evento de notificación

En la app:

1. **Niño**: Completar una tarea
2. **Papá**: Ver notificación push que dice "José ha completado: Estudiar"
3. **Papá**: Aprobar la tarea
4. **Niño**: Ver notificación push que dice "¡Papá ha aprobado: Estudiar! ⭐"

### 3. Verificar que el Service Worker funciona

En el navegador:

1. Abrir DevTools (F12)
2. Application → Service Workers
3. Tiene que estar "Active and running" (verde)
4. Ver "firebase-messaging-sw" desde `public/firebase-messaging-sw.js`

### 4. Test en iOS (PWA instalada)

1. Agregar app a pantalla de inicio (Share → Add to Home Screen)
2. Abrir app instalada
3. Solicitar permisos de notificación
4. Verificar que llegan notificaciones cuando actuas en la app

---

## 🐛 Troubleshooting

### Las notificaciones no llegan

**Problema**: Los tokens no se están guardando  
**Solución**: 
- Verificar que `VITE_FCM_VAPID_KEY` está en `.env`
- Rebuilar la app: `npm run build`
- Verificar permisos en Firefox/Chrome/Safari

**Problema**: El Service Worker no está registrado  
**Solución**:
- La app DEBE estar en HTTPS (o localhost para dev)
- Limpiar cache del navegador: DevTools → Application → Clear storage
- Recargar la app

**Problema**: El permiso está bloqueado  
**Solución**:
- Chrome: Settings → Privacy → Site settings → Notifications → Reset permissions
- Firefox: about:preferences#privacy → Permissions → Notifications → Clear

---

## 📊 Flujo de un Evento Completo (Ejemplo)

### Niño completa una tarea

```
1. CLIENTE
   └─ Niño marca ✅ en "Estudiar"
   └─ Dispatch: { type: "MARK_COMPLETE", taskId: 1 }
   └─ setState: kid.completions[1] = { done: true, ... }

2. FIRESTORE
   └─ Actualiza: appData/main.kids.jose.completions[1]
   └─ Agrega NEW en notifications: {
        id: "notif_...",
        type: "task",
        kidId: "jose",
        taskId: 1
     }

3. CLOUD FUNCTION TRIGGER
   └─ Escucha: onDocumentUpdated('appData/main')
   └─ Compara before y after
   └─ Detecta: notifications tiene un NEW item
   └─ Obtiene: parentFcmTokens.father, .mother
   └─ Crea payload:
      {
        title: "Kids Goals",
        body: "✅ José ha completado: Estudiar. Ábrela para aprobar.",
        data: { type: "task", kidId: "jose", taskId: "1" }
      }

4. MESSAGING.SEND()
   └─ Envía a FCM con cada token de padre
   └─ FCM entrega a dispositivos (iPhone/Android)

5. DISPOSITIVO
   └─ Service Worker recibe 'push' event
   └─ Muestra notificación visible
   └─ Papá/mamá ve: "✅ José ha completado: Estudiar..."

6. SI PAPÁ HACE CLICK
   └─ notificationclick event en SW
   └─ kids.clients.matchAll() busca ventana
   └─ clients.openWindow("/") abre o enfoca app
   └─ App se refresca y ve la tarea lista para aprobar
```

---

## 🔄 Actualizaciones Desplegadas

### Cambios en Cloud Functions (functions/index.js)

**Antes**: Solo notificaciones simples (tareas completadas, aprobaciones)

**Después**: 8 tipos de eventos:

1. ✅ Tareas completadas (padres)
2. ✅ Privilegios canjeados (padres)
3. ✅ Tareas aprobadas (niños)
4. ✅ Tareas rechazadas (niños)
5. ✨ **Tareas nuevas asignadas (niños)** ← NUEVO
6. ✨ **Retos asignados (niños)** ← NUEVO
7. ✨ **Retos aprobados (niños)** ← NUEVO
8. ✨ **Privilegios nuevos (niños)** ← NUEVO
9. ✅ Mensajes (niños)

---

## 📝 Monitoreo y Logs

### Ver logs de Cloud Functions

En [Firebase Console](https://console.firebase.google.com) → Logs:

```
notifyParentOnNewNotification (europe-west1)
  └─ Ver cada evento procesado
  └─ Errores de FCM.send()
  └─ Tiempos de ejecución
```

### Errores comunes en logs

```
FCM parent: Invalid registration token provided

→ El token guardado en Firestore ha expirado
→ El usuario debe reactivar notificaciones en el navegador
```

---

## 🚀 Próximas Mejoras (Opcional)

- [ ] Notificaciones por usuario específico (no solo "todos los padres")
- [ ] Horario de "no molestar" (ej: después de 22h)
- [ ] Preferencias de qué notificaciones recibir
- [ ] Notificaciones de resumen (1x día a las 20h)
- [ ] Migrar a Web Push (w webpush library) como en Caballeros para más control

---

## 📞 Soporte

Si las notificaciones no funcionan:

1. Revisar que `VITE_FCM_VAPID_KEY` está en `.env`
2. Confirmar que los tokens se guardan en Firestore
3. Revisar logs en Firebase Console
4. Verificar en DevTools que Service Worker está activo
5. Limpiar cache y recargar completamente la app
