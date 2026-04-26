/**
 * GeneratedAdSection — final step of the report.
 *
 * Shows a variant selector (one chip per top variant) + a "Generate Ad"
 * CTA that fires the backend's parallel Scenario img2video pipeline.
 * The result is rendered inline as a 9:16 video player; the underlying
 * mp4 is also exposed for download / sharing.
 *
 * This is the section that delivers HookLens's promised output: an
 * actual ad video tailored to the publisher's game, not just a brief.
 *
 * Why a per-variant flow:
 *   The brief authoring step produces 1-3 variants, each with its own
 *   hero + 2 storyboards + per-frame prompts. Rendering each variant
 *   requires N parallel video calls; doing all variants automatically
 *   would burn ~$3-9 per report. So the PM picks ONE variant they like
 *   and clicks Generate — that single click fires 3 parallel calls,
 *   concats them, optionally appends the game's endcard, and returns
 *   the mp4 in 3-5 minutes.
 *
 * The PM can always come back and generate another variant; results
 * are cached on disk by (game, archetype_id) so re-clicks are instant.
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  Film,
  Loader2,
  Sparkles,
  Video,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRenderVariantVideo } from "@/lib/api";
import type { GeneratedVariant } from "@/types/hooklens";

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "http://localhost:8000";

interface GeneratedAdSectionProps {
  gameName: string;
  variants: GeneratedVariant[];
}

export function GeneratedAdSection({
  gameName,
  variants,
}: GeneratedAdSectionProps) {
  const sorted = useMemo(
    () =>
      [...variants]
        .sort((a, b) => a.test_priority - b.test_priority)
        .slice(0, 3),
    [variants],
  );

  const [selectedId, setSelectedId] = useState<string>(
    sorted[0]?.brief.archetype_id ?? "",
  );
  const selected =
    sorted.find((v) => v.brief.archetype_id === selectedId) ?? sorted[0];

  const render = useRenderVariantVideo();

  if (!selected) return null;

  const videoUrl = render.data?.video_url
    ? `${API_BASE}${render.data.video_url}`
    : null;

  function handleGenerate() {
    render.mutate({
      gameName,
      archetypeId: selected!.brief.archetype_id,
      includeEndcard: true,
    });
  }

  return (
    <section>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <Video className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Generated ad video
          </span>
          <Badge className="border border-pink-500/30 bg-pink-500/15 text-pink-300 shadow-none text-[10px]">
            Final output
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Pick a variant → fires 3 parallel Scenario img2video calls →
          concatenates the clips → appends the game's endcard if cached.
        </p>
      </header>

      <Card className="border-border bg-card overflow-hidden">
        {/* Variant chooser strip */}
        <div className="border-b border-border bg-muted/20 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Pick the variant to render
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {sorted.map((v) => {
              const isActive = v.brief.archetype_id === selected.brief.archetype_id;
              return (
                <button
                  key={v.brief.archetype_id}
                  type="button"
                  onClick={() => {
                    setSelectedId(v.brief.archetype_id);
                    render.reset();
                  }}
                  disabled={render.isPending}
                  className={`group flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-all ${
                    isActive
                      ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                      : "border-border bg-card hover:border-primary/30"
                  } ${render.isPending ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <img
                    src={v.hero_frame_path}
                    alt={`#${v.test_priority} hero`}
                    className="h-12 w-7 flex-shrink-0 rounded-sm object-cover ring-1 ring-border"
                    style={{ aspectRatio: "9 / 16" }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      Priority #{v.test_priority}
                      {isActive && <Check className="h-2.5 w-2.5 text-primary" />}
                    </div>
                    <div className="line-clamp-1 text-xs font-medium leading-tight">
                      {v.brief.title}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Render area — generate CTA, loading, video, error */}
        <div className="p-5">
          {!render.data && !render.isPending && !render.isError && (
            <GenerateCta selected={selected} onGenerate={handleGenerate} />
          )}

          {render.isPending && <RenderingState selected={selected} />}

          {render.isError && (
            <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">
                  Render failed
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {(render.error as Error)?.message ??
                    "Check the API server logs for details."}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={handleGenerate}
                >
                  Retry
                </Button>
              </div>
            </div>
          )}

          {render.data && videoUrl && (
            <RenderedVideo
              videoUrl={videoUrl}
              meta={render.data}
              variantTitle={selected.brief.title}
              onRegenerate={handleGenerate}
            />
          )}
        </div>
      </Card>
    </section>
  );
}

function GenerateCta({
  selected,
  onGenerate,
}: {
  selected: GeneratedVariant;
  onGenerate: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/10 py-10 px-6">
      <Film className="h-8 w-8 text-muted-foreground/60" />
      <div className="text-center">
        <p className="text-sm font-medium">
          Ready to render <span className="text-primary">{selected.brief.title}</span>
        </p>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          Three Scenario img2video jobs run in parallel from the hero +
          storyboard frames. Total wait ≈ 3-5 minutes. The first run
          burns Scenario credits; subsequent clicks on the same variant
          return instantly from disk cache.
        </p>
      </div>
      <Button onClick={onGenerate} size="lg" className="gap-2">
        <Sparkles className="h-4 w-4" />
        Generate Ad
      </Button>
    </div>
  );
}

function RenderingState({ selected }: { selected: GeneratedVariant }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-muted/10 py-12 px-6">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <div className="text-center">
        <p className="text-sm font-medium">
          Rendering <span className="text-primary">{selected.brief.title}</span>…
        </p>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          3 parallel Scenario img2video jobs, then ffmpeg concat. This
          typically takes 3-5 minutes — keep this tab open.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] text-muted-foreground">
        <span className="rounded-full border border-border bg-card/60 px-2 py-0.5">
          ✓ Frames downloaded
        </span>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary">
          ⟳ Scenario img2video × 3
        </span>
        <span className="rounded-full border border-border bg-card/60 px-2 py-0.5">
          ◌ ffmpeg concat
        </span>
      </div>
    </div>
  );
}

function RenderedVideo({
  videoUrl,
  meta,
  variantTitle,
  onRegenerate,
}: {
  videoUrl: string;
  meta: {
    cached: boolean;
    duration_s: number;
    clips: number;
    endcard_appended: boolean;
    stub: boolean;
  };
  variantTitle: string;
  onRegenerate: () => void;
}) {
  return (
    <div className="space-y-4">
      {meta.stub && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
          <p className="text-xs text-amber-200">
            One or more clips fell back to a placeholder (Scenario auth
            missing or job timed out). Add credits and click Regenerate.
          </p>
        </div>
      )}

      <div className="flex flex-col items-center">
        <video
          key={videoUrl}
          src={videoUrl}
          controls
          autoPlay
          loop
          muted
          playsInline
          className="w-full max-w-xs rounded-xl border border-border bg-black"
          style={{ aspectRatio: "9 / 16" }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 text-[10px]">
        <Chip>
          <Check className="mr-0.5 h-2.5 w-2.5" />
          {meta.cached ? "From cache" : "Freshly rendered"}
        </Chip>
        <Chip>{meta.clips} clips concatenated</Chip>
        <Chip>≈ {meta.duration_s.toFixed(1)}s</Chip>
        {meta.endcard_appended && (
          <Chip className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            + {variantTitle.slice(0, 1)}
            {variantTitle.slice(1, 3).toLowerCase()} endcard
          </Chip>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <a href={videoUrl} download>
          <Button size="sm" variant="outline" className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Download mp4
          </Button>
        </a>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRegenerate}
          className="gap-1.5"
        >
          Regenerate
        </Button>
      </div>
    </div>
  );
}

function Chip({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border bg-card px-2 py-0.5 font-medium text-muted-foreground ${
        className || "border-border"
      }`}
    >
      {children}
    </span>
  );
}
