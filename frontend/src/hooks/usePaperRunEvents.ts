import { useEffect, useRef, useState } from "react";
import type {
  PaperRunErrorEvent,
  PaperRunStatusEvent,
  PaperRunUpdateEvent,
  PaperTick,
  TradeExecution,
} from "@quantlab/contracts";
import { connectSocket } from "../services/socket.service";

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

    socket.emit("join_paper_run", runId);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    const onTick = (payload: PaperTick) => {
      handlersRef.current.onTick?.(payload);
    };
    const onTradeExecution = (payload: TradeExecution) => {
      handlersRef.current.onTradeExecution?.(payload);
    };
    const onRunUpdate = (payload: PaperRunUpdateEvent) => {
      handlersRef.current.onRunUpdate?.(payload);
    };
    const onRunStatus = (payload: PaperRunStatusEvent) => {
      handlersRef.current.onRunStatus?.(payload);
    };
    const onRunError = (payload: PaperRunErrorEvent) => {
      handlersRef.current.onRunError?.(payload);
    };

    socket.on("paper_tick", onTick);
    socket.on("trade_execution", onTradeExecution);
    socket.on("paper_run_update", onRunUpdate);
    socket.on("paper_run_status", onRunStatus);
    socket.on("paper_run_error", onRunError);

    return () => {
      socket.emit("leave_paper_run", runId);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("paper_tick", onTick);
      socket.off("trade_execution", onTradeExecution);
      socket.off("paper_run_update", onRunUpdate);
      socket.off("paper_run_status", onRunStatus);
      socket.off("paper_run_error", onRunError);
    };
  }, [runId]);

  return { backendConnected };
}
