/**
 * BinanceSocket - Singleton WebSocket Pooling for Binance Streams
 * Features:
 * - One socket per symbol/interval
 * - Multiple callbacks can subscribe to each stream
 * - Automatic cleanup when last subscriber leaves, with stale timer/generation token
 * - Error event hooks per stream
 * - REST methods for symbol validation & history
 * - Async error handling: global error notifications for UI
 */

class BinanceSocket {
  constructor() {
    if (BinanceSocket._instance) return BinanceSocket._instance;
    BinanceSocket._instance = this;

    this.subscriptions = new Map(); // key: symbol-interval -> Set of callbacks
    this.sockets = new Map();       // key: symbol-interval -> WebSocket instance
    this.reconnectInfo = new Map(); // key: symbol-interval -> reconnect state
    this.staleTimers = new Map();   // key: symbol-interval -> timeout id
    this.staleGenerations = new Map(); // key: symbol-interval -> generation token
    this.errorHandlers = new Map(); // key: symbol-interval/global -> Set of error handlers

    this._globalErrorState = false;
    this._setupDefaultGlobalErrorHook();
  }

  // Setup the default global error hook for UI banner and controls
  _setupDefaultGlobalErrorHook() {
    this.onError('global', '', (err, ctx) => {
      if (window && typeof window.handleGlobalError === 'function') {
        window.handleGlobalError(true, err, ctx);
      }
      this._globalErrorState = true;
    });
  }

  // Call this when a connection is restored or API request succeeds
  _clearGlobalError() {
    if (window && typeof window.handleGlobalError === 'function') {
      window.handleGlobalError(false);
    }
    this._globalErrorState = false;
  }

  /**
   * Register an error handler for a particular symbol/interval stream.
   */
  onError(symbol, interval, handler) {
    const key = symbol && interval ? `${symbol}-${interval}` : 'global';
    if (!this.errorHandlers.has(key)) {
      this.errorHandlers.set(key, new Set());
    }
    this.errorHandlers.get(key).add(handler);
  }

  /**
   * Remove a previously registered error handler.
   */
  offError(symbol, interval, handler) {
    const key = symbol && interval ? `${symbol}-${interval}` : 'global';
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
    if (key !== 'global' && this.errorHandlers.has('global')) {
      this.errorHandlers.get('global').forEach(handler => {
        try { handler(err, context); } catch (e) {}
      });
    }
    // Set global error state for UI
    this._globalErrorState = true;
    if (window && typeof window.handleGlobalError === 'function') {
      window.handleGlobalError(true, err, context);
    }
  }

  /**
   * Validate a symbol against Binance exchange info
   */
  async isValidSymbol(symbol) {
    try {
      const res = await fetch('https://api.binance.com/api/v3/exchangeInfo');
      const data = await res.json();
      this._clearGlobalError();
      return data.symbols.some(s => s.symbol.toUpperCase() === symbol.toUpperCase());
    } catch (err) {
      console.error('[BinanceSocket] Symbol validation failed', err);
      this._emitError('global', err, { type: 'rest', action: 'isValidSymbol', symbol });
      return false;
    }
  }

  /**
   * Fetch historical candles
   */
  async getHistoricalData(symbol, interval, limit = 500) {
    try {
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      const res = await fetch(url);
      const data = await res.json();
      this._clearGlobalError();
      return data.map(c => ({
        time: Math.floor(c[0] / 1000),
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
   * Subscribe to a symbol/interval stream (WebSocket pooling).
   */
  subscribe(symbol, interval, callback) {
    const key = `${symbol}-${interval}`;
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set());
    }
    this.subscriptions.get(key).add(callback);

    // Cancel stale timer and bump generation if needed
    if (this.staleTimers.has(key)) {
      clearTimeout(this.staleTimers.get(key));
      this.staleTimers.delete(key);
      let gen = (this.staleGenerations.get(key) || 0) + 1;
      this.staleGenerations.set(key, gen);
    }

    // If socket already exists for stream, do nothing
    if (this.sockets.has(key)) return;

    // Init reconnect info
    if (!this.reconnectInfo.has(key)) {
      this.reconnectInfo.set(key, { reconnecting: false, attempt: 0 });
    }

    this._openSocket(key, symbol, interval);
  }

  /**
   * Unsubscribe a callback from a symbol/interval.
   */
  unsubscribe(symbol, interval, callback) {
    const key = `${symbol}-${interval}`;
    const cbs = this.subscriptions.get(key);
    if (!cbs) return;
    cbs.delete(callback);

    // Only close if after deletion, there are no callbacks left
    if (cbs.size === 0) {
      let gen = (this.staleGenerations.get(key) || 0) + 1;
      this.staleGenerations.set(key, gen);
      this._startStaleTimer(key, symbol, interval, 10 * 60 * 1000, gen);
    }
  }

  _openSocket(key, symbol, interval) {
    const streamName = `${symbol.toLowerCase()}@kline_${interval}`;
    const wsUrl = `wss://stream.binance.com:9443/ws/${streamName}`;
    const ws = new WebSocket(wsUrl);

    this.sockets.set(key, ws);

    ws.onopen = () => {
      console.log(`[BinanceSocket] Connected: ${key}`);
      const info = this.reconnectInfo.get(key);
      if (info) info.attempt = 0;
      this._clearGlobalError();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (!msg.k) return;
        this._clearGlobalError();
        const k = msg.k;
        const candle = {
          time: Math.floor(k.t / 1000),
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
        };
        const isClosed = k.x === true;

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
      this._handleReconnect(key, symbol, interval);
    };

    ws.onclose = () => {
      console.log(`[BinanceSocket] Closed: ${key}`);
      this.sockets.delete(key);
      if (this.subscriptions.has(key) && this.subscriptions.get(key).size > 0) {
        this._handleReconnect(key, symbol, interval);
      } else {
        this.reconnectInfo.delete(key);
      }
    };
  }

  _handleReconnect(key, symbol, interval) {
    const info = this.reconnectInfo.get(key);
    if (!info || info.reconnecting) return;

    info.reconnecting = true;
    info.attempt += 1;

    // Exponential backoff: min 1s, max 30s
    const delay = Math.min(1000 * Math.pow(2, info.attempt), 30000);
    console.log(`[BinanceSocket] Reconnecting for ${key} in ${delay / 1000}s (attempt ${info.attempt})`);

    setTimeout(() => {
      info.reconnecting = false;
      this._openSocket(key, symbol, interval);
    }, delay);
  }

  /**
   * Start a stale socket timer. If no new callback is added before timeout, closes socket.
   * Uses generation token to avoid race conditions.
   */
  _startStaleTimer(key, symbol, interval, timeoutMs = 10 * 60 * 1000, gen) {
    if (this.staleTimers.has(key)) return;

    this.staleTimers.set(key, setTimeout(() => {
      if (this.staleGenerations.get(key) !== gen) return;
      const cbs = this.subscriptions.get(key);
      if (!cbs || cbs.size === 0) {
        this._closeSocket(key, symbol, interval);
      }
      this.staleTimers.delete(key);
      this.staleGenerations.delete(key);
    }, timeoutMs));
  }

  /**
   * Close WebSocket for symbol/interval
   */
  _closeSocket(key, symbol, interval) {
    // Double-check if any callbacks remain
    const cbs = this.subscriptions.get(key);
    if (cbs && cbs.size > 0) return;

    if (this.staleTimers.has(key)) {
      clearTimeout(this.staleTimers.get(key));
      this.staleTimers.delete(key);
    }
    this.staleGenerations.delete(key);

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

// Export singleton instance
export default new BinanceSocket();