import { motion } from "framer-motion";

const beachUrl = "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2400&q=85";

export function GlassShell({ title, kicker, children }) {
  return (
    <motion.section
      className="min-h-screen overflow-x-hidden bg-cover bg-center"
      style={{
        backgroundImage: `linear-gradient(135deg, rgba(10,24,32,.52) 0%, rgba(14,38,50,.46) 100%), url(${beachUrl})`
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="mx-auto max-w-[1760px] px-4 py-4 md:px-8 md:py-7">
        <header className="mb-4 md:mb-6 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-white/60">{kicker}</p>
          <h1 className="mt-1 text-2xl md:text-5xl font-semibold tracking-tight">{title}</h1>
        </header>
        {children}
      </div>
    </motion.section>
  );
}
