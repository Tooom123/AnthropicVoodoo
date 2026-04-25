/**
 * Live pipeline runner dialog — opens an SSE stream to /api/report/run/stream
 * and renders 10 step rows with pending → running → done states.
 *
 * On `done` event, invalidates the react-query caches so the parent Insights
 * view re-fetches the freshly cached report.
 *
 * Backend contract (events):
 *   { type: "started", game_name, total, config }
 *   { type: "step",    step_id, label, idx, total, duration_s, summary }
 *   { type: "done",    app_id, name, duration_s, cost_usd }
 *   { type: "error",   message }
 *   { type: "heartbeat", ts }   ← ignored
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CircleDashed,
  DollarSign,
  Loader2,
  PlayCircle,
  Sparkles,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

/**
 * The 10 steps in display order — kept in sync with `app/pipeline.py STEPS`.
 * step_id is the canonical key the backend emits.
 */
const STEP_ORDER: { step_id: string; label: string }[] = [
  { step_id: "target_meta", label: "Resolve target game" },
  { step_id: "game_dna", label: "Extract Game DNA" },
  { step_id: "top_advertisers", label: "Discover top advertisers" },
  { step_id: "raw_creatives", label: "Pull top creatives" },
  { step_id: "deconstructed", label: "Deconstruct videos (Gemini)" },
  { step_id: "archetypes", label: "Cluster archetypes + signals" },
  { step_id: "fit_scores", label: "Score game-fit (Opus)" },
  { step_id: "briefs", label: "Author creative briefs (Opus)" },
  { step_id: "variants", label: "Generate visuals (Scenario)" },
  { step_id: "report", label: "Compose final report" },
];

type StepStatus = "pending" | "running" | "done" | "error";

interface StepState {
  status: StepStatus;
  duration_s?: number;
  summary?: Record<string, unknown>;
}

interface DoneEvent {
  type: "done";
  app_id: string;
  name: string;
  duration_s: number;
  cost_usd: number;
}

interface ErrorEvent {
  type: "error";
  message: string;
}

/**
 * Pipeline-config params surfaced from the LaunchAnalysisModal. ``"all"`` is
 * a server-side sentinel that expands to the curated worldwide list.
 */
export interface PipelineRunConfig {
  countries: string[];   // ["all"] or ["US", "JP", ...]
  networks: string[];    // ["all"] or ["TikTok", "Facebook", ...]
  maxCreatives?: number; // server default: 8
  topKArchetypes?: number; // server default: 5
  topKVariants?: number; // server default: 3
}

interface RunAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gameName: string;
  config?: PipelineRunConfig;
  onComplete?: (gameName: string) => void;
}

