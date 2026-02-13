// sinav-v2/js/studio/preview.js
// Generates compact previews (dataURL) for question rectangles.
// - PDF: expects a rendered page canvas at scale `renderScale` and template coords at scale 1.0
// - Image: expects a source canvas at natural resolution

function safeToDataURL(canvas){
  // Prefer webp for size; fallback to png if unsupported.
  try { return canvas.toDataURL("image/webp", 0.82); } catch {}
  try { return canvas.toDataURL("image/png"); } catch {}
  return null;
}

export function cropCanvas(srcCanvas, sx, sy, sw, sh, maxSide=900){
  // Clamp
  sx = Math.max(0, Math.floor(sx));
  sy = Math.max(0, Math.floor(sy));
  sw = Math.max(1, Math.floor(sw));
  sh = Math.max(1, Math.floor(sh));

  const c = document.createElement("canvas");
  c.width = sw; c.height = sh;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

  // Downscale if too big
  const side = Math.max(c.width, c.height);
  if (side > maxSide){
    const ratio = maxSide / side;
    const d = document.createElement("canvas");
    d.width = Math.max(1, Math.round(c.width * ratio));
    d.height = Math.max(1, Math.round(c.height * ratio));
    const dctx = d.getContext("2d");
    dctx.imageSmoothingEnabled = true;
    dctx.drawImage(c, 0, 0, d.width, d.height);
    return { canvas: d, dataUrl: safeToDataURL(d) };
  }

  return { canvas: c, dataUrl: safeToDataURL(c) };
}
