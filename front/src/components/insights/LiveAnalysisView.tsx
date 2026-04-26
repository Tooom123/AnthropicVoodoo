/**
 * LiveAnalysisView — progressive partial-report rendering during a run.
 *
 * When the user clicks the running ActiveRunRow on /insights, we land
 * here. The pipeline streams step payloads via SSE
 * (``pipeline-runs-context``); each step's ``data`` lands in
 * ``run.stepData[step_id]``. This component reads that buffer and
 * renders the matching report sections as they become available —
 * mirroring the "sections appear as they finish" feel the user loved
 * in the Streamlit prototype.
 *
 * Render order matches the pipeline:
 *   1. target_meta → header (icon + name + app_id)
 *   2. game_dna    → GameDnaCard
 *   3-5. top_advertisers / raw_creatives / deconstructed → progress chips
 *   6. archetypes  → ArchetypesTable
 *   7. fit_scores  → GameFitGrid
 *   8. briefs      → BriefsGrid
 *   9. variants    → VariantsGallery
 *  10. report      → final HookLensReport, replaces everything
 *
 * On done/error, falls back to the cached report path (the parent
 * Insights component re-routes via setGameName).
 */
import { useMemo } from "react";
import { Sparkles, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArchetypesTable } from "./ArchetypesTable";
import { BriefsGrid } from "./BriefsGrid";
import { GameDnaCard } from "./GameDnaCard";
import { GameFitGrid } from "./GameFitGrid";
import { VariantsGallery } from "./VariantsGallery";
import {
  STEP_ORDER,
  buildPartialReport,
  summarizeSteps,
  usePipelineRuns,
  type ActiveRun,
  type StepState,
} from "@/lib/pipeline-runs-context";
import type {
  CreativeArchetype,
  GameFitScore,
  GeneratedVariant,
  HookLensReport,
} from "@/types/hooklens";

interface LiveAnalysisViewProps {
  /** The active run (already verified by parent to be live for this view). */
  run: ActiveRun;
  /** Called when user clicks "← All analyses" — clears gameName. */
  onBackToList: () => void;
}

