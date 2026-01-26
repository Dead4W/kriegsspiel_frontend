import type { camera } from "@/engine/world/camera.ts";

/* ===== SETTINGS ===== */

const MASK_SIZE = 1024 * 2;          // px, size of generated mask
const CLOUD_SPEED_X = 0.022;
const CLOUD_SPEED_Y = 0.012;

const MASK_OPACITY = 0.25;       // final darkness

// Big clouds: larger features, fewer repeats per tile
const CLOUD_SCALE = 0.2;        // smaller => bigger clouds
const CLOUD_PERIOD = 15;          // smaller => bigger blobs (was 32)

// Big blur at edges
const CLOUD_BLUR_PX = 5;        // base blur radius in screen px (scaled by zoom)

/* ===== INTERNAL STATE ===== */

let maskCanvas: HTMLCanvasElement | null = null;
let maskCtx: CanvasRenderingContext2D | null = null;

/* ===== NOISE (USED ONLY ONCE) ===== */

function fract(x: number) {
  return x - Math.floor(x);
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function hash(x: number, y: number) {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
}

function noise(x: number, y: number, period: number) {
  const xi = Math.floor(x) % period;
  const yi = Math.floor(y) % period;

  const xf = fract(x);
  const yf = fract(y);

  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);

  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const ab = a + (b - a) * u;
  const cd = c + (d - c) * u;

  return ab + (cd - ab) * v;
}

function fbm(x: number, y: number, period: number) {
  let v = 0;
  let amp = 0.65;
  let freq = 1;

  // Slightly fewer octaves to keep it soft on huge shapes
  for (let i = 0; i < 4; i++) {
    v += noise(x * freq, y * freq, period * freq) * amp;
    freq *= 2;
    amp *= 0.5;
  }

  return v;
}

/* ===== MASK GENERATION ===== */

function generateMask() {
  maskCanvas = document.createElement("canvas");
  maskCanvas.width = MASK_SIZE;
  maskCanvas.height = MASK_SIZE;

  maskCtx = maskCanvas.getContext("2d")!;
  const img = maskCtx.createImageData(MASK_SIZE, MASK_SIZE);
  const data = img.data;

  const period = CLOUD_PERIOD;

  for (let y = 0; y < MASK_SIZE; y++) {
    for (let x = 0; x < MASK_SIZE; x++) {

      // Mirror coordinates (IMPORTANT)
      const mx = x < MASK_SIZE / 2 ? x : MASK_SIZE - x;
      const my = y < MASK_SIZE / 2 ? y : MASK_SIZE - y;

      // Scale down noise coords => bigger clouds
      const nx = (mx / MASK_SIZE) * period * CLOUD_SCALE;
      const ny = (my / MASK_SIZE) * period * CLOUD_SCALE;

      let n = fbm(nx, ny, period);

      // Wider transition => softer edges before blur
      n = smoothstep(0.38, 0.68, n);
      n = Math.pow(n, 1.25);

      const i = (y * MASK_SIZE + x) * 4;

      data[i + 0] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = Math.floor(n * 255);
    }
  }

  maskCtx.putImageData(img, 0, 0);
}

/* ===== DRAW ===== */

// Persistent wind phase in world units
let windPhaseX = 0;
let windPhaseY = 0;
let lastTime = 0;

export function drawClouds(
  ctx: CanvasRenderingContext2D,
  cam: camera,
  time: number
) {
  if (!maskCanvas) generateMask();

  // Compute dt (seconds). Assumes `time` is ms (e.g. performance.now()).
  if (lastTime === 0) lastTime = time;
  const dt = Math.max(0, time - lastTime);
  lastTime = time;

  const STRETCH = 4;
  const tileWorld = MASK_SIZE * STRETCH;

  // Integrate wind with dt and wrap to keep numbers small
  windPhaseX = (windPhaseX + dt * CLOUD_SPEED_X) % tileWorld;
  windPhaseY = (windPhaseY + dt * CLOUD_SPEED_Y) % tileWorld;

  ctx.save();
  ctx.globalAlpha = MASK_OPACITY;
  ctx.globalCompositeOperation = "source-over";
  ctx.imageSmoothingEnabled = true;

  const canvas = ctx.canvas;
  const camWorld = cam.screenToWorld({ x: 0, y: 0 });

  // Use wrapped phases (small numbers => stable modulo, no "acceleration")
  const oxWorld = (((camWorld.x + windPhaseX) % tileWorld) + tileWorld) % tileWorld;
  const oyWorld = (((camWorld.y + windPhaseY) % tileWorld) + tileWorld) % tileWorld;

  const tileScreen = tileWorld * cam.zoom;
  const ox = oxWorld * cam.zoom;
  const oy = oyWorld * cam.zoom;

  const w = canvas.width;
  const h = canvas.height;

  const blurPx = Math.min(220, Math.max(0, CLOUD_BLUR_PX * cam.zoom));
  ctx.filter = blurPx > 0 ? `blur(${blurPx}px)` : "none";

  const margin = tileScreen + blurPx * 3;

  for (let dx = -margin; dx < w + margin; dx += tileScreen) {
    for (let dy = -margin; dy < h + margin; dy += tileScreen) {
      ctx.drawImage(maskCanvas!, dx - ox, dy - oy, tileScreen, tileScreen);
    }
  }

  ctx.restore();
}
