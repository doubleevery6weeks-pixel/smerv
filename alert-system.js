// alert-system.js
export class AlertSystem {
  constructor() {
    this.alerts = new Map(); // key: alertId -> { symbol, price, condition, triggered }
    this.subscriptions = new Map(); // key: symbol -> Set of alertIds
    this.notificationQueue = [];
    this.audioContext = null;
    this.loadAlerts();
    this.setupNotificationPermission();
  }

  async setupNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }

  loadAlerts() {
    try {
      const saved = localStorage.getItem('priceAlerts');
      if (saved) {
        const data = JSON.parse(saved);
        data.forEach(alert => {
          this.alerts.set(alert.id, alert);
          if (!this.subscriptions.has(alert.symbol)) {
            this.subscriptions.set(alert.symbol, new Set());
          }
          this.subscriptions.get(alert.symbol).add(alert.id);
        });
      }
    } catch (err) {
      console.warn('[AlertSystem] Failed to load alerts:', err);
    }
  }

  saveAlerts() {
    try {
      const data = Array.from(this.alerts.values());
      localStorage.setItem('priceAlerts', JSON.stringify(data));
    } catch (err) {
      console.warn('[AlertSystem] Failed to save alerts:', err);
    }
  }

  createAlert(symbol, price, condition, note = '') {
    const id = `${symbol}-${price}-${condition}-${Date.now()}`;
    const alert = {
      id,
      symbol: symbol.toUpperCase(),
      price: parseFloat(price),
      condition, // 'above' or 'below'
      note,
      triggered: false,
      createdAt: Date.now()
    };

    this.alerts.set(id, alert);
    
    if (!this.subscriptions.has(alert.symbol)) {
      this.subscriptions.set(alert.symbol, new Set());
    }
    this.subscriptions.get(alert.symbol).add(id);
    
    this.saveAlerts();
    return id;
  }

  deleteAlert(alertId) {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    this.alerts.delete(alertId);
    
    const symbolAlerts = this.subscriptions.get(alert.symbol);
    if (symbolAlerts) {
      symbolAlerts.delete(alertId);
      if (symbolAlerts.size === 0) {
        this.subscriptions.delete(alert.symbol);
      }
    }
    
    this.saveAlerts();
    return true;
  }

  checkPrice(symbol, currentPrice) {
    const symbolAlerts = this.subscriptions.get(symbol.toUpperCase());
    if (!symbolAlerts || symbolAlerts.size === 0) return;

    symbolAlerts.forEach(alertId => {
      const alert = this.alerts.get(alertId);
      if (!alert || alert.triggered) return;

      let shouldTrigger = false;
      
      if (alert.condition === 'above' && currentPrice >= alert.price) {
        shouldTrigger = true;
      } else if (alert.condition === 'below' && currentPrice <= alert.price) {
        shouldTrigger = true;
      }

      if (shouldTrigger) {
        this.triggerAlert(alert, currentPrice);
      }
    });
  }

  triggerAlert(alert, currentPrice) {
    alert.triggered = true;
    alert.triggeredAt = Date.now();
    alert.triggeredPrice = currentPrice;
    
    this.saveAlerts();
    
    const message = `${alert.symbol} ${alert.condition} $${alert.price.toFixed(2)}! Current: $${currentPrice.toFixed(2)}`;
    
    this.playSound();
    this.showNotification(alert.symbol, message);
    this.showBanner(message);
    
    if (window.updateAlertUI) {
      window.updateAlertUI();
    }
  }

  playSound() {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
      oscillator.frequency.setValueAtTime(1000, this.audioContext.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
      
      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + 0.3);
    } catch (err) {
      console.warn('[AlertSystem] Failed to play sound:', err);
    }
  }

  showNotification(title, message) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: message,
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="75" font-size="75">🔔</text></svg>',
          badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="75" font-size="75">📈</text></svg>'
        });
      } catch (err) {
        console.warn('[AlertSystem] Failed to show notification:', err);
      }
    }
  }

  showBanner(message) {
    const banner = document.createElement('div');
    banner.className = 'alert-banner';
    banner.textContent = message;
    banner.style.cssText = `
      position: fixed;
      top: 60px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      z-index: 10000;
      font-weight: 600;
      font-size: 16px;
      animation: slideDown 0.3s ease-out;
      max-width: 90%;
      text-align: center;
    `;
    
    document.body.appendChild(banner);
    
    setTimeout(() => {
      banner.style.animation = 'slideUp 0.3s ease-in';
      setTimeout(() => banner.remove(), 300);
    }, 5000);
  }

  getAlerts(symbol = null) {
    if (symbol) {
      const symbolAlerts = this.subscriptions.get(symbol.toUpperCase());
      if (!symbolAlerts) return [];
      return Array.from(symbolAlerts).map(id => this.alerts.get(id)).filter(Boolean);
    }
    return Array.from(this.alerts.values());
  }

  clearTriggeredAlerts() {
    const triggered = Array.from(this.alerts.values()).filter(a => a.triggered);
    triggered.forEach(a => this.deleteAlert(a.id));
  }

  destroy() {
    this.alerts.clear();
    this.subscriptions.clear();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export default new AlertSystem();