/**
 * HookLens Insights — full pipeline output rendered from /api/report.
 *
 * Composition (top → bottom):
 *   - <ReportPicker />                 ← optional dropdown of cached reports
 *   - <GameDnaCard />                  ← target game identity
 *   - <ArchetypesTable />              ← THE differentiator: 3 signal bars per archetype
 *   - <GameFitGrid />                  ← Opus-scored compatibility
 *   - <BriefsGrid />                   ← creative briefs (3 variants)
 *   - <VariantsGallery />              ← Scenario MCP hero + storyboard images
 *   - <PitchStoryBlock />              ← auto-generated French demo pitch
 *
 * Empty state: when no cached report exists, point user to:
 *   `uv run python -m scripts.precache "<game_name>"`
 */
import { useEffect, useRef, useState } from "react";
import {
  Clock,
  DollarSign,
  Sigma,
  Sparkles,
  RefreshCw,
  History,
  ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useReport,
  useReportList,
  useReportSourceCreatives,
} from "@/lib/api";
import { useGame } from "@/lib/game-context";
import { ArchetypesTable } from "@/components/insights/ArchetypesTable";
import { BriefsGrid } from "@/components/insights/BriefsGrid";
import { GameDnaCard } from "@/components/insights/GameDnaCard";
import { GameFitGrid } from "@/components/insights/GameFitGrid";
import { LaunchAnalysisModal } from "@/components/insights/LaunchAnalysisModal";
import { PitchStoryBlock } from "@/components/insights/PitchStoryBlock";
import { ReportPicker } from "@/components/insights/ReportPicker";
import { RunAnalysisDialog } from "@/components/insights/RunAnalysisDialog";
import type { PipelineRunConfig } from "@/lib/pipeline-runs-context";
import { usePipelineRuns } from "@/lib/pipeline-runs-context";
import { VariantsGallery } from "@/components/insights/VariantsGallery";
import { VideoAdCard } from "@/components/insights/VideoAdCard";
import {
  fmtCurrency,
  fmtDuration,
  formatGenerated,
} from "@/components/insights/utils";

interface InsightsProps {
  /**
   * When true (set by the route from ``?launch=1``), the page auto-opens
   * the LaunchAnalysisModal on first mount. Used by the navbar's "Launch
   * new analysis" CTA so the user lands here with the modal already up.
   */
  autoLaunch?: boolean;
}

