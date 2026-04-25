export type Network = "Meta" | "Google" | "TikTok" | "ironSource";
export type Format = "Video" | "Static" | "Playable";
export type SpendTier = "Micro" | "Mid" | "Top";

export interface Creative {
  id: string;
  game: string;
  network: Network;
  format: Format;
  runDays: number;
  impressions: number; // raw
  score: number; // 0-100
  spendEstimate: number; // USD
  startedAt: string;
  /** SensorTower S3 thumbnail (jpeg). May be null for some Static formats. */
  thumbUrl?: string | null;
  /** Original creative asset URL (mp4 for Video; image for Static). */
  creativeUrl?: string | null;
}

export interface CompetitorGame {
  game: string;
  subGenre: string;
  appStoreRank: number;
  monthlySpend: number; // USD
  spendTier: SpendTier;
  status: "Active" | "Monitoring";
}

export const NETWORKS: Network[] = ["Meta", "Google", "TikTok", "ironSource"];
export const FORMATS: Format[] = ["Video", "Static", "Playable"];

export const NETWORK_HEX: Record<Network, string> = {
  Meta: "#1877f2",
  Google: "#34a853",
  TikTok: "#ff0050",
  ironSource: "#ff6b35",
};

export const FORMAT_HEX: Record<Format, string> = {
  Video: "#4f8ef7",
  Static: "#a78bfa",
  Playable: "#34d399",
};

export function abbrevNumber(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
