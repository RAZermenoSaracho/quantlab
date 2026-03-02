import { Server, Socket } from "socket.io";

let ioInstance: Server | null = null;

export function initializeWebsocket(io: Server) {
  ioInstance = io;

  io.on("connection", (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on("join_paper_run", (runId: string) => {
      if (!runId) return;
      socket.join(`paper:${runId}`);
    });

    socket.on("leave_paper_run", (runId: string) => {
      if (!runId) return;
      socket.leave(`paper:${runId}`);
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
}

export function emitPaperEvent(
  runId: string,
  event: string,
  payload: any
) {
  if (!ioInstance) return;
  ioInstance.to(`paper:${runId}`).emit(event, payload);
}