export function Insights({ autoLaunch = false }: InsightsProps = {}) {
  const { gameName, setGameName } = useGame();
  const { data: report, isLoading, error } = useReport(gameName);
  const { data: reportList = [] } = useReportList();
  // Source thumbnails per archetype (raw SensorTower creatives that were
  // clustered) — fetched in parallel with the report; lets ArchetypesTable
  // surface real ad thumbnails next to the analytical text.
  const { data: sourceCreatives = {} } = useReportSourceCreatives(gameName);

  // Configure flow stays local; the run itself lives in the global
  // PipelineRunsContext so it survives navigation / closed dialogs.
  const [configOpen, setConfigOpen] = useState(false);
  const { startRun, openDialog, run } = usePipelineRuns();

  // Navbar "Launch new analysis" → /insights?launch=1 → auto-open modal.
  useEffect(() => {
    if (autoLaunch) setConfigOpen(true);
  }, [autoLaunch]);

  // Auto-load the freshly-cached report when a run completes — this is
  // what makes the Insights view switch from empty/old to the new report
  // without the user having to click anything.
  const lastDoneRef = useRef<string | null>(null);
  useEffect(() => {
    if (run?.phase === "done" && run.doneEvent) {
      const finishedId = `${run.id}:${run.doneEvent.app_id}`;
      if (lastDoneRef.current !== finishedId) {
        lastDoneRef.current = finishedId;
        setGameName(run.doneEvent.name);
      }
    }
  }, [run?.phase, run?.id, run?.doneEvent?.app_id, run?.doneEvent?.name, setGameName]);

  const trimmedGame = gameName.trim();

  function openConfigForReRun() {
    setConfigOpen(true);
  }

  function handleLaunch(name: string, config: PipelineRunConfig) {
    setConfigOpen(false);
    startRun(name, config);
    openDialog();
  }

  // Hoisted above early returns so the modal stays mounted across
  // loading → empty → loaded transitions.
  const modals = (
    <>
      <LaunchAnalysisModal
        open={configOpen}
        onOpenChange={setConfigOpen}
        initialGameName={trimmedGame || report?.target_game.name || ""}
        initialConfig={
          report
            ? {
                countries: report.market_context.countries,
                networks: report.market_context.networks,
              }
            : undefined
        }
        onLaunch={handleLaunch}
      />
      <RunAnalysisDialog />
    </>
  );

  if (isLoading) {
    return (
      <>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Loading HookLens report…</p>
        </div>
        {modals}
      </>
    );
  }

  if (error) {
    return (
      <>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
          <p className="text-sm font-medium text-destructive">
            Failed to load report: {(error as Error).message}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Check that the API server is running at{" "}
            <code>http://localhost:8000</code>.
          </p>
        </div>
        {modals}
      </>
    );
  }

  if (!report) {
    // Empty state — no game selected. The "Launch new analysis" CTA lives
    // in the navbar (always visible), so the page itself is now just the
    // Recent analyses list. Sorted most-recent first by /api/reports.
    return (
      <>
        <div className="space-y-4">
          {reportList.length > 0 ? (
            <>
              <header className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <History className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Recent analyses · {reportList.length}
                  </span>
                </div>
                {gameName && (
                  <span className="text-xs text-muted-foreground">
                    No cached report for{" "}
                    <span className="text-foreground">"{gameName}"</span> — pick
                    one below or click{" "}
                    <span className="text-primary">Launch new analysis</span>{" "}
                    in the top right.
                  </span>
                )}
              </header>
              <div className="space-y-1.5">
                {reportList.map((r) => (
                  <RecentAnalysisRow
                    key={r.app_id}
                    entry={r}
                    onPick={() => setGameName(r.name)}
                  />
                ))}
              </div>
            </>
          ) : (
            <Card className="border-border bg-card p-8 text-center">
              <Sparkles className="mx-auto h-6 w-6 text-muted-foreground/50" />
              <h3 className="mt-3 text-base font-semibold">
                No cached analyses yet
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Click{" "}
                <span className="font-medium text-foreground">
                  Launch new analysis
                </span>{" "}
                in the top-right navbar to run the first pipeline.
              </p>
            </Card>
          )}

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none hover:text-foreground">
              Or pre-cache from CLI
            </summary>
            <pre className="mt-2 rounded-md bg-muted px-4 py-3">
              uv run python -m scripts.precache{" "}
              {JSON.stringify(gameName || "Mob Control")}
            </pre>
          </details>
        </div>
        {modals}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            <span className="text-foreground">
              {fmtDuration(report.pipeline_duration_seconds)}
            </span>
            pipeline
          </span>
          <span className="inline-flex items-center gap-1">
            <DollarSign className="h-3.5 w-3.5" />
            <span className="text-foreground">
              {fmtCurrency(report.total_cost_usd)}
            </span>
            spend
          </span>
          <span className="inline-flex items-center gap-1">
            <Sigma className="h-3.5 w-3.5" />
            <span className="text-foreground">
              {report.market_context.num_creatives_analyzed}
            </span>
            creatives ·{" "}
            <span className="text-foreground">
              {report.market_context.num_phashion_groups}
            </span>{" "}
            phashion groups
          </span>
          <span>· generated {formatGenerated(report.generated_at)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setConfigOpen(true)}
            title="Launch a new pipeline run with custom params"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Launch new analysis
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openConfigForReRun}
            title="Re-run the pipeline on this game (pre-fills its current scope)"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Re-run
          </Button>
          <ReportPicker
            reports={reportList}
            currentName={report.target_game.name}
            onPick={setGameName}
          />
        </div>
      </div>

      <GameDnaCard report={report} />
      <ArchetypesTable
        archetypes={report.top_archetypes}
        sourceCreatives={sourceCreatives}
      />
      <GameFitGrid
        scores={report.game_fit_scores}
        archetypes={report.top_archetypes}
      />
      <BriefsGrid variants={report.final_variants} />
      <VariantsGallery variants={report.final_variants} />
      <VideoAdCard gameName={report.target_game.name} />
      <PitchStoryBlock report={report} />

      {modals}
    </div>
  );
}