export function RunAnalysisDialog({
  open,
  onOpenChange,
  gameName,
  config,
  onComplete,
}: RunAnalysisDialogProps) {
  const queryClient = useQueryClient();
  const esRef = useRef<EventSource | null>(null);

  const [steps, setSteps] = useState<Record<string, StepState>>(() => Object.fromEntries(
    STEP_ORDER.map((s) => [s.step_id, { status: "pending" } as StepState]),
  ));
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [doneEvent, setDoneEvent] = useState<DoneEvent | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [t0, setT0] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  function reset() {
    setSteps(Object.fromEntries(
      STEP_ORDER.map((s) => [s.step_id, { status: "pending" } as StepState]),
    ));
    setPhase("idle");
    setDoneEvent(null);
    setErrorMsg(null);
    setT0(null);
  }

  function closeStream() {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }

  function startRun() {
    closeStream();
    reset();
    setPhase("running");
    setT0(Date.now());

    // Mark the first step as running immediately for instant feedback.
    setSteps((prev) => ({
      ...prev,
      [STEP_ORDER[0].step_id]: { status: "running" },
    }));

    const url = new URL("/api/report/run/stream", API_BASE);
    url.searchParams.set("game_name", gameName);
    if (config) {
      if (config.countries?.length) {
        url.searchParams.set("countries", config.countries.join(","));
      }
      if (config.networks?.length) {
        url.searchParams.set("networks", config.networks.join(","));
      }
      if (config.maxCreatives) {
        url.searchParams.set("max_creatives", String(config.maxCreatives));
      }
      if (config.topKArchetypes) {
        url.searchParams.set("top_k_archetypes", String(config.topKArchetypes));
      }
      if (config.topKVariants) {
        url.searchParams.set("top_k_variants", String(config.topKVariants));
      }
    }
    const es = new EventSource(url.toString());
    esRef.current = es;

    es.onmessage = (e) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(e.data);
      } catch {
        return;
      }

      if (event.type === "heartbeat" || event.type === "started") return;

      if (event.type === "step") {
        const step_id = event.step_id as string;
        const idx = event.idx as number;
        const duration_s = event.duration_s as number | undefined;
        const summary = event.summary as Record<string, unknown> | undefined;
        setSteps((prev) => {
          const next = { ...prev };
          next[step_id] = { status: "done", duration_s, summary };
          // Mark next step (if any) as running.
          const nextStep = STEP_ORDER[idx]; // idx is 1-based; STEP_ORDER[idx] is the next one
          if (nextStep && next[nextStep.step_id]?.status === "pending") {
            next[nextStep.step_id] = { status: "running" };
          }
          return next;
        });
        return;
      }

      if (event.type === "done") {
        setDoneEvent(event as unknown as DoneEvent);
        setPhase("done");
        closeStream();
        // Invalidate caches so Insights view refetches.
        queryClient.invalidateQueries({ queryKey: ["report"] });
        queryClient.invalidateQueries({ queryKey: ["reports"] });
        if (onComplete) onComplete(gameName);
        return;
      }

      if (event.type === "error") {
        setErrorMsg((event as unknown as ErrorEvent).message ?? "Unknown error");
        setPhase("error");
        closeStream();
      }
    };

    es.onerror = () => {
      // Browser closes EventSource silently on network error. Distinguish
      // "stream completed normally" (we already set phase=done/error) vs
      // an unexpected drop.
      if (phase === "running") {
        setErrorMsg("Connection to backend lost. Check the API server logs.");
        setPhase("error");
      }
      closeStream();
    };
  }

  // Auto-start a fresh run whenever the dialog opens. Closing the dialog
  // cleans up the EventSource (the backend keeps running and caches the
  // result, but we stop streaming).
  useEffect(() => {
    if (open) {
      // Always (re)start on open — supports the Re-run flow after a previous
      // done/error state without forcing the user to manually click anything.
      startRun();
    } else {
      closeStream();
    }
    return () => closeStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Tick the wall-clock so the running timer updates each second.
  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  const completedSteps = useMemo(
    () => STEP_ORDER.filter((s) => steps[s.step_id]?.status === "done").length,
    [steps],
  );
  const totalSteps = STEP_ORDER.length;
  const pct = Math.round((completedSteps / totalSteps) * 100);

  const elapsedS = t0 ? Math.round((now - t0) / 1000) : 0;
  const elapsedLabel =
    elapsedS < 60 ? `${elapsedS}s` : `${Math.floor(elapsedS / 60)}m ${elapsedS % 60}s`;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Confirm before closing if a run is mid-flight.
        if (!o && phase === "running") {
          const confirmed = window.confirm(
            "A pipeline run is in progress. Closing this dialog will stop streaming progress, but the backend will keep running and cache the result. Close anyway?",
          );
          if (!confirmed) return;
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="truncate">Analyze {gameName}</span>
          </DialogTitle>
          <DialogDescription>
            Running the full HookLens pipeline (10 steps · ~3–5 min · ~$0.05–1
            in API calls). Progress streams live below.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Step {Math.min(completedSteps + (phase === "running" ? 1 : 0), totalSteps)}{" "}
              / {totalSteps}
            </span>
            <span className="tabular-nums">
              {pct}% · {elapsedLabel}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <ol className="mt-4 space-y-1.5">
          {STEP_ORDER.map((s, i) => {
            const state = steps[s.step_id];
            return <StepRow key={s.step_id} idx={i + 1} label={s.label} state={state} />;
          })}
        </ol>

        {phase === "done" && doneEvent && (
          <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
            <p className="font-medium text-emerald-300">
              ✓ Report ready for {doneEvent.name}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Total runtime {Math.round(doneEvent.duration_s)}s · estimated cost{" "}
              <DollarSign className="-mt-0.5 inline h-3 w-3" />
              {doneEvent.cost_usd.toFixed(4)}. The Insights view will refresh
              automatically.
            </p>
          </div>
        )}

        {phase === "error" && errorMsg && (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="font-medium text-destructive">Pipeline failed</p>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              {errorMsg}
            </p>
          </div>
        )}

        <DialogFooter className="mt-2">
          {phase === "error" && (
            <Button onClick={startRun} variant="default">
              <PlayCircle className="mr-1.5 h-4 w-4" /> Retry
            </Button>
          )}
          <Button
            variant={phase === "done" ? "default" : "outline"}
            onClick={() => onOpenChange(false)}
          >
            {phase === "running" ? "Run in background" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface StepRowProps {
  idx: number;
  label: string;
  state: StepState | undefined;
}

function StepRow({ idx, label, state }: StepRowProps) {
  const status = state?.status ?? "pending";
  const summaryText =
    status === "done" && state?.summary ? formatSummary(state.summary) : "";

  return (
    <li className="flex w-full items-center gap-3 overflow-hidden rounded-md border border-transparent px-2 py-1.5 text-sm transition-colors">
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
        {status === "pending" && (
          <CircleDashed className="h-4 w-4 text-muted-foreground/60" />
        )}
        {status === "running" && (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        )}
        {status === "done" && (
          <Check className="h-4 w-4 text-emerald-400" strokeWidth={3} />
        )}
        {status === "error" && (
          <AlertCircle className="h-4 w-4 text-destructive" />
        )}
      </span>
      <span className="flex-shrink-0 text-xs font-mono text-muted-foreground tabular-nums">
        {String(idx).padStart(2, "0")}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <span
          className={`flex-shrink-0 ${
            status === "running"
              ? "font-medium text-foreground"
              : status === "done"
                ? "text-foreground"
                : "text-muted-foreground"
          }`}
        >
          {label}
        </span>
        {summaryText && (
          <span
            className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground/80"
            title={summaryText}
          >
            · {summaryText}
          </span>
        )}
      </div>
      {status === "done" && state?.duration_s != null && (
        <span className="flex-shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {state.duration_s.toFixed(1)}s
        </span>
      )}
    </li>
  );
}

function formatSummary(summary: Record<string, unknown>): string {
  const chips: string[] = [];
  if (typeof summary.count === "number") chips.push(`${summary.count}`);
  if (typeof summary.name === "string") chips.push(summary.name);
  if (typeof summary.genre === "string") chips.push(summary.genre);
  if (Array.isArray(summary.labels)) {
    const labs = (summary.labels as string[]).slice(0, 2);
    if (labs.length) chips.push(labs.join(", ") + (summary.labels.length > 2 ? "…" : ""));
  }
  if (Array.isArray(summary.titles)) {
    const titles = (summary.titles as string[]).slice(0, 1);
    if (titles[0]) chips.push(`"${titles[0].slice(0, 28)}…"`);
  }
  return chips.join(" · ");
}
