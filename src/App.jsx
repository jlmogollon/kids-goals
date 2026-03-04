import { useState, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

// ── Firebase setup ────────────────────────────────────────────
const _app = initializeApp({
  apiKey: "AIzaSyBi3gWJKTUyJEa10fQvboc5AOYi6dyilZA",
  authDomain: "kids-goals.firebaseapp.com",
  projectId: "kids-goals",
  storageBucket: "kids-goals.firebasestorage.app",
  messagingSenderId: "674188476039",
  appId: "1:674188476039:web:d339b18f06f0f600968222",
});
const auth = getAuth(_app);
// Todo en la nube — sin caché local
const db = getFirestore(_app);
// Clave VAPID para notificaciones push (Firebase Console > Cloud Messaging > Web Push certificates)
const FCM_VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY || "";
const _provider = new GoogleAuthProvider();
// Forzar que Google muestre el selector de cuenta siempre que se inicie sesión
_provider.setCustomParameters({ prompt: "select_account" });

// Registrar el Service Worker de FCM al cargar para que las notificaciones en segundo plano lleguen
async function registerFcmSw() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || !FCM_VAPID_KEY) return null;
  try {
    const swUrl = `${import.meta.env.BASE_URL || "/"}firebase-messaging-sw.js`;
    const reg = await navigator.serviceWorker.register(swUrl, { scope: import.meta.env.BASE_URL || "/" });
    return reg;
  } catch (e) {
    console.warn("FCM SW registration:", e?.message || e);
    return null;
  }
}

function loginWithGoogle()          { return signInWithPopup(auth, _provider); }
function logoutFirebase()            { return signOut(auth); }
function onAuth(cb)                  { return onAuthStateChanged(auth, cb); }
async function getUserRole(uid)      { const s=await getDoc(doc(db,"users",uid)); return s.exists()?s.data():null; }
async function setUserRole(uid,data) { return setDoc(doc(db,"users",uid),data,{merge:true}); }
async function loadAppState() {
  const s=await getDoc(doc(db,"appData","main"));
  if(!s.exists()) return null;
  const d=s.data();
  // Asegurar que siempre tenemos las tareas iniciales más nuevas
  if (Array.isArray(d.tasks) && d.tasks.length>0) {
    const existingIds = new Set(d.tasks.map(t=>t.id));
    const extra = INIT_TASKS.filter(t=>!existingIds.has(t.id));
    if (extra.length>0) d.tasks = [...d.tasks, ...extra];
  } else {
    d.tasks = INIT_TASKS;
  }
  // Migrar parent antiguo → parents
  if(d.parent && !d.parents) {
    d.parents={ father: { ...d.parent, name: d.parent.name||"Papá" }, mother: { ...d.parent, name: d.parent.name||"Mamá" } };
    delete d.parent;
  }
  if(d.parentFcmToken && !d.parentFcmTokens) {
    d.parentFcmTokens={ father: d.parentFcmToken, mother: d.parentFcmToken };
    delete d.parentFcmToken;
  }
  return d;
}
async function saveAppState(state)   {
  const {screen,modal,toast,confetti,loggedAccount,authUser,loading,...data}=state;
  const toSave={...data};
  if(toSave.parent) { delete toSave.parent; }
  if(toSave.parentFcmToken) { delete toSave.parentFcmToken; }
  return setDoc(doc(db,"appData","main"),toSave);
}
async function setParentFcmToken(parentRole, token) {
  return setDoc(doc(db,"appData","main"), { [`parentFcmTokens.${parentRole}`]: token }, { merge: true });
}
async function saveParentPhoto(parentRole, parentData) {
  if (!parentData?.photo && !parentData?.name) return;
  return setDoc(doc(db,"appData","main"), { [`parents.${parentRole}`]: { photo: parentData.photo || null, name: parentData.name || (parentRole==="father"?"Papá":"Mamá") } }, { merge: true });
}
async function setChildFcmToken(kidId, token) {
  return setDoc(doc(db,"appData","fcmTokens"), { [kidId]: token }, { merge: true });
}
function subscribeAppState(cb) { return onSnapshot(doc(db,"appData","main"),(s)=>{ if(s.exists()) cb(s.data()); }); }

import { TH, PALETTE, FIXED_PARENT_EMAILS, CAT_CLR, STARS_PER_EURO, LEVELS, DAY_LABELS, DAY_SHORT, DAY_FULL, DEMO_ACCOUNTS, ACHIEV, PRIVILEGES, INIT_TASKS } from "./constants";
import { getTodayIdx, taskActiveOn, taskActiveToday, calcAge, getLevel, getNextLevel, getStreakMult, fmt, isToday, approvedStars, availableStars, pendingStars, totalEuros, paidOut, balance, kidName, checkNewAchievements, mkKid, initState } from "./utils";