interface RecentAnalysisRowProps {
  entry: {
    app_id: string;
    name: string;
    num_archetypes: number;
    num_variants: number;
    total_cost_usd: number;
    duration_seconds: number;
    generated_at: string | null;
    icon_url?: string | null;
    publisher?: string | null;
  };
  onPick: () => void;
}

/**
 * One wide row in the "Recent analyses" list on the Insights landing.
 *
 * Layout (left → right): app icon · game name + publisher · generated
 * date + relative age · archetypes/variants/cost/runtime chips · chevron.
 * Clicking anywhere loads the cached report into the Insights view.
 */
function RecentAnalysisRow({ entry, onPick }: RecentAnalysisRowProps) {
  const [iconErr, setIconErr] = useState(false);
  const generated = entry.generated_at
    ? new Date(entry.generated_at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
  const ageMs = entry.generated_at
    ? Date.now() - new Date(entry.generated_at).getTime()
    : null;
  const ageLabel = formatRelativeAge(ageMs);
  const showIcon = entry.icon_url && !iconErr;

  return (
    <button
      type="button"
      onClick={onPick}
      className="group flex w-full items-center gap-4 rounded-md border border-border bg-card px-4 py-3 text-left transition-all hover:border-primary/50 hover:bg-card/80"
    >
      {/* Icon */}
      <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border">
        {showIcon ? (
          <img
            src={entry.icon_url ?? undefined}
            alt={entry.name}
            loading="lazy"
            onError={() => setIconErr(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted-foreground/40">
            <Sparkles className="h-4 w-4" />
          </div>
        )}
      </div>

      {/* Name + publisher */}
      <div className="min-w-0 flex-shrink-0 sm:w-56">
        <div className="truncate text-sm font-semibold leading-tight">
          {entry.name}
        </div>
        {entry.publisher && (
          <div className="truncate text-[11px] text-muted-foreground">
            by {entry.publisher}
          </div>
        )}
      </div>

      {/* Generated date */}
      <div className="hidden min-w-0 flex-shrink-0 text-[11px] text-muted-foreground md:block md:w-48">
        <div className="truncate tabular-nums">{generated}</div>
        {ageLabel && (
          <div className="truncate text-muted-foreground/70">{ageLabel}</div>
        )}
      </div>

      {/* Stats chips */}
      <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5 text-[10px]">
        <span className="rounded bg-muted/60 px-1.5 py-0.5 font-medium text-muted-foreground">
          {entry.num_archetypes} archetypes
        </span>
        <span className="rounded bg-muted/60 px-1.5 py-0.5 font-medium text-muted-foreground">
          {entry.num_variants} variants
        </span>
        {entry.total_cost_usd > 0 && (
          <span className="rounded bg-muted/60 px-1.5 py-0.5 font-medium text-muted-foreground">
            ${entry.total_cost_usd.toFixed(2)}
          </span>
        )}
        {entry.duration_seconds > 0 && (
          <span className="rounded bg-muted/60 px-1.5 py-0.5 font-medium text-muted-foreground">
            {Math.round(entry.duration_seconds / 60)}m{" "}
            {Math.round(entry.duration_seconds % 60)}s
          </span>
        )}
      </div>

      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
    </button>
  );
}

function formatRelativeAge(ms: number | null): string {
  if (ms == null) return "";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  return `${w}w ago`;
}
