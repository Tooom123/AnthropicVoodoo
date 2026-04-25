/**
 * Voodoo Portfolio — grid of Voodoo's top mobile games, each with the live
 * ad creatives they're currently running on SensorTower-tracked networks.
 *
 * The data comes from `data/cache/voodoo/portfolio_summary.json`, written by
 * `scripts.precache_voodoo_ads`. Every cell renders instantly from disk
 * during the demo (no live SensorTower fan-out — the precache script does
 * that ahead of time).
 *
 * Composition:
 *   - Header: catalog count + "last refreshed at" + Run-precache CLI hint
 *   - Grid of GameCard components (icon, name, categories, rating,
 *     ads_total, network mix, top-3 ad thumbnails)
 *   - Click a card → expand to a detailed list of all ad samples (mp4
 *     preview on click)
 *   - Each card has a "Run analysis" CTA → opens LaunchAnalysisModal
 *     pre-filled with the picked game name
 */
import { useMemo, useState } from "react";
import {
  AlertCircle,
  ExternalLink,
  Image as ImageIcon,
  Play,
  Sparkles,
  Star,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useNavigate } from "@tanstack/react-router";
import { LaunchAnalysisModal } from "@/components/insights/LaunchAnalysisModal";
import {
  RunAnalysisDialog,
  type PipelineRunConfig,
} from "@/components/insights/RunAnalysisDialog";
import {
  useVoodooPortfolio,
  type VoodooAdSample,
  type VoodooPortfolioEntry,
} from "@/lib/api";
import { useGame } from "@/lib/game-context";

// Tailwind-friendly network color hints (kept inline so we don't pull more deps).
const NETWORK_HEX: Record<string, string> = {
  TikTok: "#ec4899",
  Facebook: "#3b82f6",
  Instagram: "#a855f7",
  Youtube: "#ef4444",
  Admob: "#10b981",
  Unity: "#f59e0b",
  Applovin: "#06b6d4",
};

function networkColor(network: string): string {
  return NETWORK_HEX[network] ?? "#94a3b8";
}

