// binance-socket.js

/**
 * Helper class for interacting with Binance REST & WebSocket APIs.
 * Handles:
 *   - validating symbols
 *   - fetching historical candles
 *   - subscribing/unsubscribing to live streams
 *   - automatic WebSocket reconnection with backoff
 *   - stale socket cleanup to prevent memory leaks (with generation token for race-free logic)
 *   - error event hooks for consumers
 *
 * IMPORTANT: Consumers are responsible for unsubscribing when streams are no longer needed.
 * Failure to unsubscribe may result in open sockets and increased resource usage.
 * Always call unsubscribeCallback when finished.
 */

export default class BinanceSocket {
  constructor() {
    // Map: `${symbol}-${interval}` → Set of callbacks
    this.subscriptions = new Map();

    // Active WebSocket connections
    this.sockets = new Map();

    // Track reconnection state and attempts per key
    this.reconnectInfo = new Map();

    // Map: `${symbol}-${interval}` → Timeout ID for stale socket cleanup
    this.staleTimers = new Map();

    // Error listeners: Map<key, Set<handler>>
    this.errorHandlers = new Map();

    // Map: `${symbol}-${interval}` → Stale timer "generation" counter
    this.staleGenerations = new Map();
  }

  /**
   * Register an error handler for a particular symbol/interval stream.
   * @param {string} symbol
   * @param {string} interval
   * @param {Function} handler (err, context) => {}
   */
  onError(symbol, interval, handler) {
    const key = `${symbol}-${interval}`;
    if (!this.errorHandlers.has(key)) {
      this.errorHandlers.set(key, new Set());
    }
    this.errorHandlers.get(key).add(handler);
  }

  /**
   * Remove a previously registered error handler.
   */
  offError(symbol, interval, handler) {
    const key = `${symbol}-${interval}`;
    if (this.errorHandlers.has(key)) {
      this.errorHandlers.get(key).delete(handler);
      if (this.errorHandlers.get(key).size === 0) {
        this.errorHandlers.delete(key);
      }
    }
  }

