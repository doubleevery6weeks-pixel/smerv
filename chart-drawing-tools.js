// chart-drawing-tools.js
// Drawing Tools for Lightweight Charts with per-chart localStorage support
// Supports: trend line, horizontal/vertical line, Fibonacci retracement, rectangle, ellipse
// ✅ THEME-AWARE: Respects light/dark theme toggle

export class DrawingToolsManager {
  constructor(chart, container, chartKey) {
    this.chart = chart;
    this.container = container;
    this.chartKey = chartKey;
    this.overlay = null;
    this.toolbar = null;
    this.activeTool = null;
    this.drawings = [];
    this.isDrawing = false;
    this.currentShape = null;
    this.color = "#2196f3";
    this.thickness = 2;
    this.eventHandlers = [];
    this.resizeHandler = null;
    this.toolButtons = {};
    this.themeObserver = null; // ✅ NEW: Watch for theme changes
    this.init();
    this.loadDrawings();
  }

  addEventListener(element, event, handler, options) {
    if (!element) return;
    element.addEventListener(event, handler, options);
    this.eventHandlers.push({ element, event, handler, options });
  }

  // ✅ NEW: Get current theme-aware colors
  getThemedColors() {
    const root = document.documentElement;
    const theme = root.getAttribute('data-theme') || 'dark';
    const isDark = theme === 'dark';
    
    return {
      toolbarBg: isDark ? 'rgba(24,32,44,0.96)' : 'rgba(245,247,250,0.96)',
      toolbarBorder: isDark ? '#30363d' : '#d0d7de',
      buttonColor: isDark ? '#fff' : '#23272e',
      buttonHoverBg: isDark ? 'rgba(33, 118, 255, 0.2)' : 'rgba(33, 118, 255, 0.15)',
      inputBg: isDark ? '#161b22' : '#ffffff',
      inputBorder: isDark ? '#30363d' : '#d0d7de',
      inputColor: isDark ? '#fff' : '#23272e',
    };
  }

  // ✅ NEW: Apply themed styles to toolbar
  applyThemedStyles() {
    if (!this.toolbar) return;
    
    const colors = this.getThemedColors();
    
    Object.assign(this.toolbar.style, {
      background: colors.toolbarBg,
      borderRadius: "7px",
      padding: "4px 6px",
      gap: "7px",
      alignItems: "center",
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      backdropFilter: "blur(10px)",
      border: `1px solid ${colors.toolbarBorder}`
    });

    // Update button colors
    Object.values(this.toolButtons).forEach(btn => {
      btn.style.color = colors.buttonColor;
    });

    // Update input fields
    const inputs = this.toolbar.querySelectorAll('input[type="number"]');
    inputs.forEach(input => {
      Object.assign(input.style, {
        background: colors.inputBg,
        color: colors.inputColor,
        border: `1px solid ${colors.inputBorder}`
      });
    });
  }

