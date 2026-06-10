import { AnimatePresence } from "framer-motion";
import { HomeProvider, useHome } from "./context/HomeContext.jsx";
import { AIAgent } from "./components/shared/AIAgent.jsx";
import { RoomSection } from "./components/room/RoomSection.jsx";
import { SimulationSection } from "./components/simulation/SimulationSection.jsx";
import { ConsoleSection } from "./components/console/ConsoleSection.jsx";

function AppInner() {
  const { section } = useHome();
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#eef5f0] text-[#172321]">
      <AnimatePresence mode="wait">
        {section === "room" && <RoomSection key="room" />}
        {section === "simulation" && <SimulationSection key="simulation" />}
        {section === "console" && <ConsoleSection key="console" />}
      </AnimatePresence>
      <AIAgent />
    </main>
  );
}

export default function App() {
  return (
    <HomeProvider>
      <AppInner />
    </HomeProvider>
  );
}