  /**
   * Internal: Fire error events to handlers
   */
  _emitError(key, err, context = {}) {
    if (this.errorHandlers.has(key)) {
      this.errorHandlers.get(key).forEach(handler => {
        try {
          handler(err, context);
        } catch (e) {
          console.warn('[BinanceSocket] Error handler threw', e);
        }
      });
    }
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
      this._emitError('global', err, { type: 'rest', action: 'isValidSymbol', symbol });
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
      this._emitError('global', err, { type: 'rest', action: 'getHistoricalData', symbol, interval });
      return [];
    }
  }

  /**
   * Start a WebSocket for symbol/interval
   * Includes auto-reconnect/backoff strategy.
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

    // If a stale timer exists, cancel it (socket is wanted again).
    if (this.staleTimers.has(key)) {
      clearTimeout(this.staleTimers.get(key));
      this.staleTimers.delete(key);
      // Invalidate any pending stale timer by incrementing generation
      let gen = (this.staleGenerations.get(key) || 0) + 1;
      this.staleGenerations.set(key, gen);
    }

    if (this.sockets.has(key)) {
      return; // already running
    }

    // Initialize reconnect info for key
    if (!this.reconnectInfo.has(key)) {
      this.reconnectInfo.set(key, {
        reconnecting: false,
        attempt: 0,
      });
    }

    const connect = () => {
      const streamName = `${symbol.toLowerCase()}@kline_${interval}`;
      const wsUrl = `wss://stream.binance.com:9443/ws/${streamName}`;
      const ws = new WebSocket(wsUrl);
      this.sockets.set(key, ws);

      ws.onopen = () => {
        console.log(`[BinanceSocket] Connected: ${key}`);
        // Reset attempts on successful connection
        const info = this.reconnectInfo.get(key);
        if (info) info.attempt = 0;
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
                this._emitError(key, err, { type: 'callback', candle, isClosed });
              }
            });
          }
        } catch (err) {
          console.error('[BinanceSocket] Failed to parse WebSocket message', err);
          this._emitError(key, err, { type: 'parse', raw: event.data });
        }
      };

      ws.onerror = (err) => {
        console.error(`[BinanceSocket] WebSocket error for ${key}`, err);
        this._emitError(key, err, { type: 'socket', action: 'onerror' });
        this._handleReconnect(key, connect);
      };

      ws.onclose = () => {
        console.log(`[BinanceSocket] Closed: ${key}`);
        this.sockets.delete(key);
        // Only auto-reconnect if subscription still exists and has callbacks
        if (this.subscriptions.has(key) && this.subscriptions.get(key).size > 0) {
          this._handleReconnect(key, connect);
        } else {
          this.reconnectInfo.delete(key);
        }
      };
    };

    connect();
  }

  /**
   * Internal reconnection/backoff handler
   * @param {string} key
   * @param {Function} connectFn
   */
  _handleReconnect(key, connectFn) {
    const info = this.reconnectInfo.get(key);
    if (!info || info.reconnecting) return;

    info.reconnecting = true;
    info.attempt += 1;

    // Exponential backoff: min 1s, max 30s
    const delay = Math.min(1000 * Math.pow(2, info.attempt), 30000);
    console.log(`[BinanceSocket] Attempting reconnect for ${key} in ${delay / 1000}s (attempt ${info.attempt})`);

    setTimeout(() => {
      info.reconnecting = false;
      connectFn();
    }, delay);
  }

  /**
   * Unsubscribe a callback from a symbol/interval
   * If no callbacks remain, start stale timer for cleanup.
   * @param {string} symbol
   * @param {string} interval
   * @param {Function} callback
   */
  async unsubscribeCallback(symbol, interval, callback) {
    const key = `${symbol}-${interval}`;
    const cbs = this.subscriptions.get(key);
    if (!cbs) return;

    cbs.delete(callback);

    // Only close if after deletion, there are no callbacks left
    if (cbs.size === 0) {
      // Increment generation when starting timer
      let gen = (this.staleGenerations.get(key) || 0) + 1;
      this.staleGenerations.set(key, gen);
      this._startStaleTimer(key, symbol, interval, 10 * 60 * 1000, gen);
    }
  }

  /**
   * Start a stale socket timer. If no new callback is added before timeout, closes socket.
   * Uses generation token to avoid race conditions.
   * @param {string} key
   * @param {string} symbol
   * @param {string} interval
   * @param {number} timeoutMs (default 10 min)
   * @param {number} gen (generation token)
   */
  _startStaleTimer(key, symbol, interval, timeoutMs = 10 * 60 * 1000, gen) {
    if (this.staleTimers.has(key)) return; // Already set

    this.staleTimers.set(key, setTimeout(async () => {
      // Only proceed if generation matches (no new subscribe since timer started)
      if (this.staleGenerations.get(key) !== gen) return;

      const cbs = this.subscriptions.get(key);
      if (!cbs || cbs.size === 0) {
        await this.closeSocket(symbol, interval);
      }
      this.staleTimers.delete(key);
      // Remove generation if no more timers
      this.staleGenerations.delete(key);
    }, timeoutMs));
  }

  /**
   * Close WebSocket for symbol/interval
   * Ensures no callbacks remain before closing and cleaning up.
   * @param {string} symbol
   * @param {string} interval
   */
  async closeSocket(symbol, interval) {
    const key = `${symbol}-${interval}`;

    // Double-check if any callbacks remain
    const cbs = this.subscriptions.get(key);
    if (cbs && cbs.size > 0) {
      // There are still active callbacks, do not close
      return;
    }

    // Cancel stale timer if present
    if (this.staleTimers.has(key)) {
      clearTimeout(this.staleTimers.get(key));
      this.staleTimers.delete(key);
    }

    // Remove generation token when closing
    this.staleGenerations.delete(key);

    // Proceed with closure
    const ws = this.sockets.get(key);
    if (ws) {
      try {
        ws.close();
      } catch (err) {
        console.warn(`[BinanceSocket] Error closing socket ${key}`, err);
        this._emitError(key, err, { type: 'socket', action: 'close' });
      }
    }

    this.sockets.delete(key);
    this.subscriptions.delete(key);
    this.reconnectInfo.delete(key);
    this.errorHandlers.delete(key); // Clean up error handlers for this key
  }
}