import React, { useRef, useEffect } from 'react';
import { CameraState, SoundSource } from '../types';
import { audioService } from '../audioEngine';

export interface SceneryItem {
  id: string;
  type: 'tree' | 'column' | 'monolith' | 'shrub';
  x: number;
  z: number;
  scale: number;
}

interface Canvas3DProps {
  sounds: SoundSource[];
  camera: CameraState;
  setCamera: React.Dispatch<React.SetStateAction<CameraState>>;
  cameraRef: React.MutableRefObject<CameraState>;
  isStarted: boolean;
  isDay: boolean;
  isMuted: boolean;
  scenery: SceneryItem[];
  dustParticlesRef: React.MutableRefObject<{ x: number; y: number; z: number; speedY: number; size: number; phase: number }[]>;
  mistPuffsRef: React.MutableRefObject<{ x: number; z: number; r: number; vx: number; vz: number; phase: number }[]>;
  joystickVectorRef: React.MutableRefObject<{ x: number; z: number }>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  selectedSoundId: string | null;
  setSelectedSoundId: (id: string | null) => void;
  hoveredSoundId: string | null;
  setHoveredSoundId: (id: string | null) => void;
  onUpdateSound: (id: string, updates: Partial<SoundSource>) => void;
}

// Color interpolation helpers for day/night transition
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function parseHex(hex: string) {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return { r, g, b };
}

function lerpColor(color1: string, color2: string, t: number): string {
  if (color1.startsWith('#') && color2.startsWith('#')) {
    const c1 = parseHex(color1);
    const c2 = parseHex(color2);
    const r = Math.round(lerp(c1.r, c2.r, t));
    const g = Math.round(lerp(c1.g, c2.g, t));
    const b = Math.round(lerp(c1.b, c2.b, t));
    return `rgb(${r}, ${g}, ${b})`;
  }
  return t < 0.5 ? color1 : color2;
}

