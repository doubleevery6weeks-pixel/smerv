// alert-ui.js
import AlertSystem from './alert-system.js';

export function setupAlertUI() {
  addAlertStyles();
  const modal = createAlertModal();
  document.body.appendChild(modal);
  
  setupGlobalAlertButton();
  setupCardAlertButtons();
  
  window.updateAlertUI = updateAlertList;
  
  updateAlertList();
}

function addAlertStyles() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideDown {
      from {
        transform: translate(-50%, -100%);
        opacity: 0;
      }
      to {
        transform: translate(-50%, 0);
        opacity: 1;
      }
    }
    
    @keyframes slideUp {
      from {
        transform: translate(-50%, 0);
        opacity: 1;
      }
      to {
        transform: translate(-50%, -100%);
        opacity: 0;
      }
    }
    
    .alert-modal-content {
      animation: modalFadeIn 0.3s ease-out;
    }
    
    @keyframes modalFadeIn {
      from {
        opacity: 0;
        transform: scale(0.95);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
  `;
  document.head.appendChild(style);
}

function createAlertModal() {
  const modal = document.createElement('div');
  modal.id = 'alert-modal';
  modal.style.cssText = `
    display: none;
    position: fixed;
    z-index: 99999;
    left: 0;
    top: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(16,20,30,0.92);
    backdrop-filter: blur(4px);
  `;
  
  modal.innerHTML = `
    <div class="alert-modal-content" style="margin: 60px auto 0 auto; max-width: 600px; background: var(--panel); border-radius: 12px; box-shadow: 0 6px 32px rgba(0,0,0,0.4); padding: 24px; max-height: 80vh; overflow-y: auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="color: var(--accent); margin: 0;">Price Alerts</h2>
        <button id="close-alert-modal" style="background: transparent; border: none; color: var(--muted); font-size: 24px; cursor: pointer; padding: 0 8px;">✕</button>
      </div>
      
      <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <h3 style="margin: 0 0 12px; font-size: 15px; color: var(--text);">Create New Alert</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 13px; color: var(--muted); margin-bottom: 4px;">Symbol</label>
            <input type="text" id="alert-symbol" placeholder="BTCUSDT" style="width: 100%; padding: 8px; background: var(--panel); color: var(--text); border: 1px solid var(--border); border-radius: 6px; font-size: 14px;">
          </div>
          <div>
            <label style="display: block; font-size: 13px; color: var(--muted); margin-bottom: 4px;">Price</label>
            <input type="number" id="alert-price" placeholder="50000" step="0.01" style="width: 100%; padding: 8px; background: var(--panel); color: var(--text); border: 1px solid var(--border); border-radius: 6px; font-size: 14px;">
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 13px; color: var(--muted); margin-bottom: 4px;">Condition</label>
            <select id="alert-condition" style="width: 100%; padding: 8px; background: var(--panel); color: var(--text); border: 1px solid var(--border); border-radius: 6px; font-size: 14px;">
              <option value="above">Above</option>
              <option value="below">Below</option>
            </select>
          </div>
          <div style="display: flex; align-items: flex-end;">
            <button id="create-alert-btn" style="width: 100%; background: var(--ok); color: white; border: none; border-radius: 6px; padding: 8px 16px; font-size: 14px; cursor: pointer; font-weight: 600;">Create Alert</button>
          </div>
        </div>
        <div>
          <label style="display: block; font-size: 13px; color: var(--muted); margin-bottom: 4px;">Note (Optional)</label>
          <input type="text" id="alert-note" placeholder="Optional note..." style="width: 100%; padding: 8px; background: var(--panel); color: var(--text); border: 1px solid var(--border); border-radius: 6px; font-size: 14px;">
        </div>
      </div>
      
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h3 style="margin: 0; font-size: 15px; color: var(--text);">Active Alerts</h3>
        <button id="clear-triggered-alerts" style="background: transparent; border: 1px solid var(--border); color: var(--muted); border-radius: 6px; padding: 6px 12px; font-size: 12px; cursor: pointer;">Clear Triggered</button>
      </div>
      
      <div id="alert-list" style="display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto;">
        <p style="text-align: center; color: var(--muted); padding: 20px;">No alerts yet</p>
      </div>
    </div>
  `;
  
  modal.querySelector('#close-alert-modal').onclick = () => {
    modal.style.display = 'none';
  };
  
  modal.querySelector('#create-alert-btn').onclick = () => {
    const symbol = modal.querySelector('#alert-symbol').value.trim().toUpperCase();
    const price = parseFloat(modal.querySelector('#alert-price').value);
    const condition = modal.querySelector('#alert-condition').value;
    const note = modal.querySelector('#alert-note').value.trim();
    
    if (!symbol || !price || price <= 0) {
      alert('Please enter valid symbol and price');
      return;
    }
    
    AlertSystem.createAlert(symbol, price, condition, note);
    
    modal.querySelector('#alert-symbol').value = '';
    modal.querySelector('#alert-price').value = '';
    modal.querySelector('#alert-note').value = '';
    
    updateAlertList();
  };
  
  modal.querySelector('#clear-triggered-alerts').onclick = () => {
    AlertSystem.clearTriggeredAlerts();
    updateAlertList();
  };
  
  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  };
  
  return modal;
}

function updateAlertList() {
  const listContainer = document.getElementById('alert-list');
  if (!listContainer) return;
  
  const alerts = AlertSystem.getAlerts();
  
  if (alerts.length === 0) {
    listContainer.innerHTML = '<p style="text-align: center; color: var(--muted); padding: 20px;">No alerts yet</p>';
    return;
  }
  
  listContainer.innerHTML = alerts.map(alert => {
    const isTriggered = alert.triggered;
    const bgColor = isTriggered ? 'rgba(46, 204, 113, 0.1)' : 'var(--bg)';
    const borderColor = isTriggered ? 'var(--ok)' : 'var(--border)';
    
    return `
      <div style="background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: center;">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span style="font-weight: 600; color: var(--accent); font-size: 15px;">${alert.symbol}</span>
            <span style="color: var(--text); font-size: 14px;">${alert.condition === 'above' ? '↑' : '↓'} $${alert.price.toFixed(2)}</span>
            ${isTriggered ? '<span style="background: var(--ok); color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">TRIGGERED</span>' : ''}
          </div>
          ${alert.note ? `<div style="color: var(--muted); font-size: 12px;">${alert.note}</div>` : ''}
          ${isTriggered ? `<div style="color: var(--muted); font-size: 12px; margin-top: 4px;">Triggered at $${alert.triggeredPrice?.toFixed(2)} on ${new Date(alert.triggeredAt).toLocaleString()}</div>` : ''}
        </div>
        <button onclick="deleteAlert('${alert.id}')" style="background: transparent; border: none; color: var(--danger); cursor: pointer; font-size: 18px; padding: 4px 8px;">🗑</button>
      </div>
    `;
  }).join('');
  
  updateAlertBadge();
}

function updateAlertBadge() {
  const alerts = AlertSystem.getAlerts();
  const activeCount = alerts.filter(a => !a.triggered).length;
  
  document.querySelectorAll('.alert-badge').forEach(badge => {
    if (activeCount > 0) {
      badge.textContent = activeCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  });
}

function setupGlobalAlertButton() {
  const header = document.querySelector('header .row');
  if (!header) return;
  
  const btnContainer = document.createElement('div');
  btnContainer.style.cssText = 'position: relative; display: inline-block;';
  
  const btn = document.createElement('button');
  btn.id = 'global-alert-btn';
  btn.innerHTML = '🔔';
  btn.title = 'Price Alerts';
  btn.style.cssText = `
    background: var(--panel);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 13px;
    font-size: 18px;
    cursor: pointer;
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  `;
  
  const badge = document.createElement('span');
  badge.className = 'alert-badge';
  badge.style.cssText = `
    position: absolute;
    top: -6px;
    right: -6px;
    background: var(--danger);
    color: white;
    border-radius: 10px;
    padding: 2px 6px;
    font-size: 11px;
    font-weight: 600;
    min-width: 18px;
    height: 18px;
    display: none;
    align-items: center;
    justify-content: center;
  `;
  
  btn.appendChild(badge);
  btnContainer.appendChild(btn);
  
  btn.onclick = () => {
    const modal = document.getElementById('alert-modal');
    if (modal) {
      modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
    }
  };
  
  header.insertBefore(btnContainer, header.firstChild);
}

function setupCardAlertButtons() {
  document.querySelectorAll('.chart-card').forEach(card => {
    const header = card.querySelector('.chart-header .right-controls');
    if (!header || header.querySelector('.card-alert-btn')) return;
    
    const symbol = card.dataset.symbol?.toUpperCase();
    if (!symbol) return;
    
    const btn = document.createElement('button');
    btn.className = 'card-alert-btn';
    btn.innerHTML = '🔔';
    btn.title = 'Set Price Alert';
    btn.style.cssText = `
      background: transparent;
      border: none;
      color: var(--text);
      font-size: 1.2em;
      cursor: pointer;
      padding: 6px;
      border-radius: 8px;
      min-width: 32px;
      min-height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    `;
    
    btn.onmouseover = () => {
      btn.style.color = 'var(--accent)';
      btn.style.background = 'var(--border)';
    };
    
    btn.onmouseout = () => {
      btn.style.color = 'var(--text)';
      btn.style.background = 'transparent';
    };
    
    btn.onclick = () => {
      const modal = document.getElementById('alert-modal');
      if (!modal) return;
      
      modal.querySelector('#alert-symbol').value = symbol;
      
      const priceEl = card.querySelector('.current-price');
      if (priceEl) {
        const currentPrice = parseFloat(priceEl.textContent);
        if (!isNaN(currentPrice)) {
          modal.querySelector('#alert-price').value = currentPrice;
        }
      }
      
      modal.style.display = 'block';
    };
    
    header.insertBefore(btn, header.querySelector('.fullscreen-btn'));
  });
}

window.deleteAlert = function(alertId) {
  if (confirm('Delete this alert?')) {
    AlertSystem.deleteAlert(alertId);
    updateAlertList();
  }
};

export function integrateAlertsWithCharts() {
  const originalHandleDataUpdate = window.ChartRenderer?.prototype?.handleDataUpdate;
  
  if (originalHandleDataUpdate) {
    window.ChartRenderer.prototype.handleDataUpdate = function(update) {
      originalHandleDataUpdate.call(this, update);
      
      if (update && update.close && this.symbol) {
        AlertSystem.checkPrice(this.symbol, update.close);
      }
    };
  }
}