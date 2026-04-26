import { Download, FileText, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { GeneratedVariant } from "@/types/hooklens";

interface BriefsGridProps {
  variants: GeneratedVariant[];
}

export function BriefsGrid({ variants }: BriefsGridProps) {
  if (!variants?.length) {
    return (
      <Card className="border-border bg-card p-6 text-sm text-muted-foreground">
        No creative briefs were generated.
      </Card>
    );
  }

  // Always show at most 3 briefs (the top test priorities). 4+ would
  // shrink each card too aggressively and dilute the "tested in order"
  // narrative — the PM only ships 1-3 variants per game anyway.
  const sorted = [...variants]
    .sort((a, b) => a.test_priority - b.test_priority)
    .slice(0, 3);
  const totalAvailable = variants.length;

  // Adaptive grid: 1 → full width, 2 → halves, 3+ → thirds. Keeps a
  // single brief from feeling abandoned in a narrow column and prevents
  // a 5-variant report from cramming too tightly.
  const colsClass =
    sorted.length === 1
      ? "grid-cols-1"
      : sorted.length === 2
        ? "grid-cols-1 lg:grid-cols-2"
        : "grid-cols-1 lg:grid-cols-3";

  return (
    <section>
      <header className="mb-3 flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Creative briefs
        </span>
        <span className="text-xs text-muted-foreground">
          (top {sorted.length} variant{sorted.length === 1 ? "" : "s"}
          {totalAvailable > sorted.length
            ? ` of ${totalAvailable} generated`
            : ""}
          )
        </span>
      </header>
      <div className={`grid gap-4 ${colsClass}`}>
        {sorted.map((v) => (
          <BriefCard key={v.brief.archetype_id} variant={v} />
        ))}
      </div>
    </section>
  );
}

function downloadBrief(variant: GeneratedVariant) {
  const json = JSON.stringify(variant.brief, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const slug = variant.brief.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  a.download = `${slug || variant.brief.archetype_id}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function BriefCard({ variant }: { variant: GeneratedVariant }) {
  const { brief } = variant;

  return (
    <Card className="flex h-full flex-col gap-4 border-border bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            #{variant.test_priority} test priority
          </div>
          <h3 className="mt-0.5 text-base font-semibold leading-snug">
            {brief.title}
          </h3>
          <div className="mt-1 font-mono text-[10px] text-muted-foreground">
            {brief.archetype_id}
          </div>
        </div>
        <Badge
          className="shrink-0 bg-violet-500 text-white shadow-none hover:bg-violet-500/90"
          aria-label={`Call to action ${brief.cta}`}
        >
          {brief.cta}
        </Badge>
      </div>

      <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-primary">
          <Lightbulb className="h-3 w-3" /> Hook · 0–3s
        </div>
        <p className="mt-1 text-sm leading-relaxed text-foreground">
          {brief.hook_3s}
        </p>
      </div>

      {brief.scene_flow.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Scene flow
          </div>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-foreground/85">
            {brief.scene_flow.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        </div>
      )}

      {brief.text_overlays.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Text overlays
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {brief.text_overlays.map((t, i) => (
              <span
                key={`${t}-${i}`}
                className="inline-flex items-center rounded-md border border-border bg-background/60 px-2 py-0.5 text-[11px] text-foreground/90"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      <details className="rounded-md border border-border bg-background/40 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
          Visual direction & rationale
        </summary>
        <div className="mt-2 space-y-2 text-xs leading-relaxed text-foreground/85">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Visual direction
            </div>
            <p className="mt-1">{brief.visual_direction}</p>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Rationale
            </div>
            <p className="mt-1">{brief.rationale}</p>
          </div>
        </div>
      </details>

      <details className="rounded-md border border-border bg-background/40 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
          Scenario prompts ({brief.scenario_prompts.length})
        </summary>
        <div className="mt-2 space-y-2">
          {brief.scenario_prompts.map((p, i) => (
            <pre
              key={i}
              className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-[11px] leading-relaxed text-foreground/80"
            >
              {p}
            </pre>
          ))}
        </div>
      </details>

      <div className="mt-auto pt-1">
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-2"
          onClick={() => downloadBrief(variant)}
        >
          <Download className="h-3.5 w-3.5" />
          Download brief (JSON)
        </Button>
      </div>
    </Card>
  );
}
