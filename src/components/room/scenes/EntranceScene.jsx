import { motion } from "framer-motion";

export function EntranceScene({ devices }) {
  const camera = devices?.find(d => d.kind === "camera");
  const lights = devices?.find(d => d.kind === "light");

  const cameraOn = camera?.params["Privacy Mode"] !== "On";
  const lightsOn = lights?.params["Power State"] === "On";
  const brightness = lights?.params["Brightness"] ?? 58;

  return (
    <g>
      {/* Exterior sky */}
      <rect x="60" y="60" width="1080" height="760" fill="url(#entranceSky)" />

      {/* Ground / porch */}
      <rect x="60" y="580" width="1080" height="180" fill="url(#porchGround)" />
      {/* Porch tiles */}
      {[0,1,2,3,4,5,6,7,8].map(r => (
        [0,1,2,3,4,5,6,7,8,9,10].map(c => (
          <rect key={`${r}-${c}`}
            x={60 + c * 98} y={580 + r * 20}
            width="97" height="19"
            fill={((r + c) % 2 === 0) ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.05)"}
          />
        ))
      ))}

      {/* Steps */}
      <rect x="360" y="555" width="470" height="28" rx="4" fill="#b8a890" />
      <rect x="340" y="578" width="510" height="22" rx="4" fill="#c4b09a" />

      {/* Porch pillars */}
      <rect x="290" y="150" width="36" height="434" rx="6" fill="#e8e0d4" />
      <rect x="292" y="150" width="32" height="434" fill="url(#pillarGrad)" />
      <rect x="876" y="150" width="36" height="434" rx="6" fill="#e8e0d4" />
      <rect x="878" y="150" width="32" height="434" fill="url(#pillarGrad)" />

      {/* Porch roof overhang */}
      <path d="M260 130 H940 L960 165 H240 Z" fill="#d0c8bc" />
      <rect x="240" y="162" width="720" height="12" rx="4" fill="#bfb7ab" />
      {/* Ceiling of porch */}
      <rect x="290" y="150" width="622" height="6" fill="#c8c0b4" />

      {/* Main wall */}
      <rect x="60" y="60" width="1080" height="560" fill="url(#wallStone)" />
      <rect x="290" y="150" width="622" height="406" fill="#d4cdc4" />

      {/* Stone wall texture */}
      {[0,1,2,3,4,5,6].map(r => (
        [0,1,2,3,4,5,6,7,8,9].map(c => {
          const w = 108 - (c % 3) * 8;
          return (
            <rect key={`st-${r}-${c}`}
              x={60 + c * 108 + (r % 2 === 0 ? 0 : 54)}
              y={60 + r * 78}
              width={w} height="72" rx="3"
              fill="rgba(0,0,0,0)"
              stroke="rgba(180,170,155,.4)"
              strokeWidth="2"
            />
          );
        })
      ))}

      {/* Front door frame */}
      <rect x="430" y="195" width="342" height="368" rx="6" fill="#7a5840" />
      {/* Door surround */}
      <rect x="436" y="200" width="330" height="360" rx="5" fill="#6a4c34" />
      {/* Door panels - double door */}
      <rect x="440" y="204" width="156" height="356" rx="4" fill="#8a6248" />
      <rect x="606" y="204" width="156" height="356" rx="4" fill="#8a6248" />
      {/* Panel details left */}
      <rect x="452" y="220" width="130" height="90" rx="6" fill="#7a5438" />
      <rect x="452" y="324" width="130" height="90" rx="6" fill="#7a5438" />
      <rect x="452" y="428" width="130" height="70" rx="6" fill="#7a5438" />
      {/* Panel details right */}
      <rect x="620" y="220" width="130" height="90" rx="6" fill="#7a5438" />
      <rect x="620" y="324" width="130" height="90" rx="6" fill="#7a5438" />
      <rect x="620" y="428" width="130" height="70" rx="6" fill="#7a5438" />
      {/* Door handles */}
      <circle cx="594" cy="390" r="12" fill="#d4a840" />
      <circle cx="594" cy="390" r="7" fill="#c49a38" />
      <circle cx="608" cy="390" r="12" fill="#d4a840" />
      <circle cx="608" cy="390" r="7" fill="#c49a38" />
      {/* Door top arch / transom window */}
      <rect x="440" y="562" width="322" height="0" rx="0" fill="none" />
      {/* Transom */}
      <rect x="440" y="196" width="322" height="28" rx="4" fill="#cce4f4" />
      <line x1="548" y1="196" x2="548" y2="224" stroke="#6a9ab8" strokeWidth="2" />
      <line x1="656" y1="196" x2="656" y2="224" stroke="#6a9ab8" strokeWidth="2" />

      {/* Doorbell */}
      <rect x="782" y="330" width="36" height="60" rx="10" fill="#e0d8cc" />
      <circle cx="800" cy="360" r="10" fill="#c8c0b4" />

      {/* House number */}
      <rect x="392" y="370" width="38" height="20" rx="4" fill="#c4a860" />
      <text x="411" y="384" textAnchor="middle" fontSize="11" fill="#6a4820" fontWeight="700">42</text>

      {/* Security camera */}
      <rect x="878" y="215" width="80" height="56" rx="10" fill="#2a2a2a" />
      <rect x="884" y="222" width="68" height="42" rx="8" fill="#1a1a1a" />
      {/* Camera lens */}
      <circle cx="940" cy="243" r="14" fill="#111" />
      <circle cx="940" cy="243" r="9" fill="#222" />
      <circle cx="940" cy="243" r="5" fill="#333" />
      <circle cx="940" cy="243" r="2" fill="#555" />
      {/* IR LEDs */}
      {[884, 896, 908].map(x => (
        <circle key={x} cx={x} cy="243" r="4" fill={cameraOn ? "#cc2222" : "#333"} opacity="0.8" />
      ))}
      {/* Recording indicator */}
      {cameraOn && (
        <motion.circle cx="958" cy="225" r="6" fill="#ff2222"
          animate={{ opacity: [1, 0.2, 1], r: [6, 7, 6] }}
          transition={{ duration: 1.4, repeat: Infinity }} />
      )}
      {/* Camera mount */}
      <rect x="900" y="270" width="14" height="40" rx="5" fill="#444" />
      <rect x="888" y="304" width="38" height="10" rx="4" fill="#555" />

      {/* Porch wall lights */}
      {[[310, 260], [888, 260]].map(([cx, cy], i) => (
        <g key={i}>
          <rect x={cx - 14} y={cy - 8} width="28" height="50" rx="8" fill="#e8e0d0" />
          <rect x={cx - 10} y={cy - 2} width="20" height="36" rx="6" fill={lightsOn ? "#ffe8a0" : "#c8c090"} />
          {lightsOn && (
            <motion.ellipse cx={cx} cy={cy + 30} rx="60" ry="80" fill="rgba(255,235,130,0.35)"
              animate={{ opacity: [0.45 * brightness / 100, 0.65 * brightness / 100, 0.45 * brightness / 100] }}
              transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.7 }} />
          )}
        </g>
      ))}

      {/* Outdoor plants */}
      <rect x="220" y="510" width="20" height="72" rx="6" fill="#6a5030" />
      <circle cx="230" cy="490" r="38" fill="#3a8a28" />
      <circle cx="216" cy="502" r="26" fill="#4a9c38" />

      <rect x="954" y="510" width="20" height="72" rx="6" fill="#6a5030" />
      <circle cx="964" cy="490" r="38" fill="#3a8a28" />
      <circle cx="978" cy="502" r="26" fill="#4a9c38" />

      {/* Ambient light */}
      {lightsOn && (
        <motion.rect x="290" y="150" width="622" height="406" fill="rgba(255,235,130,0.12)"
          animate={{ opacity: [0.6 * brightness / 100, 0.8 * brightness / 100, 0.6 * brightness / 100] }}
          transition={{ duration: 2.2, repeat: Infinity }} />
      )}

      <defs>
        <linearGradient id="entranceSky" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#a8d8f0" />
          <stop offset="1" stopColor="#d0e8f4" />
        </linearGradient>
        <linearGradient id="porchGround" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#c4bca8" />
          <stop offset="1" stopColor="#d4ccb8" />
        </linearGradient>
        <linearGradient id="wallStone" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#cec8be" />
          <stop offset="1" stopColor="#d8d2c8" />
        </linearGradient>
        <linearGradient id="pillarGrad" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="rgba(255,255,255,.3)" />
          <stop offset="0.5" stopColor="rgba(255,255,255,0)" />
          <stop offset="1" stopColor="rgba(0,0,0,.08)" />
        </linearGradient>
      </defs>
    </g>
  );
}
