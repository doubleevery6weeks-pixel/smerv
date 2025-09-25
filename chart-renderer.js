// chart-renderer.js
import { RSIIndicator } from './rsi-indicator.js';
import { EMAIndicator } from './ema-indicator.js';
import { MACDIndicator } from './macd-indicator.js'; // ✅ added MACD import

export class ChartRenderer {
  constructor(containerId, symbol, dataManager) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`Chart container #${containerId} not found`);
      return;
    }

    this.symbol = symbol;
    this.dataManager = dataManager;
    this.chart = null;
    this.candleSeries = null;
    this.volumeSeries = null;
    this.indicators = []; // { type, instance }
    this.lastClosePrice = null;
    this.resizeObserver = null;

    const card = this.container.closest('.chart-card');
    this.card = card;
    this.cardStatusDot = card?.querySelector('.status-dot');
    this.cardStatusLabel = card?.querySelector('.status-label');

    if (card) card.chartRenderer = this;
  }

  init() {
    if (!this.container) return;

    this.chart = LightweightCharts.createChart(this.container, {
      layout: { background: { color: '#11161d' }, textColor: '#e6edf3' },
      grid: { vertLines: { color: '#1c1c1c' }, horzLines: { color: '#1c1c1c' } },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#485c7b' },
      timeScale: { borderColor: '#485c7b', timeVisible: true }
    });

    // ✅ Candlesticks
    this.candleSeries = this.chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderDownColor: '#ef5350',
      borderUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      wickUpColor: '#26a69a'
    });

    // ✅ Volume histogram (hidden by default)
    this.volumeSeries = this.chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      lastValueVisible: false,
      visible: false
    });

    // ✅ Ensure a badge container exists inside chart
    const chartWrap = this.container.closest('.chart-wrap');
    if (chartWrap && !chartWrap.querySelector('.ema-badges')) {
      const badgeContainer = document.createElement('div');
      badgeContainer.className = 'ema-badges';
      chartWrap.appendChild(badgeContainer);
    }

    // Resize properly
    setTimeout(() => {
      const rect = this.container.getBoundingClientRect();
      this.chart.resize(rect.width, rect.height);
    }, 0);

    this.resizeObserver = new ResizeObserver(() => {
      if (!this.container) return;
      const rect = this.container.getBoundingClientRect();
      this.chart.resize(rect.width, this.container.clientHeight);

      this.indicators.forEach(i => {
        if (i.instance?.resize && i.type === 'rsi') {
          const rsiEl = this.card?.querySelector('.rsi-chart');
          if (rsiEl) i.instance.resize(rsiEl.clientWidth, rsiEl.clientHeight);
        }
        // ✅ resize MACD panel if present
        if (i.instance?.resize && i.type === 'macd') {
          const macdEl = this.card?.querySelector('.macd-chart');
          if (macdEl) i.instance.resize(macdEl.clientWidth, macdEl.clientHeight);
        }
      });
    });
    this.resizeObserver.observe(this.container);

    this.setupCardControls();
    this.setupCrosshairTracking();
  }

  setupCardControls() {
    if (!this.card) return;

    // ✅ Fullscreen toggle
    const fullscreenBtn = this.card.querySelector('.fullscreen-btn');
    fullscreenBtn?.addEventListener('click', () => {
      this.card.classList.toggle('fullscreen');
      const chartContainer = this.card.querySelector('.tvchart');
      this.chart.resize(chartContainer.clientWidth, chartContainer.clientHeight);
    });

    // ✅ Indicators panel toggle
    const toggleBtn = this.card.querySelector('.toggle-indicators');
    const indicatorsPanel = this.card.querySelector('.indicators-panel');
    toggleBtn?.addEventListener('click', () => {
      indicatorsPanel.classList.toggle('active');
    });

    // ✅ RSI checkbox
    const rsiCheckbox = indicatorsPanel?.querySelector('input[data-indicator="rsi"]');
    if (rsiCheckbox) {
      const uniqueId = this.card.id.replace('-card', '');
      const rsiChartId = `rsi-chart-${uniqueId}`;
      rsiCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.addIndicator('rsi', rsiChartId);
        } else {
          this.removeIndicator('rsi', rsiChartId);
        }
      });
    }

    // ✅ EMA checkbox
    const emaCheckbox = indicatorsPanel?.querySelector('input[data-indicator="ema"]');
    const emaSettings = indicatorsPanel?.querySelector('.ema-settings-panel');
    if (emaCheckbox) {
      emaCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          if (emaSettings) emaSettings.style.display = 'flex';
          this.addIndicator('ema', this.getEmaConfig());
        } else {
          if (emaSettings) emaSettings.style.display = 'none';
          this.removeIndicator('ema');
        }
      });
    }

    // ✅ Close EMA settings
    const closeEmaBtn = emaSettings?.querySelector('.close-ema-settings');
    closeEmaBtn?.addEventListener('click', () => {
      emaSettings.style.display = 'none';
    });

    // ✅ Save EMA settings
    const saveBtn = indicatorsPanel?.querySelector('.save-ema-btn');
    saveBtn?.addEventListener('click', () => {
      const config = this.getEmaConfig();
      this.updateIndicator('ema', config);
      localStorage.setItem(`emaConfig-${this.symbol}`, JSON.stringify(config));
      alert("EMA settings saved!");
    });

    // ✅ MACD checkbox
    const macdCheckbox = indicatorsPanel?.querySelector('input[data-indicator="macd"]');
    if (macdCheckbox) {
      const uniqueId = this.card.id.replace('-card', '');
      const macdChartId = `macd-chart-${uniqueId}`;
      macdCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.addIndicator('macd', macdChartId);
        } else {
          this.removeIndicator('macd', macdChartId);
        }
      });
    }

    // ✅ Volume checkbox
    const volumeCheckbox = indicatorsPanel?.querySelector('input[data-indicator="volume"]');
    if (volumeCheckbox) {
      volumeCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.addIndicator('volume');
        } else {
          this.removeIndicator('volume');
        }
      });
    }
  }

  getEmaConfig() {
    const id = this.symbol.toLowerCase().replace('usdt', '');
    const periods = [
      parseInt(document.getElementById(`ema-period-${id}1`).value),
      parseInt(document.getElementById(`ema-period-${id}2`).value),
      parseInt(document.getElementById(`ema-period-${id}3`).value),
      parseInt(document.getElementById(`ema-period-${id}4`).value),
    ];
    const colors = [
      document.getElementById(`ema-color-${id}1`).value,
      document.getElementById(`ema-color-${id}2`).value,
      document.getElementById(`ema-color-${id}3`).value,
      document.getElementById(`ema-color-${id}4`).value,
    ];
    const badges = [
      document.getElementById(`ema-period-${id}1`).parentElement.querySelector('.ema-badge-toggle').checked,
      document.getElementById(`ema-period-${id}2`).parentElement.querySelector('.ema-badge-toggle').checked,
      document.getElementById(`ema-period-${id}3`).parentElement.querySelector('.ema-badge-toggle').checked,
      document.getElementById(`ema-period-${id}4`).parentElement.querySelector('.ema-badge-toggle').checked,
    ];
    return { periods, colors, badges };
  }

  setupCrosshairTracking() {
    if (!this.chart || !this.candleSeries) return;
    this.chart.subscribeCrosshairMove(param => {
      if (!param || !param.time) return;
      const candle = param.seriesData.get(this.candleSeries);
      if (candle) {
        this.updatePriceDisplay(candle.close);
      }
    });
  }

  updateStatus(isConnected) {
    const dot = document.querySelector('.dot-global'); // 🔧 fixed selector
    const label = document.getElementById('label-global');
    if (dot && label) {
      dot.style.background = isConnected ? 'var(--ok)' : 'var(--danger)';
      label.textContent = isConnected ? 'CONNECTED' : 'DISCONNECTED';
    }
    if (this.cardStatusDot && this.cardStatusLabel) {
      this.cardStatusDot.style.background = isConnected ? 'var(--ok)' : 'var(--danger)';
      this.cardStatusLabel.textContent = isConnected ? 'CONNECTED' : 'DISCONNECTED';
    }
  }

  setData(candles) {
    if (!this.candleSeries) return;
    this.candleSeries.setData(candles);
    this.volumeSeries.setData(candles.map(c => ({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(38,166,154,0.4)' : 'rgba(239,83,80,0.4)'
    })));
    if (candles.length) {
      this.lastClosePrice = candles[candles.length - 1].close;
      this.updatePriceDisplay(this.lastClosePrice);
    }
    this.indicators.forEach(i => i.instance.update(candles));
  }

  handleDataUpdate(update) {
    if (!update || !this.candleSeries) return;
    this.candleSeries.update(update);
    this.volumeSeries.update({
      time: update.time,
      value: update.volume,
      color: update.close >= update.open ? 'rgba(38,166,154,0.4)' : 'rgba(239,83,80,0.4)'
    });

    if (update.closed) {
      const key = `${this.symbol}-${this.card.querySelector('.timeframe-select').value}`;
      const history = this.dataManager.historicalData.get(key) || [];
      this.indicators.forEach(i => i.instance.update(history));
    }
    this.updatePriceDisplay(update.close);
  }

  updatePriceDisplay(price) {
    const el = document.querySelector(`[data-ticker="${this.symbol}"]`);
    if (!el) return;
    el.textContent = (price >= 1 ? price.toFixed(2) : price.toFixed(6));
    el.classList.remove('up','down');
    if (this.lastClosePrice !== null) {
      if (price > this.lastClosePrice) el.classList.add('up');
      else if (price < this.lastClosePrice) el.classList.add('down');
    }
    this.lastClosePrice = price;
  }

  addIndicator(type, optionsOrContainerId) {
    if (type === 'rsi' && !this.indicators.find(i => i.type === 'rsi')) {
      const containerId = optionsOrContainerId;
      const panel = this.card.querySelector('.rsi-panel');
      if (panel) {
        panel.style.display = 'flex';
        requestAnimationFrame(() => panel.classList.add('active'));
      }
      const rsi = new RSIIndicator(this.chart, { period: 14 });
      rsi.render(containerId);
      const key = `${this.symbol}-${this.card.querySelector('.timeframe-select').value}`;
      const history = this.dataManager.historicalData.get(key) || [];
      rsi.update(history);
      this.indicators.push({ type: 'rsi', instance: rsi });
    }

    if (type === 'ema') {
      const { periods, colors, badges } = optionsOrContainerId;
      const key = `${this.symbol}-${this.card.querySelector('.timeframe-select').value}`;
      const history = this.dataManager.historicalData.get(key) || [];

      // clear previous EMAs
      this.indicators.filter(i => i.type.startsWith('ema-'))
        .forEach(i => i.instance.remove?.());
      this.indicators = this.indicators.filter(i => !i.type.startsWith('ema-'));

      // clear old badges
      const badgeContainer = this.card.querySelector('.ema-badges');
      if (badgeContainer) badgeContainer.innerHTML = '';

      // add new ones
      periods.forEach((p, idx) => {
        const ema = new EMAIndicator(this.chart, p, colors[idx]);
        ema.update(history);
        this.indicators.push({ type: `ema-${p}`, instance: ema });

        if (badges[idx]) {
          const badgeEl = document.createElement('span');
          badgeEl.className = 'ema-badge';
          badgeEl.textContent = `EMA (${p})`;
          badgeEl.style.borderColor = colors[idx];
          badgeEl.style.color = colors[idx];
          badgeContainer?.appendChild(badgeEl);
        }
      });
    }

    // ✅ MACD support
    if (type === 'macd' && !this.indicators.find(i => i.type === 'macd')) {
      const containerId = optionsOrContainerId;
      const panel = this.card.querySelector('.macd-panel');
      if (panel) {
        panel.style.display = 'flex';
        requestAnimationFrame(() => panel.classList.add('active'));
      }
      const macd = new MACDIndicator(this.chart, { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });
      macd.render(containerId);
      const key = `${this.symbol}-${this.card.querySelector('.timeframe-select').value}`;
      const history = this.dataManager.historicalData.get(key) || [];
      macd.update(history);
      this.indicators.push({ type: 'macd', instance: macd });
    }

    // ✅ Volume support
    if (type === 'volume') {
      if (this.volumeSeries) {
        this.volumeSeries.applyOptions({ visible: true });
      }
    }
  }

  updateIndicator(type, options) {
    if (type === 'ema') {
      this.addIndicator('ema', options);
    }
  }

  removeIndicator(type, containerId) {
    if (type === 'rsi') {
      const idx = this.indicators.findIndex(i => i.type === type);
      if (idx === -1) return;
      this.indicators[idx].instance.remove?.();
      this.indicators[idx].instance.destroy?.();
      this.indicators.splice(idx, 1);
      const container = document.getElementById(containerId);
      if (container) container.innerHTML = '';
      const panel = this.card.querySelector('.rsi-panel');
      if (panel) {
        panel.classList.remove('active');
        const onEnd = (ev) => {
          if (ev.propertyName === 'max-height' || ev.propertyName === 'opacity') {
            panel.style.display = 'none';
            panel.removeEventListener('transitionend', onEnd);
          }
        };
        panel.addEventListener('transitionend', onEnd);
        setTimeout(() => {
          if (panel.style.display !== 'none' && !panel.classList.contains('active')) {
            panel.style.display = 'none';
          }
        }, 400);
      }
    }

    if (type === 'ema') {
      this.indicators.filter(i => i.type.startsWith('ema-'))
        .forEach(i => i.instance.remove?.());
      this.indicators = this.indicators.filter(i => !i.type.startsWith('ema-'));

      const badgeContainer = this.card.querySelector('.ema-badges');
      if (badgeContainer) badgeContainer.innerHTML = '';
    }

    // ✅ remove MACD
    if (type === 'macd') {
      const idx = this.indicators.findIndex(i => i.type === 'macd');
      if (idx !== -1) {
        this.indicators[idx].instance.remove?.();
        this.indicators[idx].instance.destroy?.();
        this.indicators.splice(idx, 1);
      }
      const container = document.getElementById(containerId);
      if (container) container.innerHTML = '';
      const panel = this.card.querySelector('.macd-panel');
      if (panel) {
        panel.classList.remove('active');
        const onEnd = (ev) => {
          if (ev.propertyName === 'max-height' || ev.propertyName === 'opacity') {
            panel.style.display = 'none';
            panel.removeEventListener('transitionend', onEnd);
          }
        };
        panel.addEventListener('transitionend', onEnd);
        setTimeout(() => {
          if (panel.style.display !== 'none' && !panel.classList.contains('active')) {
            panel.style.display = 'none';
          }
        }, 400);
      }
    }

    // ✅ remove Volume
    if (type === 'volume') {
      if (this.volumeSeries) {
        this.volumeSeries.applyOptions({ visible: false });
      }
    }
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.indicators.forEach(i => i.instance.destroy?.());
    this.indicators = [];
    this.chart = null;
  }
}
