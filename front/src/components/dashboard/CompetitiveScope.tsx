import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { abbrevNumber, type SpendTier } from "@/data/sample";
import { useAdvertisers } from "@/lib/api";
import { useGame } from "@/lib/game-context";

const TIER_STYLE: Record<SpendTier, string> = {
  Top: "bg-primary/15 text-primary border-primary/30",
  Mid: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Micro: "bg-muted text-muted-foreground border-border",
};

const STATUS_STYLE: Record<string, string> = {
  Active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Monitoring: "bg-muted text-muted-foreground border-border",
};

const SPEND_COLORS = ["#4f8ef7", "#a78bfa", "#34d399", "#fb923c"];

export function CompetitiveScope() {
  const { gameName } = useGame();
  const { data: competitors = [], isLoading } = useAdvertisers({ game_name: gameName || undefined });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-10 text-sm text-muted-foreground">
        Loading competitors…
      </div>
    );
  }

  const data = [...competitors]
    .map((c, i) => ({ name: c.game, spend: c.monthlySpend, fill: SPEND_COLORS[i % SPEND_COLORS.length] }))
    .sort((a, b) => b.spend - a.spend);

  return (
    <div className="space-y-5">
      <Card className="border-border bg-card p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Game</TableHead>
              <TableHead>Sub-genre</TableHead>
              <TableHead className="text-right">Store rank</TableHead>
              <TableHead className="text-right">Est. monthly spend</TableHead>
              <TableHead>Spend tier</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {competitors.map((c) => (
              <TableRow key={c.game}>
                <TableCell className="font-medium">{c.game}</TableCell>
                <TableCell className="text-muted-foreground">{c.subGenre}</TableCell>
                <TableCell className="text-right">#{c.appStoreRank}</TableCell>
                <TableCell className="text-right font-mono text-sm">
                  ${abbrevNumber(c.monthlySpend)}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${TIER_STYLE[c.spendTier]}`}
                  >
                    {c.spendTier}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[c.status]}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${c.status === "Active" ? "bg-emerald-400" : "bg-muted-foreground"}`}
                    />
                    {c.status}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="border-border bg-card p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold">Estimated monthly spend distribution</h3>
          <p className="text-xs text-muted-foreground">Tracked competitor games</p>
        </div>
        <div className="h-[260px] w-full">
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 24, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.08)" horizontal={false} />
              <XAxis
                type="number"
                stroke="oklch(0.7 0.02 260)"
                fontSize={11}
                tickFormatter={(v) => "$" + abbrevNumber(v)}
              />
              <YAxis
                type="category"
                dataKey="name"
                stroke="oklch(0.7 0.02 260)"
                fontSize={11}
                width={120}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => ["$" + abbrevNumber(v), "Monthly spend"]}
              />
              <Bar dataKey="spend" radius={[0, 4, 4, 0]}>
                {data.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
