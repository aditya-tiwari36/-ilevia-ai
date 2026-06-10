"""
=============================================================================
Smart Home Ambient Automation — ML Pipeline  (v3 — Weather + GPS Aware)
=============================================================================

WHAT'S NEW IN v3
----------------
  • WeatherFeatureEnricher  — enriches every event row with outdoor weather
    context (temperature, humidity, rain, UV, wind, cloud cover) and solar
    position features (minutes since sunset, minutes to sunrise, is_daylight)
    derived from GPS coordinates.

  • Weather-aware CSV  — if the activity log already contains the weather
    columns (pre-baked, as in activity_log_weather.csv), the enricher is
    bypassed and the columns are used directly. This means no API key is
    needed to run the demo. In production, the enricher fetches live data.

  • 3 new devices  — Bedroom_LED_2, LivingRoom_Fan_1, Garden_Irrigation_1.

  • Lower MIN_SAMPLES threshold  — reduced from 10 → 6 because weather
    features carry causal signal; the model generalises faster.

ARCHITECTURE OVERVIEW
---------------------
Core ML: Per-(Device_ID, Parameter) RandomForest ensemble
  • Numeric targets  → RandomForestRegressor   (eval: MAE)
  • Categorical/binary → RandomForestClassifier (eval: Accuracy)

WHY WEATHER FEATURES MATTER
  Time-only models learn "AC is set at 14:00 on weekends" — a correlation.
  Weather-aware models learn "AC is set to 20°C when outdoor temp > 35°C
  and humidity > 85%" — the actual causal reason. Causal features generalise
  from far fewer examples, reducing the cold-start period from ~3 weeks to
  ~1 week for climate and lighting devices.

KEY FEATURE GROUPS
  Temporal   : Hour_of_Day, Minute_of_Hour, Day_of_Week, Is_Weekend, Month
  Sequential : Time_Since_Last_Event_min, Prev_Value_Enc
  Weather    : Outdoor_Temp_C, Feels_Like_Temp_C, Humidity_Pct,
               Wind_Speed_kmh, Cloud_Cover_Pct, UV_Index, Is_Raining
  Solar      : Minutes_Since_Sunset, Minutes_To_Sunrise, Is_Daylight

PIPELINE STAGES
  SmartHomeSchemaValidator   ← validates predictions against device schema
  WeatherFeatureEnricher     ← adds weather + solar columns (optional at demo)
  SmartHomePreprocessor      ← feature engineering + Human-only filter
  SmartHomeModelBank         ← trains/saves one model per (device, parameter)
  SmartHomePredictionEngine  ← inference + schema gate before MQTT publish
  SmartHomeIncrementalLearner← accumulates data, retrains, tracks accuracy

INSTALL
  pip install scikit-learn pandas numpy joblib requests astral timezonefinder pytz
=============================================================================
"""

import os, re, json, warnings, hashlib, threading, time
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np
import pandas as pd
import joblib

from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, accuracy_score

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# OPTIONAL DEPENDENCIES  (weather + solar features)
# Install:  pip install astral timezonefinder pytz requests
# The pipeline degrades gracefully if these are absent — weather columns
# fall back to neutral defaults and solar features default to 0.
# ---------------------------------------------------------------------------
try:
    import pytz
    from timezonefinder import TimezoneFinder
    from astral import LocationInfo
    from astral.sun import sun as astral_sun
    _ASTRAL_AVAILABLE = True
except ImportError:
    _ASTRAL_AVAILABLE = False
    pytz = None                 # type: ignore[assignment]
    TimezoneFinder = None       # type: ignore[assignment,misc]
    LocationInfo = None         # type: ignore[assignment]
    astral_sun = None           # type: ignore[assignment]

# ---------------------------------------------------------------------------
# PATHS
# ---------------------------------------------------------------------------
BASE_DIR      = Path("smarthome_data")
MODELS_DIR    = BASE_DIR / "models"
LOG_STORE     = BASE_DIR / "activity_log_store.csv"
METRICS_STORE = BASE_DIR / "model_metrics.csv"
ENCODER_STORE = BASE_DIR / "encoders.joblib"

BASE_DIR.mkdir(exist_ok=True)
MODELS_DIR.mkdir(exist_ok=True)

# ---------------------------------------------------------------------------
# FEATURE COLUMNS  (temporal + sequential + weather + solar)
# ---------------------------------------------------------------------------
TEMPORAL_COLS = [
    "Hour_of_Day",
    "Minute_of_Hour",
    "Day_of_Week",
    "Is_Weekend",
    "Month",
]
SEQUENTIAL_COLS = [
    "Time_Since_Last_Event_min",
    "Prev_Value_Enc",
]
WEATHER_COLS = [
    "Outdoor_Temp_C",
    "Feels_Like_Temp_C",
    "Humidity_Pct",
    "Wind_Speed_kmh",
    "Cloud_Cover_Pct",
    "UV_Index",
    "Is_Raining",
]
SOLAR_COLS = [
    "Minutes_Since_Sunset",
    "Minutes_To_Sunrise",
    "Is_Daylight",
]
FEATURE_COLS = TEMPORAL_COLS + SEQUENTIAL_COLS + WEATHER_COLS + SOLAR_COLS


# =============================================================================
# SECTION 1 — SCHEMA VALIDATOR
# =============================================================================

class SmartHomeSchemaValidator:
    """
    Parses Smart_Home_IoT_Parameters CSV into typed parameter constraints.
    validate() is the hard gate between every model prediction and hardware.

    schema[device_type][parameter_name] = {
        raw_type, kind, min, max, choices
    }
    """

    def __init__(self, schema_csv_path: str):
        self.schema: dict = {}
        self._load(schema_csv_path)

    @staticmethod
    def _parse_type_string(raw: str) -> dict:
        result = {"raw_type": raw, "kind": "other",
                  "min": None, "max": None, "choices": None}
        if not isinstance(raw, str) or not raw.strip():
            return result
        rl = raw.lower()
        if any(k in rl for k in ("numeric","integer","percentage","ampere",
                                  "minutes","degrees","seconds","°")):
            result["kind"] = "numeric"
            nums = re.findall(r"[-+]?\d+\.?\d*", raw)
            if len(nums) >= 2:
                result["min"] = float(nums[0])
                result["max"] = float(nums[-1])
            return result
        if any(k in rl for k in ("categorical","command","string","hue","coordinates")):
            result["kind"] = "categorical"
            m = re.search(r"\(([^)]+)\)", raw)
            if m:
                result["choices"] = [c.strip() for c in m.group(1).split(",")]
            return result
        if "binary" in rl:
            result["kind"] = "binary"
            m = re.search(r"\(([^)]+)\)", raw)
            if m:
                result["choices"] = [c.strip() for c in re.split(r"[/,]", m.group(1))]
            return result
        if "duration" in rl:
            result["kind"] = "numeric"
            result["min"]  = 0.0
        return result

    def _load(self, path: str):
        df = pd.read_csv(path)
        for _, row in df.iterrows():
            dt = str(row.get("Device Type","")).strip()
            if not dt:
                continue
            self.schema.setdefault(dt, {})
            for i in range(1, 6):
                pn = row.get(f"Parameter {i} Name")
                pt = row.get(f"Parameter {i} Type")
                if not isinstance(pn, str) or not pn.strip():
                    continue
                self.schema[dt][pn.strip()] = self._parse_type_string(
                    str(pt).strip() if isinstance(pt, str) else "")
        print(f"[Schema] Loaded {len(self.schema)} device types, "
              f"{sum(len(v) for v in self.schema.values())} parameters.")

    def get_param_info(self, device_type: str, parameter: str) -> dict | None:
        return self.schema.get(device_type, {}).get(parameter)

    # FIX: In-memory schema patch for devices whose CSV entry hasn't been
    # updated yet to match the normalised training labels.
    # ACTION REQUIRED: Update Smart_Home_IoT_Parameters CSV to replace
    # "On/Off" with "Watering/Idle" for Smart Irrigation Controller /
    # Zone 1 State, then remove this patch.
    _SCHEMA_PATCH: dict[tuple[str, str], list[str]] = {
        ("Smart Irrigation Controller", "Zone 1 State"): ["Watering", "Idle"],
    }

    def validate(self, device_type: str, parameter: str,
                 value: Any) -> tuple[bool, str, Any]:
        """Returns (is_valid, message, safe_value)."""
        info = self.get_param_info(device_type, parameter)
        if info is None:
            self._log_rejection(device_type, parameter, value,
                                f"Unknown: {device_type}/{parameter}")
            return False, f"Unknown: {device_type}/{parameter}", None

        # Apply in-memory patch for known CSV mismatches (see _SCHEMA_PATCH above)
        patch_choices = self._SCHEMA_PATCH.get((device_type, parameter))
        if patch_choices is not None:
            matched = next((c for c in patch_choices
                            if c.lower() == str(value).lower()), None)
            if matched is None:
                self._log_rejection(device_type, parameter, value,
                                    f"'{value}' not in patch {patch_choices}")
                return False, f"'{value}' not in {patch_choices}", None
            return True, "OK (schema patch)", matched

        kind = info["kind"]
        if kind == "numeric":
            try:
                v = float(value)
            except (ValueError, TypeError):
                self._log_rejection(device_type, parameter, value,
                                    f"Expected numeric, got '{value}'")
                return False, f"Expected numeric, got '{value}'", None
            lo, hi = info["min"], info["max"]
            if lo is not None and v < lo:
                # Clamping is still valid — no rejection record needed
                return False, f"{v} below min ({lo}); clamped.", lo
            if hi is not None and v > hi:
                return False, f"{v} above max ({hi}); clamped.", hi
            return True, "OK", round(v, 2)
        if kind in ("categorical", "binary"):
            choices = info.get("choices") or []
            matched = next((c for c in choices
                            if c.lower() == str(value).lower()), None)
            if choices and matched is None:
                self._log_rejection(device_type, parameter, value,
                                    f"'{value}' not in {choices}")
                return False, f"'{value}' not in {choices}", None
            return True, "OK", matched or value
        return True, "kind=other; pass-through.", value

    @staticmethod
    def _log_rejection(device_type: str, parameter: str,
                       value: Any, reason: str) -> None:
        """P2 FIX: Append a schema-rejection record to model_metrics.csv."""
        record = pd.DataFrame([{
            "timestamp":   datetime.now().isoformat(),
            "key":         f"{device_type}__{parameter}",
            "device_id":   device_type,
            "parameter":   parameter,
            "n_samples":   0,
            "metric_name": "REJECTION",
            "metric":      float("nan"),
            "model_type":  "schema",
            "status":      "REJECTED",
            "reason":      reason,
            "predicted":   str(value),
        }])
        if METRICS_STORE.exists():
            old = pd.read_csv(METRICS_STORE)
            pd.concat([old, record], ignore_index=True).to_csv(METRICS_STORE, index=False)
        else:
            record.to_csv(METRICS_STORE, index=False)


# =============================================================================
# SECTION 2 — WEATHER + SOLAR ENRICHER
# =============================================================================

