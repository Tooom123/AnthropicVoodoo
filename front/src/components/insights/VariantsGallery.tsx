import { AlertTriangle, ImageIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { GeneratedVariant } from "@/types/hooklens";

interface VariantsGalleryProps {
  variants: GeneratedVariant[];
}

const PRIORITY_BADGE_CLASS: Record<number, string> = {
  1: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  2: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  3: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

function isPlaceholder(url: string): boolean {
  return url.includes("picsum.photos");
}

export function VariantsGallery({ variants }: VariantsGalleryProps) {
  if (!variants?.length) {
    return (
      <Card className="border-border bg-card p-6 text-sm text-muted-foreground">
        No generated assets available.
      </Card>
    );
  }

  const sorted = [...variants].sort((a, b) => a.test_priority - b.test_priority);

  return (
    <section>
      <header className="mb-3 flex items-center gap-2">
        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Generated variants — Scenario MCP
        </span>
      </header>
      <div className="space-y-4">
        {sorted.map((v) => (
          <VariantRow key={v.brief.archetype_id} variant={v} />
        ))}
      </div>
    </section>
  );
}

function VariantRow({ variant }: { variant: GeneratedVariant }) {
  const { brief, hero_frame_path, storyboard_paths, test_priority } = variant;
  const allUrls = [hero_frame_path, ...storyboard_paths];
  const hasPlaceholder = allUrls.some(isPlaceholder);
  const priorityClass =
    PRIORITY_BADGE_CLASS[test_priority] ??
    "bg-muted text-muted-foreground border-border";

  return (
    <Card className="overflow-hidden border-border bg-card p-0">
      <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[auto_1fr]">
        <div className="flex flex-col gap-2">
          <div className="relative aspect-[9/16] w-44 overflow-hidden rounded-md border border-border bg-muted/40">
            <img
              src={hero_frame_path}
              alt={`Hero frame for ${brief.title}`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
            <span className="absolute left-2 top-2 rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm">
              Hero
            </span>
          </div>
          {storyboard_paths.length > 0 && (
            <div className="flex w-44 gap-1.5">
              {storyboard_paths.map((path, i) => (
                <div
                  key={path + i}
                  className="relative aspect-[9/16] flex-1 overflow-hidden rounded-md border border-border bg-muted/40"
                >
                  <img
                    src={path}
                    alt={`Storyboard frame ${i + 1} for ${brief.title}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <span className="absolute left-1 top-1 rounded bg-background/80 px-1 py-0.5 text-[9px] font-medium backdrop-blur-sm">
                    {i + 2}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start gap-3">
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${priorityClass}`}
            >
              #{test_priority} priority
            </span>
            <h3 className="text-base font-semibold leading-snug">
              {brief.title}
            </h3>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            {variant.test_priority_rationale}
          </p>

          <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
            <div className="text-[10px] uppercase tracking-wider text-primary">
              Hook · 0–3s
            </div>
            <p className="mt-1 text-sm leading-relaxed text-foreground">
              {brief.hook_3s}
            </p>
          </div>

          {hasPlaceholder && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Placeholder asset (Scenario timeout or missing creds) — re-run
                the precache to refresh the hero frame and storyboard.
              </span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
