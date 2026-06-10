import { CloudSun, Droplets, Moon, MapPin, Sunrise, Sunset, Wind } from "lucide-react";

export function WeatherPanel({ weather, location }) {
  const isDaylight = weather.daylight;

  return (
    <div className="rounded-[24px] border border-white/60 bg-white/90 p-5 shadow-2xl backdrop-blur-2xl">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#57706a]">Live Weather Input</p>
          <div className="mt-1 flex items-center gap-1.5">
            <MapPin size={14} className="text-[#35766f]" />
            <h2 className="text-base font-semibold text-[#172321]">{location}</h2>
          </div>
        </div>
        <div className={`flex items-center justify-center rounded-full px-2.5 py-1.5 ${isDaylight ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"}`}>
          {isDaylight ? <CloudSun size={18} /> : <Moon size={18} />}
          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide">
            {isDaylight ? "Day" : "Night"}
          </span>
        </div>
      </div>

      {/* Main Temp & Condition */}
      <div className="mb-5 flex items-end gap-4 border-b border-[#e8eeeb] pb-5">
        <div className="text-[56px] font-bold leading-none tracking-tighter text-[#172321]">
          {weather.temp}°
        </div>
        <div className="mb-1.5">
          <p className="text-sm font-semibold text-[#172321]">{weather.condition}</p>
          <p className="text-xs font-medium text-[#57706a]">Feels like {weather.feels}°</p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="flex flex-col items-center text-center">
          <Droplets size={16} className="mb-1 text-[#35766f]" />
          <span className="text-[10px] font-medium text-[#6a807a]">Humidity</span>
          <span className="mt-0.5 text-xs font-semibold text-[#172321]">{weather.humidity}%</span>
        </div>
        <div className="flex flex-col items-center text-center border-l border-[#e8eeeb]">
          <Wind size={16} className="mb-1 text-[#35766f]" />
          <span className="text-[10px] font-medium text-[#6a807a]">Wind</span>
          <span className="mt-0.5 text-xs font-semibold text-[#172321]">{weather.wind} km/h</span>
        </div>
        <div className="flex flex-col items-center text-center border-l border-[#e8eeeb]">
          <Sunrise size={16} className="mb-1 text-[#e0a33a]" />
          <span className="text-[10px] font-medium text-[#6a807a]">Sunrise</span>
          <span className="mt-0.5 text-xs font-semibold text-[#172321]">{weather.sunrise}</span>
        </div>
        <div className="flex flex-col items-center text-center border-l border-[#e8eeeb]">
          <Sunset size={16} className="mb-1 text-[#e07050]" />
          <span className="text-[10px] font-medium text-[#6a807a]">Sunset</span>
          <span className="mt-0.5 text-xs font-semibold text-[#172321]">{weather.sunset}</span>
        </div>
      </div>
    </div>
  );
}