class WeatherFeatureEnricher:
    """
    Adds outdoor weather context and solar position features to every event row.

    TWO MODES:
    ──────────
    DEMO / CSV MODE   — the activity log CSV already contains weather columns
                        (like activity_log_weather.csv). Pass use_csv_weather=True
                        and no API key is needed. The enricher just validates
                        that the columns are present.

    LIVE / API MODE   — fetches real conditions from OpenWeatherMap.
                        Used at inference time (predict_for_context) and for
                        enriching new raw event batches that don't have weather
                        columns yet. Requires a free OWM API key.

    HISTORICAL MODE   — enriches a raw training CSV by calling the OWM
                        historical timemachine endpoint (~1 API call per day).

    GPS + TIMEZONE
    ──────────────
    Sunrise/sunset is computed locally from GPS coordinates using the
    `astral` library — no API call needed. `Minutes_Since_Sunset` replaces
    `Hour_of_Day` as the dominant feature for lighting and blind models,
    because people turn lights on when it gets dark, not at a fixed clock time.
    Sunset shifts by 90+ minutes across the year in most locations.
    """

    def __init__(self,
                 latitude: float,
                 longitude: float,
                 api_key: str | None = None,
                 use_csv_weather: bool = True):
        """
        Args:
            latitude:         Home GPS latitude  (e.g. 19.0760 for Mumbai)
            longitude:        Home GPS longitude (e.g. 72.8777 for Mumbai)
            api_key:          OpenWeatherMap API key. Not needed if
                              use_csv_weather=True and CSV already has columns.
            use_csv_weather:  If True, assumes the CSV already has weather
                              columns and skips API calls entirely.
        """
        self.lat              = latitude
        self.lon              = longitude
        self.api_key          = api_key
        self.use_csv_weather  = use_csv_weather
        self._cache: dict     = {}

        # Typed Optional attributes so Pylance resolves .observer, .classes_ etc.
        self.tz:       Optional[Any] = None
        self.location: Optional[Any] = None
        self._astral_ok: bool        = False

        # Resolve timezone + solar location from GPS using top-level imports
        if _ASTRAL_AVAILABLE:
            try:
                tf      = TimezoneFinder()
                tz_name = tf.timezone_at(lat=latitude, lng=longitude) or "UTC"
                self.tz       = pytz.timezone(tz_name)
                self.location = LocationInfo(
                    name="home", region="", timezone=tz_name,
                    latitude=latitude, longitude=longitude
                )
                self._astral_ok = True
            except Exception:
                pass

        mode = "CSV weather columns" if use_csv_weather else "Live API"
        print(f"[Weather] Enricher ready — GPS ({latitude}, {longitude})  "
              f"mode: {mode}")

    # ---------------------------------------------------------------- #
    # Public API                                                        #
    # ---------------------------------------------------------------- #

    def validate_csv_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Called when use_csv_weather=True.
        Checks that all weather/solar columns are present, then adds any
        missing solar columns by computing them from the Timestamp column.
        """
        df = df.copy()
        missing_weather = [c for c in WEATHER_COLS if c not in df.columns]
        missing_solar   = [c for c in SOLAR_COLS   if c not in df.columns]

        if missing_weather:
            print(f"[Weather] Warning: CSV missing weather columns "
                  f"{missing_weather}. Filling with defaults.")
            defaults = {"Outdoor_Temp_C":25.0,"Feels_Like_Temp_C":25.0,
                        "Humidity_Pct":60.0,"Wind_Speed_kmh":10.0,
                        "Cloud_Cover_Pct":50.0,"UV_Index":3.0,"Is_Raining":0}
            for c in missing_weather:
                df[c] = defaults.get(c, 0.0)

        if missing_solar and self._astral_ok:
            print(f"[Weather] Computing missing solar columns from timestamps.")
            df = self._add_solar_features(df)
        elif missing_solar:
            for c in missing_solar:
                df[c] = 0.0

        return df

    def enrich_dataframe(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        BATCH enrichment for a training DataFrame without pre-baked weather.
        Fetches historical weather per unique (date, hour) pair and joins.
        Requires api_key.
        """
        if self.use_csv_weather:
            return self.validate_csv_columns(df)

        if not self.api_key:
            print("[Weather] No API key provided — using default weather values.")
            return self._fill_defaults(df)

        df = df.copy()
        df["Timestamp"] = pd.to_datetime(df["Timestamp"])
        pairs = df["Timestamp"].apply(
            lambda ts: (ts.date().isoformat(), ts.hour)).unique()

        print(f"[Weather] Fetching weather for {len(pairs)} hour-slots...")
        for date_str, hour in pairs:
            key = (date_str, hour)
            if key not in self._cache:
                self._cache[key] = self._fetch_historical(date_str, hour)

        for col in WEATHER_COLS:
            df[col] = df["Timestamp"].apply(
                lambda ts: self._cache.get(
                    (ts.date().isoformat(), ts.hour), {}
                ).get(col, np.nan))

        df = self._add_solar_features(df)

        for col in WEATHER_COLS + SOLAR_COLS:
            if col in df.columns and df[col].isna().any():
                df[col].fillna(df[col].median(), inplace=True)

        return df

    # ---------------------------------------------------------------- #
    # FIX 1: Hourly weather cache                                      #
    # ---------------------------------------------------------------- #
    # _hour_cache: dict keyed by hour-of-day (0–23) → weather dict.
    # Populated by prefetch_day() before a simulation run, or lazily
    # on first access inside enrich_row_live().  Solar features are
    # always computed locally from GPS — no API call involved.
    # ---------------------------------------------------------------- #

    def prefetch_day(self, target_date: Optional[datetime] = None) -> None:
        """
        FIX 1: Pre-fetch weather for all 24 hours of target_date in a
        single batch and store results in self._hour_cache keyed by
        hour-of-day (0–23).

        Call this ONCE before starting a full-day simulation loop.
        After this call, enrich_row_live() serves every tick from cache
        with zero network latency.

        Args:
            target_date: The date to pre-fetch for.  Defaults to today.
        """
        if target_date is None:
            target_date = datetime.now()

        date_str = target_date.strftime("%Y-%m-%d")
        print(f"[Weather] Pre-fetching 24-hour weather for {date_str} …")

        if self.api_key:
            for hour in range(24):
                key = (date_str, hour)
                if key not in self._cache:
                    self._cache[key] = self._fetch_historical(date_str, hour)
        else:
            # No API key — fill all 24 hours with defaults.
            for hour in range(24):
                self._cache[(date_str, hour)] = self._default_weather()

        # Build a flat hour→weather map for O(1) lookup at sim-time.
        self._hour_cache: dict[int, dict] = {}
        for hour in range(24):
            self._hour_cache[hour] = self._cache.get(
                (date_str, hour), self._default_weather())

        print(f"[Weather] Pre-fetch complete — {len(self._hour_cache)} "
              f"hour-slots cached.  enrich_row_live() is now network-free.")

    def enrich_row_live(self, timestamp: datetime) -> dict:
        """
        FIX 1: LIVE enrichment for a single inference row.

        Serves from self._hour_cache (keyed by hour-of-day) if the cache
        was populated by prefetch_day().  Falls back to a live OWM fetch
        only when the cache is empty (first call in production without a
        prior prefetch_day()).  Solar features are always computed locally.

        This means a full-day simulation loop pays the API cost exactly
        once (during prefetch_day), not once per prediction tick.
        """
        hour = timestamp.hour

        # Serve from pre-populated cache if available (FIX 1 fast path)
        if hasattr(self, "_hour_cache") and hour in self._hour_cache:
            weather = self._hour_cache[hour]
        elif self.api_key:
            # Lazy fetch + cache for production use without prefetch_day()
            date_str = timestamp.strftime("%Y-%m-%d")
            cache_key = (date_str, hour)
            if cache_key not in self._cache:
                self._cache[cache_key] = self._fetch_live()
            weather = self._cache[cache_key]
        else:
            weather = self._default_weather()

        solar = (self._solar_features_for(timestamp) if self._astral_ok
                 else {"Minutes_Since_Sunset": 0.0,
                       "Minutes_To_Sunrise":   0.0,
                       "Is_Daylight":          1})
        return {**weather, **solar}

    # ---------------------------------------------------------------- #
    # Private: API fetch                                                #
    # ---------------------------------------------------------------- #

    def _fetch_live(self) -> dict:
        import requests
        url = (f"https://api.openweathermap.org/data/2.5/weather"
               f"?lat={self.lat}&lon={self.lon}"
               f"&appid={self.api_key}&units=metric")
        try:
            r = requests.get(url, timeout=5)
            r.raise_for_status()
            return self._parse_owm_current(r.json())
        except Exception as e:
            print(f"[Weather] Live fetch failed: {e} — using defaults.")
            return self._default_weather()

    def _fetch_historical(self, date_str: str, hour: int) -> dict:
        import requests, pytz
        local_dt = datetime.strptime(date_str, "%Y-%m-%d").replace(hour=hour)
        local_dt = self.tz.localize(local_dt) if self.tz else local_dt
        unix_ts  = int(local_dt.timestamp())
        url = (f"https://api.openweathermap.org/data/3.0/onecall/timemachine"
               f"?lat={self.lat}&lon={self.lon}&dt={unix_ts}"
               f"&appid={self.api_key}&units=metric")
        try:
            r = requests.get(url, timeout=8)
            r.raise_for_status()
            hourly = r.json().get("data", [{}])[0]
            return self._parse_owm_historical(hourly)
        except Exception as e:
            print(f"[Weather] Historical fetch failed ({date_str} {hour:02d}:00): {e}")
            return self._default_weather()

    @staticmethod
    def _parse_owm_current(data: dict) -> dict:
        rain = data.get("rain", {})
        return {
            "Outdoor_Temp_C":    data["main"]["temp"],
            "Feels_Like_Temp_C": data["main"]["feels_like"],
            "Humidity_Pct":      data["main"]["humidity"],
            "Wind_Speed_kmh":    data["wind"]["speed"] * 3.6,
            "Cloud_Cover_Pct":   data["clouds"]["all"],
            "UV_Index":          data.get("uvi", 0.0),
            "Is_Raining":        int(bool(rain) or
                                     data.get("weather",[{}])[0]
                                     .get("main","") == "Rain"),
        }

    @staticmethod
    def _parse_owm_historical(hourly: dict) -> dict:
        return {
            "Outdoor_Temp_C":    hourly.get("temp", 25.0),
            "Feels_Like_Temp_C": hourly.get("feels_like", 25.0),
            "Humidity_Pct":      hourly.get("humidity", 60.0),
            "Wind_Speed_kmh":    hourly.get("wind_speed", 0.0) * 3.6,
            "Cloud_Cover_Pct":   hourly.get("clouds", 0.0),
            "UV_Index":          hourly.get("uvi", 0.0),
            "Is_Raining":        int(hourly.get("weather",[{}])[0]
                                     .get("main","") in
                                     ("Rain","Drizzle","Thunderstorm")),
        }

    @staticmethod
    def _default_weather() -> dict:
        return {"Outdoor_Temp_C":25.0,"Feels_Like_Temp_C":25.0,
                "Humidity_Pct":60.0,"Wind_Speed_kmh":10.0,
                "Cloud_Cover_Pct":50.0,"UV_Index":3.0,"Is_Raining":0}

    @staticmethod
    def _fill_defaults(df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        defaults = {"Outdoor_Temp_C":25.0,"Feels_Like_Temp_C":25.0,
                    "Humidity_Pct":60.0,"Wind_Speed_kmh":10.0,
                    "Cloud_Cover_Pct":50.0,"UV_Index":3.0,"Is_Raining":0,
                    "Minutes_Since_Sunset":0.0,"Minutes_To_Sunrise":360.0,
                    "Is_Daylight":1}
        for c, v in defaults.items():
            if c not in df.columns:
                df[c] = v
        return df

    # ---------------------------------------------------------------- #
    # Private: solar features (local computation, no API)              #
    # ---------------------------------------------------------------- #

    def _add_solar_features(self, df: pd.DataFrame) -> pd.DataFrame:
        solar_rows = df["Timestamp"].apply(self._solar_features_for)
        solar_df   = pd.DataFrame(list(solar_rows), index=df.index)
        for col in solar_df.columns:
            df[col] = solar_df[col]
        return df

    def _solar_features_for(self, ts) -> dict:
        # Uses top-level astral_sun import — no inline import, Pylance-clean.
        # Guard: if astral is unavailable or location unset, return safe defaults.
        _default = {"Minutes_Since_Sunset": 0.0,
                    "Minutes_To_Sunrise":   0.0,
                    "Is_Daylight":          1}
        if not _ASTRAL_AVAILABLE or astral_sun is None or self.location is None:
            return _default
        try:
            ts = pd.Timestamp(ts)
            if ts.tzinfo is None and self.tz is not None:
                ts = self.tz.localize(ts.to_pydatetime())
            # self.location is confirmed non-None by the guard above
            observer = self.location.observer          # no Optional warning
            s   = astral_sun(observer, date=ts.date(), tzinfo=self.tz)
            mss = (ts - s["sunset"]).total_seconds()  / 60
            mtr = (s["sunrise"] - ts).total_seconds() / 60
            mss = max(-720.0, min(720.0, float(mss)))
            mtr = max(-720.0, min(720.0, float(mtr)))
            return {"Minutes_Since_Sunset": round(mss, 1),
                    "Minutes_To_Sunrise":   round(mtr, 1),
                    "Is_Daylight":          int(s["sunrise"] <= ts <= s["sunset"])}
        except Exception:
            return _default


# =============================================================================
# SECTION 3 — PREPROCESSOR
# =============================================================================

class SmartHomePreprocessor:
    """
    Converts raw activity-log rows into ML-ready feature matrices.

    FEATURE ENGINEERING
    ───────────────────
    Temporal    : Hour_of_Day, Minute_of_Hour, Day_of_Week, Is_Weekend, Month
    Sequential  : Time_Since_Last_Event_min — minutes since previous event on
                  same (Device_ID, Parameter) pair; captures routine cadence.
                  Prev_Value_Enc — label-encoded value from the prior event;
                  captures state transitions (Fan→Cool, On→Off patterns).
    Weather     : Outdoor_Temp_C, Feels_Like_Temp_C, Humidity_Pct,
                  Wind_Speed_kmh, Cloud_Cover_Pct, UV_Index, Is_Raining
    Solar       : Minutes_Since_Sunset, Minutes_To_Sunrise, Is_Daylight

    CRITICAL: fit_transform() filters to Human-only rows FIRST.
    Automation-sourced rows are never seen by the model.
    """

    def __init__(self):
        self.label_encoders: dict[str, LabelEncoder] = {}

    def fit_transform(self, df: pd.DataFrame,
                      enricher: WeatherFeatureEnricher | None = None) -> pd.DataFrame:
        """Full preprocessing pipeline for training data."""
        df = self._filter_human(df)
        df = self._parse_ts(df)
        if enricher is not None:
            df = enricher.enrich_dataframe(df)
        df = self._ensure_weather_cols(df)
        df = self._time_features(df)
        df = self._lag_features(df)
        df = self._encode_target(df, fit=True)
        return df

    def transform(self, df: pd.DataFrame,
                  enricher: WeatherFeatureEnricher | None = None) -> pd.DataFrame:
        """Inference-time preprocessing — does not refit encoders."""
        df = self._parse_ts(df)
        if enricher is not None:
            df = enricher.enrich_dataframe(df)
        df = self._ensure_weather_cols(df)
        df = self._time_features(df)
        df = self._lag_features(df)
        return df

    # ---------------------------------------------------------------- #
    @staticmethod
    def _filter_human(df: pd.DataFrame) -> pd.DataFrame:
        """
        CRITICAL — only learn from human-initiated actions.
        Removes Automation rows to prevent the model from learning its
        own past predictions and drifting into a feedback loop.
        """
        before = len(df)
        df = df[df["Trigger_Source"].str.strip().str.lower() == "human"].copy()
        print(f"[Preprocess] Human filter: {before} → {len(df)} rows "
              f"({before - len(df)} automation rows removed).")
        return df

    @staticmethod
    def _parse_ts(df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df["Timestamp"] = pd.to_datetime(df["Timestamp"], format="mixed")
        return df.sort_values("Timestamp").reset_index(drop=True)

    @staticmethod
    def _ensure_weather_cols(df: pd.DataFrame) -> pd.DataFrame:
        """Fills in any missing weather/solar columns with neutral defaults."""
        defaults = {
            "Outdoor_Temp_C":    25.0, "Feels_Like_Temp_C": 25.0,
            "Humidity_Pct":      60.0, "Wind_Speed_kmh":     10.0,
            "Cloud_Cover_Pct":   50.0, "UV_Index":            3.0,
            "Is_Raining":         0,
            "Minutes_Since_Sunset": 0.0,
            "Minutes_To_Sunrise":   360.0,
            "Is_Daylight":          1,
        }
        for col, val in defaults.items():
            if col not in df.columns:
                df[col] = val
        return df

    @staticmethod
    def _time_features(df: pd.DataFrame) -> pd.DataFrame:
        ts = df["Timestamp"]
        df["Hour_of_Day"]    = ts.dt.hour
        df["Minute_of_Hour"] = ts.dt.minute
        df["Day_of_Week"]    = ts.dt.dayofweek   # 0=Mon, 6=Sun
        df["Is_Weekend"]     = (ts.dt.dayofweek >= 5).astype(int)
        df["Month"]          = ts.dt.month
        return df

    @staticmethod
    def _lag_features(df: pd.DataFrame) -> pd.DataFrame:
        """
        Adds two lag features per (Device_ID, Parameter_Changed) group:
          Time_Since_Last_Event_min — minutes since the previous event;
                                      captures routine spacing and cadence.
          Prev_Value                — what the device was last set to;
                                      captures sequential state transitions.
        """
        df = df.copy().sort_values(
            ["Device_ID","Parameter_Changed","Timestamp"])
        key = ["Device_ID","Parameter_Changed"]
        df["_prev_ts"] = df.groupby(key)["Timestamp"].shift(1)
        df["Time_Since_Last_Event_min"] = (
            (df["Timestamp"] - df["_prev_ts"]).dt.total_seconds() / 60
        ).fillna(1440).clip(upper=1440)
        df["Prev_Value"] = (
            df.groupby(key)["New_Value"].shift(1).fillna("__none__"))
        return df.drop(columns=["_prev_ts"]).sort_values("Timestamp").reset_index(drop=True)

    def _encode_target(self, df: pd.DataFrame, fit: bool) -> pd.DataFrame:
        """
        For numeric targets (temperature, brightness, %) — keep as float.
        For categorical targets (On/Off, Cool/Fan, etc.) — LabelEncode.
        Stores encoders on self.label_encoders for reuse at inference time.

        NOTE: we use itertuples over the group-index dict to avoid the Pylance
        "Hashable is not iterable" false-positive that arises when destructuring
        multi-key groupby().groups.items() into a tuple inside a for-loop.
        """
        # P0 FIX (scoped): Normalise irrigation activity-log labels to match schema.
        # Keyed by (Device_ID, Parameter_Changed) so the map ONLY applies to the
        # irrigation device — prevents On/Off->Watering/Idle bleeding into
        # TV_Plug / Switch State and LivingRoom_LED / Power State classifiers.
        LABEL_NORMALISE: dict = {
            ('Garden_Irrigation_1', 'Zone 1 State'): {
                'On': 'Watering', 'Off': 'Idle',
                'on': 'Watering', 'off': 'Idle',
            },
        }

        df = df.copy()
        df["New_Value_Encoded"] = np.nan
        df["Is_Numeric_Target"] = False

        grouped = df.groupby(["Device_ID", "Parameter_Changed"])
        for name, group_df in grouped:
            dev, param = str(name[0]), str(name[1])   # explicit str cast — no Hashable warning
            idx = group_df.index

            # Apply normalisation only for the specific (device, param) pairs that need it
            norm_map = LABEL_NORMALISE.get((dev, param))
            if norm_map:
                df.loc[idx, "New_Value"] = df.loc[idx, "New_Value"].replace(norm_map)

            grp = df.loc[idx, "New_Value"]
            try:
                encoded = grp.astype(float).values
                df.loc[idx, "New_Value_Encoded"] = encoded          # type: ignore[call-overload]
                df.loc[idx, "Is_Numeric_Target"]  = True            # type: ignore[call-overload]
            except (ValueError, TypeError):
                enc_key = f"{dev}__{param}"
                if fit:
                    le = LabelEncoder()
                    fitted: np.ndarray = le.fit_transform(grp)
                    df.loc[idx, "New_Value_Encoded"] = fitted        # type: ignore[call-overload]
                    self.label_encoders[enc_key] = le
                else:
                    le_existing: Optional[LabelEncoder] = self.label_encoders.get(enc_key)
                    if le_existing is not None:
                        known = le_existing.classes_
                        # P2 FIX: Log warning when prev_le falls back to classes_[0]
                        def _safe_transform(v, k=known, d=dev, p=param):
                            if v not in k:
                                print(f"[Encode] WARNING: unseen label '{v}' for "
                                      f"{d}/{p} — falling back to '{k[0]}'")
                                return k[0]
                            return v
                        safe  = grp.apply(_safe_transform)
                        transformed: np.ndarray = le_existing.transform(safe)
                        df.loc[idx, "New_Value_Encoded"] = transformed  # type: ignore[call-overload]
        return df

    def save(self, path: Path = ENCODER_STORE):
        joblib.dump(self.label_encoders, path)

    def load(self, path: Path = ENCODER_STORE):
        if path.exists():
            self.label_encoders = joblib.load(path)


# =============================================================================
# SECTION 4 — MODEL BANK
# =============================================================================

class SmartHomeModelBank:
    """
    Trains and persists one RandomForest model per (Device_ID, Parameter) key.

    NUMERIC TARGETS  → RandomForestRegressor  (temperature, brightness, %)
    CATEGORICAL      → RandomForestClassifier (On/Off, Cool/Fan/Auto, etc.)

    MIN_SAMPLES = 6  (reduced from 10 because weather features carry causal
    signal — the model can generalise from fewer examples when it knows WHY
    the user acted, not just WHEN.)

    All models retrain from scratch on the full accumulated log each run.
    This is correct for Random Forests: adding new data changes bootstrap
    sample distributions, so the forest must be rebuilt to incorporate it.
    """

    MIN_SAMPLES              = 6
    MIN_CLASSIFIER_DIVERSITY = 2   # require at least 2 distinct class values

    def __init__(self):
        self.models: dict[str, dict] = {}

    def train(self, df: pd.DataFrame,
              preprocessor: SmartHomePreprocessor,
              metrics_log: list | None = None):
        grouped = df.groupby(["Device_ID", "Parameter_Changed"])
        print(f"\n[ModelBank] Training {len(grouped)} model(s)...\n")

        for name, group_raw in grouped:
            dev, param = str(name[0]), str(name[1])   # explicit str cast — no Hashable warning
            grp = group_raw.dropna(subset=["New_Value_Encoded"])
            if len(grp) < self.MIN_SAMPLES:
                print(f"  [SKIP] {dev}/{param} — only {len(grp)} samples "
                      f"(need ≥{self.MIN_SAMPLES}).")
                continue

            # P2 FIX: Skip classifier if too few distinct class values
            is_cat = not bool(grp["Is_Numeric_Target"].iloc[0])
            if is_cat and grp["New_Value_Encoded"].nunique() < self.MIN_CLASSIFIER_DIVERSITY:
                print(f"  [SKIP] {dev}/{param} — only "
                      f"{grp['New_Value_Encoded'].nunique()} distinct class value(s) "
                      f"(need ≥{self.MIN_CLASSIFIER_DIVERSITY}).")
                continue

            key        = f"{dev}__{param}"
            grp_key    = (dev, param)

            # P0 FIX: Force Color_Temperature to classifier (only 3 discrete values)
            FORCE_CLASSIFIER_PARAMS = {
                ('Bedroom_LED_2',    'Color Temperature'),
                ('LivingRoom_LED_1', 'Color Temperature'),
            }
            is_numeric = grp_key not in FORCE_CLASSIFIER_PARAMS and \
                         bool(grp["Is_Numeric_Target"].iloc[0])

            prev_le  = LabelEncoder()
            grp      = grp.copy()
            pv_enc: np.ndarray = prev_le.fit_transform(grp["Prev_Value"].astype(str))
            grp.loc[:, "Prev_Value_Enc"] = pv_enc    # type: ignore[call-overload]

            # Only use feature columns that are actually present
            feat_cols = [c for c in FEATURE_COLS if c in grp.columns]
            X = grp[feat_cols]
            y = grp["New_Value_Encoded"]

            # P0 FIX: Time-aware split — last 20% of rows = most recent events
            split_idx = int(len(X) * 0.8)
            X_tr, X_te = X.iloc[:split_idx], X.iloc[split_idx:]
            y_tr, y_te = y.iloc[:split_idx], y.iloc[split_idx:]

            # P1 FIX: MIN_CLASSIFIER_ACCURACY drop gate
            MIN_CLASSIFIER_ACCURACY = 0.55

            if is_numeric:
                model = RandomForestRegressor(
                    n_estimators=300, max_depth=12,
                    min_samples_leaf=2, random_state=42, n_jobs=-1)
                # P4 FIX: Apply correction sample weights if present
                sw_col = "sample_weight"
                if sw_col in grp.columns:
                    train_weights = grp[sw_col].iloc[:split_idx].values
                    model.fit(X_tr, y_tr, sample_weight=train_weights)
                else:
                    model.fit(X_tr, y_tr)
                metric      = round(mean_absolute_error(y_te, model.predict(X_te)), 4)
                metric_name = "MAE"
            else:
                counts   = y_tr.value_counts()
                balanced = len(counts) > 1 and (counts.min()/counts.max()) < 0.5
                model = RandomForestClassifier(
                    n_estimators=300, max_depth=12,
                    min_samples_leaf=2,
                    class_weight="balanced" if balanced else None,
                    random_state=42, n_jobs=-1)

                # P1 FIX: Use sample weights from correction-weighting if present
                sw_col = "sample_weight"
                if sw_col in grp.columns:
                    train_weights = grp[sw_col].iloc[:split_idx].values
                    model.fit(X_tr, y_tr, sample_weight=train_weights)
                else:
                    model.fit(X_tr, y_tr)

                metric      = round(accuracy_score(y_te, model.predict(X_te)), 4)
                metric_name = "Accuracy"

                # P1 FIX: Drop model if accuracy is below the floor
                if metric < MIN_CLASSIFIER_ACCURACY:
                    if metrics_log is not None:
                        metrics_log.append({
                            "timestamp":   datetime.now().isoformat(),
                            "key":         key,
                            "device_id":   dev,
                            "parameter":   param,
                            "n_samples":   len(grp),
                            "metric_name": metric_name,
                            "metric":      metric,
                            "model_type":  "clf",
                            "status":      "DROPPED",
                            "reason":      f"accuracy {metric:.3f} < {MIN_CLASSIFIER_ACCURACY}",
                        })
                    print(f"  [DROPPED] {key}: accuracy {metric:.2f} below floor "
                          f"— no MQTT commands will fire")
                    continue  # do not add to self.models

            target_le = preprocessor.label_encoders.get(key)
            self.models[key] = {
                "model":       model,
                "is_numeric":  is_numeric,
                "target_le":   target_le,
                "prev_le":     prev_le,
                "device_id":   dev,
                "param":       param,
                "n_samples":   len(grp),
                "metric":      metric,
                "metric_name": metric_name,
                "feat_cols":   feat_cols,
            }

            print(f"  [OK] {dev} / {param} "
                  f"({'reg' if is_numeric else 'clf'}) "
                  f"n={len(grp)}  {metric_name}={metric}")

            if metrics_log is not None:
                metrics_log.append({
                    "timestamp":   datetime.now().isoformat(),
                    "key":         key,
                    "device_id":   dev,
                    "parameter":   param,
                    "n_samples":   len(grp),
                    "metric_name": metric_name,
                    "metric":      metric,
                    "model_type":  "reg" if is_numeric else "clf",
                    "status":      "OK",
                    "reason":      "",
                })

        print(f"\n[ModelBank] {len(self.models)} model(s) ready.\n")

    def save(self, directory: Path = MODELS_DIR):
        directory.mkdir(exist_ok=True)
        for key, bundle in self.models.items():
            safe = key.replace("/","_").replace(" ","_")
            joblib.dump(bundle, directory / f"{safe}.joblib")
        print(f"[ModelBank] Saved {len(self.models)} model(s) → {directory}/")

    def load(self, directory: Path = MODELS_DIR):
        self.models = {}
        for f in directory.glob("*.joblib"):
            self.models[f.stem] = joblib.load(f)
        print(f"[ModelBank] Loaded {len(self.models)} model(s) ← {directory}/")


# =============================================================================
# SECTION 5 — FEATURE IMPORTANCE REPORTER
# =============================================================================

def print_feature_importances(model_bank: SmartHomeModelBank, top_n: int = 4):
    """
    Prints top-N feature importances per model.
    In a weather-aware model, expect to see:
      • AC/climate  → Outdoor_Temp_C, Feels_Like_Temp_C, Humidity_Pct dominant
      • Lights/plugs → Minutes_Since_Sunset, Is_Daylight dominant
      • Blinds       → UV_Index, Cloud_Cover_Pct, Is_Daylight dominant
      • Irrigation   → Is_Raining dominant
    """
    print("\n" + "─"*72)
    print("  FEATURE IMPORTANCES  (what each model learned to act on)")
    print("─"*72)
    for key, bundle in model_bank.models.items():
        model     = bundle["model"]
        feat_cols = bundle.get("feat_cols", FEATURE_COLS)
        if not hasattr(model, "feature_importances_"):
            continue
        imps = dict(zip(feat_cols, model.feature_importances_))
        top  = sorted(imps.items(), key=lambda x: -x[1])[:top_n]
        top_str = "  |  ".join(f"{f}: {v:.2f}" for f, v in top)
        print(f"  {key:<50}  {top_str}")
    print()


# =============================================================================
# SECTION 5b — DEVICE COMMAND LOGGER  (Phase 5)
# =============================================================================

class DeviceCommandLogger:
    """
    Appends validated (and suppressed) MQTT commands to a JSON file.
    File structure: { device_id: [ command_record, ... ], ... }
    Append-or-create: creates file on first write; appends on subsequent writes.
    Thread safety: single synchronous read-parse-update-write per cycle.
    """

    def __init__(self, log_path: str = 'device_command_log.json'):
        self.log_path = Path(log_path)

    def _load(self) -> dict:
        """Read existing log or return empty dict if file absent."""
        if self.log_path.exists():
            with open(self.log_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {}

    def _save(self, data: dict) -> None:
        """Write updated log back to disk (pretty-printed, 2-space indent)."""
        with open(self.log_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, default=str)

    def log_commands(self, commands: list) -> None:
        """
        Append a batch of command dicts to the log file.
        Each command must have at minimum: device_id, device_type,
        parameter, predicted_value, validated_value, is_valid.
        Suppressed commands (confidence gate) are also logged with
        suppressed: true so suppression patterns are auditable.
        """
        if not commands:
            return

        data = self._load()
        ts   = datetime.utcnow().isoformat(timespec='milliseconds') + 'Z'

        for cmd in commands:
            device_id = cmd.get('device_id', 'unknown')
            record = {
                'timestamp':       ts,
                'device_id':       device_id,
                'device_type':     cmd.get('device_type', ''),
                'parameter':       cmd.get('parameter', ''),
                'predicted_value': cmd.get('predicted_value', cmd.get('predicted')),
                'validated_value': cmd.get('validated_value', cmd.get('safe_value')),
                'is_valid':        cmd.get('is_valid', cmd.get('valid', False)),
                'suppressed':      cmd.get('suppressed', False),
                'confidence':      cmd.get('confidence'),   # None for regressors
                'trigger':         'ML_Pipeline',
            }
            if device_id not in data:
                data[device_id] = []
            data[device_id].append(record)

        self._save(data)
        print(f'[CommandLogger] {len(commands)} command(s) logged → {self.log_path}')


def print_command_log_summary(log_path: str = 'device_command_log.json') -> None:
    """Print a per-device summary of all logged commands."""
    p = Path(log_path)
    if not p.exists():
        print(f"[CommandLog] No log found at {log_path}")
        return
    with open(p, 'r', encoding='utf-8') as f:
        data = json.load(f)
    print("\n" + "─"*68)
    print("  DEVICE COMMAND LOG SUMMARY")
    print("─"*68)
    for device_id, records in data.items():
        total      = len(records)
        valid      = sum(1 for r in records if r['is_valid'] and not r['suppressed'])
        suppressed = sum(1 for r in records if r['suppressed'])
        rejected   = total - valid - suppressed
        print(f"  {device_id}: {total} total | "
              f"{valid} sent | {suppressed} suppressed | {rejected} rejected")
    print()


# =============================================================================
# SECTION 6 — PREDICTION ENGINE
# =============================================================================

class SmartHomePredictionEngine:
    """
    Combines the trained ModelBank + SchemaValidator to produce safe,
    validated automation commands for the frontend to act on.

    Flow per model:
      1. Find matching context row (current device state)
      2. Encode Prev_Value feature
      3. Optionally enrich with live weather
      4. Run model inference
      5. Validate output against schema (range check / allowed values)
      6. Return structured command dict — frontend decides how to deliver it
    """

    def __init__(self, model_bank: SmartHomeModelBank,
                 schema_validator: SmartHomeSchemaValidator,
                 preprocessor: SmartHomePreprocessor,
                 enricher: WeatherFeatureEnricher | None = None,
                 command_logger: 'DeviceCommandLogger | None' = None):
        self.bank           = model_bank
        self.validator      = schema_validator
        self.preproc        = preprocessor
        self.enricher       = enricher
        self.command_logger = command_logger or DeviceCommandLogger()

    def predict_for_context(self, context_df: pd.DataFrame,
                             all_model_keys: list[str] | None = None) -> list[dict]:
        """
        context_df — one row per (Device_ID, Parameter_Changed) with the
        current state of each device parameter (what it was last set to).

        Returns a list of validated command dicts ready for MQTT publish.

        FIX 2: Models run in parallel via ThreadPoolExecutor.
               Each model is fully independent at inference time (no shared
               mutable state), so all 22+ models are dispatched simultaneously
               and wall-clock latency drops from O(n_models) to O(slowest_model).

        FIX 5: all_model_keys — full list of expected model keys.
               Models that were dropped (accuracy gate) or have no context row
               each produce a "no_model" record so the frontend always receives
               a complete manifest per tick (it can render "holding current
               state" rather than going dark).
        """
        # P1 FIX: Confidence gate — suppress commands below this threshold
        CONFIDENCE_THRESHOLD = 0.70

        # Add live weather to context rows if enricher is available
        if self.enricher is not None:
            now = datetime.now()
            live = self.enricher.enrich_row_live(now)
            for col, val in live.items():
                context_df[col] = val

        ctx = self.preproc.transform(context_df, enricher=None)
        commands: list[dict] = []

        # ------------------------------------------------------------------
        # FIX 2: Build per-model inference tasks, dispatch in parallel.
        # Each task is a pure function: takes (key, bundle, row-series) →
        # returns a single command dict.  No shared writes during execution.
        # ------------------------------------------------------------------

        def _run_one(key: str, bundle: dict) -> dict:
            """Inner worker: infer one model, validate, return command dict."""
            dev   = bundle["device_id"]
            param = bundle["param"]
            mask  = ((ctx["Device_ID"] == dev) &
                     (ctx["Parameter_Changed"] == param))
            if not mask.any():
                # FIX 5: no context row — emit no_model record
                return {
                    "device_id":     dev,
                    "device_type":   "",
                    "parameter":     param,
                    "timestamp":     datetime.now().isoformat(),
                    "trigger":       "ML_Pipeline",
                    "suppressed":    False,
                    "confidence":    None,
                    "predicted_value": None,
                    "validated_value": None,
                    "is_valid":      False,
                    "no_model":      True,
                    "reason":        "no_context_row",
                    # Legacy keys
                    "predicted":     None,
                    "safe_value":    None,
                    "valid":         False,
                    "schema_msg":    "no_context_row",
                }

            row         = ctx[mask].iloc[-1]
            device_type = row.get("Device_Type", "")
            prev_le     = bundle["prev_le"]
            pv_str      = str(row.get("New_Value", "__none__"))
            if pv_str not in set(prev_le.classes_):
                pv_str = prev_le.classes_[0]
            pv_enc = prev_le.transform([pv_str])[0]

            feat_cols    = bundle.get("feat_cols", FEATURE_COLS)
            feature_dict = {"Prev_Value_Enc": pv_enc}
            for fc in feat_cols:
                if fc == "Prev_Value_Enc":
                    continue
                feature_dict[fc] = row.get(fc, 0.0)

            X = pd.DataFrame([feature_dict])[feat_cols]

            cmd_base = {
                "device_id":   dev,
                "device_type": device_type,
                "parameter":   param,
                "timestamp":   datetime.now().isoformat(),
                "trigger":     "ML_Pipeline",
                "suppressed":  False,
                "confidence":  None,
                "no_model":    False,
            }

            # P1 FIX: Confidence gate for classifiers
            if not bundle["is_numeric"]:
                proba      = bundle["model"].predict_proba(X)[0]
                confidence = float(proba.max())
                cmd_base["confidence"] = round(confidence, 4)
                if confidence < CONFIDENCE_THRESHOLD:
                    return {
                        **cmd_base,
                        "predicted_value": None,
                        "validated_value": None,
                        "is_valid":        False,
                        "suppressed":      True,
                        "reason":          (f"confidence {confidence:.2f} "
                                            f"< threshold {CONFIDENCE_THRESHOLD}"),
                        "predicted":       None,
                        "safe_value":      None,
                        "valid":           False,
                        "schema_msg":      "suppressed",
                    }
            else:
                confidence = 1.0

            raw = self._infer(bundle, X)
            is_valid, msg, safe_val = self.validator.validate(
                device_type, param, raw)

            return {
                **cmd_base,
                "predicted_value": raw,
                "validated_value": safe_val,
                "is_valid":        is_valid,
                "predicted":       raw,
                "safe_value":      safe_val,
                "valid":           is_valid,
                "schema_msg":      msg,
            }

        # Dispatch all models in parallel (ThreadPoolExecutor is safe here:
        # RandomForest.predict() releases the GIL for the C extension work,
        # so threads genuinely run concurrently for the predict step).
        with ThreadPoolExecutor(max_workers=min(32, len(self.bank.models))) as pool:
            futures = {
                pool.submit(_run_one, key, bundle): key
                for key, bundle in self.bank.models.items()
            }
            for future in as_completed(futures):
                try:
                    commands.append(future.result())
                except Exception as exc:
                    key = futures[future]
                    print(f"[PredictionEngine] Model {key} raised: {exc}")

        # FIX 5: Emit no_model records for known-but-dropped models
        # (models in all_model_keys that never made it into self.bank.models)
        if all_model_keys:
            active_keys = {c["device_id"] + "__" + c["parameter"]
                           for c in commands}
            for mk in all_model_keys:
                if mk not in active_keys and mk not in self.bank.models:
                    parts = mk.split("__", 1)
                    dev_id, param_name = (parts[0], parts[1]) if len(parts) == 2 \
                                         else (mk, "unknown")
                    commands.append({
                        "device_id":     dev_id,
                        "device_type":   "",
                        "parameter":     param_name,
                        "timestamp":     datetime.now().isoformat(),
                        "trigger":       "ML_Pipeline",
                        "suppressed":    False,
                        "confidence":    None,
                        "predicted_value": None,
                        "validated_value": None,
                        "is_valid":      False,
                        "no_model":      True,
                        "reason":        "model_dropped_or_not_trained",
                        "predicted":     None,
                        "safe_value":    None,
                        "valid":         False,
                        "schema_msg":    "model_dropped_or_not_trained",
                    })

        return commands

    @staticmethod
    def _infer(bundle: dict, X: pd.DataFrame) -> Any:
        model     = bundle["model"]
        target_le = bundle["target_le"]
        if bundle["is_numeric"]:
            return float(model.predict(X)[0])
        enc = model.predict(X)[0]
        return target_le.inverse_transform([int(enc)])[0] if target_le else enc

    def publish_commands(self, commands: list[dict],
                         mqtt_broker: str | None = None) -> list[dict]:
        """
        Formats and logs all commands, then returns the full command list
        for the frontend to consume and dispatch to appliances.

        The model's responsibility ends here — it produces validated
        predictions with confidence scores and schema-checked values.
        The frontend reads this output and decides how to act on each device.

        FIX 5: no_model records are included so the frontend always receives
        a complete device manifest per tick — it can render
        "AI holding current state" for unready models rather than going dark.
        """
        print("\n" + "─"*68)
        print("  AUTOMATION COMMANDS")
        print("─"*68)
        published = rejected = suppressed = no_model_count = 0

        for cmd in commands:
            # FIX 5: no_model records — model was dropped or never trained
            if cmd.get("no_model"):
                print(f"\n  –   {cmd['device_id']} / {cmd['parameter']}")
                print(f"      [HOLDING] {cmd.get('reason', 'no model available')}")
                no_model_count += 1
            elif cmd.get("suppressed"):
                print(f"\n  ⚠️   {cmd['device_id']} / {cmd['parameter']}")
                print(f"      [SUPPRESSED] {cmd.get('reason', '')}")
                suppressed += 1
            elif cmd.get("valid"):
                val = cmd.get("safe_value", cmd.get("validated_value"))
                print(f"\n  ✅  {cmd['device_id']} / {cmd['parameter']}")
                print(f"      → value: {val}  confidence: {cmd.get('confidence', 'n/a')}")
                published += 1
            else:
                print(f"\n  ❌  {cmd['device_id']} / {cmd['parameter']}")
                print(f"      Predicted : {cmd.get('predicted', cmd.get('predicted_value'))}")
                print(f"      Reason    : {cmd.get('schema_msg', cmd.get('reason', ''))}")
                rejected += 1

        print(f"\n  Summary: {published} published, {suppressed} suppressed, "
              f"{rejected} rejected, {no_model_count} holding (no model).")
        print("─"*68 + "\n")

        # Persist all commands (valid, invalid, suppressed, no_model) to JSON log
        self.command_logger.log_commands(commands)

        return commands


# =============================================================================
# SECTION 7 — INCREMENTAL LEARNER
# =============================================================================

class SmartHomeIncrementalLearner:
    """
    Manages the full incremental learning lifecycle.

    DAILY PRODUCTION USAGE:
        learner = SmartHomeIncrementalLearner(schema_csv, enricher)
        learner.append_new_data(todays_new_events_df)
        learner.retrain()

    WHAT HAPPENS INSIDE:
      append_new_data()  — deduplicates by content hash and appends new rows
                           to activity_log_store.csv. Running the same batch
                           twice is safe and idempotent.

      retrain()          — reloads the FULL accumulated log, runs preprocessing
                           + weather enrichment + training from scratch, saves
                           models and encoders, appends metrics to history.

      WHY RETRAIN FROM SCRATCH?
        Random Forests don't support partial_fit. Adding new data changes
        bootstrap sample distributions across all trees, so the only correct
        way to incorporate it is to rebuild the forest. This is fast for
        home-scale datasets (<20 000 rows).

      print_accuracy_trends() — shows per-model metric trajectory across all
                                training runs so you can see learning progress.
    """

    def __init__(self, schema_csv: str,
                 enricher: WeatherFeatureEnricher | None = None):
        self.schema_csv   = schema_csv
        self.enricher     = enricher
        self.validator    = SmartHomeSchemaValidator(schema_csv)
        self.preprocessor = SmartHomePreprocessor()
        self.model_bank   = SmartHomeModelBank()

    def append_new_data(self, new_df: pd.DataFrame) -> int:
        """
        Appends new event rows to the persistent log store, deduplicating
        by a content hash (Timestamp + Device_ID + Parameter + Value).
        Returns the number of genuinely new rows added.
        """
        def _hash(row):
            s = "|".join(str(row[c]) for c in
                         ["Timestamp","Device_ID","Parameter_Changed","New_Value"])
            return hashlib.md5(s.encode()).hexdigest()

        new_df = new_df.copy()
        new_df["_hash"] = new_df.apply(_hash, axis=1)

        if LOG_STORE.exists():
            existing = pd.read_csv(LOG_STORE)
            existing["_hash"] = existing.apply(_hash, axis=1)
            fresh    = new_df[~new_df["_hash"].isin(set(existing["_hash"]))]
            combined = pd.concat([existing, fresh], ignore_index=True)
        else:
            fresh    = new_df
            combined = new_df

        combined.drop(columns=["_hash"]).to_csv(LOG_STORE, index=False)
        print(f"[Incremental] Appended {len(fresh)} new row(s). "
              f"Log total: {len(combined)} row(s).")
        return len(fresh)

    def retrain(self, new_row_count: int = 0) -> SmartHomeModelBank:
        """
        Reloads the full accumulated log and retrains all models from scratch.
        Saves updated models + encoders. Returns the new ModelBank.

        Args:
            new_row_count:  Number of genuinely new rows just appended
                            (returned by append_new_data). Used to enforce
                            the MIN_NEW_ROWS_TO_RETRAIN guard.
        """
        # P2 FIX: Guard — skip retrain if too few new rows
        MIN_NEW_ROWS_TO_RETRAIN = 10
        if new_row_count > 0 and new_row_count < MIN_NEW_ROWS_TO_RETRAIN:
            print(f"[Incremental] Only {new_row_count} new row(s) — "
                  f"skipping retrain (need ≥{MIN_NEW_ROWS_TO_RETRAIN}).")
            return self.model_bank

        if not LOG_STORE.exists():
            raise FileNotFoundError(
                f"No log found at {LOG_STORE}. Call append_new_data() first.")

        full_df = pd.read_csv(LOG_STORE)
        human_n = full_df["Trigger_Source"].value_counts().get("Human", 0)
        print(f"\n[Incremental] Retraining on {len(full_df)} total rows "
              f"({human_n} human).\n")

        # P4 FIX: Override correction weighting
        # When a user reverses an automation within 5 min, weight those rows 3×
        CORRECTION_WINDOW_MIN = 5
        CORRECTION_WEIGHT     = 3
        full_df = full_df.copy()
        full_df["Timestamp"]     = pd.to_datetime(full_df["Timestamp"], format="mixed")
        full_df                  = full_df.sort_values("Timestamp").reset_index(drop=True)
        full_df["sample_weight"] = 1
        auto_rows = full_df[full_df["Trigger_Source"] != "Human"]
        for _, auto_row in auto_rows.iterrows():
            window_end  = auto_row["Timestamp"] + pd.Timedelta(minutes=CORRECTION_WINDOW_MIN)
            corrections = full_df[
                (full_df["Device_ID"]          == auto_row["Device_ID"]) &
                (full_df["Parameter_Changed"]  == auto_row["Parameter_Changed"]) &
                (full_df["Trigger_Source"]     == "Human") &
                (full_df["Timestamp"]          >  auto_row["Timestamp"]) &
                (full_df["Timestamp"]          <= window_end)
            ]
            full_df.loc[corrections.index, "sample_weight"] = CORRECTION_WEIGHT

        self.preprocessor = SmartHomePreprocessor()
        processed = self.preprocessor.fit_transform(full_df, self.enricher)
        self.preprocessor.save()

        # Propagate sample weights into the processed frame
        if "sample_weight" in full_df.columns:
            weight_map = full_df["sample_weight"]
            processed  = processed.copy()
            processed["sample_weight"] = weight_map.reindex(processed.index).fillna(1).values

        metrics_log: list[dict] = []
        self.model_bank = SmartHomeModelBank()
        self.model_bank.train(processed, self.preprocessor, metrics_log)
        self.model_bank.save()

        if metrics_log:
            new_m = pd.DataFrame(metrics_log)
            if METRICS_STORE.exists():
                old = pd.read_csv(METRICS_STORE)
                pd.concat([old, new_m], ignore_index=True) \
                  .to_csv(METRICS_STORE, index=False)
            else:
                new_m.to_csv(METRICS_STORE, index=False)

        return self.model_bank

    def print_accuracy_trends(self):
        if not METRICS_STORE.exists():
            print("[Trends] No metrics history yet.")
            return

        df  = pd.read_csv(METRICS_STORE)
        df["run"] = pd.to_datetime(df["timestamp"])

        print("\n" + "─"*68)
        print("  ACCURACY TRENDS ACROSS TRAINING RUNS")
        print("─"*68)

        for key in df["key"].unique():
            sub  = df[df["key"] == key].sort_values("run")
            mn   = sub["metric_name"].iloc[0]
            vals = sub["metric"].tolist()
            ns   = sub["n_samples"].tolist()
            if len(vals) > 1:
                trend = " → ".join(f"{v:.4f}" for v in vals)
                delta = vals[-1] - vals[0]
                # For MAE lower is better; for Accuracy higher is better
                arrow = ("▲" if (mn == "Accuracy" and delta > 0) or
                                (mn == "MAE"      and delta < 0)
                         else ("▼" if delta != 0 else "─"))
                trend_str = f"{trend}  {arrow} {abs(delta):.4f}"
            else:
                trend_str = f"{vals[0]:.4f}  (first run)"

            print(f"\n  {key}")
            print(f"    {mn:<12}: {trend_str}")
            print(f"    Samples  : {' → '.join(str(n) for n in ns)}")
        print()


# =============================================================================
# SECTION 8 — CONTEXT BUILDER
# =============================================================================

def build_context_from_log(log_df: pd.DataFrame) -> pd.DataFrame:
    """
    Extracts the most recent HUMAN-initiated state of every
    (Device_ID, Parameter_Changed) pair from the accumulated log.

    P1 FIX: Filters to Trigger_Source == 'Human' before taking .last()
    to avoid circular automation feedback (automation rows would otherwise
    overwrite the human context and cause the model to learn from itself).

    DRIFT FIX: Logs a warning for any (device, param) where no human row
    exists in the accumulated log — those context values fall back to the
    most recent row of any trigger type, which may be an automation output.
    This is the root cause of observed progressive-drift (e.g. blinds closing
    further each round). The warning makes the condition visible in production
    logs; the real fix is to ensure the activity-log CSV contains sufficient
    human-initiated rows for every device before automation runs.
    """
    log_df = log_df.copy()
    log_df["Timestamp"] = pd.to_datetime(log_df["Timestamp"], format="mixed")

    # Preserve weather columns if they exist in the log
    base_cols  = ["Device_ID","Device_Type","Parameter_Changed","New_Value",
                  "Trigger_Source"]
    extra_cols = [c for c in WEATHER_COLS + SOLAR_COLS if c in log_df.columns]
    all_cols   = base_cols + extra_cols

    # P1 FIX: Only consider human-initiated events for context snapshot
    human_df = log_df[log_df["Trigger_Source"] == "Human"].copy()

    # DRIFT FIX: Detect device/param pairs that have no human rows at all.
    # For those, the fallback (all rows) risks feeding automation output back
    # as context, causing progressive drift (e.g. blinds closing further each round).
    all_keys   = set(zip(log_df["Device_ID"], log_df["Parameter_Changed"]))
    human_keys = set(zip(human_df["Device_ID"], human_df["Parameter_Changed"])) if not human_df.empty else set()
    automation_only = all_keys - human_keys
    if automation_only:
        for dev, param in sorted(automation_only):
            print(f"[Context] WARNING: no human rows for {dev}/{param} — "
                  f"context snapshot falling back to most recent row of any "
                  f"trigger type. Automation-only context may cause prediction drift.")

    if human_df.empty:
        human_df = log_df.copy()   # fallback if no human rows at all yet
    else:
        # For automation-only pairs, supplement with the most recent row of any type
        # so those devices still get a context row (they just carry the warning above).
        if automation_only:
            fallback_rows = (
                log_df[log_df.apply(
                    lambda r: (r["Device_ID"], r["Parameter_Changed"]) in automation_only,
                    axis=1
                )].sort_values("Timestamp")
                  .groupby(["Device_ID","Device_Type","Parameter_Changed"])
                  .last()
                  .reset_index()
            )
            human_df = pd.concat([human_df, fallback_rows], ignore_index=True)

    latest = (human_df.sort_values("Timestamp")
                      .groupby(["Device_ID","Device_Type","Parameter_Changed"])
                      .last()
                      .reset_index())

    latest["Timestamp"]      = datetime.now()
    latest["Trigger_Source"] = "Human"

    return_cols = ["Timestamp"] + all_cols
    return latest[[c for c in return_cols if c in latest.columns]]


# =============================================================================
# SECTION 9a — DAY SIMULATOR  (Fixes 3, 4, 6, 7)
# =============================================================================

class DaySimulator:
    """
    Drives a full 24-hour prediction loop against trained models without any
    of the four simulation failure modes identified in the architecture review.

    FIX 3 — Advancing context:
        After each tick, the simulator writes the ML's own valid commands back
        into the live context as provisional device state.  The next tick sees
        the updated Prev_Value and a correct Time_Since_Last_Event_min rather
        than the frozen values from the original log snapshot.

    FIX 4 — Per-device cadence scheduling:
        Each (device_id, parameter) pair has a min_interval_minutes budget.
        The simulator tracks last_commanded_at per pair and skips models whose
        budget hasn't expired, preventing the engine from flooding all 22
        devices simultaneously on every tick.

    FIX 6 — Out-of-distribution guard:
        Before forwarding a feature vector to a model, the simulator checks
        whether the simulated weather/solar features fall outside the training
        distribution for that model (stored as [min, max] per feature at train
        time).  Features more than 1.5 IQR outside the training range mark the
        model's output as out_of_distribution=True and suppress the command.

    FIX 7 (backend) — Idempotency cache:
        Each tick is keyed by a hash of (simulated_hour, simulated_minute,
        weather_fingerprint).  If the frontend fires duplicate requests for
        the same tick (rapid slider drag), the cached result is returned
        immediately without re-running inference.

    DEFAULT CADENCE BUDGETS (minutes between commands per device parameter):
        Climate (AC target temp, fan speed, operation mode) : 15 min
        Lights  (brightness, colour temp, power)            : 30 min
        Blinds  (open/close %)                              : 60 min
        Irrigation (zone state)                             : 120 min
        Plugs / switches                                    : 30 min
        Speaker (volume, playback)                          : 10 min
        Vacuum  (cleaning state, suction power)             : 60 min
        Camera  (privacy mode)                              : 30 min

    USAGE:
        sim = DaySimulator(engine, enricher, initial_context_df,
                           sim_date=datetime(2026, 6, 9),
                           tick_minutes=30)
        results = sim.run()          # returns list of per-tick result dicts
    """

    # Default cadence map: parameter keyword → min interval in minutes.
    # Matched by substring so "Target Temperature" hits "temperature".
    _DEFAULT_CADENCE: list[tuple[str, int]] = [
        ("temperature",  15),
        ("fan speed",    15),
        ("operation",    15),
        ("volume",       10),
        ("playback",     10),
        ("brightness",   30),
        ("colour",       30),
        ("color",        30),
        ("power",        30),
        ("switch",       30),
        ("privacy",      30),
        ("open",         60),
        ("close",        60),
        ("suction",      60),
        ("cleaning",     60),
        ("zone",        120),
    ]

    def __init__(
        self,
        engine:             "SmartHomePredictionEngine",
        enricher:           WeatherFeatureEnricher,
        initial_context_df: pd.DataFrame,
        sim_date:           Optional[datetime] = None,
        tick_minutes:       int                = 30,
        cadence_overrides:  Optional[dict]     = None,
    ):
        """
        Args:
            engine:             A trained SmartHomePredictionEngine.
            enricher:           WeatherFeatureEnricher (used for OOD bounds
                                and per-tick weather context).
            initial_context_df: Output of build_context_from_log() — one row
                                per (Device_ID, Parameter_Changed).
            sim_date:           The calendar date to simulate.  Defaults to today.
            tick_minutes:       Simulated minutes advanced per tick (default 30).
            cadence_overrides:  Dict mapping "Device_ID__Parameter" → int minutes,
                                overriding the default cadence for that pair.
        """
        self.engine       = engine
        self.enricher     = enricher
        self.tick_minutes = tick_minutes
        self.sim_date     = sim_date or datetime.now().replace(
                                hour=0, minute=0, second=0, microsecond=0)

        # FIX 3: Mutable live context — starts as the log snapshot, then
        # gets updated after each tick with the commands that were executed.
        self._live_ctx: dict[tuple[str, str], str] = {}  # (dev, param) → value str
        for _, row in initial_context_df.iterrows():
            key = (str(row["Device_ID"]), str(row["Parameter_Changed"]))
            self._live_ctx[key] = str(row.get("New_Value", "__none__"))
        # Keep a copy of the base DataFrame structure for rebuilding rows
        self._ctx_template = initial_context_df.copy()

        # FIX 4: Cadence tracker — (dev, param) → last commanded simulated time
        self._last_commanded: dict[tuple[str, str], datetime] = {}
        self._cadence_map: dict[tuple[str, str], int] = {}
        overrides = cadence_overrides or {}
        for _, row in initial_context_df.iterrows():
            pair    = (str(row["Device_ID"]), str(row["Parameter_Changed"]))
            ov_key  = f"{pair[0]}__{pair[1]}"
            if ov_key in overrides:
                self._cadence_map[pair] = int(overrides[ov_key])
            else:
                self._cadence_map[pair] = self._resolve_cadence(pair[1])

        # FIX 6: Training distribution bounds — populated by
        # _build_ood_bounds() from the engine's model bank.
        self._ood_bounds: dict[str, dict[str, tuple[float, float]]] = {}
        self._build_ood_bounds()

        # FIX 7: Idempotency cache — tick_key → list[dict] commands
        self._idem_cache: dict[str, list[dict]] = {}

        # Pre-fetch 24-hour weather once (Fix 1 integration)
        self.enricher.prefetch_day(self.sim_date)

        print(f"[DaySimulator] Ready — {1440 // tick_minutes} ticks of "
              f"{tick_minutes} min each on {self.sim_date.date()}")

    # ------------------------------------------------------------------ #
    # Public                                                               #
    # ------------------------------------------------------------------ #

    def run(self) -> list[dict]:
        """
        Run the full simulated day.  Returns a list of per-tick result dicts,
        each containing: sim_timestamp, commands, ood_flags, cadence_skips.
        """
        tick_results = []
        n_ticks      = 1440 // self.tick_minutes
        sim_ts       = self.sim_date.replace(hour=0, minute=0)

        for t in range(n_ticks):
            result = self.tick(sim_ts)
            tick_results.append(result)
            sim_ts += timedelta(minutes=self.tick_minutes)

        print(f"[DaySimulator] Day complete — {n_ticks} ticks processed.")
        return tick_results

    def tick(self, sim_ts: datetime) -> dict:
        """
        FIX 7 (backend): Compute (or return cached) predictions for one
        simulated timestamp.

        The idempotency key is a hash of (hour, minute, weather fingerprint)
        so duplicate requests from a rapidly-dragged time slider are collapsed
        into a single inference call and return the cached result immediately.
        """
        weather_now  = self.enricher.enrich_row_live(sim_ts)
        idem_key     = self._make_idem_key(sim_ts, weather_now)

        if idem_key in self._idem_cache:
            print(f"[DaySimulator] tick {sim_ts.strftime('%H:%M')} — "
                  f"duplicate request, returning cached result.")
            return {"sim_timestamp": sim_ts.isoformat(),
                    "from_cache":    True,
                    "commands":      self._idem_cache[idem_key],
                    "cadence_skips": [],
                    "ood_flags":     []}

        # FIX 3: Rebuild context DataFrame from live state + current sim time
        ctx_df = self._build_live_context(sim_ts, weather_now)

        # FIX 4: Determine which models are due to fire this tick
        due_keys    = self._due_models(sim_ts)
        skipped     = [pair for pair in self._cadence_map if pair not in due_keys]

        # Run inference only for due models by temporarily limiting the bank
        active_models_backup    = self.engine.bank.models
        self.engine.bank.models = {
            k: v for k, v in active_models_backup.items()
            if (v["device_id"], v["param"]) in due_keys
        }

        raw_commands = self.engine.predict_for_context(ctx_df)
        self.engine.bank.models = active_models_backup   # restore full bank

        # FIX 6: OOD filter — suppress commands for models whose feature
        # space falls outside the training distribution
        commands, ood_flags = self._apply_ood_filter(raw_commands, weather_now)

        # FIX 3: Feed valid commands back into live context for next tick
        self._advance_context(commands, sim_ts)

        # FIX 4: Update last_commanded timestamp for models that fired
        for cmd in commands:
            if cmd.get("valid") and not cmd.get("suppressed") \
                    and not cmd.get("no_model"):
                pair = (cmd["device_id"], cmd["parameter"])
                self._last_commanded[pair] = sim_ts

        cadence_skip_records = [
            {"device_id": p[0], "parameter": p[1],
             "reason": "cadence_not_due",
             "next_due_in_min": self._minutes_until_due(p, sim_ts)}
            for p in skipped
        ]

        result = {
            "sim_timestamp": sim_ts.isoformat(),
            "from_cache":    False,
            "commands":      commands,
            "cadence_skips": cadence_skip_records,
            "ood_flags":     ood_flags,
        }
        self._idem_cache[idem_key] = commands
        return result

    # ------------------------------------------------------------------ #
    # Fix 3 helpers                                                        #
    # ------------------------------------------------------------------ #

    def _build_live_context(self, sim_ts: datetime,
                            weather: dict) -> pd.DataFrame:
        """
        Reconstruct a context DataFrame from self._live_ctx (the advancing
        device-state dict) stamped with sim_ts and the current weather.
        This is what Fix 3 feeds into the engine instead of the frozen
        log snapshot — so Prev_Value and Time_Since_Last_Event_min change
        correctly as the simulation progresses through the day.
        """
        rows = []
        for _, tmpl_row in self._ctx_template.iterrows():
            pair     = (str(tmpl_row["Device_ID"]),
                        str(tmpl_row["Parameter_Changed"]))
            new_val  = self._live_ctx.get(pair, str(tmpl_row.get("New_Value", "__none__")))
            last_cmd = self._last_commanded.get(pair)
            elapsed  = ((sim_ts - last_cmd).total_seconds() / 60
                        if last_cmd else 1440.0)
            row = tmpl_row.to_dict()
            row["Timestamp"]                = sim_ts
            row["Trigger_Source"]           = "Human"
            row["New_Value"]                = new_val
            row["Time_Since_Last_Event_min"] = min(elapsed, 1440.0)
            row.update(weather)
            rows.append(row)
        return pd.DataFrame(rows).reset_index(drop=True)

    def _advance_context(self, commands: list[dict], sim_ts: datetime) -> None:
        """
        Fix 3: Write the ML's valid output back into self._live_ctx so that
        the next tick sees the state the system has just set, not the stale
        log snapshot value.  Only valid, non-suppressed, non-OOD commands
        are written back (suppressed / OOD commands leave the device as-is).
        """
        for cmd in commands:
            if (cmd.get("valid") and not cmd.get("suppressed")
                    and not cmd.get("no_model")
                    and not cmd.get("out_of_distribution")):
                pair = (cmd["device_id"], cmd["parameter"])
                val  = cmd.get("validated_value") or cmd.get("safe_value")
                if val is not None:
                    self._live_ctx[pair] = str(val)

    # ------------------------------------------------------------------ #
    # Fix 4 helpers                                                        #
    # ------------------------------------------------------------------ #

    def _resolve_cadence(self, param_name: str) -> int:
        """Return cadence budget for a parameter by keyword matching."""
        pl = param_name.lower()
        for keyword, minutes in self._DEFAULT_CADENCE:
            if keyword in pl:
                return minutes
        return 30   # default: 30-minute budget for unrecognised params

    def _due_models(self, sim_ts: datetime) -> set[tuple[str, str]]:
        """
        Return the set of (device_id, param) pairs whose cadence budget
        has expired at sim_ts and are therefore eligible to fire.
        """
        due = set()
        for pair, budget in self._cadence_map.items():
            last = self._last_commanded.get(pair)
            if last is None:
                due.add(pair)   # never commanded — always due on first tick
            elif (sim_ts - last).total_seconds() / 60 >= budget:
                due.add(pair)
        return due

    def _minutes_until_due(self, pair: tuple[str, str],
                           sim_ts: datetime) -> float:
        """Minutes remaining until this pair's cadence budget expires."""
        last   = self._last_commanded.get(pair)
        budget = self._cadence_map.get(pair, 30)
        if last is None:
            return 0.0
        elapsed = (sim_ts - last).total_seconds() / 60
        return max(0.0, budget - elapsed)

    # ------------------------------------------------------------------ #
    # Fix 6 helpers                                                        #
    # ------------------------------------------------------------------ #

    def _build_ood_bounds(self) -> None:
        """
        Fix 6: Walk the engine's model bank and record [p5, p95] bounds for
        each numeric feature using the training data stored implicitly in the
        Random Forest leaf values.

        Because RandomForest doesn't expose raw training data, we approximate
        the bounds from the forest's leaf node value distributions. For
        weather/solar features (continuous, bounded) this gives a robust
        envelope.  The bounds are stored as self._ood_bounds[model_key][feature].
        """
        WEATHER_SOLAR_FEATS = set(WEATHER_COLS + SOLAR_COLS)
        for key, bundle in self.engine.bank.models.items():
            model     = bundle["model"]
            feat_cols = bundle.get("feat_cols", FEATURE_COLS)
            bounds: dict[str, tuple[float, float]] = {}

            if hasattr(model, "estimators_"):
                for fi, feat in enumerate(feat_cols):
                    if feat not in WEATHER_SOLAR_FEATS:
                        continue
                    # Collect threshold values for this feature from all trees
                    thresholds = []
                    for tree in model.estimators_:
                        t = tree.tree_
                        mask = t.feature == fi
                        thresholds.extend(t.threshold[mask].tolist())
                    if len(thresholds) >= 4:
                        q5, q95 = float(np.percentile(thresholds, 5)), \
                                  float(np.percentile(thresholds, 95))
                        bounds[feat] = (q5, q95)

            self._ood_bounds[key] = bounds

    def _apply_ood_filter(
        self,
        commands:    list[dict],
        weather_now: dict,
    ) -> tuple[list[dict], list[dict]]:
        """
        Fix 6: For each command, check whether the current weather/solar
        features fall outside the training distribution for that model.

        A feature is flagged as OOD if its value is outside
        [q5 − 1.5*(q95−q5), q95 + 1.5*(q95−q5)] — i.e. more than 1.5 IQR
        beyond either end of the observed training range.

        OOD commands have out_of_distribution=True appended and are suppressed
        (not sent to MQTT) so the device holds its current state rather than
        acting on an extrapolated prediction.
        """
        filtered   = []
        ood_events = []

        for cmd in commands:
            if cmd.get("no_model") or cmd.get("suppressed"):
                filtered.append(cmd)
                continue

            model_key = f"{cmd['device_id']}__{cmd['parameter']}"
            bounds    = self._ood_bounds.get(model_key, {})
            ood_feats = []

            for feat, val in weather_now.items():
                if feat not in bounds:
                    continue
                q5, q95 = bounds[feat]
                iqr     = q95 - q5
                lo      = q5  - 1.5 * iqr
                hi      = q95 + 1.5 * iqr
                try:
                    fval = float(val)
                except (TypeError, ValueError):
                    continue
                if fval < lo or fval > hi:
                    ood_feats.append({
                        "feature":  feat,
                        "value":    fval,
                        "train_q5": round(q5,  2),
                        "train_q95":round(q95, 2),
                    })

            if ood_feats:
                ood_cmd = dict(cmd)
                ood_cmd["out_of_distribution"] = True
                ood_cmd["suppressed"]          = True
                ood_cmd["ood_features"]        = ood_feats
                ood_cmd["reason"]              = (
                    f"OOD: {[f['feature'] for f in ood_feats]} outside "
                    f"training distribution — holding current state.")
                filtered.append(ood_cmd)
                ood_events.append({
                    "device_id": cmd["device_id"],
                    "parameter": cmd["parameter"],
                    "ood_features": ood_feats,
                })
                print(f"[OOD] {model_key}: suppressed — "
                      f"{[f['feature'] for f in ood_feats]} out of distribution.")
            else:
                cmd["out_of_distribution"] = False
                filtered.append(cmd)

        return filtered, ood_events

    # ------------------------------------------------------------------ #
    # Fix 7 helper                                                         #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _make_idem_key(sim_ts: datetime, weather: dict) -> str:
        """
        Fix 7 (backend): Build an idempotency key from the simulated
        timestamp + weather fingerprint.  Identical ticks from rapid
        slider-drag events resolve to the same key and are served from
        self._idem_cache without re-running inference.
        """
        weather_sig = "|".join(
            f"{k}={round(float(v), 1)}"
            for k, v in sorted(weather.items())
            if k in ("Outdoor_Temp_C", "Is_Raining", "Cloud_Cover_Pct")
        )
        raw = f"{sim_ts.strftime('%H:%M')}|{weather_sig}"
        return hashlib.md5(raw.encode()).hexdigest()


# =============================================================================
# SECTION 9 — MAIN DEMO
# =============================================================================

def run_full_demo(schema_csv: str,
                  activity_log_csv: str,
                  latitude: float   = 19.0760,
                  longitude: float  = 72.8777,
                  api_key: str | None = None,
                  n_rounds: int     = 3,
                  clean_run: bool   = False,
                  command_log_path: str = 'device_command_log.json',
                  run_day_sim: bool = False,
                  sim_tick_minutes: int = 30):
    """
    Runs the full incremental learning demo in n_rounds batches.

    The activity_log_weather.csv already contains weather columns, so
    no API key is required to run the demo. In production, set api_key
    and use_csv_weather=False to fetch live conditions.

    Args:
        schema_csv:         Path to Smart_Home_IoT_Parameters CSV
        activity_log_csv:   Path to the weather-enriched activity log CSV
        latitude:           Home GPS latitude  (default: Mumbai)
        longitude:          Home GPS longitude (default: Mumbai)
        api_key:            OpenWeatherMap API key (optional for demo)
        n_rounds:           Number of incremental training rounds
        clean_run:          If True, wipe all prior models/logs before starting.
                            Default False — preserves existing state in production.
        command_log_path:   Path for the per-device command JSON log.
        run_day_sim:        If True, run a full 24-hour DaySimulator after the
                            final training round (Fixes 3, 4, 6, 7 in action).
        sim_tick_minutes:   Tick granularity for the DaySimulator (default 30 min).
    """
    print("\n" + "═"*68)
    print("  SMART HOME AMBIENT AUTOMATION  (v4 — Simulation-Ready)")
    print("  Fixes: Weather Cache · Parallel Inference · Advancing Context")
    print("         Cadence Scheduler · Full Manifest · OOD Guard · Idempotency")
    print("═"*68)

    # Detect whether the CSV already has weather columns
    sample = pd.read_csv(activity_log_csv, nrows=2)
    has_weather = all(c in sample.columns for c in WEATHER_COLS)
    use_csv     = has_weather or (api_key is None)
    if has_weather:
        print("\n[Setup] Weather columns detected in CSV — no API calls needed.")
    elif api_key:
        print("\n[Setup] No weather columns in CSV — will fetch from OWM API.")
    else:
        print("\n[Setup] No weather columns and no API key — "
              "using default weather values.")

    enricher = WeatherFeatureEnricher(
        latitude=latitude, longitude=longitude,
        api_key=api_key, use_csv_weather=use_csv)

    # P2 FIX: Guard cleanup behind clean_run flag (default False)
    if clean_run:
        for p in [LOG_STORE, METRICS_STORE, ENCODER_STORE]:
            if p.exists():
                p.unlink()
        for f in MODELS_DIR.glob("*.joblib"):
            f.unlink()
    else:
        print("[run_full_demo] clean_run=False — existing models and log preserved.")

    full_df = pd.read_csv(activity_log_csv)
    full_df["Timestamp"] = pd.to_datetime(full_df["Timestamp"])
    full_df = full_df.sort_values("Timestamp").reset_index(drop=True)
    total   = len(full_df)

    batch_size = total // n_rounds
    batches    = [full_df.iloc[i*batch_size:(i+1)*batch_size]
                  for i in range(n_rounds)]
    if total % n_rounds:
        batches[-1] = full_df.iloc[(n_rounds-1)*batch_size:]

    learner        = SmartHomeIncrementalLearner(schema_csv, enricher)
    final_engine   = None
    final_ctx_df   = None

    for rnd, batch in enumerate(batches, 1):
        print(f"\n{'━'*68}")
        print(f"  ROUND {rnd}/{n_rounds}  — feeding {len(batch)} new events")
        print(f"{'━'*68}")

        new_rows   = learner.append_new_data(batch)
        model_bank = learner.retrain(new_row_count=new_rows)
        print_feature_importances(model_bank)

        ctx_df  = build_context_from_log(pd.read_csv(LOG_STORE))
        command_logger = DeviceCommandLogger(log_path=command_log_path)
        engine  = SmartHomePredictionEngine(
            model_bank, learner.validator, learner.preprocessor,
            enricher=enricher if not use_csv else None,
            command_logger=command_logger)

        # Collect all known model keys (including dropped) for Fix 5 manifest
        all_keys = [
            f"{row['Device_ID']}__{row['Parameter_Changed']}"
            for _, row in ctx_df.iterrows()
        ]
        commands = engine.predict_for_context(ctx_df, all_model_keys=all_keys)
        engine.publish_commands(commands)

        # Keep the final-round engine + context for optional day simulation
        if rnd == n_rounds:
            final_engine = engine
            final_ctx_df = ctx_df

    learner.print_accuracy_trends()

    # ------------------------------------------------------------------ #
    # Optional: run a full-day simulation using DaySimulator (Fixes 3-7) #
    # ------------------------------------------------------------------ #
    if run_day_sim and final_engine is not None and final_ctx_df is not None:
        print(f"\n{'═'*68}")
        print("  DAY SIMULATION  (Fixes 3, 4, 6, 7 active)")
        print(f"{'═'*68}")
        sim = DaySimulator(
            engine           = final_engine,
            enricher         = enricher,
            initial_context_df = final_ctx_df,
            sim_date         = datetime.now().replace(
                                   hour=0, minute=0, second=0, microsecond=0),
            tick_minutes     = sim_tick_minutes,
        )
        tick_results = sim.run()

        # Summary statistics across the day
        total_cmds  = sum(len(r["commands"])      for r in tick_results)
        total_ood   = sum(len(r["ood_flags"])      for r in tick_results)
        total_skip  = sum(len(r["cadence_skips"]) for r in tick_results)
        total_cache = sum(1 for r in tick_results if r["from_cache"])
        print(f"\n[DaySimulator] Summary:")
        print(f"  Ticks run           : {len(tick_results)}")
        print(f"  Cache hits (Fix 7)  : {total_cache}")
        print(f"  Cadence skips (Fix 4): {total_skip}")
        print(f"  OOD suppressions (F6): {total_ood}")
        print(f"  Total commands issued: {total_cmds}")

    print("═"*68)
    print("  DEMO COMPLETE")
    print(f"  Models   → {MODELS_DIR}/")
    print(f"  Log      → {LOG_STORE}")
    print(f"  Metrics  → {METRICS_STORE}")
    print(f"  Cmd Log  → {command_log_path}")
    print("═"*68 + "\n")
    return learner



# =============================================================================
# SECTION 10 — PRODUCTION RUNTIME ENGINE
# =============================================================================

class SmartHomeRuntime:
    """
    The production runtime engine. Replaces run_full_demo() for live
    operation. Two responsibilities run in parallel on separate threads:

    ┌─────────────────────────────────────────────────────────────────┐
    │  PREDICTION LOOP  (every predict_interval_sec, default 15 min) │
    │  ─ Reads the latest device context from the accumulated log     │
    │  ─ Runs inference on all trained models in parallel             │
    │  ─ Validates every prediction against the schema                │
    │  ─ Writes the command manifest to commands_out_path (JSON)      │
    │  ─ The FRONTEND reads this file / endpoint to act on devices    │
    ├─────────────────────────────────────────────────────────────────┤
    │  LEARNING LOOP   (every retrain_interval_sec, default 1 hour)  │
    │  ─ Reads override_events_path for new human events from the UI  │
    │  ─ Detects corrections (human overrides automation within 5min) │
    │  ─ Appends genuinely new events to the persistent activity log  │
    │  ─ Retrains all models if ≥10 new rows were added              │
    │  ─ Hot-swaps the running model bank without restarting          │
    └─────────────────────────────────────────────────────────────────┘

    FRONTEND INTEGRATION CONTRACT
    ─────────────────────────────
    The frontend writes human device interactions to override_events_path
    as a JSON array of event objects:

        [
          {
            "Timestamp":         "2026-06-09T14:32:00",
            "Device_ID":         "LivingRoom_AC_1",
            "Device_Type":       "Smart Air Conditioner",
            "Parameter_Changed": "Target Temperature",
            "New_Value":         "24",
            "Trigger_Source":    "Human"
          },
          ...
        ]

    The runtime reads and clears this file on every learning cycle.
    Automation-triggered events (from the pipeline's own predictions) that
    the frontend writes back should use Trigger_Source = "Automation" so
    the model can detect corrections (human action within 5 min of automation).

    The runtime writes validated predictions to commands_out_path as JSON:

        {
          "generated_at": "2026-06-09T14:30:01",
          "commands": [
            {
              "device_id":       "LivingRoom_AC_1",
              "device_type":     "Smart Air Conditioner",
              "parameter":       "Target Temperature",
              "validated_value": 24.0,
              "confidence":      null,
              "is_valid":        true,
              "suppressed":      false,
              "no_model":        false,
              "timestamp":       "2026-06-09T14:30:01"
            },
            ...
          ]
        }

    The frontend polls or watches this file and applies each command where
    is_valid=true and suppressed=false. Commands where no_model=true or
    suppressed=true mean the pipeline is holding that device at its current
    state — the frontend should do nothing for those.

    USAGE
    ─────
        runtime = SmartHomeRuntime(
            schema_csv          = "Smart_Home_IoT_Parameters-v2.csv",
            activity_log_csv    = "activity_log_weather.csv",   # initial training data
            commands_out_path   = "commands.json",              # frontend reads this
            override_events_path= "override_events.json",       # frontend writes here
            latitude            = 19.0760,
            longitude           = 72.8777,
            api_key             = None,                         # OWM key if needed
            predict_interval_sec= 15 * 60,                      # predict every 15 min
            retrain_interval_sec= 60 * 60,                      # retrain every hour
        )
        runtime.start()      # non-blocking — threads run in background
        runtime.wait()       # block until KeyboardInterrupt
        # or: runtime.stop() # graceful shutdown from another thread
    """

    def __init__(
        self,
        schema_csv:           str,
        activity_log_csv:     str,
        commands_out_path:    str  = "commands.json",
        override_events_path: str  = "override_events.json",
        latitude:             float = 19.0760,
        longitude:            float = 72.8777,
        api_key:              str | None = None,
        predict_interval_sec: int  = 15 * 60,
        retrain_interval_sec: int  = 60 * 60,
        command_log_path:     str  = "device_command_log.json",
    ):
        self.schema_csv            = schema_csv
        self.activity_log_csv      = activity_log_csv
        self.commands_out_path     = Path(commands_out_path)
        self.override_events_path  = Path(override_events_path)
        self.command_log_path      = command_log_path
        self.predict_interval_sec  = predict_interval_sec
        self.retrain_interval_sec  = retrain_interval_sec

        # ── Shared state guarded by a lock ────────────────────────────────
        self._lock        = threading.Lock()
        self._stop_event  = threading.Event()
        self._engine:  SmartHomePredictionEngine | None = None
        self._learner: SmartHomeIncrementalLearner | None = None
        self._all_model_keys: list[str] = []

        # ── Weather enricher ──────────────────────────────────────────────
        sample          = pd.read_csv(activity_log_csv, nrows=2)
        has_weather     = all(c in sample.columns for c in WEATHER_COLS)
        self._enricher  = WeatherFeatureEnricher(
            latitude        = latitude,
            longitude       = longitude,
            api_key         = api_key,
            use_csv_weather = has_weather or (api_key is None),
        )

        # ── Threads ───────────────────────────────────────────────────────
        self._predict_thread = threading.Thread(
            target=self._prediction_loop, daemon=True,
            name="SmartHome-PredictLoop")
        self._learn_thread   = threading.Thread(
            target=self._learning_loop, daemon=True,
            name="SmartHome-LearnLoop")

        print("[Runtime] Initialised.")
        print(f"  Predict interval : {predict_interval_sec // 60} min")
        print(f"  Retrain interval : {retrain_interval_sec // 60} min")
        print(f"  Commands out     : {commands_out_path}")
        print(f"  Override events  : {override_events_path}")

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    def start(self):
        """
        Bootstrap: load/train models from the seed activity log,
        then start both background loops.
        """
        print("\n[Runtime] Bootstrapping — loading seed training data...")
        self._bootstrap()
        self._predict_thread.start()
        self._learn_thread.start()
        print("[Runtime] Both loops running. Press Ctrl+C to stop.\n")

    def stop(self):
        """Signal both loops to exit cleanly."""
        print("\n[Runtime] Stopping...")
        self._stop_event.set()

    def wait(self):
        """Block the calling thread until KeyboardInterrupt or stop()."""
        try:
            while not self._stop_event.is_set():
                time.sleep(1)
        except KeyboardInterrupt:
            self.stop()
        self._predict_thread.join(timeout=10)
        self._learn_thread.join(timeout=10)
        print("[Runtime] Shutdown complete.")

    # ------------------------------------------------------------------ #
    # Bootstrap                                                            #
    # ------------------------------------------------------------------ #

    def _bootstrap(self):
        """
        On first start: train models from the seed CSV (historical data
        or the demo activity_log_weather.csv). On subsequent starts:
        load existing persisted models from disk — no retraining needed.
        """
        learner = SmartHomeIncrementalLearner(self.schema_csv, self._enricher)

        if MODELS_DIR.exists() and any(MODELS_DIR.glob("*.joblib")):
            # Models already exist — load them without retraining
            print("[Runtime] Found existing models — loading from disk.")
            learner.model_bank.load()
            learner.preprocessor.load()
        else:
            # First boot — seed from the historical activity log CSV
            print("[Runtime] No existing models found — training from seed CSV.")
            seed_df = pd.read_csv(self.activity_log_csv)
            n_added  = learner.append_new_data(seed_df)
            learner.retrain(new_row_count=n_added)

        # Build initial prediction engine
        engine = SmartHomePredictionEngine(
            model_bank     = learner.model_bank,
            schema_validator = learner.validator,
            preprocessor   = learner.preprocessor,
            enricher       = self._enricher if not self._enricher.use_csv_weather else None,
            command_logger = DeviceCommandLogger(self.command_log_path),
        )

        # Derive the full model key manifest from the log context
        if LOG_STORE.exists():
            ctx_df = build_context_from_log(pd.read_csv(LOG_STORE))
            all_keys = [
                f"{row['Device_ID']}__{row['Parameter_Changed']}"
                for _, row in ctx_df.iterrows()
            ]
        else:
            all_keys = []

        with self._lock:
            self._learner        = learner
            self._engine         = engine
            self._all_model_keys = all_keys

        print("[Runtime] Bootstrap complete — models ready.")

    # ------------------------------------------------------------------ #
    # Prediction loop                                                      #
    # ------------------------------------------------------------------ #

    def _prediction_loop(self):
        """
        Runs every predict_interval_sec.
        Reads the latest context, runs inference, writes commands.json.
        """
        print("[PredictLoop] Started.")
        while not self._stop_event.is_set():
            try:
                self._run_prediction_cycle()
            except Exception as exc:
                print(f"[PredictLoop] ERROR: {exc}")
            # Sleep in short increments so stop_event is checked frequently
            self._interruptible_sleep(self.predict_interval_sec)
        print("[PredictLoop] Stopped.")

    def _run_prediction_cycle(self):
        """One prediction tick: context → inference → write commands.json."""
        with self._lock:
            engine       = self._engine
            all_keys     = list(self._all_model_keys)

        if engine is None or not LOG_STORE.exists():
            print("[PredictLoop] Waiting for models and log data...")
            return

        log_df = pd.read_csv(LOG_STORE)
        ctx_df = build_context_from_log(log_df)

        if ctx_df.empty:
            print("[PredictLoop] Context is empty — no events in log yet.")
            return

        commands = engine.predict_for_context(ctx_df, all_model_keys=all_keys)

        # Write output for the frontend to consume
        self._write_commands(commands)

        # Console summary (brief)
        n_valid = sum(1 for c in commands if c.get("valid") and not c.get("suppressed"))
        n_supp  = sum(1 for c in commands if c.get("suppressed"))
        n_hold  = sum(1 for c in commands if c.get("no_model"))
        print(f"[PredictLoop] {datetime.now().strftime('%H:%M:%S')} — "
              f"{n_valid} predictions ready | "
              f"{n_supp} suppressed | {n_hold} holding")

    def _write_commands(self, commands: list[dict]):
        """
        Write the validated command manifest to commands_out_path.
        The frontend watches or polls this file.

        Only the fields the frontend needs are included:
          device_id, device_type, parameter, validated_value,
          confidence, is_valid, suppressed, no_model, timestamp
        """
        output = {
            "generated_at": datetime.now().isoformat(),
            "commands": [
                {
                    "device_id":       c.get("device_id"),
                    "device_type":     c.get("device_type"),
                    "parameter":       c.get("parameter"),
                    "validated_value": c.get("validated_value",
                                             c.get("safe_value")),
                    "confidence":      c.get("confidence"),
                    "is_valid":        c.get("is_valid", c.get("valid", False)),
                    "suppressed":      c.get("suppressed", False),
                    "no_model":        c.get("no_model", False),
                    "reason":          c.get("reason", c.get("schema_msg", "")),
                    "timestamp":       c.get("timestamp"),
                }
                for c in commands
            ],
        }
        # Atomic write: write to temp then rename so the frontend never
        # reads a half-written file mid-cycle.
        tmp = self.commands_out_path.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, default=str)
        tmp.replace(self.commands_out_path)

    # ------------------------------------------------------------------ #
    # Learning loop                                                        #
    # ------------------------------------------------------------------ #

    def _learning_loop(self):
        """
        Runs every retrain_interval_sec.
        Ingests human override events, detects corrections, retrains if enough
        new data arrived, then hot-swaps the running engine.
        """
        print("[LearnLoop] Started.")
        while not self._stop_event.is_set():
            try:
                self._run_learning_cycle()
            except Exception as exc:
                print(f"[LearnLoop] ERROR: {exc}")
            self._interruptible_sleep(self.retrain_interval_sec)
        print("[LearnLoop] Stopped.")

    def _run_learning_cycle(self):
        """
        One learning cycle:
          1. Read + clear override_events.json (written by the frontend)
          2. Enrich new events with current weather
          3. Append to persistent log (deduplication handled internally)
          4. Retrain if ≥ MIN_NEW_ROWS_TO_RETRAIN new rows were added
          5. Hot-swap the running prediction engine
        """
        new_events = self._consume_override_events()
        if not new_events:
            print(f"[LearnLoop] {datetime.now().strftime('%H:%M:%S')} — "
                  f"No new events from frontend.")
            return

        print(f"[LearnLoop] {datetime.now().strftime('%H:%M:%S')} — "
              f"Ingesting {len(new_events)} new event(s) from frontend...")

        new_df = pd.DataFrame(new_events)

        # Add weather context to events that don't already have it
        missing_weather = [c for c in WEATHER_COLS if c not in new_df.columns]
        if missing_weather and not self._enricher.use_csv_weather:
            new_df = self._enricher.enrich_dataframe(new_df)
        elif missing_weather:
            # No API key — fill with current live weather
            now = datetime.now()
            live_w = self._enricher.enrich_row_live(now)
            for col, val in live_w.items():
                if col not in new_df.columns:
                    new_df[col] = val

        with self._lock:
            learner = self._learner

        if learner is None:
            print("[LearnLoop] Learner not ready yet — skipping cycle.")
            return

        n_added = learner.append_new_data(new_df)

        # Count corrections: human event within 5 min of an automation event
        n_corrections = self._count_corrections(new_df)
        if n_corrections:
            print(f"[LearnLoop] {n_corrections} correction event(s) detected "
                  f"(user overrode automation within 5 min) — "
                  f"these will receive 3× sample weight in next retrain.")

        # Retrain if enough new data (correction events always trigger retrain)
        should_retrain = n_added >= 10 or n_corrections > 0
        if not should_retrain:
            print(f"[LearnLoop] Only {n_added} new rows — "
                  f"waiting for more data before retraining.")
            return

        print(f"[LearnLoop] Retraining with {n_added} new rows...")
        new_bank = learner.retrain(new_row_count=n_added)

        # Build updated context manifest
        if LOG_STORE.exists():
            ctx_df   = build_context_from_log(pd.read_csv(LOG_STORE))
            all_keys = [
                f"{row['Device_ID']}__{row['Parameter_Changed']}"
                for _, row in ctx_df.iterrows()
            ]
        else:
            all_keys = list(self._all_model_keys)

        # Hot-swap engine — prediction loop picks it up on next cycle
        new_engine = SmartHomePredictionEngine(
            model_bank       = new_bank,
            schema_validator = learner.validator,
            preprocessor     = learner.preprocessor,
            enricher         = self._enricher if not self._enricher.use_csv_weather else None,
            command_logger   = DeviceCommandLogger(self.command_log_path),
        )

        with self._lock:
            self._engine         = new_engine
            self._all_model_keys = all_keys

        print(f"[LearnLoop] ✓ Models updated and hot-swapped. "
              f"Next prediction cycle will use new models.")

    def _consume_override_events(self) -> list[dict]:
        """
        Read override_events_path written by the frontend, then clear it
        so the same events are not ingested twice.

        The frontend must write a valid JSON array to this file. An empty
        array or missing file are both treated as "no new events".
        """
        if not self.override_events_path.exists():
            return []
        try:
            with open(self.override_events_path, "r", encoding="utf-8") as f:
                events = json.load(f)
            if not isinstance(events, list) or not events:
                return []
            # Clear the file after reading — mark as consumed
            self.override_events_path.write_text("[]", encoding="utf-8")
            return events
        except (json.JSONDecodeError, IOError) as e:
            print(f"[LearnLoop] Could not read override events: {e}")
            return []

    @staticmethod
    def _count_corrections(new_df: pd.DataFrame) -> int:
        """
        Count events in new_df that look like user corrections:
        a Human event on the same (Device_ID, Parameter_Changed) that
        follows an Automation event within 5 minutes.
        """
        if "Trigger_Source" not in new_df.columns:
            return 0
        WINDOW = pd.Timedelta(minutes=5)
        df = new_df.copy()
        df["Timestamp"] = pd.to_datetime(df["Timestamp"], format="mixed", errors="coerce")
        df = df.dropna(subset=["Timestamp"]).sort_values("Timestamp")
        auto_rows  = df[df["Trigger_Source"] != "Human"]
        human_rows = df[df["Trigger_Source"] == "Human"]
        corrections = 0
        for _, auto in auto_rows.iterrows():
            window_end = auto["Timestamp"] + WINDOW
            matched = human_rows[
                (human_rows["Device_ID"]         == auto["Device_ID"]) &
                (human_rows["Parameter_Changed"] == auto["Parameter_Changed"]) &
                (human_rows["Timestamp"]         >  auto["Timestamp"]) &
                (human_rows["Timestamp"]         <= window_end)
            ]
            corrections += len(matched)
        return corrections

    def _interruptible_sleep(self, seconds: int):
        """Sleep in 1-second chunks so stop_event is checked regularly."""
        for _ in range(seconds):
            if self._stop_event.is_set():
                break
            time.sleep(1)



# =============================================================================
# ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    import sys

    # ─────────────────────────────────────────────────────────────────────
    # MODE SELECTION
    #   demo       — run the 3-round incremental learning demo (default)
    #   production — start the real-time runtime engine
    #
    # Usage:
    #   python smart_home_pipeline.py                        # demo mode
    #   python smart_home_pipeline.py production             # production mode
    #   python smart_home_pipeline.py production <api_key>  # with live weather
    # ─────────────────────────────────────────────────────────────────────

    SCHEMA_CSV       = "Smart_Home_IoT_Parameters-v2.csv"
    ACTIVITY_LOG_CSV = "activity_log_weather.csv"
    MODE             = sys.argv[1] if len(sys.argv) >= 2 else "demo"
    OWM_API_KEY      = sys.argv[2] if len(sys.argv) >= 3 else None

    if MODE == "production":
        # ── PRODUCTION MODE ───────────────────────────────────────────────
        # Starts the real-time prediction + learning loops.
        # On first run: trains from ACTIVITY_LOG_CSV as seed data.
        # On subsequent runs: loads existing models from smarthome_data/models/.
        #
        # The frontend should:
        #   WRITE → override_events.json  (human device interactions)
        #   READ  ← commands.json         (validated model predictions)
        print("\n[Main] Starting in PRODUCTION mode...")
        runtime = SmartHomeRuntime(
            schema_csv           = SCHEMA_CSV,
            activity_log_csv     = ACTIVITY_LOG_CSV,
            commands_out_path    = "commands.json",
            override_events_path = "override_events.json",
            latitude             = 19.0760,   # ← replace with your home GPS
            longitude            = 72.8777,   # ← replace with your home GPS
            api_key              = OWM_API_KEY,
            predict_interval_sec = 15 * 60,   # predict every 15 minutes
            retrain_interval_sec = 60 * 60,   # retrain every hour
            command_log_path     = "device_command_log.json",
        )
        runtime.start()
        runtime.wait()   # blocks until Ctrl+C

    else:
        # ── DEMO MODE ────────────────────────────────────────────────────
        # Runs the 3-round incremental learning demo (existing behaviour).
        print("\n[Main] Starting in DEMO mode (pass \'production\' to run live)...")
        run_full_demo(
            schema_csv       = SCHEMA_CSV,
            activity_log_csv = ACTIVITY_LOG_CSV,
            latitude         = 19.0760,
            longitude        = 72.8777,
            api_key          = OWM_API_KEY,
            n_rounds         = 3,
            clean_run        = True,
            run_day_sim      = True,
            sim_tick_minutes = 30,
        )