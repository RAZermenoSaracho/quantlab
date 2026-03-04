import { io, Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@quantlab/contracts";

const SOCKET_BASE =
  import.meta.env.VITE_API_URL?.replace("/api", "") || "http://localhost:5000";

export type QuantlabSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: QuantlabSocket | null = null;

/* =====================================================
   CONNECT
===================================================== */

export function connectSocket(): QuantlabSocket {
  if (socket) return socket;

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
