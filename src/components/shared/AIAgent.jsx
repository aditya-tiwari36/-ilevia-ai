import { AnimatePresence, motion } from "framer-motion";
import { Activity, Bot, Home, Play } from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { useHome } from "../../context/HomeContext.jsx";

const actions = [
  { name: "room",       label: "Home",       Icon: Home,     angle: -140, dist: 88 },
  { name: "simulation", label: "Simulation", Icon: Play,     angle: -90,  dist: 88 },
  { name: "console",   label: "Console",    Icon: Activity,  angle: -40,  dist: 88 }
];

function toXY(angleDeg, dist) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.cos(rad) * dist, y: Math.sin(rad) * dist };
}

export function AIAgent() {
  const { section, setSection } = useHome();
  const [open, setOpen] = useState(false);
  const orbRef = useRef(null);
  const [clampOffsets, setClampOffsets] = useState({});
  const isRoomDocked = section === "room";
  const containerClassName = useMemo(
    () => `agent-nav-shell ${isRoomDocked ? "agent-nav-shell--room" : ""}`,
    [isRoomDocked]
  );

  useEffect(() => {
    if (!open || !orbRef.current) return;

    const rect = orbRef.current.getBoundingClientRect();
    const orbCX = rect.left + rect.width / 2;
    const orbCY = rect.top + rect.height / 2;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const btnR = 26; // half of 52px button
    const isMobile = vw < 768;

    const offsets = {};

    if (isMobile) {
      // ── Mobile: straight vertical stack above the orb ──────────────
      // Buttons rise straight upward: -64px, -128px, -192px from orb centre.
      // No left/right displacement — they are always centred on the orb.
      actions.forEach(({ name }, i) => {
        offsets[name] = { x: 0, y: -(64 * (i + 1)) };
      });
    } else {
      // ── Desktop: radial fan with viewport clamping (unchanged) ──────
      const sidebarRect = document.querySelector(".room-section-aside")?.getBoundingClientRect();
      const obstacleLeft = isRoomDocked && sidebarRect ? sidebarRect.left : null;

      for (const { name, angle, dist } of actions) {
        const { x, y } = toXY(angle, dist);
        const ax = orbCX + x;
        const ay = orbCY + y;
        const margin = btnR + 8;
        const maxCX = obstacleLeft == null ? vw - margin : Math.min(vw - margin, obstacleLeft - margin);
        const cx = Math.min(Math.max(ax, margin), maxCX);
        const cy = Math.min(Math.max(ay, margin), vh - margin);
        offsets[name] = { x: cx - orbCX, y: cy - orbCY };
      }
    }

    setClampOffsets(offsets);
  }, [open, isRoomDocked]);

  return (
    <div className={containerClassName} style={{ isolation: "isolate" }}>
      <AnimatePresence>
        {open && actions.map(({ name, label, Icon }) => {
          const isActive = section === name;
          const pos = clampOffsets[name] ?? toXY(
            actions.find(a => a.name === name)?.angle ?? -90,
            actions.find(a => a.name === name)?.dist ?? 88
          );
          return (
            <motion.div
              key={name}
              className="absolute bottom-0 right-0 flex flex-col items-center gap-1.5"
              initial={{ opacity: 0, x: 0, y: 0, scale: 0.5 }}
              animate={{ opacity: 1, x: pos.x, y: pos.y, scale: 1 }}
              exit={{ opacity: 0, x: 0, y: 0, scale: 0.5 }}
              transition={{ type: "spring", stiffness: 300, damping: 22 }}
            >
              <button
                onClick={() => { setSection(name); setOpen(false); }}
                title={label}
                aria-label={`Navigate to ${label}`}
                className={`agent-action-btn ${isActive ? "active" : ""}`}
              >
                <Icon size={19} />
              </button>
              <span className={`agent-action-label ${isActive ? "active" : ""}`}>
                {label}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>

      <motion.button
        ref={orbRef}
        onClick={() => setOpen(v => !v)}
        className="agent-orb-btn"
        title="AI Agent Navigation"
        aria-label="Open navigation"
        animate={{ boxShadow: open
          ? "0 0 0 14px rgba(87,202,190,.14), 0 0 52px rgba(87,202,190,.52)"
          : "0 0 32px rgba(87,202,190,.36)" }}
        transition={{ duration: 0.4 }}
      >
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.35 }}>
          <Bot size={30} />
        </motion.div>
        <span className="agent-orb-ring" />
      </motion.button>
    </div>
  );
}
