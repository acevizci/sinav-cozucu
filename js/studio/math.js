export const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
export const snapPx = (v, grid=6) => Math.round(v / grid) * grid;
