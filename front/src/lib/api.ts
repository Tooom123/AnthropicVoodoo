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

export function useReport(gameName: string) {
  return useQuery<HookLensReport>({
    queryKey: ["report", gameName],
    queryFn: () => apiFetch<HookLensReport>("/api/report", { game_name: gameName }),
    staleTime: 30 * 60 * 1000,
    enabled: gameName.trim().length > 0,
    retry: false,
  });
}

export function useReportList() {
  return useQuery<ReportSummary[]>({
    queryKey: ["reports"],
    queryFn: () => apiFetch<ReportSummary[]>("/api/reports"),
    staleTime: 5 * 60 * 1000,
  });
}
