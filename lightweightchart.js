// lightweightchart.js
import { ChartRenderer } from './chart-renderer.js';
import { ChartDataManager } from './chart-data-manager.js';
import { setupTickerSelect } from './ticker-select.js';
import { enableDragDrop } from './drag-drop.js';

// Multiple CDN sources for LightweightCharts
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

// ✅ Fullscreen helper
function enableFullscreen(card, chartInstance) {
  const header = card.querySelector('.chart-header');
  if (!header) return;

  let btn = header.querySelector('.fullscreen-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.className = 'fullscreen-btn';
    btn.title = 'Fullscreen';
    btn.textContent = '⛶';
    header.appendChild(btn);
  }

  btn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      card.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === card) {
      btn.textContent = '🗗'; // exit icon
    } else {
      btn.textContent = '⛶'; // enter icon
    }
    // ✅ force chart resize after entering/exiting fullscreen
    setTimeout(() => chartInstance?.resize?.(), 200);
  });
}

// ✅ Adjust grid layout dynamically
export function adjustGridLayout() {
  const grid = document.getElementById('chart-grid');
  const cards = Array.from(grid.querySelectorAll('.chart-card'));
  const chartCount = cards.length;

  // reset styles
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

  } else if (chartCount === 7) {
    grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    if (cards[6]) cards[6].style.gridColumn = '1 / -1';

  } else if (chartCount >= 8 && chartCount <= 9) {
    grid.style.gridTemplateColumns = 'repeat(3, 1fr)';

  } else if (chartCount >= 10 && chartCount <= 12) {
    grid.style.gridTemplateColumns = 'repeat(3, 1fr)';

  } else {
    grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(300px, 1fr))';
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Init all charts
async function initializeCharts() {
  statusLabel = document.getElementById('label-global');
  statusDot = document.querySelector('.dot-global');
  const grid = document.getElementById('chart-grid'); // ✅ moved up here

  try {
    await Promise.any(CDN_SOURCES.map(loadScript));
    if (typeof LightweightCharts === 'undefined') throw new Error('Lightweight Charts not loaded.');

    if (statusLabel) statusLabel.textContent = 'CONNECTED';
    if (statusDot) statusDot.style.background = 'var(--ok)';

    // ✅ grid is now defined before we use it
    try {
      const savedOrder = JSON.parse(localStorage.getItem('chartOrder') || '[]');
      if (Array.isArray(savedOrder) && savedOrder.length > 0) {
        const nodeMap = {};
        Array.from(grid.querySelectorAll('.chart-card')).forEach(n => {
          if (n.dataset && n.dataset.symbol) nodeMap[n.dataset.symbol.toLowerCase()] = n;
        });
        savedOrder.forEach(sym => {
          const node = nodeMap[(sym || '').toLowerCase()];
          if (node) grid.appendChild(node);
        });
      }
    } catch (err) {
      console.warn('Could not restore chart order at init', err);
    }

    for (const config of chartConfigs) {
      const dataManager = new ChartDataManager();
      const chartInstance = new ChartRenderer(config.id, config.symbol, dataManager);

      chartInstance.init();

      const chartKey = config.cardId;
      allCharts.set(chartKey, { chartInstance, dataManager, symbol: config.symbol });

      const card = document.getElementById(config.cardId);
      const tfSelect = card.querySelector('.timeframe-select');
      let chartInterval = tfSelect.value;

      enableFullscreen(card, chartInstance); // ✅ add fullscreen toggle

      try {
        await dataManager.loadAndStart(config.symbol, chartInterval, chartInstance);
      } catch (err) {
        console.error('Initial chart setup failed:', err);
      }

      tfSelect.addEventListener('change', async () => {
        const newInterval = tfSelect.value;
        await dataManager.unsubscribe(config.symbol, chartInterval);
        chartInterval = newInterval;
        try {
          await dataManager.loadAndStart(config.symbol, chartInterval, chartInstance);
        } catch (err) {
          console.error(`Failed to switch interval for ${config.symbol}:`, err);
        }
      });

      const removeBtn = card?.querySelector('.remove-btn');
      removeBtn?.addEventListener('click', () => {
        dataManager.unsubscribe(config.symbol, chartInterval);
        card.remove();
        allCharts.delete(chartKey);
        adjustGridLayout();
      });
    }

    enableDragDrop(grid);
    adjustGridLayout();
  } catch (error) {
    console.error('Failed to load Lightweight Charts script:', error);
    if (statusLabel) statusLabel.textContent = 'ERROR';
    if (statusDot) statusDot.style.background = 'var(--danger)';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await initializeCharts();
  setupTickerSelect(allCharts, adjustGridLayout, enableFullscreen);
});
