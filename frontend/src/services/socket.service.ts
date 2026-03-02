import { io, Socket } from "socket.io-client";

const SOCKET_BASE =
  import.meta.env.VITE_API_URL?.replace("/api", "") ||
  "http://localhost:5000";

let socket: Socket | null = null;

/* =====================================================
   CONNECT
===================================================== */

export function connectSocket(): Socket {
  if (socket) return socket;

  const token = localStorage.getItem("token");

  socket = io(SOCKET_BASE, {
    transports: ["websocket"],
    auth: {
      token,
    },
  });

  socket.on("connect", () => {
    console.log("🟢 Socket connected:", socket?.id);
  });

  socket.on("disconnect", () => {
    console.log("🔴 Socket disconnected");
  });

  socket.on("connect_error", (err) => {
    console.error("Socket connection error:", err.message);
  });

  return socket;
}

/* =====================================================
   GET INSTANCE
===================================================== */

export function getSocket(): Socket | null {
  return socket;
}

/* =====================================================
   DISCONNECT
===================================================== */

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}