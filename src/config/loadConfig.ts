/**
 * Load app configuration from config/config.yaml with env overrides.
 * Uses defaults if file is missing so backtest/live can run without YAML.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import type { AppConfig, StrategyConfig, RiskConfig, BacktestConfig, ExecutionConfig } from './schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const DEFAULT_CONFIG: AppConfig = {
  strategy: {
    timeframeMinutes: 1,
    minCandleHistory: 50,
    entryThreshold: 0.3,
    minConfidenceToExecute: 0.7,
    indicators: {
      rsiPeriod: 14,
      rsiOversold: 30,
      rsiOverbought: 70,
      macdFast: 12,
      macdSlow: 26,
      bollingerPeriod: 20,
      bollingerStdDev: 2,
      smaShort: 20,
      smaLong: 50,
      emaShort: 12,
      emaLong: 26,
    },
    whaleBullishThreshold: 50,
    whaleConfidenceBoost: 0.1,
  },
  risk: {
    maxTradePctPerTrade: 0.1,
    minBalanceUSD: 100,
    stopLossPct: 2.0,
    takeProfitPct: 1.5,
    maxOpenPositions: 1,
    fixedNotionalUSD: null,
  },
  backtest: {
    initialBalanceUSD: 10000,
    commissionPct: 0.1,
    rsiBuyBelow: 30,
    rsiSellAbove: 70,
  },
  execution: {
    mode: 'dry',
    slippageBps: 50,
    maxRetries: 3,
    retryDelayMs: 1000,
    minSolBalanceLamports: 10_000_000,
  },
};

function parseYamlSafe(content: string): Record<string, unknown> {
  try {
    const yaml = require('js-yaml') as { load: (s: string) => unknown };
    return (yaml.load(content) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

function deepMerge<T>(target: T, source: Partial<Record<string, unknown>>): T {
  const out = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    const v = source[key];
    if (v != null && typeof v === 'object' && !Array.isArray(v) && typeof (target as Record<string, unknown>)[key] === 'object') {
      (out as Record<string, unknown>)[key] = deepMerge(
        (target as Record<string, unknown>)[key] as object,
        v as Record<string, unknown>
      );
    } else if (v !== undefined) {
      (out as Record<string, unknown>)[key] = v;
    }
  }
  return out as T;
}

function applyEnvOverrides(config: AppConfig): AppConfig {
  const e = process.env;
  return {
    ...config,
    strategy: {
      ...config.strategy,
      minConfidenceToExecute: e.MIN_CONFIDENCE_TO_EXECUTE != null ? Number(e.MIN_CONFIDENCE_TO_EXECUTE) : config.strategy.minConfidenceToExecute,
      whaleBullishThreshold: e.WHALE_BULLISH_THRESHOLD != null ? Number(e.WHALE_BULLISH_THRESHOLD) : config.strategy.whaleBullishThreshold,
    },
    risk: {
      ...config.risk,
      maxTradePctPerTrade: e.MAX_TRADE_PCT != null ? Number(e.MAX_TRADE_PCT) : config.risk.maxTradePctPerTrade,
      minBalanceUSD: e.MIN_BALANCE_USD != null ? Number(e.MIN_BALANCE_USD) : config.risk.minBalanceUSD,
      stopLossPct: e.STOP_LOSS_PCT != null ? Number(e.STOP_LOSS_PCT) : config.risk.stopLossPct,
      takeProfitPct: e.TAKE_PROFIT_PCT != null ? Number(e.TAKE_PROFIT_PCT) : config.risk.takeProfitPct,
      fixedNotionalUSD: e.FIXED_NOTIONAL_USD != null ? Number(e.FIXED_NOTIONAL_USD) : config.risk.fixedNotionalUSD,
    },
    execution: {
      ...config.execution,
      mode: (e.TRADE_MODE === 'live' ? 'live' : 'dry') as 'dry' | 'live',
      slippageBps: e.SLIPPAGE_BPS != null ? Number(e.SLIPPAGE_BPS) : config.execution.slippageBps,
      maxRetries: e.MAX_EXEC_RETRIES != null ? Number(e.MAX_EXEC_RETRIES) : config.execution.maxRetries,
      retryDelayMs: e.RETRY_DELAY_MS != null ? Number(e.RETRY_DELAY_MS) : config.execution.retryDelayMs,
      minSolBalanceLamports: e.MIN_SOL_BALANCE_LAMPORTS != null ? Number(e.MIN_SOL_BALANCE_LAMPORTS) : config.execution.minSolBalanceLamports,
    },
  };
}

/** Load config from config/config.yaml (relative to project root) with env overrides. */
export function loadConfig(configPath?: string): AppConfig {
  const root = path.resolve(__dirname, '../..');
  const yamlPath = configPath ?? path.join(root, 'config', 'config.yaml');
  let base: Record<string, unknown> = {};
  if (fs.existsSync(yamlPath)) {
    const content = fs.readFileSync(yamlPath, 'utf8');
    base = parseYamlSafe(content);
  }
  const merged = deepMerge(DEFAULT_CONFIG, base as Partial<Record<string, unknown>>) as AppConfig;
  return applyEnvOverrides(merged);
}

let cachedConfig: AppConfig | null = null;

/** Get singleton config (loads once, sync). */
export function getConfig(): AppConfig {
  if (!cachedConfig) cachedConfig = loadConfig();
  return cachedConfig;
}

export type { AppConfig, StrategyConfig, RiskConfig, BacktestConfig, ExecutionConfig };
