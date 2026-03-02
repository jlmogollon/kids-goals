/**
 * Cloud Function: cuando un niño registra algo → push al padre.
 * Cuando el padre aprueba o rechaza una tarea → push al niño.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

initializeApp();

const db = getFirestore();
const kidNames = { jose: "José", david: "David" };

function getTaskName(tasks, taskId) {
  const task = Array.isArray(tasks) ? tasks.find((t) => t.id === taskId) : null;
  return task?.name || "una tarea";
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

    const tasks = Array.isArray(after.tasks) ? after.tasks : [];
    const kids = after.kids || {};
    const messaging = getMessaging();

    // ── 1) Push a AMBOS PADRES cuando hay nueva notificación (niño completó algo) ──
    const parentTokens = after.parentFcmTokens || {};
    const tokensToNotify = [parentTokens.father, parentTokens.mother].filter(Boolean);
    if (after.parentFcmToken && !tokensToNotify.length) tokensToNotify.push(after.parentFcmToken); // retrocompat
    const notifs = Array.isArray(after.notifications) ? after.notifications : [];
    const prevCount = Array.isArray(before.notifications) ? before.notifications.length : 0;
    if (tokensToNotify.length > 0 && notifs.length > prevCount) {
      const latest = notifs[0];
      const kidName = latest?.kidId ? (kids[latest.kidId]?.name || kidNames[latest.kidId] || "Tu hijo") : "Tu hijo";
      const taskName = getTaskName(tasks, latest?.taskId);
      const title = "Kids Goals";
      const body =
        latest?.type === "privilege"
          ? `${kidName} ha canjeado un privilegio`
          : `${kidName} ha completado: ${taskName}. Ábrela para aprobar.`;
      for (const token of tokensToNotify) {
        try {
          await messaging.send({
            token,
            notification: { title, body },
            webpush: { notification: { title, body, icon: "/icons/icon-192x192.png" } },
          });
        } catch (err) {
          console.warn("FCM parent:", err?.message);
        }
      }
    }

    // ── 2) Push al NIÑO cuando el padre aprueba o rechaza una tarea ──
    const fcmSnap = await db.doc("appData/fcmTokens").get();
    const childTokens = fcmSnap.exists ? fcmSnap.data() : {};
    if (Object.keys(childTokens).length === 0) return;

    const beforeKids = before.kids || {};
    const afterKids = after.kids || {};
    for (const kidId of ["jose", "david"]) {
      const token = childTokens[kidId];
      if (!token) continue;
      const bCompletions = beforeKids[kidId]?.completions || {};
      const aCompletions = afterKids[kidId]?.completions || {};
      const kidName = kidNames[kidId];

      // Aprobación: en after hay approved: true y en before no
      for (const [taskIdStr, aComp] of Object.entries(aCompletions)) {
        if (!aComp.approved) continue;
        const bComp = bCompletions[taskIdStr];
        if (bComp?.approved) continue;
        const taskName = getTaskName(tasks, parseInt(taskIdStr, 10));
        const who = aComp.approvedBy === "mother" ? "Mamá" : "Papá";
        const title = "Kids Goals";
        const body = `¡${who} ha aprobado: ${taskName}! ⭐`;
        try {
          await messaging.send({
            token,
            notification: { title, body },
            webpush: { notification: { title, body, icon: "/icons/icon-192x192.png" } },
          });
        } catch (err) {
          console.warn("FCM child approve:", err?.message);
        }
      }

      // Rechazo: en before había completion con done y no aprobada; en after ya no está
      for (const [taskIdStr, bComp] of Object.entries(bCompletions)) {
        if (!bComp.done || bComp.approved) continue;
        if (taskIdStr in aCompletions) continue;
        const taskName = getTaskName(tasks, parseInt(taskIdStr, 10));
        const title = "Kids Goals";
        const body = `Tu tarea "${taskName}" fue rechazada. Puedes volver a intentarlo.`;
        try {
          await messaging.send({
            token,
            notification: { title, body },
            webpush: { notification: { title, body, icon: "/icons/icon-192x192.png" } },
          });
        } catch (err) {
          console.warn("FCM child reject:", err?.message);
        }
      }
    }
  }
);
