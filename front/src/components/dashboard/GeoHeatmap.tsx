/**
 * GeoHeatmap — dot-grid world map using react-simple-maps + SVG pattern fills.
 *
 * Each country is rendered with its real GeoJSON outline filled by a small-dot
 * SVG pattern. Countries with SensorTower data get a heat-scale color; the rest
 * get a dim slate silhouette so the world map is always legible.
 */
import { useMemo, useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";
import { Globe } from "lucide-react";
import { useGame } from "@/lib/game-context";
import { useGeoSignals, type CountrySignal } from "@/lib/api";

// ---------------------------------------------------------------------------
// World topojson fetched from CDN — no extra package needed
// ---------------------------------------------------------------------------

const GEO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// ---------------------------------------------------------------------------
// ISO 3166-1 numeric → alpha-2 mapping for the 34 countries we track
// ---------------------------------------------------------------------------

const NUMERIC_TO_CODE: Record<string, string> = {
  "840": "US", "124": "CA", "484": "MX",
  "076": "BR", "032": "AR", "170": "CO",
  "826": "GB", "250": "FR", "276": "DE", "380": "IT", "724": "ES",
  "528": "NL", "752": "SE", "616": "PL", "643": "RU",
  "792": "TR", "682": "SA", "784": "AE", "376": "IL",
  "392": "JP", "410": "KR", "156": "CN", "356": "IN",
  "360": "ID", "764": "TH", "702": "SG", "158": "TW",
  "608": "PH", "458": "MY",
  "036": "AU", "554": "NZ",
  "710": "ZA", "566": "NG", "818": "EG",
};

// Country centroids [lng, lat] for Marker positioning
const CENTROIDS: Record<string, [number, number]> = {
  US: [-95.7, 38.9],  CA: [-106.3, 56.1], MX: [-102.6, 23.6],
  BR: [-51.9, -14.2], AR: [-63.6, -38.4], CO: [-74.1, 4.6],
  GB: [-3.4, 55.4],   FR: [2.2, 46.2],    DE: [10.5, 51.2],
  IT: [12.6, 41.9],   ES: [-3.7, 40.5],   NL: [5.3, 52.1],
  SE: [18.6, 60.1],   PL: [19.1, 51.9],   RU: [105.3, 61.5],
  TR: [35.2, 38.9],   SA: [45.1, 23.9],   AE: [53.8, 23.4],
  IL: [34.9, 31.0],
  JP: [138.3, 36.2],  KR: [127.8, 35.9],  CN: [104.2, 35.9],
  IN: [79.1, 20.6],   ID: [113.9, -0.8],  TH: [100.9, 15.9],
  SG: [103.8, 1.4],   TW: [121.0, 23.7],  PH: [121.8, 12.9],
  MY: [108.0, 4.2],
  AU: [133.8, -25.3], NZ: [174.9, -40.9],
  ZA: [25.1, -29.0],  NG: [8.7, 9.1],     EG: [30.8, 26.8],
};

// Continent colors for pills
const CONTINENT_COLOR: Record<string, string> = {
  "North America": "#60a5fa",
  "South America": "#34d399",
  "Europe":        "#a78bfa",
  "Middle East":   "#f59e0b",
  "Asia":          "#f472b6",
  "Oceania":       "#22d3ee",
  "Africa":        "#fb923c",
};

// ---------------------------------------------------------------------------
// Heat color scale  blue(0) → amber(50) → red(100)
// ---------------------------------------------------------------------------

function heatColor(intensity: number): string {
  const t = Math.max(0, Math.min(1, intensity / 100));
  let r: number, g: number, b: number;
  if (t < 0.5) {
    const s = t * 2;
    r = Math.round(30 + s * 225);
    g = Math.round(100 + s * 80);
    b = Math.round(200 - s * 200);
  } else {
    const s = (t - 0.5) * 2;
    r = 255;
    g = Math.round(180 - s * 160);
    b = 0;
  }
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// SVG dot-pattern definitions
// ---------------------------------------------------------------------------

const DOT_STEP = 6;   // spacing between dot centres (px in pattern space)
const DOT_R_HEAT = 2; // radius for heat dots
const DOT_R_LAND = 1.4; // radius for untracked land

interface PatternDefsProps {
  signals: CountrySignal[];
}

function PatternDefs({ signals }: PatternDefsProps) {
  return (
    <defs>
      {/* Untracked land silhouette */}
      <pattern
        id="dots-land"
        x="0" y="0"
        width={DOT_STEP} height={DOT_STEP}
        patternUnits="userSpaceOnUse"
      >
        <circle cx={DOT_STEP / 2} cy={DOT_STEP / 2} r={DOT_R_LAND} fill="#1e3352" />
      </pattern>

      {/* One pattern per tracked country */}
      {signals.map((s) => (
        <pattern
          key={s.country_code}
          id={`dots-${s.country_code}`}
          x="0" y="0"
          width={DOT_STEP} height={DOT_STEP}
          patternUnits="userSpaceOnUse"
        >
          <circle
            cx={DOT_STEP / 2}
            cy={DOT_STEP / 2}
            r={DOT_R_HEAT}
            fill={heatColor(s.market_intensity)}
          />
        </pattern>
      ))}
    </defs>
  );
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

interface TooltipState {
  x: number;
  y: number;
  signal: CountrySignal;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GeoHeatmap() {
  const { gameName } = useGame();
  const { data: signals = [], isLoading } = useGeoSignals(
    gameName ? { game_name: gameName } : {},
  );

  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [hoveredContinent, setHoveredContinent] = useState<string | null>(null);

  // Map from country code → signal for O(1) lookup inside Geography loop
  const signalByCode = useMemo(
    () => Object.fromEntries(signals.map((s) => [s.country_code, s])),
    [signals],
  );

  const continents = useMemo(
    () => [...new Set(signals.map((s) => s.continent))].sort(),
    [signals],
  );

  const maxIntensity = useMemo(
    () => Math.max(1, ...signals.map((s) => s.market_intensity)),
    [signals],
  );

  // Filter visible signals when a continent pill is active
  const visibleCodes = useMemo(
    () =>
      new Set(
        hoveredContinent
          ? signals.filter((s) => s.continent === hoveredContinent).map((s) => s.country_code)
          : signals.map((s) => s.country_code),
      ),
    [signals, hoveredContinent],
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Globe className="h-4 w-4 text-primary" />
            Global Market Intensity
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Composite score: top-advertiser Share-of-Voice × active advertiser count
            {gameName ? ` · scoped to ${gameName}'s category` : " · Puzzle (default)"}
          </p>
        </div>

        {/* Heat legend */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Low</span>
          <svg width={80} height={10}>
            <defs>
              <linearGradient id="heat-legend-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor={heatColor(0)} />
                <stop offset="50%"  stopColor={heatColor(50)} />
                <stop offset="100%" stopColor={heatColor(100)} />
              </linearGradient>
            </defs>
            <rect x={0} y={2} width={80} height={6} rx={3} fill="url(#heat-legend-grad)" />
          </svg>
          <span className="text-[10px] text-muted-foreground">High</span>
        </div>
      </div>

      {/* Continent filter pills */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setHoveredContinent(null)}
          className="rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors"
          style={{
            borderColor: hoveredContinent === null ? "#94a3b8" : "#334155",
            color: hoveredContinent === null ? "#94a3b8" : "#475569",
            background: hoveredContinent === null ? "rgba(148,163,184,0.1)" : "transparent",
          }}
        >
          All
        </button>
        {continents.map((c) => (
          <button
            key={c}
            onClick={() => setHoveredContinent(hoveredContinent === c ? null : c)}
            className="rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors"
            style={{
              borderColor: CONTINENT_COLOR[c] ?? "#64748b",
              color:
                hoveredContinent === null || hoveredContinent === c
                  ? (CONTINENT_COLOR[c] ?? "#64748b")
                  : "#475569",
              background:
                hoveredContinent === c
                  ? `${CONTINENT_COLOR[c]}22`
                  : "transparent",
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Map */}
      <div className="relative rounded-xl border border-border bg-[#060d18] overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#060d18]/80">
            <span className="text-xs text-muted-foreground animate-pulse">
              Querying 34 markets…
            </span>
          </div>
        )}

        <ComposableMap
          projectionConfig={{ scale: 147, center: [10, 10] }}
          style={{ width: "100%", height: "auto" }}
        >
          <PatternDefs signals={signals} />

          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const code = NUMERIC_TO_CODE[geo.id as string];
                const signal = code ? signalByCode[code] : undefined;
                const tracked = !!signal;
                const dimmed = tracked && !visibleCodes.has(code!);

                const fillId = tracked && !dimmed
                  ? `dots-${code}`
                  : "dots-land";

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={`url(#${fillId})`}
                    stroke="#0a1628"
                    strokeWidth={0.4}
                    style={{
                      default: { outline: "none", opacity: dimmed ? 0.25 : 1 },
                      hover:   { outline: "none", opacity: tracked ? 0.85 : 0.7 },
                      pressed: { outline: "none" },
                    }}
                  />
                );
              })
            }
          </Geographies>

          {/* Markers — circle + country code label at centroid */}
          {signals.map((s) => {
            const coords = CENTROIDS[s.country_code];
            if (!coords) return null;
            const dimmed = !visibleCodes.has(s.country_code);
            const r = 3 + (s.market_intensity / maxIntensity) * 5;

            return (
              <Marker
                key={s.country_code}
                coordinates={coords}
                onMouseEnter={(e: React.MouseEvent) => {
                  const rect = (e.currentTarget as SVGElement)
                    .closest("svg")!
                    .getBoundingClientRect();
                  setTooltip({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                    signal: s,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                <circle
                  r={r}
                  fill={dimmed ? "transparent" : heatColor(s.market_intensity)}
                  stroke={dimmed ? "transparent" : "rgba(0,0,0,0.4)"}
                  strokeWidth={0.8}
                  opacity={dimmed ? 0 : 0.9}
                  style={{ cursor: "pointer", transition: "opacity 0.3s" }}
                />
                {!dimmed && s.market_intensity >= 15 && (
                  <text
                    y={-r - 2}
                    textAnchor="middle"
                    fontSize={6}
                    fill="#cbd5e1"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {s.country_code}
                  </text>
                )}
              </Marker>
            );
          })}
        </ComposableMap>

        {/* Floating tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-20 rounded-lg border border-white/10 bg-[#0f1525]/95 px-3 py-2 text-xs shadow-lg"
            style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
          >
            <p className="font-semibold text-white">{tooltip.signal.country_name}</p>
            <p className="mb-1 text-[10px] text-slate-400">{tooltip.signal.continent}</p>
            <div className="space-y-0.5 tabular-nums">
              <div className="flex justify-between gap-6">
                <span className="text-slate-400">Intensity</span>
                <span
                  className="font-bold"
                  style={{ color: heatColor(tooltip.signal.market_intensity) }}
                >
                  {tooltip.signal.market_intensity.toFixed(0)}
                </span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-slate-400">Advertisers</span>
                <span>{tooltip.signal.num_advertisers}</span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-slate-400">Top SoV</span>
                <span>{(tooltip.signal.top_sov * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Country table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Country</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Continent</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Advertisers</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Top SoV</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Intensity</th>
            </tr>
          </thead>
          <tbody>
            {[...signals]
              .filter((s) => hoveredContinent === null || s.continent === hoveredContinent)
              .sort((a, b) => b.market_intensity - a.market_intensity)
              .map((s) => (
                <tr
                  key={s.country_code}
                  className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-1.5 font-medium">
                    <span className="mr-2 font-mono text-muted-foreground">{s.country_code}</span>
                    {s.country_name}
                  </td>
                  <td className="px-4 py-1.5">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px]"
                      style={{
                        background: `${CONTINENT_COLOR[s.continent] ?? "#64748b"}22`,
                        color: CONTINENT_COLOR[s.continent] ?? "#64748b",
                      }}
                    >
                      {s.continent}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{s.num_advertisers}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">
                    {(s.top_sov * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${s.market_intensity}%`,
                            background: heatColor(s.market_intensity),
                          }}
                        />
                      </div>
                      <span
                        className="w-6 text-right font-mono font-semibold"
                        style={{ color: heatColor(s.market_intensity) }}
                      >
                        {s.market_intensity.toFixed(0)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
