import { useQuery } from "@tanstack/react-query";
import type { Creative, CompetitorGame } from "@/data/sample";
import type { HookLensReport, ReportSummary, VideoAdConcept, VideoAdResult } from "@/types/hooklens";

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

export interface CountrySignal {
  country_code: string;
  country_name: string;
  continent: string;
  lat: number;
  lng: number;
  radius: number;
  num_advertisers: number;
  top_sov: number;
  market_intensity: number;
}

export interface GeoSignalsParams {
  game_name?: string;
  category_id?: number;
  period?: string;
  period_date?: string;
}

export function useGeoSignals(params: GeoSignalsParams = {}) {
  return useQuery<CountrySignal[]>({
    queryKey: ["geo-signals", params],
    queryFn: () =>
      apiFetch<CountrySignal[]>(
        "/api/geo-signals",
        params as Record<string, string | number | undefined>,
      ),
    staleTime: 10 * 60 * 1000,
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

/** Brainrot video ad concept — LLM step only, fast. */
export function useVideoBrief(gameName: string | undefined) {
  return useQuery<VideoAdConcept>({
    queryKey: ["video-brief", gameName],
    queryFn: () => apiFetch<VideoAdConcept>("/api/video-brief", { game_name: gameName }),
    enabled: !!gameName,
    staleTime: Infinity,
  });
}

/** Trigger Scenario video generation (slow — 2-5 min). Returns video_url when done. */
export function useGenerateVideo(gameName: string | undefined, enabled: boolean) {
  return useQuery<VideoAdResult>({
    queryKey: ["video-generate", gameName],
    queryFn: () =>
      apiFetch<VideoAdResult>("/api/video-brief/generate", { game_name: gameName }),
    enabled: !!gameName && enabled,
    staleTime: Infinity,
    retry: false,
  });
}