export function LiveAnalysisView({ run, onBackToList }: LiveAnalysisViewProps) {
  const { openDialog } = usePipelineRuns();
  const partial = useMemo(
    () => buildPartialReport(run.stepData),
    [run.stepData],
  );
  const { completed, total, pct } = summarizeSteps(run.steps);

  // Each section renders only when its data has arrived. Cast where
  // needed — the runtime shape is enforced by Pydantic on the backend.
  const targetGame = partial.target_game as
    | HookLensReport["target_game"]
    | undefined;
  const archetypes = partial.top_archetypes as
    | CreativeArchetype[]
    | undefined;
  const fitScores = partial.game_fit_scores as GameFitScore[] | undefined;
  const variants = partial.final_variants as GeneratedVariant[] | undefined;

  // Best-effort minimal report shim for components that demand a full
  // HookLensReport prop (GameDnaCard, GameFitGrid). Only used when
  // target_game has landed.
  const minimalReport = targetGame
    ? ({
        target_game: targetGame,
        market_context: {
          category_id: "",
          category_name: "",
          countries: run.config?.countries ?? [],
          networks: run.config?.networks ?? [],
          period_start: "",
          period_end: "",
          num_advertisers_scanned: 0,
          num_creatives_analyzed: 0,
          num_phashion_groups: 0,
        },
        top_archetypes: archetypes ?? [],
        game_fit_scores: fitScores ?? [],
        final_variants: variants ?? [],
        pipeline_duration_seconds: 0,
        total_cost_usd: 0,
        generated_at: "",
      } as HookLensReport)
    : null;

  return (
    <div className="space-y-5">
      {/* Header — wide live status banner. Click "View progress" to
          reopen the step-by-step dialog. */}
      <Card
        className={`border p-4 ring-1 ${
          run.phase === "running"
            ? "border-primary/40 bg-primary/5 ring-primary/20"
            : run.phase === "done"
              ? "border-emerald-500/40 bg-emerald-500/5 ring-emerald-500/20"
              : "border-destructive/40 bg-destructive/5 ring-destructive/20"
        }`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-card ring-1 ring-border">
            {run.phase === "running" && (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            )}
            {run.phase === "done" && (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            )}
            {run.phase === "error" && (
              <AlertCircle className="h-4 w-4 text-destructive" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold">
                Analyzing {run.gameName}
              </span>
              <span
                className={`rounded-full bg-card px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ring-1 ${
                  run.phase === "running"
                    ? "text-primary ring-primary/30"
                    : run.phase === "done"
                      ? "text-emerald-300 ring-emerald-500/30"
                      : "text-destructive ring-destructive/30"
                }`}
              >
                {run.phase === "running"
                  ? "Live"
                  : run.phase === "done"
                    ? "Completed"
                    : "Failed"}
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
              Step {Math.min(completed + 1, total)} / {total} · {pct}%
            </div>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all duration-500 ${
                  run.phase === "error" ? "bg-destructive" : "bg-primary"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={openDialog}>
              View step-by-step
            </Button>
            <Button size="sm" variant="ghost" onClick={onBackToList}>
              All analyses
            </Button>
          </div>
        </div>
      </Card>

      {/* Section 1 — Game DNA. First non-trivial piece of content. */}
      {minimalReport ? (
        <GameDnaCard report={minimalReport} />
      ) : (
        <SkeletonSection
          title="Game DNA"
          subtitle="Extracting genre, palette, mechanics from SensorTower screenshots…"
          stepLabel={
            STEP_ORDER.find((s) => run.steps[s.step_id]?.status === "running")
              ?.label
          }
        />
      )}

      {/* Sections 2-3 — top advertisers + raw creatives discovery
          (no dedicated component — show inline progress chips so the
          PM sees real numbers landing). */}
      <DiscoveryStripe run={run} />

      {/* Section 4 — Archetypes. The differentiator card. */}
      {archetypes && archetypes.length > 0 ? (
        <ArchetypesTable archetypes={archetypes} sourceCreatives={{}} />
      ) : run.steps["archetypes"]?.status === "running" ||
        (run.steps["deconstructed"]?.status === "done" &&
          run.steps["archetypes"]?.status !== "done") ? (
        <SkeletonSection
          title="Creative archetypes"
          subtitle="Clustering deconstructed videos into hook archetypes (Gemini → Sonnet)…"
        />
      ) : null}

      {/* Section 5 — Game-fit scores. */}
      {minimalReport && fitScores && fitScores.length > 0 ? (
        <GameFitGrid
          scores={fitScores}
          archetypes={archetypes ?? []}
        />
      ) : run.steps["fit_scores"]?.status === "running" ? (
        <SkeletonSection
          title="Game-fit scores"
          subtitle="Scoring each archetype against the target game (Opus)…"
        />
      ) : null}

      {/* Section 6 — Briefs. Don't render BriefsGrid until variants land
          since variants are what carry the brief inside, but show a
          status hint while briefs are being authored. */}
      {variants && variants.length > 0 ? (
        <BriefsGrid variants={variants} />
      ) : run.steps["briefs"]?.status === "running" ||
        (run.steps["briefs"]?.status === "done" &&
          run.steps["variants"]?.status !== "done") ? (
        <SkeletonSection
          title="Creative briefs"
          subtitle="Authoring per-archetype briefs adapted to the game (Opus)…"
        />
      ) : null}

      {/* Section 7 — Variants gallery (visuals). */}
      {variants && variants.length > 0 ? (
        <VariantsGallery variants={variants} />
      ) : run.steps["variants"]?.status === "running" ? (
        <SkeletonSection
          title="Visual variants"
          subtitle="Generating hero frames + storyboards via Scenario…"
        />
      ) : null}
    </div>
  );
}

/** Tiny placeholder card shown for sections whose pipeline step is in
 *  flight or about to start. Prevents a jumpy layout. */
function SkeletonSection({
  title,
  subtitle,
  stepLabel,
}: {
  title: string;
  subtitle?: string;
  stepLabel?: string;
}) {
  return (
    <Card className="border-dashed border-border bg-card/40 p-5">
      <div className="flex items-start gap-3">
        <Loader2 className="mt-0.5 h-3.5 w-3.5 animate-spin text-muted-foreground/70" />
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground/80">
              {subtitle}
            </p>
          )}
          {stepLabel && (
            <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">
              Currently: {stepLabel}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Small numbers strip showing the discovery counts (advertisers /
 *  creatives / deconstructions) as they land, before the archetype
 *  step produces its richer card. */
function DiscoveryStripe({ run }: { run: ActiveRun }) {
  const adv = run.steps["top_advertisers"]?.summary as
    | { count?: number }
    | undefined;
  const raw = run.steps["raw_creatives"]?.summary as
    | { count?: number }
    | undefined;
  const dec = run.steps["deconstructed"]?.summary as
    | { count?: number }
    | undefined;
  const cells: { label: string; value: number | null; state: StepState }[] =
    [
      {
        label: "Top advertisers",
        value: adv?.count ?? null,
        state: run.steps["top_advertisers"],
      },
      {
        label: "Creatives pulled",
        value: raw?.count ?? null,
        state: run.steps["raw_creatives"],
      },
      {
        label: "Deconstructed",
        value: dec?.count ?? null,
        state: run.steps["deconstructed"],
      },
    ];

  // Only render once at least one of the three has started.
  const anyActive = cells.some(
    (c) => c.state?.status === "running" || c.state?.status === "done",
  );
  if (!anyActive) return null;

  return (
    <Card className="border-border bg-card/60 p-4">
      <header className="mb-3 flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary/70" />
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Market discovery
        </span>
      </header>
      <div className="grid grid-cols-3 gap-2">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className="rounded-md border border-border bg-card px-3 py-2"
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {cell.label}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-semibold tabular-nums">
                {cell.value ?? "—"}
              </span>
              {cell.state?.status === "running" && (
                <Loader2 className="h-3 w-3 animate-spin text-primary/70" />
              )}
              {cell.state?.status === "done" && (
                <CheckCircle2 className="h-3 w-3 text-emerald-400/70" />
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
