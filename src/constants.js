export const TH = {
  parent: { p:"#FFB800", a:"#CC8800", l:"#FFFBEA", d:"#996600" },
};
// Colores por índice para hijos (se asigna al crear)
export const KID_COLORS = [
  { p:"#8DC63F", a:"#5A9A20", l:"#F0FAE6", d:"#3A6A10" },
  { p:"#5BC8F5", a:"#1FA8DE", l:"#EBF8FF", d:"#0D7FAD" },
  { p:"#FF85C2", a:"#E91E8C", l:"#FFE6F2", d:"#AD1457" },
  { p:"#A78BFA", a:"#7C3AED", l:"#EDE9FE", d:"#5B21B6" },
  { p:"#FF8C42", a:"#EA580C", l:"#FFEDD5", d:"#C2410C" },
];
export const RELATIONSHIP_LABELS = ["Hijo", "Hija", "Sobrino", "Sobrina", "Primo", "Prima", "Otro"];

export const PALETTE = {
  error:"#C62828",
  primaryDark:"#2D5010",
  primaryMuted:"#4A7A1E",
  gold:"#CC8800",
  goldLight:"#FFF3CC",
  text:"#1a1a1a",
  textSec:"#555",
  muted:"#888",
  border:"#f0f0f0",
  borderLight:"#e8e8e8",
};

export const CAT_CLR = {
  espiritual:"#FF85C2",
  musica:"#8DC63F",
  colegio:"#5BC8F5",
  higiene:"#A78BFA",
  hogar:"#FFB800",
  mente:"#FF8C42",
};

export const STARS_PER_EURO = 30;

export const LEVELS = [
  { name:"Aprendiz",   min:0,   icon:"🌱", color:"#8DC63F" },
  { name:"Explorador", min:30,  icon:"🧭", color:"#5BC8F5" },
  { name:"Héroe",      min:90,  icon:"🦸", color:"#FFB800" },
  { name:"Leyenda",    min:200, icon:"👑", color:"#FF85C2" },
];

export const DAY_LABELS = {
  todos:"Todos los días",
  lv:"Lun – Vie",
  sab:"Sábado",
  dom:"Domingo",
};

export const DAY_SHORT  = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
export const DAY_FULL   = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

export const DEMO_ACCOUNTS = [
  { id:"acc_papa",  name:"Papá",  email:"papa@icloud.com",  role:"parent", isMinor:false, avatar:"👨" },
  { id:"acc_mama",  name:"Mamá",  email:"mama@icloud.com",  role:"parent", isMinor:false, avatar:"👩" },
  { id:"acc_jose",  name:"José",  email:"jose@icloud.com",  role:"child",  kidId:"jose", isMinor:true,  dob:"2013-06-15", avatar:"👦🏻" },
  { id:"acc_david", name:"David", email:"david@icloud.com", role:"child",  kidId:"david",isMinor:true,  dob:"2016-09-22", avatar:"👦" },
];

