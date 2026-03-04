import { useEffect, useRef, useState } from "react";
import type {
  PaperRunErrorEvent,
  PaperRunStatusEvent,
  PaperRunUpdateEvent,
  PaperTick,
  TradeExecution,
} from "@quantlab/contracts";
import { connectSocket } from "../services/socket.service";
import { useEventSubscription } from "./useEventSubscription";

type Handlers = {
  onTick?: (payload: PaperTick) => void;
  onTradeExecution?: (payload: TradeExecution) => void;
  onRunUpdate?: (payload: PaperRunUpdateEvent) => void;
  onRunStatus?: (payload: PaperRunStatusEvent) => void;
  onRunError?: (payload: PaperRunErrorEvent) => void;
};

export function usePaperRunEvents(runId: string, handlers: Handlers) {
  const [backendConnected, setBackendConnected] = useState(false);
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!runId) {
      return;
    }

    const socket = connectSocket();

    const onConnect = () => setBackendConnected(true);
    const onDisconnect = () => setBackendConnected(false);

    setBackendConnected(socket.connected);
    socket.emit("join_paper_run", runId);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.emit("leave_paper_run", runId);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [runId]);

  useEventSubscription(
    "paper_tick",
    (payload: PaperTick) => {
      if (payload.run_id !== runId) {
        return;
      }

      handlersRef.current.onTick?.(payload);
    },
    Boolean(runId)
  );

  useEventSubscription(
    "trade_execution",
    (payload: TradeExecution) => {
      if (payload.run_id !== runId) {
        return;
      }

      handlersRef.current.onTradeExecution?.(payload);
    },
    Boolean(runId)
  );

  useEventSubscription(
    "paper_run_update",
    (payload: PaperRunUpdateEvent) => {
      if (payload.run_id !== runId) {
        return;
      }

      handlersRef.current.onRunUpdate?.(payload);
    },
    Boolean(runId)
  );

  useEventSubscription(
    "paper_run_status",
    (payload: PaperRunStatusEvent) => {
      if (payload.run_id !== runId) {
        return;
      }

      handlersRef.current.onRunStatus?.(payload);
    },
    Boolean(runId)
  );

  useEventSubscription(
    "paper_run_error",
    (payload: PaperRunErrorEvent) => {
      if (payload.run_id !== runId) {
        return;
      }

      handlersRef.current.onRunError?.(payload);
    },
    Boolean(runId)
  );

  return { backendConnected };
}
