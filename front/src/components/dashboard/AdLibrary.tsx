import { useMemo, useState } from "react";
import { Play, ChevronDown, Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
          <Card
            key={c.id}
            className="overflow-hidden border-border bg-card p-0 transition-colors hover:border-primary/50"
          >
            <div className="relative aspect-video w-full bg-gradient-to-br from-muted to-muted/40">
              <div className="absolute inset-0 grid place-items-center">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-background/40 backdrop-blur-sm">
                  <Play className="h-5 w-5 fill-foreground text-foreground" />
                </div>
              </div>
              <span className="absolute right-2 top-2 rounded-md bg-background/70 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm">
                {c.format}
              </span>
            </div>
            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold leading-tight">{c.game}</div>
                  <div className="text-xs text-muted-foreground">{c.id}</div>
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
                  <div className="font-medium text-foreground">{abbrevNumber(c.impressions)}</div>
                </div>
              </div>
              <Button size="sm" variant="secondary" className="w-full" asChild>
                <Link to="/ad/$id" params={{ id: c.id }}>View details</Link>
              </Button>
            </div>
          </Card>
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
