import axios from "axios";
import { createRequire } from "module";
import { Logger } from "../core/logger";

const require = createRequire(import.meta.url);
const WS: any = require("ws");

const BINANCE_SPOT = "https://api.binance.com/api/v3";
const BINANCE_FUTURES = "https://fapi.binance.com/fapi/v1";

const logger = new Logger("BinanceWS");

/**
 * Fetch current spot price
 */
export async function fetchSpotPrice(symbol: string) {
  const res = await axios.get(`${BINANCE_SPOT}/ticker/price?symbol=${symbol}USDT`);
  return parseFloat(res.data.price);
}

/**
 * Fetch current futures price
 */
export async function fetchFuturesPrice(symbol: string) {
  const res = await axios.get(`${BINANCE_FUTURES}/ticker/price?symbol=${symbol}USDT`);
  return parseFloat(res.data.price);
}

/**
 * Fetch historical klines (candlestick data)
 */
export async function fetchKlines(symbol: string, interval = "1h", limit = 500) {
  const res = await axios.get(`${BINANCE_SPOT}/klines`, {
    params: { symbol: `${symbol}USDT`, interval, limit },
  });
  return res.data.map((k: any) => ({
    time: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

/**
 * Stream live price updates via WebSocket (miniTicker)
 * Tries .com first, falls back to .me, with 5s no-tick watchdog.
 */
export function streamLivePrice(symbol: string, onUpdate: (price: number, volume: number) => void) {
  const lower = symbol.toLowerCase();
  const streamName = `${lower}usdt@miniTicker`;

  const domains = [
    "wss://stream.binance.com:9443/ws",
    "wss://stream.binance.me:9443/ws",
  ];
  let currentDomainIndex = 0;
  let ws: any = null;
  let reconnectTimer: NodeJS.Timeout | null = null;

  const clearTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleWatchdog = () => {
    clearTimer();
    reconnectTimer = setTimeout(() => {
      logger.warn("[Binance] No ticks received in 5s, switching domain...");
      fallback();
    }, 5000);
  };

  const connect = () => {
    const url = `${domains[currentDomainIndex]}/${streamName}`;
    logger.debug(`[Binance] Connecting to ${url}`);
    const socket: any = new WS(url);
    ws = socket;

    socket.on("open", () => {
      logger.info(`[Binance] ✅ Connected to ${domains[currentDomainIndex]}`);
      scheduleWatchdog();
    });

    socket.on("message", (msg: any) => {
      try {
        const data = JSON.parse(msg.toString());
        const price = parseFloat(data.c);
        if (!isNaN(price)) {
          logger.debug(`Received price tick for ${symbol.toUpperCase()}USDT: ${price}`);
          onUpdate(price, 0);
          scheduleWatchdog();
        }
      } catch (err: unknown) {
        logger.error(`[Binance] JSON parse error: ${String(err)}`);
      }
    });

    socket.on("error", (err: unknown) => {
      logger.error(`[Binance] WebSocket error: ${String(err)}`);
      fallback();
    });

    socket.on("close", () => {
      logger.warn("[Binance] WebSocket closed, reconnecting...");
      fallback();
    });
  };

  const fallback = () => {
    try { ws?.close(); } catch {}
    clearTimer();
    currentDomainIndex = (currentDomainIndex + 1) % domains.length;
    logger.warn(`[Binance] 🔄 Retrying with ${domains[currentDomainIndex]}...`);
    setTimeout(connect, 2000);
  };

  connect();
  return ws as any;
}
