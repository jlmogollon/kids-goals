# Notificaciones push (iPhone)

- **Al padre:** cuando un niño completa una tarea o canjea un privilegio.
- **Al niño:** cuando el padre aprueba una tarea (“¡Papá/mamá ha aprobado: [tarea]! ⭐”) o la rechaza (“Tu tarea [tarea] fue rechazada. Puedes volver a intentarlo.”).

## Requisitos

- **iPhone:** iOS 16.4 o superior.
- **PWA:** La app debe estar **añadida a la pantalla de inicio** (no solo abierta en Safari). Abre la web en Safari → Compartir → “Añadir a la pantalla de inicio”.
- **Firebase:** Plan Blaze (de pago) para usar Cloud Functions.

---

## 1. Clave VAPID (Firebase Console)

1. Entra en [Firebase Console](https://console.firebase.google.com) → proyecto **kids-goals**.
2. **Configuración del proyecto** (engranaje) → pestaña **Cloud Messaging**.
3. En **Configuración web** / **Web Push certificates**, pulsa **Generar par de claves**. Copia la clave **pública** (no la privada).
4. En la raíz del proyecto crea un archivo `.env` (o edita el que tengas) y añade:
   ```
   VITE_FCM_VAPID_KEY=tu_clave_publica_aqui
   ```
5. Vuelve a hacer build y a desplegar (`npm run build` y subir a Netlify).

---

## 2. Desplegar la Cloud Function

La función envía el push al padre cuando hay una nueva notificación en Firestore.

1. Instala Firebase CLI si no la tienes:
   ```bash
   npm install -g firebase-tools
   ```
2. Inicia sesión:
   ```bash
   firebase login
   ```
3. En la carpeta del proyecto:
   ```bash
   cd functions
   npm install
   cd ..
   firebase deploy --only functions
   ```
4. Acepta activar el plan Blaze si Firebase te lo pide (tienes cuota gratuita generosa).

---

## 3. Cómo funciona

1. El **padre** abre la app (como padre), acepta los permisos de notificaciones y la app guarda su token FCM en Firestore.
2. Un **niño** completa una tarea → se añade una notificación en Firestore.
3. La **Cloud Function** detecta el cambio y envía un push al token del padre.
4. El **iPhone** muestra la notificación aunque la app esté cerrada (si está añadida a la pantalla de inicio).

Si el padre no ha aceptado notificaciones o no ha abierto la app como padre al menos una vez, no se guardará token y no llegará el push.
