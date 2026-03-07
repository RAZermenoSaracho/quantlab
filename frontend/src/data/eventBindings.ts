import type {
  BacktestProgressEvent,
  BacktestRun,
  BacktestStatusResponse,
  PaperRun,
  PaperRunDetailResponse,
  PaperRunErrorEvent,
  PaperRunStatusEvent,
  PaperRunUpdateEvent,
  PaperTick,
} from "@quantlab/contracts";
import {
  BACKTESTS,
  PAPER_RUNS,
  backtestStatusKey,
  paperRunKey,
} from "./keys";
import { updateFromEvent, updateQuery } from "./queryClient";

let bindingsRegistered = false;

function updatePaperRunList(
  runId: string,
  updater: (run: PaperRun) => PaperRun
) {
  updateQuery<PaperRun[]>(PAPER_RUNS, (current) => {
    if (!current?.data) {
      return current;
    }

    return {
      ...current,
      data: current.data.map((run) => (run.id === runId ? updater(run) : run)),
    };
  });
}

function updatePaperRunDetail(
  runId: string,
  updater: (detail: PaperRunDetailResponse) => PaperRunDetailResponse
) {
  updateQuery<PaperRunDetailResponse>(paperRunKey(runId), (current) => {
    if (!current?.data) {
      return current;
    }

    return {
      ...current,
      data: updater(current.data),
    };
  });
}

function applyPaperRunUpdate(payload: PaperRunUpdateEvent) {
  updatePaperRunList(payload.run_id, (run) => ({
    ...run,
    quote_balance: payload.quote_balance ?? run.quote_balance,
    base_balance: payload.base_balance ?? run.base_balance,
    equity: payload.equity ?? run.equity,
    last_price: payload.last_price ?? run.last_price,
    position: payload.position ?? run.position,
    updated_at: new Date().toISOString(),
  }));

  updatePaperRunDetail(payload.run_id, (detail) => ({
    ...detail,
    run: {
      ...detail.run,
      quote_balance: payload.quote_balance ?? detail.run.quote_balance,
      base_balance: payload.base_balance ?? detail.run.base_balance,
      equity: payload.equity ?? detail.run.equity,
      last_price: payload.last_price ?? detail.run.last_price,
      position: payload.position ?? detail.run.position,
      updated_at: new Date().toISOString(),
    },
  }));
}

function applyPaperRunStatus(payload: PaperRunStatusEvent) {
  updatePaperRunList(payload.run_id, (run) => ({
    ...run,
    status: payload.status,
    updated_at: new Date().toISOString(),
  }));

  updatePaperRunDetail(payload.run_id, (detail) => ({
    ...detail,
    run: {
      ...detail.run,
      status: payload.status,
      updated_at: new Date().toISOString(),
    },
  }));
}

function applyPaperRunError(payload: PaperRunErrorEvent) {
  updatePaperRunList(payload.run_id, (run) => ({
    ...run,
    status: "STOPPED",
    updated_at: new Date().toISOString(),
  }));

  updatePaperRunDetail(payload.run_id, (detail) => ({
    ...detail,
    run: {
      ...detail.run,
      status: "STOPPED",
      updated_at: new Date().toISOString(),
    },
  }));
}

function applyPaperTick(payload: PaperTick) {
  updatePaperRunList(payload.run_id, (run) => ({
    ...run,
    last_price: payload.close,
    updated_at: new Date().toISOString(),
  }));

  updatePaperRunDetail(payload.run_id, (detail) => ({
    ...detail,
    run: {
      ...detail.run,
      last_price: payload.close,
      updated_at: new Date().toISOString(),
    },
  }));
}

function applyBacktestProgress(payload: BacktestProgressEvent) {
  updateQuery<BacktestStatusResponse>(
    backtestStatusKey(payload.run_id),
    (current) => {
      const previous = current ?? {
        data: null,
        loading: false,
        error: null,
      };

      return {
        ...previous,
        data: {
          status: payload.status,
          progress: payload.progress,
        },
        loading: false,
        error: null,
      };
    }
  );

  updateQuery<BacktestRun[]>(BACKTESTS, (current) => {
    if (!current?.data) {
      return current;
    }

    return {
      ...current,
      data: current.data.map((run) =>
        run.id === payload.run_id
          ? {
              ...run,
              status: payload.status,
            }
          : run
      ),
    };
  });
}

export function registerEventBindings() {
  if (bindingsRegistered) {
    return;
  }

  bindingsRegistered = true;

  updateFromEvent("paper_tick", applyPaperTick);
  updateFromEvent("paper_run_update", applyPaperRunUpdate);
  updateFromEvent("paper_run_status", applyPaperRunStatus);
  updateFromEvent("paper_run_error", applyPaperRunError);
  updateFromEvent("backtest_progress", applyBacktestProgress);
}
