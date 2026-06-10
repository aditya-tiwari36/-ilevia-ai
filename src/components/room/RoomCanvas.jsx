import { AnimatePresence, motion } from "framer-motion";
import { rooms } from "../../data/home.js";
import { BedroomScene } from "./scenes/BedroomScene.jsx";
import { EntranceScene } from "./scenes/EntranceScene.jsx";
import { GardenScene } from "./scenes/GardenScene.jsx";
import { KitchenScene } from "./scenes/KitchenScene.jsx";
import { LivingRoomScene } from "./scenes/LivingRoomScene.jsx";
import { DeviceHotspot } from "./DeviceHotspot.jsx";
import { DeviceControlPanel } from "./DeviceControlPanel.jsx";

const SCENES = {
  "Living Room": LivingRoomScene,
  "Master Bedroom": BedroomScene,
  "Kitchen": KitchenScene,
  "Garden": GardenScene,
  "Entrance": EntranceScene
};

export function RoomCanvas({ room, devices, selectedId, onSelect, onChange }) {
  const Scene = SCENES[room];
  const selectedDevice = devices.find(device => device.id === selectedId);

  return (
    <div className="relative h-[320px] md:h-[calc(100vh-138px)] md:min-h-[640px] overflow-hidden rounded-[28px] bg-[#dce9e3] shadow-2xl">
      <AnimatePresence mode="wait">
        <motion.svg
          key={room}
          viewBox="0 0 1200 760"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid slice"
          initial={{ opacity: 0, scale: 1.02 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          {Scene && <Scene devices={devices} />}
        </motion.svg>
      </AnimatePresence>

      {/* Device hotspots */}
      {devices.map(device => (
        <DeviceHotspot
          key={device.id}
          device={device}
          selected={device.id === selectedId}
          onSelect={id => onSelect(id)}
        />
      ))}

      <DeviceControlPanel
        device={selectedDevice}
        onChange={onChange}
        onClose={() => onSelect(null)}
      />

      {/* Room badge */}
      <div className="absolute left-3 top-3 md:left-5 md:top-5 z-10 flex items-center gap-2 md:gap-3 rounded-2xl bg-white/70 px-3 md:px-4 py-2 md:py-3 shadow-lg backdrop-blur-xl">
        <div
          className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-full"
          style={{ backgroundColor: rooms[room]?.accent ?? "#57cabe" }}
        />
        <div>
          <p className="text-[9px] md:text-[10px] font-bold uppercase tracking-[0.2em] text-[#57706a]">Current Room</p>
          <p className="text-sm md:text-lg font-semibold leading-tight text-[#172321]">{room}</p>
        </div>
      </div>

      {/* Active device count badge — hidden on mobile to avoid clutter */}
      <div className="hidden md:block absolute right-5 top-5 z-10 rounded-2xl bg-white/70 px-4 py-3 shadow-lg backdrop-blur-xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#57706a]">Devices</p>
        <p className="text-lg font-semibold text-[#172321]">{devices.length} total</p>
      </div>
    </div>
  );
}
