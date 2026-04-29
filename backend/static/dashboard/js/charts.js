/**
 * RMHealth Dashboard — Charts Module
 * Simple Canvas-based bar charts for vital trends.
 * © 2025 MORALES ZEPEDA RAUL
 */

const Charts = (() => {

  function drawBarChart(canvasId, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = 200 * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = '200px';
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = 200;
    const padding = { top: 20, right: 16, bottom: 30, left: 50 };
    const chartW = W - padding.left - padding.right;
    const chartH = H - padding.top - padding.bottom;

    if (!data || data.length === 0) {
      ctx.fillStyle = '#64748B';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sin datos disponibles', W / 2, H / 2);
      return;
    }

    const values = data.map(d => d.value);
    const maxVal = Math.max(...values, 1) * 1.1;
    const barW = Math.min(28, (chartW / data.length) - 6);

    // Grid lines
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(W - padding.right, y);
      ctx.stroke();

      ctx.fillStyle = '#64748B';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'right';
      const label = Math.round(maxVal - (maxVal / 4) * i);
      ctx.fillText(label, padding.left - 8, y + 4);
    }

    // Bars
    data.forEach((d, i) => {
      const x = padding.left + (chartW / data.length) * i + (chartW / data.length - barW) / 2;
      const barH = (d.value / maxVal) * chartH;
      const y = padding.top + chartH - barH;

      // Color by threshold
      let color = options.normalColor || '#10B981';
      if (d.status === 'warning') color = '#F59E0B';
      if (d.status === 'danger') color = '#EF4444';

      // Draw bar with rounded top
      ctx.fillStyle = color;
      ctx.beginPath();
      const r = Math.min(4, barW / 2);
      ctx.moveTo(x, y + r);
      ctx.arcTo(x, y, x + barW, y, r);
      ctx.arcTo(x + barW, y, x + barW, y + barH, r);
      ctx.lineTo(x + barW, padding.top + chartH);
      ctx.lineTo(x, padding.top + chartH);
      ctx.closePath();
      ctx.fill();

      // Label below
      ctx.fillStyle = '#64748B';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.label || '', x + barW / 2, H - 8);
    });
  }

  return { drawBarChart };
})();
