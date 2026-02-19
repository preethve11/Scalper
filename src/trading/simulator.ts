import { Logger } from "../core/logger";

const logger = new Logger("Simulator");

let balance = 10000;
let position: null | { side: "BUY" | "SELL"; entry: number } = null;

export function simulateTrade(signal: "BUY" | "SELL" | "HOLD", price: number) {
  if (signal === "HOLD") return;

  if (!position) {
    position = { side: signal, entry: price };
    logger.info(`Opened ${signal} at $${price}`);
  } else if (position.side !== signal) {
    const profit = position.side === "BUY"
      ? price - position.entry
      : position.entry - price;

    balance += profit;
    logger.info(`Closed ${position.side}, PnL: ${profit.toFixed(2)}, Balance: $${balance.toFixed(2)}`);
    position = null;
  }
}

