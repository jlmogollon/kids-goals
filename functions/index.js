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

function getChallengeTitle(challenges, challengeId) {
  const ch = Array.isArray(challenges) ? challenges.find((c) => c.id === challengeId) : null;
  return ch?.title || "un reto";
}

function uniqTokens(list) {
  return [...new Set((Array.isArray(list) ? list : []).filter(Boolean))];
}

async function sendToTokens(messaging, tokens, payload, label) {
  for (const token of uniqTokens(tokens)) {
    try {
      await messaging.send({
        token,
        ...payload,
      });
    } catch (err) {
      console.warn(`${label}:`, err?.message || err);
    }
  }
}

export const notifyParentOnNewNotification = onDocumentUpdated(
  {
    document: "appData/{familyId}",
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
    const parentTokensList = uniqTokens([parentTokens.father, parentTokens.mother]);
    if (after.parentFcmToken && !parentTokensList.length) parentTokensList.push(after.parentFcmToken); // retrocompat

    const childTokens = after.childFcmTokens || {};
    const beforeKids = before.kids || {};
    const afterKids = after.kids || {};
    const kidIds = Object.keys(afterKids);

    // ══════════════════════════════════════════════════════════════
    // NOTIFICACIONES PARA PADRES
    // ══════════════════════════════════════════════════════════════

    // 1️⃣ PADRE: Cuando un niño completa una tarea o canjea un privilegio
    const notifs = Array.isArray(after.notifications) ? after.notifications : [];
    const beforeIds = mapNotificationIds(before.notifications);
    const newParentNotifs = notifs.filter((n) => !beforeIds.has(String(n?.id)));
    for (const latestNotif of newParentNotifs) {
      if (!parentTokensList.length) break;
      const kidName = latestNotif?.kidId ? (kids[latestNotif.kidId]?.name || kidNames[latestNotif.kidId] || "Tu hijo") : "Tu hijo";
      const taskName = getTaskName(tasks, latestNotif?.taskId);
      const title = "Kids Goals";
      const body = latestNotif?.type === "privilege"
        ? `🎁 ${kidName} ha canjeado un privilegio`
        : `✅ ${kidName} ha completado: ${taskName}. Ábrela para aprobar.`;
      await sendToTokens(messaging, parentTokensList, {
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
      }, "FCM parent notification");
    }

    const beforeTaskIds = new Set((Array.isArray(before.tasks) ? before.tasks : []).map((task) => String(task?.id)));
    for (const task of tasks) {
      const taskKey = String(task?.id);
      if (!taskKey || beforeTaskIds.has(taskKey)) continue;
      const title = "Kids Goals";
      const body = `📝 Nueva tarea: ${task?.name || "Nueva tarea"}`;
      for (const kidId of kidIds) {
        const token = childTokens[kidId];
        if (!token) continue;
        await sendToTokens(messaging, [token], {
          notification: { title, body },
          data: {
            type: "newTask",
            familyId: familyId || "",
            kidId,
            taskId: taskKey,
          },
          webpush: {
            notification: { title, body, icon: "/icons/icon-192x192.png" },
            fcmOptions: { link: "/" },
          },
        }, "FCM child newTask");
      }
    }

    const beforeChallenges = Array.isArray(before.challenges) ? before.challenges : [];
    const beforeChallengesById = new Map(beforeChallenges.map((challenge) => [String(challenge?.id), challenge]));
    for (const challenge of challenges) {
      const challengeKey = String(challenge?.id || "");
      if (!challengeKey) continue;

      const beforeChallenge = beforeChallengesById.get(challengeKey);
      if (!beforeChallenge) {
        const title = "Kids Goals";
        const challengeTitle = getChallengeTitle(challenges, challenge?.id);
        const body = `🎯 Nuevo reto: ${challengeTitle}`;
        await sendToTokens(messaging, [childTokens[challenge.kid1], childTokens[challenge.kid2]], {
          notification: { title, body },
          data: {
            type: "newChallenge",
            familyId: familyId || "",
            kidId: "",
            challengeId: challengeKey,
          },
          webpush: {
            notification: { title, body, icon: "/icons/icon-192x192.png" },
            fcmOptions: { link: "/" },
          },
        }, "FCM child newChallenge");
        continue;
      }

      if (!beforeChallenge?.winner && challenge?.winner) {
        const title = "Kids Goals";
        const challengeTitle = getChallengeTitle(challenges, challenge?.id);
        await sendToTokens(messaging, [childTokens[challenge.winner]], {
          notification: { title, body: `🏆 Ganaste el reto: ${challengeTitle}` },
          data: {
            type: "challengeApproved",
            familyId: familyId || "",
            kidId: challenge.winner,
            challengeId: challengeKey,
          },
          webpush: {
            notification: { title, body: `🏆 Ganaste el reto: ${challengeTitle}`, icon: "/icons/icon-192x192.png" },
            fcmOptions: { link: "/" },
          },
        }, "FCM child challengeApproved");
      }
    }

    // ══════════════════════════════════════════════════════════════
    // NOTIFICACIONES PARA NIÑOS
    // ══════════════════════════════════════════════════════════════

    if (Object.keys(childTokens).length === 0) return;

    for (const kidId of kidIds) {
      const token = childTokens[kidId];
      if (!token) continue;
      const bCompletions = beforeKids[kidId]?.completions || {};
      const aCompletions = afterKids[kidId]?.completions || {};

      // 2️⃣ NIÑO: Cuando se aprueba una tarea
      for (const [taskIdStr, aComp] of Object.entries(aCompletions)) {
        if (!aComp.approved) continue;
        const bComp = bCompletions[taskIdStr];
        if (bComp?.approved) continue; // Ya fue aprobada antes
        const taskName = getTaskName(tasks, parseInt(taskIdStr, 10));
        const who = aComp.approvedBy === "mother" ? "Mamá" : "Papá";
        const title = "Kids Goals";
        const body = `¡${who} ha aprobado: ${taskName}! ⭐`;
        await sendToTokens(messaging, [token], {
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
        }, "FCM child taskApproved");
      }

      // 3️⃣ NIÑO: Cuando se rechaza una tarea (se borra la completion)
      for (const [taskIdStr, bComp] of Object.entries(bCompletions)) {
        if (bComp.approved) continue; // No enviar si ya estaba aprobada
        if (taskIdStr in aCompletions) continue; // Aún existe
        const taskName = getTaskName(tasks, parseInt(taskIdStr, 10));
        const title = "Kids Goals";
        const body = `Tu tarea "${taskName}" fue rechazada. Puedes volver a intentarlo.`;
        await sendToTokens(messaging, [token], {
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
        }, "FCM child taskRejected");
      }

      // 4️⃣ NIÑO: Cuando recibe un mensaje de los padres
      const bMsgs = beforeKids[kidId]?.messages || [];
      const aMsgs = afterKids[kidId]?.messages || [];
      if (aMsgs.length > bMsgs.length && aMsgs[0]?.text) {
        const title = "Kids Goals";
        const msgText = aMsgs[0].text;
        const body = msgText.length > 80 ? msgText.slice(0, 77) + "…" : msgText;
        await sendToTokens(messaging, [token], {
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
        }, "FCM child message");
      }

      // 8️⃣ NIÑO: Cuando recibe un privilegio nuevo
      const bPrivileges = beforeKids[kidId]?.privileges || [];
      const aPrivileges = afterKids[kidId]?.privileges || [];
      if (aPrivileges.length > bPrivileges.length) {
        const newPriv = aPrivileges[aPrivileges.length - 1];
        if (newPriv?.name) {
          const title = "Kids Goals";
          const body = `🎁 Has ganado un privilegio: ${newPriv.name}`;
          await sendToTokens(messaging, [token], {
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
          }, "FCM child newPrivilege");
        }
      }
    }
  }
);
