import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  Play,
  ExternalLink,
  Star,
  Bookmark,
  Flag,
  Sparkles,
  Check,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  Mic,
  MicOff,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Download,
  Mail,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TopNav } from "@/components/dashboard/TopNav";
import { NetworkBadge } from "@/components/dashboard/NetworkBadge";
import { SAMPLE_AD_DETAIL } from "@/data/adDetail";
import { getAdDetail } from "@/data/adDetails";

export const Route = createFileRoute("/ad/$id")({
  head: () => ({
    meta: [
      { title: "Ad Intelligence Detail — Voodoo" },
      {
        name: "description",
        content:
          "Deep creative, audience, market, pattern, community and strategic analysis for a single mobile game ad.",
      },
    ],
  }),
  component: AdDetailPage,
});

const TABS = [
  "Creative Analysis",
  "Audience Signals",
  "Market Context",
  "Pattern Breakdown",
  "Community Reaction",
  "Strategic Insights",
  "Creative Brief",
] as const;
type Tab = (typeof TABS)[number];

function AdDetailPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const ad = getAdDetail(id);
  const [tab, setTab] = useState<Tab>("Creative Analysis");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <main className="mx-auto max-w-[1200px] px-6 py-6">
        <button
          type="button"
          onClick={() => router.history.back()}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Library
        </button>

        <Hero ad={ad} />

        <div className="mt-6 flex flex-wrap gap-2">
          {TABS.map((t) => {
            const active = t === tab;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={
                  "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors " +
                  (active
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground")
                }
              >
                {t}
              </button>
            );
          })}
        </div>

        <div className="mt-6 space-y-6">
          {tab === "Creative Analysis" && <CreativeAnalysis ad={ad} />}
          {tab === "Audience Signals" && <AudienceSignals ad={ad} />}
          {tab === "Market Context" && <MarketContext ad={ad} />}
          {tab === "Pattern Breakdown" && <PatternBreakdown ad={ad} />}
          {tab === "Community Reaction" && <CommunityReaction ad={ad} />}
          {tab === "Strategic Insights" && <StrategicInsights ad={ad} />}
          {tab === "Creative Brief" && <CreativeBriefTab ad={ad} />}
        </div>
      </main>
    </div>
  );
}

/* ---------------- HERO ---------------- */

function Hero({ ad }: { ad: typeof SAMPLE_AD_DETAIL }) {
  const arc = (ad.score / 100) * 100;
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
      {/* Left 40% */}
      <div className="md:col-span-2">
        <div className="relative aspect-video w-full overflow-hidden rounded-md bg-gradient-to-br from-muted to-muted/40">
          <div className="absolute inset-0 grid place-items-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-background/40 backdrop-blur-sm">
              <Play className="h-6 w-6 fill-foreground text-foreground" />
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" className="gap-1.5">
            <Play className="h-3.5 w-3.5" /> Preview
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5">
            <ExternalLink className="h-3.5 w-3.5" /> Open source
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5">
            <Star className="h-3.5 w-3.5" /> Save as reference
          </Button>
        </div>
      </div>

      {/* Right 60% */}
      <div className="md:col-span-3">
        <div className="flex items-center gap-2">
          <div
            className="grid h-8 w-8 place-items-center rounded-md text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg,#c9a24a,#7a3a1f)" }}
          >
            CC
          </div>
          <div className="text-base font-semibold">{ad.game}</div>
          <span className="text-sm text-muted-foreground">— {ad.developer}</span>
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          {ad.id}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <NetworkBadge network={ad.network} />
          <span className="rounded-md border border-border bg-card px-2 py-0.5 text-xs">
            {ad.format}
          </span>
          <span className="rounded-md border border-border bg-card px-2 py-0.5 text-xs">
            {ad.countryFlag} {ad.country}
          </span>
          <span className="rounded-md border border-border bg-card px-2 py-0.5 text-xs">
            {ad.dateRange}
          </span>
        </div>

        <div className="mt-5 flex items-center gap-5">
          <ScoreArc value={ad.score} />
          <div>
            <div className="flex items-baseline gap-1">
              <div className="text-4xl font-semibold tracking-tight">{ad.score}</div>
              <div className="text-sm text-muted-foreground">/100</div>
            </div>
            <div className="text-xs text-muted-foreground">Proxy performance score</div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <Stat label="Run duration" value={`${ad.runDays} days`} />
          <Stat label="Est. impressions" value={ad.impressions} />
          <Stat label="Spend tier" value={ad.spendTier} />
        </div>

        <div className="hidden">{arc}</div>
      </div>
    </div>
  );
}