// ═══════════════════════════════════════════════════════════════════════
// INITIAL TASKS
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// REDUCER
// ═══════════════════════════════════════════════════════════════════════
function reducer(st, a) {
  switch(a.type) {
    case "AUTH_LOGIN": return { ...st, screen: (a.account.role==="father"||a.account.role==="mother"||a.account.role==="parent")?"parent":"child", loggedAccount: a.account, activeKid: a.account.kidId||null };
    case "AUTH_LOGOUT": return { ...initState(), screen:"auth" };
    case "NAV": return { ...st, screen:a.screen, activeKid:a.kid||st.activeKid };
    case "SET_CHILD_TAB": return { ...st, childTab:a.tab };
    case "SET_PARENT_TAB": return { ...st, parentTab:a.tab };
    case "OPEN_MODAL": return { ...st, modal:a.modal };
    case "CLOSE_MODAL": return { ...st, modal:null };
    case "CLEAR_TOAST": return { ...st, toast:null };
    case "CLEAR_CONFETTI": return { ...st, confetti:false };
    case "TOAST": return { ...st, toast:a.msg };

    case "SET_KID_PHOTO": return { ...st, kids:{ ...st.kids, [a.kidId]:{ ...st.kids[a.kidId], photo:a.photo } } };
    case "SET_PARENT_PHOTO": return { ...st, parents:{ ...st.parents, [a.parentRole]:{ ...st.parents[a.parentRole], photo:a.photo } } };
    case "SET_KID_INFO": return { ...st, kids:{ ...st.kids, [a.kidId]:{ ...st.kids[a.kidId], name:a.name, dob:a.dob } } };
    case "SET_PARENT_NAME": return { ...st, parents:{ ...st.parents, [a.parentRole]:{ ...st.parents[a.parentRole], name:a.name } } };
    case "SET_PARENT_FCM_TOKEN": return { ...st, parentFcmTokens:{ ...st.parentFcmTokens, [a.parentRole]:a.token } };

    case "COMPLETE_TASK": {
      const { kidId, taskId } = a;
      const task = st.tasks.find(t=>t.id===taskId);
      const mult = getStreakMult(st.kids[kidId].stats.streak||0);
      const comp = { done:true, approved:false, evidence:null, photoUrl:null, date:new Date().toISOString(), mult };
      const newKid = { ...st.kids[kidId], completions:{ ...st.kids[kidId].completions, [taskId]:comp },
        stats:{ ...st.kids[kidId].stats, totalDone:(st.kids[kidId].stats.totalDone||0)+1 } };
      const notif = { id:Date.now(), kidId, taskId, time:new Date().toLocaleTimeString("es-ES"), read:false, type:"task" };
      return { ...st, kids:{ ...st.kids, [kidId]:newKid }, notifications:[notif,...st.notifications],
        toast:`✅ ${task?.name} enviada para aprobación` };
    }

    case "SUBMIT_EVIDENCE": {
      const { kidId, taskId, evidence, photoUrl } = a;
      const comp = { ...st.kids[kidId].completions[taskId], evidence, photoUrl };
      return { ...st, kids:{ ...st.kids, [kidId]:{ ...st.kids[kidId], completions:{ ...st.kids[kidId].completions, [taskId]:comp } } },
        modal:null, toast:"📤 Evidencia enviada a papá/mamá" };
    }

    case "APPROVE_TASK": {
      const { kidId, taskId, notifId, message, approvedBy } = a;
      const task = st.tasks.find(t=>t.id===taskId);
      const comp = { ...st.kids[kidId].completions[taskId], approved:true, evidence:null, photoUrl:null, approvedBy: approvedBy||"parent" };
      const effStars = Math.ceil((task?.stars||0) * (comp.mult && comp.mult>1 ? comp.mult : 1));
      let kid = { ...st.kids[kidId], completions:{ ...st.kids[kidId].completions, [taskId]:comp } };
      // Add encouragement message if provided
      if(message) kid = { ...kid, messages:[{ id:Date.now(), from:"parent", text:message, date:new Date().toLocaleTimeString("es-ES"), read:false },...kid.messages] };
      // Check achievements
      const newAch = checkNewAchievements(kid, st.tasks);
      let bonusAdded=0, achToast="";
      if(newAch.length>0) {
        bonusAdded=newAch.reduce((a,b)=>a+b.bonus,0);
        kid={ ...kid, achievements:[...kid.achievements,...newAch.map(a=>a.id)], bonusStars:kid.bonusStars+bonusAdded };
        achToast=` 🏅 ¡${newAch[0].label}! +${bonusAdded}⭐`;
      }
      const newNotifs=st.notifications.map(n=>n.id===notifId?{...n,read:true}:n);
      const logEntry={ id:Date.now(), kidId, taskId, taskName:task?.name, stars:effStars, date:new Date().toLocaleDateString("es-ES"), approved:true, approvedBy: approvedBy||"parent" };
      return { ...st, kids:{ ...st.kids, [kidId]:kid }, notifications:newNotifs, confetti:true,
        approvalLog:[logEntry,...st.approvalLog],
        toast:`⭐ +${effStars}${bonusAdded>0?`+${bonusAdded}bonus`:""} estrellas para ${kidName(st.kids[kidId],kidId)}!${achToast}` };
    }

    case "REJECT_TASK": {
      const { kidId, taskId, notifId, rejectedBy, message } = a;
      const task = st.tasks.find(t=>t.id===taskId);
      const comp = { ...st.kids[kidId].completions };
      delete comp[taskId];
      const newNotifs=st.notifications.filter(n=>n.id!==notifId);
      const whoRej = rejectedBy==="mother"?"Mamá":"Papá";
      let kid = { ...st.kids[kidId], completions:comp };
      if (message && message.trim()) {
        const msgText = `${whoRej} rechazó "${task?.name||"la tarea"}": ${message.trim()}`;
        kid = { ...kid, messages:[{ id:Date.now(), from:"parent", text:msgText, date:new Date().toLocaleTimeString("es-ES"), read:false },...kid.messages] };
      }
      const logEntry={ id:Date.now(), kidId, taskId, taskName:task?.name, date:new Date().toLocaleDateString("es-ES"), approved:false, rejectedBy: rejectedBy||"parent" };
      return { ...st, kids:{ ...st.kids, [kidId]:kid },
        notifications:newNotifs, approvalLog:[logEntry,...st.approvalLog], modal:null, toast:"❌ Tarea rechazada" };
    }

    case "ADD_TASK": return { ...st, tasks:[...st.tasks, {...a.task,id:st.nextId}], nextId:st.nextId+1, modal:null, toast:`✅ Tarea "${a.task.name}" creada` };
    case "EDIT_TASK": return { ...st, tasks:st.tasks.map(t=>t.id===a.task.id?a.task:t), modal:null, toast:"✅ Tarea actualizada" };
    case "DELETE_TASK": return { ...st, tasks:st.tasks.filter(t=>t.id!==a.taskId), modal:null, toast:"🗑️ Tarea eliminada" };

    case "ADD_PAYMENT": {
      const p={ id:Date.now(), amount:a.amount, note:a.note, date:new Date().toLocaleDateString("es-ES") };
      return { ...st, kids:{ ...st.kids, [a.kidId]:{ ...st.kids[a.kidId], payments:[...st.kids[a.kidId].payments,p] } },
        modal:null, toast:`💶 Entregado ${a.amount}€ a ${kidName(st.kids[a.kidId],a.kidId)}` };
    }

    case "ADD_WISH": {
      const w={ id:Date.now(), name:a.name, cost:a.cost, emoji:a.emoji, approved:false, denied:false };
      return { ...st, kids:{ ...st.kids, [a.kidId]:{ ...st.kids[a.kidId], wishlist:[...st.kids[a.kidId].wishlist,w] } },
        modal:null, toast:"🌠 Deseo añadido a tu lista" };
    }
    case "APPROVE_WISH": {
      const wl=st.kids[a.kidId].wishlist.map(w=>w.id===a.wishId?{...w,approved:true}:w);
      const kid={ ...st.kids[a.kidId], wishlist:wl, stats:{ ...st.kids[a.kidId].stats, wishApproved:(st.kids[a.kidId].stats.wishApproved||0)+1 } };
      return { ...st, kids:{ ...st.kids, [a.kidId]:kid }, modal:null, toast:"✅ ¡Deseo aprobado!" };
    }
    case "DENY_WISH": {
      const wl=st.kids[a.kidId].wishlist.map(w=>w.id===a.wishId?{...w,denied:true}:w);
      return { ...st, kids:{ ...st.kids, [a.kidId]:{ ...st.kids[a.kidId], wishlist:wl } }, modal:null, toast:"❌ Deseo denegado" };
    }

    case "REDEEM_PRIVILEGE": {
      const priv=PRIVILEGES.find(p=>p.id===a.privId);
      if(!priv) return st;
      const kid=st.kids[a.kidId];
      if(availableStars(kid,st.tasks)<priv.cost) return { ...st, toast:"⭐ No tienes suficientes estrellas" };
      const newKid={ ...kid, spentStars:kid.spentStars+priv.cost,
        privileges:[...kid.privileges,{id:Date.now(),item:priv,date:new Date().toLocaleDateString("es-ES")}] };
      const notif={ id:Date.now(), kidId:a.kidId, type:"privilege", privName:priv.name, time:new Date().toLocaleTimeString("es-ES"), read:false };
      return { ...st, kids:{ ...st.kids, [a.kidId]:newKid }, notifications:[notif,...st.notifications],
        modal:null, confetti:true, toast:`🎉 ¡Canjeado: ${priv.name}!` };
    }

    case "ADD_GRATITUDE": {
      const g={ id:Date.now(), date:new Date().toLocaleDateString("es-ES"), text:a.text };
      return { ...st, kids:{ ...st.kids, [a.kidId]:{ ...st.kids[a.kidId], gratitude:[g,...st.kids[a.kidId].gratitude] } },
        modal:null, toast:"📝 Gratitud guardada ❤️" };
    }

    case "SEND_MESSAGE": {
      const msg={ id:Date.now(), from:"parent", text:a.text, date:new Date().toLocaleTimeString("es-ES"), read:false };
      return { ...st, kids:{ ...st.kids, [a.kidId]:{ ...st.kids[a.kidId], messages:[msg,...st.kids[a.kidId].messages] } },
        modal:null, toast:`💬 Mensaje enviado a ${kidName(st.kids[a.kidId],a.kidId)}` };
    }
    case "READ_MESSAGES": {
      const msgs=st.kids[a.kidId].messages.map(m=>({...m,read:true}));
      return { ...st, kids:{ ...st.kids, [a.kidId]:{ ...st.kids[a.kidId], messages:msgs } } };
    }
    case "EDIT_MESSAGE": {
      const msgs=st.kids[a.kidId].messages.map(m=>m.id===a.messageId?{...m,text:a.text}:m);
      return { ...st, kids:{ ...st.kids, [a.kidId]:{ ...st.kids[a.kidId], messages:msgs } }, modal:null, toast:"✅ Mensaje actualizado" };
    }
    case "DELETE_MESSAGE": {
      const msgs=st.kids[a.kidId].messages.filter(m=>m.id!==a.messageId);
      return { ...st, kids:{ ...st.kids, [a.kidId]:{ ...st.kids[a.kidId], messages:msgs } }, modal:null, toast:"🗑️ Mensaje eliminado" };
    }

    case "ADD_CHALLENGE": {
      const ch={ id:Date.now(), ...a.challenge, myCount:0, theirCount:0, winner:null };
      return { ...st, challenges:[...st.challenges,ch], modal:null, toast:"⚔️ ¡Reto creado!" };
    }

    default: return st;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// GLOBAL STYLES
// ═══════════════════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
:root{
  --kg-bg:#e8f4e8;
  --kg-surface:#fff;
  --kg-primary:#8DC63F;
  --kg-primary-dark:#2D5010;
  --kg-primary-muted:#4A7A1E;
  --kg-gold:#CC8800;
  --kg-gold-light:#FFF3CC;
  --kg-error:#C62828;
  --kg-text:#1a1a1a;
  --kg-text-secondary:#555;
  --kg-text-muted:#888;
  --kg-border:#e8e8e8;
  --kg-border-light:#f0f0f0;
  --kg-overlay:rgba(0,0,0,.5);
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html{height:100%;width:100%;overflow-x:hidden}
body{min-height:100%;min-height:100dvh;width:100%;background:var(--kg-bg);font-family:'Nunito',sans-serif;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;overflow-x:hidden}
#root{min-height:100%;min-height:100dvh;width:100%}

/* App shell — full width on mobile, centered card on desktop */
.app{
  width:100%;
  min-height:100vh;
  min-height:100dvh;
  margin:0 auto;
  background:var(--kg-surface);
  position:relative;
  overflow:hidden;
  display:flex;
  flex-direction:column;
}
@media (min-width:431px){
  .app{ max-width:430px; box-shadow:0 0 60px rgba(0,0,0,.12); }
}
@media (max-width:430px){
  .app{ max-width:none; margin:0; }
}

/* Every screen = flex column that fills the app shell */
.screen{
  flex:1;
  display:flex;
  flex-direction:column;
  min-height:0;
  overflow:hidden;
  width:100%;
}

/* Scrollable body area — min-height:0 allows flex child to scroll */
.scroll-body{
  flex:1;
  min-height:0;
  overflow-y:auto;
  overflow-x:hidden;
  -webkit-overflow-scrolling:touch;
  overscroll-behavior-y:contain;
  padding:12px 16px;
  padding-bottom:calc(90px + env(safe-area-inset-bottom,0px));
  width:100%;
}

/* Screen header (gradient top area) */
.screen-header{
  flex-shrink:0;
  padding:16px 16px 20px;
  padding-top:calc(16px + env(safe-area-inset-top,44px));
  width:100%;
}

/* Tab bar — fija abajo para que siempre sea visible */
.tab-bar{
  position:fixed;
  bottom:0;
  left:0;
  right:0;
  display:flex;
  background:var(--kg-surface);
  border-top:1.5px solid var(--kg-border-light);
  padding:6px 0;
  padding-bottom:max(14px,env(safe-area-inset-bottom,0px));
  width:100%;
  max-width:430px;
  margin:0 auto;
  z-index:50;
}
@media (max-width:430px){ .tab-bar{ max-width:none } }
.tab-item{
  flex:1;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:2px;
  cursor:pointer;
  padding:6px 2px;
  transition:transform .15s;
  position:relative;
  min-width:0;
}
.tab-item:active{transform:scale(.88)}
.ti{font-size:20px;line-height:1}
.tl{font-size:10px;font-weight:800;color:var(--kg-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}

/* Cards */
.card{
  background:var(--kg-surface);
  border-radius:20px;
  box-shadow:0 2px 14px rgba(0,0,0,.07);
  padding:14px;
  margin-bottom:12px;
  border:2px solid transparent;
  width:100%;
}

/* Modal — full width on mobile */
.modal-ov{position:fixed;inset:0;background:var(--kg-overlay);z-index:100;display:flex;align-items:flex-end;justify-content:center;animation:fadeIn .2s}
.modal-sh{
  background:var(--kg-surface);
  border-radius:28px 28px 0 0;
  padding:20px 16px;
  padding-bottom:max(32px,calc(16px + env(safe-area-inset-bottom,0px)));
  width:100%;
  max-width:430px;
  animation:slideUp .3s cubic-bezier(.34,1.56,.64,1);
  max-height:88vh;
  overflow-y:auto;
  -webkit-overflow-scrolling:touch;
}
@media (max-width:430px){ .modal-sh{ max-width:none; border-radius:24px 24px 0 0; } }
.handle{width:40px;height:4px;background:var(--kg-border);border-radius:50px;margin:0 auto 16px}

/* Misc */
.pill{display:inline-flex;align-items:center;gap:3px;border-radius:50px;padding:3px 10px;font-weight:800;font-size:12px}
.sb{background:var(--kg-gold-light);color:var(--kg-gold)}
.prog-bar{background:var(--kg-border-light);border-radius:50px;overflow:hidden}
.prog-fill{height:100%;border-radius:50px;transition:width .7s cubic-bezier(.34,1.56,.64,1)}
.toast{
  position:fixed;
  top:max(52px,calc(env(safe-area-inset-top,0px) + 12px));
  right:12px;left:12px;
  max-width:400px;
  margin:0 auto;
  background:var(--kg-primary-dark);
  color:#fff;
  padding:12px 16px;
  border-radius:16px;
  font-weight:800;
  font-size:13px;
  z-index:300;
  animation:toastIn .35s cubic-bezier(.34,1.56,.64,1);
  box-shadow:0 6px 24px rgba(0,0,0,.3);
  line-height:1.4;
}
.confp{position:fixed;border-radius:3px;animation:cfFall linear forwards;z-index:999;pointer-events:none}
.badge{position:absolute;top:0;right:8%;background:var(--kg-error);color:#fff;border-radius:50%;width:15px;height:15px;font-size:9px;font-weight:900;display:flex;align-items:center;justify-content:center}
.widget{background:linear-gradient(135deg,#F0FAE6,#EBF8FF);border-radius:18px;padding:12px;margin:0 0 12px;border:2px solid var(--kg-border);width:100%}

/* Logout button — always top-right, never overlapping content */
.logout-btn{
  position:absolute;
  top:max(16px,calc(env(safe-area-inset-top,44px) - 4px));
  right:16px;
  background:rgba(255,255,255,.22);
  border:1.5px solid rgba(255,255,255,.4);
  border-radius:50%;
  width:36px;height:36px;
  display:flex;align-items:center;justify-content:center;
  font-size:15px;
  cursor:pointer;
  color:#fff;
  z-index:10;
}

input,select,textarea{font-family:'Nunito',sans-serif;outline:none;font-size:16px!important;-webkit-appearance:none}
::-webkit-scrollbar{display:none}

@keyframes pop{0%{transform:scale(.4);opacity:0}70%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}
@keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes toastIn{from{transform:translateX(110%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes cfFall{0%{transform:translateY(-30px) rotate(0deg);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0}}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes spin{0%{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes levelUp{0%{transform:scale(0) rotate(-180deg);opacity:0}80%{transform:scale(1.15) rotate(5deg)}100%{transform:scale(1) rotate(0);opacity:1}}
`;

// ═══════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════
function Confetti() {
  const ps=Array.from({length:40},(_,i)=>({ id:i, color:["#FF85C2","#FFB800","#8DC63F","#5BC8F5","#FF6B6B","#A78BFA"][i%6], left:Math.random()*96, delay:Math.random()*.9, dur:1.6+Math.random()*1.4, size:7+Math.random()*9 }));
  return <>{ps.map(p=><div key={p.id} className="confp" style={{background:p.color,left:`${p.left}%`,top:"-20px",width:p.size,height:p.size,animationDelay:`${p.delay}s`,animationDuration:`${p.dur}s`}}/>)}</>;
}

function Avatar({ photo, emoji, size=52, color="#ccc", onClick }) {
  const ref=useRef();
  async function handleFile(e) {
    const f=e.target.files?.[0];
    if(!f||!f.type.startsWith("image/")||!onClick)return;
    try {
      const dataUrl=await compressImage(f,400,0.7);
      onClick(dataUrl);
    }catch(err){console.warn(err);}
    e.target.value="";
  }
  return (
    <div style={{position:"relative",width:size,height:size,cursor:onClick?"pointer":"default"}} onClick={()=>onClick&&ref.current?.click()}>
      <div style={{width:size,height:size,borderRadius:"50%",background:photo?"none":`${color}33`,border:`3px solid ${color}`,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box"}}>
        {photo?<img src={photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:size*.45}}>{emoji}</span>}
      </div>
      {onClick&&<div style={{position:"absolute",bottom:0,right:0,background:color,borderRadius:"50%",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",border:"2px solid #fff"}}>📷</div>}
      {onClick&&<input ref={ref} type="file" accept="image/*" style={{display:"none"}} onChange={handleFile}/>}
    </div>
  );
}

function ProgressBar({ value, max, color, height=8 }) {
  const pct=max>0?Math.min((value/max)*100,100):0;
  return <div className="prog-bar" style={{height}}><div className="prog-fill" style={{width:`${pct}%`,height:"100%",background:color}}/></div>;
}

function StarBadge({ n, size="sm" }) {
  return <span className={`pill sb`} style={{fontSize:size==="lg"?15:11,padding:size==="lg"?"5px 14px":"3px 10px"}}>{"⭐".repeat(Math.min(n,3))}{n>3?` x${n}`:""}</span>;
}

// iOS Widget simulation
function HomeWidget({ kid, kidId, tasks }) {
  if(!kid) return null;
  const as=approvedStars(kid,tasks);
  const lv=getLevel(as);
  const th=TH[kidId];
  const todayT=tasks.filter(t=>taskActiveToday(t.days));
  const doneT=todayT.filter(t=>{
    const c=kid.completions[t.id];
    return c?.done && isToday(c.date);
  }).length;
  return (
    <div className="widget">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{color:"#4A7A1E",fontSize:10,fontWeight:900,letterSpacing:1}}>KIDS GOALS</span>
        <span style={{color:th.p,fontSize:10,fontWeight:900}}>{lv.icon} {lv.name}</span>
      </div>
      <div style={{display:"flex",gap:10}}>
        <div style={{flex:1,background:"rgba(255,255,255,.06)",borderRadius:12,padding:10,textAlign:"center"}}>
          <div style={{color:"#666",fontSize:9,fontWeight:700}}>⭐ HOY</div>
          <div style={{color:th.p,fontSize:22,fontWeight:900}}>{doneT}/{todayT.length}</div>
        </div>
        <div style={{flex:1,background:"rgba(255,255,255,.06)",borderRadius:12,padding:10,textAlign:"center"}}>
          <div style={{color:"#666",fontSize:9,fontWeight:700}}>ESTRELLAS</div>
          <div style={{color:"#CC8800",fontSize:22,fontWeight:900}}>{as}</div>
        </div>
        <div style={{flex:1,background:"rgba(255,255,255,.06)",borderRadius:12,padding:10,textAlign:"center"}}>
          <div style={{color:"#666",fontSize:9,fontWeight:700}}>💶 BALANCE</div>
          <div style={{color:"#4A7A1E",fontSize:22,fontWeight:900}}>{balance(kid,tasks)}€</div>
        </div>
      </div>
      <div style={{marginTop:8}}>
        <ProgressBar value={as%STARS_PER_EURO} max={STARS_PER_EURO} color={th.p} height={5}/>
        <div style={{color:"#666",fontSize:9,marginTop:2,fontWeight:600}}>Próximo euro: {as%STARS_PER_EURO}/{STARS_PER_EURO} ⭐</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// AUTH SCREEN — Apple Sign In with Family Sharing
// ═══════════════════════════════════════════════════════════════════════
function AuthScreen({ onLogin }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleGoogle() {
    setLoading(true);
    setError("");
    try {
      await loginWithGoogle();
      // onAuth listener in App() will handle the rest
    } catch(e) {
      setError("No se pudo iniciar sesión. Inténtalo de nuevo.");
      setLoading(false);
    }
  }

  return (
    <div className="screen" style={{background:"linear-gradient(160deg,#F0FAE6 0%,#EBF8FF 60%,#FFFBEA 100%)",alignItems:"center",justifyContent:"center",overflowY:"auto",padding:"40px 24px"}}>
      <div style={{textAlign:"center",marginBottom:56,animation:"pop .5s both"}}>
        <div style={{fontSize:80,marginBottom:-4,animation:"bounce 3s infinite"}}>🏠</div>
        <div style={{fontSize:40,fontWeight:900,letterSpacing:-1}}>
          <span style={{color:"#8DC63F"}}>K</span><span style={{color:"#FFB800"}}>I</span><span style={{color:"#5BC8F5"}}>D</span><span style={{color:"#FF85C2"}}>S</span>
        </div>
        <div style={{fontSize:16,fontWeight:900,color:"#4A7A1E",letterSpacing:5}}>GOALS</div>
        <p style={{color:"#888",fontSize:13,marginTop:10,lineHeight:1.6}}>Gestiona tareas, logros y recompensas para toda la familia</p>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%",maxWidth:320}}>
        <button onClick={handleGoogle} disabled={loading}
          style={{background:"linear-gradient(135deg,#4A7A1E,#2D5010)",color:"#fff",border:"none",borderRadius:14,padding:"17px",fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:17,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,boxShadow:"0 8px 24px rgba(74,122,30,0.35)",opacity:loading?0.7:1,animation:"slideUp .4s .1s both"}}>
          {loading
            ? <span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⏳</span>
            : <span style={{fontSize:22}}>G</span>}
          {loading ? "Conectando..." : "Iniciar sesión con Google"}
        </button>
        {error && <p style={{color:PALETTE.error,fontSize:13,textAlign:"center",fontWeight:700}}>{error}</p>}
        <p style={{color:"#aaa",fontSize:11,textAlign:"center",lineHeight:1.6}}>
          Cada miembro de la familia entra con su propia cuenta Google (padres e hijos).<br/>
          Si quieres cambiar de usuario, cierra sesión desde Configuración y vuelve a iniciar sesión con la cuenta del niño.
        </p>
      </div>
    </div>
  );
}

// ─── ROLE SELECTION (first time login) ─────────────────────────
function RoleScreen({ user, onRole }) {
  const [loading, setLoading] = useState(false);
  async function choose(role, kidId) {
    setLoading(true);
    await setUserRole(user.uid, {
      role, kidId: kidId||null,
      name: user.displayName, email: user.email, photo: user.photoURL,
    });
    onRole({ role, kidId: kidId||null });
  }
  return (
    <div className="screen" style={{background:"linear-gradient(160deg,#F0FAE6 0%,#EBF8FF 60%,#FFFBEA 100%)",alignItems:"center",justifyContent:"center",overflowY:"auto",padding:"40px 24px"}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        {user.photoURL
          ? <img src={user.photoURL} alt="" style={{width:72,height:72,borderRadius:"50%",border:"3px solid #8DC63F",marginBottom:12}}/>
          : <div style={{fontSize:56,marginBottom:12}}>👤</div>}
        <h2 style={{fontWeight:900,fontSize:22,color:"#222"}}>¡Hola, {user.displayName}!</h2>
        <p style={{color:"#888",fontSize:13,marginTop:6}}>Primera vez aquí. ¿Quién eres?</p>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%",maxWidth:320}}>
        {[
          {label:"👨 Soy padre", role:"father", kidId:null, color:"#FFB800", shadow:"rgba(255,184,0,0.35)"},
          {label:"👩 Soy madre", role:"mother", kidId:null, color:"#E91E8C", shadow:"rgba(233,30,140,0.35)"},
          {label:"👦🏻 Soy José",  role:"child", kidId:"jose",  color:"#8DC63F", shadow:"rgba(141,198,63,0.35)"},
          {label:"👦 Soy David", role:"child", kidId:"david", color:"#5BC8F5", shadow:"rgba(91,200,245,0.35)"},
        ].map(o=>(
          <button key={o.role+o.kidId} onClick={()=>choose(o.role,o.kidId)} disabled={loading}
            style={{background:`linear-gradient(135deg,${o.color},${o.color}cc)`,color:"#fff",border:"none",borderRadius:18,padding:"18px 24px",fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:18,cursor:"pointer",boxShadow:`0 8px 24px ${o.shadow}`,opacity:loading?0.7:1}}>
            {o.label}
          </button>
        ))}
      </div>
      <p style={{color:"#aaa",fontSize:11,textAlign:"center",marginTop:20,lineHeight:1.5}}>
        Esta elección queda guardada en tu cuenta.<br/>Solo tienes que hacerlo una vez.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// CHILD SCREEN
// ═══════════════════════════════════════════════════════════════════════
function ChildScreen({ st, dispatch, onRequestNotif, showNotifPrompt, roleData }) {
  const kidId = st.activeKid || roleData?.kidId || "jose";
  const kid = st.kids[kidId] || st.kids.jose || st.kids.david;
  if (!kid) return <div className="screen" style={{display:"flex",alignItems:"center",justifyContent:"center",background:"#f5f5f5"}}><p>Cargando...</p></div>;
  const th=TH[kidId] || TH.jose;
  const as=approvedStars(kid,st.tasks);
  const ps=pendingStars(kid,st.tasks);
  const lv=getLevel(as);
  const nextLv=getNextLevel(as);
  const mult=getStreakMult(kid.stats.streak||0);
  const todayT=st.tasks.filter(t=>taskActiveToday(t.days));
  const doneToday=todayT.filter(t=>{
    const c=kid.completions[t.id];
    return c?.done && isToday(c.date);
  }).length;
  const bal=balance(kid,st.tasks);
  const unreadMsgs=kid.messages.filter(m=>!m.read).length;
  const avail=availableStars(kid,st.tasks);

  useEffect(()=>{ if(unreadMsgs>0) dispatch({type:"READ_MESSAGES",kidId}); },[unreadMsgs]);

  const tabs=[
    {id:"hoy",icon:"📋",label:"Hoy"},
    {id:"mensajes",icon:"💬",label:"Mensajes",badge:unreadMsgs},
    {id:"logros",icon:"🏅",label:"Logros"},
    {id:"tienda",icon:"🛍️",label:"Tienda"},
    {id:"dinero",icon:"💶",label:"Dinero"},
    {id:"mas",icon:"⋯",label:"Más"},
  ];

  return (
    <div className="screen" style={{background:th.l}}>
      {/* Header */}
      <div className="screen-header" style={{background:`linear-gradient(135deg,${th.p},${th.a})`,position:"relative",borderRadius:"0 0 28px 28px"}}>
        <button onClick={()=>logoutFirebase()} className="logout-btn">🚪</button>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,paddingRight:48}}>
          <Avatar photo={kid.photo} emoji={kidId==="jose"?"👦🏻":"👦🏽"} size={52} color="#fff"
            onClick={ph=>dispatch({type:"SET_KID_PHOTO",kidId,photo:ph})}/>
          <div style={{flex:1,minWidth:0}}>
            <p style={{color:"rgba(255,255,255,.8)",fontSize:11,fontWeight:700}}>¡Hola!</p>
            <h1 style={{color:"#fff",fontSize:24,fontWeight:900,lineHeight:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{kid.name}</h1>
            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3,flexWrap:"wrap"}}>
              <span style={{color:"rgba(255,255,255,.9)",fontSize:12,fontWeight:800}}>{lv.icon} {lv.name}</span>
              {mult>1&&<span style={{background:PALETTE.error,borderRadius:50,padding:"1px 8px",fontSize:10,fontWeight:900,color:"#fff"}}>x{mult} ⚡</span>}
              {unreadMsgs>0&&<span style={{background:"rgba(255,255,255,.3)",borderRadius:50,padding:"1px 8px",fontSize:10,fontWeight:900,color:"#fff"}}>💬 {unreadMsgs}</span>}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          {[
            {label:"⭐ Estrellas", value:as,      sub:ps>0?`+${ps} pend.`:"aprob."},
            {label:"✅ Hoy",       value:`${doneToday}/${todayT.length}`, sub:"tareas"},
            {label:"💶 Balance",   value:`${bal}€`, sub:`de ${Math.floor(as/STARS_PER_EURO)}€`},
          ].map((s,i)=>(
            <div key={i} style={{flex:1,background:"rgba(255,255,255,.22)",borderRadius:14,padding:"8px 4px",textAlign:"center"}}>
              <div style={{color:"rgba(255,255,255,.85)",fontSize:9,fontWeight:800,marginBottom:1}}>{s.label}</div>
              <div style={{color:"#fff",fontSize:18,fontWeight:900,lineHeight:1}}>{s.value}</div>
              <div style={{color:"rgba(255,255,255,.7)",fontSize:9,fontWeight:700,marginTop:1}}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Level progress */}
        {nextLv&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",color:"rgba(255,255,255,.8)",fontSize:10,fontWeight:700,marginBottom:3}}>
              <span>Hacia {nextLv.icon} {nextLv.name}</span>
              <span>{as}/{nextLv.min}⭐</span>
            </div>
            <ProgressBar value={as-lv.min} max={nextLv.min-lv.min} color="rgba(255,255,255,.9)" height={6}/>
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="scroll-body">
        {showNotifPrompt&&onRequestNotif&&(
          <button onClick={onRequestNotif} style={{width:"100%",background:`linear-gradient(135deg,${th.p},${th.a})`,color:"#fff",border:"none",borderRadius:16,padding:14,fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:14,cursor:"pointer",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            🔔 Activar notificaciones — recibirás avisos cuando papá/mamá apruebe tus tareas
          </button>
        )}
        {st.childTab==="hoy"       && <ChildToday kidId={kidId} kid={kid} tasks={st.tasks} th={th} dispatch={dispatch} mult={mult}/>}
        {st.childTab==="mensajes"  && <ChildMensajes kidId={kidId} kid={kid} th={th} dispatch={dispatch}/>}
        {st.childTab==="logros"    && <ChildLogros kid={kid} kidId={kidId} as={as} th={th}/>}
        {st.childTab==="tienda"    && <ChildTienda kidId={kidId} kid={kid} tasks={st.tasks} th={th} dispatch={dispatch} avail={avail}/>}
        {st.childTab==="dinero"    && <MoneyPanel kidId={kidId} kid={kid} tasks={st.tasks} th={th} isParent={false} dispatch={dispatch} approvalLog={st.approvalLog}/>}
        {st.childTab==="mas"       && <ChildMas kidId={kidId} kid={kid} th={th} dispatch={dispatch} challenges={st.challenges}/>}
      </div>

      <div className="tab-bar">
        {tabs.map(t=>(
          <div key={t.id} className="tab-item" onClick={()=>{ dispatch({type:"SET_CHILD_TAB",tab:t.id}); if(t.id==="mensajes"&&unreadMsgs>0) dispatch({type:"READ_MESSAGES",kidId}); }}>
            <span className="ti">{t.icon}</span>
            <span className="tl" style={{color:st.childTab===t.id?th.p:"#bbb"}}>{t.label}</span>
            {t.badge>0&&<span className="badge">{t.badge}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CENTRO DE MENSAJES (niño) ──────────────────────────────────
const ChildMensajes = memo(function ChildMensajes({ kidId, kid, th, dispatch }) {
  const messages = [...(kid.messages||[])].reverse();
  useEffect(() => {
    if ((kid.messages||[]).some(m=>!m.read)) dispatch({ type: "READ_MESSAGES", kidId });
  }, [kidId]);
  return (
    <div className="card" style={{marginBottom:12}}>
      <h3 style={{fontWeight:900,marginBottom:12}}>💬 Centro de mensajes</h3>
      <p style={{fontSize:12,color:"#666",marginBottom:14}}>Mensajes de papá/mamá y motivos cuando rechazan una tarea.</p>
      {messages.length===0 ? (
        <div style={{textAlign:"center",padding:"40px 0",color:"#aaa"}}>
          <div style={{fontSize:48}}>💬</div>
          <div style={{fontWeight:700,marginTop:8}}>Sin mensajes</div>
        </div>
      ) : (
        messages.map(m=>(
          <div key={m.id} style={{padding:"12px 0",borderBottom:"1px solid #f0f0f0",background:m.read?"transparent":"#F0FAE6",borderRadius:12,marginBottom:8,padding:"12px 14px"}}>
            <div style={{fontSize:11,color:th.a,fontWeight:800,marginBottom:4}}>{m.date}</div>
            <div style={{fontSize:14,fontWeight:600,color:"#333",lineHeight:1.5,whiteSpace:"pre-wrap"}}>{m.text}</div>
          </div>
        ))
      )}
    </div>
  );
});

// ─── CHILD TODAY ────────────────────────────────────────────────
const ChildToday = memo(function ChildToday({ kidId, kid, tasks, th, dispatch, mult }) {
  const todayIdx = getTodayIdx();
  const todayT = useMemo(
    () => tasks.filter(t => taskActiveToday(t.days)),
    [tasks]
  );
  const otherT = useMemo(
    () => tasks.filter(t => !taskActiveToday(t.days)),
    [tasks]
  );
  const doneCount = useMemo(
    () => todayT.filter(t => {
      const c = kid.completions[t.id];
      return c?.done && isToday(c.date);
    }).length,
    [todayT, kid.completions]
  );
  const msgs = kid.messages.filter(m => !m.read);

  return (
    <>
      {msgs.length>0&&(
        <div style={{background:`linear-gradient(135deg,${th.p}22,${th.a}11)`,border:`2px solid ${th.p}55`,borderRadius:18,padding:14,marginBottom:12}}>
          <div style={{fontWeight:900,fontSize:13,marginBottom:6}}>💬 Mensaje de papá/mamá</div>
          {msgs.slice(0,1).map(m=>(
            <div key={m.id} style={{fontSize:14,color:"#333",fontWeight:700,lineHeight:1.5}}>{m.text}</div>
          ))}
        </div>
      )}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"0 0 10px"}}>
        <h2 style={{fontWeight:900,fontSize:15,color:"#222"}}>📋 {DAY_FULL[todayIdx]}</h2>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {mult>1&&<span style={{background:PALETTE.error,borderRadius:50,padding:"2px 10px",fontSize:11,fontWeight:900,color:"#fff"}}>⚡ x{mult}</span>}
          <div style={{background:`${th.p}22`,borderRadius:50,padding:"4px 12px",fontSize:12,fontWeight:800,color:th.a}}>{doneCount}/{todayT.length} ✓</div>
        </div>
      </div>

      {todayT.map((task,i)=>(
        <TaskCard key={task.id} task={task} comp={kid.completions[task.id]} kidId={kidId} th={th} dispatch={dispatch} idx={i} mult={mult}/>
      ))}

      {otherT.length>0 && (
        <>
          <div style={{margin:"10px 0 8px",color:"#bbb",fontWeight:800,fontSize:11,letterSpacing:.5}}>🗓 OTROS DÍAS</div>
          {otherT.map(task=>(
            <div key={task.id} className="card" style={{opacity:.35,border:"2px solid #f0f0f0",padding:12}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{fontSize:22}}>{task.emoji}</div>
                <div style={{flex:1}}><div style={{fontWeight:800,fontSize:13}}>{task.name}</div><div style={{fontSize:11,color:"#999",fontWeight:600}}>{DAY_LABELS[task.days]}</div></div>
                <StarBadge n={task.stars}/>
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
});

function TaskCard({ task, comp, kidId, th, dispatch, idx, mult }) {
  const isTodayComp = comp && isToday(comp.date);
  const done=isTodayComp && comp?.done;
  const approved=isTodayComp && comp?.approved;
  const effStars=mult>1&&!done?Math.ceil(task.stars*mult):task.stars;
  const isSpecial=task.isSpecial;
  return (
    <div className="card" style={{border:approved?`2px solid ${th.a}`:done?`2px solid ${th.p}88`:`2px solid ${isSpecial?PALETTE.error:"#f0f0f0"}`,
      background:approved?th.l:done?`${th.p}09`:isSpecial?"#FFF5F5":"#fff",animation:`slideUp .35s ${idx*.04}s both`,overflow:"hidden"}}>
      {isSpecial&&<div style={{background:`linear-gradient(90deg,${PALETTE.error},#FF8C42)`,color:"#fff",fontSize:10,fontWeight:900,padding:"3px 12px",margin:"-16px -16px 10px",letterSpacing:1}}>🎯 MISIÓN ESPECIAL</div>}
      <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
        <div style={{width:4,height:48,background:CAT_CLR[task.cat]||th.p,borderRadius:4,flexShrink:0}}/>
        <div style={{fontSize:26,lineHeight:1}}>{task.emoji}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:800,fontSize:13,color:"#1a1a1a",textDecoration:approved?"line-through":"none",opacity:approved?.55:1}}>{task.name}</div>
          <div style={{display:"flex",gap:5,marginTop:3,flexWrap:"wrap"}}>
            <span style={{background:"#f0f0f0",borderRadius:50,padding:"1px 7px",fontSize:9,fontWeight:700,color:"#777"}}>⏱{task.dur}</span>
            <span style={{background:"#f0f0f0",borderRadius:50,padding:"1px 7px",fontSize:9,fontWeight:700,color:"#777"}}>🕐{task.time}</span>
            {task.deadline&&<span style={{background:"#FFE4E4",borderRadius:50,padding:"1px 7px",fontSize:9,fontWeight:700,color:PALETTE.error}}>📅{task.deadline}</span>}
          </div>
          {task.id===18&&(
            <button
              type="button"
              onClick={()=>{ if(typeof window!=="undefined"){ window.open("https://gamma.app/docs/ESTUDIO-DE-LAS-DISPENSACIONES-j0n2ufu1l7v2m8b","_blank","noopener,noreferrer"); } }}
              style={{marginTop:6,background:"#F0FAE6",border:`1px solid ${th.p}66`,borderRadius:12,padding:"4px 10px",fontSize:11,fontWeight:800,color:th.a,cursor:"pointer"}}
            >
              📜 Abrir estudio de las dispensaciones
            </button>
          )}
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:44,flexShrink:0}}>
          <StarBadge n={effStars}/>
          {mult>1&&!done&&<div style={{fontSize:8,color:PALETTE.error,fontWeight:900}}>x{mult}⚡</div>}
          <div style={{height:36,display:"flex",alignItems:"center",justifyContent:"center",marginTop:4}}>
            {!done
              ?<button onClick={()=>dispatch({type:"COMPLETE_TASK",kidId,taskId:task.id})}
                  style={{background:`linear-gradient(135deg,${th.p},${th.a})`,border:"none",borderRadius:50,width:36,height:36,cursor:"pointer",fontSize:18,color:"#fff",fontWeight:900,animation:"pulse 2s infinite",boxShadow:`0 4px 12px ${th.p}55`,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,padding:0}}>✓</button>
              :approved
                ?<div style={{width:36,height:36,borderRadius:"50%",background:th.a,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,lineHeight:1}}>✓</div>
                :<div style={{width:36,height:36,borderRadius:"50%",background:"#FFB800",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,lineHeight:1}}>⏳</div>}
          </div>
          {done&&approved&&comp?.approvedBy&&<span style={{fontSize:9,fontWeight:700,color:"#666",marginTop:2}}>{(comp.approvedBy==="mother"?"Mamá":"Papá")} aprobó</span>}
        </div>
      </div>
      {done&&!approved&&(
        <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid #f0f0f0"}}>
          {comp.evidence||comp.photoUrl
            ?<div style={{background:"#FFF3CC",borderRadius:10,padding:"4px 10px",fontSize:11,fontWeight:700,color:"#CC8800"}}>📎 Evidencia enviada · ⏳ Esperando aprobación</div>
            :<button onClick={()=>dispatch({type:"OPEN_MODAL",modal:{type:"evidence",kidId,taskId:task.id}})}
                style={{width:"100%",background:"#f8f8f8",border:`2px dashed ${th.p}77`,borderRadius:12,padding:8,cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:700,fontSize:12,color:"#888"}}>
                📎 Agregar foto / nota como evidencia
              </button>}
        </div>
      )}
    </div>
  );
}

// ─── CHILD LOGROS ───────────────────────────────────────────────
function ChildLogros({ kid, kidId, as, th }) {
  const lv=getLevel(as);
  const nextLv=getNextLevel(as);
  const euros=Math.floor(as/STARS_PER_EURO);
  const streak=kid.stats.streak||0;
   const hygieneStreak=kid.stats.hygieneStreak||0;
   const musicDays=kid.stats.musicDays||0;
   const wishes=kid.stats.wishApproved||0;

  return (
    <>
      {/* Level card */}
      <div className="card" style={{background:`linear-gradient(135deg,${th.p},${th.a})`,border:"none",marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div>
            <div style={{color:"rgba(255,255,255,.8)",fontSize:12,fontWeight:700}}>Tu nivel</div>
            <div style={{color:"#fff",fontSize:28,fontWeight:900,display:"flex",alignItems:"center",gap:8}}>{lv.icon} {lv.name}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{color:"rgba(255,255,255,.8)",fontSize:12,fontWeight:700}}>Total</div>
            <div style={{color:"#fff",fontSize:28,fontWeight:900}}>{as} ⭐</div>
          </div>
        </div>
        {nextLv?(
          <>
            <div style={{display:"flex",justifyContent:"space-between",color:"rgba(255,255,255,.8)",fontSize:11,fontWeight:700,marginBottom:4}}>
              <span>Hacia {nextLv.icon} {nextLv.name}</span><span>{as}/{nextLv.min}⭐</span>
            </div>
            <ProgressBar value={as-lv.min} max={nextLv.min-lv.min} color="rgba(255,255,255,.9)" height={8}/>
          </>
        ):<div style={{color:"rgba(255,255,255,.9)",fontWeight:900,textAlign:"center",marginTop:4}}>👑 ¡Has alcanzado el nivel máximo!</div>}
        {kid.bonusStars>0&&<div style={{marginTop:8,background:"rgba(255,255,255,.15)",borderRadius:10,padding:"4px 12px",fontSize:11,fontWeight:800,color:"#fff"}}>🏅 +{kid.bonusStars}⭐ bonus de logros</div>}
      </div>

      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        {[
          {icon:"🔥",label:"Racha actual",value:`${streak} días`},
          {icon:"💶",label:"Euros ganados",value:`${euros}€`},
          {icon:"✅",label:"Tareas totales",value:kid.stats.totalDone||0},
          {icon:"🏅",label:"Logros",value:kid.achievements.length},
          {icon:"🦷",label:"Racha de higiene",value:`${hygieneStreak} días`},
          {icon:"🎵",label:"Días de música",value:musicDays},
        ].map((s,i)=>(
          <div key={i} className="card" style={{textAlign:"center",padding:12,border:`2px solid ${th.p}33`}}>
            <div style={{fontSize:28}}>{s.icon}</div>
            <div style={{fontSize:20,fontWeight:900,color:th.a,margin:"2px 0"}}>{s.value}</div>
            <div style={{fontSize:11,color:"#888",fontWeight:700}}>{s.label}</div>
          </div>
        ))}
      </div>

      <h3 style={{fontWeight:900,margin:"4px 0 4px",color:"#333"}}>🏅 Medallas</h3>
      <p style={{fontSize:11,color:"#777",margin:"0 0 10px"}}>
        Completa tareas, mantén tus rachas y cumple deseos para ir desbloqueando nuevas medallas y estrellas bonus.
      </p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {ACHIEV.map(a=>{
          const unlocked=kid.achievements.includes(a.id);
          return (
            <div key={a.id} className="card" style={{textAlign:"center",border:unlocked?`2.5px solid ${th.p}99`:"2px solid #f0f0f0",background:unlocked?`${th.p}12`:"#fafafa",opacity:unlocked?1:.4,padding:12,animation:unlocked?"levelUp .5s both":"none"}}>
              <div style={{fontSize:32,filter:unlocked?"none":"grayscale(1)",marginBottom:4}}>{a.emoji}</div>
              <div style={{fontWeight:900,fontSize:12,color:"#222"}}>{a.label}</div>
              <div style={{fontSize:10,color:"#888",marginTop:2,lineHeight:1.3}}>{a.desc}</div>
              {unlocked?<div style={{marginTop:6,background:th.p,borderRadius:8,padding:"2px 8px",fontSize:10,fontWeight:900,color:"#fff",display:"inline-block"}}>+{a.bonus}⭐ bonus</div>
               :<div style={{marginTop:4,fontSize:10,color:"#ccc",fontWeight:700}}>{"⭐".repeat(a.diff)} dificultad</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── CHILD TIENDA ───────────────────────────────────────────────
const ChildTienda = memo(function ChildTienda({ kidId, kid, tasks, th, dispatch, avail }) {
  const [activeTab,setActiveTab]=useState("privilegios");

  return (
    <>
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        {[{id:"privilegios",label:"🛍️ Privilegios"},{id:"deseos",label:"🌠 Deseos"}].map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)}
            style={{flex:1,borderRadius:50,padding:"8px",border:"none",cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:13,background:activeTab===t.id?th.p:"#f0f0f0",color:activeTab===t.id?"#fff":"#888",transition:"all .2s"}}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{background:`${th.p}15`,border:`2px solid ${th.p}55`,borderRadius:16,padding:"10px 16px",marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <span style={{fontWeight:700,fontSize:13,color:th.a}}>⭐ Estrellas disponibles para canjear</span>
          <span style={{fontWeight:900,fontSize:22,color:th.a}}>{avail}</span>
        </div>
        <div style={{fontSize:11,color:"#555",fontWeight:600}}>
          En <strong>Privilegios</strong> las estrellas se <strong>gastan</strong> para cosas como pantalla extra o elegir la cena.
          En <strong>Deseos</strong> escribes metas grandes (por ejemplo un libro, una excursión o un curso); papá/mamá las aprueban, pero no gastan estrellas.
        </div>
      </div>

      {activeTab==="privilegios"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {PRIVILEGES.map(p=>{
            const canAfford=avail>=p.cost;
            const owned=kid.privileges.filter(pr=>pr.item.id===p.id).length;
            return (
              <div key={p.id} className="card" style={{textAlign:"center",border:canAfford?`2.5px solid ${th.p}66`:"2px solid #f0f0f0",opacity:canAfford?1:.65,padding:14}}>
                <div style={{fontSize:36,marginBottom:6}}>{p.emoji}</div>
                <div style={{fontWeight:900,fontSize:12,color:"#222"}}>{p.name}</div>
                <div style={{fontSize:10,color:"#888",margin:"4px 0"}}>{p.desc}</div>
                <div style={{fontWeight:900,color:"#CC8800",fontSize:13,marginBottom:8}}>{p.cost} ⭐</div>
                {owned>0&&<div style={{fontSize:10,color:th.a,fontWeight:800,marginBottom:4}}>Tengo: {owned}</div>}
                <button onClick={()=>dispatch({type:"REDEEM_PRIVILEGE",kidId,privId:p.id})} disabled={!canAfford}
                  style={{width:"100%",background:canAfford?`linear-gradient(135deg,${th.p},${th.a})`:"#f0f0f0",color:canAfford?"#fff":"#aaa",border:"none",borderRadius:12,padding:"8px",fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:13,cursor:canAfford?"pointer":"not-allowed"}}>
                  {canAfford?"✨ Canjear":"⭐ Faltan "+(p.cost-avail)}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {activeTab==="deseos"&&(
        <>
          <button onClick={()=>dispatch({type:"OPEN_MODAL",modal:{type:"addWish",kidId}})}
            style={{width:"100%",background:`linear-gradient(135deg,${th.p},${th.a})`,color:"#fff",border:"none",borderRadius:20,padding:"14px",fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:15,cursor:"pointer",marginBottom:12}}>
            🌠 Añadir nuevo deseo
          </button>
          {kid.wishlist.length===0
            ?<div style={{textAlign:"center",padding:"40px 0",color:"#ccc"}}><div style={{fontSize:48}}>🌠</div><div style={{fontWeight:700,marginTop:8}}>Aún no tienes deseos</div><div style={{fontSize:13,marginTop:4}}>Añade lo que quieres conseguir</div></div>
            :kid.wishlist.map(w=>(
              <div key={w.id} className="card" style={{display:"flex",alignItems:"center",gap:12,border:w.approved?`2px solid #8DC63F`:w.denied?`2px solid ${PALETTE.error}`:"2px solid #f0f0f0",background:w.approved?"#F0FFF4":w.denied?"#FFF0F0":"#fff"}}>
                <div style={{fontSize:30}}>{w.emoji||"🌟"}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,fontSize:14}}>{w.name}</div>
                  <div style={{fontWeight:900,color:"#CC8800",fontSize:13}}>{w.cost} ⭐</div>
                </div>
                {w.approved&&<div style={{fontWeight:800,color:"#4A7A1E",fontSize:13}}>✅ Aprobado</div>}
                {w.denied&&<div style={{fontWeight:800,color:PALETTE.error,fontSize:13}}>❌ Denegado</div>}
                {!w.approved&&!w.denied&&<div style={{fontWeight:700,color:"#888",fontSize:12}}>⏳ Pendiente</div>}
              </div>
            ))}
        </>
      )}
    </>
  );
});

// ─── CHILD MÁS ──────────────────────────────────────────────────
const ChildMas = memo(function ChildMas({ kidId, kid, th, dispatch, challenges }) {
  const [subTab,setSubTab]=useState("gratitud");
  const myChallenges=challenges.filter(c=>c.kid1===kidId||c.kid2===kidId);

  return (
    <>
      <div style={{display:"flex",gap:8,marginBottom:12,overflowX:"auto"}}>
        {[{id:"gratitud",label:"📝 Gratitud"},{id:"retos",label:"⚔️ Retos"},{id:"semana",label:"📅 Semana"}].map(t=>(
          <button key={t.id} onClick={()=>setSubTab(t.id)}
            style={{whiteSpace:"nowrap",borderRadius:50,padding:"8px 14px",border:"none",cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:12,background:subTab===t.id?th.p:"#f0f0f0",color:subTab===t.id?"#fff":"#888",transition:"all .2s"}}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab==="gratitud"&&(
        <>
          <button onClick={()=>dispatch({type:"OPEN_MODAL",modal:{type:"gratitude",kidId}})}
            style={{width:"100%",background:`linear-gradient(135deg,${th.p},${th.a})`,color:"#fff",border:"none",borderRadius:20,padding:14,fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:15,cursor:"pointer",marginBottom:12}}>
            📝 Escribir gratitud de hoy
          </button>
          {kid.gratitude.length===0
            ?<div style={{textAlign:"center",padding:"40px 0",color:"#ccc"}}><div style={{fontSize:48}}>🙏</div><div style={{fontWeight:700,marginTop:8}}>Tu diario de gratitud</div><div style={{fontSize:13,marginTop:4}}>Escribe algo por lo que estás agradecido</div></div>
            :kid.gratitude.map(g=>(
              <div key={g.id} className="card" style={{border:`2px solid ${th.p}33`,background:`${th.p}09`}}>
                <div style={{fontSize:11,color:th.a,fontWeight:800,marginBottom:4}}>📅 {g.date}</div>
                <div style={{fontSize:14,fontWeight:700,color:"#333",lineHeight:1.5}}>{g.text}</div>
              </div>
            ))}
        </>
      )}

      {subTab==="retos"&&(
        <>
          <div className="card" style={{background:"linear-gradient(135deg,#FFF9E6,#FFFBCC)",border:"2px solid #FFB800"}}>
            <div style={{fontWeight:900,fontSize:14,marginBottom:8}}>⚔️ Retos con tu hermano</div>
            {myChallenges.length===0
              ?<div style={{textAlign:"center",padding:"20px 0",color:"#aaa",fontSize:13}}>No hay retos activos.<br/>Los padres pueden crear retos desde su panel.</div>
              :myChallenges.map(c=>{
                const isKid1=c.kid1===kidId;
                const myCount=isKid1?c.count1:c.count2;
                const theirCount=isKid1?c.count2:c.count1;
                const opId=isKid1?c.kid2:c.kid1;
                return (
                  <div key={c.id} style={{background:"rgba(255,255,255,.6)",borderRadius:14,padding:12,marginBottom:8}}>
                    <div style={{fontWeight:800,fontSize:13}}>{c.taskName}</div>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:8,alignItems:"center"}}>
                      <div style={{textAlign:"center"}}><div style={{fontSize:24,fontWeight:900,color:th.p}}>{myCount}</div><div style={{fontSize:11,color:th.a,fontWeight:700}}>Tú</div></div>
                      <div style={{fontSize:16,color:"#aaa"}}>vs</div>
                      <div style={{textAlign:"center"}}><div style={{fontSize:24,fontWeight:900,color:TH[opId].p}}>{theirCount}</div><div style={{fontSize:11,color:TH[opId].a,fontWeight:700}}>{opId==="jose"?"José":"David"}</div></div>
                    </div>
                    {c.winner&&<div style={{textAlign:"center",fontWeight:900,color:c.winner===kidId?"#4A7A1E":PALETTE.error,marginTop:6}}>{c.winner===kidId?"🏆 ¡Ganaste!":"😅 Perdiste esta vez"}</div>}
                    <div style={{fontSize:11,color:"#aaa",marginTop:4}}>Hasta: {c.deadline}</div>
                  </div>
                );
              })}
          </div>
        </>
      )}

      {subTab==="semana"&&<KidWeekCalendar kid={kid} tasks={[]} th={th}/>}
    </>
  );
});

function KidWeekCalendar({ kid, th }) {
  const todayIdx=getTodayIdx();
  return (
    <div>
      <div className="card">
        <h3 style={{fontWeight:900,marginBottom:14}}>📅 Esta semana</h3>
        <div style={{display:"flex",gap:6}}>
          {DAY_SHORT.map((d,i)=>{
            const isToday=i===todayIdx, isFuture=i>todayIdx;
            const pct=isToday?0.5:isFuture?0:Math.random();
            return (
              <div key={i} style={{flex:1,textAlign:"center"}}>
                <div style={{fontSize:10,fontWeight:800,color:isToday?th.p:"#aaa",marginBottom:4}}>{d}</div>
                <div style={{position:"relative",height:70,background:"#f5f5f5",borderRadius:12,overflow:"hidden",border:isToday?`2.5px solid ${th.p}`:"2px solid transparent"}}>
                  <div style={{position:"absolute",bottom:0,left:0,right:0,height:`${pct*100}%`,background:isFuture?"#e0e0e0":`linear-gradient(180deg,${th.p},${th.a})`,borderRadius:10,transition:"height .8s"}}/>
                </div>
                <div style={{fontSize:9,fontWeight:800,color:"#888",marginTop:3}}>{isFuture?"–":Math.round(pct*100)+"%"}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="card" style={{background:`linear-gradient(135deg,${th.l},#fff)`,border:`2px solid ${th.p}44`}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{fontSize:48}}>🔥</div>
          <div>
            <div style={{fontSize:32,fontWeight:900,color:th.p}}>{kid.stats.streak||0}</div>
            <div style={{fontWeight:800,color:"#333"}}>días seguidos</div>
            <div style={{fontSize:12,color:"#888",fontWeight:600}}>¡Sigue así! 💪</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MONEY PANEL — shared kid/parent
// ═══════════════════════════════════════════════════════════════════════
const MoneyPanel = memo(function MoneyPanel({ kidId, kid, tasks, th, isParent, dispatch, approvalLog }) {
  const as = useMemo(() => approvedStars(kid, tasks), [kid, tasks]);
  const te = Math.floor(as/STARS_PER_EURO);
  const paid = paidOut(kid);
  const bal = te - paid;
  const kname=kid.name||(kidId==="jose"?"José":"David");

  return (
    <>
      <div className="card" style={{background:`linear-gradient(135deg,${th.p}22,${th.l})`,border:`2px solid ${th.p}55`}}>
        <h3 style={{fontWeight:900,marginBottom:14}}>💶 {isParent?`${kname} — `:""} Dinero</h3>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          {[
            {label:"⭐ Estrellas aprobadas",value:as,color:"#CC8800"},
            {label:"💶 Euros ganados",value:`${te}€`,color:TH.parent.a},
            {label:"✅ Entregado",value:`${paid}€`,color:"#4A7A1E"},
            {label:"🏦 Por cobrar",value:`${bal}€`,color:bal>0?"#FF6B35":"#888"},
          ].map((s,i)=>(
            <div key={i} style={{background:"#fff",borderRadius:16,padding:12,textAlign:"center",boxShadow:"0 2px 8px rgba(0,0,0,.05)"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#888",marginBottom:2}}>{s.label}</div>
              <div style={{fontSize:24,fontWeight:900,color:s.color}}>{s.value}</div>
            </div>
          ))}
        </div>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:11,fontWeight:700,color:"#888",marginBottom:4}}>
            <span>Próximo euro</span><span>{as%STARS_PER_EURO}/{STARS_PER_EURO}⭐</span>
          </div>
          <ProgressBar value={as%STARS_PER_EURO} max={STARS_PER_EURO} color={`linear-gradient(90deg,${th.p},${th.a})`} height={10}/>
        </div>
      </div>

      {isParent&&bal>0&&(
        <button onClick={()=>dispatch({type:"OPEN_MODAL",modal:{type:"payment",kidId,maxAmount:bal,kidName:kname}})}
          style={{width:"100%",background:"linear-gradient(135deg,#4A7A1E,#2D5010)",color:"#fff",border:"none",borderRadius:20,padding:15,fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:15,cursor:"pointer",marginBottom:12}}>
          💶 Registrar entrega de dinero
        </button>
      )}

      <div className="card">
        <h4 style={{fontWeight:900,marginBottom:10}}>Historial detallado</h4>
        {kid.payments.length===0 && (approvalLog||[]).filter(l=>l.kidId===kidId).length===0
          ?<div style={{textAlign:"center",color:"#ccc",padding:"20px 0",fontWeight:700}}>Sin movimientos aún</div>
          :(
            <>
              {(approvalLog||[]).filter(l=>l.kidId===kidId).slice(0,10).map(l=>(
                <div key={l.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #f5f5f5"}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:13}}>{l.approved?"✅":"❌"} {l.taskName}</div>
                    <div style={{fontSize:11,color:"#888",fontWeight:600}}>{l.date} · {l.approved ? `+${l.stars||1}⭐` : "Rechazada"}</div>
                  </div>
                </div>
              ))}
              {kid.payments.map((p,i)=>(
                <div key={`pay-${i}`} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #f5f5f5"}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:13}}>💶 {p.amount}€ entregado</div>
                    <div style={{fontSize:11,color:"#888",fontWeight:600}}>{p.date}{p.note?` · ${p.note}`:""}</div>
                  </div>
                  <div style={{fontWeight:900,color:"#4A7A1E",fontSize:16}}>✅</div>
                </div>
              ))}
            </>
          )}
      </div>

      <div className="card" style={{background:"#FFF3CC",border:"2px solid #FFD966"}}>
        <div style={{fontSize:12,fontWeight:700,color:"#CC8800",lineHeight:1.6}}>
          💡 Cada <strong>30⭐</strong> = <strong>1€</strong> de recompensa.<br/>
          Las estrellas bonus de logros y privilegios también cuentan.
        </div>
      </div>
    </>
  );
});

// ═══════════════════════════════════════════════════════════════════════
// PARENT SCREEN
// ═══════════════════════════════════════════════════════════════════════
const PARENT_ROLE_LABEL = { father: "Papá", mother: "Mamá" };
function ParentScreen({ st, dispatch, onRequestNotif, showNotifPrompt, roleData }) {
  const parentRole = (roleData?.role === "mother" || roleData?.role === "father") ? roleData.role : "father";
  const currentParent = st.parents?.[parentRole] || { photo: null, name: PARENT_ROLE_LABEL[parentRole] };
  const th = parentRole === "mother" ? { ...TH.parent, p: "#E91E8C", a: "#C2185B", l: "#FCE4EC", d: "#880E4F" } : TH.parent;
  const pendingN=st.notifications.filter(n=>!n.read);
  const tabs=[
    {id:"notifs",icon:"🔔",label:"Alertas",badge:pendingN.length},
    {id:"tareas",icon:"📋",label:"Tareas"},
    {id:"mensajes",icon:"💬",label:"Mensajes"},
    {id:"dinero",icon:"💶",label:"Dinero"},
    {id:"ranking",icon:"🏆",label:"Ranking"},
    {id:"config",icon:"⚙️",label:"Config"},
  ];

  return (
    <div className="screen" style={{background:th.l}}>
      {/* Header */}
      <div className="screen-header" style={{background:`linear-gradient(135deg,${th.a},${th.d})`,position:"relative",borderRadius:"0 0 28px 28px"}}>
        <button onClick={()=>logoutFirebase()} className="logout-btn">🚪</button>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,paddingRight:48}}>
          <Avatar photo={currentParent.photo} emoji={parentRole==="father"?"👨":"👩"} size={52} color="#fff"
            onClick={ph=>dispatch({type:"SET_PARENT_PHOTO",photo:ph,parentRole})}/>
          <div style={{flex:1,minWidth:0}}>
            <p style={{color:"rgba(255,255,255,.75)",fontSize:11,fontWeight:700}}>Panel de {parentRole==="father"?"padre":"madre"}</p>
            <h1 style={{color:"#fff",fontSize:22,fontWeight:900,lineHeight:1}}>{currentParent.name||PARENT_ROLE_LABEL[parentRole]} {parentRole==="father"?"👨":"👩"}</h1>
          </div>
        </div>

        <div style={{display:"flex",gap:10}}>
          {["jose","david"].map(id=>{
            const k=st.kids[id];
            const as=approvedStars(k,st.tasks);
            const pending=Object.values(k.completions).filter(v=>v.done&&!v.approved).length;
            const kth=TH[id];
            return (
              <div key={id} style={{flex:1,background:"rgba(255,255,255,.18)",borderRadius:16,padding:"10px 12px",border:`2px solid rgba(255,255,255,.3)`,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                  <Avatar photo={k.photo} emoji={id==="jose"?"👦🏻":"👦"} size={30} color="#fff"/>
                  <div style={{color:"#fff",fontWeight:900,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{k.name}</div>
                </div>
                <div style={{color:"rgba(255,255,255,.9)",fontSize:11,fontWeight:700}}>{getLevel(as).icon} {getLevel(as).name}</div>
                <div style={{color:"rgba(255,255,255,.9)",fontSize:11,fontWeight:700}}>⭐ {as} · 💶 {balance(k,st.tasks)}€</div>
                {pending>0&&<div style={{background:PALETTE.error,borderRadius:8,padding:"2px 8px",fontSize:11,fontWeight:900,color:"#fff",marginTop:4,display:"inline-block"}}>{pending} ⏳</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="scroll-body">
        {showNotifPrompt&&onRequestNotif&&(
          <button onClick={onRequestNotif} style={{width:"100%",background:"linear-gradient(135deg,#4A7A1E,#2D5010)",color:"#fff",border:"none",borderRadius:16,padding:14,fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:14,cursor:"pointer",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            🔔 Activar notificaciones — recibirás avisos cuando los niños completen tareas
          </button>
        )}

        {st.parentTab==="notifs"   && <ParentNotifs st={st} dispatch={dispatch} parentRole={parentRole}/>}
        {st.parentTab==="tareas"   && <ParentTareas st={st} dispatch={dispatch}/>}
        {st.parentTab==="mensajes" && <ParentMensajesYGratitud st={st} dispatch={dispatch}/>}
        {st.parentTab==="dinero"   && <ParentDinero st={st} dispatch={dispatch}/>}
        {st.parentTab==="ranking"  && <ParentRanking st={st} dispatch={dispatch}/>}
        {st.parentTab==="config"   && <ParentConfig st={st} dispatch={dispatch} parentRole={parentRole} currentParent={currentParent}/>}
      </div>

      <div className="tab-bar">
        {tabs.map(t=>(
          <div key={t.id} className="tab-item" onClick={()=>dispatch({type:"SET_PARENT_TAB",tab:t.id})}>
            <span className="ti">{t.icon}</span>
            <span className="tl" style={{color:st.parentTab===t.id?th.p:"#bbb"}}>{t.label}</span>
            {t.badge>0&&<span className="badge">{t.badge}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PARENT NOTIFS ──────────────────────────────────────────────
const ParentNotifs = memo(function ParentNotifs({ st, dispatch, parentRole }) {
  if(st.notifications.length===0)
    return <div style={{textAlign:"center",padding:"60px 0",color:"#ccc"}}><div style={{fontSize:60}}>🔔</div><div style={{fontWeight:700,marginTop:8}}>Sin notificaciones</div></div>;

  return (
    <>
      {/* Wish notifications from kids */}
      {["jose","david"].map(id=>st.kids[id].wishlist.filter(w=>!w.approved&&!w.denied).map(w=>(
        <div key={w.id} className="card" style={{border:"2px solid #FFB80088",background:"#FFFBEA",animation:"slideUp .3s both"}}>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <div style={{fontSize:28}}>{w.emoji||"🌟"}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:800,fontSize:13}}>{st.kids[id].name} quiere: {w.name}</div>
              <div style={{fontSize:12,color:"#888",fontWeight:600}}>🌠 Deseo · {w.cost}⭐</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button onClick={()=>dispatch({type:"APPROVE_WISH",kidId:id,wishId:w.id})}
              style={{flex:1,background:"linear-gradient(135deg,#8DC63F,#5A9A20)",color:"#fff",border:"none",borderRadius:14,padding:10,fontFamily:"'Nunito',sans-serif",fontWeight:900,cursor:"pointer",fontSize:13}}>✅ Aprobar</button>
            <button onClick={()=>dispatch({type:"DENY_WISH",kidId:id,wishId:w.id})}
              style={{flex:1,background:"#fff",color:PALETTE.error,border:`2px solid ${PALETTE.error}`,borderRadius:14,padding:10,fontFamily:"'Nunito',sans-serif",fontWeight:900,cursor:"pointer",fontSize:13}}>❌ Denegar</button>
          </div>
        </div>
      )))}

      {st.notifications.filter(n=>n.type==="task").map(n=>{
        const k=st.kids[n.kidId];
        const task=st.tasks.find(t=>t.id===n.taskId);
        const comp=k.completions[n.taskId];
        const kth=TH[n.kidId];
        const approvedByLabel = comp?.approvedBy ? (comp.approvedBy === "mother" ? "Mamá" : "Papá") : null;
        return (
          <div key={n.id} className="card" style={{border:n.read?`2px solid #f0f0f0`:`2px solid ${kth.p}`,animation:"slideUp .3s both"}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <Avatar photo={k.photo} emoji={n.kidId==="jose"?"👦🏻":"👦"} size={44} color={kth.p}/>
              <div style={{flex:1}}>
                <div style={{fontWeight:800,fontSize:14}}>{k.name} completó:</div>
                <div style={{color:"#555",fontSize:13,fontWeight:600}}>{task?.emoji} {task?.name}</div>
                {(comp?.evidence||comp?.photoUrl)&&<div style={{background:"#FFF3CC",borderRadius:8,padding:"3px 10px",fontSize:11,fontWeight:700,color:"#CC8800",marginTop:4,display:"inline-block"}}>📎 Con evidencia</div>}
                {comp?.photoUrl&&<div style={{marginTop:6,width:60,height:60,borderRadius:10,overflow:"hidden"}}><img src={comp.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>}
                <div style={{fontSize:11,color:"#bbb",marginTop:3}}>{n.time}</div>
              </div>
              <StarBadge n={task?.stars||1}/>
            </div>
            {!comp?.approved&&(
              <div style={{display:"flex",gap:8,marginTop:10}}>
                <button onClick={()=>dispatch({type:"OPEN_MODAL",modal:{type:"approveTask",notifId:n.id,kidId:n.kidId,taskId:n.taskId,taskName:task?.name}})}
                  style={{flex:2,background:"linear-gradient(135deg,#8DC63F,#5A9A20)",color:"#fff",border:"none",borderRadius:14,padding:11,fontFamily:"'Nunito',sans-serif",fontWeight:900,cursor:"pointer",fontSize:13}}>✅ Aprobar</button>
                <button onClick={()=>dispatch({type:"OPEN_MODAL",modal:{type:"rejectTask",notifId:n.id,kidId:n.kidId,taskId:n.taskId,taskName:task?.name,rejectedBy:parentRole}})}
                  style={{flex:1,background:"#fff",color:PALETTE.error,border:`2px solid ${PALETTE.error}`,borderRadius:14,padding:11,fontFamily:"'Nunito',sans-serif",fontWeight:900,cursor:"pointer",fontSize:13}}>❌ Rechazar</button>
              </div>
            )}
            {comp?.approved&&<div style={{textAlign:"center",color:"#8DC63F",fontWeight:800,marginTop:8,fontSize:13}}>✅ Aprobada{approvedByLabel ? ` por ${approvedByLabel}` : ""}</div>}
          </div>
        );
      })}

      {/* Privilege notifications */}
      {st.notifications.filter(n=>n.type==="privilege").map(n=>(
        <div key={n.id} className="card" style={{border:"2px solid #FFB80088",animation:"slideUp .3s both"}}>
          <div style={{fontWeight:800}}>{st.kids[n.kidId].name} canjeó: {n.privName} 🎉</div>
          <div style={{fontSize:12,color:"#888",marginTop:4}}>{n.time}</div>
        </div>
      ))}
    </>
  );
});

// ─── PARENT MENSAJES Y GRATITUD ─────────────────────────────────
function ParentMensajesYGratitud({ st, dispatch }) {
  return (
    <>
      <div className="card" style={{marginBottom:12}}>
        <h3 style={{fontWeight:900,marginBottom:4}}>💬 Centro de mensajes</h3>
        <p style={{fontSize:12,color:"#666",marginBottom:14}}>Mensajes enviados a los niños (y motivos de rechazo). Podéis editar o eliminar cualquiera.</p>
        {["jose","david"].map(id=>{
          const k=st.kids[id];
          const msgs=[...(k.messages||[])].reverse();
          const kth=TH[id];
          return (
            <div key={id} style={{marginBottom:20}}>
              <div style={{fontWeight:900,fontSize:13,color:kth.a,marginBottom:8}}>{id==="jose"?"👦🏻 José":"👦 David"}</div>
              {msgs.length===0 ? (
                <div style={{fontSize:12,color:"#aaa",padding:"8px 0"}}>Sin mensajes</div>
              ) : (
                msgs.map(m=>(
                  <div key={m.id} style={{background:"#f9f9f9",borderRadius:12,padding:"12px 14px",marginBottom:8,border:"1px solid #eee"}}>
                    <div style={{fontSize:11,color:"#888",marginBottom:4}}>{m.date}</div>
                    <div style={{fontSize:14,color:"#333",lineHeight:1.5,whiteSpace:"pre-wrap"}}>{m.text}</div>
                    <div style={{display:"flex",gap:8,marginTop:10}}>
                      <button onClick={()=>dispatch({type:"OPEN_MODAL",modal:{type:"editMessage",kidId:id,messageId:m.id,currentText:m.text}})}
                        style={{background:"#FFB800",color:"#fff",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:800,cursor:"pointer"}}>✏️ Editar</button>
                      <button onClick={()=>dispatch({type:"DELETE_MESSAGE",kidId:id,messageId:m.id})}
                        style={{background:"#fff",color:PALETTE.error,border:`2px solid ${PALETTE.error}`,borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:800,cursor:"pointer"}}>🗑️ Eliminar</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
      <div className="card">
        <h3 style={{fontWeight:900,marginBottom:4}}>📝 Gratitud de hoy (niños)</h3>
        <p style={{fontSize:12,color:"#666",marginBottom:14}}>Lo que escriben los niños en su sección de gratitud.</p>
        {["jose","david"].map(id=>{
          const k=st.kids[id];
          const grat=[...(k.gratitude||[])].reverse();
          const kth=TH[id];
          return (
            <div key={id} style={{marginBottom:16}}>
              <div style={{fontWeight:900,fontSize:13,color:kth.a,marginBottom:8}}>{id==="jose"?"👦🏻 José":"👦 David"}</div>
              {grat.length===0 ? (
                <div style={{fontSize:12,color:"#aaa",padding:"8px 0"}}>Aún no ha escrito gratitud</div>
              ) : (
                grat.map(g=>(
                  <div key={g.id} style={{background:`${kth.p}11`,borderRadius:12,padding:"12px 14px",marginBottom:8,border:`1px solid ${kth.p}33`}}>
                    <div style={{fontSize:11,color:kth.a,fontWeight:700,marginBottom:4}}>📅 {g.date}</div>
                    <div style={{fontSize:14,color:"#333",lineHeight:1.5}}>{g.text}</div>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── PARENT TAREAS ──────────────────────────────────────────────
function ParentTareas({ st, dispatch }) {
  const byDay={todos:[],lv:[],sab:[],dom:[]};
  st.tasks.forEach(t=>{
    const k=t.days||"todos";
    if(k==="finde"){
      byDay.sab.push(t);
      byDay.dom.push(t);
      return;
    }
    if(byDay[k]) byDay[k].push(t); else byDay.todos.push(t);
  });
  const sections=[{k:"todos",l:"🌞 Todos los días"},{k:"lv",l:"📚 Lun–Vie"},{k:"sab",l:"🧹 Sábado"},{k:"dom",l:"🏡 Domingo"}];

  return (
    <>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"12px 0"}}>
        <h3 style={{fontWeight:900,color:"#222"}}>Gestión de tareas ({st.tasks.length})</h3>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>dispatch({type:"OPEN_MODAL",modal:{type:"addTask"}})}
            style={{background:"linear-gradient(135deg,#FFB800,#CC8800)",color:"#fff",border:"none",borderRadius:14,padding:"7px 14px",fontFamily:"'Nunito',sans-serif",fontWeight:900,cursor:"pointer",fontSize:13}}>+ Nueva</button>
          <button onClick={()=>dispatch({type:"OPEN_MODAL",modal:{type:"challenge"}})}
            style={{background:"linear-gradient(135deg,#FF6B35,#CC4400)",color:"#fff",border:"none",borderRadius:14,padding:"7px 14px",fontFamily:"'Nunito',sans-serif",fontWeight:900,cursor:"pointer",fontSize:13}}>⚔️ Reto</button>
        </div>
      </div>

      {sections.map(sec=>{
        const tasks=byDay[sec.k];
        if(!tasks||tasks.length===0) return null;
        return (
          <div key={sec.k} style={{marginBottom:8}}>
            <div style={{fontWeight:900,fontSize:12,color:"#888",marginBottom:6,letterSpacing:.5}}>{sec.l}</div>
            {tasks.map(task=>(
              <div key={task.id} className="card" style={{display:"flex",alignItems:"center",gap:10,padding:12,border:task.isSpecial?`2px solid ${PALETTE.error}`:"2px solid transparent",background:task.isSpecial?"#FFF5F5":"#fff"}}>
                <div style={{width:4,height:36,background:CAT_CLR[task.cat]||"#ddd",borderRadius:4,flexShrink:0}}/>
                <div style={{fontSize:20}}>{task.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:800,fontSize:13}}>{task.name}{task.isSpecial?" 🎯":""}</div>
                  <div style={{fontSize:11,color:"#999",fontWeight:600}}>{task.time} · {task.dur}{task.deadline?` · 📅${task.deadline}`:""}</div>
                </div>
                <StarBadge n={task.stars}/>
                <button onClick={()=>dispatch({type:"OPEN_MODAL",modal:{type:"editTask",task}})}
                  style={{background:"#f0f0f0",border:"none",borderRadius:10,padding:"5px 10px",cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:12,color:"#555"}}>✏️</button>
              </div>
            ))}
          </div>
        );
      })}

      {/* Approval log */}
      {st.approvalLog.length>0&&(
        <>
          <h3 style={{fontWeight:900,margin:"12px 0 8px",color:"#333"}}>📋 Historial de aprobaciones</h3>
          {st.approvalLog.slice(0,8).map(l=>(
            <div key={l.id} style={{display:"flex",gap:10,alignItems:"center",padding:"8px 0",borderBottom:"1px solid #f5f5f5"}}>
              <div style={{fontSize:14}}>{l.approved?"✅":"❌"}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13}}>{l.taskName}</div>
                <div style={{fontSize:11,color:"#aaa"}}>{l.kidId==="jose"?"José":"David"} · {l.date}{l.approvedBy ? ` · ${l.approvedBy==="mother"?"Mamá":"Papá"} aprobó` : ""}{l.rejectedBy ? ` · ${l.rejectedBy==="mother"?"Mamá":"Papá"} rechazó` : ""}</div>
              </div>
              {l.approved&&<StarBadge n={l.stars||1}/>}
            </div>
          ))}
        </>
      )}
    </>
  );
}

// ─── PARENT DINERO ──────────────────────────────────────────────
function ParentDinero({ st, dispatch }) {
  const [activeKid,setActiveKid]=useState("jose");
  const kid=st.kids[activeKid];
  return (
    <>
      <div style={{display:"flex",gap:8,margin:"12px 0"}}>
        {["jose","david"].map(id=>(
          <button key={id} onClick={()=>setActiveKid(id)}
            style={{flex:1,borderRadius:14,padding:10,border:"none",cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:14,background:activeKid===id?TH[id].p:"#f0f0f0",color:activeKid===id?"#fff":"#888",transition:"all .2s"}}>
            {id==="jose"?"👦🏻 José":"👦 David"}
          </button>
        ))}
      </div>

      {/* Wishlist management */}
      {kid.wishlist.filter(w=>!w.approved&&!w.denied).length>0&&(
        <div className="card" style={{border:"2px solid #FFB80066",background:"#FFFBEA",marginBottom:8}}>
          <div style={{fontWeight:900,fontSize:13,marginBottom:8}}>🌠 Deseos pendientes de {kid.name}</div>
          {kid.wishlist.filter(w=>!w.approved&&!w.denied).map(w=>(
            <div key={w.id} style={{display:"flex",gap:10,alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:24}}>{w.emoji||"🌟"}</div>
              <div style={{flex:1}}><div style={{fontWeight:800,fontSize:13}}>{w.name}</div><div style={{fontSize:11,color:"#CC8800",fontWeight:700}}>{w.cost}⭐</div></div>
              <button onClick={()=>dispatch({type:"APPROVE_WISH",kidId:activeKid,wishId:w.id})} style={{background:"#8DC63F",color:"#fff",border:"none",borderRadius:10,padding:"4px 10px",cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:12}}>✅</button>
              <button onClick={()=>dispatch({type:"DENY_WISH",kidId:activeKid,wishId:w.id})} style={{background:"#fff",color:PALETTE.error,border:`2px solid ${PALETTE.error}`,borderRadius:10,padding:"4px 10px",cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:12}}>❌</button>
            </div>
          ))}
        </div>
      )}

      <MoneyPanel kidId={activeKid} kid={kid} tasks={st.tasks} th={TH[activeKid]} isParent={true} dispatch={dispatch} approvalLog={st.approvalLog}/>
    </>
  );
}

// ─── PARENT RANKING ─────────────────────────────────────────────
function ParentRanking({ st, dispatch }) {
  const kids=["jose","david"].map(id=>({
    id, kid:st.kids[id], as:approvedStars(st.kids[id],st.tasks), lv:getLevel(approvedStars(st.kids[id],st.tasks)),
    euros:totalEuros(st.kids[id],st.tasks), done:Object.values(st.kids[id].completions).filter(v=>v.done).length,
    ach:st.kids[id].achievements.length, streak:st.kids[id].stats.streak||0,
  })).sort((a,b)=>b.as-a.as);

  return (
    <>
      <div className="card" style={{background:"linear-gradient(135deg,#FFF9E6,#FFFBCC)",border:"2px solid #FFB800",margin:"12px 0 12px"}}>
        <h3 style={{fontWeight:900,color:"#CC8800",marginBottom:14}}>🏆 Clasificación</h3>
        {kids.map((k,i)=>{
          const kth=TH[k.id]; const maxAs=Math.max(...kids.map(k=>k.as),1);
          return (
            <div key={k.id} style={{display:"flex",alignItems:"center",gap:12,marginBottom:i<kids.length-1?16:0}}>
              <div style={{fontSize:28}}>{i===0?"🥇":"🥈"}</div>
              <Avatar photo={k.kid.photo} emoji={k.id==="jose"?"👦🏻":"👦"} size={44} color={kth.p}/>
              <div style={{flex:1}}>
                <div style={{fontWeight:900,fontSize:15}}>{k.kid.name} <span style={{fontSize:13}}>{k.lv.icon} {k.lv.name}</span></div>
                <div style={{fontSize:11,color:"#888",fontWeight:700}}>🏅 {k.ach} logros · 🔥 {k.streak} días · ✅ {k.done} tareas</div>
                <ProgressBar value={k.as} max={maxAs} color={`linear-gradient(90deg,${kth.p},${kth.a})`} height={6}/>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontWeight:900,fontSize:20,color:kth.p}}>{k.as}⭐</div>
                <div style={{fontSize:12,color:"#888",fontWeight:700}}>{k.euros}€</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Challenges */}
      {st.challenges.length>0&&(
        <div className="card">
          <h3 style={{fontWeight:900,marginBottom:12}}>⚔️ Retos activos</h3>
          {st.challenges.map(c=>(
            <div key={c.id} style={{background:"#f8f8f8",borderRadius:14,padding:12,marginBottom:8}}>
              <div style={{fontWeight:800,fontSize:13,marginBottom:8}}>{c.taskName}</div>
              <div style={{display:"flex",justifyContent:"space-around",alignItems:"center"}}>
                <div style={{textAlign:"center"}}><div style={{fontSize:28,fontWeight:900,color:TH.jose.p}}>{c.count1}</div><div style={{fontSize:11,color:TH.jose.a,fontWeight:700}}>José</div></div>
                <div style={{fontSize:18,color:"#aaa",fontWeight:900}}>VS</div>
                <div style={{textAlign:"center"}}><div style={{fontSize:28,fontWeight:900,color:TH.david.p}}>{c.count2}</div><div style={{fontSize:11,color:TH.david.a,fontWeight:700}}>David</div></div>
              </div>
              <div style={{fontSize:11,color:"#aaa",textAlign:"center",marginTop:6}}>Hasta: {c.deadline}</div>
            </div>
          ))}
        </div>
      )}

      {/* Weekly report card */}
      <div className="card" style={{border:"2px solid #FFB80044"}}>
        <h3 style={{fontWeight:900,marginBottom:12}}>📊 Informe semanal</h3>
        {["jose","david"].map(id=>{
          const k=st.kids[id]; const kth=TH[id]; const as=approvedStars(k,st.tasks);
          return (
            <div key={id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:id==="jose"?"1px solid #f0f0f0":"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <Avatar photo={k.photo} emoji={id==="jose"?"👦🏻":"👦"} size={36} color={kth.p}/>
                <div>
                  <div style={{fontWeight:800,fontSize:13}}>{k.name}</div>
                  <div style={{fontSize:11,color:"#888"}}>{k.achievements.length} logros · {k.stats.totalDone||0} tareas</div>
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontWeight:900,color:kth.p,fontSize:16}}>{as}⭐</div>
                <div style={{fontSize:11,color:TH.parent.a,fontWeight:700}}>{totalEuros(k,st.tasks)}€</div>
              </div>
            </div>
          );
        })}
        <button onClick={()=>{
          const w=window.open("","_blank","width=800,height=600");
          if(!w) { dispatch?.({type:"TOAST",msg:"Permite ventanas emergentes para exportar"}); return; }
          const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Informe Kids Goals</title><style>body{font-family:sans-serif;padding:24px;max-width:600px;margin:0 auto}h1{color:#2D5010}table{width:100%;border-collapse:collapse}th,td{padding:8px;text-align:left;border-bottom:1px solid #eee}.r{text-align:right}</style></head><body><h1>📊 Informe semanal Kids Goals</h1><p><small>${new Date().toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"})}</small></p><table><thead><tr><th>Niño</th><th>Estrellas</th><th class="r">Euros</th><th class="r">Logros</th><th class="r">Tareas</th></tr></thead><tbody>${["jose","david"].map(id=>{const k=st.kids[id];const as=approvedStars(k,st.tasks);return `<tr><td><strong>${k.name}</strong></td><td>${as}⭐</td><td class="r">${totalEuros(k,st.tasks)}€</td><td class="r">${k.achievements.length}</td><td class="r">${k.stats.totalDone||0}</td></tr>`}).join("")}</tbody></table><p style="margin-top:24px;color:#888;font-size:12px">Kids Goals — Informe generado automáticamente</p></body></html>`;
          w.document.write(html);
          w.document.close();
          w.focus();
          setTimeout(()=>{ w.print(); w.close(); }, 300);
        }} style={{width:"100%",background:"linear-gradient(135deg,#FFB800,#CC8800)",color:"#fff",border:"none",borderRadius:16,padding:12,fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:14,cursor:"pointer",marginTop:12}}>
          📄 Exportar informe PDF
        </button>
      </div>
    </>
  );
}

// ─── PARENT CONFIG ──────────────────────────────────────────────
function KidEditor({ id, kid, dispatch }) {
  const [name,setName]=useState(kid.name||(id==="jose"?"José":"David"));
  const [dob,setDob]=useState(kid.dob||"");
  const [edit,setEdit]=useState(false);
  const th=TH[id]; const age=calcAge(dob);
  function save() { dispatch({type:"SET_KID_INFO",kidId:id,name,dob}); setEdit(false); dispatch({type:"TOAST",msg:`✅ Perfil de ${name} guardado`}); }
  return (
    <div style={{padding:"12px 0",borderBottom:"1px solid #f0f0f0"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <Avatar photo={kid.photo} emoji={id==="jose"?"👦🏻":"👦"} size={52} color={th.p}
          onClick={ph=>dispatch({type:"SET_KID_PHOTO",kidId:id,photo:ph})}/>
        <div style={{flex:1}}>
          {!edit?(
            <>
              <div style={{fontWeight:900,fontSize:16}}>{kid.name||(id==="jose"?"José":"David")}</div>
              <div style={{fontSize:12,color:"#888",fontWeight:600}}>{dob?`🎂 ${age} años · ${fmt(dob)}`:"Sin fecha de nacimiento"}</div>
            </>
          ):(
            <>
              <input value={name} onChange={e=>setName(e.target.value)} style={{width:"100%",padding:"6px 10px",borderRadius:10,border:`2px solid ${th.p}`,fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:14,marginBottom:5}}/>
              <input type="date" value={dob} onChange={e=>setDob(e.target.value)} style={{width:"100%",padding:"6px 10px",borderRadius:10,border:`2px solid ${th.p}`,fontFamily:"'Nunito',sans-serif",fontSize:13}}/>
            </>
          )}
        </div>
        {!edit
          ?<button onClick={()=>setEdit(true)} style={{background:`${th.p}22`,border:"none",borderRadius:10,padding:"7px 12px",cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:12,color:th.a}}>✏️</button>
          :<button onClick={save} style={{background:`linear-gradient(135deg,${th.p},${th.a})`,border:"none",borderRadius:10,padding:"7px 12px",cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:12,color:"#fff"}}>✅</button>}
      </div>
    </div>
  );
}

function ParentConfig({ st, dispatch, parentRole, currentParent }) {
  const pr = parentRole || "father";
  const cp = currentParent || st.parents?.[pr] || { photo: null, name: PARENT_ROLE_LABEL[pr] };
  const [pname,setPname]=useState(cp.name||PARENT_ROLE_LABEL[pr]);
  const th = pr === "mother" ? { ...TH.parent, p: "#E91E8C", a: "#C2185B" } : TH.parent;
  return (
    <>
      <div className="card" style={{margin:"12px 0"}}>
        <h3 style={{fontWeight:900,marginBottom:14}}>⚙️ Configuración</h3>
        {/* Parent section */}
        <div style={{padding:"12px 0",borderBottom:"1px solid #f0f0f0"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <Avatar photo={cp.photo} emoji={pr==="father"?"👨":"👩"} size={52} color={th.p}
              onClick={ph=>dispatch({type:"SET_PARENT_PHOTO",photo:ph,parentRole:pr})}/>
            <div style={{flex:1}}>
              <input value={pname} onChange={e=>setPname(e.target.value)} style={{width:"100%",padding:"6px 10px",borderRadius:10,border:`2px solid ${th.p}55`,fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:15}}/>
            </div>
            <button onClick={()=>{dispatch({type:"SET_PARENT_NAME",name:pname,parentRole:pr});dispatch({type:"TOAST",msg:"✅ Nombre actualizado"});}}
              style={{background:`linear-gradient(135deg,${th.p},${th.a})`,border:"none",borderRadius:10,padding:"7px 12px",cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:12,color:"#fff"}}>✅</button>
          </div>
        </div>
        {/* Kids */}
        {["jose","david"].map(id=><KidEditor key={id} id={id} kid={st.kids[id]} dispatch={dispatch}/>)}
      </div>

      {!FCM_VAPID_KEY&&(
        <div className="card" style={{border:"2px solid #FFB800",background:"#FFFBEA"}}>
          <div style={{fontWeight:800,fontSize:13,color:"#CC8800"}}>🔔 Notificaciones</div>
          <div style={{fontSize:12,color:"#888",marginTop:4}}>Para recibir avisos en el móvil, añade la variable <code style={{background:"#f0f0f0",padding:"2px 6px",borderRadius:4}}>VITE_FCM_VAPID_KEY</code> en Netlify (Site settings → Environment variables). Obtén la clave en Firebase Console → Cloud Messaging → Web Push certificates.</div>
        </div>
      )}

      {/* Send message to kids */}
      <div className="card">
        <h3 style={{fontWeight:900,marginBottom:12}}>💬 Enviar mensaje de ánimo</h3>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          {["jose","david"].map(id=>(
            <button key={id} onClick={()=>dispatch({type:"OPEN_MODAL",modal:{type:"sendMsg",kidId:id}})}
              style={{flex:1,background:`linear-gradient(135deg,${TH[id].p},${TH[id].a})`,color:"#fff",border:"none",borderRadius:14,padding:"10px",fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:13,cursor:"pointer"}}>
              {id==="jose"?"👦🏻 José":"👦 David"}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{background:"#FFF0F0",border:"2px solid #FFD0D0",textAlign:"center"}}>
        <button onClick={()=>logoutFirebase()}
          style={{width:"100%",background:"none",border:"none",color:PALETTE.error,fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:16,cursor:"pointer",padding:"8px 4px",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          🚪 Cerrar sesión / cambiar de usuario
        </button>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════════════════════════
function Modal({ st, dispatch, roleData }) {
  const m=st.modal;
  if(!m) return null;
  const close=()=>dispatch({type:"CLOSE_MODAL"});
  const wrap=(children)=>(
    <div className="modal-ov" onClick={close}>
      <div className="modal-sh" onClick={e=>e.stopPropagation()}>
        <div className="handle"/>
        {children}
      </div>
    </div>
  );
  const parentRole = (roleData?.role==="mother"||roleData?.role==="father") ? roleData.role : "father";

  if(m.type==="evidence") return wrap(<EvidenceModal m={m} dispatch={dispatch}/>);
  if(m.type==="approveTask") return wrap(<ApproveModal m={m} dispatch={dispatch} approvedBy={parentRole}/>);
  if(m.type==="rejectTask") return wrap(<RejectTaskModal m={m} dispatch={dispatch} rejectedBy={parentRole}/>);
  if(m.type==="addTask"||m.type==="editTask") return wrap(<TaskFormModal m={m} dispatch={dispatch}/>);
  if(m.type==="payment") return wrap(<PaymentModal m={m} dispatch={dispatch}/>);
  if(m.type==="addWish") return wrap(<AddWishModal m={m} dispatch={dispatch}/>);
  if(m.type==="gratitude") return wrap(<GratitudeModal m={m} dispatch={dispatch}/>);
  if(m.type==="sendMsg") return wrap(<SendMsgModal m={m} dispatch={dispatch} st={st}/>);
  if(m.type==="editMessage") return wrap(<EditMessageModal m={m} dispatch={dispatch}/>);
  if(m.type==="challenge") return wrap(<ChallengeModal m={m} st={st} dispatch={dispatch}/>);
  return null;
}

function compressImage(file, maxW=800, quality=0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      if (width > maxW || height > maxW) {
        if (width > height) { height = (height / width) * maxW; width = maxW; }
        else { width = (width / height) * maxW; height = maxW; }
      }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Error al cargar imagen")); };
    img.src = url;
  });
}

function EvidenceModal({ m, dispatch }) {
  const [note, setNote] = useState("");
  const [photoUrl, setPhotoUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef();
  async function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith("image/")) return;
    setLoading(true);
    try {
      const dataUrl = await compressImage(f);
      setPhotoUrl(dataUrl);
    } catch (err) { console.warn(err); }
    setLoading(false);
    e.target.value = "";
  }
  const hasContent = !!photoUrl || !!note.trim();
  return (
    <>
      <h2 style={{fontWeight:900,marginBottom:16}}>📎 Agregar evidencia</h2>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleFile}/>
      <button onClick={()=>fileRef.current?.click()} disabled={loading}
        style={{width:"100%",background:photoUrl?"#F0FFF4":"#f8f8f8",border:photoUrl?"2px solid #8DC63F":"2px dashed #ddd",borderRadius:18,padding:20,cursor:loading?"wait":"pointer",fontFamily:"'Nunito',sans-serif",marginBottom:12,transition:"all .3s"}}>
        {loading?<><div style={{fontSize:36}}>⏳</div><div style={{fontWeight:700,color:"#888",marginTop:4}}>Comprimiendo...</div></>
        :photoUrl?<><div style={{fontSize:36}}>✅</div><div style={{fontWeight:900,color:"#4A7A1E",marginTop:4}}>¡Foto añadida!</div><img src={photoUrl} alt="" style={{maxWidth:120,maxHeight:120,borderRadius:12,marginTop:8,objectFit:"cover"}}/></>
        :<><div style={{fontSize:36}}>📸</div><div style={{fontWeight:700,color:"#aaa",marginTop:4}}>Tomar foto o subir imagen</div></>}
      </button>
      <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Añade una nota (opcional)..." style={{width:"100%",padding:"14px 16px",borderRadius:16,border:"2px solid #f0f0f0",fontSize:14,resize:"none",height:80,marginBottom:14}}/>
      <button disabled={!hasContent} onClick={()=>{ if(hasContent) dispatch({type:"SUBMIT_EVIDENCE",kidId:m.kidId,taskId:m.taskId,evidence:{note:note.trim()||null,hasPhoto:!!photoUrl},photoUrl:photoUrl||null}); }}
        style={{width:"100%",background:hasContent?"linear-gradient(135deg,#8DC63F,#5A9A20)":"#f0f0f0",color:hasContent?"#fff":"#aaa",border:"none",borderRadius:20,padding:16,fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:16,cursor:hasContent?"pointer":"not-allowed"}}>
        📤 Enviar a papá / mamá
      </button>
    </>
  );
}

function ApproveModal({ m, dispatch, approvedBy }) {
  const [msg,setMsg]=useState("");
  const quickMsgs=["¡Bravo! 🎉","¡Muy bien hecho! ⭐","¡Estoy muy orgulloso! 🏆","¡Sigue así, campeón! 💪","¡Eres increíble! 🌟"];
  return (
    <>
      <h2 style={{fontWeight:900,marginBottom:6}}>✅ Aprobar tarea</h2>
      <p style={{color:"#888",fontSize:13,fontWeight:600,marginBottom:16}}>{m.taskName}</p>
      <div style={{fontWeight:700,fontSize:13,color:"#666",marginBottom:8}}>💬 Mensaje de ánimo (opcional)</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
        {quickMsgs.map(q=>(
          <button key={q} onClick={()=>setMsg(q)} style={{background:msg===q?"#FFB800":"#f0f0f0",color:msg===q?"#fff":"#666",border:"none",borderRadius:50,padding:"5px 12px",cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:12,transition:"all .2s"}}>{q}</button>
        ))}
      </div>
      <textarea value={msg} onChange={e=>setMsg(e.target.value)} placeholder="O escribe tu propio mensaje..." style={{width:"100%",padding:"12px 14px",borderRadius:14,border:"2px solid #f0f0f0",fontSize:14,resize:"none",height:70,marginBottom:14}}/>
      <button onClick={()=>dispatch({type:"APPROVE_TASK",kidId:m.kidId,taskId:m.taskId,notifId:m.notifId,message:msg||null,approvedBy:approvedBy||"father"})}
        style={{width:"100%",background:"linear-gradient(135deg,#8DC63F,#5A9A20)",color:"#fff",border:"none",borderRadius:20,padding:16,fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:16,cursor:"pointer"}}>
        ✅ Aprobar {msg?"con mensaje":"sin mensaje"}
      </button>
    </>
  );
}

function RejectTaskModal({ m, dispatch, rejectedBy }) {
  const [reason, setReason] = useState("");
  return (
    <>
      <h2 style={{fontWeight:900,marginBottom:6}}>❌ Rechazar tarea</h2>
      <p style={{color:"#888",fontSize:13,fontWeight:600,marginBottom:16}}>{m.taskName}</p>
      <p style={{fontSize:12,color:"#666",marginBottom:8}}>Indica el motivo (opcional). El niño lo verá en sus mensajes y podrá volver a intentarlo.</p>
      <textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ej: Falta la foto de la evidencia..." style={{width:"100%",padding:"12px 14px",borderRadius:14,border:"2px solid #f0f0f0",fontSize:14,resize:"none",height:80,marginBottom:14}}/>
      <button onClick={()=>dispatch({type:"REJECT_TASK",kidId:m.kidId,taskId:m.taskId,notifId:m.notifId,rejectedBy:rejectedBy||m.rejectedBy||"father",message:reason||null})}
        style={{width:"100%",background:PALETTE.error,color:"#fff",border:"none",borderRadius:20,padding:16,fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:16,cursor:"pointer"}}>
        ❌ Rechazar tarea
      </button>
    </>
  );
}

function EditMessageModal({ m, dispatch }) {
  const [text, setText] = useState(m.currentText||"");
  return (
    <>
      <h2 style={{fontWeight:900,marginBottom:6}}>✏️ Editar mensaje</h2>
      <textarea value={text} onChange={e=>setText(e.target.value)} style={{width:"100%",padding:"12px 14px",borderRadius:14,border:"2px solid #f0f0f0",fontSize:14,resize:"none",height:100,marginBottom:14}}/>
      <button onClick={()=>dispatch({type:"EDIT_MESSAGE",kidId:m.kidId,messageId:m.messageId,text:text.trim()})}
        disabled={!text.trim()}
        style={{width:"100%",background:text.trim()?"#FFB800":"#f0f0f0",color:text.trim()?"#fff":"#aaa",border:"none",borderRadius:20,padding:16,fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:16,cursor:text.trim()?"pointer":"default"}}>
        ✅ Guardar
      </button>
    </>
  );
}

function TaskFormModal({ m, dispatch }) {
  const isEdit=m.type==="editTask";
  const [t,setT]=useState(isEdit?{...m.task}:{name:"",days:"todos",time:"Tarde",dur:"10 min",stars:1,emoji:"⭐",cat:"hogar",deadline:"",isSpecial:false});
  const set=(k,v)=>setT(prev=>({...prev,[k]:v}));
  return (
    <>
      <h2 style={{fontWeight:900,marginBottom:18}}>{isEdit?"✏️ Editar tarea":"➕ Nueva tarea"}</h2>
      {[{l:"Nombre",k:"name",pl:"Ej: Ordenar escritorio"},{l:"Emoji",k:"emoji",pl:"🏠"}].map(f=>(
        <div key={f.k} style={{marginBottom:12}}>
          <label style={{fontWeight:700,fontSize:12,color:"#777",display:"block",marginBottom:4}}>{f.l}</label>
          <input value={t[f.k]} onChange={e=>set(f.k,e.target.value)} placeholder={f.pl} style={{width:"100%",padding:"11px 14px",borderRadius:14,border:"2px solid #f0f0f0",fontSize:15}}/>
        </div>
      ))}
      {[
        {l:"Días",k:"days",opts:[["todos","Todos los días"],["lv","Lun – Vie"],["sab","Sábado"],["dom","Domingo"]]},
        {l:"Horario",k:"time",opts:[["Mañana","Mañana"],["Tarde","Tarde"],["Noche","Noche"],["Mañana, tarde y noche","Todo el día"]]},
        {l:"Duración",k:"dur",opts:[["5 min","5 min"],["10 min","10 min"],["15 min","15 min"],["20 min","20 min"],["30 min","30 min"]]},
        {l:"Estrellas",k:"stars",opts:[["1","⭐ 1"],["2","⭐⭐ 2"],["3","⭐⭐⭐ 3"]]},
        {l:"Categoría",k:"cat",opts:Object.entries(CAT_CLR).map(([k])=>[k,k.charAt(0).toUpperCase()+k.slice(1)])},
      ].map(f=>(
        <div key={f.k} style={{marginBottom:12}}>
          <label style={{fontWeight:700,fontSize:12,color:"#777",display:"block",marginBottom:4}}>{f.l}</label>
          <select value={String(t[f.k])} onChange={e=>set(f.k,f.k==="stars"?parseInt(e.target.value):e.target.value)} style={{width:"100%",padding:"11px 14px",borderRadius:14,border:"2px solid #f0f0f0",fontSize:14,background:"#fff"}}>
            {f.opts.map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      ))}
      <div style={{marginBottom:12}}>
        <label style={{fontWeight:700,fontSize:12,color:"#777",display:"block",marginBottom:4}}>📅 Fecha límite (opcional)</label>
        <input type="date" value={t.deadline||""} onChange={e=>set("deadline",e.target.value)} style={{width:"100%",padding:"11px 14px",borderRadius:14,border:"2px solid #f0f0f0",fontSize:14}}/>
      </div>
      <div style={{marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
        <input type="checkbox" checked={!!t.isSpecial} onChange={e=>set("isSpecial",e.target.checked)} id="special" style={{width:20,height:20,cursor:"pointer"}}/>
        <label htmlFor="special" style={{fontWeight:800,fontSize:14,cursor:"pointer"}}>🎯 Misión especial (fin de semana)</label>
      </div>
      <div style={{display:"flex",gap:10}}>
        {isEdit&&<button onClick={()=>dispatch({type:"DELETE_TASK",taskId:t.id})} style={{flex:1,background:"#FFF0F0",color:PALETTE.error,border:`2px solid ${PALETTE.error}`,borderRadius:18,padding:14,fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:14,cursor:"pointer"}}>🗑️</button>}
        <button disabled={!t.name} onClick={()=>dispatch({type:isEdit?"EDIT_TASK":"ADD_TASK",task:t})}
          style={{flex:2,background:t.name?"linear-gradient(135deg,#FFB800,#CC8800)":"#f0f0f0",color:t.name?"#fff":"#aaa",border:"none",borderRadius:18,padding:14,fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:15,cursor:t.name?"pointer":"not-allowed"}}>
          {isEdit?"✅ Guardar":"✅ Crear tarea"}
        </button>
      </div>
    </>
  );
}

function PaymentModal({ m, dispatch }) {
  const [amount,setAmount]=useState(m.maxAmount); const [note,setNote]=useState("");
  const th=TH.parent;
  return (
    <>
      <h2 style={{fontWeight:900,marginBottom:4}}>💶 Registrar entrega</h2>
      <p style={{color:"#888",fontSize:13,fontWeight:600,marginBottom:16}}>Para {m.kidName} · Máx: {m.maxAmount}€</p>
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        {[0.5,1,2,m.maxAmount].filter((v,i,a)=>a.indexOf(v)===i&&v<=m.maxAmount).map(v=>(
          <button key={v} onClick={()=>setAmount(v)} style={{flex:1,background:amount===v?th.p:"#f0f0f0",color:amount===v?"#fff":"#888",border:"none",borderRadius:14,padding:"10px 4px",fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:13,cursor:"pointer"}}>{v}€</button>
        ))}
      </div>
      <input type="number" value={amount} min={0.5} max={m.maxAmount} step={0.5} onChange={e=>setAmount(parseFloat(e.target.value))} style={{width:"100%",padding:"11px 14px",borderRadius:14,border:"2px solid #f0f0f0",fontSize:15,marginBottom:12}}/>
      <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Nota (opcional)" style={{width:"100%",padding:"11px 14px",borderRadius:14,border:"2px solid #f0f0f0",fontSize:14,marginBottom:16}}/>
      <button onClick={()=>dispatch({type:"ADD_PAYMENT",kidId:m.kidId,amount,note})}
        style={{width:"100%",background:"linear-gradient(135deg,#4A7A1E,#2D5010)",color:"#fff",border:"none",borderRadius:20,padding:16,fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:16,cursor:"pointer"}}>
        ✅ Confirmar entrega de {amount}€
      </button>
    </>
  );
}

function AddWishModal({ m, dispatch }) {
  const [name,setName]=useState(""); const [cost,setCost]=useState(30); const [emoji,setEmoji]=useState("🌟");
  return (
    <>
      <h2 style={{fontWeight:900,marginBottom:16}}>🌠 Nuevo deseo</h2>
      {[{l:"¿Qué quieres?",k:"name",val:name,set:setName,pl:"Ej: Videojuego, salida..."},{l:"Emoji",k:"emoji",val:emoji,set:setEmoji,pl:"🌟"}].map(f=>(
        <div key={f.k} style={{marginBottom:12}}>
          <label style={{fontWeight:700,fontSize:12,color:"#777",display:"block",marginBottom:4}}>{f.l}</label>
          <input value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.pl} style={{width:"100%",padding:"11px 14px",borderRadius:14,border:"2px solid #f0f0f0",fontSize:15}}/>
        </div>
      ))}
      <div style={{marginBottom:16}}>
        <label style={{fontWeight:700,fontSize:12,color:"#777",display:"block",marginBottom:4}}>⭐ Coste en estrellas</label>
        <input type="number" value={cost} min={1} onChange={e=>setCost(parseInt(e.target.value)||1)} style={{width:"100%",padding:"11px 14px",borderRadius:14,border:"2px solid #f0f0f0",fontSize:15}}/>
      </div>
      <button disabled={!name} onClick={()=>dispatch({type:"ADD_WISH",kidId:m.kidId,name,cost,emoji})}
        style={{width:"100%",background:name?"linear-gradient(135deg,#FFB800,#CC8800)":"#f0f0f0",color:name?"#fff":"#aaa",border:"none",borderRadius:20,padding:16,fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:16,cursor:name?"pointer":"not-allowed"}}>
        🌠 Añadir deseo
      </button>
    </>
  );
}

function GratitudeModal({ m, dispatch }) {
  const [text,setText]=useState("");
  const prompts=["Hoy estoy agradecido por...","Lo mejor que me pasó hoy fue...","Una persona que me ayudó hoy...","Algo de la Biblia que me gustó..."];
  return (
    <>
      <h2 style={{fontWeight:900,marginBottom:6}}>📝 Diario de gratitud</h2>
      <p style={{color:"#888",fontSize:13,fontWeight:600,marginBottom:12}}>¿Por qué estás agradecido hoy?</p>
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
        {prompts.map(p=>(
          <button key={p} onClick={()=>setText(p)} style={{background:text===p?"#FFB80022":"#f8f8f8",border:`2px solid ${text===p?"#FFB800":"#f0f0f0"}`,borderRadius:12,padding:"8px 12px",cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:700,fontSize:13,color:"#555",textAlign:"left"}}>💭 {p}</button>
        ))}
      </div>
      <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Escribe aquí tu gratitud..." style={{width:"100%",padding:"14px 16px",borderRadius:16,border:"2px solid #f0f0f0",fontSize:14,resize:"none",height:100,marginBottom:14}}/>
      <button disabled={!text} onClick={()=>dispatch({type:"ADD_GRATITUDE",kidId:m.kidId,text})}
        style={{width:"100%",background:text?"linear-gradient(135deg,#8DC63F,#5A9A20)":"#f0f0f0",color:text?"#fff":"#aaa",border:"none",borderRadius:20,padding:16,fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:16,cursor:text?"pointer":"not-allowed"}}>
        💾 Guardar gratitud
      </button>
    </>
  );
}

function SendMsgModal({ m, dispatch, st }) {
  const [text,setText]=useState("");
  const quick=["¡Eres increíble! 🌟","¡Bravo, sigue así! 💪","¡Te quiero mucho! ❤️","¡Estoy muy orgulloso de ti! 🏆","¡Tú puedes! 🎯"];
  const kid=st.kids[m.kidId];
  return (
    <>
      <h2 style={{fontWeight:900,marginBottom:4}}>💬 Mensaje para {kid.name}</h2>
      <p style={{color:"#888",fontSize:13,fontWeight:600,marginBottom:12}}>Le llegará como notificación en la app</p>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
        {quick.map(q=>(
          <button key={q} onClick={()=>setText(q)} style={{background:text===q?"#FFB800":"#f0f0f0",color:text===q?"#fff":"#666",border:"none",borderRadius:50,padding:"5px 12px",cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:12,transition:"all .2s"}}>{q}</button>
        ))}
      </div>
      <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="O escribe tu mensaje..." style={{width:"100%",padding:"14px 16px",borderRadius:16,border:"2px solid #f0f0f0",fontSize:14,resize:"none",height:90,marginBottom:14}}/>
      <button disabled={!text} onClick={()=>dispatch({type:"SEND_MESSAGE",kidId:m.kidId,text})}
        style={{width:"100%",background:text?"linear-gradient(135deg,#FFB800,#CC8800)":"#f0f0f0",color:text?"#fff":"#aaa",border:"none",borderRadius:20,padding:16,fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:16,cursor:text?"pointer":"not-allowed"}}>
        💬 Enviar mensaje
      </button>
    </>
  );
}

function ChallengeModal({ m, st, dispatch }) {
  const [taskId,setTaskId]=useState(st.tasks[0]?.id||1);
  const [deadline,setDeadline]=useState("");
  const today=new Date(); today.setDate(today.getDate()+7);
  const defDeadline=today.toISOString().split("T")[0];
  return (
    <>
      <h2 style={{fontWeight:900,marginBottom:8}}>⚔️ Crear reto entre hermanos</h2>
      <p style={{color:"#888",fontSize:13,fontWeight:600,marginBottom:16}}>José vs David — ¿quién completa más veces esta tarea?</p>
      <div style={{marginBottom:12}}>
        <label style={{fontWeight:700,fontSize:12,color:"#777",display:"block",marginBottom:4}}>Tarea del reto</label>
        <select value={taskId} onChange={e=>setTaskId(parseInt(e.target.value))} style={{width:"100%",padding:"11px 14px",borderRadius:14,border:"2px solid #f0f0f0",fontSize:14,background:"#fff"}}>
          {st.tasks.map(t=><option key={t.id} value={t.id}>{t.emoji} {t.name}</option>)}
        </select>
      </div>
      <div style={{marginBottom:16}}>
        <label style={{fontWeight:700,fontSize:12,color:"#777",display:"block",marginBottom:4}}>📅 Fecha límite</label>
        <input type="date" value={deadline||defDeadline} onChange={e=>setDeadline(e.target.value)} style={{width:"100%",padding:"11px 14px",borderRadius:14,border:"2px solid #f0f0f0",fontSize:14}}/>
      </div>
      <button onClick={()=>dispatch({type:"ADD_CHALLENGE",challenge:{kid1:"jose",kid2:"david",taskId,taskName:st.tasks.find(t=>t.id===taskId)?.name,count1:0,count2:0,deadline:deadline||defDeadline}})}
        style={{width:"100%",background:"linear-gradient(135deg,#FF6B35,#CC4400)",color:"#fff",border:"none",borderRadius:20,padding:16,fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:16,cursor:"pointer"}}>
        ⚔️ ¡Activar reto!
      </button>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════
// Debounce helper
function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), ms); };
}

export default function App() {
  const [st, rawDispatch] = useState(() => initState());
  const [authUser, setAuthUser] = useState(undefined); // undefined=loading, null=logged out
  const [roleData, setRoleData] = useState(null);
  const [appLoading, setAppLoading] = useState(true);
  const fcmSwReg = useRef(null);

  const dispatch = useCallback((action) => {
    rawDispatch(prev => reducer(prev, action));
  }, []);

  // Registrar Service Worker de FCM al montar para que los push en segundo plano se muestren
  useEffect(() => {
    registerFcmSw().then((reg) => { if (reg) fcmSwReg.current = reg; });
  }, []);

  // Debounced save to Firestore (500ms after last action)
  const debouncedSave = useCallback(debounce((state) => {
    saveAppState(state).catch(console.error);
  }, 500), []);

  // Save to Firestore whenever state changes (skip initial load)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (authUser && roleData) debouncedSave(st);
  }, [st]);

  // Guardar foto del padre/madre en la nube (merge por rol para no sobrescribir el otro)
  const parentRoleForSave = (roleData?.role === "mother" || roleData?.role === "father") ? roleData.role : (roleData?.role === "parent" ? "father" : null);
  const currentParentForSave = parentRoleForSave ? st.parents?.[parentRoleForSave] : null;
  const lastParentPhoto = useRef(currentParentForSave?.photo);
  useEffect(() => {
    if (!authUser || !parentRoleForSave || !currentParentForSave?.photo) return;
    if (currentParentForSave.photo === lastParentPhoto.current) return;
    lastParentPhoto.current = currentParentForSave.photo;
    // Sin toast en cada arranque: solo sincronizamos silenciosamente
    saveParentPhoto(parentRoleForSave, currentParentForSave).catch(console.error);
  }, [currentParentForSave?.photo, authUser, parentRoleForSave]);

  // Firebase auth listener
  useEffect(() => {
    const unsub = onAuth(async (user) => {
      setAuthUser(user);
      if (!user) {
        setRoleData(null);
        setAppLoading(false);
        rawDispatch(() => ({ ...initState(), screen: "auth" }));
        return;
      }
      // User is logged in — get their role (o asignar rol fijo por email)
      try {
        let role = await getUserRole(user.uid);
        if (!role && user.email && FIXED_PARENT_EMAILS[user.email]) {
          role = { role: FIXED_PARENT_EMAILS[user.email], kidId: null, name: user.displayName, email: user.email, photo: user.photoURL };
          await setUserRole(user.uid, role);
        }
        if (!role) {
          setRoleData(null);
          setAppLoading(false);
          return;
        }
        setRoleData(role);
        // Load saved app state from Firestore
        const saved = await loadAppState();
        const isParent = role.role === "parent" || role.role === "father" || role.role === "mother";
        if (saved) {
          rawDispatch(() => ({
            ...initState(),
            ...saved,
            screen: isParent ? "parent" : "child",
            activeKid: role.kidId || null,
            loggedAccount: { ...role, uid: user.uid, googlePhoto: user.photoURL },
          }));
        } else {
          rawDispatch(prev => ({
            ...prev,
            screen: isParent ? "parent" : "child",
            activeKid: role.kidId || null,
            loggedAccount: { ...role, uid: user.uid, googlePhoto: user.photoURL },
          }));
        }
      } catch(e) {
        console.error(e);
      }
      setAppLoading(false);
    });
    return unsub;
  }, []);

  // Al volver a la app (dejar de estar minimizada), recargar datos para ver mensajes/actualizaciones
  useEffect(() => {
    if (!authUser || !roleData) return;
    const onVisible = async () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      try {
        const saved = await loadAppState();
        if (saved) {
          rawDispatch(prev => ({
            ...prev,
            ...saved,
            screen: prev.screen,
            modal: prev.modal,
            toast: prev.toast,
            confetti: prev.confetti,
            loggedAccount: prev.loggedAccount,
            activeKid: prev.activeKid,
          }));
        }
      } catch (e) {
        console.warn("Refresh on visibility:", e);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [authUser, roleData]);

  // Subscribe to real-time updates from Firestore (so all devices sync)
  useEffect(() => {
    if (!authUser || !roleData) return;
    const unsub = subscribeAppState((data) => {
      let merged = { ...data };
      if (Array.isArray(merged.tasks) && merged.tasks.length>0) {
        const existingIds = new Set(merged.tasks.map(t=>t.id));
        const extra = INIT_TASKS.filter(t=>!existingIds.has(t.id));
        if (extra.length>0) merged.tasks = [...merged.tasks, ...extra];
      } else {
        merged.tasks = INIT_TASKS;
      }
      if (data.parent && !data.parents) {
        merged.parents = { father: { ...data.parent, name: data.parent.name||"Papá" }, mother: { ...data.parent, name: data.parent.name||"Mamá" } };
        delete merged.parent;
      }
      if (data.parentFcmToken && !data.parentFcmTokens) {
        merged.parentFcmTokens = { father: data.parentFcmToken, mother: data.parentFcmToken };
        delete merged.parentFcmToken;
      }
      const pr = (roleData?.role === "mother" || roleData?.role === "father") ? roleData.role : null;
      rawDispatch(prev => ({
        ...prev, ...merged,
        screen: prev.screen, modal: prev.modal, toast: prev.toast,
        confetti: prev.confetti, loggedAccount: prev.loggedAccount,
        ...(roleData?.role === "child" ? { activeKid: roleData.kidId || prev.activeKid } : {}),
        // Preservar foto del padre/madre actual si la tenemos localmente (evitar que subscribe sobrescriba antes de guardar)
        ...(pr && prev.parents?.[pr]?.photo && !merged.parents?.[pr]?.photo ? { parents: { ...(merged.parents||prev.parents), [pr]: { ...(merged.parents?.[pr]||prev.parents[pr]), photo: prev.parents[pr].photo } } } : {}),
      }));
    });
    return unsub;
  }, [authUser, roleData]);

  // Notificaciones push: el permiso debe pedirse con un gesto del usuario (tap). Cada padre/madre guarda su token.
  const parentRoleForFcm = (roleData?.role === "mother" || roleData?.role === "father") ? roleData.role : "father";
  const requestParentNotif = useCallback(async () => {
    if (typeof window === "undefined" || !FCM_VAPID_KEY) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      const messaging = getMessaging(_app);
      const token = await getToken(messaging, {
        vapidKey: FCM_VAPID_KEY,
        ...(fcmSwReg.current ? { serviceWorkerRegistration: fcmSwReg.current } : {}),
      });
      if (!token) return;
      await setParentFcmToken(parentRoleForFcm, token);
      rawDispatch(prev => ({ ...prev, parentFcmTokens: { ...(prev.parentFcmTokens||{}), [parentRoleForFcm]: token } }));
      dispatch({ type: "TOAST", msg: "🔔 Notificaciones activadas" });
      onMessage(messaging, (payload) => {
        if (payload?.notification?.title) dispatch({ type: "TOAST", msg: payload.notification.title + (payload.notification.body ? " — " + payload.notification.body : "") });
      });
    } catch (e) {
      if (e?.code !== "messaging/permission-blocked") console.warn("FCM:", e?.message || e);
    }
  }, [parentRoleForFcm]);

  // Notificaciones push para el niño (gesto del usuario requerido)
  const childKidId = roleData?.role === "child" ? (roleData?.kidId || st.activeKid) : null;
  const requestChildNotif = useCallback(async () => {
    if (typeof window === "undefined" || !childKidId || !FCM_VAPID_KEY) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      const messaging = getMessaging(_app);
      const token = await getToken(messaging, {
        vapidKey: FCM_VAPID_KEY,
        ...(fcmSwReg.current ? { serviceWorkerRegistration: fcmSwReg.current } : {}),
      });
      if (!token) return;
      await setChildFcmToken(childKidId, token);
      dispatch({ type: "TOAST", msg: "🔔 Notificaciones activadas" });
      onMessage(messaging, (payload) => {
        if (payload?.notification?.title) dispatch({ type: "TOAST", msg: payload.notification.title + (payload.notification.body ? " — " + payload.notification.body : "") });
      });
    } catch (e) {
      if (e?.code !== "messaging/permission-blocked") console.warn("FCM child:", e?.message || e);
    }
  }, [childKidId]);

  useEffect(()=>{ if(st.toast){ const t=setTimeout(()=>dispatch({type:"CLEAR_TOAST"}),3500); return()=>clearTimeout(t); } },[st.toast]);
  useEffect(()=>{ if(st.confetti){ const t=setTimeout(()=>dispatch({type:"CLEAR_CONFETTI"}),2800); return()=>clearTimeout(t); } },[st.confetti]);

  // Loading spinner
  if (appLoading || authUser === undefined) {
    return (
      <>
        <style>{CSS}</style>
        <div className="app"><div className="screen" style={{alignItems:"center",justifyContent:"center",overflowY:"auto",background:"linear-gradient(160deg,#F0FAE6 0%,#EBF8FF 60%,#FFFBEA 100%)"}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:64,animation:"bounce 1s infinite"}}>🏠</div>
            <div style={{fontWeight:900,color:"#4A7A1E",marginTop:12,fontSize:16}}>Cargando Kids Goals...</div>
          </div>
        </div></div>
      </>
    );
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {st.toast&&<div className="toast">{st.toast}</div>}
        {st.confetti&&<Confetti/>}

        {!authUser && <AuthScreen/>}
        {authUser && !roleData && (
          <RoleScreen user={authUser} onRole={(r)=>{ setRoleData(r);
            rawDispatch(prev=>({...prev, screen:(r.role==="parent"||r.role==="father"||r.role==="mother")?"parent":"child", activeKid:r.kidId||null,
              loggedAccount:{...r, uid:authUser.uid, googlePhoto:authUser.photoURL}}));
          }}/>
        )}
        {authUser && roleData && st.screen==="child"  && <ChildScreen st={st} dispatch={dispatch} onRequestNotif={requestChildNotif} showNotifPrompt={!!childKidId&&!!FCM_VAPID_KEY&&typeof Notification!=="undefined"&&Notification.permission==="default"} roleData={roleData}/>}
        {authUser && roleData && st.screen==="parent" && <ParentScreen st={st} dispatch={dispatch} onRequestNotif={requestParentNotif} showNotifPrompt={!!FCM_VAPID_KEY&&typeof Notification!=="undefined"&&Notification.permission==="default"} roleData={roleData}/>}

        <Modal st={st} dispatch={dispatch} roleData={roleData}/>
      </div>
    </>
  );
}
