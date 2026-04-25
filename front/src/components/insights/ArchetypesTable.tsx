import { Radar, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { CreativeArchetype } from "@/types/hooklens";
import { SignalBar } from "./SignalBar";
import {
  PITCH_BADGE_CLASS,
  derivativeColor,
  derivativeSpreadPct,
  freshnessColor,
  freshnessPct,
  pitchLabel,
  velocityColor,
  velocityPct,
} from "./utils";

interface ArchetypesTableProps {
  archetypes: CreativeArchetype[];
}

export function ArchetypesTable({ archetypes }: ArchetypesTableProps) {
  if (!archetypes?.length) {
    return (
      <Card className="border-border bg-card p-6 text-sm text-muted-foreground">
        No archetypes detected for this game.
      </Card>
    );
  }

  const sorted = [...archetypes].sort(
    (a, b) => b.overall_signal_score - a.overall_signal_score,
  );

  return (
    <Card className="border-border bg-card p-0 overflow-hidden">
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Radar className="h-3.5 w-3.5" /> Detected archetypes
          </div>
          <h3 className="mt-1 text-base font-semibold">
            Non-obvious market signals
          </h3>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Each archetype is scored on three composed signals: <b>velocity</b>{" "}
            (share growth), <b>derivative spread</b> (advertiser copy-rate) and{" "}
            <b>freshness</b> (mean creative age). The composite{" "}
            <i>overall_signal_score</i> ranks them.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Archetypes
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            {archetypes.length}
          </div>
        </div>
      </header>

      <div className="divide-y divide-border">
        {sorted.map((arch, i) => (
          <ArchetypeRow key={arch.archetype_id} arch={arch} rank={i + 1} />
        ))}
      </div>
    </Card>
  );
}

function ArchetypeRow({
  arch,
  rank,
}: {
  arch: CreativeArchetype;
  rank: number;
}) {
  const pitch = arch.centroid_hook.emotional_pitch;
  return (
    <div
      className={`grid grid-cols-1 gap-5 px-5 py-4 lg:grid-cols-[1.4fr_1fr_auto] ${
        rank === 1 ? "bg-primary/[0.04]" : ""
      }`}
    >
      <div>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground">
            {rank}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold leading-tight">
                {arch.label}
              </h4>
              <span
                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${PITCH_BADGE_CLASS[pitch]}`}
              >
                {pitchLabel(pitch)}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {arch.member_creative_ids.length} creative
                {arch.member_creative_ids.length === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-1 text-xs italic text-muted-foreground line-clamp-2">
              {arch.centroid_hook.summary}
            </p>
            {arch.palette_hex.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5">
                {arch.palette_hex.map((hex, idx) => (
                  <span
                    key={`${hex}-${idx}`}
                    className="h-4 w-4 rounded-sm border border-border/60"
                    style={{ background: hex }}
                    title={hex}
                    aria-label={`palette swatch ${hex}`}
                  />
                ))}
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                  {arch.palette_hex.join(" · ")}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <SignalBar
          label="Velocity"
          value={arch.velocity_score}
          pct={velocityPct(arch.velocity_score)}
          color={velocityColor(arch.velocity_score)}
          formatValue={(v) => `${v.toFixed(2)}×`}
          ariaLabel={`Velocity ${arch.velocity_score.toFixed(2)} times`}
        />
        <SignalBar
          label="Derivative spread"
          value={arch.derivative_spread}
          pct={derivativeSpreadPct(arch.derivative_spread)}
          color={derivativeColor(arch.derivative_spread)}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          ariaLabel={`Derivative spread ${Math.round(arch.derivative_spread * 100)} percent`}
        />
        <SignalBar
          label={`Freshness (${Math.round(arch.freshness_days)}d)`}
          value={arch.freshness_days}
          pct={freshnessPct(arch.freshness_days)}
          color={freshnessColor(arch.freshness_days)}
          formatValue={(v) => `${Math.round(v)}d`}
          ariaLabel={`Freshness ${Math.round(arch.freshness_days)} days`}
        />
      </div>

      <div className="flex flex-col items-start lg:items-end">
        <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          <TrendingUp className="h-3 w-3" /> Overall
        </div>
        <div
          className="mt-0.5 text-3xl font-semibold tabular-nums"
          style={{
            color:
              arch.overall_signal_score >= 1.5
                ? "#34d399"
                : arch.overall_signal_score >= 0.8
                  ? "#fbbf24"
                  : "#9ca3af",
          }}
        >
          {arch.overall_signal_score.toFixed(2)}
        </div>
        <span className="text-[10px] text-muted-foreground">
          0.4·v + 0.35·d + 0.25·(1/f)
        </span>
      </div>

      {arch.rationale && (
        <details className="group lg:col-span-3">
          <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground">
            Rationale
          </summary>
          <p className="mt-1 text-xs leading-relaxed text-foreground/80">
            {arch.rationale}
          </p>
        </details>
      )}
    </div>
  );
}
