import { RSIIndicator } from './rsi-indicator.js';
import { EMAIndicator } from './ema-indicator.js';
import { MACDIndicator } from './macd-indicator.js';
import { SuperGuppyIndicator } from './superguppy-indicator.js';
import { IndicatorPanelManager } from './indicator-panel-utils.js';

const INDICATOR_PANELS = ['rsi', 'macd'];

function debounce(fn, delay = 150) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

export class ChartRenderer {
  constructor(containerId, symbol, dataManager) {
    this.containerId = containerId;
    this.symbol = symbol;
    this.dataManager = dataManager;
    this.chart = null;
    this.candleSeries = null;
    this.volumeSeries = null;
    this.indicators = [];
    this.lastClosePrice = null;
    this.resizeObserver = null;
    this.mutationObserver = null;
    this.eventListeners = [];
    this.isDestroyed = false;
    this.isReady = false;
    this.errored = false;

    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`[ChartRenderer] Chart container #${containerId} not found`);
      this.errored = true;
      return;
    }

    const card = this.container.closest('.chart-card');
    this.card = card;
    this.cardStatusDot = card?.querySelector('.status-dot');
    this.cardStatusLabel = card?.querySelector('.status-label');

    this.panelManagers = {};
    INDICATOR_PANELS.forEach((type) => {
      this.panelManagers[type] = new IndicatorPanelManager(`.${type}-panel`, this.card);
    });

    this.debouncedResizeChart = debounce(() => {
      if (this.isDestroyed || !this.chart) return;
      const chartContainer = this.card?.querySelector('.tvchart');
      if (chartContainer && this.chart) {
        this.chart.resize(chartContainer.clientWidth, chartContainer.clientHeight);
      }
    }, 150);

    this._fullscreenChangeHandler = () => {
      if (this.isDestroyed) return;
      this.debouncedResizeChart();
    };

    if (card) card.chartRenderer = this;
  }

  tryInitIfReady() {
    if (this.isDestroyed || !this.errored) return;
    this.container = document.getElementById(this.containerId);
    if (this.container) {
      this.errored = false;
      this.init();
    }
  }

  init() {
    if (!this.container || this.isDestroyed || this.errored) return;

    try {
      this.chart = LightweightCharts.createChart(this.container, {
        layout: { background: { color: '#11161d' }, textColor: '#e6edf3' },
        grid: { vertLines: { color: '#1c1c1c' }, horzLines: { color: '#1c1c1c' } },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#485c7b' },
        timeScale: { borderColor: '#485c7b', timeVisible: true }
      });

      this.candleSeries = this.chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderDownColor: '#ef5350',
        borderUpColor: '#26a69a',
        wickDownColor: '#ef5350',
        wickUpColor: '#26a69a'
      });

      this.volumeSeries = this.chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: '',
        lastValueVisible: false,
        visible: false
      });

      const chartWrap = this.container.closest('.chart-wrap');
      if (chartWrap && !chartWrap.querySelector('.ema-badges')) {
        const badgeContainer = document.createElement('div');
        badgeContainer.className = 'ema-badges';
        chartWrap.appendChild(badgeContainer);
      }

      setTimeout(() => {
        if (!this.isDestroyed && this.container) {
          const rect = this.container.getBoundingClientRect();
          this.chart?.resize(rect.width, rect.height);
        }
      }, 0);

      this.setupResizeObserver();
      this.setupPanelMutationObserver();
      this.setupCardControls();
      this.setupCrosshairTracking();

      document.addEventListener('fullscreenchange', this._fullscreenChangeHandler);

      this.isReady = true;
      console.log(`[ChartRenderer] Initialized for ${this.symbol}`);
    } catch (error) {
      this.errored = true;
      this.isReady = false;
      console.error(`[ChartRenderer] Failed to initialize chart for ${this.symbol}:`, error);
    }
  }

  setupResizeObserver() {
    if (!this.container || this.isDestroyed || this.errored) return;

    try {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.isDestroyed || !this.container || !this.isReady) return;
        try {
          const rect = this.container.getBoundingClientRect();
          if (this.chart) {
            this.chart.resize(rect.width, this.container.clientHeight);
          }
          this.indicators.forEach(i => {
            if (this.isDestroyed || !this.isReady) return;
            if (i.instance?.resize && i.type in this.panelManagers) {
              const panelEl = this.card?.querySelector(`.${i.type}-chart`);
              if (panelEl) i.instance.resize(panelEl.clientWidth, panelEl.clientHeight);
            }
          });
        } catch (error) {
          console.warn(`[ChartRenderer] Resize observer error for ${this.symbol}:`, error);
        }
      });
      this.resizeObserver.observe(this.container);
    } catch (error) {
      console.error(`[ChartRenderer] Failed to setup resize observer for ${this.symbol}:`, error);
    }
  }

  setupPanelMutationObserver() {
    if (!this.card || this.isDestroyed || this.errored) return;
    this.mutationObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "class"
        ) {
          const panel = mutation.target;
          if (panel.classList.contains('active')) {
            setTimeout(() => {
              this.debouncedResizeChart();
              panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              panel.focus?.();
            }, 100);
          }
        }
      }
    });
    INDICATOR_PANELS.forEach(type => {
      const panel = this.card?.querySelector(`.${type}-panel`);
      if (panel) {
        this.mutationObserver.observe(panel, { attributes: true, attributeFilter: ['class'] });
      }
    });
  }

  addEventListener(element, eventType, handler, options = {}) {
    if (!element || this.isDestroyed) return;
    try {
      element.addEventListener(eventType, handler, options);
      this.eventListeners.push({ element, eventType, handler, options });
    } catch (error) {
      console.warn(`[ChartRenderer] Failed to add event listener:`, error);
    }
  }

  setupCardControls() {
    if (!this.card || this.isDestroyed || this.errored) return;

    // Fullscreen toggle
    const fullscreenBtn = this.card.querySelector('.fullscreen-btn');
    if (fullscreenBtn) {
      fullscreenBtn.setAttribute('aria-label', 'Fullscreen');
      fullscreenBtn.setAttribute('tabindex', '0');
      fullscreenBtn.setAttribute('role', 'button');
      fullscreenBtn.setAttribute('title', 'Toggle fullscreen mode');
      const fullscreenHandler = () => {
        if (this.isDestroyed || this.errored) return;
        this.card.classList.toggle('fullscreen');
        this.debouncedResizeChart();
      };
      this.addEventListener(fullscreenBtn, 'click', fullscreenHandler);
      this.addEventListener(fullscreenBtn, 'keydown', (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fullscreenHandler(); }
      });
    }

    // Indicators panel toggle
    const toggleBtn = this.card.querySelector('.toggle-indicators');
    const indicatorsPanel = this.card.querySelector('.indicators-panel');
    if (toggleBtn && indicatorsPanel) {
      toggleBtn.setAttribute('aria-label', 'Show/hide indicators panel');
      toggleBtn.setAttribute('tabindex', '0');
      toggleBtn.setAttribute('role', 'button');
      toggleBtn.setAttribute('title', 'Show/hide indicator controls');
      indicatorsPanel.setAttribute('tabindex', '-1');
      indicatorsPanel.setAttribute('role', 'region');
      indicatorsPanel.setAttribute('aria-label', 'Indicators panel');
      const toggleHandler = () => {
        if (this.isDestroyed || this.errored) return;
        indicatorsPanel.classList.toggle('active');
        if (indicatorsPanel.classList.contains('active')) {
          setTimeout(() => {
            indicatorsPanel.focus();
            indicatorsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 100);
        }
      };
      this.addEventListener(toggleBtn, 'click', toggleHandler);
      this.addEventListener(toggleBtn, 'keydown', (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleHandler(); }
      });
    }

    // Panel-based indicators toggle
    INDICATOR_PANELS.forEach(type => {
      const checkbox = indicatorsPanel?.querySelector(`input[data-indicator="${type}"]`);
      if (checkbox) {
        checkbox.setAttribute('aria-label', `Toggle ${type.toUpperCase()} indicator`);
        checkbox.setAttribute('tabindex', '0');
        const uniqueId = this.card.id.replace('-card', '');
        const chartId = `${type}-chart-${uniqueId}`;
        const handler = (e) => {
          if (this.isDestroyed || this.errored) return;
          try {
            if (e.target.checked) {
              this.addIndicator(type, chartId);
            } else {
              this.removeIndicator(type, chartId);
            }
          } catch (error) {
            console.warn(`[ChartRenderer] ${type} toggle error:`, error);
          }
        };
        this.addEventListener(checkbox, 'change', handler);
        this.addEventListener(checkbox, 'keydown', (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); checkbox.checked = !checkbox.checked; checkbox.dispatchEvent(new Event('change')); }
        });
      }
    });

    // EMA toggle
    const emaCheckbox = indicatorsPanel?.querySelector('input[data-indicator="ema"]');
    const emaSettings = indicatorsPanel?.querySelector('.ema-settings-panel');
    if (emaCheckbox) {
      emaCheckbox.setAttribute('aria-label', 'Toggle EMA indicators');
      emaCheckbox.setAttribute('tabindex', '0');
      const emaHandler = (e) => {
        if (this.isDestroyed || this.errored) return;
        try {
          if (e.target.checked) {
            if (emaSettings) emaSettings.style.display = 'flex';
            this.addIndicator('ema', this.getEmaConfig());
          } else {
            if (emaSettings) emaSettings.style.display = 'none';
            this.removeIndicator('ema');
          }
        } catch (error) {
          console.warn(`[ChartRenderer] EMA toggle error:`, error);
        }
      };
      this.addEventListener(emaCheckbox, 'change', emaHandler);
      this.addEventListener(emaCheckbox, 'keydown', (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); emaCheckbox.checked = !emaCheckbox.checked; emaCheckbox.dispatchEvent(new Event('change')); }
      });
    }

    // Volume toggle
    const volumeCheckbox = indicatorsPanel?.querySelector('input[data-indicator="volume"]');
    if (volumeCheckbox) {
      volumeCheckbox.setAttribute('aria-label', 'Toggle Volume indicator');
      volumeCheckbox.setAttribute('tabindex', '0');
      const volumeHandler = (e) => {
        if (this.isDestroyed || this.errored) return;
        try {
          if (e.target.checked) {
            this.addIndicator('volume');
          } else {
            this.removeIndicator('volume');
          }
        } catch (error) {
          console.warn(`[ChartRenderer] Volume toggle error:`, error);
        }
      };
      this.addEventListener(volumeCheckbox, 'change', volumeHandler);
      this.addEventListener(volumeCheckbox, 'keydown', (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); volumeCheckbox.checked = !volumeCheckbox.checked; volumeCheckbox.dispatchEvent(new Event('change')); }
      });
    }

    // SuperGuppy toggle
    const superguppyCheckbox = indicatorsPanel?.querySelector('input[data-indicator="superguppy"]');
    if (superguppyCheckbox) {
      superguppyCheckbox.setAttribute('aria-label', 'Toggle Super Guppy indicator');
      superguppyCheckbox.setAttribute('tabindex', '0');
      const superguppyHandler = (e) => {
        if (this.isDestroyed || this.errored) return;
        try {
          if (e.target.checked) {
            this.addIndicator('superguppy');
          } else {
            this.removeIndicator('superguppy');
          }
        } catch (error) {
          console.warn(`[ChartRenderer] SuperGuppy toggle error:`, error);
        }
      };
      this.addEventListener(superguppyCheckbox, 'change', superguppyHandler);
      this.addEventListener(superguppyCheckbox, 'keydown', (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); superguppyCheckbox.checked = !superguppyCheckbox.checked; superguppyCheckbox.dispatchEvent(new Event('change')); }
      });
    }
  }

  getEmaConfig() {
    if (this.isDestroyed || this.errored || !this.card)
      return {
        periods: [20, 100, 200, 400],
        colors: ['#ff9800', '#2196f3', '#4caf50', '#e91e63'],
        badges: [true, true, true, true],
      };
    try {
      const id = this.symbol.toLowerCase().replace('usdt', '');
      const periods = [
        parseInt(document.getElementById(`ema-period-${id}1`)?.value || 20),
        parseInt(document.getElementById(`ema-period-${id}2`)?.value || 100),
        parseInt(document.getElementById(`ema-period-${id}3`)?.value || 200),
        parseInt(document.getElementById(`ema-period-${id}4`)?.value || 400),
      ];
      const colors = [
        document.getElementById(`ema-color-${id}1`)?.value || '#ff9800',
        document.getElementById(`ema-color-${id}2`)?.value || '#2196f3',
        document.getElementById(`ema-color-${id}3`)?.value || '#4caf50',
        document.getElementById(`ema-color-${id}4`)?.value || '#e91e63',
      ];
      const badges = [
        document.getElementById(`ema-period-${id}1`)?.parentElement?.querySelector('.ema-badge-toggle')?.checked || true,
        document.getElementById(`ema-period-${id}2`)?.parentElement?.querySelector('.ema-badge-toggle')?.checked || true,
        document.getElementById(`ema-period-${id}3`)?.parentElement?.querySelector('.ema-badge-toggle')?.checked || true,
        document.getElementById(`ema-period-${id}4`)?.parentElement?.querySelector('.ema-badge-toggle')?.checked || true,
      ];
      return { periods, colors, badges };
    } catch (error) {
      console.warn(`[ChartRenderer] Error getting EMA config:`, error);
      return {
        periods: [20, 100, 200, 400],
        colors: ['#ff9800', '#2196f3', '#4caf50', '#e91e63'],
        badges: [true, true, true, true],
      };
    }
  }

  setupCrosshairTracking() {
    if (!this.chart || !this.candleSeries || this.isDestroyed || this.errored) return;
    try {
      const crosshairHandler = (param) => {
        if (this.isDestroyed || this.errored || !param || !param.time) return;
        try {
          const candle = param.seriesData.get(this.candleSeries);
          if (candle) {
            this.updatePriceDisplay(candle.close);
          }
        } catch (error) {
          console.warn(`[ChartRenderer] Crosshair tracking error:`, error);
        }
      };
      this.chart.subscribeCrosshairMove(crosshairHandler);
      this._crosshairHandler = crosshairHandler;
    } catch (error) {
      console.error(`[ChartRenderer] Failed to setup crosshair tracking:`, error);
    }
  }

  updateStatus(isConnected) {
    if (this.isDestroyed || this.errored) return;
    try {
      const dot = document.querySelector('.dot-global');
      const label = document.getElementById('label-global');
      if (dot && label) {
        dot.style.background = isConnected ? 'var(--ok)' : 'var(--danger)';
        label.textContent = isConnected ? 'CONNECTED' : 'DISCONNECTED';
      }
      if (this.cardStatusDot && this.cardStatusLabel) {
        this.cardStatusDot.style.background = isConnected ? 'var(--ok)' : 'var(--danger)';
        this.cardStatusLabel.textContent = isConnected ? 'CONNECTED' : 'DISCONNECTED';
      }
    } catch (error) {
      console.warn(`[ChartRenderer] Error updating status:`, error);
    }
  }

  setData(candles) {
    if (!this.candleSeries || this.isDestroyed || this.errored || !candles || !this.isReady) return;
    try {
      this.candleSeries.setData(candles);
      if (this.volumeSeries) {
        this.volumeSeries.setData(
          candles.map((c) => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(38,166,154,0.4)' : 'rgba(239,83,80,0.4)',
          }))
        );
      }
      if (candles.length) {
        this.lastClosePrice = candles[candles.length - 1].close;
        this.updatePriceDisplay(this.lastClosePrice);
      }
      this.indicators.forEach((i) => {
        if (this.isDestroyed || this.errored) return;
        try {
          i.instance?.update(candles);
        } catch (error) {
          console.warn(`[ChartRenderer] Error updating indicator ${i.type}:`, error);
        }
      });
    } catch (error) {
      console.error(`[ChartRenderer] Error setting data:`, error);
    }
  }

  handleDataUpdate(update) {
    if (!update || !this.candleSeries || this.isDestroyed || this.errored || !this.isReady) return;
    try {
      this.candleSeries.update(update);
      if (this.volumeSeries) {
        this.volumeSeries.update({
          time: update.time,
          value: update.volume,
          color: update.close >= update.open ? 'rgba(38,166,154,0.4)' : 'rgba(239,83,80,0.4)',
        });
      }
      if (update.closed && this.dataManager) {
        const key = `${this.symbol}-${this.card?.querySelector('.timeframe-select')?.value || '5m'}`;
        const history = this.dataManager.historicalData.get(key) || [];
        this.indicators.forEach((i) => {
          if (this.isDestroyed || this.errored) return;
          try {
            i.instance?.update(history);
          } catch (error) {
            console.warn(`[ChartRenderer] Error updating indicator on closed candle:`, error);
          }
        });
      }
      this.updatePriceDisplay(update.close);
    } catch (error) {
      if (!this.isDestroyed) {
        console.warn(`[ChartRenderer] Error handling data update:`, error);
      }
    }
  }

  updatePriceDisplay(price) {
    if (this.isDestroyed || this.errored || !price) return;
    try {
      const el = document.querySelector(`[data-ticker="${this.symbol}"]`);
      if (!el) return;
      el.textContent = price >= 1 ? price.toFixed(2) : price.toFixed(6);
      this.lastClosePrice = price;
    } catch (error) {
      console.warn(`[ChartRenderer] Error updating price display:`, error);
    }
  }

  addIndicator(type, optionsOrContainerId) {
    if (this.isDestroyed || this.errored || !this.isReady) return;
    try {
      if (INDICATOR_PANELS.includes(type) && !this.indicators.find((i) => i.type === type)) {
        this.panelManagers[type].show();
        let indicatorInstance = null;
        if (type === 'rsi') {
          indicatorInstance = new RSIIndicator(this.chart, { period: 14 });
        } else if (type === 'macd') {
          indicatorInstance = new MACDIndicator(this.chart, { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });
        }
        if (indicatorInstance && typeof indicatorInstance.render === 'function') {
          indicatorInstance.render(optionsOrContainerId);
        }
        if (this.dataManager) {
          const key = `${this.symbol}-${this.card?.querySelector('.timeframe-select')?.value || '5m'}`;
          const history = this.dataManager.historicalData.get(key) || [];
          indicatorInstance.update(history);
        }
        this.indicators.push({ type, instance: indicatorInstance });
      }
      if (type === 'ema') {
        const { periods, colors, badges } = optionsOrContainerId;
        if (this.dataManager) {
          const key = `${this.symbol}-${this.card?.querySelector('.timeframe-select')?.value || '5m'}`;
          const history = this.dataManager.historicalData.get(key) || [];
          this.indicators
            .filter((i) => i.type.startsWith('ema-'))
            .forEach((i) => {
              try {
                i.instance.remove?.();
              } catch (error) {
                console.warn(`[ChartRenderer] Error removing EMA indicator:`, error);
              }
            });
          this.indicators = this.indicators.filter((i) => !i.type.startsWith('ema-'));
          const badgeContainer = this.card?.querySelector('.ema-badges');
          if (badgeContainer) badgeContainer.innerHTML = '';
          periods.forEach((p, idx) => {
            if (this.isDestroyed || this.errored) return;
            try {
              const ema = new EMAIndicator(this.chart, p, colors[idx]);
              ema.update(history);
              this.indicators.push({ type: `ema-${p}`, instance: ema });
              if (badges[idx] && badgeContainer) {
                const badgeEl = document.createElement('span');
                badgeEl.className = 'ema-badge';
                badgeEl.textContent = `EMA (${p})`;
                badgeEl.style.borderColor = colors[idx];
                badgeEl.style.color = colors[idx];
                badgeContainer.appendChild(badgeEl);
              }
            } catch (error) {
              console.warn(`[ChartRenderer] Error adding EMA ${p}:`, error);
            }
          });
        }
      }
      if (type === 'superguppy' && !this.indicators.find((i) => i.type === 'superguppy')) {
        const superguppy = new SuperGuppyIndicator(this.chart);
        superguppy.render();
        if (this.dataManager) {
          const key = `${this.symbol}-${this.card?.querySelector('.timeframe-select')?.value || '5m'}`;
          const history = this.dataManager.historicalData.get(key) || [];
          superguppy.update(history);
        }
        this.indicators.push({ type: 'superguppy', instance: superguppy });
      }
      if (type === 'volume' && this.volumeSeries) {
        this.volumeSeries.applyOptions({ visible: true });
      }
    } catch (error) {
      console.error(`[ChartRenderer] Error adding indicator ${type}:`, error);
    }
  }

  updateIndicator(type, options) {
    if (this.isDestroyed || this.errored || !this.isReady) return;
    try {
      if (type === 'ema') {
        this.addIndicator('ema', options);
      }
    } catch (error) {
      console.error(`[ChartRenderer] Error updating indicator ${type}:`, error);
    }
  }

  removeIndicator(type, containerId) {
    if (this.isDestroyed || this.errored || !this.isReady) return;
    try {
      if (INDICATOR_PANELS.includes(type)) {
        const idx = this.indicators.findIndex((i) => i.type === type);
        if (idx === -1) return;
        try {
          this.indicators[idx].instance.remove?.();
          this.indicators[idx].instance.destroy?.();
        } catch (error) {
          console.warn(`[ChartRenderer] Error destroying ${type} indicator:`, error);
        }
        this.indicators.splice(idx, 1);
        this.panelManagers[type].hide();
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = '';
      }
      if (type === 'ema') {
        this.indicators
          .filter((i) => i.type.startsWith('ema-'))
          .forEach((i) => {
            try {
              i.instance.remove?.();
            } catch (error) {
              console.warn(`[ChartRenderer] Error removing EMA indicator:`, error);
            }
          });
        this.indicators = this.indicators.filter((i) => !i.type.startsWith('ema-'));
        const badgeContainer = this.card?.querySelector('.ema-badges');
        if (badgeContainer) badgeContainer.innerHTML = '';
      }
      if (type === 'superguppy') {
        this.indicators
          .filter((i) => i.type === 'superguppy')
          .forEach((i) => {
            try {
              i.instance.remove?.();
            } catch (e) {}
          });
        this.indicators = this.indicators.filter((i) => i.type !== 'superguppy');
      }
      if (type === 'volume' && this.volumeSeries) {
        this.volumeSeries.applyOptions({ visible: false });
      }
    } catch (error) {
      console.error(`[ChartRenderer] Error removing indicator ${type}:`, error);
    }
  }

  destroy() {
    if (this.isDestroyed) {
      console.warn(`[ChartRenderer] Already destroyed: ${this.symbol}`);
      return;
    }
    this.isDestroyed = true;
    this.isReady = false;
    this.errored = false;
    try {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
      if (this.mutationObserver) {
        this.mutationObserver.disconnect();
        this.mutationObserver = null;
      }
      if (this.chart && this._crosshairHandler) {
        try {
          this.chart.unsubscribeCrosshairMove(this._crosshairHandler);
        } catch (error) {
          console.warn(`[ChartRenderer] Error unsubscribing crosshair:`, error);
        }
        this._crosshairHandler = null;
      }
      this.eventListeners.forEach(({ element, eventType, handler, options }) => {
        try {
          if (element && typeof element.removeEventListener === 'function') {
            element.removeEventListener(eventType, handler, options);
          }
        } catch (error) {
          console.warn(`[ChartRenderer] Error removing event listener:`, error);
        }
      });
      this.eventListeners = [];
      this.indicators.forEach((indicator) => {
        try {
          if (indicator.instance) {
            if (typeof indicator.instance.destroy === 'function') {
              indicator.instance.destroy();
            } else if (typeof indicator.instance.remove === 'function') {
              indicator.instance.remove();
            }
          }
        } catch (error) {
          console.warn(`[ChartRenderer] Error destroying indicator ${indicator.type}:`, error);
        }
      });
      this.indicators = [];
      if (this.chart) {
        try {
          if (this.candleSeries) {
            this.chart.removeSeries(this.candleSeries);
            this.candleSeries = null;
          }
          if (this.volumeSeries) {
            this.chart.removeSeries(this.volumeSeries);
            this.volumeSeries = null;
          }
        } catch (error) {
          console.warn(`[ChartRenderer] Error removing chart series:`, error);
        }
        try {
          this.chart.remove();
        } catch (error) {
          console.warn(`[ChartRenderer] Error removing chart:`, error);
        }
        this.chart = null;
      }
      Object.values(this.panelManagers).forEach((pm) => pm.cleanup());
      document.removeEventListener('fullscreenchange', this._fullscreenChangeHandler);
      if (this.card && this.card.chartRenderer === this) {
        this.card.chartRenderer = null;
      }
      this.container = null;
      this.card = null;
      this.cardStatusDot = null;
      this.cardStatusLabel = null;
      this.dataManager = null;
      this.lastClosePrice = null;
    } catch (error) {
      console.error(`[ChartRenderer] Error during destruction of ${this.symbol}:`, error);
    }
  }
}