export function VoodooPortfolio() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setGameName } = useGame();
  const { data, isLoading, error } = useVoodooPortfolio(25);

  const [configOpen, setConfigOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [pendingRun, setPendingRun] = useState<{
    gameName: string;
    config: PipelineRunConfig;
  } | null>(null);

  function handleAnalyze(name: string) {
    setGameName(name);
    setConfigOpen(true);
  }

  function handleLaunch(name: string, config: PipelineRunConfig) {
    setPendingRun({ gameName: name, config });
    setConfigOpen(false);
    setRunOpen(true);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        Loading Voodoo portfolio…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <p className="text-sm font-medium text-destructive">
          Failed to load Voodoo portfolio: {(error as Error).message}
        </p>
      </div>
    );
  }

  if (!data || data.apps.length === 0) {
    return (
      <Card className="border-border bg-card p-8">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
          <div>
            <h3 className="text-base font-semibold">
              Portfolio cache not populated yet
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              The Voodoo Portfolio reads from a precomputed snapshot under{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                data/cache/voodoo/portfolio_summary.json
              </code>
              . Generate it with:
            </p>
            <pre className="mt-3 rounded-md bg-muted px-4 py-3 text-xs">
              uv run python -m scripts.precache_voodoo_ads
            </pre>
            <p className="mt-3 text-xs text-muted-foreground">
              ~30s for the top 15 most-rated Voodoo games. Once written, this
              page renders instantly from disk.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const generatedAt = data.generated_at
    ? new Date(data.generated_at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const totalAds = data.apps.reduce((acc, a) => acc + a.ads_total, 0);
  const networkTotals = aggregateNetworks(data.apps);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>
            <span className="text-foreground">{data.apps.length}</span> Voodoo
            games · <span className="text-foreground">{totalAds}</span> live
            ads scanned ·{" "}
            <span className="text-foreground">{data.country}</span>
          </span>
          {generatedAt && (
            <span>· refreshed {generatedAt}</span>
          )}
        </div>
        {Object.keys(networkTotals).length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {Object.entries(networkTotals)
              .sort(([, a], [, b]) => b - a)
              .map(([network, count]) => (
                <span
                  key={network}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs"
                  title={`${count} ads on ${network}`}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: networkColor(network) }}
                  />
                  <span className="text-muted-foreground">{network}</span>
                  <span className="font-medium tabular-nums">{count}</span>
                </span>
              ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.apps.map((app) => (
          <GameCard key={app.app_id} app={app} onAnalyze={handleAnalyze} />
        ))}
      </div>

      <LaunchAnalysisModal
        open={configOpen}
        onOpenChange={setConfigOpen}
        initialGameName={pendingRun?.gameName ?? ""}
        onLaunch={handleLaunch}
      />
      <RunAnalysisDialog
        open={runOpen}
        onOpenChange={(o) => {
          setRunOpen(o);
          if (!o && pendingRun) {
            // After the user closes a successful run, navigate to /insights so
            // they can see the new HookLensReport.
            queryClient.invalidateQueries({ queryKey: ["report"] });
            queryClient.invalidateQueries({ queryKey: ["reports"] });
          }
        }}
        gameName={pendingRun?.gameName ?? ""}
        config={pendingRun?.config}
        onComplete={(name) => {
          setGameName(name);
          // Optimistic: jump to the Insights view to see the new report.
          setTimeout(() => navigate({ to: "/insights" }), 800);
          setPendingRun(null);
        }}
      />
    </div>
  );
}

interface GameCardProps {
  app: VoodooPortfolioEntry;
  onAnalyze: (name: string) => void;
}

function GameCard({ app, onAnalyze }: GameCardProps) {
  const [adsOpen, setAdsOpen] = useState(false);
  const [iconErr, setIconErr] = useState(false);

  const networkChips = useMemo(() => {
    const entries = Object.entries(app.ads_by_network).sort(
      ([, a], [, b]) => b - a,
    );
    return entries.slice(0, 4);
  }, [app.ads_by_network]);

  const hasAds = app.ads_total > 0;

  return (
    <>
      <Card className="flex flex-col overflow-hidden border-border bg-card transition-colors hover:border-primary/50">
        <div className="flex items-start gap-3 p-4">
          <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-muted">
            {app.icon_url && !iconErr ? (
              <img
                src={app.icon_url}
                alt={app.name}
                onError={() => setIconErr(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-muted-foreground/50">
                <ImageIcon className="h-5 w-5" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="truncate text-sm font-semibold leading-tight">
                {app.name}
              </h3>
              {app.rating != null && (
                <span className="inline-flex flex-shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
                  <Star className="h-3 w-3 fill-amber-400 stroke-amber-400" />
                  {app.rating.toFixed(1)}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              <span className="truncate">app_id {app.app_id}</span>
              {app.rating_count != null && app.rating_count > 0 && (
                <span>· {abbrevNumber(app.rating_count)} ratings</span>
              )}
            </div>
          </div>
        </div>

        {/* Ad activity strip */}
        <div className="border-t border-border bg-muted/20 px-4 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Live ads
            </span>
            <span
              className={`text-sm font-semibold tabular-nums ${
                hasAds ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {app.ads_total}
            </span>
          </div>

          {hasAds ? (
            <>
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {networkChips.map(([network, count]) => (
                  <span
                    key={network}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px]"
                  >
                    <span
                      className="h-1 w-1 rounded-full"
                      style={{ background: networkColor(network) }}
                    />
                    <span>{network}</span>
                    <span className="font-medium tabular-nums">{count}</span>
                  </span>
                ))}
              </div>

              {/* Top-3 thumbnails preview */}
              {app.ads_sample.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAdsOpen(true)}
                  className="mt-3 grid w-full grid-cols-3 gap-1.5 transition-opacity hover:opacity-90"
                >
                  {app.ads_sample.slice(0, 3).map((s, i) => (
                    <ThumbCell key={s.creative_id || i} sample={s} />
                  ))}
                </button>
              )}
            </>
          ) : (
            <p className="mt-1 text-[11px] italic text-muted-foreground">
              No tracked creatives in the last 180 days.
            </p>
          )}
        </div>

        <div className="mt-auto flex gap-2 border-t border-border p-3">
          <Button
            size="sm"
            variant="default"
            className="flex-1"
            onClick={() => onAnalyze(app.name)}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Run analysis
          </Button>
          {hasAds && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAdsOpen(true)}
            >
              View ads
            </Button>
          )}
        </div>
      </Card>

      {/* Ads detail dialog */}
      <Dialog open={adsOpen} onOpenChange={setAdsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="truncate">
                {app.name} — {app.ads_total} live ads
              </span>
              {app.ads_latest_first_seen && (
                <Badge variant="outline" className="text-xs">
                  latest {app.ads_latest_first_seen}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {app.ads_sample.map((s, i) => (
              <AdSampleCard key={s.creative_id || i} sample={s} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface ThumbCellProps {
  sample: VoodooAdSample;
}

function ThumbCell({ sample }: ThumbCellProps) {
  const [errored, setErrored] = useState(false);
  const showImage = sample.thumb_url && !errored;
  return (
    <div className="relative aspect-[9/16] w-full overflow-hidden rounded-sm bg-muted">
      {showImage ? (
        <img
          src={sample.thumb_url ?? undefined}
          alt={`${sample.network} ad`}
          loading="lazy"
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-muted-foreground/40">
          <ImageIcon className="h-4 w-4" />
        </div>
      )}
      <span
        className="absolute bottom-0.5 left-0.5 rounded-sm px-1 py-px text-[8px] font-medium text-white"
        style={{ background: `${networkColor(sample.network)}cc` }}
      >
        {sample.network}
      </span>
    </div>
  );
}

interface AdSampleCardProps {
  sample: VoodooAdSample;
}

function AdSampleCard({ sample }: AdSampleCardProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [errored, setErrored] = useState(false);
  const hasVideo = Boolean(sample.creative_url);
  const showImage = sample.thumb_url && !errored;

  return (
    <>
      <button
        type="button"
        onClick={() => hasVideo && setPreviewOpen(true)}
        disabled={!hasVideo}
        className="group relative block aspect-[9/16] w-full overflow-hidden rounded-md bg-muted ring-1 ring-border transition-all hover:ring-primary/50"
      >
        {showImage ? (
          <img
            src={sample.thumb_url ?? undefined}
            alt={`${sample.network} ad`}
            loading="lazy"
            onError={() => setErrored(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted-foreground/40">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}
        {hasVideo && (
          <div className="absolute inset-0 grid place-items-center bg-black/0 transition-colors group-hover:bg-black/40">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-background/80 opacity-0 transition-opacity group-hover:opacity-100">
              <Play className="h-4 w-4 fill-foreground text-foreground" />
            </div>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/80 to-transparent p-1.5">
          <span
            className="rounded-sm px-1 py-px text-[10px] font-medium text-white"
            style={{ background: `${networkColor(sample.network)}cc` }}
          >
            {sample.network}
          </span>
          {sample.first_seen_at && (
            <span className="text-[10px] text-white/80">
              {sample.first_seen_at}
            </span>
          )}
        </div>
      </button>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl overflow-hidden p-0">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle className="flex items-center justify-between gap-2">
              <span>
                {sample.network} ·{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  {sample.ad_type}
                  {sample.first_seen_at ? ` · since ${sample.first_seen_at}` : ""}
                </span>
              </span>
              {sample.creative_url && (
                <a
                  href={sample.creative_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-normal text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  Open original
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="relative aspect-[9/16] max-h-[70vh] w-full bg-black">
            {sample.creative_url ? (
              <video
                key={sample.creative_url}
                src={sample.creative_url}
                controls
                autoPlay
                playsInline
                className="h-full w-full object-contain"
              />
            ) : sample.thumb_url ? (
              <img
                src={sample.thumb_url}
                alt=""
                className="h-full w-full object-contain"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function aggregateNetworks(apps: VoodooPortfolioEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of apps) {
    for (const [net, n] of Object.entries(a.ads_by_network)) {
      out[net] = (out[net] ?? 0) + n;
    }
  }
  return out;
}

function abbrevNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
