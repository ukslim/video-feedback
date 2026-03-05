"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { vertexSource, fragmentSource } from "@/app/simulation/shaders";
import {
  encodeFeedbackParams,
  getFeedbackParamsFromUrl,
  type FeedbackParams,
} from "@/app/lib/feedbackUrlParams";

const FEEDBACK_GAIN = 0.88;
const FEEDBACK_BIAS = 0.02;
const GYRO_SENSITIVITY = 0.5;

// Breathing (no gyro): cycles per minute, separate freq per axis so they drift in/out of phase
const BREATH_CPM_PAN_X = 10.2;
const BREATH_CPM_PAN_Y = 11.1;
const BREATH_CPM_PITCH = 10.7;
const BREATH_CPM_YAW = 11.5;
const BREATH_PAN_AMPLITUDE = 0.005; // ±5%
const BREATH_ROTATION_DEG = 0.01; // ±1 degree
const DEG_TO_RAD = Math.PI / 180;

/** Prefer gyro on touch devices (natural motion from holding phone); breathing on desktop. */
function isLikelyMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.maxTouchPoints > 0 || "ontouchstart" in window;
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vs: WebGLShader,
  fs: WebGLShader,
): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function createTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): WebGLTexture | null {
  const tex = gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function createFramebuffer(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
): WebGLFramebuffer | null {
  const fb = gl.createFramebuffer();
  if (!fb) return null;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );
  return fb;
}

function noise1D(t: number): number {
  return (
    Math.sin(t * 1.7) * 0.5 +
    Math.sin(t * 2.3 + 1) * 0.3 +
    Math.sin(t * 3.1 + 2) * 0.2
  );
}

