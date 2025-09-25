// superguppy-indicator.js
import { BaseIndicator } from './base-indicator.js';

/**
 * Super Guppy Indicator (GMMA style)
 * - Fast EMAs (3–21)
 * - Slow EMAs (24–66)
 * - Baseline EMA200
 * - Colors ribbons depending on bullish / bearish / neutral alignment
 */
export class SuperGuppyIndicator extends BaseIndicator {
  constructor(chart) {
    super(chart);
    this.series = [];
    this.emaPeriods = [
      3, 6, 9, 12, 15, 18, 21,   // fast group
      24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, // slow group
      200                        // baseline
    ];
  }

  // simple EMA calculator
  calcEMA(values, period) {
    if (!values || values.length === 0) return [];
    const k = 2 / (period + 1);
    let emaArr = [];
    let prev = values[0].close;
    emaArr.push({ time: values[0].time, value: prev });
    for (let i = 1; i < values.length; i++) {
      prev = values[i].close * k + prev * (1 - k);
      emaArr.push({ time: values[i].time, value: prev });
    }
    return emaArr;
  }

  calculate(data) {
    if (!data || !data.length) return [];
    return this.emaPeriods.map(p => this.calcEMA(data, p));
  }

  render() {
    if (this._isDestroyed || !this.chart) return;
    
    try {
      // create all EMA line series
      this.series = this.emaPeriods.map((p, idx) => {
        return this.chart.addLineSeries({
          lineWidth: (idx === 6 || idx === 21 || idx === 22) ? 2 : 1, // highlight edges
          priceLineVisible: false,
          crossHairMarkerVisible: false
        });
      });
    } catch (e) {
      console.error('Failed to create SuperGuppy series:', e);
    }
  }

  update(data) {
    if (this._isDestroyed || !this.series.length || !data || data.length === 0) return;

    const emaResults = this.calculate(data);

    // --- Detect trend direction ---
    const fastGroup = emaResults.slice(0, 7).map(arr => arr.at(-1)?.value || 0);
    const slowGroup = emaResults.slice(7, 22).map(arr => arr.at(-1)?.value || 0);

    const fastBull = fastGroup[0] > fastGroup[fastGroup.length - 1];
    const fastBear = fastGroup[0] < fastGroup[fastGroup.length - 1];

    const slowBull = slowGroup[0] > slowGroup[slowGroup.length - 1];
    const slowBear = slowGroup[0] < slowGroup[slowGroup.length - 1];

    let fastColor = fastBull ? 'aqua' : fastBear ? 'orange' : 'gray';
    let slowColor = slowBull ? 'lime' : slowBear ? 'red' : 'gray';

    // --- Paint all series ---
    emaResults.forEach((emaArr, idx) => {
      if (this._isDestroyed || !this.series[idx]) return;
      
      let color = 'gray';

      if (idx < 7) {
        // fast group gradient
        const opacity = 0.4 + idx * 0.1;
        if (fastColor === 'aqua') color = `rgba(0,255,255,${opacity})`;
        if (fastColor === 'orange') color = `rgba(255,165,0,${opacity})`;
        if (fastColor === 'gray') color = `rgba(128,128,128,${opacity})`;
      } else if (idx < 22) {
        // slow group gradient
        const relIdx = idx - 7;
        const opacity = 0.3 + relIdx * 0.03;
        if (slowColor === 'lime') color = `rgba(50,205,50,${opacity})`;
        if (slowColor === 'red') color = `rgba(255,0,0,${opacity})`;
        if (slowColor === 'gray') color = `rgba(128,128,128,${opacity})`;
      } else {
        // EMA200 baseline
        color = '#ffffff';
      }

      try {
        this.series[idx].setData(emaArr);
        this.series[idx].applyOptions({ color });
      } catch (err) {
        console.warn('SuperGuppy update error', err);
      }
    });
  }

  /**
   * Incremental update for last candle
   */
  updateLast(candle, history) {
    if (this._isDestroyed || !this.series.length || !candle || !history?.length) return;
    // simplest approach: reuse full update
    this.update(history);

    // ⚡ optimization idea: calculate only last EMA values and call series[idx].update(lastPoint)
  }

  remove() {
    this.destroy();
  }

  destroy() {
    if (this._isDestroyed) return;

    if (this.series.length && this.chart) {
      this.series.forEach(s => {
        try {
          this.chart.removeSeries(s);
        } catch (e) {
          console.warn('Error removing SuperGuppy series:', e);
        }
      });
      this.series = [];
    }
    
    super.destroy();
  }
}