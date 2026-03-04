import { Server, Socket } from "socket.io";
import {
  JoinPaperRunSchema,
  LeavePaperRunSchema,
  PaperRunErrorEventSchema,
  PaperRunStatusEventSchema,
  PaperRunUpdateEventSchema,
  PaperTickSchema,
  TradeExecutionSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@quantlab/contracts";

let ioInstance: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

type PaperEventSchemaMap = {
  paper_tick: typeof PaperTickSchema;
  trade_execution: typeof TradeExecutionSchema;
  paper_run_update: typeof PaperRunUpdateEventSchema;
  paper_run_status: typeof PaperRunStatusEventSchema;
  paper_run_error: typeof PaperRunErrorEventSchema;
};

const paperEventSchemas: PaperEventSchemaMap = {
  paper_tick: PaperTickSchema,
  trade_execution: TradeExecutionSchema,
  paper_run_update: PaperRunUpdateEventSchema,
  paper_run_status: PaperRunStatusEventSchema,
  paper_run_error: PaperRunErrorEventSchema,
};

export function initializeWebsocket(
  io: Server<ClientToServerEvents, ServerToClientEvents>
) {
  ioInstance = io;

  io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on("join_paper_run", (runId) => {
      const parsed = JoinPaperRunSchema.safeParse(runId);
      if (!parsed.success) return;
      socket.join(`paper:${parsed.data}`);
    });

    socket.on("leave_paper_run", (runId) => {
      const parsed = LeavePaperRunSchema.safeParse(runId);
      if (!parsed.success) return;
      socket.leave(`paper:${parsed.data}`);
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
}

export async function emitPaperEvent(
  runId: string,
  event: keyof PaperEventSchemaMap,
  payload: unknown
) {
  if (!ioInstance) return;

  const room = `paper:${runId}`;
  try {
    const sockets = await ioInstance.in(room).allSockets();
    console.log(`[WS EMIT] event=${event} room=${room} sockets=${sockets.size}`);
  } catch {
    console.log(`[WS EMIT] event=${event} room=${room} (could not count sockets)`);
  }

  switch (event) {
    case "paper_tick":
      ioInstance.to(room).emit("paper_tick", PaperTickSchema.parse(payload));
      break;
    case "trade_execution":
      ioInstance
        .to(room)
        .emit("trade_execution", TradeExecutionSchema.parse(payload));
      break;
    case "paper_run_update":
      ioInstance
        .to(room)
        .emit("paper_run_update", PaperRunUpdateEventSchema.parse(payload));
      break;
    case "paper_run_status":
      ioInstance
        .to(room)
        .emit("paper_run_status", PaperRunStatusEventSchema.parse(payload));
      break;
    case "paper_run_error":
      ioInstance
        .to(room)
        .emit("paper_run_error", PaperRunErrorEventSchema.parse(payload));
      break;
  }
}
