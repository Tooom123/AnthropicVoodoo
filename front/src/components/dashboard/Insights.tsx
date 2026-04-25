/**
 * HookLens Insights — full pipeline output rendered from /api/report.
 *
 * THIS FILE IS A PLACEHOLDER — the full implementation is being built by a
 * sub-agent. Expected sub-components:
 *   - <GameDnaCard report={report} />
 *   - <ArchetypesTable archetypes={report.top_archetypes} />
 *     (with the 3 NON-OBVIOUS signals as progress bars: velocity_score,
 *      derivative_spread, freshness_days)
 *   - <GameFitGrid scores={report.game_fit_scores} archetypes={report.top_archetypes} />
 *   - <BriefsGrid variants={report.final_variants} />
 *   - <VariantsGallery variants={report.final_variants} />
 *   - <PitchStoryBlock report={report} />
 *
 * Empty state: when no cached report exists, point user to:
 *   `uv run python -m scripts.precache "<game_name>"`
 */
import { useGame } from "@/lib/game-context";
import { useReport, useReportList } from "@/lib/api";

export function Insights() {
  const { gameName } = useGame();
  const { data: report, isLoading, error } = useReport(gameName);
  const { data: reportList } = useReportList();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading HookLens report...</p>
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
      <div className="rounded-lg border border-border bg-card p-8">
        <h3 className="text-lg font-semibold">
          No cached HookLens report for "{gameName}"
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          The full pipeline (Game DNA → archetypes → game-fit → briefs →
          Scenario) is too slow (3-5 min) to run synchronously. Pre-cache it
          locally first:
        </p>
        <pre className="mt-3 rounded-md bg-muted px-4 py-3 text-xs">
          uv run python -m scripts.precache {JSON.stringify(gameName)}
        </pre>
        {reportList && reportList.length > 0 && (
          <div className="mt-6">
            <p className="text-sm font-medium text-foreground">
              Or pick from {reportList.length} previously analyzed game(s):
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {reportList.map((r) => (
                <li key={r.app_id} className="text-muted-foreground">
                  • <span className="font-medium text-foreground">{r.name}</span>{" "}
                  ({r.num_archetypes} archetypes · {r.num_variants} variants)
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // TEMPORARY raw-JSON dump until sub-agent ships the rich components.
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="text-lg font-semibold">{report.target_game.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {report.target_game.core_loop}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-4 text-xs text-muted-foreground">
          <div>
            <p className="text-foreground">{report.top_archetypes.length}</p>
            <p>Archetypes</p>
          </div>
          <div>
            <p className="text-foreground">{report.final_variants.length}</p>
            <p>Variants</p>
          </div>
          <div>
            <p className="text-foreground">
              {report.market_context.num_creatives_analyzed}
            </p>
            <p>Creatives analyzed</p>
          </div>
        </div>
      </div>
      <details className="rounded-lg border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Raw HookLensReport JSON (placeholder — rich UI coming)
        </summary>
        <pre className="mt-3 overflow-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(report, null, 2)}
        </pre>
      </details>
    </div>
  );
}
