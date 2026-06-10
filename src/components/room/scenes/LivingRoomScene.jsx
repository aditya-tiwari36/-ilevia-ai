import { motion } from "framer-motion";

// Living Room — sofa, curtains, window, lamp, AC unit, fan center
export function LivingRoomScene({ devices }) {
  const lights = devices?.find(d => d.kind === "light");
  const ac = devices?.find(d => d.kind === "ac");
  const fan = devices?.find(d => d.kind === "fan");
  const blinds = devices?.find(d => d.kind === "blinds");

  const lightsOn = lights?.params["Power State"] === "On";
  const brightness = lights?.params["Brightness"] ?? 50;
  const colorTemp = lights?.params["Color Temperature"] ?? "Warm";
  const acOn = ac?.params["Operation Mode"] && ac?.params["Operation Mode"] !== "Off";
  const fanOn = fan?.params["Power State"] === "On";
  const fanSpeed = fan?.params["Fan Speed"] ?? "Low";
  const blindsOpen = (blinds?.params["Open/Close Percentage"] ?? 50);

  const lightColor = colorTemp === "Cool" ? "rgba(200,230,255,0.55)" : colorTemp === "Neutral" ? "rgba(255,240,210,0.5)" : "rgba(255,210,120,0.55)";
  const lightOpacity = lightsOn ? brightness / 100 : 0;
  const fanDuration = fanSpeed === "High" ? 0.5 : fanSpeed === "Medium" ? 1.0 : 1.8;

  return (
    <g>
      {/* Back wall */}
      <rect x="60" y="60" width="1080" height="560" rx="0" fill="url(#livingWall)" />
      {/* Skirting board */}
      <rect x="60" y="590" width="1080" height="18" fill="#c8cfc9" />
      {/* Floor */}
      <rect x="60" y="608" width="1080" height="152" fill="url(#livingFloor)" />
      {/* Floor planks */}
      {[0,1,2,3,4,5,6].map(i => (
        <line key={i} x1="60" y1={620 + i * 20} x2="1140" y2={620 + i * 20} stroke="rgba(0,0,0,.07)" strokeWidth="1" />
      ))}
      {[0,1,2,3,4,5,6,7,8,9].map(i => (
        <line key={i} x1={60 + i * 120 + 60} y1="608" x2={60 + i * 120 + 60} y2="760" stroke="rgba(0,0,0,.06)" strokeWidth="1" />
      ))}

      {/* Left curtain wall area */}
      <rect x="60" y="60" width="220" height="560" fill="#e8ede9" />
      {/* Window */}
      <rect x="120" y="130" width="160" height="280" rx="6" fill="#b8d8e8" opacity="0.9" />
      <rect x="120" y="130" width="160" height="280" rx="6" fill="none" stroke="#8aacba" strokeWidth="4" />
      <line x1="200" y1="130" x2="200" y2="410" stroke="#8aacba" strokeWidth="3" />
      <line x1="120" y1="270" x2="280" y2="270" stroke="#8aacba" strokeWidth="3" />
      {/* Curtain left */}
      <path d={`M60 120 C80 160 72 230 78 300 C82 340 76 380 68 420 L60 420 Z`} fill="#6b8c84" opacity="0.82" />
      <path d={`M60 120 C78 155 84 210 80 275 C76 325 80 370 75 420 L68 420 C76 380 82 340 78 300 C72 230 80 160 60 120`} fill="#4e7069" opacity="0.7" />
      {/* Curtain right */}
      <path d={`M280 120 C260 160 268 230 262 300 C258 340 264 380 272 420 L280 420 Z`} fill="#6b8c84" opacity="0.82" />
      <path d={`M280 120 C262 155 256 210 260 275 C264 325 260 370 265 420 L272 420 C264 380 258 340 262 300 C268 230 260 160 280 120`} fill="#4e7069" opacity="0.7" />
      {/* Blind overlay */}
      <rect x="120" y="130" width="160" height={280 * (1 - blindsOpen/100)} fill="#d4c8a8" opacity="0.75" />

      {/* Light glow from window */}
      <ellipse cx="200" cy="270" rx="80" ry="120" fill="rgba(200,230,255,0.18)" />

      {/* Right wall — AC unit */}
      <rect x="940" y="60" width="200" height="560" fill="#e4eae5" />
      {/* AC unit body */}
      <rect x="960" y="100" width="160" height="68" rx="10" fill="#e8f0ee" stroke="#c2d0cb" strokeWidth="2" />
      <rect x="968" y="112" width="144" height="6" rx="3" fill="#b8ccc6" />
      <rect x="968" y="124" width="144" height="6" rx="3" fill="#b8ccc6" />
      <rect x="968" y="136" width="144" height="6" rx="3" fill="#b8ccc6" />
      <rect x="968" y="148" width="16" height="10" rx="5" fill={acOn ? "#57cabe" : "#c8d4d0"} />
      {/* AC airflow lines */}
      {acOn && [0,1,2,3,4].map(i => (
        <motion.line
          key={i}
          x1={975 + i * 26}
          y1="178"
          x2={975 + i * 26}
          y2={200 + i * 8}
          stroke="rgba(87,202,190,0.5)"
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ opacity: 0, y1: 168 }}
          animate={{ opacity: [0, 0.7, 0], y2: [178, 230] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.18, ease: "easeOut" }}
        />
      ))}

      {/* Center ceiling fan */}
      <motion.g
        style={{ transformOrigin: "600px 95px" }}
        animate={{ rotate: fanOn ? 360 : 0 }}
        transition={fanOn ? { repeat: Infinity, duration: fanDuration, ease: "linear" } : { duration: 0.5 }}
      >
        {/* Fan rod */}
        <rect x="596" y="60" width="8" height="42" fill="#888" rx="4" />
        {/* Fan hub */}
        <circle cx="600" cy="102" r="14" fill="#ccc" />
        {/* Fan blades */}
        {[0,1,2,3].map(i => {
          const angle = i * 90;
          return (
            <motion.ellipse
              key={i}
              cx="600"
              cy="102"
              rx="72"
              ry="16"
              fill="url(#fanBlade)"
              style={{ transformOrigin: "600px 102px", transform: `rotate(${angle}deg)` }}
            />
          );
        })}
        <circle cx="600" cy="102" r="9" fill="#aaa" />
      </motion.g>

      {/* Sofa — large sectional */}
      {/* Sofa back */}
      <rect x="340" y="450" width="430" height="80" rx="20" fill="#3d6b60" />
      {/* Sofa seat */}
      <rect x="340" y="504" width="430" height="70" rx="18" fill="#4e8579" />
      {/* Sofa left arm */}
      <rect x="316" y="472" width="48" height="100" rx="18" fill="#3d6b60" />
      {/* Sofa right arm */}
      <rect x="746" y="472" width="48" height="100" rx="18" fill="#3d6b60" />
      {/* Sofa cushions */}
      <rect x="356" y="490" width="128" height="52" rx="14" fill="#5a9689" />
      <rect x="496" y="490" width="128" height="52" rx="14" fill="#5a9689" />
      <rect x="636" y="490" width="118" height="52" rx="14" fill="#5a9689" />
      {/* Sofa legs */}
      <rect x="350" y="568" width="18" height="22" rx="4" fill="#2e5248" />
      <rect x="740" y="568" width="18" height="22" rx="4" fill="#2e5248" />
      {/* Coffee table */}
      <rect x="440" y="596" width="200" height="12" rx="6" fill="#8a6f4e" />
      <rect x="448" y="607" width="8" height="30" rx="3" fill="#6e5538" />
      <rect x="624" y="607" width="8" height="30" rx="3" fill="#6e5538" />

      {/* Floor lamp */}
      <rect x="868" y="320" width="12" height="238" rx="6" fill="#7a6b5a" />
      <ellipse cx="874" cy="310" rx="58" ry="26" fill={lightsOn ? "#f5d884" : "#d4c48c"} opacity={lightsOn ? 0.92 : 0.7} />
      {/* Lamp glow */}
      {lightsOn && (
        <motion.ellipse
          cx="874"
          cy="360"
          rx="110"
          ry="160"
          fill={lightColor}
          initial={{ opacity: 0 }}
          animate={{ opacity: lightOpacity * 0.6 }}
          transition={{ duration: 0.5 }}
        />
      )}
      {/* Lamp base */}
      <ellipse cx="874" cy="558" rx="28" ry="10" fill="#6e5f4e" />

      {/* TV / media unit on right wall */}
      <rect x="850" y="380" width="90" height="60" rx="8" fill="#1a1a1a" />
      <rect x="855" y="386" width="80" height="48" rx="5" fill="#222" />
      <rect x="880" y="440" width="30" height="8" rx="3" fill="#555" />
      <rect x="855" y="448" width="80" height="6" rx="3" fill="#444" />

      {/* Room ambient light */}
      {lightsOn && (
        <motion.rect
          x="60" y="60"
          width="1080" height="560"
          fill={lightColor}
          initial={{ opacity: 0 }}
          animate={{ opacity: lightOpacity * 0.28 }}
          transition={{ duration: 0.5 }}
        />
      )}

      {/* Ceiling light fixture */}
      <ellipse cx="600" cy="65" rx="30" ry="8" fill={lightsOn ? "#fff9e8" : "#e8e8e8"} />
      {lightsOn && (
        <motion.ellipse
          cx="600"
          cy="65"
          rx="200"
          ry="120"
          fill={lightColor}
          animate={{ opacity: [lightOpacity * 0.4, lightOpacity * 0.5, lightOpacity * 0.4] }}
          transition={{ duration: 2.2, repeat: Infinity }}
        />
      )}

      <defs>
        <linearGradient id="livingWall" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#f2f6f4" />
          <stop offset="1" stopColor="#e4ece7" />
        </linearGradient>
        <linearGradient id="livingFloor" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#c8b898" />
          <stop offset="1" stopColor="#d9c9ae" />
        </linearGradient>
        <linearGradient id="fanBlade" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#d4ccc0" />
          <stop offset="1" stopColor="#b8b0a4" />
        </linearGradient>
      </defs>
    </g>
  );
}
