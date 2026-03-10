import { Server, Socket } from "socket.io";
import {
  JoinPaperRunSchema,
  LeavePaperRunSchema,
  PortfolioUpdateEventSchema,
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
  portfolio_update: typeof PortfolioUpdateEventSchema;
};

const paperEventSchemas: PaperEventSchemaMap = {
  paper_tick: PaperTickSchema,
  trade_execution: TradeExecutionSchema,
  paper_run_update: PaperRunUpdateEventSchema,
  paper_run_status: PaperRunStatusEventSchema,
  paper_run_error: PaperRunErrorEventSchema,
  portfolio_update: PortfolioUpdateEventSchema,
};

export function initializeWebsocket(
  io: Server<ClientToServerEvents, ServerToClientEvents>
) {
  ioInstance = io;

  io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
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
  });
}

export async function emitPaperEvent(
  runId: string,
  event: keyof PaperEventSchemaMap | "order_update",
  payload: unknown
) {
  if (!ioInstance) return;

  const room = `paper:${runId}`;

  switch (event) {
    case "paper_tick":
      ioInstance.to(room).emit("paper_tick", PaperTickSchema.parse(payload));
      break;
    case "trade_execution":
      {
        const parsed = TradeExecutionSchema.parse(payload);
        ioInstance.to(room).emit("trade_execution", parsed);
        const rawIo = ioInstance as unknown as {
          to: (targetRoom: string) => {
            emit: (event: string, data: unknown) => void;
          };
        };
        rawIo.to(room).emit("paper_trade", parsed);
      }
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
    case "portfolio_update":
      {
        const parsed = PortfolioUpdateEventSchema.parse(payload);
        ioInstance.to(room).emit("portfolio_update", parsed);
        const rawIo = ioInstance as unknown as {
          to: (targetRoom: string) => {
            emit: (event: string, data: unknown) => void;
          };
        };
        rawIo.to(room).emit("paper_portfolio_update", parsed);
      }
      break;
    case "order_update":
      {
        const rawIo = ioInstance as unknown as {
          to: (targetRoom: string) => {
            emit: (eventName: string, data: unknown) => void;
          };
        };
        rawIo.to(room).emit("order_update", payload);
      }
      break;
  }
}
