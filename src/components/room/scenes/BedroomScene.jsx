import { motion } from "framer-motion";

export function BedroomScene({ devices }) {
  const lights = devices?.find(d => d.kind === "light");
  const ac = devices?.find(d => d.kind === "ac");
  const fan = devices?.find(d => d.kind === "fan");
  const blinds = devices?.find(d => d.kind === "blinds");

  const lightsOn = lights?.params["Power State"] === "On";
  const brightness = lights?.params["Brightness"] ?? 40;
  const colorTemp = lights?.params["Color Temperature"] ?? "Cool";
  const acOn = ac?.params["Operation Mode"] && ac?.params["Operation Mode"] !== "Off";
  const fanOn = fan?.params["Power State"] === "On";
  const fanSpeed = fan?.params["Fan Speed"] ?? "Low";
  const blindsOpen = blinds?.params["Open/Close Percentage"] ?? 60;

  const lightColor = colorTemp === "Cool" ? "rgba(190,220,255,0.5)" : colorTemp === "Neutral" ? "rgba(255,238,205,0.48)" : "rgba(255,208,110,0.52)";
  const lightOpacity = lightsOn ? brightness / 100 : 0;
  const fanDuration = fanSpeed === "High" ? 0.5 : fanSpeed === "Medium" ? 1.0 : 1.8;

  return (
    <g>
      {/* Wall */}
      <rect x="60" y="60" width="1080" height="548" fill="url(#bedWall)" />
      {/* Skirting */}
      <rect x="60" y="588" width="1080" height="16" fill="#c0c8cc" />
      {/* Floor */}
      <rect x="60" y="604" width="1080" height="156" fill="url(#bedFloor)" />
      {/* Floor planks */}
      {[0,1,2,3,4,5,6].map(i => (
        <line key={i} x1="60" y1={614 + i * 21} x2="1140" y2={614 + i * 21} stroke="rgba(0,0,0,.06)" strokeWidth="1" />
      ))}

      {/* Left curtain section */}
      <rect x="60" y="60" width="240" height="548" fill="#e2e9f0" />
      {/* Window */}
      <rect x="100" y="120" width="172" height="300" rx="6" fill="#cce0f2" opacity="0.88" />
      <rect x="100" y="120" width="172" height="300" rx="6" fill="none" stroke="#7a9db8" strokeWidth="4" />
      <line x1="186" y1="120" x2="186" y2="420" stroke="#7a9db8" strokeWidth="3" />
      <line x1="100" y1="270" x2="272" y2="270" stroke="#7a9db8" strokeWidth="3" />
      {/* Blind */}
      <rect x="100" y="120" width="172" height={300 * (1 - blindsOpen / 100)} fill="#ddd4c2" opacity="0.72" />
      {/* Curtains */}
      <path d="M60 110 C82 165 74 235 80 318 C84 362 78 402 70 448 L60 448 Z" fill="#7a8db8" opacity="0.78" />
      <path d="M272 110 C250 165 258 235 252 318 C248 362 254 402 262 448 L272 448 Z" fill="#7a8db8" opacity="0.78" />
      {/* Sunlight */}
      <ellipse cx="186" cy="270" rx="86" ry="130" fill="rgba(180,215,255,0.16)" />

      {/* Ceiling fan */}
      <rect x="597" y="60" width="8" height="38" rx="4" fill="#888" />
      <motion.g
        style={{ transformOrigin: "601px 98px" }}
        animate={{ rotate: fanOn ? 360 : 0 }}
        transition={fanOn ? { repeat: Infinity, duration: fanDuration, ease: "linear" } : { duration: 0.5 }}
      >
        <circle cx="601" cy="98" r="12" fill="#bbb" />
        {[0, 90, 180, 270].map(angle => (
          <ellipse
            key={angle}
            cx="601"
            cy="98"
            rx="68"
            ry="14"
            fill="#c8c0b4"
            style={{ transformOrigin: "601px 98px", transform: `rotate(${angle}deg)` }}
          />
        ))}
        <circle cx="601" cy="98" r="8" fill="#999" />
      </motion.g>

      {/* Right wall — AC */}
      <rect x="940" y="60" width="200" height="548" fill="#dde4e8" />
      <rect x="958" y="96" width="164" height="72" rx="12" fill="#eaf0f2" stroke="#c0ccce" strokeWidth="2" />
      <rect x="966" y="108" width="148" height="6" rx="3" fill="#b4c4c8" />
      <rect x="966" y="120" width="148" height="6" rx="3" fill="#b4c4c8" />
      <rect x="966" y="132" width="148" height="6" rx="3" fill="#b4c4c8" />
      <rect x="966" y="144" width="148" height="6" rx="3" fill="#b4c4c8" />
      <rect x="966" y="152" width="16" height="10" rx="5" fill={acOn ? "#7a8db8" : "#c0ccce"} />
      {acOn && [0,1,2,3,4].map(i => (
        <motion.line
          key={i}
          x1={972 + i * 28}
          y1="178"
          x2={972 + i * 28}
          y2="210"
          stroke="rgba(120,150,200,0.55)"
          strokeWidth="2"
          strokeLinecap="round"
          animate={{ opacity: [0, 0.7, 0], y2: [178, 240] }}
          transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2, ease: "easeOut" }}
        />
      ))}

      {/* Bed */}
      {/* Headboard */}
      <rect x="340" y="380" width="470" height="88" rx="24" fill="#6272a4" />
      {/* Mattress */}
      <rect x="340" y="450" width="470" height="130" rx="14" fill="#f0f4f8" />
      {/* Sheets / duvet */}
      <rect x="340" y="476" width="470" height="104" rx="12" fill="#dce6f0" />
      <path d="M340 508 Q420 498 510 512 Q590 524 680 508 Q760 496 810 508" stroke="#c0d0e0" strokeWidth="3" fill="none" />
      {/* Pillows */}
      <rect x="360" y="456" width="148" height="56" rx="18" fill="white" />
      <rect x="536" y="456" width="148" height="56" rx="18" fill="white" />
      {/* Pillow detail */}
      <rect x="378" y="468" width="112" height="32" rx="12" fill="#f2f6f9" />
      <rect x="554" y="468" width="112" height="32" rx="12" fill="#f2f6f9" />
      {/* Bed legs */}
      <rect x="348" y="575" width="16" height="28" rx="4" fill="#4a5880" />
      <rect x="784" y="575" width="16" height="28" rx="4" fill="#4a5880" />
      {/* Under-bed shadow */}
      <ellipse cx="576" cy="608" rx="220" ry="10" fill="rgba(0,0,0,.08)" />

      {/* Bedside table - left */}
      <rect x="268" y="488" width="72" height="90" rx="10" fill="#8a7056" />
      <rect x="268" y="488" width="72" height="32" rx="10" fill="#a08468" />
      <circle cx="304" cy="510" r="6" fill="#7a6050" />
      {/* Bedside lamp */}
      <rect x="298" y="448" width="10" height="42" rx="5" fill="#a09070" />
      <ellipse cx="303" cy="442" rx="32" ry="14" fill={lightsOn ? "#f8e898" : "#d4c870"} opacity="0.9" />
      {lightsOn && (
        <motion.ellipse cx="303" cy="488" rx="60" ry="80" fill={lightColor}
          animate={{ opacity: [lightOpacity * 0.5, lightOpacity * 0.65, lightOpacity * 0.5] }}
          transition={{ duration: 2.4, repeat: Infinity }} />
      )}

      {/* Bedside table - right */}
      <rect x="808" y="488" width="72" height="90" rx="10" fill="#8a7056" />
      <rect x="808" y="488" width="72" height="32" rx="10" fill="#a08468" />
      <circle cx="844" cy="510" r="6" fill="#7a6050" />
      {/* Bedside lamp */}
      <rect x="838" y="448" width="10" height="42" rx="5" fill="#a09070" />
      <ellipse cx="843" cy="442" rx="32" ry="14" fill={lightsOn ? "#f8e898" : "#d4c870"} opacity="0.9" />
      {lightsOn && (
        <motion.ellipse cx="843" cy="488" rx="60" ry="80" fill={lightColor}
          animate={{ opacity: [lightOpacity * 0.5, lightOpacity * 0.65, lightOpacity * 0.5] }}
          transition={{ duration: 2.4, repeat: Infinity, delay: 0.6 }} />
      )}

      {/* Ceiling light */}
      <ellipse cx="601" cy="66" rx="28" ry="8" fill={lightsOn ? "#fff8e0" : "#e0e0e0"} />
      {lightsOn && (
        <motion.ellipse cx="601" cy="66" rx="220" ry="130" fill={lightColor}
          animate={{ opacity: [lightOpacity * 0.35, lightOpacity * 0.45, lightOpacity * 0.35] }}
          transition={{ duration: 2.2, repeat: Infinity }} />
      )}

      {/* Ambient light overlay */}
      {lightsOn && (
        <motion.rect x="60" y="60" width="1080" height="548" fill={lightColor}
          animate={{ opacity: lightOpacity * 0.22 }}
          transition={{ duration: 0.5 }} />
      )}

      <defs>
        <linearGradient id="bedWall" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#edf2f7" />
          <stop offset="1" stopColor="#dde6ee" />
        </linearGradient>
        <linearGradient id="bedFloor" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#c0a882" />
          <stop offset="1" stopColor="#d4bc9a" />
        </linearGradient>
      </defs>
    </g>
  );
}
