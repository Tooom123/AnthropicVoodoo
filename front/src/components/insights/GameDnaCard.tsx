import { Sparkles, Users, Palette as PaletteIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { HookLensReport } from "@/types/hooklens";

interface GameDnaCardProps {
  report: HookLensReport;
}

export function GameDnaCard({ report }: GameDnaCardProps) {
  const dna = report.target_game;
  if (!dna) return null;

  const swatches: { label: string; hex: string }[] = [
    { label: "Primary", hex: dna.palette.primary_hex },
    { label: "Secondary", hex: dna.palette.secondary_hex },
    { label: "Accent", hex: dna.palette.accent_hex },
  ];

  return (
    <Card className="border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Game DNA
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            {dna.name}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-medium">
              {dna.genre}
            </Badge>
            {dna.sub_genre && (
              <Badge variant="outline" className="font-medium">
                {dna.sub_genre}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              app_id <span className="font-mono">{dna.app_id}</span>
            </span>
          </div>
        </div>

        <div className="flex flex-col items-start gap-2">
          <div className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            <PaletteIcon className="h-3.5 w-3.5" /> Brand palette
          </div>
          <div className="flex items-center gap-2">
            {swatches.map((s) => (
              <div key={s.label} className="flex flex-col items-center">
                <span
                  className="h-9 w-9 rounded-md border border-border shadow-inner"
                  style={{ background: s.hex }}
                  title={`${s.label}: ${s.hex}`}
                  aria-label={`${s.label} ${s.hex}`}
                />
                <span className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {s.hex}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-3 max-w-3xl text-xs italic text-muted-foreground">
        {dna.palette.description}
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Core loop
          </div>
          <blockquote className="mt-1 rounded-md border-l-2 border-primary/60 bg-muted/30 px-3 py-2 text-sm leading-relaxed text-foreground">
            {dna.core_loop}
          </blockquote>

          <div className="mt-4 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Audience proxy
          </div>
          <p className="mt-1 text-sm italic text-foreground/90">
            {dna.audience_proxy}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Visual style
            </div>
            <span className="mt-1 inline-flex rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-300">
              {dna.visual_style}
            </span>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              UI mood
            </div>
            <span className="mt-1 inline-flex rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
              {dna.ui_mood}
            </span>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Character on screen
            </div>
            <span className="mt-1 text-xs font-medium">
              {dna.character_present ? "Yes" : "No"}
            </span>
          </div>
        </div>
      </div>

      {dna.key_mechanics.length > 0 && (
        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Key mechanics
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {dna.key_mechanics.map((m) => (
              <Badge key={m} variant="outline" className="font-mono text-[11px]">
                {m}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {dna.screenshot_signals.length > 0 && (
        <details className="group mt-5 rounded-md border border-border bg-background/40 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
            Screenshot signals ({dna.screenshot_signals.length})
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-foreground/80">
            {dna.screenshot_signals.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
