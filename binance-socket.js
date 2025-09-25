// binance-socket.js

/**
 * Helper class for interacting with Binance REST & WebSocket APIs.
 * Handles:
 *   - validating symbols
 *   - fetching historical candles
 *   - subscribing/unsubscribing to live streams
 */
export default class BinanceSocket {
  constructor() {
    // Map: `${symbol}-${interval}` → Set of callbacks
    this.subscriptions = new Map();

    // Active WebSocket connections
    this.sockets = new Map();
  }

  /**
   * Validate a symbol against Binance exchange info
   * @param {string} symbol
   * @returns {Promise<boolean>}
   */
  async isValidSymbol(symbol) {
    try {
      const res = await fetch('https://api.binance.com/api/v3/exchangeInfo');
      const data = await res.json();
      return data.symbols.some(s => s.symbol.toUpperCase() === symbol.toUpperCase());
    } catch (err) {
      console.error('[BinanceSocket] Symbol validation failed', err);
      return false;
    }
  }

  /**
   * Fetch historical candles
   * @param {string} symbol
   * @param {string} interval
   * @param {number} [limit=500]
   * @returns {Promise<Array>}
   */
  async getHistoricalData(symbol, interval, limit = 500) {
    try {
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      const res = await fetch(url);
      const data = await res.json();

      return data.map(c => ({
        time: Math.floor(c[0] / 1000), // seconds
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
      }));
    } catch (err) {
      console.error(`[BinanceSocket] Failed to fetch historical data for ${symbol} [${interval}]`, err);
      return [];
    }
  }

  /**
   * Start a WebSocket for symbol/interval
   * @param {string} symbol
   * @param {string} interval
   * @param {Function} callback
   */
  async startSocket(symbol, interval, callback) {
    const key = `${symbol}-${interval}`;
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set());
    }
    this.subscriptions.get(key).add(callback);

    if (this.sockets.has(key)) {
      return; // already running
    }

    const streamName = `${symbol.toLowerCase()}@kline_${interval}`;
    const wsUrl = `wss://stream.binance.com:9443/ws/${streamName}`;
    const ws = new WebSocket(wsUrl);
    this.sockets.set(key, ws);

    ws.onopen = () => {
      console.log(`[BinanceSocket] Connected: ${key}`);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (!msg.k) return;

        const k = msg.k; // kline payload
        const candle = {
          time: Math.floor(k.t / 1000),
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
        };

        const isClosed = k.x === true;

        // fan out to callbacks
        const cbs = this.subscriptions.get(key);
        if (cbs) {
          cbs.forEach(cb => {
            try {
              cb(candle, isClosed);
            } catch (err) {
              console.warn('[BinanceSocket] Callback error', err);
            }
          });
        }
      } catch (err) {
        console.error('[BinanceSocket] Failed to parse WebSocket message', err);
      }
    };

    ws.onerror = (err) => {
      console.error(`[BinanceSocket] WebSocket error for ${key}`, err);
    };

    ws.onclose = () => {
      console.log(`[BinanceSocket] Closed: ${key}`);
      this.sockets.delete(key);
      this.subscriptions.delete(key);
    };
  }

  /**
   * Unsubscribe a callback from a symbol/interval
   * @param {string} symbol
   * @param {string} interval
   * @param {Function} callback
   */
  async unsubscribeCallback(symbol, interval, callback) {
    const key = `${symbol}-${interval}`;
    const cbs = this.subscriptions.get(key);
    if (!cbs) return;

    cbs.delete(callback);
    if (cbs.size === 0) {
      await this.closeSocket(symbol, interval);
    }
  }

  /**
   * Close WebSocket for symbol/interval
   * @param {string} symbol
   * @param {string} interval
   */
  async closeSocket(symbol, interval) {
    const key = `${symbol}-${interval}`;
    const ws = this.sockets.get(key);
    if (ws) {
      try {
        ws.close();
      } catch (err) {
        console.warn(`[BinanceSocket] Error closing socket ${key}`, err);
      }
    }
    this.sockets.delete(key);
    this.subscriptions.delete(key);
  }
}
