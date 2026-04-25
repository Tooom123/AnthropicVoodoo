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
import { Clock, DollarSign, Sigma } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useReport, useReportList } from "@/lib/api";
import { useGame } from "@/lib/game-context";
import { ArchetypesTable } from "@/components/insights/ArchetypesTable";
import { BriefsGrid } from "@/components/insights/BriefsGrid";
import { GameDnaCard } from "@/components/insights/GameDnaCard";
import { GameFitGrid } from "@/components/insights/GameFitGrid";
import { PitchStoryBlock } from "@/components/insights/PitchStoryBlock";
import { ReportPicker } from "@/components/insights/ReportPicker";
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading HookLens report…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <p className="text-sm font-medium text-destructive">
          Failed to load report: {(error as Error).message}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Check that the API server is running at{" "}
          <code>http://localhost:8000</code>.
        </p>
      </div>
    );
  }

  if (!report) {
    return (
      <Card className="border-border bg-card p-8">
        <h3 className="text-lg font-semibold">
          No cached HookLens report for &ldquo;{gameName || "—"}&rdquo;
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          The full pipeline (Game DNA → archetypes → game-fit → briefs →
          Scenario) is too slow (3–5 min) to run synchronously. Pre-cache it
          locally first:
        </p>
        <pre className="mt-3 rounded-md bg-muted px-4 py-3 text-xs">
          uv run python -m scripts.precache{" "}
          {JSON.stringify(gameName || "Marble Sort!")}
        </pre>
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
        <ReportPicker
          reports={reportList}
          currentName={report.target_game.name}
          onPick={setGameName}
        />
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
    </div>
  );
}
