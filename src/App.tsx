import React, { useState, useEffect, useRef } from 'react';
import { 
  Compass, 
  VolumeX, 
  Volume2, 
  RotateCcw, 
  Plus, 
  HelpCircle, 
  Sliders, 
  Eye, 
  Check, 
  Info,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Trash2,
  Sun,
  Moon,
  ListMusic,
  Radio,
  Upload,
  Mic,
  Square
} from 'lucide-react';
import { audioService } from './audioEngine';
import { SoundSource, CameraState, SoundType } from './types';
import { loadSounds, saveSound, deleteSoundFromDB, updateSoundMetadata, clearAllSoundsFromDB } from './lib/db';
import SoundList from './components/SoundList';
import Recorder from './components/Recorder';
import Joystick from './components/Joystick';
import HelpModal from './components/HelpModal';

// Static seed data for scenery wireframes (aesthetic environment)
interface SceneryItem {
  id: string;
  type: 'tree' | 'column' | 'monolith' | 'shrub';
  x: number;
  z: number;
  scale: number;
}

// Color interpolation helper functions for smooth day/night transition
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

export default function App() {
  const [isDay, setIsDay] = useState(false);
  const isDayRef = useRef(isDay);
  useEffect(() => {
    isDayRef.current = isDay;
  }, [isDay]);

  const dayTransitionRef = useRef(0.0); // 0 = night, 1 = day
  const lastTimeRef = useRef(performance.now());

  const [isStarted, setIsStarted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  
  // Camera State
  const [camera, setCamera] = useState<CameraState>({
    x: 0,
    z: -3,
    angle: 0, // yaw in radians (always facing north)
    pitch: -0.18, // pitch in radians (tilted slightly downward to see the floor)
  });

  // Sound Sources State
  const [sounds, setSounds] = useState<SoundSource[]>([]);
  const [selectedSoundId, setSelectedSoundId] = useState<string | null>(null);
  const [isPointerLocked, setIsPointerLocked] = useState(false);

  // Keyboard active inputs tracker for smooth frame updates
  const pressedKeysRef = useRef<{ [key: string]: boolean }>({});
  
  // Canvas & render refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderLoopIdRef = useRef<number | null>(null);
  const cameraRef = useRef<CameraState>(camera);

  // Drag interaction refs for mouse/trackpad camera orbit
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  // Joystick state
  const joystickVectorRef = useRef({ x: 0, z: 0 });

  // Dynamic far distance scenery objects
  const [scenery, setScenery] = useState<SceneryItem[]>([]);

  // Responsive floating panel states (hidden on mobile, visible on desktop by default)
  const [showSoundList, setShowSoundList] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [showCookieBanner, setShowCookieBanner] = useState(false);
  const [showMoveHint, setShowMoveHint] = useState(false);

  // Live Performance Recorder State integration
  const [isRecordingPerformance, setIsRecordingPerformance] = useState(false);
  const recorderRef = useRef<{ isRecording: boolean; stop: () => void; start: () => void } | null>(null);

  useEffect(() => {
    const accepted = localStorage.getItem('soundplay_cookies_accepted');
    if (!accepted) {
      const timer = setTimeout(() => {
        setShowCookieBanner(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (showMoveHint) {
      const timer = setTimeout(() => {
        setShowMoveHint(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showMoveHint]);

  const handleAcceptCookies = () => {
    localStorage.setItem('soundplay_cookies_accepted', 'true');
    setShowCookieBanner(false);
  };

  // Top level mic recording & upload state
  const topFileInputRef = useRef<HTMLInputElement>(null);
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [micSeconds, setMicSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const micMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micChunksRef = useRef<Blob[]>([]);
  const micTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (micTimerRef.current) clearInterval(micTimerRef.current);
    };
  }, []);

  // Dust particles ref
  const dustParticlesRef = useRef<{ x: number; y: number; z: number; speedY: number; size: number; phase: number }[]>([]);
  
  // Mist/Fog puffs ref
  const mistPuffsRef = useRef<{ x: number; z: number; r: number; vx: number; vz: number; phase: number }[]>([]);

  // Update cameras in sync with refs for high speed loop access
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  // Generate initial static wireframe scenery on startup
  useEffect(() => {
    const items: SceneryItem[] = [];
    // Place scenery around the scene excluding the center origin (0,0) where player starts
    const types: ('tree' | 'column' | 'monolith' | 'shrub')[] = ['tree', 'column', 'monolith', 'shrub'];
    
    for (let i = 0; i < 28; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 7 + Math.random() * 22;
      const x = Math.sin(angle) * dist;
      const z = Math.cos(angle) * dist;
      
      items.push({
        id: `scenery-${i}`,
        type: types[Math.floor(Math.random() * types.length)],
        x,
        z,
        scale: 0.6 + Math.random() * 0.9,
      });
    }
    setScenery(items);

    // Initialize 60 dust particles
    const particles = [];
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: -25 + Math.random() * 50,
        y: -0.7 + Math.random() * 4.0,
        z: -25 + Math.random() * 50,
        speedY: 0.003 + Math.random() * 0.006,
        size: 0.012 + Math.random() * 0.025,
        phase: Math.random() * Math.PI * 2,
      });
    }
    dustParticlesRef.current = particles;

    // Initialize 6 large mist puffs (Nebel)
    const mists = [];
    for (let i = 0; i < 6; i++) {
      mists.push({
        x: -22 + Math.random() * 44,
        z: -22 + Math.random() * 44,
        r: 6.5 + Math.random() * 7.5, // large radius
        vx: -0.012 + Math.random() * 0.024,
        vz: -0.012 + Math.random() * 0.024,
        phase: Math.random() * Math.PI * 2,
      });
    }
    mistPuffsRef.current = mists;
  }, []);

  // Set up empty default sounds at boot (or load custom sounds from database if any)
  useEffect(() => {
    const loadInitialSounds = async () => {
      const defaultSounds: SoundSource[] = [];

      try {
        const saved = await loadSounds();
        if (saved && saved.length > 0) {
          const restored: SoundSource[] = saved.map((s) => ({
            id: s.id,
            name: s.name,
            type: s.type as 'procedural' | 'uploaded',
            soundType: s.soundType as SoundType,
            x: s.x,
            z: s.z,
            isPlaying: s.isPlaying,
            volume: s.volume,
          }));
          setSounds(restored);
        } else {
          setSounds(defaultSounds);
        }
      } catch (err) {
        console.error('Error loading sounds from IndexedDB:', err);
        setSounds(defaultSounds);
      }
    };

    loadInitialSounds();
  }, []);

  // Initialize and trigger soundscapes
  const startExplorer = async () => {
    audioService.init();
    audioService.resume();
    setIsStarted(true);
    setShowMoveHint(true);
    
    try {
      // Decode any loaded IndexedDB buffers
      const idbSounds = await loadSounds();
      for (const saved of idbSounds) {
        if (audioService.ctx && !audioService.hasBuffer(saved.id)) {
          try {
            const bufCopy = saved.buffer.slice(0);
            audioService.ctx.decodeAudioData(
              bufCopy,
              (decodedBuffer) => {
                audioService.storeBuffer(saved.id, decodedBuffer);
                // Trigger play if active
                const current = sounds.find((s) => s.id === saved.id);
                if (current && current.isPlaying) {
                  audioService.startSound(current);
                }
              },
              (err) => console.error(`Error restoring custom audio ${saved.name}:`, err)
            );
          } catch (e) {
            console.error(e);
          }
        }
      }
    } catch (err) {
      console.error('Error restoring uploaded sounds from db:', err);
    }

    // Boot all active sound sources
    sounds.forEach((sound) => {
      if (sound.isPlaying) {
        if (sound.type !== 'uploaded' || audioService.hasBuffer(sound.id)) {
          audioService.startSound(sound);
        }
      }
    });
  };

  // Sound events handlers
  const handleUpdateSound = (id: string, updates: Partial<SoundSource>) => {
    setSounds((prev) =>
      prev.map((sound) => {
        if (sound.id === id) {
          const updated = { ...sound, ...updates };
          
          // Apply changes immediately to the Web Audio engine graph
          if (updates.isPlaying !== undefined) {
            if (updates.isPlaying) {
              audioService.startSound(updated);
            } else {
              audioService.stopSound(id);
            }
          }

          // Persist changes to IndexedDB if it is an uploaded sound
          if (sound.type === 'uploaded') {
            updateSoundMetadata(id, updates as any);
          }

          return updated;
        }
        return sound;
      })
    );
  };

  const handleDeleteSound = (id: string) => {
    audioService.stopSound(id);
    setSounds((prev) => prev.filter((sound) => sound.id !== id));
    deleteSoundFromDB(id);
    if (selectedSoundId === id) {
      setSelectedSoundId(null);
    }
  };

  const handleDeleteAllSounds = () => {
    sounds.forEach((sound) => {
      audioService.stopSound(sound.id);
    });
    setSounds([]);
    setSelectedSoundId(null);
    clearAllSoundsFromDB();
  };

  const startMicRecording = async () => {
    setMicError(null);
    micChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      micMediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          micChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const actualMimeType = mediaRecorder.mimeType || 'audio/mp4';
        const blob = new Blob(micChunksRef.current, { type: actualMimeType });
        
        let extension = 'mp4';
        if (actualMimeType.includes('webm')) {
          extension = 'webm';
        } else if (actualMimeType.includes('ogg')) {
          extension = 'ogg';
        } else if (actualMimeType.includes('wav')) {
          extension = 'wav';
        } else if (actualMimeType.includes('aac')) {
          extension = 'aac';
        }
        
        const file = new File([blob], `mic_recording_${Date.now()}.${extension}`, { type: actualMimeType });
        
        handleAddSound('uploaded', `Recorded Sound #${sounds.length + 1}`, file);

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecordingMic(true);
      setMicSeconds(0);

      micTimerRef.current = setInterval(() => {
        setMicSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Mic access failed:', err);
      setMicError('Microphone access denied or unavailable.');
    }
  };

  const stopMicRecording = () => {
    if (micMediaRecorderRef.current && isRecordingMic) {
      micMediaRecorderRef.current.stop();
      setIsRecordingMic(false);
      if (micTimerRef.current) {
        clearInterval(micTimerRef.current);
        micTimerRef.current = null;
      }
    }
  };

  const handleTopFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const name = file.name.split('.')[0] || 'Custom Sound';
    
    handleAddSound('uploaded', name, file);
  };

  const handleAddSound = async (type: SoundType, name: string, file?: File) => {
    const id = `sound-${Date.now()}`;
    
    // Place sound 3 units straight ahead of the camera position so the user sees it immediately!
    const theta = cameraRef.current.angle;
    const spawnX = cameraRef.current.x + Math.sin(theta) * 3.2;
    const spawnZ = cameraRef.current.z + Math.cos(theta) * 3.2;

    const newSound: SoundSource = {
      id,
      name,
      type: file ? 'uploaded' : 'procedural',
      soundType: type,
      x: spawnX,
      z: spawnZ,
      isPlaying: true,
      volume: 0.8,
    };

    if (file) {
      try {
        // Parse custom audio file into Web Audio buffer
        const arrayBuffer = await file.arrayBuffer();
        
        // Persist the sound and its buffer to IndexedDB first
        await saveSound({
          id,
          name,
          type: 'uploaded',
          soundType: 'uploaded',
          x: spawnX,
          z: spawnZ,
          isPlaying: true,
          volume: 0.8,
        }, arrayBuffer);

        if (audioService.ctx) {
          // Decode a slice copy of the arrayBuffer since decodeAudioData consumes the buffer
          const bufCopy = arrayBuffer.slice(0);
          audioService.ctx.decodeAudioData(
            bufCopy,
            (buffer) => {
              audioService.storeBuffer(id, buffer);
              // Register & boot
              setSounds((prev) => [...prev, newSound]);
              audioService.startSound(newSound);
              setSelectedSoundId(id);
            },
            (err) => {
              alert('Error decoding audio file. Make sure it is a valid format (.mp3, .wav, etc.)');
            }
          );
        } else {
          // If context is not started yet, still register in sounds so it shows up in UI
          setSounds((prev) => [...prev, newSound]);
          setSelectedSoundId(id);
        }
      } catch (err) {
        console.error('File load failed:', err);
      }
    } else {
      // Procedural sound addition
      setSounds((prev) => [...prev, newSound]);
      // Wait for React update then play
      setTimeout(() => {
        audioService.startSound(newSound);
      }, 50);
      setSelectedSoundId(id);
    }
  };

  const handleTeleportTo = (x: number, z: number) => {
    // Snap camera position to the node, staying 1.5 units offset so you look at it
    setCamera((prev) => ({
      ...prev,
      x: x - Math.sin(prev.angle) * 1.5,
      z: z - Math.cos(prev.angle) * 1.5,
    }));
  };

  // Keyboard binding updates
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

  // Mouse / Trackpad Drag Orbiting
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    audioService.resume();
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleCanvasMouseUp = () => {
    isDraggingRef.current = false;
  };

  // Pointer Lock management for First-Person Mouse Look
  useEffect(() => {
    const handlePointerLockChange = () => {
      const canvas = canvasRef.current;
      const isLocked = !!(canvas && document.pointerLockElement === canvas);
      setIsPointerLocked(isLocked);
    };

    const handleMouseMoveWhenLocked = (e: MouseEvent) => {
      // Rotation look-around is disabled for clean translational 4-directional egoshooter movement
    };

    document.addEventListener('pointerlockchange', handlePointerLockChange);
    document.addEventListener('mousemove', handleMouseMoveWhenLocked);
    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      document.removeEventListener('mousemove', handleMouseMoveWhenLocked);
    };
  }, []);

  // Touch drag orbiting for mobile screens
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

    // Detect if we clicked on any sound cube 2D projection
    let clickedId: string | null = null;
    let closestDist = 45; // max click radius in pixels

    sounds.forEach((sound) => {
      const projection = project({ x: sound.x, y: 0.2, z: sound.z }, canvas.width, canvas.height, cameraRef.current);
      if (projection) {
        const dx = clickX - projection.x;
        const dy = clickY - projection.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < closestDist) {
          closestDist = d;
          clickedId = sound.id;
        }
      }
    });

    setSelectedSoundId(clickedId);
  };

  // Core Projection function: projects world 3D coordinate to screen 2D coordinate
  const project = (
    v: { x: number; y: number; z: number },
    width: number,
    height: number,
    cam: CameraState
  ) => {
    // 1. Translate point relative to camera
    const dx = v.x - cam.x;
    const dy = v.y - 0.3; // camera level height offset
    const dz = v.z - cam.z;

    // 2. Rotate yaw (Y axis) around camera
    const cosY = Math.cos(-cam.angle);
    const sinY = Math.sin(-cam.angle);
    const rx1 = dx * cosY - dz * sinY;
    const rz1 = dx * sinY + dz * cosY;

    // 3. Rotate pitch (X axis) around camera
    const cosX = Math.cos(-cam.pitch);
    const sinX = Math.sin(-cam.pitch);
    const ry2 = dy * cosX - rz1 * sinX;
    const rz2 = dy * sinX + rz1 * cosX;

    // Behind camera depth check
    if (rz2 <= 0.15) return null;

    // Perspective projection
    const focalLength = Math.max(width, height) * 0.95;
    const screenX = width / 2 + (rx1 / rz2) * focalLength;
    const screenY = height / 2 - (ry2 / rz2) * focalLength;

    return { x: screenX, y: screenY, depth: rz2 };
  };

  // Main Render and Navigation Frame loop
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

      // Ensure canvas matches high resolution bounds fluidly
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }

      const { width, height } = canvas;

      // Calculate smooth frame-rate independent day/night transition (5 seconds)
      const now = performance.now();
      const deltaTime = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      if (isDayRef.current) {
        dayTransitionRef.current = Math.min(1.0, dayTransitionRef.current + deltaTime / 5.0);
      } else {
        dayTransitionRef.current = Math.max(0.0, dayTransitionRef.current - deltaTime / 5.0);
      }

      const transitionT = dayTransitionRef.current; // 0 = night, 1 = day

      // 1. HANDLE PLAYER MOVEMENT (Egoshooter Style Keyboard & Joystick Traversal)
      let moveSpeed = 0.12;
      let rotateSpeed = 0.035;
      
      let forwardAmount = 0;
      let strafeAmount = 0;

      // Keyboard Inputs (WASD & Arrows strafe player)
      const keys = pressedKeysRef.current;
      if (keys['w'] || keys['arrowup']) forwardAmount += 1;
      if (keys['s'] || keys['arrowdown']) forwardAmount -= 1;
      if (keys['a'] || keys['arrowleft']) strafeAmount -= 1;
      if (keys['d'] || keys['arrowright']) strafeAmount += 1;

      // Add Mobile Joystick influence
      strafeAmount += joystickVectorRef.current.x;
      forwardAmount += joystickVectorRef.current.z;

      // Apply unified vector displacement
      if (forwardAmount !== 0 || strafeAmount !== 0) {
        // Normalize movement vector to avoid speeding up diagonally
        const mag = Math.sqrt(forwardAmount * forwardAmount + strafeAmount * strafeAmount);
        const normForward = forwardAmount / mag;
        const normStrafe = strafeAmount / mag;

        setCamera((prev) => {
          const cosAngle = Math.cos(prev.angle);
          const sinAngle = Math.sin(prev.angle);

          // Egoshooter translation: W/Up advances in camera direction (-sin(angle), cos(angle))
          // Strafe A/D translates perpendicular (cos(angle), sin(angle))
          const moveX = (normForward * (-sinAngle) + normStrafe * cosAngle) * moveSpeed;
          const moveZ = (normForward * cosAngle + normStrafe * sinAngle) * moveSpeed;

          // Clamp exploration boundaries
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

      // 3. CANVAS CLEAR (Depending on Day/Night smoothly interpolated)
      // We render a stunning, colorful sky gradient above the horizon line, and a solid ground below!
      ctx.fillStyle = lerpColor('#0a1215', '#E2D8A5', transitionT);
      ctx.fillRect(0, 0, width, height);

      // Dynamic 3D Perspective Horizon Line Position
      const focalLength = Math.max(width, height) * 0.95;
      const horizonY = height / 2 + Math.tan(cameraRef.current.pitch) * focalLength;

      // Draw a colorful sky gradient from top of screen (0) to horizonY
      const skyGrad = ctx.createLinearGradient(0, 0, 0, Math.max(horizonY, 50));
      skyGrad.addColorStop(0, lerpColor('#040708', '#577E89', transitionT));
      skyGrad.addColorStop(0.4, lerpColor('#070b0d', '#6F9F9C', transitionT));
      skyGrad.addColorStop(0.75, lerpColor('#0c1514', '#DEC484', transitionT));
      skyGrad.addColorStop(0.9, lerpColor('#181a14', '#DEC484', transitionT));
      skyGrad.addColorStop(1, lerpColor('#1e160e', '#E1A36F', transitionT));
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, Math.max(0, horizonY));

      // Render beautiful glowing nebulae and colorful twinkling stars with fade opacity mapped to the transition
      if (transitionT < 0.95) {
        const nightFactor = 1.0 - transitionT;
        const timeFactor = Date.now() / 1000;

        // Nebula 1: Soft Sea Nymph (#6F9F9C) celestial glow in upper-left sky
        const neb1 = ctx.createRadialGradient(width * 0.25, horizonY * 0.4, 5, width * 0.25, horizonY * 0.4, Math.max(width * 0.35, 200));
        neb1.addColorStop(0, `rgba(111, 159, 156, ${0.12 * nightFactor})`); // Sea Nymph with low opacity
        neb1.addColorStop(0.5, `rgba(111, 159, 156, ${0.04 * nightFactor})`);
        neb1.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = neb1;
        ctx.fillRect(0, 0, width, Math.max(0, horizonY));

        // Nebula 2: Soft Hampton (#E2D8A5) & Calico (#DEC484) glow in upper-right sky
        const neb2 = ctx.createRadialGradient(width * 0.75, horizonY * 0.3, 5, width * 0.75, horizonY * 0.3, Math.max(width * 0.4, 250));
        neb2.addColorStop(0, `rgba(226, 216, 165, ${0.10 * nightFactor})`); // Hampton
        neb2.addColorStop(0.5, `rgba(222, 196, 132, ${0.04 * nightFactor})`); // Calico
        neb2.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = neb2;
        ctx.fillRect(0, 0, width, Math.max(0, horizonY));

        for (let sIdx = 0; sIdx < 45; sIdx++) {
          // Semi-random deterministic positions using index
          const sX = (Math.sin(sIdx * 372.4) * 0.5 + 0.5) * width;
          const sY = (Math.cos(sIdx * 194.2) * 0.5 + 0.5) * Math.max(0, horizonY - 12);
          const size = Math.max(0.6, 1.4 + Math.sin(timeFactor * 2.2 + sIdx) * 0.9);
          const brightness = 0.35 + Math.sin(timeFactor * 1.8 + sIdx) * 0.55;
          
          // Index-based light palette star colors!
          let starColor = 'rgba(226, 216, 165, '; // Hampton (default)
          if (sIdx % 4 === 1) {
            starColor = 'rgba(222, 196, 132, '; // Calico
          } else if (sIdx % 4 === 2) {
            starColor = 'rgba(111, 159, 156, '; // Sea Nymph
          } else if (sIdx % 4 === 3) {
            starColor = 'rgba(225, 163, 111, '; // Harvest Gold
          }
          
          ctx.fillStyle = `${starColor}${Math.max(0.12, Math.min(0.95, brightness)) * nightFactor})`;
          ctx.beginPath();
          ctx.arc(sX, sY, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw Ground base below horizonY - fading perfectly into the sky with NO BORDER
      const groundGrad = ctx.createLinearGradient(0, horizonY, 0, height);
      groundGrad.addColorStop(0, lerpColor('#1e160e', '#E1A36F', transitionT));
      groundGrad.addColorStop(0.25, lerpColor('#121611', '#DEC484', transitionT));
      groundGrad.addColorStop(0.65, lerpColor('#070a0c', '#E2D8A5', transitionT));
      groundGrad.addColorStop(1, lerpColor('#030506', '#577E89', transitionT));
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, Math.max(0, horizonY), width, Math.max(0, height - horizonY));

      // Sketch texture overlay: fine subtle grid using the custom Smalt Blue palette color
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

      // --- 3D RENDERING PIPELINE ---

      // Render the 4 directional glows on the far horizon (Compass directions matching custom palette)
      const horizonGlows = [
        { x: 0, z: 1200, label: 'North', rgb: '87, 126, 137', alphaNight: 0.35, alphaDay: 0.28 },
        { x: 1200, z: 0, label: 'East', rgb: '222, 196, 132', alphaNight: 0.32, alphaDay: 0.24 },
        { x: 0, z: -1200, label: 'South', rgb: '225, 163, 111', alphaNight: 0.32, alphaDay: 0.24 },
        { x: -1200, z: 0, label: 'West', rgb: '111, 159, 156', alphaNight: 0.32, alphaDay: 0.24 },
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

      // A. Ground grid (3D sketchy wireframe lines) - Soft Hampton-tinted glow at night
      ctx.strokeStyle = lerpColorWithAlpha(226, 216, 165, 0.09, 15, 23, 42, 0.06, transitionT); // faint ground grid
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

      // A2. Draw flowing, floating mist puffs (Nebel) on the horizon/ground
      ctx.setLineDash([]);
      const t = Date.now() / 1000;
      mistPuffsRef.current.forEach((puff) => {
        // Update position slowly over time
        puff.x += puff.vx;
        puff.z += puff.vz;

        // Wrap around boundary limits
        const bLimit = 28;
        if (puff.x > bLimit) puff.x = -bLimit;
        if (puff.x < -bLimit) puff.x = bLimit;
        if (puff.z > bLimit) puff.z = -bLimit;
        if (puff.z < -bLimit) puff.z = bLimit;

        // Subtle sinusoidal size pulsation
        const pulseRad = puff.r * (1.0 + 0.15 * Math.sin(t * 0.4 + puff.phase));

        // Project the mist center onto the screen
        const pt = project({ x: puff.x, y: -0.6, z: puff.z }, width, height, cameraRef.current);
        if (pt) {
          // Draw a very soft, large radial gradient block
          const screenRadius = (pulseRad * 75) / pt.depth;
          if (screenRadius > 8) {
            const grad = ctx.createRadialGradient(pt.x, pt.y, 2, pt.x, pt.y, screenRadius);
            // Soft grayish-blue mist color fading to completely transparent
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

      // B. Static Scenery Objects (Minimalist Sketches)
      scenery.forEach((item) => {
        const sceneryStroke = lerpColorWithAlpha(111, 159, 156, 0.55, 15, 23, 42, 0.35, transitionT); // glowing Sea Nymph wireframe at night
        const sceneryLightStroke = lerpColorWithAlpha(222, 196, 132, 0.45, 15, 23, 42, 0.25, transitionT); // glowing Calico wireframe at night
        const drawScenery = () => {
          if (item.type === 'monolith') {
            // A floating or standing slab wireframe
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
            if (proj.some(p => p === null)) return; // skip if any point is behind camera

            // Draw vertical skeletal lines
            ctx.strokeStyle = sceneryStroke;
            ctx.lineWidth = 0.8;
            for (let k = 0; k < 4; k++) {
              ctx.beginPath();
              ctx.moveTo(proj[k]!.x, proj[k]!.y);
              ctx.lineTo(proj[k + 4]!.x, proj[k + 4]!.y);
              ctx.stroke();
            }

            // Draw loops
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
          } else if (item.type === 'column') {
            // Thin wireframe column
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

              // Draw concentric hoops along column
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
            // Lollipop wireframe sketch tree
            const trunkHeight = 0.8 * item.scale;
            const crownRadius = 0.5 * item.scale;
            
            const botP = project({ x: item.x, y: -0.7, z: item.z }, width, height, cameraRef.current);
            const midP = project({ x: item.x, y: trunkHeight, z: item.z }, width, height, cameraRef.current);
            const topP = project({ x: item.x, y: trunkHeight + crownRadius * 2, z: item.z }, width, height, cameraRef.current);

            if (botP && midP && topP) {
              ctx.strokeStyle = sceneryStroke;
              ctx.lineWidth = 0.7;
              
              // Draw trunk
              ctx.beginPath();
              ctx.moveTo(botP.x, botP.y);
              ctx.lineTo(midP.x, midP.y);
              ctx.stroke();

              // Draw crown diamond/pyramid
              const crownW = 0.4 * item.scale;
              const crownV = [
                { x: item.x - crownW, y: trunkHeight + crownRadius, z: item.z },
                { x: item.x + crownW, y: trunkHeight + crownRadius, z: item.z },
                { x: item.x, y: trunkHeight + crownRadius, z: item.z - crownW },
                { x: item.x, y: trunkHeight + crownRadius, z: item.z + crownW },
              ].map(v => project(v, width, height, cameraRef.current));

              if (!crownV.some(p => p === null)) {
                // connect midP and topP to all 4 crown vertices
                ctx.strokeStyle = sceneryStroke;
                crownV.forEach((v) => {
                  ctx.beginPath();
                  ctx.moveTo(midP.x, midP.y);
                  ctx.lineTo(v!.x, v!.y);
                  ctx.lineTo(topP.x, topP.y);
                  ctx.stroke();
                });

                // outline ring
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
            // Shrub (short messy horizontal dashes)
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
              ctx.moveTo(p.x - r*0.5, p.y - r*0.4);
              ctx.lineTo(p.x + r*0.5, p.y - r*0.4);
              ctx.stroke();
            }
          }
        };

        drawScenery();
      });

      // C. Active Sound sources: Slow Undulating 3D Wave Ribbons (Liquid Neon Visualizers)
      sounds.forEach((sound) => {
        const amplitude = audioService.getAmplitude(sound.id);
        const ampFactor = sound.isPlaying ? (amplitude / 255) : 0;
        const isSelected = selectedSoundId === sound.id;

        const t = Date.now() / 1000;
        // Float the entire element slowly to indicate spatial hovering
        const floatOffset = (0.5 + 0.5 * Math.sin(t * 1.5 + sound.id.charCodeAt(0))) * 0.12;

        // Map directional color codes in the beautiful custom palette styling
        let rgb = '87, 126, 137'; // Smalt Blue default (North)
        let hexColor = '#577E89';
        
        if (sound.soundType === 'north') {
          rgb = '87, 126, 137'; // Smalt Blue
          hexColor = '#577E89';
        } else if (sound.soundType === 'east') {
          rgb = '222, 196, 132'; // Calico
          hexColor = '#DEC484';
        } else if (sound.soundType === 'south') {
          rgb = '225, 163, 111'; // Harvest Gold
          hexColor = '#E1A36F';
        } else if (sound.soundType === 'west') {
          rgb = '111, 159, 156'; // Sea Nymph
          hexColor = '#6F9F9C';
        } else {
          // Custom uploaded file - Soft Sage / Hampton inspired grey-cream
          rgb = '226, 216, 165';
          hexColor = '#E2D8A5';
        }

        if (!sound.isPlaying) {
          rgb = '161, 161, 170';
          hexColor = '#a1a1aa';
        }

        // Draw spatial circular footprints on ground (max audible boundaries)
        const renderBoundaryCircle = (radius: number, colorStr: string, isDashed: boolean) => {
          ctx.strokeStyle = colorStr;
          ctx.lineWidth = 1;
          if (isDashed) {
            ctx.setLineDash([3, 4]);
          } else {
            ctx.setLineDash([]);
          }

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
          ctx.setLineDash([]); // clear dash
        };

        // Render delicate concentric audio boundary lines on the ground grid
        renderBoundaryCircle(1.1, `rgba(${rgb}, 0.08)`, true);
        renderBoundaryCircle(2.2, `rgba(${rgb}, 0.03)`, true);

        // Core central anchor point on the ground (indicating absolute coordinate position)
        const shadowP = project({ x: sound.x, y: -0.7, z: sound.z }, width, height, cameraRef.current);
        if (shadowP) {
          ctx.strokeStyle = `rgba(${rgb}, ${isSelected ? 0.8 : 0.45})`;
          ctx.lineWidth = isSelected ? 2.0 : 1.0;
          ctx.beginPath();
          ctx.arc(shadowP.x, shadowP.y, Math.max(2, 7 / shadowP.depth), 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = `rgba(${rgb}, ${isSelected ? 0.22 : 0.08})`;
          ctx.fill();
        }

        // Draw fluffy sound nodes with Simple Harmonic Longitudinal Wave motion (Flipping Physics inspired)
        const numParticles = 32;
        for (let pIdx = 0; pIdx < numParticles; pIdx++) {
          // Distribute heights uniformly
          const h = pIdx / numParticles;
          // Golden ratio angle spiral distribution for perfect uniform spacing
          const theta = pIdx * 137.5 * Math.PI / 180;
          
          // Outer radius of the cloud (fluffy boundary)
          const baseRadius = 0.12 + 0.45 * Math.sqrt(h);
          
          // Longitudinal wave oscillation: particles slide along their radial lines
          // This creates compression bands and rarefaction bands propagating outward!
          const waveFreq = sound.isPlaying ? (6.0 + 4.0 * ampFactor) : 2.5;
          const waveAmpl = 0.04 + 0.12 * ampFactor;
          const radialDisp = Math.sin(t * waveFreq - baseRadius * 11.0 + h * Math.PI * 1.5) * waveAmpl;

          const partRadius = baseRadius + radialDisp;
          const partX = sound.x + Math.cos(theta) * partRadius;
          const partY = -0.5 + floatOffset + h * 0.95; // cloud height from -0.5 to 0.45
          const partZ = sound.z + Math.sin(theta) * partRadius;

          const pt = project({ x: partX, y: partY, z: partZ }, width, height, cameraRef.current);
          if (pt) {
            // Draw a delicate spring vector connecting line from the vertical central core axis
            const axisP = project({ x: sound.x, y: partY, z: sound.z }, width, height, cameraRef.current);
            if (axisP) {
              ctx.strokeStyle = `rgba(${rgb}, ${0.06 + 0.12 * ampFactor})`;
              ctx.lineWidth = 0.5;
              ctx.beginPath();
              ctx.moveTo(axisP.x, axisP.y);
              ctx.lineTo(pt.x, pt.y);
              ctx.stroke();
            }

            // Draw a very fluffy radial gradient cloudlet
            const sizeMultiplier = sound.isPlaying ? (15 + 22 * ampFactor) : 8;
            const sizeOsc = Math.sin(t * 3 + pIdx) * 2;
            const pRadius = Math.max(3, (sizeMultiplier + sizeOsc) / pt.depth);

            const grad = ctx.createRadialGradient(pt.x, pt.y, 1, pt.x, pt.y, pRadius);
            const coreAlpha = isSelected ? (0.45 + 0.35 * ampFactor) : (0.28 + 0.22 * ampFactor);
            grad.addColorStop(0, `rgba(${rgb}, ${coreAlpha})`);
            grad.addColorStop(0.35, `rgba(${rgb}, ${coreAlpha * 0.35})`);
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, pRadius, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Float a human readable monospace tag above the liquid visualizer
        const labelHeight = 1.3;
        const labelP = project({ x: sound.x, y: -0.7 + floatOffset + labelHeight, z: sound.z }, width, height, cameraRef.current);
        if (labelP) {
          const labelText = sound.name;
          ctx.font = 'bold 9px monospace';
          const textWidth = ctx.measureText(labelText).width;
          
          if (!isDay) {
            // Glowing dark panels at night
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
          ctx.roundRect(labelP.x - textWidth/2 - px, labelP.y - 6 - py, textWidth + px*2, 12 + py*2, 4);
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

      // C2. Update and draw floating 3D dust particles drifting through the scenery
      dustParticlesRef.current.forEach((p) => {
        // Drift upwards
        p.y += p.speedY;
        if (p.y > 3.0) {
          p.y = -0.7; // reset to ground level
          p.x = -25 + Math.random() * 50;
          p.z = -25 + Math.random() * 50;
        }

        // Slight horizontal swaying
        const swayX = Math.sin(t * 1.5 + p.phase) * 0.015;
        const swayZ = Math.cos(t * 1.0 + p.phase) * 0.015;

        const pt = project({ x: p.x + swayX, y: p.y, z: p.z + swayZ }, width, height, cameraRef.current);
        if (pt) {
          // Fade based on distance (depth) and age/height
          const fadeHeight = Math.min(1.0, (3.0 - p.y) / 1.0); // fade out near the top
          const opacity = (0.2 + 0.45 * Math.sin(t + p.phase)) * fadeHeight;
          const pixelSize = Math.max(0.6, (p.size * 180) / pt.depth);

          ctx.fillStyle = `rgba(235, 240, 255, ${opacity})`;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pixelSize, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // D. Draw cardinal directional guide on the far horizon (Compass) with dynamic, subtle colors
      const compassZ = 15;
      const directions = [
        { label: '▲ NORTH (GREY)', x: 0, z: compassZ, color: '#78716c', rgb: '120, 113, 108' },
        { label: '▶ EAST (YELLOW)', x: compassZ, z: 0, color: '#ca8a04', rgb: '202, 138, 4' },
        { label: '▼ SOUTH (RED)', x: 0, z: -compassZ, color: '#dc2626', rgb: '220, 38, 38' },
        { label: '◀ WEST (GREEN)', x: -compassZ, z: 0, color: '#16a34a', rgb: '22, 163, 74' },
      ];

      directions.forEach((dir) => {
        // Draw a beautiful, subtle colored ground ray from center (0,0) to boundary
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

        // Project direction billboard onto sky height (y = 1.5)
        const p = project({ x: dir.x, y: 1.5, z: dir.z }, width, height, cameraRef.current);
        if (p) {
          // Direction names (North, East, etc.) deleted per user request to declutter the canvas.
          // We still render the guide pin and dynamic ray to preserve precise spatial reference.

          // Draw vertical guideline down to ground
          const groundP = project({ x: dir.x, y: -0.7, z: dir.z }, width, height, cameraRef.current);
          if (groundP) {
            ctx.strokeStyle = `rgba(${dir.rgb}, 0.15)`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y + 5);
            ctx.lineTo(groundP.x, groundP.y);
            ctx.stroke();

            // Draw directional ground pin marker
            ctx.fillStyle = dir.color;
            ctx.beginPath();
            ctx.arc(groundP.x, groundP.y, 4 / groundP.depth, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });

      // E. Horizon line / Sky sketch line
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
  }, [isStarted, sounds, selectedSoundId, isMuted, scenery]);

  // Clean stop of audio context on exit
  useEffect(() => {
    return () => {
      audioService.stopAll();
    };
  }, []);

  return (
    <div className="relative h-screen w-screen bg-[#111113] overflow-hidden text-zinc-900 font-sans select-none">
      
      {/* 1. INITIALIZATION WELCOME MODAL */}
      {!isStarted && (
        <HelpModal onStart={startExplorer} />
      )}
      
      {/* 2. 3D RENDERING CANVAS (FULL SCREEN BASIS) */}
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

      {/* 3. FLOATING HUD TOOLBAR (TOP FIXED) */}
      <header className="absolute top-0 inset-x-0 p-4 flex items-center justify-between z-10 pointer-events-none select-none">
        {/* Logo / Location Info */}
        <div className="flex items-center gap-2 pointer-events-auto bg-zinc-900/90 backdrop-blur-xs px-3 py-1.5 rounded-xl border border-zinc-800 shadow-md">
          <Compass className="w-4 h-4 text-zinc-100 animate-spin-slow" />
          <div className="flex flex-col">
            <span className="text-[10px] font-extrabold uppercase tracking-tight text-zinc-50">
              sound_play
            </span>
            <span className="text-[9px] font-mono text-zinc-400">
              POS: X:{camera.x.toFixed(1)} Z:{camera.z.toFixed(1)}
            </span>
          </div>
        </div>

        {/* Quick Toolbar */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* Toggle Soundscape Sources Button */}
          <button
            id="toggle-sources-btn"
            onClick={() => {
              setShowSoundList(!showSoundList);
              // Minimize recorder on mobile view if opening list
              if (window.innerWidth < 768 && !showSoundList) {
                setShowRecorder(false);
              }
            }}
            className={`p-2 rounded-lg border transition-all duration-150 cursor-pointer shadow-sm flex items-center gap-1.5 ${
              showSoundList 
                ? 'bg-zinc-200 text-zinc-950 border-zinc-400 font-bold scale-[1.02]' 
                : 'bg-zinc-900/90 hover:bg-zinc-800 border-zinc-800 text-zinc-200'
            }`}
            title="Toggle Soundscape Sources"
          >
            <ListMusic className="w-4 h-4" />
            <span className="text-[9px] font-mono font-extrabold hidden md:inline">SOURCES</span>
          </button>

          {/* Toggle Performance Recorder Button */}
          <button
            id="toggle-recorder-btn"
            onClick={() => {
              if (isRecordingPerformance) {
                recorderRef.current?.stop();
              } else {
                setShowRecorder(!showRecorder);
                // Minimize sources list on mobile view if opening recorder
                if (window.innerWidth < 768 && !showRecorder) {
                  setShowSoundList(false);
                }
              }
            }}
            className={`p-2 rounded-lg border transition-all duration-150 cursor-pointer shadow-sm flex items-center gap-1.5 ${
              isRecordingPerformance 
                ? 'bg-red-600 text-white border-red-500 font-bold scale-[1.02] animate-pulse shadow-red-500/30 shadow-lg' 
                : showRecorder 
                  ? 'bg-red-950/90 text-red-400 border-red-800 font-bold scale-[1.02]' 
                  : 'bg-zinc-900/90 hover:bg-zinc-800 border-zinc-800 text-zinc-200'
            }`}
            title={isRecordingPerformance ? "Recording active! Click to Stop and Export" : "Toggle Performance Recorder"}
          >
            {isRecordingPerformance ? (
              <>
                <span className="w-2 h-2 rounded-full bg-white animate-ping shrink-0" />
                <span className="text-[9px] font-mono font-extrabold">STOP REC</span>
              </>
            ) : (
              <>
                <Radio className="w-4 h-4" />
                <span className="text-[9px] font-mono font-extrabold hidden md:inline">RECORDER</span>
              </>
            )}
          </button>

          {/* Global Mute */}
          <button
            id="global-mute-btn"
            onClick={() => setIsMuted(!isMuted)}
            className={`p-2 rounded-lg border transition-all duration-150 cursor-pointer shadow-2xs ${
              isMuted 
                ? 'bg-red-950/85 text-red-400 border-red-800 hover:bg-red-900/80' 
                : 'bg-zinc-900/90 hover:bg-zinc-800 border-zinc-800 text-zinc-200'
            }`}
            title={isMuted ? "Unmute system" : "Mute system"}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Day / Night Toggle */}
          <button
            id="day-night-toggle-btn"
            onClick={() => setIsDay(!isDay)}
            className="p-2 rounded-lg border border-zinc-800 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
            title={isDay ? "Switch to Night" : "Switch to Day"}
          >
            {isDay ? (
              <>
                <Sun className="w-4 h-4 text-amber-400 animate-pulse" />
                <span className="text-[10px] font-mono font-bold hidden sm:inline">DAY</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-indigo-400" />
                <span className="text-[10px] font-mono font-bold hidden sm:inline">NIGHT</span>
              </>
            )}
          </button>

          {/* Reset position */}
          <button
            id="reset-cam-btn"
            onClick={() => setCamera({ x: 0, z: -3, angle: 0, pitch: -0.18 })}
            className="p-2 rounded-lg border border-zinc-800 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 transition-all cursor-pointer shadow-2xs"
            title="Reset coordinates"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Help info overlay trigger */}
          <button
            id="help-trigger-btn"
            onClick={() => setShowHelp(true)}
            className="p-2 rounded-lg border border-zinc-800 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 transition-all cursor-pointer shadow-2xs"
            title="View instructions"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>

        {/* Microphone Error Banner */}
        {micError && (
          <div className="absolute top-18 right-4 bg-red-950/95 border border-red-800 text-red-400 text-[10px] px-3 py-1.5 rounded-lg shadow-lg font-mono pointer-events-auto animate-bounce z-50">
            ⚠️ {micError}
          </div>
        )}
      </header>

      {/* 4. FLOATING CANVAS HUD DECORATION & USER OVERLAYS */}
      {showMoveHint && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-45 bg-black/15 backdrop-blur-xs transition-opacity duration-500 animate-fade-in">
          <div className="bg-zinc-950/95 border border-zinc-800 text-zinc-200 py-5 px-7 rounded-2xl shadow-2xl flex flex-col items-center gap-2.5 max-w-sm text-center select-none animate-scale-up pointer-events-auto">
            <Sparkles className="w-5 h-5 text-amber-400 animate-pulse shrink-0" />
            <h4 className="text-xs font-bold font-mono tracking-widest uppercase text-white">
              Navigation Controls
            </h4>
            <p className="text-[11px] text-zinc-300 leading-normal font-sans">
              Explore the 3D room using <strong>WASD / Arrow keys</strong> or the <strong>Touch Joystick</strong>.
            </p>
            <p className="text-[10px] text-zinc-400 font-sans border-t border-zinc-800/80 pt-2 w-full">
              Click any colored sound node to inspect or rename it!
            </p>
          </div>
        </div>
      )}

      {/* 3. MOBILE CONTROLS / TOUCH JOYSTICK */}
      <div className="absolute bottom-6 left-6 z-10 block pointer-events-auto">
        <Joystick 
          onMove={(vector) => {
            audioService.resume();
            joystickVectorRef.current = vector;
          }} 
        />
      </div>

      {/* 3B. BOTTOM-RIGHT CONTENT CREATION BUTTON CLUSTER */}
      <div className="absolute bottom-6 right-6 z-30 flex items-center gap-2 pointer-events-auto select-none">
        {/* DIRECT UPLOAD BUTTON */}
        <div className="relative">
          <input
            ref={topFileInputRef}
            id="top-audio-file-upload"
            type="file"
            accept="audio/*"
            onChange={handleTopFileUpload}
            className="hidden"
          />
          <button
            id="top-trigger-upload-btn"
            onClick={() => topFileInputRef.current?.click()}
            className="px-3.5 py-2.5 rounded-xl border border-zinc-800 bg-zinc-950/95 text-zinc-100 hover:bg-zinc-900 hover:border-zinc-500 hover:text-white hover:scale-[1.03] active:scale-95 transition-all duration-150 cursor-pointer shadow-xl flex items-center gap-2"
            title="Direct Upload Custom Audio File"
          >
            <Upload className="w-4 h-4 text-indigo-400" />
            <span className="text-[10px] font-mono font-extrabold tracking-wider">UPLOAD</span>
          </button>
        </div>

        {/* DIRECT RECORD LIVE BUTTON */}
        <div>
          {!isRecordingMic ? (
            <button
              id="top-start-mic-record-btn"
              onClick={startMicRecording}
              className="px-3.5 py-2.5 rounded-xl border border-red-950/80 bg-red-950/45 text-red-400 hover:bg-red-950/90 hover:border-red-500 hover:scale-[1.03] active:scale-95 transition-all duration-150 cursor-pointer shadow-xl flex items-center gap-2"
              title="Direct Record Live Audio"
            >
              <Mic className="w-4 h-4 text-red-400 animate-pulse" />
              <span className="text-[10px] font-mono font-extrabold tracking-wider">RECORD</span>
            </button>
          ) : (
            <button
              id="top-stop-mic-record-btn"
              onClick={stopMicRecording}
              className="px-3.5 py-2.5 rounded-xl border border-red-600 bg-red-600 text-white hover:scale-[1.03] active:scale-95 transition-all duration-150 cursor-pointer shadow-xl flex items-center gap-2 animate-pulse"
              title={`Recording... Click to Stop (${micSeconds}s)`}
            >
              <Square className="w-4 h-4 fill-white text-white animate-spin-slow" />
              <span className="text-[10px] font-mono font-extrabold tracking-wider">STOP ({micSeconds}s)</span>
            </button>
          )}
        </div>
      </div>

      {/* Selected Sound Inspector (Overlay HUD shifted up to sit neatly above the creator buttons) */}
      {selectedSoundId && (
        <div className="absolute bottom-22 right-6 z-20 max-w-xs w-full pointer-events-auto">
          {sounds.find(s => s.id === selectedSoundId) ? (
            (() => {
              const s = sounds.find(sound => sound.id === selectedSoundId)!;
              const dx = s.x - camera.x;
              const dz = s.z - camera.z;
              const d = Math.sqrt(dx*dx + dz*dz).toFixed(1);

              return (
                <div id="inspector-overlay-card" className="p-4 bg-white border border-zinc-950 shadow-md rounded-xl flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-zinc-400 font-mono uppercase tracking-widest mb-1.5">
                        Active Sound Selected
                      </p>
                      <input
                        type="text"
                        value={s.name}
                        onChange={(e) => handleUpdateSound(s.id, { name: e.target.value })}
                        className="text-xs font-bold text-zinc-900 tracking-tight font-sans bg-zinc-50 border border-zinc-200 hover:border-zinc-400 focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950 px-2 py-1 rounded-lg w-full transition-all focus:outline-hidden"
                        placeholder="Rename sound source..."
                      />
                    </div>
                    <button
                      id="close-inspector-btn"
                      onClick={() => setSelectedSoundId(null)}
                      className="text-xs text-zinc-400 hover:text-zinc-950 font-mono font-bold hover:bg-zinc-100 p-1 rounded-sm cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="text-[11px] text-zinc-500 font-mono space-y-1 bg-zinc-50 p-2 rounded-lg border border-zinc-150">
                    <div className="flex justify-between">
                      <span>Coordinate:</span>
                      <span className="text-zinc-700">({s.x.toFixed(1)}, {s.z.toFixed(1)})</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Distance:</span>
                      <span className="text-zinc-700 font-bold">{d} meters</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Status:</span>
                      <span className={`font-semibold ${s.isPlaying ? 'text-green-600' : 'text-zinc-400'}`}>
                        {s.isPlaying ? 'ACTIVE LOOP' : 'PAUSED'}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-1.5 mt-1">
                    <button
                      id="inspector-mute-btn"
                      onClick={() => handleUpdateSound(s.id, { isPlaying: !s.isPlaying })}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        s.isPlaying 
                          ? 'bg-zinc-100 text-zinc-800 border-zinc-200 hover:bg-zinc-200' 
                          : 'bg-zinc-900 text-white border-zinc-950 hover:bg-zinc-800'
                      }`}
                    >
                      {s.isPlaying ? 'Mute' : 'Activate'}
                    </button>
                    <button
                      id="inspector-tp-btn"
                      onClick={() => handleTeleportTo(s.x, s.z)}
                      className="px-3 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors flex items-center justify-center cursor-pointer border border-zinc-950"
                      title="Teleport to source"
                    >
                      <MapPin className="w-4 h-4" />
                    </button>
                    <button
                      id="inspector-del-btn"
                      onClick={() => handleDeleteSound(s.id)}
                      className="px-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors border border-red-200 flex items-center justify-center cursor-pointer"
                      title="Delete source"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })()
          ) : (
            // Safe clear
            () => { setSelectedSoundId(null); return null; }
          )()}
        </div>
      )}

      {/* 5. PERFORMANCE RECORDER FLOATING CONTROL shifted up above creator buttons */}
      <div className={`absolute bottom-22 left-1/2 -translate-x-1/2 md:translate-x-0 md:left-auto md:right-6 z-20 max-w-sm w-[92vw] sm:w-85 bg-white border border-zinc-350 shadow-2xl rounded-2xl p-4 pointer-events-auto animate-slide-up ${showRecorder ? 'block' : 'hidden'}`}>
        <div className="flex items-center justify-between mb-2 border-b border-zinc-100 pb-2">
          <h3 className="text-xs font-extrabold text-zinc-900 font-mono uppercase tracking-wider flex items-center gap-1.5">
            <Radio className="w-4 h-4 text-red-500 animate-pulse" />
            Performance Recorder
          </h3>
          <button
            id="close-recorder-btn"
            onClick={() => setShowRecorder(false)}
            className="text-zinc-400 hover:text-zinc-950 p-1.5 rounded-lg hover:bg-zinc-100 font-bold font-mono text-xs cursor-pointer"
            title="Close Panel"
          >
            ✕
          </button>
        </div>
        <Recorder 
          canvasRef={canvasRef} 
          audioDestination={audioService.recorderDestination} 
          onRecordingChange={(recording) => {
            setIsRecordingPerformance(recording);
            if (recording) {
              // Close the pop up window immediately when active
              setShowRecorder(false);
            }
          }}
          recordingStateRef={recorderRef}
        />
      </div>

      {/* 6. SIDEBAR CONTROLS DASHBOARD PANEL (SLIDING OVERLAY) */}
      {showSoundList && (
        <div className="absolute top-0 right-0 h-full w-[90vw] md:w-80 z-30 flex flex-col bg-white shadow-2xl pointer-events-auto border-l border-zinc-200 animate-slide-left">
          <SoundList
            sounds={sounds}
            listenerPos={{ x: camera.x, z: camera.z }}
            onUpdateSound={handleUpdateSound}
            onDeleteSound={handleDeleteSound}
            onDeleteAllSounds={handleDeleteAllSounds}
            onAddSound={handleAddSound}
            onTeleportTo={handleTeleportTo}
            onClose={() => setShowSoundList(false)}
          />
        </div>
      )}

      {/* 7. HELP MODAL POPUP (MANUAL RESET OVERLAY) */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 pointer-events-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-zinc-950 max-h-[90vh] overflow-y-auto">
            <button
              id="help-close-cross"
              onClick={() => setShowHelp(false)}
              className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-zinc-950 rounded-lg hover:bg-zinc-100 transition-all cursor-pointer font-bold font-mono"
            >
              ✕
            </button>
            
            <div className="text-center mb-4">
              <Compass className="w-8 h-8 text-zinc-900 mx-auto mb-2 animate-spin-slow" />
              <h3 className="text-lg font-bold font-sans uppercase text-zinc-950 tracking-tight">
                Controls Directory
              </h3>
            </div>

            <div className="space-y-4 text-xs text-zinc-600 font-sans leading-relaxed">
              <p>
                Welcome to <strong className="text-zinc-900 font-semibold">sound_play</strong>, a minimalist sketches visual canvas containing fully 3D spatialized stereo sounds.
              </p>
              
              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-1.5 font-mono text-[10px]">
                <div className="font-extrabold text-zinc-900 text-[11px]">NAVIGATION CONTROLS:</div>
                <div>• <kbd className="px-1 py-0.5 border rounded-sm bg-white shadow-xs">W</kbd> / <kbd className="px-1 py-0.5 border rounded-sm bg-white shadow-xs">S</kbd> / <kbd className="px-1 py-0.5 border rounded-sm bg-white shadow-xs">↑</kbd> / <kbd className="px-1 py-0.5 border rounded-sm bg-white shadow-xs">↓</kbd> : Move Forward / Backward</div>
                <div>• <kbd className="px-1 py-0.5 border rounded-sm bg-white shadow-xs">A</kbd> / <kbd className="px-1 py-0.5 border rounded-sm bg-white shadow-xs">D</kbd> / <kbd className="px-1 py-0.5 border rounded-sm bg-white shadow-xs">←</kbd> / <kbd className="px-1 py-0.5 border rounded-sm bg-white shadow-xs">→</kbd> : Strafe Left / Right</div>
                <div>• <strong>On Mobile/Tablets:</strong> Drag the touch joystick at the bottom-left of the screen.</div>
              </div>

              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2.5">
                <div className="font-extrabold text-zinc-900 text-[11px] font-mono">AVAILABLE SOUND OPTIONS:</div>
                <div className="space-y-1.5 leading-snug">
                  <div>• <strong className="text-zinc-800 font-mono">North (Grey)</strong>: Natural open-air bird song synthesizer representing organic forest heights.</div>
                  <div>• <strong className="text-zinc-800 font-mono">East (Yellow)</strong>: High-fidelity micro-tonal bee buzzes reflecting rapid wing vibrations.</div>
                  <div>• <strong className="text-zinc-800 font-mono">South (Red)</strong>: Soft falling rain showers backed by periodic resonant thunderclaps.</div>
                  <div>• <strong className="text-zinc-800 font-mono">West (Green)</strong>: Steady constant mid-frequency soundwaves for calming auditory meditation.</div>
                  <div>• <strong className="text-zinc-800 font-mono">Upload / Record</strong>: Add your own custom stereo files (.mp3, .wav) or record live microphone clips in real-time!</div>
                </div>
              </div>

              <p>
                Use the top toolbar to direct upload or record live soundscapes, toggle the <strong>Sources Panel</strong> to adjust volume and rename sources, or start the <strong>Performance Recorder</strong> to download your explorations as premium video or audio files!
              </p>
            </div>

            <button
              id="help-close-btn"
              onClick={() => setShowHelp(false)}
              className="mt-6 w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl text-xs transition-all cursor-pointer border border-zinc-950 shadow-sm"
            >
              Resume Exploration
            </button>
          </div>
        </div>
      )}

      {/* FOOTER METADATA */}
      <footer className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none select-none text-[8.5px] font-sans text-center text-zinc-400/80 max-w-[92vw] leading-tight">
        App by Philip and Google AI Studio / If you have any questions or feedback, please contact Philip, <a href="mailto:p.stade@mh-freiburg.de" className="pointer-events-auto hover:text-zinc-200 underline transition-colors">p.stade@mh-freiburg.de</a>
      </footer>

      {/* 8. COOKIE CONSENT BANNER */}
      {showCookieBanner && (
        <div className="fixed bottom-4 left-4 right-4 md:left-6 md:right-auto md:max-w-md bg-zinc-900/95 backdrop-blur-md text-zinc-100 p-4 rounded-xl border border-zinc-800 shadow-2xl z-50 animate-slide-up flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 select-none">
          <div className="flex-1">
            <p className="text-xs font-semibold tracking-tight text-zinc-100 flex items-center gap-1.5 mb-1 font-sans">
              🍪 Cookie Settings
            </p>
            <p className="text-[10px] text-zinc-400 leading-normal font-sans">
              We use local storage cookies to securely preserve your virtual coordinates, custom spatial soundtracks, and recording preferences.
            </p>
          </div>
          <button
            id="accept-cookies-btn"
            onClick={handleAcceptCookies}
            className="w-full sm:w-auto shrink-0 bg-white hover:bg-zinc-200 text-zinc-950 text-[10px] font-extrabold uppercase tracking-widest px-4 py-2 rounded-lg cursor-pointer transition-all text-center border border-zinc-100"
          >
            Accept
          </button>
        </div>
      )}

    </div>
  );
}
