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
}

export interface CompetitorGame {
  game: string;
  subGenre: string;
  appStoreRank: number;
  monthlySpend: number; // USD
  spendTier: SpendTier;
  status: "Active" | "Monitoring";
}

export const GAMES = [
  "Clash of Clans",
  "Royal Match",
  "Coin Master",
  "Subway Surfers",
] as const;

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

export const creatives: Creative[] = [
  { id: "CR-1042", game: "Clash of Clans", network: "Meta", format: "Video", runDays: 47, impressions: 2_400_000, score: 88, spendEstimate: 142_000, startedAt: "2025-03-08" },
  { id: "CR-1043", game: "Clash of Clans", network: "Google", format: "Playable", runDays: 22, impressions: 1_120_000, score: 74, spendEstimate: 68_000, startedAt: "2025-04-02" },
  { id: "CR-1044", game: "Clash of Clans", network: "TikTok", format: "Video", runDays: 14, impressions: 980_000, score: 71, spendEstimate: 54_000, startedAt: "2025-04-10" },
  { id: "CR-1045", game: "Royal Match", network: "Meta", format: "Video", runDays: 62, impressions: 3_800_000, score: 92, spendEstimate: 218_000, startedAt: "2025-02-21" },
  { id: "CR-1046", game: "Royal Match", network: "ironSource", format: "Playable", runDays: 31, impressions: 1_540_000, score: 81, spendEstimate: 92_000, startedAt: "2025-03-25" },
  { id: "CR-1047", game: "Royal Match", network: "Google", format: "Static", runDays: 9, impressions: 320_000, score: 52, spendEstimate: 18_000, startedAt: "2025-04-15" },
  { id: "CR-1048", game: "Coin Master", network: "TikTok", format: "Video", runDays: 28, impressions: 2_100_000, score: 84, spendEstimate: 124_000, startedAt: "2025-03-28" },
  { id: "CR-1049", game: "Coin Master", network: "Meta", format: "Static", runDays: 18, impressions: 690_000, score: 63, spendEstimate: 41_000, startedAt: "2025-04-06" },
  { id: "CR-1050", game: "Coin Master", network: "ironSource", format: "Playable", runDays: 5, impressions: 180_000, score: 44, spendEstimate: 11_000, startedAt: "2025-04-19" },
  { id: "CR-1051", game: "Subway Surfers", network: "Google", format: "Video", runDays: 41, impressions: 2_900_000, score: 86, spendEstimate: 168_000, startedAt: "2025-03-14" },
  { id: "CR-1052", game: "Subway Surfers", network: "TikTok", format: "Playable", runDays: 12, impressions: 760_000, score: 67, spendEstimate: 38_000, startedAt: "2025-04-12" },
  { id: "CR-1053", game: "Subway Surfers", network: "Meta", format: "Static", runDays: 3, impressions: 95_000, score: 41, spendEstimate: 6_500, startedAt: "2025-04-21" },
];

export const competitors: CompetitorGame[] = [
  { game: "Clash of Clans", subGenre: "Strategy / Base Builder", appStoreRank: 14, monthlySpend: 4_200_000, spendTier: "Top", status: "Active" },
  { game: "Royal Match", subGenre: "Puzzle / Match-3", appStoreRank: 3, monthlySpend: 9_800_000, spendTier: "Top", status: "Active" },
  { game: "Coin Master", subGenre: "Casino / Social", appStoreRank: 22, monthlySpend: 2_100_000, spendTier: "Mid", status: "Active" },
  { game: "Subway Surfers", subGenre: "Endless Runner", appStoreRank: 31, monthlySpend: 780_000, spendTier: "Mid", status: "Monitoring" },
];

export function abbrevNumber(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
