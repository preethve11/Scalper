// src/engine/tradeExecutor.ts
import { JupiterDEX } from "../dex/jupiter";
import { Logger } from "../core/logger";
import { calculatePositionSizeLegacy, withinLimits } from "./risk";

export interface TradeExecutorConfig {
  mode: "DRY_RUN" | "LIVE"
  maxTradePctPerTrade: number
  minBalanceUSD: number
}

export class TradeExecutor {
  private dex: JupiterDEX
  private logger: Logger
  private cfg: TradeExecutorConfig
  private balanceUSD: number

  constructor(dex: JupiterDEX, logger: Logger, cfg: TradeExecutorConfig, initialBalance = 10000) {
    this.dex = dex
    this.logger = logger
    this.cfg = cfg
    this.balanceUSD = initialBalance
  }

  public getBalance() {
    return this.balanceUSD
  }

  async executeSignal(signal: {
    action: "BUY" | "SELL" | "HOLD"
    token: string
    price: number
    confidence: number
  }) {
    if (signal.action === "HOLD") return

    const tradeSize = calculatePositionSizeLegacy(this.balanceUSD, {
      maxTradePctPerTrade: this.cfg.maxTradePctPerTrade,
      minBalanceUSD: this.cfg.minBalanceUSD,
    });

    if (!withinLimits(this.balanceUSD, tradeSize, {
      maxTradePctPerTrade: this.cfg.maxTradePctPerTrade,
      minBalanceUSD: this.cfg.minBalanceUSD,
    })) {
      this.logger.warn(`Skipped trade: size ${tradeSize} out of limits.`);
      return;
    }

    if (this.cfg.mode === "DRY_RUN") {
      const pnl = signal.action === "BUY" ? 0 : (Math.random() - 0.5) * 2;
      this.balanceUSD += (this.balanceUSD * pnl) / 100;
      this.logger.info(
        `💧 DRY-RUN ${signal.action} ${signal.token} @ ${signal.price.toFixed(2)} | est size: $${tradeSize.toFixed(2)} | new balance: $${this.balanceUSD.toFixed(2)}`
      );
      return;
    }

    try {
      const quote = await (this.dex as any).getBestQuote?.(signal.token, tradeSize);
      const tx = await (this.dex as any).executeSwap?.(quote);
      this.logger.info(`Executed LIVE ${signal.action} ${signal.token}: tx=${tx}`);
    } catch (err) {
      this.logger.error(`Trade failed: ${err}`);
    }
  }
}
