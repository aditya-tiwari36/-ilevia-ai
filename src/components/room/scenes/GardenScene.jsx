import { motion } from "framer-motion";

export function GardenScene({ devices }) {
  const irrigation = devices?.find(d => d.kind === "irrigation");
  const lights = devices?.find(d => d.kind === "light");

  const irrigating = irrigation?.params["Zone 1 State"] === "Watering";
  const lightsOn = lights?.params["Power State"] === "On";
  const brightness = lights?.params["Brightness"] ?? 45;

  return (
    <g>
      {/* Sky */}
      <rect x="60" y="60" width="1080" height="760" fill="url(#skyGrad)" />

      {/* Sun */}
      <circle cx="960" cy="150" r="70" fill="#f7d46a" opacity="0.9" />
      <motion.circle cx="960" cy="150" r="82" fill="rgba(247,212,90,0.28)"
        animate={{ r: [80, 96, 80] }} transition={{ duration: 3, repeat: Infinity }} />

      {/* Far hills */}
      <path d="M60 440 C200 350 400 380 600 340 C800 300 1000 360 1140 330 L1140 760 L60 760 Z" fill="#7dc463" opacity="0.55" />
      {/* Mid hills */}
      <path d="M60 490 C180 420 350 448 540 420 C700 396 880 438 1140 410 L1140 760 L60 760 Z" fill="#5ea84a" opacity="0.72" />
      {/* Lawn */}
      <path d="M60 548 C220 510 440 534 660 510 C840 492 1020 518 1140 500 L1140 760 L60 760 Z" fill="#4a9638" />
      <path d="M60 568 C280 542 500 560 720 538 C900 520 1060 546 1140 530 L1140 760 L60 760 Z" fill="#3e8430" />

      {/* Path */}
      <ellipse cx="600" cy="680" rx="140" ry="30" fill="#c8b882" opacity="0.6" />
      <path d="M540 760 L440 620 Q600 590 760 620 L660 760 Z" fill="#c8b882" opacity="0.5" />
      {/* Path stones */}
      {[[530,680],[570,660],[610,650],[650,660],[685,678]].map(([cx,cy],i) => (
        <ellipse key={i} cx={cx} cy={cy} rx="18" ry="8" fill="#d4c490" opacity="0.7" />
      ))}

      {/* Trees — left */}
      <rect x="148" y="390" width="18" height="160" rx="8" fill="#5a3e22" />
      <circle cx="157" cy="360" r="72" fill="#2d7a22" />
      <circle cx="142" cy="375" r="52" fill="#38962c" />
      <circle cx="172" cy="378" r="48" fill="#329028" />

      {/* Trees — right */}
      <rect x="990" y="390" width="18" height="160" rx="8" fill="#5a3e22" />
      <circle cx="999" cy="358" r="68" fill="#2a7020" />
      <circle cx="984" cy="372" r="50" fill="#348c28" />
      <circle cx="1014" cy="374" r="46" fill="#2e8824" />

      {/* Bushes left group */}
      <circle cx="290" cy="530" r="48" fill="#48a038" />
      <circle cx="330" cy="522" r="42" fill="#52b040" />
      <circle cx="258" cy="540" r="38" fill="#3e9830" />

      {/* Bushes right group */}
      <circle cx="870" cy="530" r="46" fill="#48a038" />
      <circle cx="908" cy="524" r="40" fill="#52b040" />
      <circle cx="842" cy="540" r="36" fill="#3e9830" />

      {/* Flower bed */}
      <ellipse cx="600" cy="560" rx="200" ry="40" fill="#3a8a2e" />
      {[[480,552],[520,548],[560,544],[600,546],[640,548],[680,552],[720,556]].map(([cx,cy],i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="10" fill={["#e85c8a","#f5a623","#e85c3a","#8ae85c","#5c8ae8","#e8d45c"][i % 6]} />
          <circle cx={cx} cy={cy} r="5" fill="rgba(255,255,255,.6)" />
        </g>
      ))}

      {/* Irrigation system — sprinkler head */}
      <rect x="568" y="535" width="16" height="30" rx="6" fill="#7a6040" />
      <ellipse cx="576" cy="534" rx="14" ry="6" fill="#8a7050" />
      {/* Water spray */}
      {irrigating && [0,1,2,3,4,5,6,7].map(i => {
        const angle = -60 + i * 18;
        const rad = (angle * Math.PI) / 180;
        const tx = 576 + Math.cos(rad) * 90;
        const ty = 528 + Math.sin(rad) * 60;
        return (
          <motion.g key={i}>
            <motion.line
              x1="576" y1="528"
              x2={tx} y2={ty}
              stroke="rgba(74,175,218,0.7)"
              strokeWidth="2"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: [0, 1, 0] }}
              transition={{ duration: 0.9 + i * 0.08, repeat: Infinity, delay: i * 0.12, ease: "easeOut" }}
            />
            <motion.circle
              cx={tx} cy={ty} r="4"
              fill="rgba(74,175,218,0.5)"
              animate={{ opacity: [0, 1, 0], cy: [ty, ty + 18, ty + 35] }}
              transition={{ duration: 0.9 + i * 0.08, repeat: Infinity, delay: i * 0.12 }}
            />
          </motion.g>
        );
      })}

      {/* Garden path lights */}
      {[[450, 630], [540, 610], [630, 600], [720, 610]].map(([cx, cy], i) => (
        <g key={i}>
          <rect x={cx - 4} y={cy - 20} width="8" height="22" rx="4" fill="#888" />
          <ellipse cx={cx} cy={cy - 22} rx="14" ry="7" fill={lightsOn ? "#ffe880" : "#c8c060"} />
          {lightsOn && (
            <motion.ellipse cx={cx} cy={cy - 6} rx="28" ry="28" fill="rgba(255,232,100,0.35)"
              animate={{ opacity: [0.5 * brightness / 100, 0.7 * brightness / 100, 0.5 * brightness / 100] }}
              transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.4 }} />
          )}
        </g>
      ))}

      {/* Fence */}
      {[0,1,2,3,4,5,6,7,8,9,10,11,12].map(i => (
        <g key={i}>
          <rect x={80 + i * 90} y="500" width="14" height="70" rx="4" fill="#c4a870" />
          <path d={`M${80 + i * 90} 500 L${87 + i * 90} 490 L${94 + i * 90} 500`} fill="#c4a870" />
          {i < 12 && <rect x={80 + i * 90 + 12} y="515" width={90 - 14} height="10" rx="4" fill="#b89860" />}
          {i < 12 && <rect x={80 + i * 90 + 12} y="545" width={90 - 14} height="10" rx="4" fill="#b89860" />}
        </g>
      ))}

      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#87ceeb" />
          <stop offset="0.6" stopColor="#c8e8f4" />
          <stop offset="1" stopColor="#d4f0e4" />
        </linearGradient>
      </defs>
    </g>
  );
}
