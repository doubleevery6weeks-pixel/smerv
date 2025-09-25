// chart-data-manager.js
import BinanceSocket from './binance-socket.js';

export class ChartDataManager {
  constructor() {
    this.socketHelper = new BinanceSocket();

    // History per chart: key = `${symbol}-${interval}`, value = array of candles
    this.historicalData = new Map();

    // Subscriptions per chart: key = `${symbol}-${interval}`, value = callback
    this.subscriptions = new Map();
  }

  /**
   * Fetch historical candles for a symbol/interval
   * @param {string} symbol
   * @param {string} interval
   * @returns {Promise<Array>} candle history
   */
  async loadHistoricalData(symbol, interval) {
    try {
      const candles = await this.socketHelper.getHistoricalData(symbol, interval);
      this.historicalData.set(`${symbol}-${interval}`, candles);
      return candles;
    } catch (err) {
      console.error(
        `[ChartDataManager] Failed to load history for ${symbol} [${interval}]`,
        err
      );
      return [];
    }
  }

  /**
   * Subscribe to live Binance WebSocket updates
   * @param {string} symbol
   * @param {string} interval
   * @param {object} chartRenderer
   */
  async subscribe(symbol, interval, chartRenderer) {
    const key = `${symbol}-${interval}`;
    if (this.subscriptions.has(key)) {
      console.warn(`[ChartDataManager] Already subscribed to ${key}`);
      return;
    }

    const cb = (update, closed) => {
      if (!update) return;
      const candle = { ...update, closed };

      // update history
      const history = this.historicalData.get(key) || [];
      if (history.length && history.at(-1).time === candle.time) {
        history[history.length - 1] = candle;
      } else {
        history.push(candle);
      }
      this.historicalData.set(key, history);

      // notify renderer
      try {
        chartRenderer.handleDataUpdate(candle);
      } catch (err) {
        console.warn(`[ChartDataManager] Renderer update failed for ${symbol} [${interval}]`, err);
      }
    };

    this.subscriptions.set(key, cb);
    await this.socketHelper.startSocket(symbol, interval, cb);
  }

  /**
   * Unsubscribe from a symbol/interval feed
   * @param {string} symbol
   * @param {string} interval
   */
  async unsubscribe(symbol, interval) {
    const key = `${symbol}-${interval}`;
    if (!this.subscriptions.has(key)) {
      console.log(
        `[ChartDataManager] No active subscription to remove for ${symbol} [${interval}]`
      );
      return;
    }

    const cb = this.subscriptions.get(key);
    try {
      await this.socketHelper.unsubscribeCallback(symbol, interval, cb);
    } catch (err) {
      console.warn(`[ChartDataManager] Failed to unsubscribe cleanly from ${key}`, err);
    }

    this.subscriptions.delete(key);
    this.historicalData.delete(key);

    console.log(`[ChartDataManager] Unsubscribed from ${symbol} [${interval}]`);
  }

  /**
   * Load history + subscribe to live updates
   * @param {string} symbol
   * @param {string} interval
   * @param {object} chartRenderer
   * @returns {Promise<Array>} candle history
   */
  async loadAndStart(symbol, interval, chartRenderer) {
    try {
      // 1. Load historical data
      const candles = await this.loadHistoricalData(symbol, interval);
      chartRenderer.setData(candles);

      // 2. Update indicators with fresh history
      chartRenderer.indicators?.forEach(i => {
        if (typeof i.instance.update === 'function') {
          i.instance.update(candles);
        }
      });

      // 3. Subscribe for live updates
      await this.subscribe(symbol, interval, chartRenderer);

      return candles;
    } catch (err) {
      console.error(
        `[ChartDataManager] loadAndStart failed for ${symbol} [${interval}]`,
        err
      );
      return [];
    }
  }
}
