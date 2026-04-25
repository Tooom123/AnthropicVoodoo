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
import { useState } from "react";
import { Clock, DollarSign, Sigma, Sparkles, RefreshCw } from "lucide-react";
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

export function Insights() {
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
        <Card className="border-border bg-card p-8">
          <h3 className="text-lg font-semibold">
            No cached HookLens report for &ldquo;{gameName || "—"}&rdquo;
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            The full pipeline (Game DNA → archetypes → game-fit → briefs →
            Scenario) takes ~3–5 min and ~$0.05–1 in API calls. Default scan
            is worldwide × all networks for the broadest signal.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => setConfigOpen(true)} size="lg">
              <Sparkles className="mr-1.5 h-4 w-4" />
              Launch new analysis
            </Button>
            <span className="text-xs text-muted-foreground">
              pick a Voodoo title or any mobile game · streams progress live
            </span>
          </div>
          <details className="mt-5 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none hover:text-foreground">
              Or pre-cache from CLI
            </summary>
            <pre className="mt-2 rounded-md bg-muted px-4 py-3">
              uv run python -m scripts.precache{" "}
              {JSON.stringify(gameName || "Mob Control")}
            </pre>
          </details>
          {reportList.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-medium text-foreground">
                Or pick from {reportList.length} previously analyzed game
                {reportList.length === 1 ? "" : "s"}:
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {reportList.map((r) => (
                  <li key={r.app_id}>
                    <button
                      type="button"
                      onClick={() => setGameName(r.name)}
                      className="text-left text-muted-foreground transition-colors hover:text-primary"
                    >
                      •{" "}
                      <span className="font-medium text-foreground">
                        {r.name}
                      </span>{" "}
                      ({r.num_archetypes} archetypes · {r.num_variants} variants)
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
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
