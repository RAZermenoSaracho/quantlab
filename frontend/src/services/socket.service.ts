import { io, Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@quantlab/contracts";
import { registerEventBindings } from "../data/eventBindings";
import { emit } from "../events/eventBus";

const SOCKET_BASE =
  import.meta.env.VITE_API_URL?.replace("/api", "") || "http://localhost:5000";

export type QuantlabSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

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

  socket.on("connect", () => {
    console.log("Socket connected:", socket?.id);
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected");
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
