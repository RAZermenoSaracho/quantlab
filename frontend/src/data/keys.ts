export const ALGORITHMS = "algorithms";
export const BACKTESTS = "backtests";
export const PAPER_RUNS = "paperRuns";
export const SYMBOLS = "symbols";
export const EXCHANGES = "exchanges";

export const algorithmKey = (id: string) => `${ALGORITHMS}:${id}`;
export const algorithmRunsKey = (id: string) => `${algorithmKey(id)}:runs`;

export const backtestKey = (id: string) => `${BACKTESTS}:${id}`;
export const backtestStatusKey = (id: string) => `${backtestKey(id)}:status`;

export const paperRunKey = (id: string) => `${PAPER_RUNS}:${id}`;

export const symbolsKey = (exchange: string, query: string) =>
  `${SYMBOLS}:${exchange}:${query}`;

export const defaultFeeRateKey = (exchange: string) =>
  `${EXCHANGES}:${exchange}:fee-rate`;
