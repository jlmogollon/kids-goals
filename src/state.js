import { PRIVILEGES, AVATAR_ITEMS } from "./constants";
import {
  availableStars,
  approvedStars,
  checkNewAchievements,
  computeStreak,
  fmt,
  getLevel,
  getNextLevel,
  getStreakMult,
  isToday,
  kidName,
} from "./utils";

export function reducer(st, a) {
  switch (a.type) {
    case "AUTH_LOGIN":
      return {
        ...st,
        screen:
          a.account.role === "father" ||
          a.account.role === "mother" ||
          a.account.role === "parent"
            ? "parent"
            : "child",
        loggedAccount: a.account,
        activeKid: a.account.kidId || null,
        actingAs:
          a.account.role === "father" || a.account.role === "mother"
            ? { role: a.account.role }
            : { role: "child", kidId: a.account.kidId },
      };
    case "AUTH_LOGOUT":
      // El estado inicial y la pantalla se gestionan en App.jsx al hacer logout
      return st;
    case "SET_ONBOARDING_STEP":
      return { ...st, onboardingStep: a.step };
    case "ONBOARDING_FINISH":
      return { ...a.state };
    case "SET_ACTING_AS":
      return {
        ...st,
        actingAs: a.actingAs,
        screen: a.screen || st.screen,
        activeKid: a.activeKid !== undefined ? a.activeKid : st.activeKid,
      };
    case "NAV":
      return { ...st, screen: a.screen, activeKid: a.kid || st.activeKid };
    case "SET_CHILD_TAB":
      return { ...st, childTab: a.tab };
    case "SET_PARENT_TAB":
      return { ...st, parentTab: a.tab };
    case "REORDER_KIDS": {
      const ids = Object.keys(st.kids || {});
      if (!ids.length) return st;
      const current = st.kidsOrder && st.kidsOrder.length
        ? st.kidsOrder.filter((id) => st.kids[id])
        : ids;
      const from = a.fromIndex;
      const to = a.toIndex;
      if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length) {
        return st;
      }
      const nextOrder = [...current];
      const [moved] = nextOrder.splice(from, 1);
      nextOrder.splice(to, 0, moved);
      return { ...st, kidsOrder: nextOrder };
    }
    case "OPEN_MODAL":
      return { ...st, modal: a.modal };
    case "CLOSE_MODAL":
      return { ...st, modal: null };
    case "CLEAR_TOAST":
      return { ...st, toast: null };
    case "CLEAR_CONFETTI":
      return { ...st, confetti: false };
    case "TOAST":
      return { ...st, toast: a.msg };

    case "SET_KID_PHOTO":
      return {
        ...st,
        kids: {
          ...st.kids,
          [a.kidId]: { ...st.kids[a.kidId], photo: a.photo },
        },
      };
    case "SET_PARENT_PHOTO":
      return {
        ...st,
        parents: {
          ...st.parents,
          [a.parentRole]: {
            ...st.parents[a.parentRole],
            photo: a.photo,
          },
        },
      };
    case "SET_KID_INFO": {
      const kid = st.kids[a.kidId];
      return {
        ...st,
        kids: {
          ...st.kids,
          [a.kidId]: {
            ...kid,
            ...(a.name !== undefined && { name: a.name }),
            ...(a.dob !== undefined && { dob: a.dob }),
            ...(a.email !== undefined && { email: a.email }),
            profile: {
              ...(kid.profile || {}),
              grade:
                a.grade !== undefined
                  ? a.grade
                  : kid.profile?.grade || "",
              strengths:
                a.strengths !== undefined
                  ? a.strengths
                  : kid.profile?.strengths || "",
              focusAreas:
                a.focusAreas !== undefined
                  ? a.focusAreas
                  : kid.profile?.focusAreas || "",
            },
          },
        },
      };
    }
    case "SET_PARENT_NAME":
      return {
        ...st,
        parents: {
          ...st.parents,
          [a.parentRole]: {
            ...st.parents[a.parentRole],
            name: a.name,
          },
        },
      };
    case "SET_PARENT_EMAIL":
      return {
        ...st,
        parents: {
          ...st.parents,
          [a.parentRole]: {
            ...st.parents[a.parentRole],
            email: a.email,
          },
        },
      };
    case "SET_FLASH_CHALLENGES":
      return {
        ...st,
        flashChallenges: Array.isArray(a.list) ? a.list : st.flashChallenges,
      };
    case "SET_PRIVILEGES":
      return {
        ...st,
        privileges: Array.isArray(a.list) ? a.list : st.privileges,
      };
    case "SET_ACHIEV_OVERRIDES":
      return {
        ...st,
        achievOverrides: Array.isArray(a.list) && a.list.length ? a.list : null,
      };
    case "SET_PARENT_FCM_TOKEN":
      return {
        ...st,
        parentFcmTokens: {
          ...st.parentFcmTokens,
          [a.parentRole]: a.token,
        },
      };

    case "COMPLETE_TASK": {
      const { kidId, taskId } = a;
      const kidPrev0 = st.kids[kidId];
      const existing = kidPrev0?.completions?.[taskId];
      if (existing?.done && isToday(existing.date)) return st;
      const task = st.tasks.find((t) => t.id === taskId);
      const mult = getStreakMult(kidPrev0.stats.streak || 0);
      const comp = {
        done: true,
        approved: false,
        evidence: null,
        photoUrl: null,
        date: new Date().toISOString(),
        mult,
      };
      const dateKey = new Date().toISOString().slice(0, 10);
      const time = new Date().toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const kidPrev = kidPrev0;
      const dayLog = kidPrev.activityLog?.[dateKey] || [];
      const entry = {
        id: Date.now(),
        type: "taskDone",
        taskId,
        taskName: task?.name,
        time,
      };
      const newKid = {
        ...kidPrev,
        completions: { ...kidPrev.completions, [taskId]: comp },
        stats: {
          ...kidPrev.stats,
          totalDone: (kidPrev.stats.totalDone || 0) + 1,
        },
        activityLog: {
          ...(kidPrev.activityLog || {}),
          [dateKey]: [entry, ...dayLog],
        },
      };
      const notif = {
        id: Date.now(),
        kidId,
        taskId,
        time: new Date().toLocaleTimeString("es-ES"),
        read: false,
        type: "task",
      };
      return {
        ...st,
        kids: { ...st.kids, [kidId]: newKid },
        notifications: [notif, ...st.notifications],
        toast: `✅ ${task?.name} enviada para aprobación`,
      };
    }

    case "COMPLETE_DAILY_FLASH": {
      const { kidId, stars, text } = a;
      const kidPrev = st.kids[kidId];
      if (!kidPrev) return st;
      const today = new Date().toISOString().slice(0, 10);
      const last = kidPrev.stats?.lastFlashDate || null;
      if (last === today) {
        return {
          ...st,
          toast: "🎲 Ya has hecho el reto sorpresa de hoy",
        };
      }
      const dateKey = today;
      const time = new Date().toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const dayLog = kidPrev.activityLog?.[dateKey] || [];
      const entry = {
        id: Date.now(),
        type: "dailyFlash",
        text,
        stars,
        time,
      };
      const kid = {
        ...kidPrev,
        bonusStars: (kidPrev.bonusStars || 0) + stars,
        stats: {
          ...kidPrev.stats,
          lastFlashDate: today,
        },
        activityLog: {
          ...(kidPrev.activityLog || {}),
          [dateKey]: [entry, ...dayLog],
        },
      };
      return {
        ...st,
        kids: { ...st.kids, [kidId]: kid },
        confetti: true,
        toast: `🎲 +${stars}⭐ por completar el reto sorpresa`,
      };
    }

    case "SUBMIT_EVIDENCE": {
      const { kidId, taskId, evidence, photoUrl } = a;
      const comp = {
        ...st.kids[kidId].completions[taskId],
        evidence,
        photoUrl,
      };
      return {
        ...st,
        kids: {
          ...st.kids,
          [kidId]: {
            ...st.kids[kidId],
            completions: {
              ...st.kids[kidId].completions,
              [taskId]: comp,
            },
          },
        },
        modal: null,
        toast: "📤 Evidencia enviada a papá/mamá",
      };
    }

    case "APPROVE_TASK": {
      const { kidId, taskId, notifId, message, approvedBy } = a;
      const task = st.tasks.find((t) => t.id === taskId);
      const comp = {
        ...st.kids[kidId].completions[taskId],
        approved: true,
        evidence: null,
        photoUrl: null,
        approvedBy: approvedBy || "parent",
      };
      const effStars = Math.ceil(
        (task?.stars || 0) *
          (comp.mult && comp.mult > 1 ? comp.mult : 1),
      );
      const kidPrev = st.kids[kidId];
      const dateKey = new Date().toISOString().slice(0, 10);
      const approvedCompletions = [
        ...(kidPrev.approvedCompletions || []),
        { taskId, date: dateKey, stars: effStars },
      ];
      let kid = {
        ...kidPrev,
        completions: {
          ...kidPrev.completions,
          [taskId]: comp,
        },
        approvedCompletions,
        stats: {
          ...kidPrev.stats,
          streak: computeStreak({
            ...kidPrev,
            approvedCompletions,
          }),
        },
      };
      if (message) {
        kid = {
          ...kid,
          messages: [
            {
              id: Date.now(),
              from: "parent",
              text: message,
              date: new Date().toLocaleTimeString("es-ES"),
              read: false,
            },
            ...kid.messages,
          ],
        };
      }
      const newAch = checkNewAchievements(kid, st.tasks);
      let bonusAdded = 0;
      let achToast = "";
      if (newAch.length > 0) {
        bonusAdded = newAch.reduce((acc, b) => acc + b.bonus, 0);
        kid = {
          ...kid,
          achievements: [
            ...kid.achievements,
            ...newAch.map((a) => a.id),
          ],
          bonusStars: kid.bonusStars + bonusAdded,
        };
        achToast = ` 🏅 ¡${newAch[0].label}! +${bonusAdded}⭐`;
      }
      const time = new Date().toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const dayLog = kid.activityLog?.[dateKey] || [];
      const entry = {
        id: Date.now(),
        type: "taskApproved",
        taskId,
        taskName: task?.name,
        stars: effStars,
        time,
      };
      kid = {
        ...kid,
        activityLog: {
          ...(kid.activityLog || {}),
          [dateKey]: [entry, ...dayLog],
        },
      };
      const newNotifs = st.notifications.map((n) =>
        n.id === notifId ? { ...n, read: true } : n,
      );
      const logEntry = {
        id: Date.now(),
        kidId,
        taskId,
        taskName: task?.name,
        stars: effStars,
        date: new Date().toLocaleDateString("es-ES"),
        approved: true,
        approvedBy: approvedBy || "parent",
      };
      return {
        ...st,
        kids: { ...st.kids, [kidId]: kid },
        notifications: newNotifs,
        confetti: true,
        approvalLog: [logEntry, ...st.approvalLog],
        toast: `⭐ +${effStars}${
          bonusAdded > 0 ? `+${bonusAdded}bonus` : ""
        } estrellas para ${kidName(st.kids[kidId], kidId)}!${achToast}`,
      };
    }

    case "REJECT_TASK": {
      const { kidId, taskId, notifId, rejectedBy, message } = a;
      const task = st.tasks.find((t) => t.id === taskId);
      const comp = { ...st.kids[kidId].completions };
      delete comp[taskId];
      const newNotifs = st.notifications.filter(
        (n) => n.id !== notifId,
      );
      const whoRej = rejectedBy === "mother" ? "Mamá" : "Papá";
      let kid = { ...st.kids[kidId], completions: comp };
      if (message && message.trim()) {
        const msgText = `${whoRej} rechazó "${
          task?.name || "la tarea"
        }": ${message.trim()}`;
        kid = {
          ...kid,
          messages: [
            {
              id: Date.now(),
              from: "parent",
              text: msgText,
              date: new Date().toLocaleTimeString("es-ES"),
              read: false,
            },
            ...kid.messages,
          ],
        };
      }
      const logEntry = {
        id: Date.now(),
        kidId,
        taskId,
        taskName: task?.name,
        date: new Date().toLocaleDateString("es-ES"),
        approved: false,
        rejectedBy: rejectedBy || "parent",
      };
      return {
        ...st,
        kids: { ...st.kids, [kidId]: kid },
        notifications: newNotifs,
        approvalLog: [logEntry, ...st.approvalLog],
        modal: null,
        toast: "❌ Tarea rechazada",
      };
    }

    case "ADD_TASK":
      return {
        ...st,
        tasks: [...st.tasks, { ...a.task, id: st.nextId }],
        nextId: st.nextId + 1,
        modal: null,
        toast: `✅ Tarea "${a.task.name}" creada`,
        tasksVersion: (st.tasksVersion || 0) + 1,
      };
    case "EDIT_TASK":
      return {
        ...st,
        tasks: st.tasks.map((t) =>
          t.id === a.task.id ? a.task : t,
        ),
        modal: null,
        toast: "✅ Tarea actualizada",
        tasksVersion: (st.tasksVersion || 0) + 1,
      };
    case "DELETE_TASK":
      return {
        ...st,
        tasks: st.tasks.filter((t) => t.id !== a.taskId),
        modal: null,
        toast: "🗑️ Tarea eliminada",
        tasksVersion: (st.tasksVersion || 0) + 1,
      };
    case "SET_ROLE_PIN":
      return {
        ...st,
        rolePins: { ...(st.rolePins || {}), [a.roleKey]: a.pin },
      };
    case "RESET_ROLE_PIN":
      return {
        ...st,
        rolePins: { ...(st.rolePins || {}), [a.roleKey]: null },
      };

    case "ADD_PAYMENT": {
      const p = {
        id: Date.now(),
        amount: a.amount,
        note: a.note,
        date: new Date().toLocaleDateString("es-ES"),
      };
      const dateKey = new Date().toISOString().slice(0, 10);
      const time = new Date().toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const kidPrev = st.kids[a.kidId];
      const dayLog = kidPrev.activityLog?.[dateKey] || [];
      const entry = {
        id: Date.now(),
        type: "payment",
        amount: a.amount,
        note: a.note,
        time,
      };
      const kid = {
        ...kidPrev,
        payments: [...kidPrev.payments, p],
        activityLog: {
          ...(kidPrev.activityLog || {}),
          [dateKey]: [entry, ...dayLog],
        },
      };
      return {
        ...st,
        kids: { ...st.kids, [a.kidId]: kid },
        modal: null,
        toast: `💶 Entregado ${a.amount}€ a ${kidName(
          st.kids[a.kidId],
          a.kidId,
        )}`,
      };
    }

    case "ADD_WISH": {
      const w = {
        id: Date.now(),
        name: a.name,
        cost: a.cost,
        emoji: a.emoji,
        approved: false,
        denied: false,
      };
      const dateKey = new Date().toISOString().slice(0, 10);
      const time = new Date().toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const kidPrev = st.kids[a.kidId];
      const dayLog = kidPrev.activityLog?.[dateKey] || [];
      const entry = {
        id: Date.now(),
        type: "wishAdded",
        name: a.name,
        cost: a.cost,
        time,
      };
      const kid = {
        ...kidPrev,
        wishlist: [...kidPrev.wishlist, w],
        activityLog: {
          ...(kidPrev.activityLog || {}),
          [dateKey]: [entry, ...dayLog],
        },
      };
      return {
        ...st,
        kids: { ...st.kids, [a.kidId]: kid },
        modal: null,
        toast: "🌠 Deseo añadido a tu lista",
      };
    }
    case "APPROVE_WISH": {
      const wl = st.kids[a.kidId].wishlist.map((w) =>
        w.id === a.wishId ? { ...w, approved: true } : w,
      );
      const dateKey = new Date().toISOString().slice(0, 10);
      const time = new Date().toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const kidPrev = st.kids[a.kidId];
      const wish = kidPrev.wishlist.find(
        (w) => w.id === a.wishId,
      );
      const dayLog = kidPrev.activityLog?.[dateKey] || [];
      const entry = {
        id: Date.now(),
        type: "wishApproved",
        name: wish?.name,
        cost: wish?.cost,
        time,
      };
      const kid = {
        ...kidPrev,
        wishlist: wl,
        stats: {
          ...kidPrev.stats,
          wishApproved: (kidPrev.stats.wishApproved || 0) + 1,
        },
        activityLog: {
          ...(kidPrev.activityLog || {}),
          [dateKey]: [entry, ...dayLog],
        },
      };
      return {
        ...st,
        kids: { ...st.kids, [a.kidId]: kid },
        modal: null,
        toast: "✅ ¡Deseo aprobado!",
      };
    }
    case "DENY_WISH": {
      const wl = st.kids[a.kidId].wishlist.map((w) =>
        w.id === a.wishId ? { ...w, denied: true } : w,
      );
      const dateKey = new Date().toISOString().slice(0, 10);
      const time = new Date().toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const kidPrev = st.kids[a.kidId];
      const wish = kidPrev.wishlist.find(
        (w) => w.id === a.wishId,
      );
      const dayLog = kidPrev.activityLog?.[dateKey] || [];
      const entry = {
        id: Date.now(),
        type: "wishDenied",
        name: wish?.name,
        cost: wish?.cost,
        time,
      };
      const kid = {
        ...kidPrev,
        wishlist: wl,
        activityLog: {
          ...(kidPrev.activityLog || {}),
          [dateKey]: [entry, ...dayLog],
        },
      };
      return {
        ...st,
        kids: { ...st.kids, [a.kidId]: kid },
        modal: null,
        toast: "❌ Deseo denegado",
      };
    }

    case "REDEEM_PRIVILEGE": {
      const list = st.privileges || PRIVILEGES;
      const priv = list.find((p) => p.id === a.privId);
      if (!priv) return st;
      const kid = st.kids[a.kidId];
      if (availableStars(kid, st.tasks) < priv.cost)
        return {
          ...st,
          toast: "⭐ No tienes suficientes estrellas",
        };
      const dateKey = new Date().toISOString().slice(0, 10);
      const time = new Date().toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const dayLog = kid.activityLog?.[dateKey] || [];
      const entry = {
        id: Date.now(),
        type: "privilege",
        name: priv.name,
        cost: priv.cost,
        time,
      };
      const newKid = {
        ...kid,
        spentStars: kid.spentStars + priv.cost,
        privileges: [
          ...kid.privileges,
          {
            id: Date.now(),
            item: priv,
            date: new Date().toLocaleDateString("es-ES"),
          },
        ],
        activityLog: {
          ...(kid.activityLog || {}),
          [dateKey]: [entry, ...dayLog],
        },
      };
      const notif = {
        id: Date.now(),
        kidId: a.kidId,
        type: "privilege",
        privName: priv.name,
        time: new Date().toLocaleTimeString("es-ES"),
        read: false,
      };
      return {
        ...st,
        kids: { ...st.kids, [a.kidId]: newKid },
        notifications: [notif, ...st.notifications],
        modal: null,
        confetti: true,
        toast: `🎉 ¡Canjeado: ${priv.name}!`,
      };
    }

    case "REDEEM_AVATAR_ITEM": {
      const item = AVATAR_ITEMS.find((p) => p.id === a.itemId);
      if (!item) return st;
      const kidPrev = st.kids[a.kidId];
      if (!kidPrev) return st;
      const currentItems = kidPrev.avatar?.items || [];
      // Ya lo tiene
      if (currentItems.includes(item.id)) {
        return {
          ...st,
          toast: "👕 Ya tienes este accesorio",
        };
      }
      if (availableStars(kidPrev, st.tasks) < item.cost) {
        return {
          ...st,
          toast: "⭐ No tienes suficientes estrellas",
        };
      }
      const dateKey = new Date().toISOString().slice(0, 10);
      const time = new Date().toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const dayLog = kidPrev.activityLog?.[dateKey] || [];
      const entry = {
        id: Date.now(),
        type: "avatarItem",
        name: item.name,
        cost: item.cost,
        time,
      };
      const avatar = {
        items: [...currentItems, item.id],
        equipped: kidPrev.avatar?.equipped || item.id,
      };
      const kid = {
        ...kidPrev,
        spentStars: kidPrev.spentStars + item.cost,
        avatar,
        activityLog: {
          ...(kidPrev.activityLog || {}),
          [dateKey]: [entry, ...dayLog],
        },
      };
      return {
        ...st,
        kids: { ...st.kids, [a.kidId]: kid },
        modal: null,
        confetti: true,
        toast: `🧢 Nuevo accesorio: ${item.name}`,
      };
    }

    case "EQUIP_AVATAR_ITEM": {
      const kidPrev = st.kids[a.kidId];
      if (!kidPrev) return st;
      const items = kidPrev.avatar?.items || [];
      if (!items.includes(a.itemId)) return st;
      const avatar = {
        items,
        equipped: a.itemId,
      };
      const kid = {
        ...kidPrev,
        avatar,
      };
      return {
        ...st,
        kids: { ...st.kids, [a.kidId]: kid },
        toast: "👕 Avatar actualizado",
      };
    }

    case "ADD_GRATITUDE": {
      const g = {
        id: Date.now(),
        date: new Date().toLocaleDateString("es-ES"),
        text: a.text,
      };
      const dateKey = new Date().toISOString().slice(0, 10);
      const time = new Date().toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const kidPrev = st.kids[a.kidId];
      const dayLog = kidPrev.activityLog?.[dateKey] || [];
      const entry = {
        id: Date.now(),
        type: "gratitude",
        text: a.text,
        time,
      };
      const kid = {
        ...kidPrev,
        gratitude: [g, ...kidPrev.gratitude],
        activityLog: {
          ...(kidPrev.activityLog || {}),
          [dateKey]: [entry, ...dayLog],
        },
      };
      return {
        ...st,
        kids: { ...st.kids, [a.kidId]: kid },
        modal: null,
        toast: "📝 Gratitud guardada ❤️",
      };
    }

    case "SEND_MESSAGE": {
      const msg = {
        id: Date.now(),
        from: "parent",
        text: a.text,
        date: new Date().toLocaleTimeString("es-ES"),
        read: false,
      };
      const dateKey = new Date().toISOString().slice(0, 10);
      const time = msg.date;
      const kidPrev = st.kids[a.kidId];
      const dayLog = kidPrev.activityLog?.[dateKey] || [];
      const entry = {
        id: Date.now(),
        type: "message",
        text: a.text,
        time,
      };
      const kid = {
        ...kidPrev,
        messages: [msg, ...kidPrev.messages],
        activityLog: {
          ...(kidPrev.activityLog || {}),
          [dateKey]: [entry, ...dayLog],
        },
      };
      return {
        ...st,
        kids: { ...st.kids, [a.kidId]: kid },
        modal: null,
        toast: `💬 Mensaje enviado a ${kidName(
          st.kids[a.kidId],
          a.kidId,
        )}`,
      };
    }
    case "READ_MESSAGES": {
      const msgs = st.kids[a.kidId].messages.map((m) => ({
        ...m,
        read: true,
      }));
      return {
        ...st,
        kids: {
          ...st.kids,
          [a.kidId]: {
            ...st.kids[a.kidId],
            messages: msgs,
          },
        },
      };
    }
    case "EDIT_MESSAGE": {
      const msgs = st.kids[a.kidId].messages.map((m) =>
        m.id === a.messageId ? { ...m, text: a.text } : m,
      );
      return {
        ...st,
        kids: {
          ...st.kids,
          [a.kidId]: {
            ...st.kids[a.kidId],
            messages: msgs,
          },
        },
        modal: null,
        toast: "✅ Mensaje actualizado",
      };
    }
    case "DELETE_MESSAGE": {
      const msgs = st.kids[a.kidId].messages.filter(
        (m) => m.id !== a.messageId,
      );
      return {
        ...st,
        kids: {
          ...st.kids,
          [a.kidId]: {
            ...st.kids[a.kidId],
            messages: msgs,
          },
        },
        modal: null,
        toast: "🗑️ Mensaje eliminado",
      };
    }

    case "ADD_CHALLENGE": {
      const ch = {
        id: Date.now(),
        ...a.challenge,
        myCount: 0,
        theirCount: 0,
        winner: null,
      };
      return {
        ...st,
        challenges: [...st.challenges, ch],
        modal: null,
        toast: "⚔️ ¡Reto creado!",
      };
    }

    default:
      return st;
  }
}

