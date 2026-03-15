import {
  OptimizerEngineRequestSchema,
  type OptimizerEngineRequest,
  type OptimizerParamSpace,
  type OptimizerRanking,
} from "@quantlab/contracts";
import { runOptimizerOnEngine } from "./pythonEngine.service";

type OptimizerBacktestContext = {
  exchange: string;
  symbol: string;
  timeframe: OptimizerEngineRequest["timeframe"];
  initial_balance: number;
  start_date: string;
  end_date: string;
  fee_rate: number | null;
};

export async function runOptimizer(
  code: string,
  context: OptimizerBacktestContext,
  paramSpace: OptimizerParamSpace
): Promise<OptimizerRanking> {
  const payload = OptimizerEngineRequestSchema.parse({
    code,
    exchange: context.exchange,
    symbol: context.symbol,
    timeframe: context.timeframe,
    initial_balance: context.initial_balance,
    start_date: context.start_date,
    end_date: context.end_date,
    fee_rate: context.fee_rate ?? undefined,
    param_space: paramSpace,
  });

  const ranking = await runOptimizerOnEngine(payload);
  return {
    ...ranking,
    baseline: {
      exchange: payload.exchange,
      symbol: payload.symbol,
      timeframe: payload.timeframe,
      initial_balance: payload.initial_balance,
      start_date: payload.start_date,
      end_date: payload.end_date,
      fee_rate: payload.fee_rate ?? null,
    },
  };
}
