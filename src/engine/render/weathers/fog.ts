import type { camera } from "@/engine/world/camera.ts";

/* ===== SETTINGS ===== */

const MASK_SIZE = 1024;

// Base fog movement (world units per second)
const FOG_SPEED_X = 0.020;
const FOG_SPEED_Y = 0.012;

// Secondary swirl movement
const SWIRL_SPEED_X = 0.008;
const SWIRL_SPEED_Y = 0.012;

// Opacity per layer
const FOG_OPACITY_LAYER1 = 0.4;

// Noise shape
const FOG_SCALE = 4;
const FOG_PERIOD = 6;

// Blur
const FOG_BLUR_PX = 10;

const TAU = Math.PI * 2;

/* ===== INTERNAL STATE ===== */

let maskCanvas: HTMLCanvasElement | null = null;
let maskCtx: CanvasRenderingContext2D | null = null;

type FogState = {
  windX: number;
  windY: number;
  swirlX: number;
  swirlY: number;
};

const layerBack: FogState = {
  windX: 0,
  windY: 0,
  swirlX: 0,
  swirlY: 0,
};

const layerFront: FogState = {
  windX: 0,
  windY: 0,
  swirlX: 0,
  swirlY: 0,
};

let lastTime = 0;

/* ===== NOISE ===== */

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
  const xi = ((Math.floor(x) % period) + period) % period;
  const yi = ((Math.floor(y) % period) + period) % period;

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

function fbmFog(x: number, y: number, period: number) {
  let v = 0;
  let amp = 0.6;
  let freq = 1;

  for (let i = 0; i < 5; i++) {
    v += noise(x * freq, y * freq, period) * amp;
    freq *= 2;
    amp *= 0.5;
  }

  return v;
}

/* ===== MIRROR UTILS ===== */

function mirrorCoord(i: number, size: number) {
  const m = i % (size * 2);
  return m < size ? m : size * 2 - m - 1;
}

/* ===== MASK GENERATION ===== */

function generateMask() {
  maskCanvas = document.createElement("canvas");
  maskCanvas.width = MASK_SIZE;
  maskCanvas.height = MASK_SIZE;

  maskCtx = maskCanvas.getContext("2d")!;
  const img = maskCtx.createImageData(MASK_SIZE, MASK_SIZE);
  const data = img.data;

  for (let y = 0; y < MASK_SIZE; y++) {
    for (let x = 0; x < MASK_SIZE; x++) {

      // Proper mirror tiling
      const mx = mirrorCoord(x, MASK_SIZE);
      const my = mirrorCoord(y, MASK_SIZE);

      const nx = (mx / MASK_SIZE) * FOG_PERIOD * FOG_SCALE;
      const ny = (my / MASK_SIZE) * FOG_PERIOD * FOG_SCALE;

      let n = fbmFog(nx, ny, FOG_PERIOD);

      // Fog distribution
      n = smoothstep(0.25, 0.75, n);
      n = Math.pow(n, 0.9);
      n = 0.15 + n * 0.85;

      const i = (y * MASK_SIZE + x) * 4;
      data[i + 0] = 200;
      data[i + 1] = 200;
      data[i + 2] = 200;
      data[i + 3] = Math.floor(n * 255);
    }
  }

  maskCtx.putImageData(img, 0, 0);
}

/* ===== DRAW ===== */

function drawFogLayer(
  ctx: CanvasRenderingContext2D,
  cam: camera,
  state: FogState,
  dt: number,
  opacity: number,
  speedMul: number
) {
  const STRETCH = 4;
  const tileWorld = MASK_SIZE * STRETCH;

  // Wind (zoom-compensated)
  state.windX =
    (state.windX + (dt * FOG_SPEED_X * speedMul) / cam.zoom) % tileWorld;
  state.windY =
    (state.windY + (dt * FOG_SPEED_Y * speedMul) / cam.zoom) % tileWorld;

  // Swirl phase
  state.swirlX = (state.swirlX + dt * SWIRL_SPEED_X * speedMul) % TAU;
  state.swirlY = (state.swirlY + dt * SWIRL_SPEED_Y * speedMul) % TAU;

  const camWorld = cam.screenToWorld({ x: 0, y: 0 });

  // Periodic distortion (tile-safe)
  const distortX =
    Math.sin(state.swirlX + (camWorld.x / tileWorld) * TAU) * 120 * speedMul;
  const distortY =
    Math.cos(state.swirlY + (camWorld.y / tileWorld) * TAU) * 120 * speedMul;

  const oxWorld =
    (((camWorld.x + state.windX + distortX) % tileWorld) + tileWorld) %
    tileWorld;
  const oyWorld =
    (((camWorld.y + state.windY + distortY) % tileWorld) + tileWorld) %
    tileWorld;

  const tileScreen = tileWorld * cam.zoom;
  const ox = oxWorld * cam.zoom;
  const oy = oyWorld * cam.zoom;

  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  const blurPx = Math.min(240, FOG_BLUR_PX * cam.zoom);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.imageSmoothingEnabled = true;
  ctx.filter = blurPx > 0 ? `blur(${blurPx}px)` : "none";

  const margin = tileScreen + blurPx * 3;

  for (let dx = -margin; dx < w + margin; dx += tileScreen) {
    for (let dy = -margin; dy < h + margin; dy += tileScreen) {
      ctx.drawImage(maskCanvas!, dx - ox, dy - oy, tileScreen, tileScreen);
    }
  }

  ctx.restore();
}

/* ===== PUBLIC API ===== */

export function drawFog(
  ctx: CanvasRenderingContext2D,
  cam: camera,
  time: number,
  mult: number,
) {
  if (!maskCanvas) generateMask();

  if (lastTime === 0) lastTime = time;
  const dt = Math.max(0, time - lastTime) * 0.001;
  lastTime = time;

  // Back layer — большие медленные клубни
  drawFogLayer(ctx, cam, layerBack, dt, FOG_OPACITY_LAYER1 * mult, 1.0);
}