function lerpColorWithAlpha(
  r1: number, g1: number, b1: number, a1: number,
  r2: number, g2: number, b2: number, a2: number,
  t: number
): string {
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  const a = a1 + (a2 - a1) * t;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// 3D Projection function
function project(
  v: { x: number; y: number; z: number },
  width: number,
  height: number,
  cam: CameraState
): { x: number; y: number; depth: number } | null {
  const dx = v.x - cam.x;
  const dy = v.y - 0.3;
  const dz = v.z - cam.z;

  const cosY = Math.cos(-cam.angle);
  const sinY = Math.sin(-cam.angle);
  const rx1 = dx * cosY - dz * sinY;
  const rz1 = dx * sinY + dz * cosY;

  const cosX = Math.cos(-cam.pitch);
  const sinX = Math.sin(-cam.pitch);
  const ry2 = dy * cosX - rz1 * sinX;
  const rz2 = dy * sinX + rz1 * cosX;

  if (rz2 <= 0.15) return null;

  const focalLength = Math.max(width, height) * 0.95;
  const screenX = width / 2 + (rx1 / rz2) * focalLength;
  const screenY = height / 2 - (ry2 / rz2) * focalLength;

  return { x: screenX, y: screenY, depth: rz2 };
}

export const Canvas3D: React.FC<Canvas3DProps> = ({
  sounds,
  camera,
  setCamera,
  cameraRef,
  isStarted,
  isDay,
  isMuted,
  scenery,
  dustParticlesRef,
  mistPuffsRef,
  joystickVectorRef,
  canvasRef,
  selectedSoundId,
  setSelectedSoundId,
  hoveredSoundId,
  setHoveredSoundId,
  onUpdateSound
}) => {
  const pressedKeysRef = useRef<{ [key: string]: boolean }>({});
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const renderLoopIdRef = useRef<number | null>(null);

  const isDayRef = useRef(isDay);
  useEffect(() => {
    isDayRef.current = isDay;
  }, [isDay]);

  const dayTransitionRef = useRef(0.0);
  const lastTimeRef = useRef(performance.now());

  // Keyboard navigation bindings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      audioService.resume();
      const key = e.key.toLowerCase();
      pressedKeysRef.current[key] = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      pressedKeysRef.current[key] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Mouse wheel direct volume tuning
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      if (hoveredSoundId) {
        e.preventDefault();
        const sound = sounds.find((s) => s.id === hoveredSoundId);
        if (sound) {
          const delta = e.deltaY < 0 ? 0.05 : -0.05;
          const nextVolume = Math.max(0, Math.min(1.0, sound.volume + delta));
          onUpdateSound(sound.id, { volume: nextVolume });
        }
      }
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [canvasRef, hoveredSoundId, sounds, onUpdateSound]);

  // Mouse / Trackpad Drag Orbiting
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    audioService.resume();
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDraggingRef.current) {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    }

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let closestId: string | null = null;
    let closestD = 55;

    sounds.forEach((sound) => {
      const t = Date.now() / 1000;
      const floatOffset = (0.5 + 0.5 * Math.sin(t * 1.5 + sound.id.charCodeAt(0))) * 0.12;
      const volMultiplier = 0.3 + 1.7 * (sound.volume ?? 0.8);

      const pCenter = project({ x: sound.x, y: -0.1 + floatOffset, z: sound.z }, canvas.width, canvas.height, cameraRef.current);
      const pLabel = project({ x: sound.x, y: -0.7 + floatOffset + 1.35, z: sound.z }, canvas.width, canvas.height, cameraRef.current);
      const pBase = project({ x: sound.x, y: -0.7, z: sound.z }, canvas.width, canvas.height, cameraRef.current);

      const pList = [pCenter, pLabel, pBase].filter((p): p is { x: number; y: number; depth: number } => p !== null);

      pList.forEach((p) => {
        const dx = mouseX - p.x;
        const dy = mouseY - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const baseRadius = 35 * volMultiplier;
        const hitRadius = Math.max(35, Math.min(100, (baseRadius * 12) / p.depth));

        if (dist < hitRadius && dist < closestD) {
          closestD = dist;
          closestId = sound.id;
        }
      });
    });

    if (closestId !== hoveredSoundId) {
      setHoveredSoundId(closestId);
    }
  };

  const handleCanvasMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleCanvasTouchStart = (e: React.TouchEvent) => {
    audioService.resume();
    if (e.touches.length > 0) {
      isDraggingRef.current = true;
      lastMousePosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleCanvasTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current || e.touches.length === 0) return;
    lastMousePosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    audioService.resume();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    let clickedId: string | null = null;
    let closestDist = 55;

    sounds.forEach((sound) => {
      const t = Date.now() / 1000;
      const floatOffset = (0.5 + 0.5 * Math.sin(t * 1.5 + sound.id.charCodeAt(0))) * 0.12;
      const volMultiplier = 0.3 + 1.7 * (sound.volume ?? 0.8);

      const pCenter = project({ x: sound.x, y: -0.1 + floatOffset, z: sound.z }, canvas.width, canvas.height, cameraRef.current);
      const pLabel = project({ x: sound.x, y: -0.7 + floatOffset + 1.35, z: sound.z }, canvas.width, canvas.height, cameraRef.current);
      const pBase = project({ x: sound.x, y: -0.7, z: sound.z }, canvas.width, canvas.height, cameraRef.current);

      const pList = [pCenter, pLabel, pBase].filter((p): p is { x: number; y: number; depth: number } => p !== null);

      pList.forEach((p) => {
        const dx = clickX - p.x;
        const dy = clickY - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const baseRadius = 35 * volMultiplier;
        const hitRadius = Math.max(35, Math.min(100, (baseRadius * 12) / p.depth));

        if (dist < hitRadius && dist < closestDist) {
          closestDist = dist;
          clickedId = sound.id;
        }
      });
    });

    setSelectedSoundId(clickedId);
  };

  // Main 3D render loop
  useEffect(() => {
    if (!isStarted) return;

    const updateFrame = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        renderLoopIdRef.current = requestAnimationFrame(updateFrame);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }

      const { width, height } = canvas;

      const now = performance.now();
      const deltaTime = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      if (isDayRef.current) {
        dayTransitionRef.current = Math.min(1.0, dayTransitionRef.current + deltaTime / 5.0);
      } else {
        dayTransitionRef.current = Math.max(0.0, dayTransitionRef.current - deltaTime / 5.0);
      }

      const transitionT = dayTransitionRef.current;

      // 1. PLAYER MOVEMENT
      const moveSpeed = 0.12;
      let forwardAmount = 0;
      let strafeAmount = 0;

      const keys = pressedKeysRef.current;
      if (keys['w'] || keys['arrowup']) forwardAmount += 1;
      if (keys['s'] || keys['arrowdown']) forwardAmount -= 1;
      if (keys['a'] || keys['arrowleft']) strafeAmount -= 1;
      if (keys['d'] || keys['arrowright']) strafeAmount += 1;

      strafeAmount += joystickVectorRef.current.x;
      forwardAmount += joystickVectorRef.current.z;

      if (forwardAmount !== 0 || strafeAmount !== 0) {
        const mag = Math.sqrt(forwardAmount * forwardAmount + strafeAmount * strafeAmount);
        const normForward = forwardAmount / mag;
        const normStrafe = strafeAmount / mag;

        setCamera((prev) => {
          const cosAngle = Math.cos(prev.angle);
          const sinAngle = Math.sin(prev.angle);

          const moveX = (normForward * (-sinAngle) + normStrafe * cosAngle) * moveSpeed;
          const moveZ = (normForward * cosAngle + normStrafe * sinAngle) * moveSpeed;

          const limit = 26;
          const nextX = Math.max(-limit, Math.min(limit, prev.x + moveX));
          const nextZ = Math.max(-limit, Math.min(limit, prev.z + moveZ));

          return {
            ...prev,
            x: nextX,
            z: nextZ,
          };
        });
      }

      // 2. RECALCULATE SPATIAL AUDIO NODES
      audioService.updateSpatialAudio(cameraRef.current, sounds, isMuted);

      // 3. CANVAS CLEAR & SKY GRADIENT
      ctx.fillStyle = lerpColor('#0a1215', '#E2D8A5', transitionT);
      ctx.fillRect(0, 0, width, height);

      const focalLength = Math.max(width, height) * 0.95;
      const horizonY = height / 2 + Math.tan(cameraRef.current.pitch) * focalLength;

      const skyGrad = ctx.createLinearGradient(0, 0, 0, Math.max(horizonY, 50));
      skyGrad.addColorStop(0, lerpColor('#040708', '#577E89', transitionT));
      skyGrad.addColorStop(0.4, lerpColor('#070b0d', '#6F9F9C', transitionT));
      skyGrad.addColorStop(0.75, lerpColor('#0c1514', '#DEC484', transitionT));
      skyGrad.addColorStop(0.9, lerpColor('#181a14', '#DEC484', transitionT));
      skyGrad.addColorStop(1, lerpColor('#1e160e', '#E1A36F', transitionT));
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, Math.max(0, horizonY));

      // Stars & Nebulae at night
      if (transitionT < 0.95) {
        const nightFactor = 1.0 - transitionT;
        const timeFactor = Date.now() / 1000;

        const neb1 = ctx.createRadialGradient(width * 0.25, horizonY * 0.4, 5, width * 0.25, horizonY * 0.4, Math.max(width * 0.35, 200));
        neb1.addColorStop(0, `rgba(111, 159, 156, ${0.12 * nightFactor})`);
        neb1.addColorStop(0.5, `rgba(111, 159, 156, ${0.04 * nightFactor})`);
        neb1.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = neb1;
        ctx.fillRect(0, 0, width, Math.max(0, horizonY));

        const neb2 = ctx.createRadialGradient(width * 0.75, horizonY * 0.3, 5, width * 0.75, horizonY * 0.3, Math.max(width * 0.4, 250));
        neb2.addColorStop(0, `rgba(226, 216, 165, ${0.10 * nightFactor})`);
        neb2.addColorStop(0.5, `rgba(222, 196, 132, ${0.04 * nightFactor})`);
        neb2.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = neb2;
        ctx.fillRect(0, 0, width, Math.max(0, horizonY));

        for (let sIdx = 0; sIdx < 45; sIdx++) {
          const sX = (Math.sin(sIdx * 372.4) * 0.5 + 0.5) * width;
          const sY = (Math.cos(sIdx * 194.2) * 0.5 + 0.5) * Math.max(0, horizonY - 12);
          const size = Math.max(0.6, 1.4 + Math.sin(timeFactor * 2.2 + sIdx) * 0.9);
          const brightness = 0.35 + Math.sin(timeFactor * 1.8 + sIdx) * 0.55;

          let starColor = 'rgba(226, 216, 165, ';
          if (sIdx % 4 === 1) starColor = 'rgba(222, 196, 132, ';
          else if (sIdx % 4 === 2) starColor = 'rgba(111, 159, 156, ';
          else if (sIdx % 4 === 3) starColor = 'rgba(225, 163, 111, ';

          ctx.fillStyle = `${starColor}${Math.max(0.12, Math.min(0.95, brightness)) * nightFactor})`;
          ctx.beginPath();
          ctx.arc(sX, sY, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Ground base below horizonY
      const groundGrad = ctx.createLinearGradient(0, horizonY, 0, height);
      groundGrad.addColorStop(0, lerpColor('#1e160e', '#E1A36F', transitionT));
      groundGrad.addColorStop(0.25, lerpColor('#121611', '#DEC484', transitionT));
      groundGrad.addColorStop(0.65, lerpColor('#070a0c', '#E2D8A5', transitionT));
      groundGrad.addColorStop(1, lerpColor('#030506', '#577E89', transitionT));
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, Math.max(0, horizonY), width, Math.max(0, height - horizonY));

      // Subtle texture overlay grid
      ctx.strokeStyle = `rgba(87, 126, 137, ${lerp(0.02, 0.04, transitionT)})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
        ctx.stroke();
      }
      for (let j = 0; j < height; j += 40) {
        ctx.beginPath();
        ctx.moveTo(0, j);
        ctx.lineTo(width, j);
        ctx.stroke();
      }

      // 3D RENDERING PIPELINE
      const horizonGlows = [
        { x: 0, z: 1200, rgb: '87, 126, 137', alphaNight: 0.35, alphaDay: 0.28 },
        { x: 1200, z: 0, rgb: '222, 196, 132', alphaNight: 0.32, alphaDay: 0.24 },
        { x: 0, z: -1200, rgb: '225, 163, 111', alphaNight: 0.32, alphaDay: 0.24 },
        { x: -1200, z: 0, rgb: '111, 159, 156', alphaNight: 0.32, alphaDay: 0.24 },
      ];

      horizonGlows.forEach((dir) => {
        const pt = project({ x: dir.x, y: -0.1, z: dir.z }, width, height, cameraRef.current);
        if (pt) {
          const glowAlpha = lerp(dir.alphaNight, dir.alphaDay, transitionT);
          const baseColor = `rgba(${dir.rgb}, ${glowAlpha})`;
          const glowRadius = Math.max(width * 0.45, 480);
          const grad = ctx.createRadialGradient(pt.x, pt.y, 10, pt.x, pt.y, glowRadius);
          grad.addColorStop(0, baseColor);
          grad.addColorStop(0.35, `rgba(${dir.rgb}, ${glowAlpha * 0.32})`);
          grad.addColorStop(0.7, `rgba(${dir.rgb}, ${glowAlpha * 0.08})`);
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, glowRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Ground grid
      ctx.strokeStyle = lerpColorWithAlpha(226, 216, 165, 0.09, 15, 23, 42, 0.06, transitionT);
      ctx.lineWidth = 0.5;
      const gridSize = 25;
      const step = 1.5;

      for (let x = -gridSize; x <= gridSize; x += step) {
        ctx.beginPath();
        let started = false;
        for (let z = -gridSize; z <= gridSize; z += step) {
          const p = project({ x, y: -0.7, z }, width, height, cameraRef.current);
          if (p) {
            if (!started) {
              ctx.moveTo(p.x, p.y);
              started = true;
            } else {
              ctx.lineTo(p.x, p.y);
            }
          }
        }
        ctx.stroke();
      }

      for (let z = -gridSize; z <= gridSize; z += step) {
        ctx.beginPath();
        let started = false;
        for (let x = -gridSize; x <= gridSize; x += step) {
          const p = project({ x, y: -0.7, z }, width, height, cameraRef.current);
          if (p) {
            if (!started) {
              ctx.moveTo(p.x, p.y);
              started = true;
            } else {
              ctx.lineTo(p.x, p.y);
            }
          }
        }
        ctx.stroke();
      }

      // Mist puffs
      ctx.setLineDash([]);
      const t = Date.now() / 1000;
      mistPuffsRef.current.forEach((puff) => {
        puff.x += puff.vx;
        puff.z += puff.vz;

        const bLimit = 28;
        if (puff.x > bLimit) puff.x = -bLimit;
        if (puff.x < -bLimit) puff.x = bLimit;
        if (puff.z > bLimit) puff.z = -bLimit;
        if (puff.z < -bLimit) puff.z = bLimit;

        const pulseRad = puff.r * (1.0 + 0.15 * Math.sin(t * 0.4 + puff.phase));
        const pt = project({ x: puff.x, y: -0.6, z: puff.z }, width, height, cameraRef.current);
        if (pt) {
          const screenRadius = (pulseRad * 75) / pt.depth;
          if (screenRadius > 8) {
            const grad = ctx.createRadialGradient(pt.x, pt.y, 2, pt.x, pt.y, screenRadius);
            grad.addColorStop(0, 'rgba(165, 180, 200, 0.05)');
            grad.addColorStop(0.5, 'rgba(165, 180, 200, 0.02)');
            grad.addColorStop(1, 'rgba(165, 180, 200, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, screenRadius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });

      // Scenery items
      scenery.forEach((item) => {
        const sceneryStroke = lerpColorWithAlpha(111, 159, 156, 0.55, 15, 23, 42, 0.35, transitionT);
        const sceneryLightStroke = lerpColorWithAlpha(222, 196, 132, 0.45, 15, 23, 42, 0.25, transitionT);

        if (item.type === 'monolith') {
          const baseHeight = 1.8 * item.scale;
          const w = 0.4 * item.scale;
          const vertices = [
            { x: item.x - w, y: -0.7, z: item.z - w },
            { x: item.x + w, y: -0.7, z: item.z - w },
            { x: item.x + w, y: -0.7, z: item.z + w },
            { x: item.x - w, y: -0.7, z: item.z + w },
            { x: item.x - w, y: baseHeight, z: item.z - w },
            { x: item.x + w, y: baseHeight, z: item.z - w },
            { x: item.x + w, y: baseHeight, z: item.z + w },
            { x: item.x - w, y: baseHeight, z: item.z + w },
          ];
          const proj = vertices.map(v => project(v, width, height, cameraRef.current));
          if (!proj.some(p => p === null)) {
            ctx.strokeStyle = sceneryStroke;
            ctx.lineWidth = 0.8;
            for (let k = 0; k < 4; k++) {
              ctx.beginPath();
              ctx.moveTo(proj[k]!.x, proj[k]!.y);
              ctx.lineTo(proj[k + 4]!.x, proj[k + 4]!.y);
              ctx.stroke();
            }
            ctx.beginPath();
            ctx.moveTo(proj[0]!.x, proj[0]!.y);
            for (let k = 1; k < 4; k++) ctx.lineTo(proj[k]!.x, proj[k]!.y);
            ctx.closePath();
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(proj[4]!.x, proj[4]!.y);
            for (let k = 5; k < 8; k++) ctx.lineTo(proj[k]!.x, proj[k]!.y);
            ctx.closePath();
            ctx.stroke();
          }
        } else if (item.type === 'column') {
          const baseHeight = 3.0 * item.scale;
          const topP = project({ x: item.x, y: baseHeight, z: item.z }, width, height, cameraRef.current);
          const botP = project({ x: item.x, y: -0.7, z: item.z }, width, height, cameraRef.current);
          if (topP && botP) {
            ctx.strokeStyle = sceneryLightStroke;
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(botP.x, botP.y);
            ctx.lineTo(topP.x, topP.y);
            ctx.stroke();

            for (let h = 0.1; h < 1.0; h += 0.25) {
              const midY = -0.7 + baseHeight * h;
              const ringP = project({ x: item.x, y: midY, z: item.z }, width, height, cameraRef.current);
              if (ringP) {
                ctx.beginPath();
                ctx.arc(ringP.x, ringP.y, (12 * item.scale) / ringP.depth, 0, Math.PI * 2);
                ctx.stroke();
              }
            }
          }
        } else if (item.type === 'tree') {
          const trunkHeight = 0.8 * item.scale;
          const crownRadius = 0.5 * item.scale;
          const botP = project({ x: item.x, y: -0.7, z: item.z }, width, height, cameraRef.current);
          const midP = project({ x: item.x, y: trunkHeight, z: item.z }, width, height, cameraRef.current);
          const topP = project({ x: item.x, y: trunkHeight + crownRadius * 2, z: item.z }, width, height, cameraRef.current);

          if (botP && midP && topP) {
            ctx.strokeStyle = sceneryStroke;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(botP.x, botP.y);
            ctx.lineTo(midP.x, midP.y);
            ctx.stroke();

            const crownW = 0.4 * item.scale;
            const crownV = [
              { x: item.x - crownW, y: trunkHeight + crownRadius, z: item.z },
              { x: item.x + crownW, y: trunkHeight + crownRadius, z: item.z },
              { x: item.x, y: trunkHeight + crownRadius, z: item.z - crownW },
              { x: item.x, y: trunkHeight + crownRadius, z: item.z + crownW },
            ].map(v => project(v, width, height, cameraRef.current));

            if (!crownV.some(p => p === null)) {
              crownV.forEach((v) => {
                ctx.beginPath();
                ctx.moveTo(midP.x, midP.y);
                ctx.lineTo(v!.x, v!.y);
                ctx.lineTo(topP.x, topP.y);
                ctx.stroke();
              });
              ctx.beginPath();
              ctx.moveTo(crownV[0]!.x, crownV[0]!.y);
              ctx.lineTo(crownV[2]!.x, crownV[2]!.y);
              ctx.lineTo(crownV[1]!.x, crownV[1]!.y);
              ctx.lineTo(crownV[3]!.x, crownV[3]!.y);
              ctx.closePath();
              ctx.stroke();
            }
          }
        } else {
          const p = project({ x: item.x, y: -0.7, z: item.z }, width, height, cameraRef.current);
          if (p) {
            ctx.strokeStyle = sceneryLightStroke;
            ctx.lineWidth = 0.8;
            const r = (15 * item.scale) / p.depth;
            ctx.beginPath();
            ctx.moveTo(p.x - r, p.y);
            ctx.lineTo(p.x + r, p.y);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(p.x - r * 0.5, p.y - r * 0.4);
            ctx.lineTo(p.x + r * 0.5, p.y - r * 0.4);
            ctx.stroke();
          }
        }
      });

      // Sound sources
      sounds.forEach((sound) => {
        const amplitude = audioService.getAmplitude(sound.id);
        const ampFactor = sound.isPlaying ? (amplitude / 255) : 0;
        const isSelected = selectedSoundId === sound.id;
        const isHovered = hoveredSoundId === sound.id;
        const floatOffset = (0.5 + 0.5 * Math.sin(t * 1.5 + sound.id.charCodeAt(0))) * 0.12;

        let rgb = '87, 126, 137';
        if (sound.nodeColor) {
          const parsed = parseHex(sound.nodeColor);
          rgb = `${parsed.r}, ${parsed.g}, ${parsed.b}`;
        } else {
          if (sound.soundType === 'north') rgb = '87, 126, 137';
          else if (sound.soundType === 'east') rgb = '222, 196, 132';
          else if (sound.soundType === 'south') rgb = '225, 163, 111';
          else if (sound.soundType === 'west') rgb = '111, 159, 156';
          else rgb = '226, 216, 165';
        }

        if (!sound.isPlaying) {
          rgb = '161, 161, 170';
        }

        const renderBoundaryCircle = (radius: number, colorStr: string, isDashed: boolean) => {
          ctx.strokeStyle = colorStr;
          ctx.lineWidth = 1;
          if (isDashed) ctx.setLineDash([3, 4]);
          else ctx.setLineDash([]);

          ctx.beginPath();
          let firstPoint = true;
          const segments = 24;
          for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const circleX = sound.x + Math.sin(angle) * radius;
            const circleZ = sound.z + Math.cos(angle) * radius;
            const pt = project({ x: circleX, y: -0.7, z: circleZ }, width, height, cameraRef.current);
            if (pt) {
              if (firstPoint) {
                ctx.moveTo(pt.x, pt.y);
                firstPoint = false;
              } else {
                ctx.lineTo(pt.x, pt.y);
              }
            }
          }
          ctx.stroke();
          ctx.setLineDash([]);
        };

        renderBoundaryCircle(1.1, `rgba(${rgb}, 0.08)`, true);
        renderBoundaryCircle(2.2, `rgba(${rgb}, 0.03)`, true);

        if (isSelected || isHovered) {
          renderBoundaryCircle(sound.volume * 2.2, `rgba(${rgb}, 0.28)`, false);
        }

        const anchorShadowP = project({ x: sound.x, y: -0.7, z: sound.z }, width, height, cameraRef.current);
        if (anchorShadowP) {
          ctx.strokeStyle = `rgba(${rgb}, ${isSelected ? 0.8 : 0.45})`;
          ctx.lineWidth = isSelected ? 2.0 : 1.0;
          ctx.beginPath();
          ctx.arc(anchorShadowP.x, anchorShadowP.y, Math.max(2, 7 / anchorShadowP.depth), 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = `rgba(${rgb}, ${isSelected ? 0.22 : 0.08})`;
          ctx.fill();
        }

        if (sound.isPlaying) {
          const startPt = project({ x: sound.x, y: -0.1 + floatOffset, z: sound.z }, width, height, cameraRef.current);
          const endPt = project({ x: cameraRef.current.x, y: -0.4, z: cameraRef.current.z }, width, height, cameraRef.current);

          if (startPt && endPt) {
            ctx.strokeStyle = `rgba(${rgb}, ${isSelected ? 0.22 : 0.12})`;
            ctx.lineWidth = isSelected ? 1.5 : 0.8;
            ctx.setLineDash([4, 6]);
            ctx.beginPath();
            ctx.moveTo(startPt.x, startPt.y);
            ctx.lineTo(endPt.x, endPt.y);
            ctx.stroke();
            ctx.setLineDash([]);

            const numWaves = 3;
            for (let wIdx = 0; wIdx < numWaves; wIdx++) {
              const progress = ((t * 0.45 + wIdx / numWaves) % 1.0);
              const waveX = sound.x + (cameraRef.current.x - sound.x) * progress;
              const waveY = (-0.1 + floatOffset) + (-0.4 - (-0.1 + floatOffset)) * progress;
              const waveZ = sound.z + (cameraRef.current.z - sound.z) * progress;

              const waveP = project({ x: waveX, y: waveY, z: waveZ }, width, height, cameraRef.current);
              if (waveP) {
                const pulseSize = Math.max(1.8, (2.5 + 4.5 * ampFactor) / waveP.depth);
                ctx.fillStyle = `rgba(${rgb}, ${(1.0 - progress) * (isSelected ? 0.75 : 0.45)})`;
                ctx.beginPath();
                ctx.arc(waveP.x, waveP.y, pulseSize, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
        }

        const drawWireframeEdges = (vertices: { x: number; y: number; z: number }[], edges: [number, number][]) => {
          const rotSpeed = 0.45;
          const rotY = t * rotSpeed + sound.id.charCodeAt(0);
          const rotPitch = t * 0.15;

          const projPts = vertices.map(v => {
            const cosY = Math.cos(rotY);
            const sinY = Math.sin(rotY);
            const rx = v.x * cosY - v.z * sinY;
            const rz = v.x * sinY + v.z * cosY;

            const cosX = Math.cos(rotPitch);
            const sinX = Math.sin(rotPitch);
            const ry = v.y * cosX - rz * sinX;
            const rzFinal = v.y * sinX + rz * cosX;

            return project({
              x: sound.x + rx,
              y: -0.1 + floatOffset + ry,
              z: sound.z + rzFinal
            }, width, height, cameraRef.current);
          });

          if (projPts.some(p => p === null)) return;

          ctx.strokeStyle = `rgba(${rgb}, ${isSelected || isHovered ? 0.95 : 0.6})`;
          ctx.lineWidth = isSelected ? 2.2 : isHovered ? 1.8 : 1.2;

          edges.forEach(([i, j]) => {
            ctx.beginPath();
            ctx.moveTo(projPts[i]!.x, projPts[i]!.y);
            ctx.lineTo(projPts[j]!.x, projPts[j]!.y);
            ctx.stroke();
          });

          ctx.fillStyle = `rgba(${rgb}, ${isSelected || isHovered ? 1.0 : 0.85})`;
          projPts.forEach((p) => {
            ctx.beginPath();
            ctx.arc(p!.x, p!.y, isSelected ? 3.0 : isHovered ? 2.5 : 1.8, 0, Math.PI * 2);
            ctx.fill();
          });
        };

        const volMultiplier = 0.3 + 1.7 * (sound.volume ?? 0.8);
        const shape = sound.nodeShape || 'sphere';

        const shadowP = project({ x: sound.x, y: -0.69, z: sound.z }, width, height, cameraRef.current);
        if (shadowP) {
          const shadowRadius = Math.max(4, (32 * volMultiplier) / shadowP.depth);
          const shadowGrad = ctx.createRadialGradient(shadowP.x, shadowP.y, 1, shadowP.x, shadowP.y, shadowRadius);
          shadowGrad.addColorStop(0, `rgba(0, 0, 0, ${isSelected ? 0.6 : 0.4})`);
          shadowGrad.addColorStop(0.5, `rgba(${rgb}, ${sound.isPlaying ? 0.25 : 0.1})`);
          shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = shadowGrad;
          ctx.beginPath();
          ctx.arc(shadowP.x, shadowP.y, shadowRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        const centerP = project({ x: sound.x, y: -0.1 + floatOffset, z: sound.z }, width, height, cameraRef.current);
        if (centerP) {
          const coreRadius = Math.max(3, (12 + 18 * ampFactor * volMultiplier) / centerP.depth);
          const coreGrad = ctx.createRadialGradient(centerP.x, centerP.y, 0, centerP.x, centerP.y, coreRadius * 2);
          coreGrad.addColorStop(0, `rgba(255, 255, 255, ${sound.isPlaying ? 0.95 : 0.7})`);
          coreGrad.addColorStop(0.3, `rgba(${rgb}, ${sound.isPlaying ? 0.85 : 0.5})`);
          coreGrad.addColorStop(1, `rgba(${rgb}, 0)`);
          ctx.fillStyle = coreGrad;
          ctx.beginPath();
          ctx.arc(centerP.x, centerP.y, coreRadius * 2, 0, Math.PI * 2);
          ctx.fill();
        }

        if (shape === 'cube') {
          const s = (0.25 + 0.08 * ampFactor) * volMultiplier;
          const vertices = [
            { x: -s, y: -s, z: -s },
            { x: s, y: -s, z: -s },
            { x: s, y: s, z: -s },
            { x: -s, y: s, z: -s },
            { x: -s, y: -s, z: s },
            { x: s, y: -s, z: s },
            { x: s, y: s, z: s },
            { x: -s, y: s, z: s },
          ];
          const edges: [number, number][] = [
            [0, 1], [1, 2], [2, 3], [3, 0],
            [4, 5], [5, 6], [6, 7], [7, 4],
            [0, 4], [1, 5], [2, 6], [3, 7],
          ];
          drawWireframeEdges(vertices, edges);
        } else if (shape === 'pyramid') {
          const w = (0.28 + 0.08 * ampFactor) * volMultiplier;
          const h = (0.38 + 0.12 * ampFactor) * volMultiplier;
          const vertices = [
            { x: 0, y: h / 2, z: 0 },
            { x: -w, y: -h / 2, z: -w },
            { x: w, y: -h / 2, z: -w },
            { x: w, y: -h / 2, z: w },
            { x: -w, y: -h / 2, z: w },
          ];
          const edges: [number, number][] = [
            [0, 1], [0, 2], [0, 3], [0, 4],
            [1, 2], [2, 3], [3, 4], [4, 1],
          ];
          drawWireframeEdges(vertices, edges);
        } else if (shape === 'torus') {
          const rRing = (0.26 + 0.08 * ampFactor) * volMultiplier;
          const rTube = 0.09 * volMultiplier;
          const vertices: { x: number; y: number; z: number }[] = [];
          const edges: [number, number][] = [];

          const ringSegs = 8;
          const tubeSegs = 6;
          for (let i = 0; i < ringSegs; i++) {
            const phi = (i / ringSegs) * Math.PI * 2;
            const cosPhi = Math.cos(phi);
            const sinPhi = Math.sin(phi);
            for (let j = 0; j < tubeSegs; j++) {
              const theta = (j / tubeSegs) * Math.PI * 2;
              const cosTheta = Math.cos(theta);
              const sinTheta = Math.sin(theta);

              const x = (rRing + rTube * cosTheta) * cosPhi;
              const y = rTube * sinTheta;
              const z = (rRing + rTube * cosTheta) * sinPhi;
              vertices.push({ x, y, z });

              const cur = i * tubeSegs + j;
              edges.push([cur, i * tubeSegs + ((j + 1) % tubeSegs)]);
              edges.push([cur, ((i + 1) % ringSegs) * tubeSegs + j]);
            }
          }
          drawWireframeEdges(vertices, edges);
        } else if (shape === 'cylinder') {
          const r = (0.24 + 0.08 * ampFactor) * volMultiplier;
          const h = (0.3 + 0.1 * ampFactor) * volMultiplier;
          const vertices: { x: number; y: number; z: number }[] = [];
          const edges: [number, number][] = [];

          const segs = 8;
          for (let i = 0; i < segs; i++) {
            const theta = (i / segs) * Math.PI * 2;
            vertices.push({ x: r * Math.cos(theta), y: -h, z: r * Math.sin(theta) });
            edges.push([i, (i + 1) % segs]);
          }
          for (let i = 0; i < segs; i++) {
            const theta = (i / segs) * Math.PI * 2;
            vertices.push({ x: r * Math.cos(theta), y: h, z: r * Math.sin(theta) });
            edges.push([segs + i, segs + ((i + 1) % segs)]);
            edges.push([i, segs + i]);
          }
          drawWireframeEdges(vertices, edges);
        } else {
          // sphere
          const r = (0.3 + 0.1 * ampFactor) * volMultiplier;
          const vertices: { x: number; y: number; z: number }[] = [];
          const edges: [number, number][] = [];

          const latSegs = 5;
          const lonSegs = 8;
          for (let i = 1; i < latSegs; i++) {
            const theta = (i / latSegs) * Math.PI;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);
            for (let j = 0; j < lonSegs; j++) {
              const phi = (j / lonSegs) * Math.PI * 2;
              vertices.push({
                x: r * sinTheta * Math.cos(phi),
                y: r * cosTheta,
                z: r * sinTheta * Math.sin(phi),
              });
              const cur = (i - 1) * lonSegs + j;
              edges.push([cur, (i - 1) * lonSegs + ((j + 1) % lonSegs)]);
              if (i < latSegs - 1) {
                edges.push([cur, i * lonSegs + j]);
              }
            }
          }

          const topIdx = vertices.length;
          vertices.push({ x: 0, y: r, z: 0 });
          const botIdx = vertices.length;
          vertices.push({ x: 0, y: -r, z: 0 });
          for (let j = 0; j < lonSegs; j++) {
            edges.push([topIdx, j]);
            edges.push([botIdx, (latSegs - 2) * lonSegs + j]);
          }
          drawWireframeEdges(vertices, edges);

          const numParticles = 16;
          for (let pIdx = 0; pIdx < numParticles; pIdx++) {
            const h = pIdx / numParticles;
            const theta = (pIdx * 137.5 * Math.PI) / 180;
            const baseRadius = (0.12 + 0.35 * Math.sqrt(h)) * volMultiplier;
            const waveFreq = sound.isPlaying ? (6.0 + 4.0 * ampFactor) : 2.5;
            const waveAmpl = (0.04 + 0.12 * ampFactor) * volMultiplier;
            const radialDisp = Math.sin(t * waveFreq - (baseRadius / volMultiplier) * 11.0 + h * Math.PI * 1.5) * waveAmpl;

            const partRadius = baseRadius + radialDisp;
            const partX = sound.x + Math.cos(theta) * partRadius;
            const partY = -0.1 + floatOffset + (h * 0.4 - 0.2) * volMultiplier;
            const partZ = sound.z + Math.sin(theta) * partRadius;

            const pt = project({ x: partX, y: partY, z: partZ }, width, height, cameraRef.current);
            if (pt) {
              const pRadius = Math.max(2, (6 + 10 * ampFactor) / pt.depth);
              const grad = ctx.createRadialGradient(pt.x, pt.y, 1, pt.x, pt.y, pRadius);
              const coreAlpha = isSelected ? 0.28 : 0.15;
              grad.addColorStop(0, `rgba(${rgb}, ${coreAlpha})`);
              grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
              ctx.fillStyle = grad;
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, pRadius, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }

        // Acoustic effects visuals
        if (sound.isPlaying) {
          if (sound.reverbType && sound.reverbType !== 'none') {
            const isLong = sound.reverbType === 'long';
            const reverbFactor = sound.reverbWetness ?? 0.3;
            const speed = isLong ? 0.6 : 1.2;
            const rippleCount = isLong ? 4 : 3;

            for (let rIdx = 0; rIdx < rippleCount; rIdx++) {
              const rippleProgress = ((t * speed + rIdx / rippleCount) % 1.0);
              const rippleRadius = (0.25 + rippleProgress * (isLong ? 3.5 : 1.8)) * volMultiplier;
              const rippleAlpha = (1.0 - rippleProgress) * reverbFactor * 0.45;
              renderBoundaryCircle(rippleRadius, `rgba(${rgb}, ${rippleAlpha})`, false);
            }

            const spokeCount = isLong ? 8 : 6;
            const spokeLen = (0.5 + 1.2 * reverbFactor) * volMultiplier;
            ctx.strokeStyle = `rgba(${rgb}, ${reverbFactor * 0.3})`;
            ctx.lineWidth = 1.0;
            for (let sp = 0; sp < spokeCount; sp++) {
              const spAngle = (sp / spokeCount) * Math.PI * 2 + t * 0.4;
              const spP1 = project({ x: sound.x + Math.cos(spAngle) * 0.2 * volMultiplier, y: -0.69, z: sound.z + Math.sin(spAngle) * 0.2 * volMultiplier }, width, height, cameraRef.current);
              const spP2 = project({ x: sound.x + Math.cos(spAngle) * spokeLen, y: -0.69, z: sound.z + Math.sin(spAngle) * spokeLen }, width, height, cameraRef.current);
              if (spP1 && spP2) {
                ctx.beginPath();
                ctx.moveTo(spP1.x, spP1.y);
                ctx.lineTo(spP2.x, spP2.y);
                ctx.stroke();
              }
            }
          }

          if (sound.delayEnabled) {
            const delayTimeVal = sound.delayTime ?? 0.3;
            const delayFbVal = sound.delayFeedback ?? 0.4;
            const helixVertices: { x: number; y: number; z: number }[] = [];
            const helixEdges: [number, number][] = [];

            const helixSegs = 24;
            const turns = 2.5 + 2.0 * delayFbVal;
            const helixRadius = (0.42 + 0.1 * Math.sin(t * 3.5)) * volMultiplier;
            const helixHeight = 0.75 * volMultiplier;

            for (let i = 0; i <= helixSegs; i++) {
              const theta = (i / helixSegs) * Math.PI * 2 * turns + t * (2.2 / delayTimeVal);
              const hFraction = i / helixSegs;
              const hX = Math.cos(theta) * helixRadius;
              const hY = -helixHeight / 2 + hFraction * helixHeight;
              const hZ = Math.sin(theta) * helixRadius;
              helixVertices.push({ x: hX, y: hY, z: hZ });
              if (i > 0) helixEdges.push([i - 1, i]);
            }
            drawWireframeEdges(helixVertices, helixEdges);

            const echoSatCount = Math.min(5, Math.max(2, Math.round(delayFbVal * 6)));
            for (let es = 0; es < echoSatCount; es++) {
              const orbSpeed = 1.8 / delayTimeVal;
              const orbAngle = (es / echoSatCount) * Math.PI * 2 + t * orbSpeed;
              const orbDist = (0.55 + 0.2 * es) * volMultiplier;
              const satX = sound.x + Math.cos(orbAngle) * orbDist;
              const satY = -0.1 + floatOffset + Math.sin(t * 4 + es) * 0.12 * volMultiplier;
              const satZ = sound.z + Math.sin(orbAngle) * orbDist;

              const satP = project({ x: satX, y: satY, z: satZ }, width, height, cameraRef.current);
              if (satP) {
                const satRadius = Math.max(2, (4 + 3 * ampFactor) / satP.depth);
                ctx.fillStyle = `rgba(${rgb}, ${0.85 - es * 0.15})`;
                ctx.beginPath();
                ctx.arc(satP.x, satP.y, satRadius, 0, Math.PI * 2);
                ctx.fill();

                const satCenterP = project({ x: sound.x, y: -0.1 + floatOffset, z: sound.z }, width, height, cameraRef.current);
                if (satCenterP) {
                  ctx.strokeStyle = `rgba(${rgb}, ${0.4 - es * 0.08})`;
                  ctx.lineWidth = 0.8;
                  ctx.beginPath();
                  ctx.moveTo(satCenterP.x, satCenterP.y);
                  ctx.lineTo(satP.x, satP.y);
                  ctx.stroke();
                }
              }
            }
          }

          if (sound.filterType && sound.filterType !== 'none') {
            const isLowpass = sound.filterType === 'lowpass';
            const filterRadius = (0.52 + 0.08 * Math.cos(t * 6.0)) * volMultiplier;
            const ringY = isLowpass ? (-0.32 * volMultiplier) : (0.32 * volMultiplier);
            const ringVertices: { x: number; y: number; z: number }[] = [];
            const ringEdges: [number, number][] = [];

            const segs = 16;
            for (let i = 0; i < segs; i++) {
              const angle = (i / segs) * Math.PI * 2 + (isLowpass ? 0 : t * 2.5);
              ringVertices.push({
                x: Math.cos(angle) * filterRadius,
                y: ringY + (isLowpass ? 0 : Math.sin(t * 8 + i) * 0.03 * volMultiplier),
                z: Math.sin(angle) * filterRadius
              });
              ringEdges.push([i, (i + 1) % segs]);
            }
            drawWireframeEdges(ringVertices, ringEdges);

            if (isLowpass) {
              const plateCrossEdges: [number, number][] = [[0, 8], [4, 12]];
              drawWireframeEdges(ringVertices, plateCrossEdges);
            } else {
              const beamTopP = project({ x: sound.x, y: -0.1 + floatOffset + 1.2 * volMultiplier, z: sound.z }, width, height, cameraRef.current);
              const beamBotP = project({ x: sound.x, y: -0.1 + floatOffset, z: sound.z }, width, height, cameraRef.current);
              if (beamTopP && beamBotP) {
                const beamGrad = ctx.createLinearGradient(beamBotP.x, beamBotP.y, beamTopP.x, beamTopP.y);
                beamGrad.addColorStop(0, `rgba(${rgb}, 0.6)`);
                beamGrad.addColorStop(1, `rgba(${rgb}, 0)`);
                ctx.strokeStyle = beamGrad;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(beamBotP.x, beamBotP.y);
                ctx.lineTo(beamTopP.x, beamTopP.y);
                ctx.stroke();
              }
            }
          }

          if (sound.dopplerEnabled) {
            const dopFactor = sound.dopplerFactor ?? 1.0;
            const dopVertices: { x: number; y: number; z: number }[] = [];
            const dopEdges: [number, number][] = [];

            const numPts = 20;
            const radius = 0.48 * volMultiplier;
            for (let i = 0; i < numPts; i++) {
              const angle = (i / numPts) * Math.PI * 2;
              const wave = Math.sin(angle * 5.0 + t * 14.0 * dopFactor) * 0.07 * volMultiplier;
              dopVertices.push({
                x: Math.cos(angle) * (radius + wave),
                y: Math.sin(t * 5.0) * 0.08 * volMultiplier,
                z: Math.sin(angle) * (radius + wave)
              });
              dopEdges.push([i, (i + 1) % numPts]);
            }
            drawWireframeEdges(dopVertices, dopEdges);
          }
        }

        if (isSelected && centerP) {
          const reticleSize = Math.max(22, (55 * volMultiplier) / centerP.depth);
          ctx.strokeStyle = `rgba(${rgb}, 0.95)`;
          ctx.lineWidth = 1.5;

          const cornerLen = reticleSize * 0.35;
          const left = centerP.x - reticleSize;
          const right = centerP.x + reticleSize;
          const top = centerP.y - reticleSize;
          const bottom = centerP.y + reticleSize;

          ctx.beginPath(); ctx.moveTo(left, top + cornerLen); ctx.lineTo(left, top); ctx.lineTo(left + cornerLen, top); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(right - cornerLen, top); ctx.lineTo(right, top); ctx.lineTo(right, top + cornerLen); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(left, bottom - cornerLen); ctx.lineTo(left, bottom); ctx.lineTo(left + cornerLen, bottom); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(right - cornerLen, bottom); ctx.lineTo(right, bottom); ctx.lineTo(right, bottom - cornerLen); ctx.stroke();
        }

        const labelHeight = 1.35;
        const labelP = project({ x: sound.x, y: -0.7 + floatOffset + labelHeight, z: sound.z }, width, height, cameraRef.current);
        if (labelP) {
          const activeBadges: string[] = [];
          if (sound.reverbType && sound.reverbType !== 'none') activeBadges.push('REV');
          if (sound.delayEnabled) activeBadges.push('DEL');
          if (sound.filterType && sound.filterType !== 'none') activeBadges.push(sound.filterType === 'lowpass' ? 'LP' : 'HP');
          if (sound.dopplerEnabled) activeBadges.push('DOP');

          const badgeText = activeBadges.length > 0 ? ` [${activeBadges.join('·')}]` : '';
          const labelText = isHovered
            ? `${sound.name}${badgeText} (${Math.round(sound.volume * 100)}%)`
            : `${sound.name}${badgeText}`;

          ctx.font = 'bold 9px monospace';
          const textWidth = ctx.measureText(labelText).width;

          if (!isDay) {
            ctx.fillStyle = isSelected ? `rgba(${rgb}, 0.95)` : 'rgba(10, 18, 21, 0.85)';
            ctx.strokeStyle = isSelected ? '#ffffff' : `rgba(${rgb}, 0.5)`;
          } else {
            ctx.fillStyle = isSelected ? '#18181b' : 'rgba(255,255,255,0.85)';
            ctx.strokeStyle = isSelected ? '#18181b' : 'rgba(0,0,0,0.15)';
          }
          ctx.lineWidth = 1;

          const px = 6;
          const py = 4;

          ctx.beginPath();
          ctx.roundRect(labelP.x - textWidth / 2 - px, labelP.y - 6 - py, textWidth + px * 2, 12 + py * 2, 4);
          ctx.fill();
          ctx.stroke();

          if (!isDay) {
            ctx.fillStyle = '#ffffff';
          } else {
            ctx.fillStyle = isSelected ? '#ffffff' : '#27272a';
          }
          ctx.textAlign = 'center';
          ctx.fillText(labelText, labelP.x, labelP.y + 2);

          if (isSelected) {
            ctx.fillStyle = isDay ? '#18181b' : `rgba(${rgb}, 0.95)`;
            ctx.beginPath();
            ctx.moveTo(labelP.x - 4, labelP.y + 6 + py);
            ctx.lineTo(labelP.x + 4, labelP.y + 6 + py);
            ctx.lineTo(labelP.x, labelP.y + 10 + py);
            ctx.closePath();
            ctx.fill();
          }
        }
      });

      // Dust particles
      dustParticlesRef.current.forEach((p) => {
        p.y += p.speedY;
        if (p.y > 3.0) {
          p.y = -0.7;
          p.x = -25 + Math.random() * 50;
          p.z = -25 + Math.random() * 50;
        }

        const swayX = Math.sin(t * 1.5 + p.phase) * 0.015;
        const swayZ = Math.cos(t * 1.0 + p.phase) * 0.015;

        const pt = project({ x: p.x + swayX, y: p.y, z: p.z + swayZ }, width, height, cameraRef.current);
        if (pt) {
          const fadeHeight = Math.min(1.0, (3.0 - p.y) / 1.0);
          const opacity = (0.2 + 0.45 * Math.sin(t + p.phase)) * fadeHeight;
          const pixelSize = Math.max(0.6, (p.size * 180) / pt.depth);

          ctx.fillStyle = `rgba(235, 240, 255, ${opacity})`;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pixelSize, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Compass guides on horizon
      const compassZ = 15;
      const directions = [
        { label: '▲ NORTH', x: 0, z: compassZ, color: '#78716c', rgb: '120, 113, 108' },
        { label: '▶ EAST', x: compassZ, z: 0, color: '#ca8a04', rgb: '202, 138, 4' },
        { label: '▼ SOUTH', x: 0, z: -compassZ, color: '#dc2626', rgb: '220, 38, 38' },
        { label: '◀ WEST', x: -compassZ, z: 0, color: '#16a34a', rgb: '22, 163, 74' },
      ];

      directions.forEach((dir) => {
        ctx.strokeStyle = `rgba(${dir.rgb}, 0.25)`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        let startedLine = false;
        const lineSteps = 10;
        for (let s = 0; s <= lineSteps; s++) {
          const ratio = s / lineSteps;
          const lx = dir.x * ratio;
          const lz = dir.z * ratio;
          const lp = project({ x: lx, y: -0.7, z: lz }, width, height, cameraRef.current);
          if (lp) {
            if (!startedLine) {
              ctx.moveTo(lp.x, lp.y);
              startedLine = true;
            } else {
              ctx.lineTo(lp.x, lp.y);
            }
          }
        }
        ctx.stroke();

        const p = project({ x: dir.x, y: 1.5, z: dir.z }, width, height, cameraRef.current);
        if (p) {
          const groundP = project({ x: dir.x, y: -0.7, z: dir.z }, width, height, cameraRef.current);
          if (groundP) {
            ctx.strokeStyle = `rgba(${dir.rgb}, 0.15)`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y + 5);
            ctx.lineTo(groundP.x, groundP.y);
            ctx.stroke();

            ctx.fillStyle = dir.color;
            ctx.beginPath();
            ctx.arc(groundP.x, groundP.y, 4 / groundP.depth, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });

      // Horizon line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(0, height / 2 - Math.tan(cameraRef.current.pitch) * height * 0.5);
      ctx.lineTo(width, height / 2 - Math.tan(cameraRef.current.pitch) * height * 0.5);
      ctx.stroke();

      renderLoopIdRef.current = requestAnimationFrame(updateFrame);
    };

    renderLoopIdRef.current = requestAnimationFrame(updateFrame);

    return () => {
      if (renderLoopIdRef.current) {
        cancelAnimationFrame(renderLoopIdRef.current);
      }
    };
  }, [isStarted, sounds, selectedSoundId, isMuted, scenery, cameraRef, canvasRef, dustParticlesRef, joystickVectorRef, mistPuffsRef, setCamera, setSelectedSoundId]);

  return (
    <div className="absolute inset-0 w-full h-full bg-[#111113] z-0">
      <canvas
        ref={canvasRef}
        id="soundplay-render-canvas"
        className="w-full h-full block touch-none"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
        onTouchStart={handleCanvasTouchStart}
        onTouchMove={handleCanvasTouchMove}
        onTouchEnd={handleCanvasMouseUp}
        onClick={handleCanvasClick}
      />
    </div>
  );
};

export default Canvas3D;
