/**
 * Cloud Functions: notificaciones push end-to-end
 * 
 * Eventos para PADRES:
 * - Cuando un niño completa una tarea (ya le llegó una notificación)
 * - Cuando un niño canjea un privilegio
 * 
 * Eventos para NIÑOS:
 * - Cuando se aprueba una tarea
 * - Cuando se rechaza una tarea
 * - Cuando se asigna una tarea nueva
 * - Cuando se asigna un reto
 * - Cuando se aprueba un reto
 * - Cuando reciben un mensaje de los padres
 * - Cuando reciben un privilegio nuevo
 */
import { initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

initializeApp();

const kidNames = { jose: "José", david: "David" };

function mapNotificationIds(list) {
  if (!Array.isArray(list)) return new Set();
  return new Set(list.map((n) => String(n?.id)).filter(Boolean));
}

function getTaskName(tasks, taskId) {
  const task = Array.isArray(tasks) ? tasks.find((t) => t.id === taskId) : null;
  return task?.name || "una tarea";
}

function buildChallengeKey(kidId, challengeId) {
  return `${kidId}:${challengeId}`;
}

function getChallengeTitle(challenges, challengeId) {
  const ch = Array.isArray(challenges) ? challenges.find((c) => c.id === challengeId) : null;
  return ch?.title || "un reto";
}

export const notifyParentOnNewNotification = onDocumentUpdated(
  {
    document: "appData/main",
    region: "europe-west1",
  },
  async (change) => {
    const after = change.after?.data();
    const before = change.before?.data();
    if (!after || !before) return;

    const familyId = change.after?.ref?.id;
    const tasks = Array.isArray(after.tasks) ? after.tasks : [];
    const challenges = Array.isArray(after.challenges) ? after.challenges : [];
    const kids = after.kids || {};
    const messaging = getMessaging();

    const parentTokens = after.parentFcmTokens || {};
    const parentTokensList = [parentTokens.father, parentTokens.mother].filter(Boolean);
    if (after.parentFcmToken && !parentTokensList.length) parentTokensList.push(after.parentFcmToken); // retrocompat

    const childTokens = after.childFcmTokens || {};
    const beforeKids = before.kids || {};
    const afterKids = after.kids || {};

    // ══════════════════════════════════════════════════════════════
    // NOTIFICACIONES PARA PADRES
    // ══════════════════════════════════════════════════════════════

    // 1️⃣ PADRE: Cuando un niño completa una tarea o canjea un privilegio
    const notifs = Array.isArray(after.notifications) ? after.notifications : [];
    const beforeIds = mapNotificationIds(before.notifications);
    const latestNotif = notifs.find((n) => !beforeIds.has(String(n?.id))) || null;
    if (parentTokensList.length > 0 && latestNotif) {
      const kidName = latestNotif?.kidId ? (kids[latestNotif.kidId]?.name || kidNames[latestNotif.kidId] || "Tu hijo") : "Tu hijo";
      const taskName = getTaskName(tasks, latestNotif?.taskId);
      const title = "Kids Goals";
      const body =
        latestNotif?.type === "privilege"
          ? `🎁 ${kidName} ha canjeado un privilegio`
          : `✅ ${kidName} ha completado: ${taskName}. Ábrela para aprobar.`;
      for (const token of parentTokensList) {
        try {
          await messaging.send({
            token,
            notification: { title, body },
            data: {
              type: latestNotif?.type || "task",
              familyId: familyId || "",
              kidId: latestNotif?.kidId || "",
              taskId: String(latestNotif?.taskId ?? ""),
            },
            webpush: {
              notification: { title, body, icon: "/icons/icon-192x192.png" },
              fcmOptions: { link: "/" },
            },
          });
        } catch (err) {
          console.warn("FCM parent notification:", err?.message);
        }
      }
    }

    // ══════════════════════════════════════════════════════════════
    // NOTIFICACIONES PARA NIÑOS
    // ══════════════════════════════════════════════════════════════

    if (Object.keys(childTokens).length === 0) return;

    for (const kidId of ["jose", "david"]) {
      const token = childTokens[kidId];
      if (!token) continue;
      const bCompletions = beforeKids[kidId]?.completions || {};
      const aCompletions = afterKids[kidId]?.completions || {};
      const kidName = kidNames[kidId];

      // 2️⃣ NIÑO: Cuando se aprueba una tarea
      for (const [taskIdStr, aComp] of Object.entries(aCompletions)) {
        if (!aComp.approved) continue;
        const bComp = bCompletions[taskIdStr];
        if (bComp?.approved) continue; // Ya fue aprobada antes
        const taskName = getTaskName(tasks, parseInt(taskIdStr, 10));
        const who = aComp.approvedBy === "mother" ? "Mamá" : "Papá";
        const title = "Kids Goals";
        const body = `¡${who} ha aprobado: ${taskName}! ⭐`;
        try {
          await messaging.send({
            token,
            notification: { title, body },
            data: {
              type: "taskApproved",
              familyId: familyId || "",
              kidId,
              taskId: String(taskIdStr),
            },
            webpush: {
              notification: { title, body, icon: "/icons/icon-192x192.png" },
              fcmOptions: { link: "/" },
            },
          });
        } catch (err) {
          console.warn("FCM child taskApproved:", err?.message);
        }
      }

      // 3️⃣ NIÑO: Cuando se rechaza una tarea (se borra la completion)
      for (const [taskIdStr, bComp] of Object.entries(bCompletions)) {
        if (bComp.approved) continue; // No enviar si ya estaba aprobada
        if (taskIdStr in aCompletions) continue; // Aún existe
        const taskName = getTaskName(tasks, parseInt(taskIdStr, 10));
        const title = "Kids Goals";
        const body = `Tu tarea "${taskName}" fue rechazada. Puedes volver a intentarlo.`;
        try {
          await messaging.send({
            token,
            notification: { title, body },
            data: {
              type: "taskRejected",
              familyId: familyId || "",
              kidId,
              taskId: String(taskIdStr),
            },
            webpush: {
              notification: { title, body, icon: "/icons/icon-192x192.png" },
              fcmOptions: { link: "/" },
            },
          });
        } catch (err) {
          console.warn("FCM child taskRejected:", err?.message);
        }
      }

      // 4️⃣ NIÑO: Cuando recibe un mensaje de los padres
      const bMsgs = beforeKids[kidId]?.messages || [];
      const aMsgs = afterKids[kidId]?.messages || [];
      if (aMsgs.length > bMsgs.length && aMsgs[0]?.text) {
        const title = "Kids Goals";
        const msgText = aMsgs[0].text;
        const body = msgText.length > 80 ? msgText.slice(0, 77) + "…" : msgText;
        try {
          await messaging.send({
            token,
            notification: { title, body },
            data: {
              type: "message",
              familyId: familyId || "",
              kidId,
            },
            webpush: {
              notification: { title, body, icon: "/icons/icon-192x192.png" },
              fcmOptions: { link: "/" },
            },
          });
        } catch (err) {
          console.warn("FCM child message:", err?.message);
        }
      }

      // 5️⃣ NIÑO: Cuando se asigna una tarea nueva
      const bTaskIds = new Set(Object.keys(bCompletions));
      const aTaskIds = new Set(Object.keys(aCompletions));
      for (const taskIdStr of aTaskIds) {
        if (bTaskIds.has(taskIdStr)) continue; // Tarea no es nueva
        const taskId = parseInt(taskIdStr, 10);
        const taskName = getTaskName(tasks, taskId);
        const title = "Kids Goals";
        const body = `📝 Nueva tarea asignada: ${taskName}`;
        try {
          await messaging.send({
            token,
            notification: { title, body },
            data: {
              type: "newTask",
              familyId: familyId || "",
              kidId,
              taskId: String(taskId),
            },
            webpush: {
              notification: { title, body, icon: "/icons/icon-192x192.png" },
              fcmOptions: { link: "/" },
            },
          });
        } catch (err) {
          console.warn("FCM child newTask:", err?.message);
        }
      }

      // 6️⃣ NIÑO: Cuando se asigna un reto
      const bChallenges = beforeKids[kidId]?.challenges || {};
      const aChallenges = afterKids[kidId]?.challenges || {};
      for (const [chalIdStr, aChallenge] of Object.entries(aChallenges)) {
        const bChallenge = bChallenges[chalIdStr];
        if (bChallenge) continue; // Reto no es nuevo
        const challengeTitle = getChallengeTitle(challenges, parseInt(chalIdStr, 10));
        const title = "Kids Goals";
        const body = `🎯 Nuevo reto: ${challengeTitle}`;
        try {
          await messaging.send({
            token,
            notification: { title, body },
            data: {
              type: "newChallenge",
              familyId: familyId || "",
              kidId,
              challengeId: String(chalIdStr),
            },
            webpush: {
              notification: { title, body, icon: "/icons/icon-192x192.png" },
              fcmOptions: { link: "/" },
            },
          });
        } catch (err) {
          console.warn("FCM child newChallenge:", err?.message);
        }
      }

      // 7️⃣ NIÑO: Cuando se aprueba un reto
      for (const [chalIdStr, aChallenge] of Object.entries(aChallenges)) {
        if (!aChallenge.approved) continue;
        const bChallenge = bChallenges[chalIdStr];
        if (bChallenge?.approved) continue; // Ya estaba aprobado
        const challengeTitle = getChallengeTitle(challenges, parseInt(chalIdStr, 10));
        const title = "Kids Goals";
        const body = `¡Reto aprobado: ${challengeTitle}! ⭐`;
        try {
          await messaging.send({
            token,
            notification: { title, body },
            data: {
              type: "challengeApproved",
              familyId: familyId || "",
              kidId,
              challengeId: String(chalIdStr),
            },
            webpush: {
              notification: { title, body, icon: "/icons/icon-192x192.png" },
              fcmOptions: { link: "/" },
            },
          });
        } catch (err) {
          console.warn("FCM child challengeApproved:", err?.message);
        }
      }

      // 8️⃣ NIÑO: Cuando recibe un privilegio nuevo
      const bPrivileges = beforeKids[kidId]?.privileges || [];
      const aPrivileges = afterKids[kidId]?.privileges || [];
      if (aPrivileges.length > bPrivileges.length) {
        const newPriv = aPrivileges[aPrivileges.length - 1];
        if (newPriv?.name) {
          const title = "Kids Goals";
          const body = `🎁 Has ganado un privilegio: ${newPriv.name}`;
          try {
            await messaging.send({
              token,
              notification: { title, body },
              data: {
                type: "newPrivilege",
                familyId: familyId || "",
                kidId,
              },
              webpush: {
                notification: { title, body, icon: "/icons/icon-192x192.png" },
                fcmOptions: { link: "/" },
              },
            });
          } catch (err) {
            console.warn("FCM child newPrivilege:", err?.message);
          }
        }
      }
    }
  }
);
