export const weatherByLocation = {
  Mumbai: { temp: 31, feels: 36, humidity: 78, condition: "Humid morning haze", wind: 13, sunrise: "05:59", sunset: "19:14", daylight: true },
  Dubai: { temp: 37, feels: 41, humidity: 44, condition: "Clear hot sky", wind: 16, sunrise: "05:28", sunset: "19:09", daylight: true },
  London: { temp: 18, feels: 17, humidity: 64, condition: "Soft cloud cover", wind: 11, sunrise: "04:43", sunset: "21:18", daylight: true },
  Sydney: { temp: 16, feels: 15, humidity: 58, condition: "Cool coastal sun", wind: 19, sunrise: "06:54", sunset: "16:54", daylight: true },
  Singapore: { temp: 30, feels: 35, humidity: 82, condition: "Tropical shower risk", wind: 9, sunrise: "06:57", sunset: "19:10", daylight: true }
};

export const rooms = {
  "Living Room": {
    accent: "#57cabe",
    devices: [
      { id: "LivingRoom_LED_1", name: "Smart Lights", kind: "light", x: 46, y: 18, params: { "Power State": "Off", Brightness: 42, "Color Temperature": "Warm" } },
      { id: "LivingRoom_AC_1", name: "Climate AC", kind: "ac", x: 74, y: 22, params: { "Operation Mode": "Off", "Target Temperature": 24, "Fan Speed": "Medium" } },
      { id: "LivingRoom_Fan_1", name: "Ceiling Fan", kind: "fan", x: 50, y: 32, params: { "Power State": "Off", "Fan Speed": "Low" } },
      { id: "LivingRoom_Blinds_1", name: "Window Blinds", kind: "blinds", x: 25, y: 31, params: { "Open/Close Percentage": 48 } },
      { id: "TV_Plug_1", name: "Media Plug", kind: "plug", x: 73, y: 69, params: { "Switch State": "Off" } }
    ]
  },
  "Master Bedroom": {
    accent: "#8fa6ff",
    devices: [
      { id: "Bedroom_LED_2", name: "Bedroom Lights", kind: "light", x: 42, y: 18, params: { "Power State": "Off", Brightness: 30, "Color Temperature": "Cool" } },
      { id: "Bedroom_AC_2", name: "Bedroom AC", kind: "ac", x: 76, y: 24, params: { "Operation Mode": "Off", "Target Temperature": 24, "Fan Speed": "Medium" } },
      { id: "Bedroom_Fan_2", name: "Quiet Fan", kind: "fan", x: 50, y: 34, params: { "Power State": "Off", "Fan Speed": "Low" } },
      { id: "Bedroom_Curtains_2", name: "Curtains", kind: "blinds", x: 21, y: 34, params: { "Open/Close Percentage": 62 } }
    ]
  },
  Kitchen: {
    accent: "#f3bd58",
    devices: [
      { id: "Kitchen_Speaker_1", name: "Kitchen Speaker", kind: "speaker", x: 74, y: 36, params: { "Playback State": "Paused", "Volume Level": 24 } },
      { id: "Kitchen_LED_1", name: "Counter Lights", kind: "light", x: 44, y: 20, params: { "Power State": "Off", Brightness: 52, "Color Temperature": "Warm" } }
    ]
  },
  Garden: {
    accent: "#78d46b",
    devices: [
      { id: "Garden_Irrigation_1", name: "Irrigation", kind: "irrigation", x: 48, y: 58, params: { "Zone 1 State": "Idle", "Duration Minutes": 10 } },
      { id: "Garden_LED_1", name: "Garden Lights", kind: "light", x: 76, y: 34, params: { "Power State": "Off", Brightness: 45, "Color Temperature": "Warm" } }
    ]
  },
  Entrance: {
    accent: "#ff8e7a",
    devices: [
      { id: "FrontDoor_Cam_1", name: "Security Camera", kind: "camera", x: 68, y: 25, params: { "Privacy Mode": "Off" } },
      { id: "Entrance_LED_1", name: "Entrance Lights", kind: "light", x: 39, y: 24, params: { "Power State": "Off", Brightness: 58, "Color Temperature": "Warm" } }
    ]
  }
};

export const deviceCopy = {
  light: "Lighting preference is inferred from brightness history, daylight, and room presence.",
  ac: "High humidity and warm weather are weighted with this room's comfort pattern.",
  fan: "Airflow predictions combine occupancy, temperature, and recent manual comfort changes.",
  blinds: "Window cover decisions use daylight, glare, room schedule, and cooling load.",
  speaker: "Playback decisions are based on presence and time-of-day media routines.",
  irrigation: "Watering is gated by season, humidity, and recent weather conditions.",
  camera: "Security posture follows arrival state, privacy history, and entrance activity.",
  plug: "Media power is predicted from room occupancy and entertainment routines."
};
