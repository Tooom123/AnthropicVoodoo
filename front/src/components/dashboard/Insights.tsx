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
import { useReport, useReportList } from "@/lib/api";
import { useGame } from "@/lib/game-context";
import { ArchetypesTable } from "@/components/insights/ArchetypesTable";
import { BriefsGrid } from "@/components/insights/BriefsGrid";
import { GameDnaCard } from "@/components/insights/GameDnaCard";
import { GameFitGrid } from "@/components/insights/GameFitGrid";
import { PitchStoryBlock } from "@/components/insights/PitchStoryBlock";
import { ReportPicker } from "@/components/insights/ReportPicker";
import { RunAnalysisDialog } from "@/components/insights/RunAnalysisDialog";
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
  const [runOpen, setRunOpen] = useState(false);

  const trimmedGame = gameName.trim();
  const canRun = trimmedGame.length > 0;

  // Stable game name for the dialog. Prefer the canonical resolved name from a
  // loaded report (matches SensorTower's exact spelling, e.g. "Block Blast!");
  // fall back to the user-typed name otherwise. Hoisted above early returns so
  // the dialog component is mounted exactly once across loading / empty /
  // loaded states — switching branches must NOT remount the dialog mid-run.
  const dialogGameName = report?.target_game.name ?? trimmedGame;

  const dialog =
    canRun || report ? (
      <RunAnalysisDialog
        open={runOpen}
        onOpenChange={setRunOpen}
        gameName={dialogGameName}
        onComplete={(name) => setGameName(name)}
      />
    ) : null;

  if (isLoading) {
    return (
      <>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Loading HookLens report…</p>
        </div>
        {dialog}
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
        {dialog}
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
            Scenario) takes ~3–5 min and ~$0.05–1 in API calls.
          </p>
          {canRun && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={() => setRunOpen(true)} size="lg">
                <Sparkles className="mr-1.5 h-4 w-4" />
                Analyze {trimmedGame} now
              </Button>
              <span className="text-xs text-muted-foreground">
                runs the pipeline live · streams progress here
              </span>
            </div>
          )}
          <details className="mt-5 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none hover:text-foreground">
              Or pre-cache from CLI
            </summary>
            <pre className="mt-2 rounded-md bg-muted px-4 py-3">
              uv run python -m scripts.precache{" "}
              {JSON.stringify(gameName || "Marble Sort!")}
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
        {dialog}
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
            variant="outline"
            size="sm"
            onClick={() => setRunOpen(true)}
            title="Re-run the full pipeline (3-5 min)"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Re-run analysis
          </Button>
          <ReportPicker
            reports={reportList}
            currentName={report.target_game.name}
            onPick={setGameName}
          />
        </div>
      </div>

      <GameDnaCard report={report} />
      <ArchetypesTable archetypes={report.top_archetypes} />
      <GameFitGrid
        scores={report.game_fit_scores}
        archetypes={report.top_archetypes}
      />
      <BriefsGrid variants={report.final_variants} />
      <VariantsGallery variants={report.final_variants} />
      <PitchStoryBlock report={report} />

      {dialog}
    </div>
  );
}
