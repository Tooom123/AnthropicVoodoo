import { useQuery } from "@tanstack/react-query";
import type { Creative, CompetitorGame } from "@/data/sample";
import type { HookLensReport, ReportSummary } from "@/types/hooklens";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

async function apiFetch<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(path, API_BASE);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    });
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export interface CreativesParams {
  game_name?: string;
  category_id?: number;
  country?: string;
  period?: string;
  period_date?: string;
  limit?: number;
}

export function useCreatives(params: CreativesParams = {}) {
  return useQuery<Creative[]>({
    queryKey: ["creatives", params],
    queryFn: () => apiFetch<Creative[]>("/api/creatives", params as Record<string, string | number | undefined>),
    staleTime: 5 * 60 * 1000,
    enabled: true,
  });
}

export interface AdvertisersParams {
  game_name?: string;
  category_id?: number;
  country?: string;
  period?: string;
  period_date?: string;
  limit?: number;
}

export function useAdvertisers(params: AdvertisersParams = {}) {
  return useQuery<CompetitorGame[]>({
    queryKey: ["advertisers", params],
    queryFn: () => apiFetch<CompetitorGame[]>("/api/advertisers", params as Record<string, string | number | undefined>),
    staleTime: 5 * 60 * 1000,
    enabled: true,
  });
}

export interface GameMeta {
  name: string;
  publisher: string;
  app_id: string;
  icon_url: string;
  description: string;
}

export function useGameMeta(name: string) {
  return useQuery<GameMeta | null>({
    queryKey: ["game", name],
    queryFn: () => apiFetch<GameMeta | null>("/api/game", { name }),
    staleTime: 30 * 60 * 1000,
    enabled: name.trim().length > 0,
  });
}

// ---------------------------------------------------------------------------
// HookLensReport — full pipeline output
// ---------------------------------------------------------------------------

/**
 * Fetch the full HookLensReport for a game (Game DNA, archetypes, fit scores,
 * briefs, generated variants). Loaded from disk cache; returns null on 404 so
 * callers can render a "no report yet" empty state.
 */
export function useReport(gameName: string) {
  return useQuery<HookLensReport | null>({
    queryKey: ["report", gameName],
    queryFn: async () => {
      const url = new URL("/api/report", API_BASE);
      url.searchParams.set("game_name", gameName);
      const res = await fetch(url.toString());
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`API /api/report → ${res.status}`);
      return res.json() as Promise<HookLensReport>;
    },
    staleTime: 10 * 60 * 1000,
    enabled: gameName.trim().length > 0,
  });
}

/**
 * Source ad creatives that fed into a given report's archetype clusters.
 * Returned as a map of ``archetype_id → list of thumbs/videos`` so the
 * Insights view can show real S3 thumbnails inside ArchetypesTable.
 */
export interface SourceCreative {
  creative_id: string;
  network: string;
  ad_type: string;
  thumb_url: string | null;
  creative_url: string | null;
  first_seen_at: string | null;
  advertiser_name: string | null;
}

/** App Store screenshot URLs for a target game (from SensorTower meta cache). */
export interface GameScreenshots {
  app_id: string;
  name: string | null;
  screenshot_urls: string[];
}

export function useGameScreenshots(gameName: string) {
  return useQuery<GameScreenshots>({
    queryKey: ["gameScreenshots", gameName],
    queryFn: async () => {
      const url = new URL("/api/game/screenshots", API_BASE);
      url.searchParams.set("game_name", gameName);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`API → ${res.status}`);
      return res.json() as Promise<GameScreenshots>;
    },
    staleTime: 60 * 60 * 1000,
    enabled: gameName.trim().length > 0,
  });
}

export function useReportSourceCreatives(gameName: string) {
  return useQuery<Record<string, SourceCreative[]>>({
    queryKey: ["reportSourceCreatives", gameName],
    queryFn: async () => {
      const url = new URL("/api/report/source_creatives", API_BASE);
      url.searchParams.set("game_name", gameName);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`API → ${res.status}`);
      return res.json() as Promise<Record<string, SourceCreative[]>>;
    },
    staleTime: 10 * 60 * 1000,
    enabled: gameName.trim().length > 0,
  });
}

/** List of pre-cached reports — for a "previously analyzed" picker. */
export function useReportList() {
  return useQuery<ReportSummary[]>({
    queryKey: ["reports"],
    queryFn: () => apiFetch<ReportSummary[]>("/api/reports"),
    staleTime: 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Voodoo Portfolio — top games + their currently-running ad creatives
// ---------------------------------------------------------------------------

export interface VoodooAdSample {
  creative_id: string;
  network: string;
  ad_type: string;
  thumb_url: string | null;
  creative_url: string | null;
  first_seen_at: string | null;
}

export interface VoodooPortfolioEntry {
  app_id: string;
  unified_app_id: string | null;
  name: string;
  publisher_name: string;
  icon_url: string;
  categories: (number | string)[];
  rating: number | null;
  rating_count: number | null;
  description: string;
  ads_total: number;
  ads_by_network: Record<string, number>;
  ads_latest_first_seen: string | null;
  ads_sample: VoodooAdSample[];
}

export interface VoodooPortfolioResponse {
  generated_at: string | null;
  country: string;
  limit: number;
  apps: VoodooPortfolioEntry[];
}

export function useVoodooPortfolio(limit = 15) {
  return useQuery<VoodooPortfolioResponse>({
    queryKey: ["voodooPortfolio", limit],
    queryFn: () =>
      apiFetch<VoodooPortfolioResponse>("/api/voodoo/portfolio", { limit }),
    staleTime: 5 * 60 * 1000,
  });
}