export const ACHIEV = [
  { id:"first",       label:"Primera misión",       desc:"Completa tu primera tarea",     emoji:"🌟", bonus:1, diff:1, check:s=>s.totalDone>=1       },
  { id:"streak3",     label:"En racha",             desc:"3 días seguidos",               emoji:"🔥", bonus:1, diff:1, check:s=>s.streak>=3           },
  { id:"tasks10",     label:"Decena de oro",        desc:"10 tareas completadas",         emoji:"🥉", bonus:1, diff:1, check:s=>s.totalDone>=10       },
  { id:"allToday",    label:"Día perfecto",         desc:"Todas las tareas de hoy",       emoji:"✨", bonus:2, diff:2, check:s=>s.allToday            },
  { id:"bible7",      label:"Lector fiel",          desc:"Biblia 7 días seguidos",        emoji:"📖", bonus:2, diff:2, check:s=>(s.taskStreaks?.[1]||0)>=7 },
  { id:"music5",      label:"Músico dedicado",      desc:"Practica música 5 días",        emoji:"🎵", bonus:2, diff:2, check:s=>s.musicDays>=5        },
  { id:"tasks25",     label:"Trabajador incansable",desc:"25 tareas completadas",         emoji:"💪", bonus:2, diff:2, check:s=>s.totalDone>=25       },
  { id:"stars30",     label:"Primer euro",          desc:"30 estrellas aprobadas",        emoji:"💶", bonus:1, diff:1, check:s=>s.approvedStars>=30   },
  { id:"streak7",     label:"Semana perfecta",      desc:"7 días seguidos",               emoji:"🌈", bonus:2, diff:2, check:s=>s.streak>=7           },
  { id:"hygiene7",    label:"Súper limpio",         desc:"Higiene 7 días seguidos",       emoji:"🦷", bonus:2, diff:2, check:s=>s.hygieneStreak>=7    },
  { id:"tasks50",     label:"Héroe del hogar",      desc:"50 tareas completadas",         emoji:"🦸", bonus:3, diff:3, check:s=>s.totalDone>=50       },
  { id:"stars90",     label:"Tres euros de racha",  desc:"90 estrellas aprobadas",        emoji:"💰", bonus:2, diff:2, check:s=>s.approvedStars>=90   },
  { id:"streak14",    label:"Dos semanas épicas",   desc:"14 días sin parar",             emoji:"🏆", bonus:3, diff:3, check:s=>s.streak>=14          },
  { id:"tasks100",    label:"Leyenda",              desc:"100 tareas completadas",        emoji:"👑", bonus:3, diff:3, check:s=>s.totalDone>=100      },
  { id:"wishDone",    label:"Primer deseo cumplido",desc:"Un deseo fue aprobado",         emoji:"🌠", bonus:2, diff:2, check:s=>s.wishApproved>=1     },
  { id:"mult",        label:"En modo turbo",        desc:"Alcanzas multiplicador x2",     emoji:"⚡", bonus:2, diff:2, check:s=>s.streak>=7           },
  { id:"stars150",    label:"Ahorro campeón",       desc:"150 estrellas aprobadas",       emoji:"💎", bonus:3, diff:3, check:s=>s.approvedStars>=150  },
  { id:"wishes3",     label:"Soñador constante",    desc:"3 deseos aprobados",            emoji:"🌙", bonus:2, diff:2, check:s=>s.wishApproved>=3     },
];

export const PRIVILEGES = [
  { id:"p1", name:"+30 min pantalla",     cost:10, emoji:"📱", desc:"Extra de pantalla un día" },
  { id:"p2", name:"Elegir la cena",       cost:15, emoji:"🍕", desc:"Elige qué cena pides" },
  { id:"p3", name:"Película del viernes", cost:20, emoji:"🎬", desc:"Tú eliges la peli familiar" },
  { id:"p4", name:"Dormir más tarde",     cost:25, emoji:"🌙", desc:"Una hora más hasta dormir" },
  { id:"p5", name:"Día de aventura",      cost:50, emoji:"🎡", desc:"Salida especial de tu elección" },
  { id:"p6", name:"Videojuego nuevo",     cost:80, emoji:"🎮", desc:"Un juego a elegir" },
];

export const AVATAR_ITEMS = [
  { id:"hat_star",     name:"Gorro con estrella",        cost:8,  emoji:"🎩", slot:"head" },
  { id:"glasses_cool", name:"Gafas súper chulas",        cost:10, emoji:"😎", slot:"face" },
  { id:"bg_space",     name:"Fondo espacial",            cost:12, emoji:"🪐", slot:"background" },
  { id:"frame_gold",   name:"Marco dorado",              cost:14, emoji:"🟡", slot:"frame" },
  { id:"hat_crown",    name:"Corona de campeón",         cost:18, emoji:"👑", slot:"head" },
  { id:"pet_dragon",   name:"Mini dragón compañero",     cost:20, emoji:"🐉", slot:"pet" },
];

export const DEFAULT_CHALLENGES = [
  {
    id:"streak_biblia_7",
    label:"¿Quién lee más días seguidos la Biblia?",
    description:"Reto de 7 días leyendo la Biblia sin fallar.",
    suggestedTaskId:1,
    durationDays:7,
  },
  {
    id:"higiene_perfecta",
    label:"Higiene perfecta 7 días",
    description:"Cepillarse los dientes y rutina de higiene todos los días durante una semana.",
    suggestedTaskId:7,
    durationDays:7,
  },
  {
    id:"deberes_mes",
    label:"Deberes sin fallar un mes",
    description:"Hacer los deberes del cole todos los días de lunes a viernes durante 30 días.",
    suggestedTaskId:6,
    durationDays:30,
  },
];

