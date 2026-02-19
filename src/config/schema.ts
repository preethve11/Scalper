/**
 * Configuration schema and types.
 * Strategy, risk, backtest, and execution parameters.
 */

export interface StrategyConfig {
  timeframeMinutes: number;
  minCandleHistory: number;
  entryThreshold: number;
  minConfidenceToExecute: number;
  indicators: {
    rsiPeriod: number;
    rsiOversold: number;
    rsiOverbought: number;
    macdFast: number;
    macdSlow: number;
    bollingerPeriod: number;
    bollingerStdDev: number;
    smaShort: number;
    smaLong: number;
    emaShort: number;
    emaLong: number;
  };
  whaleBullishThreshold: number;
  whaleConfidenceBoost: number;
}

export interface RiskConfig {
  maxTradePctPerTrade: number;
  minBalanceUSD: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxOpenPositions: number;
  fixedNotionalUSD: number | null;
}

export interface BacktestConfig {
  initialBalanceUSD: number;
  commissionPct: number;
  rsiBuyBelow: number;
  rsiSellAbove: number;
}

export interface ExecutionConfig {
  mode: 'dry' | 'live';
  slippageBps: number;
  maxRetries: number;
  retryDelayMs: number;
  minSolBalanceLamports: number;
}

export interface AppConfig {
  strategy: StrategyConfig;
  risk: RiskConfig;
  backtest: BacktestConfig;
  execution: ExecutionConfig;
}
