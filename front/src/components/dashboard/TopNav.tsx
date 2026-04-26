import { Calendar, ChevronDown, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";
import { PERIOD_OPTIONS, useGame } from "@/lib/game-context";

export function TopNav() {
  const { theme, toggle } = useTheme();
  const { gameName, periodLabel, setPeriodByLabel } = useGame();

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold">Voodoo</h1>
        <span className="hidden text-xs text-muted-foreground md:inline">
          / Ad Intelligence — creative trends for Voodoo's publishing team
        </span>
        {gameName && (
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {gameName}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Calendar className="h-3.5 w-3.5" />
              <span>{periodLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {PERIOD_OPTIONS.map((r) => (
              <DropdownMenuItem
                key={r.label}
                onClick={() => setPeriodByLabel(r.label)}
              >
                {r.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  );
}