export default function FeedbackCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gyroAvailable, setGyroAvailable] = useState(false);
  const [gyroPermission, setGyroPermission] = useState<
    "prompt" | "granted" | "denied" | null
  >(null);
  const [showDragOverlay, setShowDragOverlay] = useState(true);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice(isLikelyMobile());
  }, []);

  const permissionPromptUsedRef = useRef(false);

  const stateRef = useRef<{
    gl: WebGL2RenderingContext | null;
    program: WebGLProgram | null;
    vao: WebGLVertexArrayObject | null;
    texA: WebGLTexture | null;
    texB: WebGLTexture | null;
    fbA: WebGLFramebuffer | null;
    fbB: WebGLFramebuffer | null;
    width: number;
    height: number;
    panX: number;
    panY: number;
    pitch: number;
    yaw: number;
    distance: number;
    flameOffsetX: number;
    flameOffsetY: number;
    pointerDown: boolean;
    sector: "pan" | "orient" | "zoom" | "flame" | null;
    primaryPointerId: number | null;
    secondFingerDown: boolean;
    previousSector: "pan" | "orient" | "zoom" | "flame" | null;
    longPressTimer: ReturnType<typeof setTimeout> | null;
    longPressFlame: boolean;
    lastX: number;
    lastY: number;
    flameClickX: number;
    flameClickY: number;
    flameDownX: number;
    flameDownY: number;
    gyroYaw: number;
    gyroPitch: number;
    gyroHomeYaw: number;
    gyroHomePitch: number;
    gyroHomeSet: boolean;
    gyroOffsetYaw: number;
    gyroOffsetPitch: number;
    frameId: number;
    gyroActive: boolean;
    debugPaused: boolean;
    runFrame: ((time: number) => void) | null;
  }>({
    gl: null,
    program: null,
    vao: null,
    texA: null,
    texB: null,
    fbA: null,
    fbB: null,
    width: 0,
    height: 0,
    panX: 0.02,
    panY: 0.02,
    pitch: 0,
    yaw: 0,
    distance: 1.08,
    flameOffsetX: 0,
    flameOffsetY: 0,
    pointerDown: false,
    sector: null,
    primaryPointerId: null,
    secondFingerDown: false,
    previousSector: null,
    longPressTimer: null,
    longPressFlame: false,
    lastX: 0,
    lastY: 0,
    flameClickX: 0,
    flameClickY: 0,
    flameDownX: 0,
    flameDownY: 0,
    gyroYaw: 0,
    gyroPitch: 0,
    gyroHomeYaw: 0,
    gyroHomePitch: 0,
    gyroHomeSet: false,
    gyroOffsetYaw: 0,
    gyroOffsetPitch: 0,
    frameId: 0,
    gyroActive: false,
    debugPaused: false,
    runFrame: null,
  });

  const requestGyro = useCallback(() => {
    const DevO = window.DeviceOrientationEvent;
    if (!DevO) return;
    if (
      typeof (DevO as unknown as { requestPermission?: () => Promise<string> })
        .requestPermission === "function"
    ) {
      (DevO as unknown as { requestPermission: () => Promise<string> })
        .requestPermission()
        .then((response) => {
          setGyroPermission(response === "granted" ? "granted" : "denied");
          if (response === "granted") {
            setGyroAvailable(true);
            stateRef.current.gyroActive = true;
          }
        })
        .catch(() => setGyroPermission("denied"));
    } else {
      setGyroAvailable(true);
      setGyroPermission("granted");
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Apply URL params on load so shared links restore state
    const urlParams = getFeedbackParamsFromUrl();
    const s0 = stateRef.current;
    s0.panX = urlParams.panX;
    s0.panY = urlParams.panY;
    s0.pitch = urlParams.pitch;
    s0.yaw = urlParams.yaw;
    s0.distance = urlParams.distance;
    s0.flameOffsetX = urlParams.flameOffsetX;
    s0.flameOffsetY = urlParams.flameOffsetY;

    const gl = canvas.getContext("webgl2", { alpha: false });
    if (!gl) {
      console.error("WebGL2 not supported");
      return;
    }

    const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    if (!vs || !fs) return;
    const program = createProgram(gl, vs, fs);
    if (!program) return;

    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const loc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio ?? 1);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (w === 0 || h === 0) return;

      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);

      const s = stateRef.current;
      if (s.width !== w || s.height !== h) {
        s.width = w;
        s.height = h;
        if (s.texA) gl.deleteTexture(s.texA);
        if (s.texB) gl.deleteTexture(s.texB);
        if (s.fbA) gl.deleteFramebuffer(s.fbA);
        if (s.fbB) gl.deleteFramebuffer(s.fbB);
        s.texA = createTexture(gl, w, h);
        s.texB = createTexture(gl, w, h);
        s.fbA = s.texA ? createFramebuffer(gl, s.texA) : null;
        s.fbB = s.texB ? createFramebuffer(gl, s.texB) : null;
        if (!s.texA || !s.texB || !s.fbA || !s.fbB) return;
        gl.bindFramebuffer(gl.FRAMEBUFFER, s.fbA);
        gl.clearColor(0.08, 0.06, 0.04, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, s.fbB);
        gl.clearColor(0.08, 0.06, 0.04, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    };

    resize();
    window.addEventListener("resize", resize);

    const state = stateRef.current;

    let readTarget: 0 | 1 = 0;

    const runFrame = (time: number) => {
      const s = stateRef.current;
      if (!s.gl || !s.program || !s.texA || !s.texB || !s.fbA || !s.fbB) return;

      const t = time * 0.001;
      const flameRadius = 0.02 * (1 + 0.35 * noise1D(t));
      const hue = (0 + 60 * (0.5 + 0.5 * noise1D(t * 0.7))) / 360;
      const lightness = 0.5 + 0.4 * (0.5 + 0.5 * noise1D(t * 0.5));

      gl.useProgram(program);
      gl.bindVertexArray(vao);

      const writeFb = readTarget === 0 ? s.fbA : s.fbB;
      const readTex = readTarget === 0 ? s.texB : s.texA;
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFb);
      gl.viewport(0, 0, s.width, s.height);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, readTex);

      const yaw = s.gyroActive
        ? (s.gyroYaw - s.gyroHomeYaw) * GYRO_SENSITIVITY + s.gyroOffsetYaw
        : s.yaw;
      const pitch = s.gyroActive
        ? (s.gyroPitch - s.gyroHomePitch) * GYRO_SENSITIVITY + s.gyroOffsetPitch
        : s.pitch;

      // When no gyro: gentle breathing on pan and rotation (10–12 cpm, separate phases)
      const sec = t;
      const cpmToRadPerSec = (2 * Math.PI) / 60;
      const breathPanX = s.gyroActive
        ? 0
        : BREATH_PAN_AMPLITUDE *
          Math.sin(sec * BREATH_CPM_PAN_X * cpmToRadPerSec);
      const breathPanY = s.gyroActive
        ? 0
        : BREATH_PAN_AMPLITUDE *
          Math.sin(sec * BREATH_CPM_PAN_Y * cpmToRadPerSec);
      const breathPitch = s.gyroActive
        ? 0
        : BREATH_ROTATION_DEG *
          DEG_TO_RAD *
          Math.sin(sec * BREATH_CPM_PITCH * cpmToRadPerSec);
      const breathYaw = s.gyroActive
        ? 0
        : BREATH_ROTATION_DEG *
          DEG_TO_RAD *
          Math.sin(sec * BREATH_CPM_YAW * cpmToRadPerSec);

      const panX = s.panX + breathPanX;
      const panY = s.panY + breathPanY;
      const rotPitch = pitch + breathPitch;
      const rotYaw = yaw + breathYaw;

      const uFeedback = gl.getUniformLocation(program, "u_feedback");
      const uResolution = gl.getUniformLocation(program, "u_resolution");
      const uTime = gl.getUniformLocation(program, "u_time");
      const uPanX = gl.getUniformLocation(program, "u_panX");
      const uPanY = gl.getUniformLocation(program, "u_panY");
      const uPitch = gl.getUniformLocation(program, "u_pitch");
      const uYaw = gl.getUniformLocation(program, "u_yaw");
      const uDistance = gl.getUniformLocation(program, "u_distance");
      const uFlameRadius = gl.getUniformLocation(program, "u_flameRadius");
      const uFlameHue = gl.getUniformLocation(program, "u_flameHue");
      const uFlameLightness = gl.getUniformLocation(
        program,
        "u_flameLightness",
      );
      const uFlameOffsetX = gl.getUniformLocation(program, "u_flameOffsetX");
      const uFlameOffsetY = gl.getUniformLocation(program, "u_flameOffsetY");
      const uGain = gl.getUniformLocation(program, "u_gain");
      const uBias = gl.getUniformLocation(program, "u_bias");
      const uHBlur = gl.getUniformLocation(program, "u_hBlur");

      gl.uniform1i(uFeedback, 0);
      gl.uniform1f(uHBlur, 0);
      gl.uniform2f(uResolution, s.width, s.height);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uPanX, panX);
      gl.uniform1f(uPanY, panY);
      gl.uniform1f(uPitch, rotPitch);
      gl.uniform1f(uYaw, rotYaw);
      gl.uniform1f(uDistance, s.distance);
      gl.uniform1f(uFlameRadius, flameRadius);
      gl.uniform1f(uFlameHue, hue);
      gl.uniform1f(uFlameLightness, lightness);
      gl.uniform1f(uFlameOffsetX, s.flameOffsetX);
      gl.uniform1f(uFlameOffsetY, s.flameOffsetY);
      gl.uniform1f(uGain, FEEDBACK_GAIN);
      gl.uniform1f(uBias, FEEDBACK_BIAS);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.bindTexture(gl.TEXTURE_2D, readTarget === 0 ? s.texA : s.texB);
      gl.uniform1f(uHBlur, 1);
      gl.uniform1f(uPanX, 0);
      gl.uniform1f(uPanY, 0);
      gl.uniform1f(uPitch, 0);
      gl.uniform1f(uYaw, 0);
      gl.uniform1f(uDistance, 1);
      gl.uniform1f(uFlameRadius, 0);
      gl.uniform1f(uFlameOffsetX, s.flameOffsetX);
      gl.uniform1f(uFlameOffsetY, s.flameOffsetY);
      gl.uniform1f(uGain, 1);
      gl.uniform1f(uBias, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      readTarget = readTarget === 0 ? 1 : 0;
      if (!s.debugPaused) {
        s.frameId = requestAnimationFrame(runFrame);
      }
    };

    stateRef.current.gl = gl;
    stateRef.current.program = program;
    stateRef.current.vao = vao;
    stateRef.current.runFrame = runFrame;

    stateRef.current.frameId = requestAnimationFrame(runFrame);

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const s = stateRef.current;
      const alpha = e.alpha != null ? (e.alpha * Math.PI) / 180 : 0;
      const beta = e.beta != null ? (e.beta * Math.PI) / 180 : 0;
      if (!s.gyroHomeSet) {
        s.gyroHomeYaw = alpha;
        s.gyroHomePitch = beta;
        s.gyroHomeSet = true;
      }
      s.gyroYaw = alpha;
      s.gyroPitch = beta;
    };

    if (typeof window !== "undefined" && window.DeviceOrientationEvent) {
      if (
        typeof (
          window.DeviceOrientationEvent as unknown as {
            requestPermission?: () => Promise<string>;
          }
        ).requestPermission === "function"
      ) {
        permissionPromptUsedRef.current = true;
        setGyroPermission("prompt");
      } else {
        window.addEventListener("deviceorientation", handleOrientation);
        setGyroAvailable(true);
        setGyroPermission("granted");
        // Desktop: no real gyro → breathing. Mobile: use gyro (natural motion from holding device).
        stateRef.current.gyroActive = isLikelyMobile();
      }
    }

    const win = window as unknown as {
      stepFrames?: (n?: number) => void;
      setCamera?: (opts: {
        panX?: number;
        panY?: number;
        pitch?: number;
        yaw?: number;
        distance?: number;
      }) => void;
      getCamera?: () => {
        panX: number;
        panY: number;
        pitch: number;
        yaw: number;
        distance: number;
      };
      getState?: () => { gain: number; bias: number };
      debugPause?: () => void;
      debugRun?: () => void;
    };
    win.stepFrames = (n = 1) => {
      const s = stateRef.current;
      for (let i = 0; i < n; i++) s.runFrame?.(performance.now());
    };
    win.setCamera = (opts) => {
      const s = stateRef.current;
      if (opts.panX !== undefined) s.panX = opts.panX;
      if (opts.panY !== undefined) s.panY = opts.panY;
      if (opts.pitch !== undefined) s.pitch = opts.pitch;
      if (opts.yaw !== undefined) s.yaw = opts.yaw;
      if (opts.distance !== undefined)
        s.distance = Math.max(0.3, Math.min(4, opts.distance));
    };
    win.getCamera = () => {
      const s = stateRef.current;
      return {
        panX: s.panX,
        panY: s.panY,
        pitch: s.pitch,
        yaw: s.yaw,
        distance: s.distance,
      };
    };
    win.getState = () => ({
      gain: FEEDBACK_GAIN,
      bias: FEEDBACK_BIAS,
      gyroActive: stateRef.current.gyroActive,
    });
    win.debugPause = () => {
      stateRef.current.debugPaused = true;
    };
    win.debugRun = () => {
      stateRef.current.debugPaused = false;
      stateRef.current.runFrame?.(performance.now());
    };
    if (typeof console !== "undefined" && console.info) {
      console.info(
        "Video feedback debug: stepFrames(n), setCamera({panX,panY,pitch,yaw,distance}), getCamera(), getState(), debugPause(), debugRun()",
      );
      if (!stateRef.current.gyroActive) {
        console.info(
          "Breathing active (no gyro): pan ±5%, rotation ±1°, ~10–12/min",
        );
      }
    }

    return () => {
      delete win.stepFrames;
      delete win.setCamera;
      delete win.getCamera;
      delete win.getState;
      delete win.debugPause;
      delete win.debugRun;
      window.removeEventListener("resize", resize);
      window.removeEventListener("deviceorientation", handleOrientation);
      cancelAnimationFrame(state.frameId);
      if (state.texA) gl.deleteTexture(state.texA);
      if (state.texB) gl.deleteTexture(state.texB);
      if (state.fbA) gl.deleteFramebuffer(state.fbA);
      if (state.fbB) gl.deleteFramebuffer(state.fbB);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(vbo);
    };
  }, []);

  // Every 5s, sync address bar with current params when they change (shareable URL)
  useEffect(() => {
    const INTERVAL_MS = 5000;
    const id = setInterval(() => {
      const s = stateRef.current;
      const params: FeedbackParams = {
        panX: s.panX,
        panY: s.panY,
        pitch: s.pitch,
        yaw: s.yaw,
        distance: s.distance,
        flameOffsetX: s.flameOffsetX,
        flameOffsetY: s.flameOffsetY,
      };
      const nextQuery = encodeFeedbackParams(params);
      const currentSearch = window.location.search || "";
      if (nextQuery !== "?" && nextQuery !== currentSearch) {
        const url = window.location.pathname + nextQuery;
        window.history.replaceState(null, "", url);
      }
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (gyroPermission !== "granted" || !gyroAvailable) return;
    if (!permissionPromptUsedRef.current) return; // Listener already added in main effect (e.g. Android)
    stateRef.current.gyroActive = true;
    const handleOrientation = (e: DeviceOrientationEvent) => {
      const s = stateRef.current;
      const alpha = e.alpha != null ? (e.alpha * Math.PI) / 180 : 0;
      const beta = e.beta != null ? (e.beta * Math.PI) / 180 : 0;
      if (!s.gyroHomeSet) {
        s.gyroHomeYaw = alpha;
        s.gyroHomePitch = beta;
        s.gyroHomeSet = true;
      }
      s.gyroYaw = alpha;
      s.gyroPitch = beta;
    };
    window.addEventListener("deviceorientation", handleOrientation);
    return () =>
      window.removeEventListener("deviceorientation", handleOrientation);
  }, [gyroPermission, gyroAvailable]);

  const getSector = useCallback(
    (clientY: number): "pan" | "orient" | "zoom" => {
      const canvas = canvasRef.current;
      if (!canvas) return "orient";
      const rect = canvas.getBoundingClientRect();
      const y = (clientY - rect.top) / rect.height;
      if (y < 1 / 3) return "pan";
      if (y < 2 / 3) return "orient";
      return "zoom";
    },
    [],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const s = stateRef.current;
      const canvas = canvasRef.current;
      const isTouch = e.pointerType === "touch";

      if (!s.pointerDown) {
        // First finger / pointer
        s.pointerDown = true;
        s.primaryPointerId = e.pointerId;
        s.sector = e.shiftKey ? "flame" : getSector(e.clientY);
        s.lastX = e.clientX;
        s.lastY = e.clientY;
        if (s.sector === "flame" && canvas) {
          const rect = canvas.getBoundingClientRect();
          s.flameClickX = (e.clientX - rect.left) / rect.width;
          s.flameClickY = (e.clientY - rect.top) / rect.height;
          s.flameDownX = e.clientX;
          s.flameDownY = e.clientY;
        }
        // On touch: long-press (no movement) will switch to flame after 500ms
        if (isTouch && s.sector !== "flame") {
          s.longPressFlame = false;
          s.longPressTimer = setTimeout(() => {
            s.longPressTimer = null;
            s.longPressFlame = true;
            s.sector = "flame";
            if (canvas) {
              const rect = canvas.getBoundingClientRect();
              s.flameClickX = (s.lastX - rect.left) / rect.width;
              s.flameClickY = (s.lastY - rect.top) / rect.height;
              s.flameDownX = s.lastX;
              s.flameDownY = s.lastY;
            }
          }, 500);
        }
      } else if (e.pointerId !== s.primaryPointerId) {
        // Second finger: switch current drag to flame (touch alternative to shift+drag)
        if (s.longPressTimer) {
          clearTimeout(s.longPressTimer);
          s.longPressTimer = null;
        }
        s.secondFingerDown = true;
        s.previousSector = s.sector;
        s.sector = "flame";
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          s.flameClickX = (s.lastX - rect.left) / rect.width;
          s.flameClickY = (s.lastY - rect.top) / rect.height;
          s.flameDownX = s.lastX;
          s.flameDownY = s.lastY;
        }
      }
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [getSector],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = stateRef.current;
    if (!s.pointerDown || s.sector === null) return;
    // Only the primary pointer (first finger / mouse) drives the drag
    if (e.pointerId !== s.primaryPointerId) return;

    // Cancel long-press if user moved before timer fired; set sector by position
    if (s.longPressTimer) {
      clearTimeout(s.longPressTimer);
      s.longPressTimer = null;
      if (!s.longPressFlame) s.sector = getSector(e.clientY);
    }

    const dx = (e.clientX - s.lastX) / (stateRef.current.width || 1);
    const dy = (e.clientY - s.lastY) / (stateRef.current.height || 1);
    const dxPx = e.clientX - s.lastX;
    const dyPx = e.clientY - s.lastY;
    s.lastX = e.clientX;
    s.lastY = e.clientY;

    if (s.sector === "flame") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      s.flameOffsetX += dxPx / w;
      s.flameOffsetY -= dyPx / h;
      s.flameOffsetX = Math.max(-0.5, Math.min(0.5, s.flameOffsetX));
      s.flameOffsetY = Math.max(-0.5, Math.min(0.5, s.flameOffsetY));
    } else if (s.sector === "pan") {
      s.panX += dx * 0.8;
      s.panY -= dy * 0.8;
    } else if (s.sector === "orient") {
      if (s.gyroActive) {
        s.gyroOffsetYaw += dx * 2;
        s.gyroOffsetPitch += dy * 2;
      } else {
        s.yaw += dx * 2;
        s.pitch += dy * 2;
      }
    } else {
      s.distance *= 1 - dy * 2 - dx * 2;
      s.distance = Math.max(0.3, Math.min(4, s.distance));
    }
  }, [getSector]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const s = stateRef.current;
    if (e.pointerId === s.primaryPointerId) {
      if (s.longPressTimer) {
        clearTimeout(s.longPressTimer);
        s.longPressTimer = null;
      }
      if (s.sector === "flame" && s.pointerDown) {
        const movedPx = Math.hypot(
          e.clientX - s.flameDownX,
          e.clientY - s.flameDownY,
        );
        if (movedPx < 6) {
          s.flameOffsetX = Math.max(-0.5, Math.min(0.5, s.flameClickX - 0.5));
          s.flameOffsetY = Math.max(-0.5, Math.min(0.5, 0.5 - s.flameClickY));
        }
      }
      s.pointerDown = false;
      s.sector = null;
      s.primaryPointerId = null;
      s.secondFingerDown = false;
      s.previousSector = null;
      s.longPressFlame = false;
    } else if (s.pointerDown && s.secondFingerDown) {
      // Second finger lifted — back to pan/orient/zoom
      s.secondFingerDown = false;
      s.sector = s.previousSector;
      s.previousSector = null;
    }
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const dismissDragOverlay = useCallback(() => {
    setShowDragOverlay(false);
  }, []);

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        style={{ display: "block", width: "100%", height: "100%" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      />
      {showDragOverlay && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex flex-col"
          aria-label="Drag instructions"
        >
          <div className="pointer-events-auto absolute right-3 top-3 z-20">
            <button
              type="button"
              onClick={dismissDragOverlay}
              className="rounded-full bg-white/20 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/30"
            >
              Dismiss
            </button>
          </div>
          <p className="absolute left-1/2 top-6 z-20 -translate-x-1/2 text-center text-sm font-medium text-white/95">
            Drag in each zone to control the camera.{" "}
            {isTouchDevice ? (
              <>
                Flame: long-press then drag, or two fingers (place second
                finger then drag with first).
              </>
            ) : (
              <>Shift+drag to move the flame.</>
            )}
          </p>
          <div className="flex flex-1 flex-col">
            <div className="flex flex-1 flex-col items-center justify-center border-b border-white/20">
              <span className="text-lg font-semibold text-amber-200">Pan</span>
              <span className="mt-1 text-xs text-white/80">
                Top third — move view up/down/left/right
              </span>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center border-b border-white/20">
              <span className="text-lg font-semibold text-amber-200">
                Rotate
              </span>
              <span className="mt-1 text-xs text-white/80">
                Middle — pitch and yaw
              </span>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center">
              <span className="text-lg font-semibold text-amber-200">Zoom</span>
              <span className="mt-1 text-xs text-white/80">
                Bottom third — drag any direction to zoom in/out
              </span>
            </div>
          </div>
        </div>
      )}
      {gyroPermission === "prompt" && (
        <button
          type="button"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-black shadow-lg hover:bg-white"
          onClick={requestGyro}
        >
          Use device motion
        </button>
      )}
    </div>
  );
}
