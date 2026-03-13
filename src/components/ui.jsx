import { useRef } from "react";
import { approvedStars, balance, getLevel, getKidColor, isToday } from "../utils";
import { STARS_PER_EURO, PALETTE, CAT_CLR } from "../constants";

const rem = (px) => `${Number(px) / 16}rem`;

export function Confetti() {
  const ps = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    color: ["#FF85C2", "#FFB800", "#8DC63F", "#5BC8F5", "#FF6B6B", "#A78BFA"][i % 6],
    left: Math.random() * 96,
    delay: Math.random() * 0.9,
    dur: 1.6 + Math.random() * 1.4,
    size: 7 + Math.random() * 9,
  }));
  return (
    <>
      {ps.map((p) => (
        <div
          key={p.id}
          className="confp"
          style={{
            background: p.color,
            left: `${p.left}%`,
            top: "-20px",
            width: p.size,
            height: p.size,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
          }}
        />
      ))}
    </>
  );
}

export function Avatar({ photo, emoji, size = 52, color = "#ccc", onClick }) {
  const ref = useRef(null);
  const s = rem(size);
  const sNum = Number(size);

  async function compressImage(file, maxSize = 400, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = ev.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith("image/") || !onClick) return;
    try {
      const dataUrl = await compressImage(f, 400, 0.7);
      onClick(dataUrl);
    } catch (err) {
      console.warn(err);
    }
    e.target.value = "";
  }

  return (
    <div
      style={{ position: "relative", width: s, height: s, cursor: onClick ? "pointer" : "default" }}
      onClick={() => onClick && ref.current?.click()}
    >
      <div
        style={{
          width: s,
          height: s,
          borderRadius: "50%",
          background: photo ? "none" : `${color}33`,
          border: "3px solid",
          borderColor: color,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
        }}
      >
        {photo ? (
          <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: rem(sNum * 0.45) }}>{emoji}</span>
        )}
      </div>
      {onClick && (
        <>
          <div
            style={{
              position: "absolute",
              bottom: 0,
              right: 0,
              background: color,
              borderRadius: "50%",
              width: rem(22),
              height: rem(22),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: rem(11),
              color: "#fff",
              border: "2px solid #fff",
            }}
          >
            📷
          </div>
          <input
            ref={ref}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFile}
          />
        </>
      )}
    </div>
  );
}

export function ProgressBar({ value, max, color, height = 8 }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="prog-bar" style={{ height: rem(height) }}>
      <div className="prog-fill" style={{ width: `${pct}%`, height: "100%", background: color }} />
    </div>
  );
}

export function StarBadge({ n, size = "sm" }) {
  return (
    <span
      className="pill sb"
      style={{
        fontSize: size === "lg" ? rem(15) : rem(11),
        padding: size === "lg" ? `${rem(5)} ${rem(14)}` : `${rem(3)} ${rem(10)}`,
      }}
    >
      {"⭐".repeat(Math.min(n, 3))}
      {n > 3 ? ` x${n}` : ""}
    </span>
  );
}

export function HomeWidget({ kid, kidId, tasks }) {
  if (!kid) return null;
  const as = approvedStars(kid, tasks);
  const lv = getLevel(as);
  const th = getKidColor(kidId, 0);
  const todayT = tasks.filter((t) => t.days && t.days.length && t && t.id != null && t.name && t.emoji && t.dur && t.time && (t.deadline || true) && (t.cat || CAT_CLR[t.cat] || true));
  const doneT = todayT.filter((t) => {
    const c = kid.completions[t.id];
    return c?.done && isToday(c.date);
  }).length;

  return (
    <div className="widget">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span style={{ color: "#4A7A1E", fontSize: 10, fontWeight: 900, letterSpacing: 1 }}>
          KIDS GOALS
        </span>
        <span style={{ color: th.p, fontSize: 10, fontWeight: 900 }}>
          {lv.icon} {lv.name}
        </span>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div
          style={{
            flex: 1,
            background: "rgba(255,255,255,.06)",
            borderRadius: 12,
            padding: 10,
            textAlign: "center",
          }}
        >
          <div style={{ color: "#666", fontSize: 9, fontWeight: 700 }}>⭐ HOY</div>
          <div style={{ color: th.p, fontSize: 22, fontWeight: 900 }}>
            {doneT}/{todayT.length}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            background: "rgba(255,255,255,.06)",
            borderRadius: 12,
            padding: 10,
            textAlign: "center",
          }}
        >
          <div style={{ color: "#666", fontSize: 9, fontWeight: 700 }}>ESTRELLAS</div>
          <div style={{ color: "#CC8800", fontSize: 22, fontWeight: 900 }}>{as}</div>
        </div>
        <div
          style={{
            flex: 1,
            background: "rgba(255,255,255,.06)",
            borderRadius: 12,
            padding: 10,
            textAlign: "center",
          }}
        >
          <div style={{ color: "#666", fontSize: 9, fontWeight: 700 }}>💶 BALANCE</div>
          <div style={{ color: "#4A7A1E", fontSize: 22, fontWeight: 900 }}>
            {balance(kid, tasks)}€
          </div>
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <ProgressBar
          value={as % STARS_PER_EURO}
          max={STARS_PER_EURO}
          color={th.p}
          height={5}
        />
        <div
          style={{
            color: "#666",
            fontSize: 9,
            marginTop: 2,
            fontWeight: 600,
          }}
        >
          Próximo euro: {as % STARS_PER_EURO}/{STARS_PER_EURO} ⭐
        </div>
      </div>
    </div>
  );
}

