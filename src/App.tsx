import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Compass, Sparkles, Radio } from 'lucide-react';
import { audioService } from './audioEngine';
import { SoundSource, CameraState, SoundType } from './types';
import {
  loadSounds,
  saveSound,
  deleteSoundFromDB,
  updateSoundMetadata,
  clearAllSoundsFromDB,
  isQuotaExceededError
} from './lib/db';
import Canvas3D, { SceneryItem } from './components/Canvas3D';
import Controls from './components/Controls';
import Sidebar from './components/Sidebar';
import Recorder from './components/Recorder';
import HelpModal from './components/HelpModal';
import { ToastContainer, ToastMessage, ToastType } from './components/Toast';

export default function App() {
  const [isDay, setIsDay] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Camera State
  const [camera, setCamera] = useState<CameraState>({
    x: 0,
    z: -3,
    angle: 0, // yaw in radians (always facing north)
    pitch: -0.18, // pitch in radians
  });
  const cameraRef = useRef<CameraState>(camera);
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  // Sound Sources State
  const [sounds, setSounds] = useState<SoundSource[]>([]);
  const [selectedSoundId, setSelectedSoundId] = useState<string | null>(null);
  const [hoveredSoundId, setHoveredSoundId] = useState<string | null>(null);

  // Counter ref for recorded sound naming to prevent repetition
  const recordCounterRef = useRef(0);

  // Dynamic scenery objects
  const [scenery, setScenery] = useState<SceneryItem[]>([]);

  // Responsive floating panel states
  const [showSoundList, setShowSoundList] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [showCookieBanner, setShowCookieBanner] = useState(false);
  const [showMoveHint, setShowMoveHint] = useState(false);

  // Toast Notifications state
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 5000) => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `toast-${Date.now()}`;
    setToasts((prev) => [...prev, { id, type, message, duration }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Performance Recorder State
  const [isRecordingPerformance, setIsRecordingPerformance] = useState(false);
  const recorderRef = useRef<{ isRecording: boolean; stop: () => void; start: () => void } | null>(null);

  // Canvas & render refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const joystickVectorRef = useRef({ x: 0, z: 0 });

  // Dust particles ref
  const dustParticlesRef = useRef<{ x: number; y: number; z: number; speedY: number; size: number; phase: number }[]>([]);

  // Mist/Fog puffs ref
  const mistPuffsRef = useRef<{ x: number; z: number; r: number; vx: number; vz: number; phase: number }[]>([]);

  // Cookie/Privacy consent banner state (uses localStorage only, no cookies set)
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

  // Generate initial static wireframe scenery on startup
  useEffect(() => {
    const items: SceneryItem[] = [];
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

    // Initialize dust particles
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

    // Initialize mist puffs
    const mists = [];
    for (let i = 0; i < 6; i++) {
      mists.push({
        x: -22 + Math.random() * 44,
        z: -22 + Math.random() * 44,
        r: 6.5 + Math.random() * 7.5,
        vx: -0.012 + Math.random() * 0.024,
        vz: -0.012 + Math.random() * 0.024,
        phase: Math.random() * Math.PI * 2,
      });
    }
    mistPuffsRef.current = mists;
  }, []);

  // Load existing sounds from IndexedDB on startup
  useEffect(() => {
    const loadInitialSounds = async () => {
      try {
        const saved = await loadSounds();
        if (saved && saved.length > 0) {
          let maxRecordNum = 0;
          const restored: SoundSource[] = saved.map((s) => {
            const match = s.name.match(/Recorded Sound #(\d+)/);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > maxRecordNum) maxRecordNum = num;
            }
            return {
              id: s.id,
              name: s.name,
              type: s.type as 'procedural' | 'uploaded',
              soundType: s.soundType as SoundType,
              x: s.x,
              z: s.z,
              isPlaying: s.isPlaying,
              volume: s.volume,
              nodeShape: s.nodeShape,
              nodeColor: s.nodeColor,
              reverbWetness: s.reverbWetness,
            };
          });

          recordCounterRef.current = Math.max(recordCounterRef.current, maxRecordNum);
          setSounds(restored);
        }
      } catch (err) {
        console.warn('Could not load saved sounds from IndexedDB:', err);
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
      const idbSounds = await loadSounds();
      for (const saved of idbSounds) {
        if (!audioService.hasBuffer(saved.id)) {
          try {
            const decodedBuffer = await audioService.decodeAudioDataFallback(saved.buffer, 'audio/wav', saved.name);
            audioService.storeBuffer(saved.id, decodedBuffer);
            const current = sounds.find((s) => s.id === saved.id);
            if (current && current.isPlaying) {
              audioService.startSound(current);
            }
          } catch (err) {
            console.error(`Error restoring custom audio ${saved.name}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('Error restoring uploaded sounds from db:', err);
    }

    sounds.forEach((sound) => {
      if (sound.isPlaying) {
        if (sound.type !== 'uploaded' || audioService.hasBuffer(sound.id)) {
          audioService.startSound(sound);
        }
      }
    });
  };

  // Sound event handlers
  const handleUpdateSound = (id: string, updates: Partial<SoundSource>) => {
    setSounds((prev) =>
      prev.map((sound) => {
        if (sound.id === id) {
          const updated = { ...sound, ...updates };

          if (updates.isPlaying !== undefined) {
            if (updates.isPlaying) {
              audioService.startSound(updated);
            } else {
              audioService.stopSound(id);
            }
          }

          if (sound.type === 'uploaded') {
            updateSoundMetadata(id, updates as any).catch((e) => {
              console.warn('Could not update metadata in IndexedDB:', e);
            });
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
    deleteSoundFromDB(id).catch((e) => {
      console.warn('Could not delete sound from IndexedDB:', e);
    });
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
    clearAllSoundsFromDB().catch((e) => {
      console.warn('Could not clear sounds from IndexedDB:', e);
    });
  };

  const generateSoundId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `sound-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  };

  const getNextRecordName = () => {
    recordCounterRef.current += 1;
    return `Recorded Sound #${recordCounterRef.current}`;
  };

  const handleAddRecordedSound = (file: File) => {
    const name = getNextRecordName();
    handleAddSound('uploaded', name, file);
  };

  // Decode audio FIRST, then save to IndexedDB after decoding succeeded.
  // If saving fails, show non-blocking error message and keep sound in memory only!
  const handleAddSound = async (type: SoundType, name: string, file?: File) => {
    const id = generateSoundId();

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
      reverbType: 'none',
      reverbWetness: 0.3,
      delayEnabled: false,
      delayTime: 0.3,
      delayFeedback: 0.4,
      filterType: 'none',
      filterFrequency: 1000,
      dopplerEnabled: false,
      dopplerFactor: 1.0,
    };

    if (file) {
      try {
        audioService.init();
        await audioService.resume();

        // 1. Read and decode audio FIRST before any database actions
        const arrayBuffer = await file.arrayBuffer();
        const decodedBuffer = await audioService.decodeAudioDataFallback(arrayBuffer, file.type, file.name);

        // Store decoded buffer in audio service and activate immediately
        audioService.storeBuffer(id, decodedBuffer);
        setSounds((prev) => [...prev, newSound]);
        audioService.startSound(newSound);
        setSelectedSoundId(id);

        // 2. Only attempt to save to IndexedDB after decoding succeeded
        try {
          await saveSound(
            {
              id,
              name,
              type: 'uploaded',
              soundType: 'uploaded',
              x: spawnX,
              z: spawnZ,
              isPlaying: true,
              volume: 0.8,
              reverbType: 'none',
              reverbWetness: 0.3,
              delayEnabled: false,
              delayTime: 0.3,
              delayFeedback: 0.4,
              filterType: 'none',
              filterFrequency: 1000,
              dopplerEnabled: false,
              dopplerFactor: 1.0,
            } as any,
            arrayBuffer
          );
        } catch (dbErr: any) {
          console.warn('Failed to persist audio file to IndexedDB:', dbErr);
          if (isQuotaExceededError(dbErr)) {
            showToast(
              'Browser storage quota exceeded. The sound is active in memory for this session, but will not be saved permanently.',
              'warning'
            );
          } else {
            showToast(
              'Could not save audio to offline storage. The sound will remain active in memory for this session.',
              'warning'
            );
          }
        }
      } catch (err: any) {
        console.error('File decoding failed:', err);
        showToast(
          `Unable to process "${file.name}". Please ensure it is a valid audio file (.wav, .mp3, .m4a, etc.).`,
          'error'
        );
      }
    } else {
      // Procedural sound addition
      setSounds((prev) => [...prev, newSound]);
      setTimeout(() => {
        audioService.startSound(newSound);
      }, 50);
      setSelectedSoundId(id);
    }
  };

  const handleTeleportTo = (x: number, z: number) => {
    setCamera((prev) => ({
      ...prev,
      x: x - Math.sin(prev.angle) * 1.5,
      z: z - Math.cos(prev.angle) * 1.5,
    }));
  };

  // Clean stop on exit
  useEffect(() => {
    return () => {
      audioService.stopAll();
    };
  }, []);

  return (
    <div className="relative h-screen w-screen bg-[#111113] overflow-hidden text-zinc-900 font-sans select-none">
      {/* 1. INITIALIZATION WELCOME MODAL */}
      {!isStarted && <HelpModal onStart={startExplorer} />}

      {/* 2. 3D RENDERING CANVAS */}
      <Canvas3D
        sounds={sounds}
        camera={camera}
        setCamera={setCamera}
        cameraRef={cameraRef}
        isStarted={isStarted}
        isDay={isDay}
        isMuted={isMuted}
        scenery={scenery}
        dustParticlesRef={dustParticlesRef}
        mistPuffsRef={mistPuffsRef}
        joystickVectorRef={joystickVectorRef}
        canvasRef={canvasRef}
        selectedSoundId={selectedSoundId}
        setSelectedSoundId={setSelectedSoundId}
        hoveredSoundId={hoveredSoundId}
        setHoveredSoundId={setHoveredSoundId}
        onUpdateSound={handleUpdateSound}
      />

      {/* 3. HEADERS, HUD & INTERACTIVE CONTROLS */}
      <Controls
        sounds={sounds}
        camera={camera}
        isDay={isDay}
        onToggleDay={() => setIsDay(!isDay)}
        isMuted={isMuted}
        onToggleMute={() => setIsMuted(!isMuted)}
        onResetCamera={() => setCamera({ x: 0, z: -3, angle: 0, pitch: -0.18 })}
        onOpenHelp={() => setShowHelp(true)}
        showSoundList={showSoundList}
        onToggleSoundList={() => {
          setShowSoundList(!showSoundList);
          if (window.innerWidth < 768 && !showSoundList) {
            setShowRecorder(false);
          }
        }}
        showRecorder={showRecorder}
        onToggleRecorder={() => {
          if (isRecordingPerformance) {
            recorderRef.current?.stop();
          } else {
            setShowRecorder(!showRecorder);
            if (window.innerWidth < 768 && !showRecorder) {
              setShowSoundList(false);
            }
          }
        }}
        isRecordingPerformance={isRecordingPerformance}
        selectedSoundId={selectedSoundId}
        onSelectSound={setSelectedSoundId}
        onUpdateSound={handleUpdateSound}
        onTeleportTo={handleTeleportTo}
        onDeleteSound={handleDeleteSound}
        onAddSound={handleAddSound}
        onAddRecordedSound={handleAddRecordedSound}
        onJoystickMove={(vector) => {
          audioService.resume();
          joystickVectorRef.current = vector;
        }}
        onError={(msg) => showToast(msg, 'error')}
      />

      {/* 4. NAVIGATION HINT BANNER */}
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

      {/* 5. PERFORMANCE RECORDER FLOATING CONTROL */}
      <div
        className={`absolute bottom-22 left-1/2 -translate-x-1/2 md:translate-x-0 md:left-auto md:right-6 z-20 max-w-sm w-[92vw] sm:w-85 bg-white border border-zinc-350 shadow-2xl rounded-2xl p-4 pointer-events-auto animate-slide-up ${
          showRecorder ? 'block' : 'hidden'
        }`}
      >
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
              setShowRecorder(false);
            }
          }}
          recordingStateRef={recorderRef}
        />
      </div>

      {/* 6. SIDEBAR DRAWER PANEL */}
      <Sidebar
        isOpen={showSoundList}
        onClose={() => setShowSoundList(false)}
        sounds={sounds}
        listenerPos={{ x: camera.x, z: camera.z }}
        onUpdateSound={handleUpdateSound}
        onDeleteSound={handleDeleteSound}
        onDeleteAllSounds={handleDeleteAllSounds}
        onAddSound={handleAddSound}
        onAddRecordedSound={handleAddRecordedSound}
        onTeleportTo={handleTeleportTo}
        onError={(msg) => showToast(msg, 'error')}
      />

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
                Spatial Audio Studio Guide
              </h3>
              <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest mt-0.5">
                sound_play — User & Info Hub
              </p>
            </div>

            {/* Top Creator & Contact Attribution Card */}
            <div className="p-3 bg-zinc-900 text-white rounded-xl border border-zinc-950 text-center space-y-1 mb-4 shadow-sm">
              <p className="text-xs font-bold font-sans">
                App created by Philip
              </p>
              <p className="text-[10px] font-mono text-zinc-300">
                Questions or feedback? Contact Philip:{' '}
                <a
                  href="mailto:philip.stade@gmail.com"
                  className="text-indigo-300 hover:text-indigo-200 underline font-bold transition-colors"
                >
                  philip.stade@gmail.com
                </a>
                {' / '}
                <a
                  href="mailto:p.stade@mh-freiburg.de"
                  className="text-indigo-300 hover:text-indigo-200 underline transition-colors"
                >
                  p.stade@mh-freiburg.de
                </a>
              </p>
            </div>

            <div className="space-y-4 text-xs text-zinc-600 font-sans leading-relaxed">
              <p>
                Welcome to <strong className="text-zinc-900 font-semibold">sound_play</strong>, an interactive 3D spatial soundscape designer and acoustic canvas.
              </p>

              {/* NAVIGATION */}
              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-1.5 font-mono text-[10px]">
                <div className="font-extrabold text-zinc-900 text-[11px] font-sans">NAVIGATION CONTROLS:</div>
                <div>• <kbd className="px-1 py-0.5 border rounded-sm bg-white shadow-xs">W</kbd> / <kbd className="px-1 py-0.5 border rounded-sm bg-white shadow-xs">S</kbd> / <kbd className="px-1 py-0.5 border rounded-sm bg-white shadow-xs">↑</kbd> / <kbd className="px-1 py-0.5 border rounded-sm bg-white shadow-xs">↓</kbd> : Move Forward / Backward</div>
                <div>• <kbd className="px-1 py-0.5 border rounded-sm bg-white shadow-xs">A</kbd> / <kbd className="px-1 py-0.5 border rounded-sm bg-white shadow-xs">D</kbd> / <kbd className="px-1 py-0.5 border rounded-sm bg-white shadow-xs">←</kbd> / <kbd className="px-1 py-0.5 border rounded-sm bg-white shadow-xs">→</kbd> : Strafe Left / Right</div>
                <div>• <strong>Drag Canvas / Mouse Look:</strong> Rotate perspective in 360 degrees.</div>
                <div>• <strong>Mobile Touch:</strong> Drag the touch joystick at the bottom-left of the screen.</div>
              </div>

              {/* ACOUSTIC EFFECTS & DSP GUIDE */}
              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2">
                <div className="font-extrabold text-zinc-900 text-[11px] font-mono uppercase tracking-wider">ACOUSTIC EFFECTS & DSP ENGINE:</div>
                <div className="space-y-2 text-[11px] leading-normal">
                  <div>
                    <strong className="text-zinc-900 font-bold">1. Space Reverb:</strong> Simulates acoustic room reflections (Short, Medium, Long Reverb) with adjustable Wetness percentage. Creates expanding 3D ground ripples and radial shockwave spokes.
                  </div>
                  <div>
                    <strong className="text-zinc-900 font-bold">2. Echo Loop (Delay):</strong> Pitch-synchronized feedback delay. Customize Delay Time (seconds) and Feedback intensity. Features 3D winding helix coils and orbiting echo satellites.
                  </div>
                  <div>
                    <strong className="text-zinc-900 font-bold">3. Filter EQ:</strong> Toggle Lowpass (attenuates highs for warm submerged depth with a protective dome) or Highpass (cuts lows for crisp focus with an upward energy beam).
                  </div>
                  <div>
                    <strong className="text-zinc-900 font-bold">4. Doppler Pitch Effect:</strong> Simulates physical wave compression/expansion, shifting sound pitch dynamically as you walk towards or away from moving audio nodes.
                  </div>
                </div>
              </div>

              {/* 3D NODE CUSTOMIZATION & CONTROLS */}
              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2">
                <div className="font-extrabold text-zinc-900 text-[11px] font-mono uppercase tracking-wider">NODE CUSTOMIZATION & FUNCTIONS:</div>
                <div className="space-y-1.5 text-[11px] leading-normal">
                  <div>• <strong className="text-zinc-900">3D Primitive Geometries:</strong> Morph nodes into Spheres, Cubes, Pyramids, Tori, or Cylinders.</div>
                  <div>• <strong className="text-zinc-900">Aura Accent Colors:</strong> Personalize individual node aura hues and ambient ground glow reflections.</div>
                  <div>• <strong className="text-zinc-900">3D Spatial Panning:</strong> Click and drag nodes directly on the 3D grid or use distance attenuation sliders.</div>
                  <div>• <strong className="text-zinc-900">Mute & Solo Controls:</strong> Focus on individual tracks or isolate spatial layers.</div>
                </div>
              </div>

              {/* AUDIO SOURCES & RECORDING */}
              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2">
                <div className="font-extrabold text-zinc-900 text-[11px] font-mono uppercase tracking-wider">AUDIO SOURCES & RECORDING:</div>
                <div className="space-y-1.5 text-[11px] leading-normal">
                  <div>• <strong className="text-zinc-900">Procedural Synthesizers:</strong> Birds (North), Bees (East), Rain & Thunder (South), Constant Frequency (West).</div>
                  <div>• <strong className="text-zinc-900">Custom Audio Uploads:</strong> Full iOS & desktop support for `.wav`, `.mp3`, `.m4a`, `.aac`, `.flac`, `.ogg` files (up to 50 MB).</div>
                  <div>• <strong className="text-zinc-900">Live Microphone:</strong> Sample ambient audio or live vocals directly into spatial sound nodes.</div>
                  <div>• <strong className="text-zinc-900">Master Performance Recorder:</strong> Capture binaural audio sessions and export downloadable master tracks.</div>
                </div>
              </div>

              {/* DATA PRIVACY & GDPR COMPLIANCE */}
              <div className="p-3.5 bg-zinc-900 text-zinc-100 rounded-xl border border-zinc-950 space-y-2 font-sans">
                <div className="font-extrabold text-amber-400 text-[11px] font-mono uppercase tracking-wider flex items-center gap-1.5">
                  <span>🔒</span> DATA PRIVACY & GDPR COMPLIANCE:
                </div>
                <div className="space-y-2 text-[11px] leading-relaxed text-zinc-300">
                  <p>
                    <strong className="text-white">100% Self-Contained:</strong> All fonts, icons, scripts, and audio synthesis algorithms are bundled locally with zero external network requests. No third-party trackers, analytics, or remote API calls are executed.
                  </p>
                  <p>
                    <strong className="text-white">Client-Side Audio & Local Storage:</strong> Uploaded audio files and microphone samples are processed entirely within your browser's Web Audio engine and stored locally on your device in IndexedDB. No audio is ever transmitted to or stored on any remote server.
                  </p>
                  <p className="text-zinc-400">
                    <strong className="text-zinc-200">Static Hosting:</strong> Served as a static web application via Vercel / CDN. Server processing is limited to standard HTTP network headers (IP address, user agent) solely for edge delivery and security. No cookies are used to track users.
                  </p>
                </div>
              </div>
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

      {/* 8. DATA PRIVACY & BROWSER STORAGE BANNER */}
      {showCookieBanner && (
        <div className="fixed bottom-4 left-4 right-4 md:left-6 md:right-auto md:max-w-md bg-zinc-950/95 backdrop-blur-xl text-zinc-100 p-4.5 rounded-2xl border border-zinc-800 shadow-2xl z-50 animate-slide-up flex flex-col gap-3 select-none">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-base">🔒</span>
              <p className="text-xs font-bold tracking-tight text-white font-sans">
                Privacy & Local Storage
              </p>
            </div>
            <button
              onClick={handleAcceptCookies}
              className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 text-xs font-mono transition-colors cursor-pointer"
              title="Dismiss banner"
            >
              ✕
            </button>
          </div>

          <div className="text-[11px] text-zinc-300 leading-relaxed font-sans space-y-2 bg-zinc-900/80 p-3 rounded-xl border border-zinc-800/80">
            <p>
              <strong className="text-white">Self-Contained & Private:</strong> This application is fully self-contained. All fonts and assets are hosted locally, and no third-party trackers or external requests are made.
            </p>
            <p>
              <strong className="text-white">Local Device Storage:</strong> Your custom audio uploads, recordings, and soundscape coordinates are processed and stored <strong>100% locally on your device</strong> using browser IndexedDB. No audio data ever leaves your computer or phone.
            </p>
            <p className="text-zinc-400">
              <strong className="text-zinc-300">Hosting:</strong> Served as static assets via CDN. Vercel processes only standard HTTP connection logs for edge routing and DDoS prevention. No tracking cookies are used.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-0.5">
            <button
              id="accept-cookies-btn"
              onClick={handleAcceptCookies}
              className="w-full sm:w-auto bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-extrabold uppercase tracking-wider px-4 py-2 rounded-xl cursor-pointer transition-all text-center border border-zinc-100 shadow-md"
            >
              Got it, Continue
            </button>
          </div>
        </div>
      )}

      {/* 9. INLINE TOAST NOTIFICATIONS */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