function ScoreArc({ value }: { value: number }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c * 0.75; // 3/4 arc
  return (
    <svg width="80" height="80" viewBox="0 0 80 80">
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.15"
        strokeWidth="4"
        strokeDasharray={`${c * 0.75} ${c}`}
        transform="rotate(135 40 40)"
        strokeLinecap="round"
      />
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        stroke="hsl(var(--primary, 217 92% 64%))"
        style={{ stroke: "var(--primary)" }}
        strokeWidth="4"
        strokeDasharray={`${c * 0.75} ${c}`}
        strokeDashoffset={offset - c * 0.25}
        transform="rotate(135 40 40)"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}

/* ---------------- TAB 1 ---------------- */

function CreativeAnalysis({ ad }: { ad: typeof SAMPLE_AD_DETAIL }) {
  const [active, setActive] = useState<string>(ad.timeline[0].key);
  const seg = ad.timeline.find((s) => s.key === active) ?? ad.timeline[0];
  const widths = [12, 40, 33, 15]; // proportional to 0-3 / 3-15 / 15-25 / 25-30

  return (
    <>
      <Card className="bg-card p-5">
        <SectionTitle title="Creative breakdown" subtitle="30-second structure analysis" />
        <div className="mt-4 flex h-12 w-full overflow-hidden rounded-md" style={{ gap: 4 }}>
          {ad.timeline.map((s, i) => {
            const isActive = s.key === active;
            const isFirst = i === 0;
            const isLast = i === ad.timeline.length - 1;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setActive(s.key)}
                className="relative flex h-full items-center justify-center text-xs font-medium text-white transition-opacity"
                style={{
                  width: `${widths[i]}%`,
                  background: s.color,
                  opacity: isActive ? 1 : 0.55,
                  borderTopLeftRadius: isFirst ? 8 : 0,
                  borderBottomLeftRadius: isFirst ? 8 : 0,
                  borderTopRightRadius: isLast ? 8 : 0,
                  borderBottomRightRadius: isLast ? 8 : 0,
                }}
              >
                <span className="px-2 truncate">
                  {s.key} · {s.range}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 rounded-md border border-border bg-background/40 p-4">
          <div className="text-sm font-medium" style={{ color: seg.color }}>
            {seg.key} · {seg.range} — {seg.label}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{seg.description}</p>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="bg-card p-5">
          <SectionTitle title="Hook analysis" />
          <div className="mt-3 space-y-3 text-sm">
            <Tag>{ad.hook.type}</Tag>
            <Field label="Emotional trigger" value={ad.hook.trigger} />
            <Field label="Hook strength" value={`${ad.hook.strength}/100`} />
            <p className="text-xs text-muted-foreground">{ad.hook.rationale}</p>
          </div>
        </Card>
        <Card className="bg-card p-5">
          <SectionTitle title="Visual codes" />
          <div className="mt-3 space-y-3 text-sm">
            <Tag>{ad.visual.style}</Tag>
            <div>
              <div className="text-xs text-muted-foreground">Dominant palette</div>
              <div className="mt-1.5 flex gap-2">
                {ad.visual.palette.map((c) => (
                  <div
                    key={c}
                    className="h-7 w-7 rounded-md border border-border"
                    style={{ background: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>
            <Field label="Pacing" value={ad.visual.pacing} />
            <Field label="Character presence" value={ad.visual.character} />
          </div>
        </Card>
        <Card className="bg-card p-5">
          <SectionTitle title="CTA breakdown" />
          <div className="mt-3 space-y-3 text-sm">
            <Field label="CTA text" value={`"${ad.cta.text}"`} />
            <Field label="Placement" value={ad.cta.placement} />
            <Tag>{ad.cta.style}</Tag>
            <Field label="CTA score" value={`${ad.cta.score}/100`} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="bg-card p-5">
          <SectionTitle title="On-screen copy" />
          <ul className="mt-3 space-y-2">
            {ad.copyLines.map((c) => (
              <li key={c.time} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {c.time}
                </span>
                <span className="text-foreground">{c.text}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="bg-card p-5">
          <SectionTitle title="Audio direction" />
          <p className="mt-3 text-sm text-foreground">{ad.audio.direction}</p>
          <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-background/40 px-3 py-2 text-sm">
            {ad.audio.voiceover ? (
              <Mic className="h-4 w-4 text-primary" />
            ) : (
              <MicOff className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-muted-foreground">Voiceover</span>
            <span className="ml-auto font-medium">
              {ad.audio.voiceover ? "Present" : "Absent"}
            </span>
          </div>
        </Card>
      </div>
    </>
  );
}

/* ---------------- TAB 2 ---------------- */

function AudienceSignals({ ad }: { ad: typeof SAMPLE_AD_DETAIL }) {
  const a = ad.audience;
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard label="Estimated reach" value={a.reach} />
        <MetricCard label="Primary audience" value={a.primary} />
        <MetricCard label="Engagement signal" value={a.engagement} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="bg-card p-5">
          <SectionTitle title="Audience targeting signals" />
          <div className="mt-4 space-y-3">
            {a.ageBars.map((b) => (
              <div key={b.label}>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{b.label}</span>
                  <span className="font-medium">{b.pct}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${b.pct * 2}%`, maxWidth: "100%" }}
                  />
                </div>
              </div>
            ))}
            <div className="pt-2">
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted-foreground">Gender split</span>
                <span className="font-medium">
                  M {a.genderMale}% · F {100 - a.genderMale}%
                </span>
              </div>
              <div className="flex h-2 w-full overflow-hidden rounded-full">
                <div className="h-full bg-[#4f8ef7]" style={{ width: `${a.genderMale}%` }} />
                <div className="h-full bg-[#a78bfa]" style={{ width: `${100 - a.genderMale}%` }} />
              </div>
            </div>
            <div className="pt-2">
              <div className="text-xs text-muted-foreground">Top geographies</div>
              <div className="mt-2 space-y-2">
                {a.geo.map((g) => (
                  <div key={g.country} className="flex items-center gap-2 text-sm">
                    <span>{g.flag}</span>
                    <span className="w-32 truncate">{g.country}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${g.pct * 2.5}%`, maxWidth: "100%" }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs text-muted-foreground">
                      {g.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card className="bg-card p-5">
          <SectionTitle title="Behavioral signals" />
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              {a.affinities.map((af) => (
                <div key={af.tag}>
                  <div className="flex justify-between text-xs">
                    <span>{af.tag}</span>
                    <span className="text-muted-foreground">{af.score}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${af.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Session intent</div>
              <div className="relative h-2 w-full rounded-full bg-muted">
                <div
                  className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-primary"
                  style={{ left: `calc(${a.intent}% - 6px)` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                <span>New users</span>
                <span>Re-engagement</span>
              </div>
            </div>
            <Field label="Placement context" value={a.placement} />
          </div>
        </Card>
      </div>
    </>
  );
}

/* ---------------- TAB 3 ---------------- */

function MarketContext({ ad }: { ad: typeof SAMPLE_AD_DETAIL }) {
  return (
    <>
      <Card className="bg-card p-5">
        <SectionTitle
          title="How this ad compares"
          subtitle="vs sub-genre average and category top performer"
        />
        <div className="mt-4 space-y-5">
          {ad.comparison.map((row) => {
            const max = Math.max(row.thisAd, row.categoryAvg, row.topPerformer);
            const bars = [
              { label: "This ad", v: row.thisAd, color: "var(--primary)" },
              { label: "Category avg", v: row.categoryAvg, color: "#6b7280" },
              { label: "Top performer", v: row.topPerformer, color: "#10b981" },
            ];
            return (
              <div key={row.metric}>
                <div className="mb-2 text-sm font-medium">{row.metric}</div>
                <div className="space-y-1.5">
                  {bars.map((b) => (
                    <div key={b.label} className="flex items-center gap-3">
                      <span className="w-28 text-xs text-muted-foreground">{b.label}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(b.v / max) * 100}%`, background: b.color }}
                        />
                      </div>
                      <span className="w-12 text-right text-xs font-medium">{b.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="bg-card p-5">
          <SectionTitle title="Similar ads running now" />
          <div className="mt-3 space-y-3">
            {ad.similar.map((s) => (
              <CompactAdRow key={s.id} ad={s} />
            ))}
          </div>
        </Card>

        <Card className="bg-card p-5">
          <SectionTitle title="Network context" />
          <div className="mt-3 space-y-3 text-sm">
            <Field label="Rank on Meta (CoC ads)" value={ad.network_context.rank} />
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted-foreground">Network saturation</span>
                <span className="font-medium">{ad.network_context.saturation} · High</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500"
                  style={{ width: `${ad.network_context.saturation}%` }}
                />
              </div>
            </div>
            <Field label="Best performing days" value={ad.network_context.bestDays} />
            <Field label="Format share" value={ad.network_context.formatShare} />
          </div>
        </Card>
      </div>
    </>
  );
}

function CompactAdRow({ ad }: { ad: { id: string; game: string; network: string; format: string; similarity: number; reason?: string } }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-background/40 p-2.5">
      <div className="grid h-12 w-16 place-items-center rounded bg-muted">
        <Play className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{ad.game}</div>
        <div className="truncate text-xs text-muted-foreground">
          {ad.network} · {ad.format} {ad.reason ? `· ${ad.reason}` : ""}
        </div>
      </div>
      <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
        {ad.similarity}% match
      </span>
    </div>
  );
}

/* ---------------- TAB 4 ---------------- */

function PatternBreakdown({ ad }: { ad: typeof SAMPLE_AD_DETAIL }) {
  return (
    <>
      <Card className="bg-card p-5">
        <SectionTitle title="Patterns detected in this ad" />
        <div className="mt-4 space-y-2">
          {ad.patterns.map((p) => (
            <div
              key={p.name}
              className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-background/40 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{p.name}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {p.category}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Used by {p.frequency} ads · avg score {p.avgScore}
                </div>
              </div>
              <DeltaPill value={p.delta} />
              <TrendPill trend={p.trend} />
            </div>
          ))}
        </div>
      </Card>

      <Card className="bg-card p-5">
        <SectionTitle
          title="Pattern performance matrix"
          subtitle="Frequency in corpus × average score. Highlighted dots are this ad's patterns."
        />
        <div className="mt-4 h-[320px] w-full">
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 16, right: 24, bottom: 24, left: 8 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                type="number"
                dataKey="frequency"
                domain={[0, 100]}
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                label={{ value: "Rare ← frequency in corpus → Common", position: "insideBottom", offset: -10, fill: "#6b7280", fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="score"
                domain={[40, 100]}
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                label={{ value: "Avg score", angle: -90, position: "insideLeft", fill: "#6b7280", fontSize: 11 }}
              />
              <ReferenceLine x={50} stroke="rgba(255,255,255,0.1)" />
              <ReferenceLine y={70} stroke="rgba(255,255,255,0.1)" />
              <RTooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Scatter
                data={ad.patternMatrix.filter((p) => !p.highlighted)}
                fill="#9ca3af"
                fillOpacity={0.2}
              />
              <Scatter data={ad.patternMatrix.filter((p) => p.highlighted)}>
                {ad.patternMatrix
                  .filter((p) => p.highlighted)
                  .map((p) => (
                    <Cell key={p.name} fill="var(--primary)" stroke="#fff" strokeWidth={1.5} />
                  ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
          <div>↖ Hidden gems</div>
          <div className="text-right">↗ Proven winners</div>
          <div>↙ Avoid</div>
          <div className="text-right">↘ Saturated</div>
        </div>
      </Card>

      <Card className="bg-card p-5">
        <SectionTitle title="Pattern combinations" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {ad.patternCombo.map((p, i) => (
            <span key={p} className="flex items-center gap-2">
              <span className="rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
                {p}
              </span>
              {i < ad.patternCombo.length - 1 && (
                <span className="text-muted-foreground">+</span>
              )}
            </span>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{ad.comboRationale}</p>
      </Card>
    </>
  );
}

function DeltaPill({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium " +
        (positive ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400")
      }
    >
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {positive ? "+" : ""}
      {value} vs avg
    </span>
  );
}

function TrendPill({ trend }: { trend: "Rising" | "Stable" | "Declining" }) {
  const map = {
    Rising: { Icon: TrendingUp, cls: "bg-emerald-500/15 text-emerald-400" },
    Stable: { Icon: Minus, cls: "bg-muted text-muted-foreground" },
    Declining: { Icon: TrendingDown, cls: "bg-rose-500/15 text-rose-400" },
  } as const;
  const { Icon, cls } = map[trend];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>
      <Icon className="h-3 w-3" />
      {trend}
    </span>
  );
}

/* ---------------- TAB 5 ---------------- */

function CommunityReaction({ ad }: { ad: typeof SAMPLE_AD_DETAIL }) {
  const s = ad.sentiment;
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard label="Overall sentiment" value={`${s.overall}/100 Positive`} />
        <MetricCard label="Reddit discussion volume" value={s.volume} />
        <MetricCard label="Top emotion detected" value={s.topEmotion} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="bg-card p-5">
          <SectionTitle title="Platform reactions" />
          <div className="mt-3 space-y-2">
            {s.platforms.map((p) => (
              <div
                key={p.platform}
                className="flex items-center gap-3 rounded-md border border-border bg-background/40 p-3"
              >
                <div className="w-20 text-sm font-medium">{p.platform}</div>
                <SentimentPill score={p.sentiment} />
                <div className="ml-auto truncate text-xs text-muted-foreground">{p.theme}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="bg-card p-5">
          <SectionTitle title="What players say about this ad type" />
          <div className="mt-3 space-y-3">
            {s.quotes.map((q) => (
              <div key={q.quote} className="rounded-md border border-border bg-background/40 p-3">
                <p className="text-sm italic text-foreground">"{q.quote}"</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                    {q.source}
                  </span>
                  <span
                    className={
                      "rounded px-1.5 py-0.5 " +
                      (q.sentiment === "Positive"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : q.sentiment === "Negative"
                          ? "bg-rose-500/15 text-rose-400"
                          : "bg-muted text-muted-foreground")
                    }
                  >
                    {q.sentiment}
                  </span>
                  <span className="rounded bg-primary/15 px-1.5 py-0.5 text-primary">
                    {q.theme}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="bg-card p-5">
        <SectionTitle title="Review themes related to this ad's promises" />
        <div className="mt-3 space-y-2">
          {s.reviewMatches.map((r) => (
            <div
              key={r.claim}
              className="flex items-start gap-3 rounded-md border border-border bg-background/40 p-3"
            >
              {r.match ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#10b981" }} />
              ) : (
                <X className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#f87171" }} />
              )}
              <div>
                <div className="text-sm font-medium">{r.claim}</div>
                <div className="text-xs text-muted-foreground">{r.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function SentimentPill({ score }: { score: number }) {
  const tone =
    score >= 70
      ? "bg-emerald-500/15 text-emerald-400"
      : score >= 50
        ? "bg-amber-500/15 text-amber-400"
        : "bg-rose-500/15 text-rose-400";
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone}`}>{score}/100</span>;
}

/* ---------------- TAB 6 ---------------- */

function StrategicInsights({ ad }: { ad: typeof SAMPLE_AD_DETAIL }) {
  const i = ad.insights;
  return (
    <>
      <Card
        className="bg-card p-5"
        style={{ borderLeft: "3px solid #4f8ef7" }}
      >
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
          <p className="text-sm text-foreground">{i.summary}</p>
        </div>
      </Card>

      <div className="space-y-4">
        <InsightCard
          color="#10b981"
          title="What works — steal this"
          tag="Reusable pattern"
          bullets={i.works}
          buttonIcon={<Bookmark className="h-3.5 w-3.5" />}
          buttonLabel="Add to swipe file"
        />
        <InsightCard
          color="#f59e0b"
          title="What to improve"
          tag="Optimization opportunity"
          bullets={i.improve}
          buttonIcon={<Flag className="h-3.5 w-3.5" />}
          buttonLabel="Flag for brief"
        />
        <InsightCard
          color="#4f8ef7"
          title="Differentiation angle"
          tag="Untapped territory"
          bullets={i.differentiate}
          buttonIcon={<Sparkles className="h-3.5 w-3.5" />}
          buttonLabel="Generate brief"
          accent
        />
      </div>

      <Card className="bg-card p-5">
        <SectionTitle title="Related ads to study" />
        <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
          {i.related.map((r) => (
            <Link
              key={r.id}
              to="/ad/$id"
              params={{ id: r.id }}
              className="block w-[230px] shrink-0 rounded-md border border-border bg-background/40 p-3 transition-colors hover:border-primary/50"
            >
              <div className="relative grid aspect-video w-full place-items-center rounded bg-muted">
                <Play className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="mt-2 truncate text-sm font-medium">{r.game}</div>
              <div className="truncate text-xs text-muted-foreground">
                {r.network} · {r.format}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                  {r.similarity}% match
                </span>
                <span className="truncate text-[11px] text-muted-foreground">{r.reason}</span>
              </div>
            </Link>
          ))}
        </div>
      </Card>

      <span className="hidden">
        <BarChart width={0} height={0}>
          <Bar dataKey="x" />
        </BarChart>
      </span>
    </>
  );
}

function InsightCard({
  color,
  title,
  tag,
  bullets,
  buttonIcon,
  buttonLabel,
  accent,
}: {
  color: string;
  title: string;
  tag: string;
  bullets: string[];
  buttonIcon: React.ReactNode;
  buttonLabel: string;
  accent?: boolean;
}) {
  return (
    <Card className="bg-card p-5" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium">{title}</h4>
            <span
              className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
              style={{ background: `${color}26`, color }}
            >
              {tag}
            </span>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            {bullets.map((b) => (
              <li key={b} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full" style={{ background: color }} />
                <span className="text-foreground/90">{b}</span>
              </li>
            ))}
          </ul>
        </div>
        <Button size="sm" variant={accent ? "default" : "outline"} className="gap-1.5 shrink-0">
          {buttonIcon}
          {buttonLabel}
        </Button>
      </div>
    </Card>
  );
}

/* ---------------- shared bits ---------------- */

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h3 className="text-[15px] font-medium text-foreground">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-md border border-border bg-background/40 px-2 py-0.5 text-xs font-medium">
      {children}
    </span>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </Card>
  );
}

/* ---------------- TAB 7 — CREATIVE BRIEF ---------------- */

function CreativeBriefTab({ ad }: { ad: typeof SAMPLE_AD_DETAIL }) {
  const b = ad.brief;
  return (
    <div className="space-y-10">
      {/* Section A — Market Analysis */}
      <div className="space-y-8">
        {/* Block 1 */}
        <BriefBlock title="Ad classification">
          <DefList
            items={[
              ["Genre reference", b.classification.genre],
              ["Ad archetype", b.classification.archetype],
              ["Narrative structure", b.classification.narrative],
              ["Tone", b.classification.tone],
              ["Production level", b.classification.production],
            ]}
          />
        </BriefBlock>

        {/* Block 2 */}
        <BriefBlock title="Performance snapshot — last 30 days">
          <div className="flex flex-wrap items-center gap-2">
            {b.snapshot.pills.map((p, i) => (
              <span key={p} className="flex items-center gap-2 text-sm">
                <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium">
                  {p}
                </span>
                {i < b.snapshot.pills.length - 1 && (
                  <span className="text-muted-foreground/50">|</span>
                )}
              </span>
            ))}
          </div>
          <p className="mt-4 text-sm leading-[1.7] text-[#d1d5db]">{b.snapshot.paragraph}</p>
        </BriefBlock>

        {/* Block 3 */}
        <BriefBlock title="Audience profile">
          <div className="grid grid-cols-1 gap-x-12 gap-y-4 md:grid-cols-2">
            <DefList items={b.audience.left.map((i) => [i.label, i.value])} />
            <DefList items={b.audience.right.map((i) => [i.label, i.value])} />
          </div>
        </BriefBlock>

        {/* Block 4 */}
        <BriefBlock title="Download & install signals">
          <ul className="space-y-2.5">
            {b.installSignals.map((s) => (
              <li key={s.text} className="flex items-center gap-3 text-sm">
                <TrendArrow trend={s.trend} />
                <span className="text-foreground">{s.text}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">{b.installContext}</p>
        </BriefBlock>

        {/* Block 5 */}
        <BriefBlock title="Keyword momentum — last 30 days">
          <ul className="divide-y divide-border/50">
            {b.searchKeywords.map((k) => (
              <li
                key={k.keyword}
                className="grid grid-cols-12 items-center gap-2 py-2.5 text-sm"
              >
                <span className="col-span-6 truncate text-foreground">{k.keyword}</span>
                <span className="col-span-2">
                  <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {k.source}
                  </span>
                </span>
                <span className="col-span-2 flex items-center gap-1.5 text-xs">
                  <KeywordTrend trend={k.trend} />
                </span>
                <span className="col-span-2 text-right text-xs text-muted-foreground">
                  {k.volume}
                </span>
              </li>
            ))}
          </ul>
        </BriefBlock>

        {/* Block 6 */}
        <BriefBlock title="Addiction & virality mechanics">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div>
              <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Retention hooks identified
              </div>
              <ul className="space-y-3">
                {b.retentionHooks.map((h) => (
                  <li key={h.name} className="flex gap-2.5 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <div>
                      <div className="font-medium text-foreground">{h.name}</div>
                      <div className="text-xs text-muted-foreground">{h.description}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Virality vectors
              </div>
              <ul className="space-y-3">
                {b.viralityVectors.map((v) => (
                  <li key={v.name} className="flex gap-2.5 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{v.name}</span>
                        <IntensityBadge intensity={v.intensity} />
                      </div>
                      <div className="text-xs text-muted-foreground">{v.description}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </BriefBlock>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[12px] uppercase tracking-[0.1em] text-muted-foreground">
          — Generated Concepts —
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Section B — Generated Concepts */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Card 1 — Image */}
        <ConceptCard
          badge="Static Ad"
          badgeColor="#8b5cf6"
          label="Ad Image Concept"
          subLabel="Single frame — Feed placement"
          image={b.concepts.image.src}
        >
          <div className="text-[15px] font-medium text-foreground mb-2">
            {b.concepts.image.title}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {b.concepts.image.description}
          </p>
          <ConceptTags tags={b.concepts.image.tags} />
          <ConceptFooter />
        </ConceptCard>

        {/* Card 2 — Storyboard */}
        <ConceptCard
          badge="Storyboard"
          badgeColor="#3b82f6"
          label="Video Storyboard"
          subLabel="30s — Rewarded video"
        >
          <div className="grid grid-cols-2 gap-2">
            {b.concepts.storyboard.panels.map((p, i) => (
              <div key={i} className="space-y-1">
                <img
                  src={p.src}
                  alt={`Panel ${i + 1}`}
                  className="aspect-video w-full rounded border border-border object-cover"
                />
                <div className="text-[10px] leading-snug text-muted-foreground">
                  {p.caption}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-[15px] font-medium text-foreground mb-2">
            {b.concepts.storyboard.title}
          </div>
          <ConceptTags tags={b.concepts.storyboard.tags} />
          <ConceptFooter />
        </ConceptCard>

        {/* Card 3 — Video */}
        <ConceptCard
          badge="Video Concept"
          badgeColor="#10b981"
          label="Video Ad Concept"
          subLabel="15s — Interstitial"
          image={b.concepts.video.src}
        >
          <div className="text-[15px] font-medium text-foreground mb-3">
            {b.concepts.video.title}
          </div>
          <div className="space-y-1.5 font-mono text-[12px] text-[#9ca3af]">
            {b.concepts.video.beats.map((bt) => (
              <div key={bt.time} className="flex gap-3">
                <span className="w-14 shrink-0">{bt.time}</span>
                <span>·</span>
                <span>{bt.text}</span>
              </div>
            ))}
          </div>
          <ConceptTags tags={b.concepts.video.tags} />
          <ConceptFooter />
        </ConceptCard>
      </div>

      {/* Bottom CTA Banner */}
      <Card
        className="p-5"
        style={{ background: "#1e2d4a", borderLeft: "3px solid #4f8ef7" }}
      >
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="text-base font-semibold text-foreground">
              Ready to build your brief?
            </div>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              These concepts are generated from the market patterns detected in this ad.
              Export them or use them to prompt your creative team.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Export as PDF
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              Send to team
            </Button>
            <Button size="sm" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Generate with AI
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function BriefBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="mb-3 text-[11px] font-medium uppercase text-muted-foreground"
        style={{ letterSpacing: "0.08em" }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function DefList({ items }: { items: [string, string][] }) {
  return (
    <dl className="space-y-2.5">
      {items.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[160px_1fr] gap-3 text-sm">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-medium text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function TrendArrow({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") return <ArrowUp className="h-4 w-4 shrink-0 text-[#10b981]" />;
  if (trend === "down") return <ArrowDown className="h-4 w-4 shrink-0 text-[#f87171]" />;
  return <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function KeywordTrend({ trend }: { trend: "rising" | "stable" | "declining" }) {
  if (trend === "rising")
    return (
      <>
        <ArrowUp className="h-3.5 w-3.5 text-[#10b981]" />
        <span className="text-[#10b981]">Rising</span>
      </>
    );
  if (trend === "declining")
    return (
      <>
        <ArrowDown className="h-3.5 w-3.5 text-[#f87171]" />
        <span className="text-[#f87171]">Declining</span>
      </>
    );
  return (
    <>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">Stable</span>
    </>
  );
}

function IntensityBadge({ intensity }: { intensity: "High" | "Medium" | "Low" }) {
  const color =
    intensity === "High" ? "#10b981" : intensity === "Medium" ? "#f59e0b" : "#6b7280";
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
      style={{ background: `${color}26`, color }}
    >
      {intensity}
    </span>
  );
}

function ConceptCard({
  badge,
  badgeColor,
  label,
  subLabel,
  image,
  children,
}: {
  badge: string;
  badgeColor: string;
  label: string;
  subLabel: string;
  image?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className="flex items-center gap-2 p-4"
        style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}
      >
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
          style={{ background: `${badgeColor}26`, color: badgeColor }}
        >
          {badge}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{label}</div>
          <div className="truncate text-[11px] text-muted-foreground">{subLabel}</div>
        </div>
      </div>
      {image && (
        <img src={image} alt={label} className="block aspect-video w-full object-cover" />
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

function ConceptTags({ tags }: { tags: string[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="rounded-md border border-border bg-background/40 px-2 py-0.5 text-[11px] font-medium"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function ConceptFooter() {
  return (
    <p className="mt-3 text-[11px] italic text-[#4b5563]">
      Generated concept — for reference only
    </p>
  );
}
