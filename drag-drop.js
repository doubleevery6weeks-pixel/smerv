// drag-drop.js
export function enableDragDrop(grid) {
  if (!grid) return;

  let draggedEl = null;
  let placeholder = null;
  let startX, startY, offsetX, offsetY;
  let currentX = 0, currentY = 0;
  let targetX = 0, targetY = 0;
  let prevX = 0, prevY = 0;
  let rafId = null;

  function setCardDraggable(card) {
    const handle = card.querySelector('.drag-handle'); // ✅ drag only from handle
    if (!handle) return;

    handle.style.cursor = "grab";

    handle.addEventListener('mousedown', startDrag);
    handle.addEventListener('touchstart', startDrag, { passive: false });

    function startDrag(e) {
      e.preventDefault();

      draggedEl = card;
      const rect = card.getBoundingClientRect();

      startX = e.touches ? e.touches[0].clientX : e.clientX;
      startY = e.touches ? e.touches[0].clientY : e.clientY;
      offsetX = startX - rect.left;
      offsetY = startY - rect.top;

      // Placeholder
      placeholder = document.createElement('div');
      placeholder.className = 'chart-card placeholder';
      placeholder.style.height = `${rect.height}px`;
      if (grid) {
        grid.insertBefore(placeholder, card);
      }

      // Float dragged element
      card.style.position = 'absolute';
      card.style.top = `${rect.top + window.scrollY}px`;
      card.style.left = `${rect.left + window.scrollX}px`;
      card.style.width = `${rect.width}px`;
      card.style.height = `${rect.height}px`;   // ✅ lock height
      card.style.pointerEvents = 'none';
      if (card.classList) card.classList.add('dragging');

      currentX = rect.left + window.scrollX;
      currentY = rect.top + window.scrollY;
      targetX = currentX;
      targetY = currentY;
      prevX = currentX;
      prevY = currentY;

      animateDrag();

      document.addEventListener('mousemove', onDrag);
      document.addEventListener('touchmove', onDrag, { passive: false });
      document.addEventListener('mouseup', endDrag);
      document.addEventListener('touchend', endDrag);
    }

    function onDrag(e) {
      if (!draggedEl) return;
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const y = e.touches ? e.touches[0].clientY : e.clientY;

      targetX = x - offsetX;
      targetY = y - offsetY;

      const afterElement = getDragAfterElement(grid, y);
      if (afterElement && placeholder) {
        grid.insertBefore(placeholder, afterElement);
      } else if (placeholder) {
        grid.appendChild(placeholder);
      }
    }

    function animateDrag() {
      if (!draggedEl) return;

      // Smooth follow
      currentX += (targetX - currentX) * 0.25;
      currentY += (targetY - currentY) * 0.25;

      // Velocity
      const dx = currentX - prevX;
      const dy = currentY - prevY;
      prevX = currentX;
      prevY = currentY;

      // Squash & stretch mapping
      const maxSquash = 0.07; // 7%
      const scaleX = 1 + Math.min(Math.max(dx / 50, -maxSquash), maxSquash);
      const scaleY = 1 + Math.min(Math.max(dy / 50, -maxSquash), maxSquash);

      draggedEl.style.transform =
        `translate(${currentX - draggedEl.offsetLeft}px, ${currentY - draggedEl.offsetTop}px) scale(${scaleX}, ${scaleY})`;

      rafId = requestAnimationFrame(animateDrag);
    }

    function endDrag() {
      if (!draggedEl) return;

      cancelAnimationFrame(rafId);

      if (placeholder && placeholder.parentNode) {
        placeholder.parentNode.insertBefore(draggedEl, placeholder);
      }

      // Reset styles
      draggedEl.style.position = '';
      draggedEl.style.top = '';
      draggedEl.style.left = '';
      draggedEl.style.width = '';
      draggedEl.style.height = '';   // ✅ reset height
      draggedEl.style.pointerEvents = '';
      draggedEl.style.transform = '';

      if (draggedEl.classList) {
        draggedEl.classList.remove('dragging');
        draggedEl.classList.add('dropped');
        setTimeout(() => {
          if (draggedEl && draggedEl.classList) {
            draggedEl.classList.remove('dropped');
          }
        }, 400);
      }

      if (placeholder) {
        placeholder.remove();
        placeholder = null;
      }

      draggedEl = null;

      saveOrder();

      document.removeEventListener('mousemove', onDrag);
      document.removeEventListener('touchmove', onDrag);
      document.removeEventListener('mouseup', endDrag);
      document.removeEventListener('touchend', endDrag);
    }
  }

  // ✅ Top half → before, bottom half → after
  function getDragAfterElement(container, y) {
    if (!container) return null;
    const elements = [...container.querySelectorAll('.chart-card:not(.dragging):not(.placeholder)')];

    for (const child of elements) {
      const rect = child.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;

      if (y < midpoint) {
        return child; // insert before
      } else if (y >= midpoint && y <= rect.bottom) {
        return child.nextSibling; // insert after
      }
    }

    // If below all → append at the end
    return null;
  }

  function saveOrder() {
    if (!grid) return;
    const order = Array.from(grid.querySelectorAll('.chart-card'))
      .map(el => el.dataset.symbol)
      .filter(Boolean);
    localStorage.setItem('chartOrder', JSON.stringify(order));
  }

  function restoreOrder() {
    if (!grid) return;
    try {
      const raw = localStorage.getItem('chartOrder');
      if (!raw) return;
      const order = JSON.parse(raw);
      if (!Array.isArray(order)) return;

      const nodeMap = {};
      Array.from(grid.querySelectorAll('.chart-card')).forEach(n => {
        if (n.dataset?.symbol) nodeMap[n.dataset.symbol.toLowerCase()] = n;
      });

      order.forEach(sym => {
        const node = nodeMap[sym?.toLowerCase()];
        if (node) grid.appendChild(node);
      });
    } catch (err) {
      console.warn('Failed to restore chart order', err);
    }
  }

  Array.from(grid.querySelectorAll('.chart-card')).forEach(setCardDraggable);
  restoreOrder();
}
