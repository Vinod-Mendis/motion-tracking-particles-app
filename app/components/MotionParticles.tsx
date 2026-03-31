"use client";

import { useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════
type Mode = "cosmos" | "fire" | "matrix" | "neon";

interface BodyPoint {
  x: number;
  y: number;
  hue: number;
  speed: number;
}

interface ModeConfig {
  bg: string;
  gravity: number;
  col: (h: number, a: number) => string;
}

// ═══════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════
const MODES: Record<Mode, ModeConfig> = {
  cosmos: {
    bg: "rgba(0,0,4,0.32)",
    gravity: 0,
    col: (h, a) => `hsla(${h},85%,74%,${a})`,
  },
  fire: {
    bg: "rgba(5,1,0,0.35)",
    gravity: -0.09,
    col: (h, a) => `hsla(${(h % 55) + 3},95%,65%,${a})`,
  },
  matrix: {
    bg: "rgba(0,5,2,0.35)",
    gravity: 0.05,
    col: (h, a) => `hsla(${120 + (h % 35)},90%,58%,${a})`,
  },
  neon: {
    bg: "rgba(2,0,7,0.32)",
    gravity: 0,
    col: (h, a) => `hsla(${h},100%,70%,${a})`,
  },
};

const BONES = [
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [18, 20],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [28, 30], [29, 31], [30, 32],
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
];

const SKEL_PAIRS = [
  [11, 12], [11, 13], [13, 15], [15, 17], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [28, 30], [29, 31], [30, 32],
];

const BODY_N = 800;
const MASK_W = 96;
const MASK_H = 54;
const VIS_THRESHOLD = 0.25;

const CAM_LEVELS = [0.1, 0.0, 0.28];
const CAM_LABELS = ["Dim", "Off", "Bright"];

function lmHue(i: number): number {
  if (i <= 10) return 200;
  if (i <= 12) return 270;
  if (i <= 16) return 310;
  if (i <= 22) return 180;
  if (i <= 24) return 130;
  return 45;
}

// ═══════════════════════════════════════════════════════════
//  PARTICLE CLASS
// ═══════════════════════════════════════════════════════════
class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
  sat: number;
  alpha: number;
  size: number;
  homeX: number;
  homeY: number;
  homeHue: number;
  homeTick: number;
  homeLife: number;

  constructor(W: number, H: number) {
    this.x = Math.random() * W;
    this.y = Math.random() * H;
    this.vx = 0;
    this.vy = 0;
    this.hue = Math.random() * 360;
    this.sat = 75 + Math.random() * 25;
    this.alpha = 0;
    this.size = 1.2 + Math.random() * 1.8;
    this.homeX = -1;
    this.homeY = -1;
    this.homeHue = 200;
    this.homeTick = 0;
    this.homeLife = 1;
  }

  update(
    W: number,
    H: number,
    bodyPts: BodyPoint[],
    hasMask: boolean,
    maskSample: () => { x: number; y: number } | null
  ) {
    this._updateBody(W, H, bodyPts, hasMask, maskSample);

    this.x += this.vx;
    this.y += this.vy;

    if (this.x < -20) this.x = W + 20;
    else if (this.x > W + 20) this.x = -20;
    if (this.y < -20) this.y = H + 20;
    else if (this.y > H + 20) this.y = -20;
  }

  _updateBody(
    _W: number,
    _H: number,
    bodyPts: BodyPoint[],
    hasMask: boolean,
    maskSample: () => { x: number; y: number } | null
  ) {
    // No body detected — lose home, fade out
    if (bodyPts.length === 0 && !hasMask) {
      this.homeX = -1;
      this.homeY = -1;
      this.alpha = Math.max(0, this.alpha - 0.06);
      return;
    }

    // Refresh home point from mask/skeleton every few frames
    this.homeTick--;
    if (this.homeTick <= 0 || this.homeX < 0) {
      const firstAssign = this.homeX < 0;
      let pt: { x: number; y: number; hue?: number } | null = null;

      if (hasMask && Math.random() < 0.95) {
        pt = maskSample();
      }
      if (!pt && bodyPts.length > 0) {
        pt = bodyPts[Math.floor(Math.random() * bodyPts.length)];
      }

      if (pt) {
        this.homeX = pt.x;
        this.homeY = pt.y;
        this.homeHue = pt.hue ?? this.homeHue;
        // Teleport to body on first assignment — never float from background
        if (firstAssign) {
          this.x = pt.x + (Math.random() - 0.5) * 6;
          this.y = pt.y + (Math.random() - 0.5) * 6;
          this.vx = 0;
          this.vy = 0;
        }
      }
      this.homeTick = this.homeLife;
    }

    if (this.homeX >= 0) {
      // Snap directly to home with small random scatter for organic look
      this.x = this.homeX + (Math.random() - 0.5) * 4;
      this.y = this.homeY + (Math.random() - 0.5) * 4;
      this.vx = 0;
      this.vy = 0;

      this.hue += (this.homeHue - this.hue) * 0.12;
    }

    // Minimal turbulence — just enough organic shimmer
    this.vx += (Math.random() - 0.5) * 0.15;
    this.vy += (Math.random() - 0.5) * 0.15;

    // Burst outward from fast-moving joints
    for (const bp of bodyPts) {
      if (bp.speed < 18) continue;
      const dx = this.x - bp.x;
      const dy = this.y - bp.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 50 * 50) continue;
      const d = Math.sqrt(d2) + 0.1;
      const burst = bp.speed * 0.04;
      this.vx += (dx / d) * burst;
      this.vy += (dy / d) * burst;
    }

    // Only visible when attached to a body point
    if (this.homeX >= 0) {
      this.alpha = Math.min(0.95, this.alpha + 0.08);
    } else {
      this.alpha = Math.max(0, this.alpha - 0.06);
    }
  }

  draw(ctx: CanvasRenderingContext2D, mode: Mode) {
    if (this.alpha <= 0.01) return;
    const r = this.size * 2.0;
    const col = MODES[mode].col;
    const grd = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r);
    grd.addColorStop(0, col(this.hue, this.alpha));
    grd.addColorStop(1, col(this.hue, 0));
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();
  }
}

