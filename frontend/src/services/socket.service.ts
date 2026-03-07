import { io, Socket } from "socket.io-client";
import {
  type ClientToServerEvents,
  type PortfolioUpdateEvent,
  type ServerToClientEvents,
  type TradeExecution,
} from "@quantlab/contracts";
import type {
  Socket as SocketIOClient,
} from "socket.io-client";
import { registerEventBindings } from "../data/eventBindings";
import { emit } from "../events/eventBus";

const SOCKET_BASE =
  import.meta.env.VITE_API_URL?.replace("/api", "") || "http://localhost:5000";

export type QuantlabSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type UntypedSocket = SocketIOClient & {
  on: (event: string, listener: (payload: unknown) => void) => SocketIOClient;
};

function isTradeExecution(payload: unknown): payload is TradeExecution {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const record = payload as Record<string, unknown>;
  return (
    typeof record.run_id === "string" &&
    (record.side === "LONG" || record.side === "SHORT") &&
    typeof record.entry_price === "number" &&
    typeof record.quantity === "number"
  );
}

function isPortfolioUpdate(payload: unknown): payload is PortfolioUpdateEvent {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const record = payload as Record<string, unknown>;
  return (
    typeof record.run_id === "string" &&
    typeof record.usdt_balance === "number" &&
    typeof record.btc_balance === "number" &&
    typeof record.equity === "number"
  );
}

let socket: QuantlabSocket | null = null;

/* =====================================================
   CONNECT
===================================================== */

export function connectSocket(): QuantlabSocket {
  if (socket) return socket;

  registerEventBindings();

  const token = localStorage.getItem("token");

  socket = io(SOCKET_BASE, {
    transports: ["websocket"],
    auth: { token },
  });

  socket.on("connect_error", (err) => {
    console.error("Socket connection error:", err.message);
  });

  socket.on("paper_tick", (payload) => {
    emit("paper_tick", payload);
  });

  socket.on("trade_execution", (payload) => {
    emit("trade_execution", payload);
  });

  socket.on("paper_run_update", (payload) => {
    emit("paper_run_update", payload);
  });

  socket.on("paper_run_status", (payload) => {
    emit("paper_run_status", payload);
  });

  socket.on("paper_run_error", (payload) => {
    emit("paper_run_error", payload);
  });

  socket.on("portfolio_update", (payload) => {
    emit("portfolio_update", payload);
  });

  const aliasSocket = socket as unknown as UntypedSocket;
  aliasSocket.on("paper_trade", (payload) => {
    if (isTradeExecution(payload)) {
      emit("trade_execution", payload);
    }
  });

  aliasSocket.on("paper_portfolio_update", (payload) => {
    if (isPortfolioUpdate(payload)) {
      emit("portfolio_update", payload);
    }
  });

  socket.on("backtest_progress", (payload) => {
    emit("backtest_progress", payload);
  });

  return socket;
}

/* =====================================================
   GET INSTANCE
===================================================== */

export function getSocket(): QuantlabSocket | null {
  return socket;
}

/* =====================================================
   DISCONNECT
===================================================== */

export function disconnectSocket() {
  if (!socket) return;
  socket.disconnect();
  socket = null;
}
