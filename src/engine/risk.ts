/**
 * Risk management: position sizing, limits, stop loss and take profit.
 * Uses config from config/loadConfig (fraction for maxTradePctPerTrade: 0.1 = 10%).
 */

import type { RiskConfig as AppRiskConfig } from '../config/schema';
import { getConfig } from '../config/loadConfig';

/** Legacy shape for backward compatibility (percentage 0–100). */
export interface RiskConfig {
  maxTradePctPerTrade: number;
  minBalanceUSD: number;
}

/**
 * Convert app config risk (fraction 0–1) to legacy RiskConfig (percentage 0–100).
 */
function toLegacyRiskConfig(cfg: AppRiskConfig): RiskConfig {
  return {
    maxTradePctPerTrade: cfg.maxTradePctPerTrade * 100,
    minBalanceUSD: cfg.minBalanceUSD,
  };
}

/**
 * Position size in USD. Uses fixed notional if set, else balance * maxTradePctPerTrade.
 */
export function calculatePositionSize(balanceUSD: number, cfg?: AppRiskConfig): number {
  const app = cfg ?? getConfig().risk;
  if (balanceUSD < app.minBalanceUSD) return 0;
  if (app.fixedNotionalUSD != null && app.fixedNotionalUSD > 0) {
    return Math.min(app.fixedNotionalUSD, balanceUSD * app.maxTradePctPerTrade);
  }
  return balanceUSD * app.maxTradePctPerTrade;
}

/** Legacy: cfg.maxTradePctPerTrade as percentage (e.g. 10 for 10%). */
export function calculatePositionSizeLegacy(balanceUSD: number, cfg: RiskConfig): number {
  if (balanceUSD < cfg.minBalanceUSD) return 0;
  return (balanceUSD * cfg.maxTradePctPerTrade) / 100;
}

export function withinLimits(
  balanceUSD: number,
  tradeSize: number,
  cfg: RiskConfig
): boolean {
  if (tradeSize <= 0) return false;
  const maxPct = cfg.maxTradePctPerTrade / 100;
  if (tradeSize > balanceUSD * maxPct) return false;
  return true;
}

/**
 * Check if stop loss hit: price moved down by stopLossPct from entry.
 */
export function isStopLossHit(entryPrice: number, currentPrice: number, stopLossPct: number): boolean {
  if (stopLossPct <= 0 || entryPrice <= 0) return false;
  const threshold = entryPrice * (1 - stopLossPct / 100);
  return currentPrice <= threshold;
}

/**
 * Check if take profit hit: price moved up by takeProfitPct from entry.
 */
export function isTakeProfitHit(entryPrice: number, currentPrice: number, takeProfitPct: number): boolean {
  if (takeProfitPct <= 0 || entryPrice <= 0) return false;
  const threshold = entryPrice * (1 + takeProfitPct / 100);
  return currentPrice >= threshold;
}

/**
 * Get position size in USD for live execution using app config.
 */
export function getPositionSizeUSD(balanceUSD: number): number {
  const cfg = getConfig().risk;
  return calculatePositionSize(balanceUSD, cfg);
}