// ═══════════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════════
export default function MotionParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stateRef = useRef({
    mode: "cosmos" as Mode,
    camIdx: 0,
    status: "Loading model...",
    bodyPts: [] as BodyPoint[],
    lmRaw: null as Array<{ x: number; y: number; z: number; visibility?: number }> | null,
    prevLmRaw: null as Array<{ x: number; y: number; z: number; visibility?: number }> | null,
    lmSpeeds: new Float32Array(33),
    bodyPixIdx: new Int32Array(MASK_W * MASK_H),
    bodyPixN: 0,
    hasMask: false,
    particles: [] as Particle[],
    W: 0,
    H: 0,
  });
  const statusRef = useRef<HTMLSpanElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const setMode = useCallback((m: Mode) => {
    const s = stateRef.current;
    s.mode = m;
    document.querySelectorAll<HTMLButtonElement>("[data-mode-btn]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.modeBtn === m);
    });
  }, []);

  const toggleCam = useCallback(() => {
    const s = stateRef.current;
    s.camIdx = (s.camIdx + 1) % 3;
    if (videoRef.current) {
      videoRef.current.style.opacity = String(CAM_LEVELS[s.camIdx]);
    }
    const btn = document.getElementById("camBtn");
    if (btn) btn.textContent = "Cam: " + CAM_LABELS[s.camIdx];
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const videoEl = videoRef.current!;
    const s = stateRef.current;

    // Mask canvas (offscreen)
    const maskCv = document.createElement("canvas");
    maskCv.width = MASK_W;
    maskCv.height = MASK_H;
    maskCanvasRef.current = maskCv;
    maskCtxRef.current = maskCv.getContext("2d", { willReadFrequently: true })!;

    // Resize handler
    function resize() {
      s.W = canvas.width = window.innerWidth;
      s.H = canvas.height = window.innerHeight;
    }
    window.addEventListener("resize", resize);
    resize();

    // Create particles
    s.particles = Array.from({ length: BODY_N }, () => new Particle(s.W, s.H));

    // ── Mask helpers ──
    function updateMask(seg: CanvasImageSource) {
      try {
        const maskCtx = maskCtxRef.current!;
        // Clear old mask data so ghost pixels don't persist at previous body positions
        maskCtx.clearRect(0, 0, MASK_W, MASK_H);
        maskCtx.save();
        maskCtx.translate(MASK_W, 0);
        maskCtx.scale(-1, 1);
        maskCtx.drawImage(seg, 0, 0, MASK_W, MASK_H);
        maskCtx.restore();

        const d = maskCtx.getImageData(0, 0, MASK_W, MASK_H).data;
        s.bodyPixN = 0;
        for (let i = 0, n = MASK_W * MASK_H; i < n; i++) {
          if (d[i * 4] > 40) s.bodyPixIdx[s.bodyPixN++] = i;
        }
        s.hasMask = s.bodyPixN > 20;
      } catch {
        s.hasMask = false;
      }
    }

    function maskSample(): { x: number; y: number } | null {
      if (!s.hasMask) return null;
      const flat = s.bodyPixIdx[Math.floor(Math.random() * s.bodyPixN)];
      return {
        x: ((flat % MASK_W) / MASK_W) * s.W,
        y: (Math.floor(flat / MASK_W) / MASK_H) * s.H,
      };
    }

    // ── Body points from landmarks ──
    function calcSpeeds(lms: Array<{ x: number; y: number; z: number; visibility?: number }>) {
      if (!s.prevLmRaw || !lms) {
        s.prevLmRaw = lms;
        return;
      }
      for (let i = 0; i < 33; i++) {
        const c = lms[i];
        const p = s.prevLmRaw[i];
        if (!c || !p) continue;
        const dx = (c.x - p.x) * s.W;
        const dy = (c.y - p.y) * s.H;
        s.lmSpeeds[i] = Math.sqrt(dx * dx + dy * dy);
      }
      s.prevLmRaw = lms;
    }

    function buildBodyPoints(lms: Array<{ x: number; y: number; z: number; visibility?: number }> | null) {
      if (!lms) {
        s.bodyPts = [];
        return;
      }
      const pts: BodyPoint[] = [];

      for (let i = 0; i < lms.length; i++) {
        const l = lms[i];
        if ((l.visibility ?? 1) < VIS_THRESHOLD) continue;
        pts.push({
          x: (1 - l.x) * s.W,
          y: l.y * s.H,
          hue: lmHue(i),
          speed: s.lmSpeeds[i],
        });
      }

      for (const [a, b] of BONES) {
        const la = lms[a];
        const lb = lms[b];
        if (!la || !lb || (la.visibility ?? 1) < VIS_THRESHOLD || (lb.visibility ?? 1) < VIS_THRESHOLD) continue;
        for (const t of [0.25, 0.5, 0.75]) {
          pts.push({
            x: (1 - (la.x + (lb.x - la.x) * t)) * s.W,
            y: (la.y + (lb.y - la.y) * t) * s.H,
            hue: (lmHue(a) + lmHue(b)) / 2,
            speed: (s.lmSpeeds[a] + s.lmSpeeds[b]) / 2,
          });
        }
      }
      s.bodyPts = pts;
    }

    // ── Skeleton drawing ──
    function drawSkeleton() {
      if (!s.lmRaw) return;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const VIS = 0.35;

      for (const [a, b] of SKEL_PAIRS) {
        const la = s.lmRaw[a];
        const lb = s.lmRaw[b];
        if (!la || !lb || (la.visibility ?? 1) < VIS || (lb.visibility ?? 1) < VIS) continue;
        const ax = (1 - la.x) * s.W;
        const ay = la.y * s.H;
        const bx = (1 - lb.x) * s.W;
        const by = lb.y * s.H;
        const spd = (s.lmSpeeds[a] + s.lmSpeeds[b]) * 0.5;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.strokeStyle = `hsla(${(lmHue(a) + lmHue(b)) / 2},80%,70%,${Math.min(0.45, 0.12 + spd * 0.012)})`;
        ctx.lineWidth = 1.2 + spd * 0.04;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      for (let i = 0; i < s.lmRaw.length; i++) {
        const l = s.lmRaw[i];
        if ((l.visibility ?? 1) < VIS) continue;
        const x = (1 - l.x) * s.W;
        const y = l.y * s.H;
        const spd = s.lmSpeeds[i];
        const r = 2.5 + spd * 0.1;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.5);
        g.addColorStop(0, `hsla(${lmHue(i)},100%,92%,0.75)`);
        g.addColorStop(1, `hsla(${lmHue(i)},100%,60%,0)`);
        ctx.beginPath();
        ctx.arc(x, y, r * 3.5, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }
      ctx.restore();
    }

    // ── Render loop ──
    let animId: number;
    function renderLoop() {
      const cfg = MODES[s.mode];
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = cfg.bg;
      ctx.fillRect(0, 0, s.W, s.H);

      ctx.globalCompositeOperation = "screen";
      for (const p of s.particles) {
        p.update(s.W, s.H, s.bodyPts, s.hasMask, maskSample);
        p.draw(ctx, s.mode);
      }

      drawSkeleton();
      animId = requestAnimationFrame(renderLoop);
    }

    // ── MediaPipe setup (dynamic import to avoid SSR) ──
    let cancelled = false;

    async function init() {
      const { Pose } = await import("@mediapipe/pose");
      const { Camera } = await import("@mediapipe/camera_utils");

      if (cancelled) return;

      const pose = new Pose({
        locateFile: (f: string) => `/mediapipe/pose/${f}`,
      });

      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: true,
        smoothSegmentation: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      pose.onResults((results: {
        segmentationMask?: CanvasImageSource;
        poseLandmarks?: Array<{ x: number; y: number; z: number; visibility?: number }>;
      }) => {
        if (results.segmentationMask) updateMask(results.segmentationMask);

        if (results.poseLandmarks) {
          calcSpeeds(results.poseLandmarks);
          buildBodyPoints(results.poseLandmarks);
          s.lmRaw = results.poseLandmarks;
          s.status = "Tracking";
          if (statusRef.current) statusRef.current.textContent = "Tracking";
        } else {
          s.bodyPts = [];
          s.lmRaw = null;
          s.status = "No person detected";
          if (statusRef.current) statusRef.current.textContent = "No person detected";
        }
      });

      try {
        if (statusRef.current) statusRef.current.textContent = "Loading model...";
        await pose.initialize();
        if (cancelled) return;
        if (statusRef.current) statusRef.current.textContent = "Starting camera...";

        const camera = new Camera(videoEl, {
          onFrame: async () => {
            await pose.send({ image: videoEl });
          },
          width: 640,
          height: 480,
        });
        await camera.start();
        if (statusRef.current) statusRef.current.textContent = "Tracking";
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Init error";
        if (statusRef.current) statusRef.current.textContent = "\u26a0 " + msg;
        console.error(e);
      }
    }

    init();
    renderLoop();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <>
      <video
        ref={videoRef}
        id="videoEl"
        autoPlay
        muted
        playsInline
        className="fixed top-0 left-0 w-full h-full object-cover pointer-events-none z-[1]"
        style={{ transform: "scaleX(-1)", opacity: 0.1 }}
      />
      <canvas
        ref={canvasRef}
        id="canvas"
        className="fixed top-0 left-0 w-full h-full z-[2]"
      />

      {/* UI Controls */}
      <div
        id="ui"
        className="fixed top-5 left-1/2 -translate-x-1/2 z-10 flex gap-2.5 items-center
                   bg-black/55 border border-white/[0.12] rounded-full px-5 py-2.5
                   backdrop-blur-[10px] whitespace-nowrap"
      >
        <span className="text-xs opacity-50 tracking-wider uppercase">Mode</span>
        <div className="w-px h-5 bg-white/15" />
        <button data-mode-btn="cosmos" className="active mode-btn" onClick={() => setMode("cosmos")}>Cosmos</button>
        <button data-mode-btn="fire" className="mode-btn" onClick={() => setMode("fire")}>Fire</button>
        <button data-mode-btn="matrix" className="mode-btn" onClick={() => setMode("matrix")}>Matrix</button>
        <button data-mode-btn="neon" className="mode-btn" onClick={() => setMode("neon")}>Neon</button>
        <div className="w-px h-5 bg-white/15" />
        <button id="camBtn" className="mode-btn" onClick={toggleCam}>Cam: Dim</button>
        <div className="w-px h-5 bg-white/15" />
        <span ref={statusRef} className="text-xs opacity-60 min-w-[140px] text-center">
          Loading model...
        </span>
      </div>

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-10 text-xs opacity-30 tracking-wide">
        Stand in frame &middot; Move your body &middot; Particles follow your silhouette
      </div>
    </>
  );
}
