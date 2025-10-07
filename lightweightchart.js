// lightweightchart.js - Crypto Chart Grid Main Controller
import { ChartRenderer } from './chart-renderer.js';
import { ChartDataManager } from './chart-data-manager.js';
import { setupTickerSelect } from './ticker-select.js';
import { enableDragDrop } from './drag-drop.js';

// CDN sources for LightweightCharts
const CDN_SOURCES = [
  'https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js',
  'https://cdn.jsdelivr.net/npm/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js',
  'https://cdnjs.cloudflare.com/ajax/libs/lightweight-charts/4.1.3/lightweight-charts.standalone.production.min.js'
];

const chartConfigs = [
  { id: 'chart-btc', symbol: 'BTCUSDT', cardId: 'btc-card' },
  { id: 'chart-eth', symbol: 'ETHUSDT', cardId: 'eth-card' },
  { id: 'chart-sol', symbol: 'SOLUSDT', cardId: 'sol-card' },
  { id: 'chart-bnb', symbol: 'BNBUSDT', cardId: 'bnb-card' }
];

const allCharts = new Map();
let statusLabel, statusDot;
let isShuttingDown = false;

/**
 * Application cleanup management system
 */
class AppCleanupManager {
  constructor() {
    this.cleanupTasks = [];
    this.isDestroying = false;
    this.setupGlobalCleanup();
  }

  setupGlobalCleanup() {
    const cleanup = async () => {
      if (this.isDestroying) return;
      this.isDestroying = true;

      console.log('[AppCleanupManager] Performing global cleanup...');

      try {
        for (const task of this.cleanupTasks) {
          try {
            await task();
          } catch (error) {
            console.warn('[AppCleanupManager] Cleanup task failed:', error);
          }
        }
        console.log('[AppCleanupManager] Global cleanup completed');
      } catch (error) {
        console.error('[AppCleanupManager] Global cleanup error:', error);
      }
    };

    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('unload', cleanup);
    window.addEventListener('pagehide', cleanup);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        console.log('[AppCleanupManager] Page hidden, maintaining connections');
      }
    });

    this._globalCleanup = cleanup;
  }

  addCleanupTask(task) {
    if (typeof task === 'function') {
      this.cleanupTasks.push(task);
    }
  }

  async destroy() {
    await this._globalCleanup();
  }
}

const cleanupManager = new AppCleanupManager();

/**
 * Global error handler for UI
 */
window.handleGlobalError = function(isError, err, ctx) {
  window.isGlobalError = !!isError;
  const banner = document.getElementById('global-error-banner');
  if (banner) banner.style.display = isError ? '' : 'none';

  // Update global status
  const dot = document.querySelector('.dot-global');
  const label = document.getElementById('label-global');
  if (dot && label) {
    dot.style.background = isError ? 'var(--danger)' : 'var(--ok)';
    label.textContent = isError ? 'DISCONNECTED' : 'CONNECTED';
  }

  // Enable/disable all chart controls
  document.querySelectorAll('.chart-card .right-controls button, .timeframe-select, .ticker-input')
    .forEach(el => {
      el.disabled = isError;
      el.classList.toggle('disabled', isError);
    });
  // Optionally disable Add Chart button
  const addBtn = document.getElementById('add-chart');
  if (addBtn) addBtn.disabled = isError;

  if (isError && err) {
    console.error('[GlobalError]', err, ctx || '');
  }
};

/**
 * Enhanced fullscreen functionality
 */