  // ✅ NEW: Watch for theme changes
  setupThemeObserver() {
    const root = document.documentElement;
    
    this.themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          console.log('[DrawingTools] Theme changed, updating styles');
          this.applyThemedStyles();
        }
      });
    });

    this.themeObserver.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
  }

  init() {
    this.createOverlay();
    this.createToolbar();
    this.attachEvents();
    this.setupThemeObserver(); // ✅ Watch for theme changes
    
    // Track resize handler
    this.resizeHandler = () => this.redraw();
    window.addEventListener('resize', this.resizeHandler);
  }

  createOverlay() {
    this.overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    Object.assign(this.overlay.style, {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: 20
    });
    this.container.appendChild(this.overlay);
  }

  createToolbar() {
    const colors = this.getThemedColors(); // ✅ Get theme colors
    
    let bar = document.createElement("div");
    bar.className = "drawing-toolbar";
    Object.assign(bar.style, {
      position: "absolute",
      top: "6px",
      right: "8px",
      zIndex: 21,
      background: colors.toolbarBg,
      border: `1px solid ${colors.toolbarBorder}`,
      borderRadius: "7px",
      padding: "4px 6px",
      display: "none",
      gap: "7px",
      alignItems: "center",
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      backdropFilter: "blur(10px)"
    });

    // Tools
    const tools = [
      { tool: "select", label: "↻", tooltip: "Select" },
      { tool: "trend",  label: "📈", tooltip: "Trend Line" },
      { tool: "hline",  label: "▬",  tooltip: "Horizontal Line" },
      { tool: "vline",  label: "▮",  tooltip: "Vertical Line" },
      { tool: "fib",    label: "𝔽",  tooltip: "Fibonacci" },
      { tool: "rect",   label: "▭",  tooltip: "Rectangle" },
      { tool: "ellipse",label: "◯",  tooltip: "Ellipse" },
      { tool: "erase",  label: "✖", tooltip: "Delete Mode" },
    ];
    
    for (const t of tools) {
      let btn = document.createElement("button");
      btn.textContent = t.label;
      btn.title = t.tooltip;
      btn.onclick = () => this.setTool(t.tool);
      Object.assign(btn.style, {
        fontSize: "1.14em",
        background: "none",
        border: "none",
        color: colors.buttonColor, // ✅ Theme-aware
        cursor: "pointer",
        padding: "2px 7px",
        borderRadius: "4px",
        transition: "all 0.2s"
      });
      bar.appendChild(btn);
      this.toolButtons[t.tool] = btn;
    }
    
    // Color picker
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = this.color;
    colorInput.title = "Line/Shape Color";
    colorInput.oninput = e => { this.color = e.target.value; };
    Object.assign(colorInput.style, {
      width: "30px",
      height: "24px",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer"
    });
    bar.appendChild(colorInput);
    
    // Thickness picker
    const thickInput = document.createElement("input");
    thickInput.type = "number";
    thickInput.value = this.thickness;
    thickInput.min = 1;
    thickInput.max = 10;
    thickInput.style.width = "38px";
    thickInput.title = "Line Width";
    thickInput.oninput = e => { this.thickness = Math.max(1, Math.min(10, +e.target.value)); };
    Object.assign(thickInput.style, {
      background: colors.inputBg, // ✅ Theme-aware
      color: colors.inputColor, // ✅ Theme-aware
      border: `1px solid ${colors.inputBorder}`, // ✅ Theme-aware
      borderRadius: "4px",
      padding: "2px 4px"
    });
    bar.appendChild(thickInput);
    
    // Clear all
    const clearBtn = document.createElement("button");
    clearBtn.textContent = "🗑";
    clearBtn.title = "Clear All";
    clearBtn.onclick = () => { 
      if (confirm('Clear all drawings?')) {
        this.drawings = []; 
        this.saveDrawings(); 
        this.redraw(); 
      }
    };
    Object.assign(clearBtn.style, {
      fontSize: "1.14em",
      background: "none",
      border: "none",
      color: colors.buttonColor, // ✅ Theme-aware
      cursor: "pointer",
      borderRadius: "4px",
      padding: "2px 7px"
    });
    bar.appendChild(clearBtn);
    
    this.container.appendChild(bar);
    this.toolbar = bar;
  }

  setTool(tool) {
    this.activeTool = tool;
    this.isDrawing = false;
    this.currentShape = null;
    
    // Update button styles
    for (const t in this.toolButtons) {
      this.toolButtons[t].style.background = (t === tool) ? "#2176ff44" : "none";
    }
    
    // Enable/disable overlay pointer events
    if (tool && tool !== 'select') {
      this.overlay.style.pointerEvents = "auto";
    } else {
      this.overlay.style.pointerEvents = "none";
    }
  }

  attachEvents() {
    this.addEventListener(this.overlay, "mousedown", e => this.onDown(e));
    this.addEventListener(this.overlay, "mousemove", e => this.onMove(e));
    this.addEventListener(this.overlay, "mouseup", e => this.onUp(e));
    
    this.addEventListener(this.overlay, "touchstart", e => {
      e.preventDefault();
      this.onDown(e);
    }, { passive: false });
    this.addEventListener(this.overlay, "touchmove", e => {
      e.preventDefault();
      this.onMove(e);
    }, { passive: false });
    this.addEventListener(this.overlay, "touchend", e => this.onUp(e));
    
    this.addEventListener(this.overlay, "click", e => {
      if (this.activeTool === "erase") {
        const [x, y] = this.getChartXY(e);
        const beforeCount = this.drawings.length;
        this.drawings = this.drawings.filter(shape => !this.hitTest(shape, x, y));
        if (this.drawings.length < beforeCount) {
          this.saveDrawings();
          this.redraw();
        }
      }
    });
  }

  getChartXY(e) {
    const rect = this.overlay.getBoundingClientRect();
    let clientX, clientY;
    if (e.touches && e.touches.length) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return [clientX - rect.left, clientY - rect.top];
  }

  onDown(e) {
    if (!this.activeTool || this.activeTool === "select" || this.activeTool === "erase") return;
    this.isDrawing = true;
    const [x, y] = this.getChartXY(e);
    this.currentShape = { 
      tool: this.activeTool, 
      color: this.color, 
      thickness: this.thickness, 
      points: [{ x, y }] 
    };
    if (["hline", "vline", "trend", "fib", "rect", "ellipse"].includes(this.activeTool)) {
      this.currentShape.points.push({ x, y });
    }
    if (this.activeTool === "fib") {
      this.currentShape.levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
    }
    e.preventDefault();
  }

  onMove(e) {
    if (!this.isDrawing || !this.currentShape) return;
    const [x, y] = this.getChartXY(e);
    this.currentShape.points[1] = { x, y };
    this.redraw();
    this.drawShape(this.currentShape, true);
    e.preventDefault();
  }

  onUp(e) {
    if (!this.isDrawing || !this.currentShape) return;
    const [x, y] = this.getChartXY(e);
    this.currentShape.points[1] = { x, y };
    
    const p0 = this.currentShape.points[0];
    const p1 = this.currentShape.points[1];
    const distance = Math.sqrt(Math.pow(p1.x - p0.x, 2) + Math.pow(p1.y - p0.y, 2));
    
    if (distance > 5) {
      this.drawings.push(this.currentShape);
      this.saveDrawings();
    }
    
    this.isDrawing = false;
    this.currentShape = null;
    this.redraw();
    e.preventDefault();
  }

  redraw() {
    while (this.overlay.firstChild) this.overlay.removeChild(this.overlay.firstChild);
    for (const s of this.drawings) this.drawShape(s, false);
  }

  drawShape(shape, isTemp) {
    const { tool, color, thickness, points } = shape;
    if (!points[1]) return;
    
    if (tool === "trend") {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", points[0].x); 
      line.setAttribute("y1", points[0].y);
      line.setAttribute("x2", points[1].x); 
      line.setAttribute("y2", points[1].y);
      line.setAttribute("stroke", color); 
      line.setAttribute("stroke-width", thickness);
      line.setAttribute("fill", "none");
      if (isTemp) line.setAttribute("opacity", 0.6);
      this.overlay.appendChild(line);
    }
    
    if (tool === "hline") {
      const y = points[0].y;
      const w = this.overlay.clientWidth;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", 0); 
      line.setAttribute("y1", y);
      line.setAttribute("x2", w); 
      line.setAttribute("y2", y);
      line.setAttribute("stroke", color); 
      line.setAttribute("stroke-width", thickness);
      line.setAttribute("stroke-dasharray", "6 3");
      if (isTemp) line.setAttribute("opacity", 0.6);
      this.overlay.appendChild(line);
    }
    
    if (tool === "vline") {
      const x = points[0].x;
      const h = this.overlay.clientHeight;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x); 
      line.setAttribute("y1", 0);
      line.setAttribute("x2", x); 
      line.setAttribute("y2", h);
      line.setAttribute("stroke", color); 
      line.setAttribute("stroke-width", thickness);
      line.setAttribute("stroke-dasharray", "6 3");
      if (isTemp) line.setAttribute("opacity", 0.6);
      this.overlay.appendChild(line);
    }
    
    if (tool === "rect") {
      const [p1, p2] = points;
      const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
      const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", x); 
      rect.setAttribute("y", y);
      rect.setAttribute("width", w); 
      rect.setAttribute("height", h);
      rect.setAttribute("stroke", color); 
      rect.setAttribute("stroke-width", thickness);
      rect.setAttribute("fill", "none");
      if (isTemp) rect.setAttribute("opacity", 0.6);
      this.overlay.appendChild(rect);
    }
    
    if (tool === "ellipse") {
      const [p1, p2] = points;
      const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
      const rx = Math.abs(p2.x - p1.x) / 2, ry = Math.abs(p2.y - p1.y) / 2;
      const el = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
      el.setAttribute("cx", cx); 
      el.setAttribute("cy", cy);
      el.setAttribute("rx", rx); 
      el.setAttribute("ry", ry);
      el.setAttribute("stroke", color); 
      el.setAttribute("stroke-width", thickness);
      el.setAttribute("fill", "none");
      if (isTemp) el.setAttribute("opacity", 0.6);
      this.overlay.appendChild(el);
    }
    
    if (tool === "fib") {
      const [p1, p2] = points;
      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      for (let lvl of levels) {
        const y = p1.y + (p2.y - p1.y) * lvl;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", p1.x); 
        line.setAttribute("y1", y);
        line.setAttribute("x2", p2.x); 
        line.setAttribute("y2", y);
        line.setAttribute("stroke", color); 
        line.setAttribute("stroke-width", thickness);
        line.setAttribute("stroke-dasharray", "2 2");
        if (isTemp) line.setAttribute("opacity", 0.6);
        this.overlay.appendChild(line);
        
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", Math.max(p1.x, p2.x) + 6); 
        text.setAttribute("y", y + 4);
        text.setAttribute("fill", color);
        text.setAttribute("font-size", "12px");
        text.setAttribute("font-weight", "600");
        text.textContent = `${(lvl * 100).toFixed(1)}%`;
        if (isTemp) text.setAttribute("opacity", 0.6);
        this.overlay.appendChild(text);
      }
    }
  }

  saveDrawings() {
    try {
      localStorage.setItem("drawings-" + this.chartKey, JSON.stringify(this.drawings));
    } catch (e) { 
      console.warn('[DrawingTools] Failed to save drawings:', e);
    }
  }
  
  loadDrawings() {
    try {
      const data = localStorage.getItem("drawings-" + this.chartKey);
      this.drawings = data ? JSON.parse(data) : [];
      this.redraw();
    } catch (e) { 
      console.warn('[DrawingTools] Failed to load drawings:', e);
      this.drawings = []; 
    }
  }

  hitTest(shape, x, y) {
    const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    if (!shape.points[1]) return false;
    
    if (["trend", "hline", "vline"].includes(shape.tool)) {
      const p1 = shape.points[0], p2 = shape.points[1];
      const l2 = dist2(p1, p2);
      if (l2 === 0) return false;
      let t = ((x - p1.x) * (p2.x - p1.x) + (y - p1.y) * (p2.y - p1.y)) / l2;
      t = Math.max(0, Math.min(1, t));
      const proj = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
      return Math.sqrt(dist2({ x, y }, proj)) < 10;
    }
    
    if (shape.tool === "rect") {
      const [p1, p2] = shape.points;
      const x1 = Math.min(p1.x, p2.x), x2 = Math.max(p1.x, p2.x);
      const y1 = Math.min(p1.y, p2.y), y2 = Math.max(p1.y, p2.y);
      return x >= x1 && x <= x2 && y >= y1 && y <= y2;
    }
    
    if (shape.tool === "ellipse") {
      const [p1, p2] = shape.points;
      const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
      const rx = Math.abs(p2.x - p1.x) / 2, ry = Math.abs(p2.y - p1.y) / 2;
      if (rx === 0 || ry === 0) return false;
      return (((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2)) <= 1.1;
    }
    
    if (shape.tool === "fib") {
      const [p1, p2] = shape.points;
      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      for (let lvl of levels) {
        const ly = p1.y + (p2.y - p1.y) * lvl;
        if (Math.abs(ly - y) < 10 && x >= Math.min(p1.x, p2.x) && x <= Math.max(p1.x, p2.x)) return true;
      }
      return false;
    }
    
    return false;
  }

  destroy() {
    console.log('[DrawingTools] Destroying...');
    
    try {
      this.activeTool = null;
      this.isDrawing = false;
      this.currentShape = null;
      
      // ✅ Disconnect theme observer
      if (this.themeObserver) {
        this.themeObserver.disconnect();
        this.themeObserver = null;
      }
      
      if (this.resizeHandler) {
        window.removeEventListener('resize', this.resizeHandler);
        this.resizeHandler = null;
      }

      this.eventHandlers.forEach(({ element, event, handler, options }) => {
        try {
          if (element && typeof element.removeEventListener === 'function') {
            element.removeEventListener(event, handler, options);
          }
        } catch (err) {
          console.warn('[DrawingTools] Error removing event listener:', err);
        }
      });
      this.eventHandlers = [];

      if (this.toolButtons) {
        Object.keys(this.toolButtons).forEach(key => {
          this.toolButtons[key] = null;
        });
        this.toolButtons = null;
      }

      if (this.overlay) {
        while (this.overlay.firstChild) {
          this.overlay.removeChild(this.overlay.firstChild);
        }
        if (this.overlay.parentNode) {
          this.overlay.parentNode.removeChild(this.overlay);
        }
        this.overlay = null;
      }

      if (this.toolbar) {
        if (this.toolbar.parentNode) {
          this.toolbar.parentNode.removeChild(this.toolbar);
        }
        this.toolbar = null;
      }

      this.drawings = [];
      this.chart = null;
      this.container = null;
      this.chartKey = null;

      console.log('[DrawingTools] Destroyed successfully');
    } catch (error) {
      console.error('[DrawingTools] Error during destruction:', error);
    }
  }
}