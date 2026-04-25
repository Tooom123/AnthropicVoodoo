import { useMemo, useState } from "react";
import { useGame } from "@/lib/game-context";
import { useGeoSignals, type CountrySignal } from "@/lib/api";
import { Globe } from "lucide-react";

// ---------------------------------------------------------------------------
// Map dimensions & projection
// ---------------------------------------------------------------------------

const W = 900;
const H = 440;
const LAT_MIN = -60;
const LAT_MAX = 78;
const LNG_MIN = -175;
const LNG_MAX = 180;

function mercatorY(lat: number): number {
  const r = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + r / 2));
}

const Y_MAX = mercatorY(LAT_MAX);
const Y_MIN = mercatorY(LAT_MIN);

function project(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * W;
  const my = mercatorY(lat);
  const y = ((Y_MAX - my) / (Y_MAX - Y_MIN)) * H;
  return { x, y };
}

// ---------------------------------------------------------------------------
// Dot-grid generation
// ---------------------------------------------------------------------------

const STEP_LNG = 3.5;
const STEP_LAT = 2.8;
const DOT_R = 2.6;

interface GridDot {
  x: number;
  y: number;
  signal: CountrySignal | null;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  // returns distance in degrees (approx, good enough for radius lookup)
  const dLat = lat1 - lat2;
  const dLng = (lng1 - lng2) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function buildGrid(signals: CountrySignal[]): GridDot[] {
  const dots: GridDot[] = [];
  for (let lat = LAT_MIN; lat <= LAT_MAX; lat += STEP_LAT) {
    for (let lng = LNG_MIN; lng <= LNG_MAX; lng += STEP_LNG) {
      const { x, y } = project(lat, lng);
      let nearest: CountrySignal | null = null;
      let minDist = Infinity;

      for (const s of signals) {
        const d = haversine(lat, lng, s.lat, s.lng);
        if (d < s.radius && d < minDist) {
          minDist = d;
          nearest = s;
        }
      }
      dots.push({ x, y, signal: nearest });
    }
  }
  return dots;
}

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
    r = Math.round(255);
    g = Math.round(180 - s * 160);
    b = Math.round(0);
  }
  return `rgb(${r},${g},${b})`;
}

// Continent accent colors for the legend
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
// Tooltip
// ---------------------------------------------------------------------------

interface TooltipState {
  x: number;
  y: number;
  signal: CountrySignal;
}

function Tooltip({ tip }: { tip: TooltipState }) {
  const { signal, x, y } = tip;
  const flip = x > W * 0.7;
  const left = flip ? x - 180 : x + 14;
  const top = Math.min(y - 10, H - 120);

  return (
    <foreignObject x={left} y={top} width={172} height={110} style={{ pointerEvents: "none" }}>
      <div
        style={
          {
            background: "rgba(15,15,25,0.92)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            padding: "8px 11px",
            fontFamily: "Inter, system-ui, sans-serif",
            color: "#fff",
          } as React.CSSProperties
        }
      >
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>{signal.country_name}</p>
        <p style={{ margin: "2px 0 6px", fontSize: 10, color: "#94a3b8" }}>{signal.continent}</p>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
          <span style={{ color: "#94a3b8" }}>Intensity</span>
          <span style={{ fontWeight: 700, color: heatColor(signal.market_intensity) }}>
            {signal.market_intensity.toFixed(0)}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
          <span style={{ color: "#94a3b8" }}>Advertisers</span>
          <span>{signal.num_advertisers}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
          <span style={{ color: "#94a3b8" }}>Top SoV</span>
          <span>{(signal.top_sov * 100).toFixed(1)}%</span>
        </div>
      </div>
    </foreignObject>
  );
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

  const dots = useMemo(() => buildGrid(signals), [signals]);

  // Country label positions (centroid projected)
  const labels = useMemo(
    () =>
      signals.map((s) => ({
        ...project(s.lat, s.lng),
        signal: s,
      })),
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
              <linearGradient id="heat-legend" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor={heatColor(0)} />
                <stop offset="50%"  stopColor={heatColor(50)} />
                <stop offset="100%" stopColor={heatColor(100)} />
              </linearGradient>
            </defs>
            <rect x={0} y={2} width={80} height={6} rx={3} fill="url(#heat-legend)" />
          </svg>
          <span className="text-[10px] text-muted-foreground">High</span>
        </div>
      </div>

      {/* Continent filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {continents.map((c) => (
          <button
            key={c}
            onClick={() => setHoveredContinent(hoveredContinent === c ? null : c)}
            className="rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors"
            style={{
              borderColor: CONTINENT_COLOR[c] ?? "#64748b",
              color: hoveredContinent === null || hoveredContinent === c
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
      <div className="relative rounded-xl border border-border bg-[#0a0f1a] overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a0f1a]/80">
            <span className="text-xs text-muted-foreground animate-pulse">
              Querying {34} markets…
            </span>
          </div>
        )}

        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: "block" }}
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Dot grid */}
          {dots.map((dot, i) => {
            const hasSignal = dot.signal !== null;
            const dimmed =
              hoveredContinent !== null &&
              hasSignal &&
              dot.signal!.continent !== hoveredContinent;

            const color = hasSignal
              ? dimmed
                ? "#1e293b"
                : heatColor(dot.signal!.market_intensity)
              : "#111827";

            const opacity = hasSignal ? (dimmed ? 0.3 : 1) : 0.45;

            return (
              <circle
                key={i}
                cx={dot.x}
                cy={dot.y}
                r={hasSignal ? DOT_R + (dot.signal!.market_intensity / maxIntensity) * 1.4 : DOT_R * 0.7}
                fill={color}
                opacity={opacity}
                style={{ transition: "fill 0.4s, opacity 0.3s, r 0.4s" }}
              />
            );
          })}

          {/* Country interaction targets (invisible larger circles) */}
          {labels.map(({ x, y, signal }) => {
            const dimmed =
              hoveredContinent !== null && signal.continent !== hoveredContinent;
            return (
              <circle
                key={signal.country_code}
                cx={x}
                cy={y}
                r={14}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => !dimmed && setTooltip({ x, y, signal })}
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })}

          {/* Country code labels on high-intensity dots */}
          {labels.map(({ x, y, signal }) => {
            if (signal.market_intensity < 20) return null;
            const dimmed =
              hoveredContinent !== null && signal.continent !== hoveredContinent;
            return (
              <text
                key={`lbl-${signal.country_code}`}
                x={x}
                y={y - DOT_R - 3}
                textAnchor="middle"
                fontSize={7}
                fill={dimmed ? "#334155" : "#94a3b8"}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {signal.country_code}
              </text>
            );
          })}

          {/* Tooltip */}
          {tooltip && <Tooltip tip={tooltip} />}
        </svg>
      </div>

      {/* Country list table */}
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
              .filter(
                (s) => hoveredContinent === null || s.continent === hoveredContinent,
              )
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
                        className="w-6 text-right font-mono font-semibold tabular-nums"
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
