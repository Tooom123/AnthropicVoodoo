import { useState } from "react";
import {
  ExternalLink,
  Image as ImageIcon,
  Play,
  Radar,
  TrendingUp,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CreativeArchetype } from "@/types/hooklens";
import type { SourceCreative } from "@/lib/api";
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
  /**
   * Map of ``archetype_id → list of source ad creatives`` (raw SensorTower
   * creatives that were clustered into this archetype). Optional — the
   * table degrades gracefully when this is unavailable.
   */
  sourceCreatives?: Record<string, SourceCreative[]>;
}

export function ArchetypesTable({
  archetypes,
  sourceCreatives,
}: ArchetypesTableProps) {
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
          <ArchetypeRow
            key={arch.archetype_id}
            arch={arch}
            rank={i + 1}
            sources={sourceCreatives?.[arch.archetype_id] ?? []}
          />
        ))}
      </div>
    </Card>
  );
}

function ArchetypeRow({
  arch,
  rank,
  sources,
}: {
  arch: CreativeArchetype;
  rank: number;
  sources: SourceCreative[];
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
        {/* Sample-size disclosure. derivative_spread can read 100% on a
            cluster of 1 creative — we show the underlying creative count
            so a juror (or PM) can immediately tell whether the score is
            backed by a real pattern or an isolated outlier. */}
        <span
          className={`mt-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium tabular-nums ${
            arch.member_creative_ids.length >= 3
              ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20"
              : arch.member_creative_ids.length === 2
                ? "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20"
                : "bg-muted text-muted-foreground ring-1 ring-border"
          }`}
          title={
            arch.member_creative_ids.length === 1
              ? "Singleton — only one creative supports this archetype. Use with caution."
              : `Backed by ${arch.member_creative_ids.length} deconstructed creatives`
          }
        >
          n={arch.member_creative_ids.length} creative
          {arch.member_creative_ids.length === 1 ? "" : "s"}
        </span>
      </div>

      {sources.length > 0 && (
        <div className="lg:col-span-3">
          <SourceCreativesRow sources={sources} archLabel={arch.label} />
        </div>
      )}

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

interface SourceCreativesRowProps {
  sources: SourceCreative[];
  archLabel: string;
}

/**
 * 3-thumb strip of the actual ads that were clustered into this archetype.
 * Each thumb opens an inline mp4 preview Dialog when the creative is a
 * Video format.
 */
function SourceCreativesRow({ sources, archLabel }: SourceCreativesRowProps) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground">
        <span className="inline-flex items-center gap-1.5">
          <ImageIcon className="h-3 w-3" />
          Source creatives ({sources.length}) — click any to preview the mp4
        </span>
      </summary>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {sources.map((s, i) => (
          <SourceThumb key={s.creative_id || i} sample={s} archLabel={archLabel} />
        ))}
      </div>
    </details>
  );
}

interface SourceThumbProps {
  sample: SourceCreative;
  archLabel: string;
}

function SourceThumb({ sample, archLabel }: SourceThumbProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [errored, setErrored] = useState(false);
  const hasVideo = Boolean(sample.creative_url);
  const showImage = sample.thumb_url && !errored;

  return (
    <>
      <button
        type="button"
        onClick={() => hasVideo && setPreviewOpen(true)}
        disabled={!hasVideo}
        className="group/thumb relative h-32 w-[72px] flex-shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border transition-all hover:ring-primary/50"
        title={`${sample.advertiser_name ?? ""} · ${sample.network} · ${sample.first_seen_at ?? ""}`}
      >
        {showImage ? (
          <img
            src={sample.thumb_url ?? undefined}
            alt={`Creative for ${archLabel}`}
            loading="lazy"
            onError={() => setErrored(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted-foreground/40">
            <ImageIcon className="h-4 w-4" />
          </div>
        )}
        {hasVideo && (
          <div className="absolute inset-0 grid place-items-center bg-black/0 transition-colors group-hover/thumb:bg-black/40">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-background/80 opacity-0 transition-opacity group-hover/thumb:opacity-100">
              <Play className="h-3 w-3 fill-foreground text-foreground" />
            </div>
          </div>
        )}
        <span className="absolute bottom-0.5 left-0.5 rounded-sm bg-background/85 px-1 text-[8px] font-medium">
          {sample.network}
        </span>
      </button>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl overflow-hidden p-0">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle className="flex items-center justify-between gap-2">
              <span className="truncate">
                {sample.advertiser_name ?? "Source creative"}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  · {sample.network}
                  {sample.first_seen_at ? ` · ${sample.first_seen_at}` : ""} ·{" "}
                  {sample.ad_type}
                </span>
              </span>
              {sample.creative_url && (
                <a
                  href={sample.creative_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-normal text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  Open original
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="relative aspect-[9/16] max-h-[70vh] w-full bg-black">
            {sample.creative_url ? (
              <video
                key={sample.creative_url}
                src={sample.creative_url}
                controls
                autoPlay
                playsInline
                className="h-full w-full object-contain"
              />
            ) : sample.thumb_url ? (
              <img
                src={sample.thumb_url}
                alt=""
                className="h-full w-full object-contain"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
