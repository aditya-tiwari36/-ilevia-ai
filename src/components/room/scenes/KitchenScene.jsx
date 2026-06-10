import { motion } from "framer-motion";

export function KitchenScene({ devices }) {
  const lights = devices?.find(d => d.kind === "light");
  const speaker = devices?.find(d => d.kind === "speaker");

  const lightsOn = lights?.params["Power State"] === "On";
  const brightness = lights?.params["Brightness"] ?? 55;
  const colorTemp = lights?.params["Color Temperature"] ?? "Warm";
  const speakerOn = speaker?.params["Playback State"] === "Playing";
  const volume = speaker?.params["Volume Level"] ?? 30;

  const lightColor = colorTemp === "Cool" ? "rgba(190,220,255,0.45)" : "rgba(255,215,130,0.48)";
  const lightOpacity = lightsOn ? brightness / 100 : 0;

  return (
    <g>
      {/* Walls */}
      <rect x="60" y="60" width="1080" height="548" fill="url(#kitWall)" />
      <rect x="60" y="590" width="1080" height="16" fill="#c4c8c0" />
      <rect x="60" y="606" width="1080" height="154" fill="url(#kitFloor)" />
      {/* Tile floor pattern */}
      {[0,1,2,3,4,5,6,7].map(r => (
        [0,1,2,3,4,5,6,7,8,9,10].map(c => (
          <rect key={`${r}-${c}`}
            x={60 + c * 98} y={606 + r * 20}
            width="97" height="19"
            fill={((r + c) % 2 === 0) ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.04)"}
          />
        ))
      ))}

      {/* Back wall tile detail */}
      {[0,1,2,3,4,5].map(r => (
        [0,1,2,3,4,5,6,7,8,9].map(c => (
          <rect key={`wt-${r}-${c}`}
            x={60 + c * 108 + 4} y={260 + r * 40 + 2}
            width="104" height="36" rx="2"
            fill="rgba(255,255,255,.35)"
            stroke="rgba(200,210,204,.6)"
            strokeWidth="1"
          />
        ))
      ))}

      {/* Upper cabinets */}
      <rect x="80" y="108" width="980" height="148" rx="6" fill="url(#cabinetTop)" stroke="#b0bdb5" strokeWidth="1.5" />
      {[0,1,2,3,4,5,6,7,8].map(i => (
        <g key={i}>
          <rect x={92 + i * 108} y="116" width="96" height="132" rx="4" fill="#e8f0ec" stroke="#c0cec8" strokeWidth="1" />
          <rect x={110 + i * 108} y="126" width="60" height="72" rx="3" fill="rgba(220,235,228,.7)" />
          <circle cx={140 + i * 108} cy="162" r="6" fill="#a0b4ac" />
        </g>
      ))}

      {/* Under-cabinet lighting strip */}
      <rect x="80" y="255" width="980" height="8" rx="4" fill={lightsOn ? "#ffe8a0" : "#ccd4cc"} />
      {lightsOn && (
        <motion.rect x="80" y="255" width="980" height="8" rx="4" fill="#ffe8a0"
          animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 2, repeat: Infinity }} />
      )}

      {/* Counter / workspace */}
      <rect x="80" y="380" width="980" height="220" rx="8" fill="url(#counterGrad)" />
      <rect x="80" y="380" width="980" height="28" rx="8" fill="#c8d4ce" />

      {/* Sink area */}
      <rect x="240" y="408" width="200" height="120" rx="8" fill="#b8c8c2" />
      <rect x="256" y="420" width="168" height="88" rx="6" fill="#9aaead" />
      <ellipse cx="340" cy="415" rx="16" ry="10" fill="#8a9e9c" />
      {/* Faucet */}
      <rect x="334" y="400" width="8" height="22" rx="4" fill="#aab8b4" />
      <path d="M338 400 Q358 395 365 405" stroke="#a0b0ac" strokeWidth="5" fill="none" strokeLinecap="round" />

      {/* Stove */}
      <rect x="480" y="394" width="240" height="170" rx="8" fill="#c8cec8" />
      <rect x="490" y="400" width="220" height="140" rx="6" fill="#b8beb8" />
      {/* Burners */}
      {[[560, 436], [660, 436], [560, 516], [660, 516]].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="26" fill="#a0a8a0" />
          <circle cx={cx} cy={cy} r="18" fill="#909890" />
          <circle cx={cx} cy={cy} r="8" fill="#808880" />
        </g>
      ))}
      {/* Oven front */}
      <rect x="480" y="520" width="240" height="50" rx="6" fill="#b0b6b0" />
      <rect x="492" y="528" width="216" height="34" rx="5" fill="#a0a6a0" />
      <rect x="495" y="531" width="210" height="28" rx="4" fill="rgba(0,0,0,.15)" />

      {/* Refrigerator */}
      <rect x="770" y="100" width="130" height="480" rx="12" fill="#dde8e4" stroke="#c4d2cc" strokeWidth="2" />
      <rect x="778" y="108" width="114" height="210" rx="8" fill="#e8f0ec" />
      <rect x="778" y="326" width="114" height="246" rx="8" fill="#e2ecec" />
      <line x1="770" y1="322" x2="900" y2="322" stroke="#c4d2cc" strokeWidth="2" />
      <rect x="888" y="165" width="8" height="60" rx="4" fill="#b4c0bc" />
      <rect x="888" y="382" width="8" height="60" rx="4" fill="#b4c0bc" />

      {/* Small appliances on counter */}
      {/* Toaster */}
      <rect x="92" y="346" width="80" height="46" rx="8" fill="#c0c8c4" />
      <rect x="100" y="346" width="64" height="28" rx="6" fill="#b0b8b4" />
      <rect x="118" y="346" width="8" height="20" rx="3" fill="#e8e8e8" />
      <rect x="138" y="346" width="8" height="20" rx="3" fill="#e8e8e8" />

      {/* Speaker */}
      <rect x="905" y="316" width="90" height="68" rx="12" fill="#2a3a34" />
      <rect x="915" y="328" width="70" height="44" rx="8" fill="#1e2e28" />
      {speakerOn ? (
        [0,1,2,3,4].map(i => (
          <motion.rect
            key={i}
            x={921 + i * 13}
            y={350 - (volume / 100 * 14 * Math.sin(i + 1))}
            width="9"
            height={8 + (volume / 100 * 14 * Math.abs(Math.sin(i + 1)))}
            rx="4"
            fill="#57cabe"
            animate={{ height: [
              8 + (volume / 100 * 14 * Math.abs(Math.sin(i + 1))),
              8 + (volume / 100 * 22 * Math.abs(Math.sin(i + 2))),
              8 + (volume / 100 * 14 * Math.abs(Math.sin(i + 1)))
            ] }}
            transition={{ duration: 0.4 + i * 0.1, repeat: Infinity, ease: "easeInOut" }}
          />
        ))
      ) : (
        [0,1,2,3,4].map(i => (
          <rect key={i} x={921 + i * 13} y="354" width="9" height="8" rx="4" fill="#3a4a44" />
        ))
      )}

      {/* Overhead pendant lights */}
      {[300, 500, 700, 900].map(cx => (
        <g key={cx}>
          <line x1={cx} y1="60" x2={cx} y2="100" stroke="#888" strokeWidth="3" />
          <ellipse cx={cx} cy="104" rx="28" ry="14" fill={lightsOn ? "#ffe8b0" : "#d4cca0"} />
          <ellipse cx={cx} cy="108" rx="22" ry="10" fill={lightsOn ? "#ffe090" : "#c8c080"} />
          {lightsOn && (
            <motion.ellipse cx={cx} cy="180" rx="90" ry="100" fill={lightColor}
              animate={{ opacity: [lightOpacity * 0.45, lightOpacity * 0.6, lightOpacity * 0.45] }}
              transition={{ duration: 2.2, repeat: Infinity, delay: cx * 0.001 }} />
          )}
        </g>
      ))}

      {/* Ambient light */}
      {lightsOn && (
        <motion.rect x="60" y="60" width="1080" height="548" fill={lightColor}
          animate={{ opacity: lightOpacity * 0.2 }} transition={{ duration: 0.5 }} />
      )}

      <defs>
        <linearGradient id="kitWall" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#eef3ef" />
          <stop offset="1" stopColor="#e0e8e3" />
        </linearGradient>
        <linearGradient id="kitFloor" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#ccc8c0" />
          <stop offset="1" stopColor="#d8d4cc" />
        </linearGradient>
        <linearGradient id="cabinetTop" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#d8e4de" />
          <stop offset="1" stopColor="#c8d8d0" />
        </linearGradient>
        <linearGradient id="counterGrad" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#cad4ce" />
          <stop offset="1" stopColor="#bcc8c2" />
        </linearGradient>
      </defs>
    </g>
  );
}
