// js/performance/sparkline.js
// Lightweight canvas sparkline (gradient + glow) - v17

export function drawSparkline(canvas, values, opts={}){
  if (!canvas) return;
  const vals = (values||[]).filter(v => Number.isFinite(v));
  const ctx = canvas.getContext("2d");
  const w = canvas.width = Math.max(10, canvas.clientWidth || 300);
  const h = canvas.height = opts.height || 72;
  ctx.clearRect(0,0,w,h);

  if (vals.length < 2){
    // small placeholder
    ctx.globalAlpha = 0.35;
    ctx.fillText("—", 6, h/2);
    ctx.globalAlpha = 1;
    return;
  }

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = 6;

  const toXY = (v,i)=>{
    const x = pad + (i * (w - pad*2) / (vals.length-1));
    const norm = (v - min) / ((max - min) || 1);
    const y = (h - pad) - norm * (h - pad*2);
    return {x,y};
  };

  const grad = ctx.createLinearGradient(0, 0, w, 0);
  const c1 = opts.color1 || "rgba(140,80,255,0.95)";
  const c2 = opts.color2 || "rgba(0,212,255,0.95)";
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);

  // fill under curve (subtle)
  ctx.beginPath();
  vals.forEach((v,i)=>{
    const {x,y} = toXY(v,i);
    if (i===0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  });
  ctx.lineTo(w-pad, h-pad);
  ctx.lineTo(pad, h-pad);
  ctx.closePath();

  const fillGrad = ctx.createLinearGradient(0, 0, 0, h);
  fillGrad.addColorStop(0, "rgba(255,255,255,0.08)");
  fillGrad.addColorStop(1, "rgba(255,255,255,0.00)");
  ctx.fillStyle = fillGrad;
  ctx.globalAlpha = 0.6;
  ctx.fill();
  ctx.globalAlpha = 1;

  // stroke with glow
  ctx.shadowColor = opts.glow || c1;
  ctx.shadowBlur = opts.glowBlur ?? 10;
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2;

  ctx.beginPath();
  vals.forEach((v,i)=>{
    const {x,y} = toXY(v,i);
    if (i===0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // optional marker
  const mi = Number.isFinite(opts.markerIndex) ? opts.markerIndex : -1;
  if (mi >= 0 && mi < vals.length){
    const {x,y} = toXY(vals[mi], mi);
    // subtle vertical guide
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 6);
    ctx.lineTo(x, h-6);
    ctx.stroke();
    ctx.restore();

    // dot
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,0.55)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.arc(x, y, 3.6, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  // reset shadow
  ctx.shadowBlur = 0;
}

// Utility: maps mouse x to nearest point index for the current canvas width.
export function getNearestSparkIndex(canvas, values, clientX){
  if (!canvas) return -1;
  const vals = (values||[]).filter(v => Number.isFinite(v));
  if (vals.length < 2) return -1;
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const w = Math.max(10, canvas.clientWidth || rect.width || 300);
  const pad = 6;
  const usable = Math.max(1, w - pad*2);
  const t = (x - pad) / usable;
  const idx = Math.round(t * (vals.length - 1));
  return Math.max(0, Math.min(vals.length - 1, idx));
}
