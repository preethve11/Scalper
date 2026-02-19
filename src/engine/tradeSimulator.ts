import { Logger } from "../core/logger";

interface Trade {
  side: "BUY" | "SELL";
  price: number;
  time: number;
  size: number;
  pnl?: number;
}

export class TradeSimulator {
  private balance: number;
  private positionSize: number;
  private entryPrice: number | null;
  private trades: Trade[] = [];
  private logger: Logger;

  constructor(initialBalance = 10000) {
    this.balance = initialBalance;
    this.positionSize = 0;
    this.entryPrice = null;
    this.logger = new Logger("TradeSimulator");
  }

  handleSignal(signal: "BUY" | "SELL", price: number) {
    const now = Date.now();

    if (signal === "BUY" && this.positionSize === 0) {
      // Open position with 10% allocation
      const size = (this.balance * 0.1) / Math.max(price, 1e-9);
      this.positionSize = size;
      this.entryPrice = price;
      this.balance -= size * price;
      this.trades.push({ side: "BUY", price, time: now, size });
      this.logger.info(`🟢 BUY @ ${price.toFixed(4)} | Size: ${size.toFixed(4)}`);
    }

    if (signal === "SELL" && this.positionSize > 0 && this.entryPrice !== null) {
      // Close position
      const pnl = (price - this.entryPrice) * this.positionSize;
      this.balance += this.positionSize * price;
      this.trades.push({ side: "SELL", price, time: now, size: this.positionSize, pnl });
      this.logger.info(`🔴 SELL @ ${price.toFixed(4)} | PnL: ${pnl.toFixed(2)} | Balance: ${this.balance.toFixed(2)}`);
      this.positionSize = 0;
      this.entryPrice = null;
    }
  }

  getStats() {
    const totalPnl = this.trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    return {
      balance: this.balance,
      totalPnl,
      numTrades: this.trades.length,
      openPosition: this.positionSize > 0,
    };
  }
}
