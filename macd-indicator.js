// macd-indicator.js
import { BaseIndicator } from './base-indicator.js';

export class MACDIndicator extends BaseIndicator {
  constructor(mainChart, options = {}) {
    super(mainChart, options);
    this.options = Object.assign(
      { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
      options
    );
    this.macdChart = null;
    this.series = {};
  }

  // ✅ EMA helper
  ema(values, period) {
    const k = 2 / (period + 1);
    let emaArr = [];
    let prevEma;
    values.forEach((v, i) => {
      if (i < period - 1) {
        emaArr.push(null);
        return;
      }
      if (i === period - 1) {
        const sum = values.slice(0, period).reduce((a, b) => a + b, 0);
        prevEma = sum / period;
        emaArr.push(prevEma);
      } else {
        prevEma = v * k + prevEma * (1 - k);
        emaArr.push(prevEma);
      }
    });
    return emaArr;
  }

  // ✅ MACD calculation
  calculate(data) {
    const closes = data.map(d => d.close);
    const fastEMA = this.ema(closes, this.options.fastPeriod);
    const slowEMA = this.ema(closes, this.options.slowPeriod);

    const macdLine = closes.map((_, i) => {
      if (fastEMA[i] == null || slowEMA[i] == null) return null;
      return fastEMA[i] - slowEMA[i];
    });

    const signalLine = this.ema(macdLine.filter(v => v != null), this.options.signalPeriod);
    // align signal with macdLine
    let fullSignal = [];
    let idx = 0;
    macdLine.forEach(v => {
      if (v == null) {
        fullSignal.push(null);
      } else {
        fullSignal.push(signalLine[idx++] ?? null);
      }
    });

    const histogram = macdLine.map((v, i) =>
      v != null && fullSignal[i] != null ? v - fullSignal[i] : null
    );

    return { macdLine, signalLine: fullSignal, histogram };
  }

  // ✅ Render MACD panel chart
  render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error("MACD container not found:", containerId);
      return;
    }

    // Create MACD chart
    this.macdChart = LightweightCharts.createChart(container, {
      layout: { background: { color: '#11161d' }, textColor: '#e6edf3' },
      grid: { vertLines: { color: '#1c1c1c' }, horzLines: { color: '#1c1c1c' } },
      rightPriceScale: { borderColor: '#485c7b' },
      timeScale: { borderColor: '#485c7b', timeVisible: true }
    });

    // Add series
    this.series.macd = this.macdChart.addLineSeries({ color: '#2196f3', lineWidth: 1 });
    this.series.signal = this.macdChart.addLineSeries({ color: '#ff9800', lineWidth: 1 });
    this.series.hist = this.macdChart.addHistogramSeries({
      color: '#888',
      priceFormat: { type: 'volume' }
    });

    // ✅ Sync only panning (not zoom)
    let syncing = false;
    const mainScale = this.chart.timeScale();
    const macdScale = this.macdChart.timeScale();

    mainScale.subscribeVisibleLogicalRangeChange(range => {
      if (syncing || !range) return;
      syncing = true;
      macdScale.setVisibleLogicalRange(range);
      syncing = false;
    });

    macdScale.subscribeVisibleLogicalRangeChange(range => {
      if (syncing || !range) return;
      syncing = true;
      mainScale.setVisibleLogicalRange(range);
      syncing = false;
    });
  }

  // ✅ Update values
  update(data) {
    if (!this.macdChart || !this.series.macd) return;
    const { macdLine, signalLine, histogram } = this.calculate(data);

    const times = data.map(d => d.time);

    this.series.macd.setData(
      times.map((t, i) => ({ time: t, value: macdLine[i] ?? null }))
    );
    this.series.signal.setData(
      times.map((t, i) => ({ time: t, value: signalLine[i] ?? null }))
    );
    this.series.hist.setData(
      times.map((t, i) => ({
        time: t,
        value: histogram[i] ?? 0,
        color: histogram[i] >= 0 ? 'rgba(76,175,80,0.6)' : 'rgba(244,67,54,0.6)'
      }))
    );
  }

  resize(width, height) {
    if (this.macdChart) {
      this.macdChart.resize(width, height);
    }
  }

  destroy() {
    if (this.macdChart) {
      this.macdChart.remove();
      this.macdChart = null;
    }
  }
}
