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
  abbrevNumber,
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

export function AdLibrary() {
  const { gameName } = useGame();
  const { data: creativesData = [], isLoading } = useCreatives({ game_name: gameName || undefined });
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
      if (sort === "Impressions") return b.impressions - a.impressions;
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
 * Thumbnails come from the SensorTower creative_url's sibling thumb_url
 * (S3-hosted). Loading errors degrade to a gradient placeholder + icon.
 */
function CreativeCard({ creative: c }: CreativeCardProps) {
  const [thumbErrored, setThumbErrored] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const hasThumb = Boolean(c.thumbUrl) && !thumbErrored;
  const hasVideo = Boolean(c.creativeUrl) && c.format === "Video";

  function handleHeroClick() {
    if (hasVideo) {
      setPreviewOpen(true);
    }
  }

  return (
    <>
      <Card className="overflow-hidden border-border bg-card p-0 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
        {/* Hero / thumbnail */}
        <button
          type="button"
          onClick={handleHeroClick}
          className="group relative block aspect-video w-full overflow-hidden bg-gradient-to-br from-muted to-muted/40"
          disabled={!hasVideo}
          aria-label={hasVideo ? `Preview ad ${c.id}` : `Ad ${c.id}`}
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

        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold leading-tight">
                {c.game}
              </div>
              <div className="truncate text-xs text-muted-foreground">{c.id}</div>
            </div>
            <NetworkBadge network={c.network} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-muted/50 px-2 py-1.5">
              <div className="text-muted-foreground">Run</div>
              <div className="font-medium text-foreground">{c.runDays}d</div>
            </div>
            <div className="rounded-md bg-muted/50 px-2 py-1.5">
              <div className="text-muted-foreground">Impr.</div>
              <div className="font-medium text-foreground">
                {abbrevNumber(c.impressions)}
              </div>
            </div>
          </div>
          <Button size="sm" variant="secondary" className="w-full" asChild>
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
