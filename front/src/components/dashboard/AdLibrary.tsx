import { useMemo, useState } from "react";
import { Play, ChevronDown, Check, Image as ImageIcon, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  NETWORKS,
  FORMATS,
  type Creative,
  type Network,
  type Format,
} from "@/data/sample";
import { useCreatives } from "@/lib/api";
import { useGame } from "@/lib/game-context";
import { NetworkBadge } from "./NetworkBadge";

type SortKey = "Run duration" | "Impressions" | "Date";

function MultiSelect<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly T[];
  selected: Set<T>;
  onToggle: (v: T) => void;
}) {
  const count = selected.size;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {label}
          {count > 0 && (
            <span className="rounded-sm bg-primary/15 px-1.5 text-xs text-primary">{count}</span>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((opt) => (
          <DropdownMenuCheckboxItem
            key={opt}
            checked={selected.has(opt)}
            onCheckedChange={() => onToggle(opt)}
            onSelect={(e) => e.preventDefault()}
          >
            {opt}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// "All" sentinel ⇒ backend fans out across US/GB/DE/FR/JP/BR/KR and
// dedupes — wired in api/main.py:get_creatives.
const COUNTRIES = ["All", "US", "GB", "DE", "FR", "JP", "BR", "KR"] as const;
type Country = (typeof COUNTRIES)[number];

export function AdLibrary() {
  const { gameName, period } = useGame();
  const [country, setCountry] = useState<Country>("US");
  const { data: creativesData = [], isLoading } = useCreatives({
    game_name: gameName || undefined,
    // The TopNav time dropdown drives this — switching from "Last 30 days"
    // to "Last 7 days" or "Last 90 days" re-queries SensorTower with the
    // new period bucket.
    period,
    country: country === "All" ? "all" : country,
    limit: 80,
  });
  const [networks, setNetworks] = useState<Set<Network>>(new Set());
  const [formats, setFormats] = useState<Set<Format>>(new Set());
  const [games, setGames] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>("Impressions");

  const gamesList = useMemo(
    () => [...new Set(creativesData.map((c) => c.game))].sort(),
    [creativesData],
  );

  const toggle = <T,>(set: Set<T>, v: T, setter: (s: Set<T>) => void) => {
    const next = new Set(set);
    next.has(v) ? next.delete(v) : next.add(v);
    setter(next);
  };

  const filtered = useMemo(() => {
    let list = creativesData.filter(
      (c) =>
        (networks.size === 0 || networks.has(c.network)) &&
        (formats.size === 0 || formats.has(c.format)) &&
        (games.size === 0 || games.has(c.game))
    );
    list = [...list].sort((a, b) => {
      if (sort === "Run duration") return b.runDays - a.runDays;
      // "Impressions" → sort by REAL SoV (the synthetic impressions field is
      // a flat 10k for almost everything; keep the menu label for back-compat
      // but use sov as the actual signal).
      if (sort === "Impressions") return (b.sov ?? 0) - (a.sov ?? 0);
      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
    });
    return list;
  }, [creativesData, networks, formats, games, sort]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-10 text-sm text-muted-foreground">
        Loading ad library…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelect
          label="Network"
          options={NETWORKS}
          selected={networks}
          onToggle={(v) => toggle(networks, v, setNetworks)}
        />
        <MultiSelect
          label="Format"
          options={FORMATS}
          selected={formats}
          onToggle={(v) => toggle(formats, v, setFormats)}
        />
        <MultiSelect
          label="Game"
          options={gamesList}
          selected={games}
          onToggle={(v) => toggle(games, v, setGames)}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <span className="text-muted-foreground text-xs">Region:</span>
              <span>{country}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {COUNTRIES.map((c) => (
              <DropdownMenuItem key={c} onClick={() => setCountry(c)}>
                <Check
                  className={`mr-2 h-3.5 w-3.5 ${c === country ? "opacity-100" : "opacity-0"}`}
                />
                {c}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <span className="text-muted-foreground text-xs">Sort:</span>
                <span>{sort}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(["Run duration", "Impressions", "Date"] as SortKey[]).map((s) => (
                <DropdownMenuItem key={s} onClick={() => setSort(s)}>
                  <Check className={`mr-2 h-3.5 w-3.5 ${s === sort ? "opacity-100" : "opacity-0"}`} />
                  {s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((c) => (
          <CreativeCard key={c.id} creative={c} />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-md border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No creatives match your filters.
          </div>
        )}
      </div>
    </div>
  );
}

interface CreativeCardProps {
  creative: Creative;
}

/**
 * Single ad card with the SensorTower thumbnail as hero. Click → opens an
 * inline video preview (Dialog with <video controls>) when a creativeUrl
 * is available; falls back to the ad-detail route otherwise.
 *
 * Card body shows ONLY honest data:
 * - app icon + game name + publisher_name (real, from app_info)
 * - Run duration (real, from first/last seen dates)
 * - Share of Voice in category × network × period (real, SensorTower)
 *
 * Removed: opaque creative_id (was just noise), synthetic impressions
 * (was a flat 10k floor), synthetic score / spend tier.
 */
function CreativeCard({ creative: c }: CreativeCardProps) {
  const [thumbErrored, setThumbErrored] = useState(false);
  const [iconErrored, setIconErrored] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const hasThumb = Boolean(c.thumbUrl) && !thumbErrored;
  const hasIcon = Boolean(c.appIconUrl) && !iconErrored;
  const hasVideo = Boolean(c.creativeUrl) && c.format === "Video";

  function handleHeroClick() {
    if (hasVideo) {
      setPreviewOpen(true);
    }
  }

  return (
    <>
      <Card className="flex flex-col overflow-hidden border-border bg-card p-0 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
        {/* Hero / thumbnail */}
        <button
          type="button"
          onClick={handleHeroClick}
          className="group relative block aspect-video w-full overflow-hidden bg-gradient-to-br from-muted to-muted/40"
          disabled={!hasVideo}
          aria-label={hasVideo ? `Preview ad for ${c.game}` : `Ad for ${c.game}`}
        >
          {hasThumb ? (
            <img
              src={c.thumbUrl ?? undefined}
              alt={`${c.game} — ${c.format} ad`}
              loading="lazy"
              onError={() => setThumbErrored(true)}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-muted-foreground/40">
              <ImageIcon className="h-10 w-10" />
            </div>
          )}
          {/* Play overlay (video format only) */}
          {hasVideo && (
            <div className="absolute inset-0 grid place-items-center bg-black/0 transition-colors group-hover:bg-black/30">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-background/80 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                <Play className="h-5 w-5 fill-foreground text-foreground" />
              </div>
            </div>
          )}
          {/* Format badge */}
          <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm">
            {c.format}
          </span>
        </button>

        <div className="flex flex-1 flex-col gap-3 p-4">
          {/* App icon + game name + publisher */}
          <div className="flex items-start gap-2.5">
            <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border">
              {hasIcon ? (
                <img
                  src={c.appIconUrl ?? undefined}
                  alt={c.game}
                  loading="lazy"
                  onError={() => setIconErrored(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full w-full place-items-center text-muted-foreground/40">
                  <ImageIcon className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold leading-tight">
                {c.game}
              </div>
              {c.publisherName && (
                <div className="truncate text-[11px] text-muted-foreground">
                  by {c.publisherName}
                </div>
              )}
            </div>
            <NetworkBadge network={c.network} />
          </div>

          {/* Honest stats: run duration + (Share of Voice when SensorTower
              provides it, else first-seen date — never a fake numeric). */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-muted/50 px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Running
              </div>
              <div className="font-medium tabular-nums text-foreground">
                {c.runDays}d
              </div>
            </div>
            {c.sov != null && c.sov > 0 ? (
              <div
                className="rounded-md bg-muted/50 px-2 py-1.5"
                title="Share of Voice in category × network × period (SensorTower)"
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  SoV
                </div>
                <div className="font-medium tabular-nums text-foreground">
                  {c.sov >= 0.001 ? `${(c.sov * 100).toFixed(2)}%` : "<0.1%"}
                </div>
              </div>
            ) : (
              <div
                className="rounded-md bg-muted/50 px-2 py-1.5"
                title="First time this creative was seen by SensorTower"
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Started
                </div>
                <div className="font-medium tabular-nums text-foreground">
                  {c.startedAt.slice(0, 7)}
                </div>
              </div>
            )}
          </div>

          <Button size="sm" variant="secondary" className="mt-auto w-full" asChild>
            <Link to="/ad/$id" params={{ id: c.id }}>
              View details
            </Link>
          </Button>
        </div>
      </Card>

      {/* Inline video preview */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl overflow-hidden p-0">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle className="flex items-center justify-between gap-3">
              <span className="truncate">
                {c.game}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  · {c.network} · {c.format}
                </span>
              </span>
              {c.creativeUrl && (
                <a
                  href={c.creativeUrl}
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
            {c.creativeUrl ? (
              <video
                key={c.creativeUrl}
                src={c.creativeUrl}
                controls
                autoPlay
                playsInline
                className="h-full w-full object-contain"
              />
            ) : c.thumbUrl ? (
              <img
                src={c.thumbUrl}
                alt={c.game}
                className="h-full w-full object-contain"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
