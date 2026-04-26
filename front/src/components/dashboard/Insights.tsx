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
import { useEffect, useState } from "react";
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
import {
  RunAnalysisDialog,
  type PipelineRunConfig,
} from "@/components/insights/RunAnalysisDialog";
import { VariantsGallery } from "@/components/insights/VariantsGallery";
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

  // Two-step flow: configure (LaunchAnalysisModal) → run (RunAnalysisDialog).
  const [configOpen, setConfigOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [pendingRun, setPendingRun] = useState<{
    gameName: string;
    config: PipelineRunConfig;
  } | null>(null);

  // Navbar "Launch new analysis" → /insights?launch=1 → auto-open modal.
  useEffect(() => {
    if (autoLaunch) setConfigOpen(true);
  }, [autoLaunch]);

  const trimmedGame = gameName.trim();

  // Stable game name for the run dialog: prefer the canonical resolved name
  // from a loaded report; else what the user actually picked in the modal.
  const dialogGameName =
    pendingRun?.gameName ?? report?.target_game.name ?? trimmedGame;

  function openConfigForReRun() {
    // Pre-fill the modal with the loaded report's params (or sensible defaults).
    setConfigOpen(true);
  }

  function handleLaunch(name: string, config: PipelineRunConfig) {
    setPendingRun({ gameName: name, config });
    setConfigOpen(false);
    setRunOpen(true);
  }

  // Hoisted above early returns so the modal/dialog stay mounted across
  // loading → empty → loaded transitions (otherwise re-mount auto-fires
  // a duplicate run when the report becomes available).
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
      <RunAnalysisDialog
        open={runOpen}
        onOpenChange={setRunOpen}
        gameName={dialogGameName}
        config={pendingRun?.config}
        onComplete={(name) => {
          setGameName(name);
          setPendingRun(null);
        }}
      />
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
    return (
      <>
        <div className="space-y-6">
          {/* Top CTA card */}
          <Card className="border-border bg-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">
                  {gameName
                    ? `No cached HookLens report for "${gameName}"`
                    : "Run a HookLens analysis"}
                </h3>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  The full pipeline — Game DNA · market archetypes · game-fit ·
                  Opus-authored briefs · Scenario visuals — takes ~3–5 min and
                  ~$0.05–1 in API calls. Default scan is worldwide × all
                  networks for the broadest signal.
                </p>
              </div>
              <Button onClick={() => setConfigOpen(true)} size="lg">
                <Sparkles className="mr-1.5 h-4 w-4" />
                Launch new analysis
              </Button>
            </div>
          </Card>

          {/* Recent analyses — the actionable history. Each card loads the
              cached report instantly when clicked. Sorted most-recent first
              by the backend (/api/reports). */}
          {reportList.length > 0 ? (
            <div>
              <header className="mb-3 flex items-center gap-2">
                <History className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Recent analyses · {reportList.length}
                </span>
              </header>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {reportList.map((r) => (
                  <RecentAnalysisCard
                    key={r.app_id}
                    entry={r}
                    onPick={() => setGameName(r.name)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <Card className="border-border bg-card p-6">
              <p className="text-sm text-muted-foreground">
                No cached analyses yet. Click "Launch new analysis" above to
                run the first one.
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
      <PitchStoryBlock report={report} />

      {modals}
    </div>
  );
}

interface RecentAnalysisCardProps {
  entry: {
    app_id: string;
    name: string;
    num_archetypes: number;
    num_variants: number;
    total_cost_usd: number;
    duration_seconds: number;
    generated_at: string | null;
  };
  onPick: () => void;
}

/**
 * One row in the "Recent analyses" grid on the Insights landing.
 *
 * Surfaces the metadata a PM cares about when triaging which past
 * report to revisit: name + when it was generated + how rich it is
 * (archetypes / variants count) + how much it cost. Clicking the
 * whole card loads the report into the Insights view.
 */
function RecentAnalysisCard({ entry, onPick }: RecentAnalysisCardProps) {
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

  return (
    <button
      type="button"
      onClick={onPick}
      className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-md hover:shadow-primary/5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-tight">
            {entry.name}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {generated}
            {ageLabel && (
              <span className="ml-1 text-muted-foreground/70">· {ageLabel}</span>
            )}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
      </div>
      <div className="flex flex-wrap gap-1.5 text-[10px]">
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
            {Math.round(entry.duration_seconds / 60)}m {Math.round(entry.duration_seconds % 60)}s
          </span>
        )}
      </div>
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
