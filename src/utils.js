import { ACHIEV, INIT_TASKS, STARS_PER_EURO } from "./constants";

export function getTodayIdx() {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

export function taskActiveOn(days, idx) {
  if (!days || days === "todos") return true;
  if (days === "lv") return idx <= 4;
  if (days === "sab") return idx === 5;
  if (days === "dom") return idx === 6;
  if (days === "finde") return idx >= 5;
  return true;
}

export function taskActiveToday(days) {
  return taskActiveOn(days, getTodayIdx());
}

export function calcAge(dob) {
  if (!dob) return null;
  const t = new Date();
  const b = new Date(dob);
  let a = t.getFullYear() - b.getFullYear();
  if (
    t.getMonth() - b.getMonth() < 0 ||
    (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())
  )
    a--;
  return a;
}

export function getLevel(stars) {
  // LEVELS se importa donde se use; aquí solo calculamos con ACHIEV si hace falta
  // pero en la app se sigue usando la versión original.
  return stars;
}

export function getNextLevel(stars) {
  return stars;
}

export function getStreakMult(streak) {
  if (streak >= 7) return 2;
  if (streak >= 5) return 1.5;
  return 1;
}

export function fmt(d) {
  return new Date(d).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
  });
}

export function isToday(dateStr) {
  if (!dateStr) return false;
  // Valores antiguos guardaban solo la hora local (ej: "10:23:00"),
  // que el navegador interpreta siempre como "hoy". Para no arrastrar
  // tareas de días anteriores, si no hay fecha (YYYY-MM-DD) devolvemos false.
  if (typeof dateStr === "string" && !dateStr.includes("-")) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

export function approvedStars(kid, tasks) {
  return (
    Object.entries(kid.completions)
      .filter(([, v]) => v.approved)
      .reduce((a, [tid, v]) => {
        const t = tasks.find((t) => t.id === parseInt(tid));
        const base = t?.stars || 0;
        const mult = v?.mult && v.mult > 1 ? v.mult : 1;
        return a + Math.ceil(base * mult);
      }, 0) + kid.bonusStars
  );
}

export function availableStars(kid, tasks) {
  return approvedStars(kid, tasks) - kid.spentStars;
}

export function pendingStars(kid, tasks) {
  return Object.entries(kid.completions)
    .filter(([, v]) => v.done && !v.approved)
    .reduce((a, [tid]) => {
      const t = tasks.find((t) => t.id === parseInt(tid));
      return a + (t?.stars || 0);
    }, 0);
}

export function totalEuros(kid, tasks) {
  return Math.floor(approvedStars(kid, tasks) / STARS_PER_EURO);
}

export function paidOut(kid) {
  return kid.payments.reduce((a, p) => a + p.amount, 0);
}

export function balance(kid, tasks) {
  return totalEuros(kid, tasks) - paidOut(kid);
}

export function kidName(kid, id) {
  return kid?.name || (id === "jose" ? "José" : "David");
}

export function checkNewAchievements(kid, tasks) {
  const as = approvedStars(kid, tasks);
  const s = { ...kid.stats, approvedStars: as };
  return ACHIEV.filter(
    (a) => !kid.achievements.includes(a.id) && a.check(s)
  );
}

export function mkKid(name, dob) {
  return {
    name,
    dob,
    photo: null,
    completions: {},   // taskId -> { done, approved, evidence, date, photoUrl }
    achievements: [],
    bonusStars: 0,
    spentStars: 0,     // stars spent on privileges
    stats: { totalDone:0, streak:0, musicDays:0, hygieneStreak:0, taskStreaks:{}, allToday:false, wishApproved:0, approvedStars:0 },
    payments: [],      // { id, amount, note, date }
    wishlist: [],      // { id, name, cost, emoji, approved, denied }
    privileges: [],    // { id, item, date }
    gratitude: [],     // { date, text }
    weeklyGoal: null,  // { target, stars }
    activityLog: {},   // "YYYY-MM-DD" -> { done, total }
    messages: [],      // { from, text, date, read }
    challenges: [],    // { id, opponentId, taskId, myCount, theirCount, deadline, winner }
  };
}

export function initState() {
  return {
    screen: "auth",    // auth | welcome | child | parent
    loggedAccount: null,
    activeKid: null,
    tasks: INIT_TASKS,
    kids: {
      jose:  mkKid("José",  "2013-06-15"),
      david: mkKid("David", "2016-09-22"),
    },
    parents: { father: { photo: null, name: "Papá" }, mother: { photo: null, name: "Mamá" } },
    notifications: [],
    approvalLog: [],
    challenges: [],
    weeklyGoal: { target: 40, current: 0 },
    // UI
    childTab: "hoy",
    parentTab: "notifs",
    modal: null,
    toast: null,
    confetti: false,
    nextId: 200,
    parentFcmTokens: { father: null, mother: null },
  };
}