function enableFullscreen(card, chartInstance) {
  const header = card.querySelector('.chart-header');
  if (!header) return null;

  let btn = header.querySelector('.fullscreen-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.className = 'fullscreen-btn';
    btn.title = 'Fullscreen';
    btn.textContent = '⛶';
    header.appendChild(btn);
  }

  const fullscreenHandler = () => {
    if (isShuttingDown || window.isGlobalError) return;

    try {
      if (!document.fullscreenElement) {
        card.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    } catch (error) {
      console.warn('[Fullscreen] Error toggling fullscreen:', error);
    }
  };

  const fullscreenChangeHandler = () => {
    if (isShuttingDown) return;

    try {
      if (document.fullscreenElement === card) {
        btn.textContent = '🗗';
      } else {
        btn.textContent = '⛶';
      }

      setTimeout(() => {
        if (!isShuttingDown && chartInstance?.chart) {
          try {
            const container = card.querySelector('.tvchart');
            if (container) {
              chartInstance.chart.resize(container.clientWidth, container.clientHeight);
            }
          } catch (error) {
            console.warn('[Fullscreen] Error resizing chart:', error);
          }
        }
      }, 200);
    } catch (error) {
      console.warn('[Fullscreen] Error in fullscreen change handler:', error);
    }
  };

  btn.addEventListener('click', fullscreenHandler);
  document.addEventListener('fullscreenchange', fullscreenChangeHandler);

  const cleanup = () => {
    try {
      btn.removeEventListener('click', fullscreenHandler);
      document.removeEventListener('fullscreenchange', fullscreenChangeHandler);
    } catch (error) {
      console.warn('[Fullscreen] Cleanup error:', error);
    }
  };

  cleanupManager.addCleanupTask(cleanup);
  return cleanup;
}

/**
 * Dynamic grid layout adjustment
 */
export function adjustGridLayout() {
  if (isShuttingDown) return;

  try {
    const grid = document.getElementById('chart-grid');
    if (!grid) return;

    const cards = Array.from(grid.querySelectorAll('.chart-card'));
    const chartCount = cards.length;

    grid.style.gridTemplateColumns = '';
    grid.style.gridAutoRows = '';
    cards.forEach(card => {
      card.style.gridColumn = '';
      card.style.gridRow = '';
    });

    if (chartCount === 1) {
      grid.style.gridTemplateColumns = '1fr';
    } else if (chartCount === 2) {
      grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
    } else if (chartCount === 3) {
      grid.style.gridTemplateColumns = '1fr 1fr';
      grid.style.gridAutoRows = '1fr';
      if (cards[0]) { cards[0].style.gridColumn = '1'; cards[0].style.gridRow = '1'; }
      if (cards[1]) { cards[1].style.gridColumn = '1'; cards[1].style.gridRow = '2'; }
      if (cards[2]) { cards[2].style.gridColumn = '2'; cards[2].style.gridRow = '1 / span 2'; }
    } else if (chartCount === 4) {
      grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
    } else if (chartCount === 5) {
      grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
      if (cards[4]) cards[4].style.gridColumn = '1 / -1';
    } else if (chartCount === 6) {
      grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    } else if (chartCount >= 7) {
      grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    }
  } catch (error) {
    console.warn('[GridLayout] Error adjusting layout:', error);
  }
}

/**
 * Load external script with fallback
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/**
 * Clean up individual chart resources
 */
function cleanupChart(chartKey) {
  if (!allCharts.has(chartKey)) return;

  try {
    const { chartInstance, dataManager, symbol } = allCharts.get(chartKey);

    console.log(`[ChartCleanup] Cleaning up chart: ${symbol}`);

    const card =
      document.getElementById(chartKey.replace(/chart-/, '') + '-card') ||
      document.querySelector(`[data-symbol="${symbol.toLowerCase()}"]`);
    const tfSelect = card?.querySelector('.timeframe-select');
    const currentInterval = tfSelect?.value || '5m';

    // Unsubscribe data stream
    if (dataManager) {
      dataManager.unsubscribe(symbol, currentInterval).catch(error => {
        console.warn(`[ChartCleanup] Error unsubscribing ${symbol}:`, error);
      });
    }

    // Destroy chart instance (removes listeners, DOM refs, observers)
    if (chartInstance && typeof chartInstance.destroy === 'function') {
      chartInstance.destroy();
    }

    allCharts.delete(chartKey);
    console.log(`[ChartCleanup] Successfully cleaned up chart: ${symbol}`);
  } catch (error) {
    console.error(`[ChartCleanup] Error cleaning up chart ${chartKey}:`, error);
  }
}

/**
 * Setup remove button with proper cleanup
 */
function setupRemoveButton(card, chartKey) {
  const removeBtn = card?.querySelector('.remove-btn');
  if (!removeBtn) return null;

  const removeHandler = () => {
    if (isShuttingDown || window.isGlobalError) return;

    try {
      cleanupChart(chartKey);
      card.remove();
      adjustGridLayout();
      console.log(`[RemoveButton] Successfully removed chart card: ${chartKey}`);
    } catch (error) {
      console.error(`[RemoveButton] Error removing chart ${chartKey}:`, error);
    }
  };

  removeBtn.addEventListener('click', removeHandler);

  const cleanup = () => {
    try {
      removeBtn.removeEventListener('click', removeHandler);
    } catch (error) {
      console.warn('[RemoveButton] Cleanup error:', error);
    }
  };

  cleanupManager.addCleanupTask(cleanup);
  return cleanup;
}

/**
 * Setup timeframe change handler
 */
function setupTimeframeHandler(card, chartInstance, dataManager, symbol) {
  const tfSelect = card?.querySelector('.timeframe-select');
  if (!tfSelect) return null;

  let currentInterval = tfSelect.value;

  const changeHandler = async () => {
    if (isShuttingDown || window.isGlobalError) return;

    try {
      const newInterval = tfSelect.value;
      if (newInterval === currentInterval) return;

      console.log(`[TimeframeHandler] Changing ${symbol} from ${currentInterval} to ${newInterval}`);

      await dataManager.unsubscribe(symbol, currentInterval);
      currentInterval = newInterval;
      await dataManager.loadAndStart(symbol, currentInterval, chartInstance);

      console.log(`[TimeframeHandler] Successfully switched ${symbol} to ${newInterval}`);
    } catch (error) {
      console.error(`[TimeframeHandler] Failed to switch interval for ${symbol}:`, error);
      tfSelect.value = currentInterval;
    }
  };

  tfSelect.addEventListener('change', changeHandler);

  const cleanup = () => {
    try {
      tfSelect.removeEventListener('change', changeHandler);
    } catch (error) {
      console.warn('[TimeframeHandler] Cleanup error:', error);
    }
  };

  cleanupManager.addCleanupTask(cleanup);
  return cleanup;
}

/**
 * Initialize all charts with comprehensive cleanup
 */
async function initializeCharts() {
  if (isShuttingDown) return;

  statusLabel = document.getElementById('label-global');
  statusDot = document.querySelector('.dot-global');
  const grid = document.getElementById('chart-grid');

  if (!grid) {
    console.error('[InitCharts] Chart grid container not found');
    return;
  }

  try {
    await Promise.any(CDN_SOURCES.map(loadScript));
    if (typeof LightweightCharts === 'undefined') {
      throw new Error('Lightweight Charts not loaded.');
    }

    console.log('[InitCharts] LightweightCharts loaded successfully');

    if (statusLabel) statusLabel.textContent = 'CONNECTED';
    if (statusDot) statusDot.style.background = 'var(--ok)';

    try {
      const savedOrder = JSON.parse(localStorage.getItem('chartOrder') || '[]');
      if (Array.isArray(savedOrder) && savedOrder.length > 0) {
        const nodeMap = {};
        Array.from(grid.querySelectorAll('.chart-card')).forEach(n => {
          if (n.dataset && n.dataset.symbol) {
            nodeMap[n.dataset.symbol.toLowerCase()] = n;
          }
        });
        savedOrder.forEach(sym => {
          const node = nodeMap[(sym || '').toLowerCase()];
          if (node) grid.appendChild(node);
        });
      }
    } catch (err) {
      console.warn('[InitCharts] Could not restore chart order:', err);
    }

    for (const config of chartConfigs) {
      if (isShuttingDown) break;

      try {
        const dataManager = new ChartDataManager();
        const chartInstance = new ChartRenderer(config.id, config.symbol, dataManager);

        if (!chartInstance.container) {
          console.warn(`[InitCharts] Skipping ${config.symbol} - container not found`);
          continue;
        }

        chartInstance.init();

        const chartKey = config.cardId;
        allCharts.set(chartKey, { chartInstance, dataManager, symbol: config.symbol });

        const card = document.getElementById(config.cardId);
        if (!card) {
          console.warn(`[InitCharts] Card not found for ${config.symbol}`);
          continue;
        }

        const fullscreenCleanup = enableFullscreen(card, chartInstance);
        const removeCleanup = setupRemoveButton(card, chartKey);
        const timeframeCleanup = setupTimeframeHandler(card, chartInstance, dataManager, config.symbol);

        const tfSelect = card.querySelector('.timeframe-select');
        const initialInterval = tfSelect?.value || '5m';

        try {
          const candles = await dataManager.loadAndStart(config.symbol, initialInterval, chartInstance);
          console.log(`[InitCharts] ${config.symbol} loaded ${candles?.length || 0} candles`);
        } catch (err) {
          console.error(`[InitCharts] Failed to load initial data for ${config.symbol}:`, err);
        }

        cleanupManager.addCleanupTask(() => {
          console.log(`[ChartCleanup] Cleaning up ${config.symbol}`);
          try {
            fullscreenCleanup?.();
            removeCleanup?.();
            timeframeCleanup?.();
            cleanupChart(chartKey);
          } catch (error) {
            console.warn(`[ChartCleanup] Error cleaning up ${config.symbol}:`, error);
          }
        });

        console.log(`[InitCharts] Successfully initialized ${config.symbol}`);
      } catch (err) {
        console.error(`[InitCharts] Failed to initialize ${config.symbol}:`, err);
      }
    }

    const dragDropCleanup = enableDragDrop(grid);
    if (dragDropCleanup && typeof dragDropCleanup === 'function') {
      cleanupManager.addCleanupTask(dragDropCleanup);
    }

    adjustGridLayout();
    console.log('[InitCharts] All charts initialized successfully');
  } catch (error) {
    console.error('[InitCharts] Failed to initialize charts:', error);
    if (statusLabel) statusLabel.textContent = 'ERROR';
    if (statusDot) statusDot.style.background = 'var(--danger)';
    window.handleGlobalError?.(true, error, 'LightweightCharts bootstrap failure');
  }
}

/**
 * Start the application
 */
async function startApplication() {
  try {
    isShuttingDown = false;
    window.isGlobalError = false;
    window.handleGlobalError?.(false);

    console.log('[App] Starting crypto charts application...');

    await initializeCharts();

    const tickerCleanup = await setupTickerSelect(allCharts, adjustGridLayout, enableFullscreen);
    if (tickerCleanup && typeof tickerCleanup === 'function') {
      cleanupManager.addCleanupTask(tickerCleanup);
    }

    console.log('[App] Application started successfully');
  } catch (error) {
    console.error('[App] Failed to start application:', error);
    window.handleGlobalError?.(true, error, 'App startup failure');
  }
}

/**
 * Shutdown the application
 */
export async function shutdownApplication() {
  if (isShuttingDown) return;

  console.log('[App] Shutting down application...');
  isShuttingDown = true;

  try {
    await cleanupManager.destroy();

    const remainingCharts = Array.from(allCharts.keys());
    for (const chartKey of remainingCharts) {
      try {
        cleanupChart(chartKey);
      } catch (error) {
        console.warn(`[Shutdown] Error cleaning chart ${chartKey}:`, error);
      }
    }

    allCharts.clear();
    console.log('[App] Application shutdown complete');
  } catch (error) {
    console.error('[App] Error during application shutdown:', error);
  }
}

// Initialize application
document.addEventListener('DOMContentLoaded', startApplication);
window.addEventListener('beforeunload', shutdownApplication);
window.addEventListener('unload', shutdownApplication);