export const INIT_TASKS = [
  { id:1,  name:"Leer la Biblia",               days:"todos", time:"Tarde",               dur:"15 min", stars:2, emoji:"📖", cat:"espiritual", deadline:null, isSpecial:false },
  { id:2,  name:"Leer Devocional",              days:"todos", time:"Tarde",               dur:"5 min",  stars:2, emoji:"🙏", cat:"espiritual", deadline:null, isSpecial:false },
  { id:3,  name:"Practicar batería",            days:"todos", time:"Tarde",               dur:"10 min", stars:1, emoji:"🥁", cat:"musica",     deadline:null, isSpecial:false },
  { id:4,  name:"Practicar piano",              days:"todos", time:"Tarde",               dur:"20 min", stars:2, emoji:"🎹", cat:"musica",     deadline:null, isSpecial:false },
  { id:5,  name:"Repasar lecciones del colegio",days:"lv",   time:"Tarde",               dur:"10 min", stars:1, emoji:"📚", cat:"colegio",    deadline:null, isSpecial:false },
  { id:6,  name:"Realizar deberes del colegio", days:"lv",   time:"Tarde",               dur:"20 min", stars:1, emoji:"✏️", cat:"colegio",    deadline:null, isSpecial:false },
  { id:7,  name:"Cepillarse los dientes",       days:"todos", time:"Mañana, tarde, noche",dur:"5 min",  stars:1, emoji:"🦷", cat:"higiene",    deadline:null, isSpecial:false },
  { id:8,  name:"Echarse crema y peinarse",     days:"todos", time:"Mañana",              dur:"5 min",  stars:1, emoji:"💆", cat:"higiene",    deadline:null, isSpecial:false },
  { id:9,  name:"Crucigrama o sopa de letras",  days:"lv",   time:"Tarde",               dur:"10 min", stars:1, emoji:"🧩", cat:"mente",      deadline:null, isSpecial:false },
  { id:10, name:"Organizar cama y alrededores", days:"lv",   time:"Tarde",               dur:"15 min", stars:1, emoji:"🛏️", cat:"hogar",      deadline:null, isSpecial:false },
  { id:11, name:"Organizar bolso",              days:"lv",   time:"Tarde",               dur:"5 min",  stars:1, emoji:"🎒", cat:"hogar",      deadline:null, isSpecial:false },
  { id:12, name:"Organizar ropa del colegio",   days:"lv",   time:"Tarde",               dur:"5 min",  stars:1, emoji:"👕", cat:"hogar",      deadline:null, isSpecial:false },
  { id:13, name:"Preparar desayuno",            days:"sab",  time:"Mañana",              dur:"20 min", stars:1, emoji:"🍳", cat:"hogar",      deadline:null, isSpecial:false },
  { id:14, name:"Lavar y tender ropa",          days:"sab",  time:"Mañana",              dur:"20 min", stars:1, emoji:"👗", cat:"hogar",      deadline:null, isSpecial:false },
  { id:15, name:"Recoger y doblar ropa",        days:"dom",  time:"Tarde",               dur:"20 min", stars:1, emoji:"🧺", cat:"hogar",      deadline:null, isSpecial:false },
  { id:16, name:"Ayudar a cocinar",             days:"finde",time:"Tarde",               dur:"30 min", stars:2, emoji:"🥘", cat:"hogar",      deadline:null, isSpecial:false },
  { id:17, name:"Actividad física",             days:"todos",time:"Tarde",               dur:"20 min", stars:2, emoji:"⚽", cat:"mente",      deadline:null, isSpecial:false },
  { id:18, name:"Estudiar las dispensaciones",  days:"finde",time:"Tarde",               dur:"30 min", stars:3, emoji:"📜", cat:"espiritual", deadline:null, isSpecial:true },
  { id:19, name:"Memorizar un versículo",       days:"todos",time:"Noche",               dur:"10 min", stars:2, emoji:"📝", cat:"espiritual", deadline:null, isSpecial:false },
  { id:20, name:"Estudiar una parábola",        days:"lv",   time:"Tarde",               dur:"15 min", stars:2, emoji:"📚", cat:"espiritual", deadline:null, isSpecial:false },
  { id:21, name:"Orar por toda la familia (recordar nombres)", days:"dom",  time:"Mañana", dur:"10 min", stars:1, emoji:"👨‍👩‍👦", cat:"espiritual", deadline:null, isSpecial:false },
];

