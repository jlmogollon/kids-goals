import { ACHIEV, INIT_TASKS, STARS_PER_EURO, LEVELS, KID_COLORS } from "./constants";

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
  let current = LEVELS[0];
  for (const lv of LEVELS) {
    if (stars >= lv.min) current = lv;
  }
  return current;
}

export function getNextLevel(stars) {
  const idx = LEVELS.findIndex((lv) => stars < lv.min);
  if (idx <= 0) return LEVELS[1] ?? null;
  if (idx === -1) return null; // ya en el último nivel
  return LEVELS[idx];
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

/** Estrellas totales aprobadas (acumuladas). Usa approvedCompletions si existe. */
export function approvedStars(kid, tasks) {
  if (Array.isArray(kid.approvedCompletions) && kid.approvedCompletions.length > 0) {
    return kid.approvedCompletions.reduce((a, c) => a + (c.stars || 0), 0) + (kid.bonusStars || 0);
  }
  // Migración: datos antiguos sin approvedCompletions
  return (
    Object.entries(kid.completions || {})
      .filter(([, v]) => v.approved)
      .reduce((a, [tid, v]) => {
        const t = tasks.find((t) => t.id === parseInt(tid));
        const base = t?.stars || 0;
        const mult = v?.mult && v.mult > 1 ? v.mult : 1;
        return a + Math.ceil(base * mult);
      }, 0) + (kid.bonusStars || 0)
  );
}

/** Racha actual: días consecutivos (hacia atrás desde hoy) con al menos una tarea aprobada. */
export function computeStreak(kid) {
  const list = kid.approvedCompletions;
  if (!Array.isArray(list) || list.length === 0) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const dates = [...new Set(list.map((c) => (c.date || "").slice(0, 10)).filter(Boolean))].sort(
    (a, b) => b.localeCompare(a)
  );
  if (dates.length === 0) return 0;
  let streak = 0;
  const oneDay = 24 * 60 * 60 * 1000;
  let check = new Date(today);
  const checkStr = () => check.toISOString().slice(0, 10);
  while (dates.includes(checkStr())) {
    streak++;
    check = new Date(check.getTime() - oneDay);
  }
  return streak;
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
  return kid?.name || "Niño";
}
export function getKidColor(kidId, index) {
  return KID_COLORS[Math.abs(index ?? 0) % KID_COLORS.length];
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
    completions: {},   // taskId -> última completion (done/approved) para la UI
    approvedCompletions: [], // { taskId, date, stars } — historial para acumular estrellas y racha
    achievements: [],
    bonusStars: 0,
    spentStars: 0,     // stars spent on privileges
    stats: { totalDone:0, streak:0, musicDays:0, hygieneStreak:0, taskStreaks:{}, allToday:false, wishApproved:0, approvedStars:0 },
    profile: {
      grade: "",           // Nivel de estudios (ej: "2º ESO")
      strengths: "",       // Fortalezas (texto libre)
      focusAreas: "",      // Ámbitos a reforzar
    },
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
    screen: "auth",
    loggedAccount: null,
    actingAs: null,      // { role: 'father'|'mother'|'child', kidId?: string }
    activeKid: null,
    tasks: INIT_TASKS,
    tasksVersion: 0,
    rolePins: {},
    kids: {},
    parents: { father: { photo: null, name: "Papá", email: null }, mother: { photo: null, name: "Mamá", email: null } },
    notifications: [],
    approvalLog: [],
    challenges: [],
    weeklyGoal: { target: 40, current: 0 },
    childTab: "hoy",
    parentTab: "inicio",
    modal: null,
    toast: null,
    confetti: false,
    nextId: 200,
    parentFcmTokens: { father: null, mother: null },
  };
}

