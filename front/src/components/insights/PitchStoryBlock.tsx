import { Megaphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { HookLensReport } from "@/types/hooklens";

interface PitchStoryBlockProps {
  report: HookLensReport;
}

/**
 * Renders the auto-generated French pitch paragraph that frames the demo
 * voiceover. Splits each paragraph on `**...**` so we can render markdown
 * bold inline without pulling in a parser.
 */
export function PitchStoryBlock({ report }: PitchStoryBlockProps) {
  const ctx = report.market_context;
  const top = [...report.top_archetypes].sort(
    (a, b) => b.overall_signal_score - a.overall_signal_score,
  )[0];
  const bestFit = [...report.game_fit_scores].sort(
    (a, b) => b.overall - a.overall,
  )[0];
  const chosenVariant = [...report.final_variants].sort(
    (a, b) => a.test_priority - b.test_priority,
  )[0];

  if (!top || !bestFit || !chosenVariant) {
    return null;
  }

  const palette = report.target_game.palette;
  const network = ctx.networks[0] ?? "TikTok";
  const country = ctx.countries[0] ?? "US";

  const paragraphs: string[] = [
    `Sur **${report.target_game.name}**, on a scanné **${ctx.num_advertisers_scanned} advertisers** ${ctx.category_name} sur ${network} (${country}) sur la période, et déconstruit **${ctx.num_creatives_analyzed} creatives** via Gemini 2.5 Pro.`,
    `Le breakout du moment est **« ${top.label} »** : ${top.member_creative_ids.length} creatives, ${Math.round(top.derivative_spread * 100)}% d'advertisers uniques, âge moyen **${Math.round(top.freshness_days)} jours** — c'est le hook qui se fait copier en ce moment, pas un hit établi.`,
    `On a scoré ce hook contre la Game DNA de **${report.target_game.name}** avec Claude Opus 4.7 → **${bestFit.overall}/100** (visual=${bestFit.visual_match}, mechanic=${bestFit.mechanic_match}, audience=${bestFit.audience_match}). Voici la creative tailored qu'on a générée avec Scenario : **« ${chosenVariant.brief.title} »** — palette \`${palette.primary_hex}\`/\`${palette.secondary_hex}\`, CTA **« ${chosenVariant.brief.cta} »**.`,
    `Test priority #${chosenVariant.test_priority}, prête pour Meta Ads / TikTok lundi matin.`,
  ];

  return (
    <Card className="overflow-hidden border-border border-l-4 border-l-primary bg-card p-6">
      <div className="flex items-center gap-2">
        <Megaphone className="h-4 w-4 text-primary" />
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Demo pitch · auto-generated
        </span>
      </div>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/90">
        {paragraphs.map((p, i) => (
          <p key={i}>
            <RenderRichText text={p} />
          </p>
        ))}
      </div>
    </Card>
  );
}

/**
 * Tiny inline parser: alternates plain text with `**bold**` segments and
 * inline `\`code\`` segments. No nested markdown, no escaping — that's
 * fine for our deterministic template.
 */
function RenderRichText({ text }: { text: string }) {
  const tokens = tokenize(text);
  return (
    <>
      {tokens.map((tok, i) => {
        if (tok.kind === "bold") {
          return (
            <strong key={i} className="font-semibold text-foreground">
              {tok.value}
            </strong>
          );
        }
        if (tok.kind === "code") {
          return (
            <code
              key={i}
              className="rounded bg-muted px-1 py-0.5 font-mono text-[12px] text-foreground"
            >
              {tok.value}
            </code>
          );
        }
        return <span key={i}>{tok.value}</span>;
      })}
    </>
  );
}

type Token =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "code"; value: string };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ kind: "text", value: text.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) {
      tokens.push({ kind: "bold", value: match[1] });
    } else if (match[2] !== undefined) {
      tokens.push({ kind: "code", value: match[2] });
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    tokens.push({ kind: "text", value: text.slice(lastIndex) });
  }
  return tokens;
}
