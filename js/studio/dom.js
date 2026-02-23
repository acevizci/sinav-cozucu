const c = document.getElementById('pdfCanvas') || document.getElementById('docCanvas');
export const Dom = {
  fileInp: document.getElementById('fileInp'),
  canvas: c,
  ctx: c.getContext('2d'),
  selectionRect: document.getElementById('selectionRect'),
  overlayLayer: document.getElementById('overlayLayer'),
  wrapper: document.getElementById('pdfWrapper') || document.getElementById('docWrapper'),
  canvasContainer: document.getElementById('canvasContainer'),
  pageControls: document.getElementById('pageControls'),
  pageInfo: document.getElementById('pageInfo'),
  zoomInfo: document.getElementById('zoomInfo'),
  qList: document.getElementById('qList'),
};
