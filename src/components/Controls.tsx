import React, { useRef } from 'react';
import {
  ListMusic,
  Radio,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  RotateCcw,
  HelpCircle,
  Upload,
  Mic,
  Square,
  X,
  MapPin,
  Trash2,
  Check,
  Sparkles
} from 'lucide-react';
import { SoundSource, CameraState, SoundType } from '../types';
import Joystick from './Joystick';
import { useMicRecorder } from '../hooks/useMicRecorder';
import { AUDIO_INPUT_ACCEPT, validateAudioUpload, extractSoundName } from '../lib/audioValidation';

interface ControlsProps {
  sounds: SoundSource[];
  camera: CameraState;
  isDay: boolean;
  onToggleDay: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onResetCamera: () => void;
  onOpenHelp: () => void;
  showSoundList: boolean;
  onToggleSoundList: () => void;
  showRecorder: boolean;
  onToggleRecorder: () => void;
  isRecordingPerformance: boolean;
  selectedSoundId: string | null;
  onSelectSound: (id: string | null) => void;
  onUpdateSound: (id: string, updates: Partial<SoundSource>) => void;
  onTeleportTo: (x: number, z: number) => void;
  onDeleteSound: (id: string) => void;
  onAddSound: (type: SoundType, name: string, file?: File) => void;
  onAddRecordedSound: (file: File) => void;
  onJoystickMove: (vector: { x: number; z: number }) => void;
  onError: (message: string) => void;
}

export const Controls: React.FC<ControlsProps> = ({
  sounds,
  camera,
  isDay,
  onToggleDay,
  isMuted,
  onToggleMute,
  onResetCamera,
  onOpenHelp,
  showSoundList,
  onToggleSoundList,
  showRecorder,
  onToggleRecorder,
  isRecordingPerformance,
  selectedSoundId,
  onSelectSound,
  onUpdateSound,
  onTeleportTo,
  onDeleteSound,
  onAddSound,
  onAddRecordedSound,
  onJoystickMove,
  onError
}) => {
  const topFileInputRef = useRef<HTMLInputElement>(null);

  const {
    isRecordingMic,
    micSeconds,
    micError,
    startMicRecording,
    stopMicRecording
  } = useMicRecorder({ onRecordingComplete: onAddRecordedSound });

  const handleSliderKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
      e.preventDefault();
    }
  };

  const handleTopFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const validation = validateAudioUpload(file);
    if (!validation.valid) {
      if (validation.error) {
        onError(validation.error);
      }
      if (topFileInputRef.current) {
        topFileInputRef.current.value = '';
      }
      return;
    }

    const name = extractSoundName(file.name);
    onAddSound('uploaded', name, file);
    if (topFileInputRef.current) {
      topFileInputRef.current.value = '';
    }
  };

  const selectedSound = selectedSoundId ? sounds.find((s) => s.id === selectedSoundId) : null;

  return (
    <>
      {/* 1. TOP HEADER NAVIGATION BAR */}
      <header className="absolute top-4 left-4 right-4 z-20 flex justify-between items-center pointer-events-none select-none">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-2 pointer-events-auto bg-zinc-950/85 backdrop-blur-md px-3.5 py-2 rounded-xl border border-zinc-800 shadow-xl">
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-4 bg-indigo-500 rounded-full animate-pulse" />
            <span className="w-1.5 h-2.5 bg-rose-500 rounded-full" />
            <span className="w-1.5 h-5 bg-emerald-500 rounded-full" />
          </div>
          <div>
            <h1 className="text-xs font-black tracking-tight text-white font-sans uppercase">
              sound_play
            </h1>
            <p className="text-[8px] font-mono text-amber-400 font-bold tracking-wider uppercase">
              spatial designer
            </p>
          </div>
        </div>

        {/* Action Controls cluster */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* Sounds menu toggle */}
          <button
            id="sidebar-toggle-btn"
            onClick={onToggleSoundList}
            className={`p-2 rounded-lg border transition-all duration-150 cursor-pointer shadow-sm flex items-center gap-1.5 ${
              showSoundList
                ? 'bg-zinc-100 text-zinc-950 border-zinc-300 font-bold scale-[1.02]'
                : 'bg-zinc-900/90 hover:bg-zinc-800 border-zinc-800 text-zinc-200'
            }`}
            title="Toggle Sound Sources Menu"
          >
            <ListMusic className="w-4 h-4 text-indigo-400" />
            <span className="text-[10px] font-mono font-bold hidden sm:inline">SOURCES</span>
            {sounds.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
            )}
          </button>

          {/* Performance Recorder toggle */}
          <button
            id="recorder-toggle-btn"
            onClick={onToggleRecorder}
            className={`p-2 rounded-lg border transition-all duration-150 cursor-pointer shadow-sm flex items-center gap-1.5 ${
              isRecordingPerformance
                ? 'bg-red-600 text-white border-red-500 font-bold scale-[1.02] animate-pulse shadow-red-500/30 shadow-lg'
                : showRecorder
                  ? 'bg-red-950/90 text-red-400 border-red-800 font-bold scale-[1.02]'
                  : 'bg-zinc-900/90 hover:bg-zinc-800 border-zinc-800 text-zinc-200'
            }`}
            title={isRecordingPerformance ? 'Recording active! Click to Stop and Export' : 'Toggle Performance Recorder'}
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
            onClick={onToggleMute}
            className={`p-2 rounded-lg border transition-all duration-150 cursor-pointer shadow-2xs ${
              isMuted
                ? 'bg-red-950/85 text-red-400 border-red-800 hover:bg-red-900/80'
                : 'bg-zinc-900/90 hover:bg-zinc-800 border-zinc-800 text-zinc-200'
            }`}
            title={isMuted ? 'Unmute system' : 'Mute system'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Day / Night Toggle */}
          <button
            id="day-night-toggle-btn"
            onClick={onToggleDay}
            className="p-2 rounded-lg border border-zinc-800 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
            title={isDay ? 'Switch to Night' : 'Switch to Day'}
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
            onClick={onResetCamera}
            className="p-2 rounded-lg border border-zinc-800 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 transition-all cursor-pointer shadow-2xs"
            title="Reset coordinates"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Help info overlay trigger */}
          <button
            id="help-trigger-btn"
            onClick={onOpenHelp}
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

      {/* 2. TOUCH JOYSTICK (Bottom-Left) */}
      <div className="absolute bottom-6 left-6 z-10 block pointer-events-auto">
        <Joystick onMove={onJoystickMove} />
      </div>

      {/* 3. CONTENT CREATION BUTTON CLUSTER (Bottom-Right) */}
      <div className="absolute bottom-6 right-6 z-30 flex items-center gap-2 pointer-events-auto select-none">
        {/* DIRECT UPLOAD BUTTON */}
        <div className="relative">
          <input
            ref={topFileInputRef}
            id="top-audio-file-upload"
            type="file"
            accept={AUDIO_INPUT_ACCEPT}
            onChange={handleTopFileUpload}
            className="hidden"
          />
          <button
            id="top-trigger-upload-btn"
            onClick={() => {
              if (topFileInputRef.current) {
                topFileInputRef.current.value = '';
                topFileInputRef.current.click();
              }
            }}
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
              <span className="text-[10px] font-mono font-extrabold tracking-wider">
                STOP ({micSeconds}s)
              </span>
            </button>
          )}
        </div>
      </div>

      {/* 4. SELECTED SOUND INSPECTOR CARD */}
      {selectedSound && (
        <div className="absolute bottom-16 sm:bottom-22 right-3 sm:right-6 z-20 max-w-[calc(100vw-24px)] sm:max-w-xs w-full pointer-events-auto">
          {(() => {
            const dx = selectedSound.x - camera.x;
            const dz = selectedSound.z - camera.z;
            const d = Math.sqrt(dx * dx + dz * dz).toFixed(1);

            return (
              <div
                id="inspector-overlay-card"
                className="p-4 bg-white border-2 border-zinc-950 shadow-2xl rounded-2xl flex flex-col gap-2.5 max-h-[calc(100vh-100px)] sm:max-h-[calc(100vh-130px)] overflow-y-auto overscroll-contain"
              >
                <div className="sticky -top-4 -mt-4 -mx-4 p-4 pb-2.5 bg-white/95 backdrop-blur-md z-20 border-b border-zinc-200 flex items-start justify-between gap-3 rounded-t-2xl shadow-2xs">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-zinc-400 font-mono uppercase tracking-widest mb-1">
                      Active Sound Selected
                    </p>
                    <input
                      type="text"
                      value={selectedSound.name}
                      onChange={(e) => onUpdateSound(selectedSound.id, { name: e.target.value })}
                      className="text-xs font-bold text-zinc-900 tracking-tight font-sans bg-zinc-50 border border-zinc-200 hover:border-zinc-400 focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950 px-2 py-1 rounded-lg w-full transition-all focus:outline-hidden"
                      placeholder="Rename sound source..."
                    />
                  </div>
                  <button
                    id="close-inspector-btn"
                    onClick={() => onSelectSound(null)}
                    className="p-1.5 -mr-1 -mt-0.5 text-zinc-600 hover:text-zinc-950 bg-zinc-100 hover:bg-zinc-200 active:bg-zinc-300 rounded-lg cursor-pointer shrink-0 transition-all flex items-center justify-center border border-zinc-300"
                    title="Close popup"
                    aria-label="Close sound inspector"
                  >
                    <X className="w-4 h-4 stroke-[2.5]" />
                  </button>
                </div>

                <div className="text-[11px] text-zinc-500 font-mono space-y-1 bg-zinc-50 p-2 rounded-lg border border-zinc-150">
                  <div className="flex justify-between">
                    <span>Coordinate:</span>
                    <span className="text-zinc-700">
                      ({selectedSound.x.toFixed(1)}, {selectedSound.z.toFixed(1)})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Distance:</span>
                    <span className="text-zinc-700 font-bold">{d} meters</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Status:</span>
                    <span className={`font-semibold ${selectedSound.isPlaying ? 'text-green-600' : 'text-zinc-400'}`}>
                      {selectedSound.isPlaying ? 'ACTIVE LOOP' : 'PAUSED'}
                    </span>
                  </div>
                </div>

                {/* Direct Node Volume Adjuster Slider */}
                <div className="flex flex-col gap-1.5 p-1 border border-zinc-100 rounded-lg bg-zinc-50/50">
                  <div className="flex justify-between items-center text-[9px] font-bold text-zinc-400 font-mono uppercase tracking-wider">
                    <span>Volume ({Math.round(selectedSound.volume * 100)}%)</span>
                    <span className="text-zinc-400 font-medium">Scroll node to tune</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <VolumeX className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={selectedSound.volume}
                      onChange={(e) => onUpdateSound(selectedSound.id, { volume: parseFloat(e.target.value) })}
                      onKeyDown={handleSliderKeyDown}
                      className="flex-1 accent-zinc-950 h-1 bg-zinc-200 rounded-lg cursor-pointer appearance-none"
                    />
                    <Volume2 className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                  </div>
                </div>

                {/* Per-Node Acoustics & Effects Panel */}
                <div className="border-t border-zinc-150 pt-2.5 space-y-2">
                  <p className="text-[10px] font-bold text-zinc-400 font-mono uppercase tracking-wider">
                    Node Acoustic Effects
                  </p>

                  {/* 1. Reverb Config */}
                  <div className="p-1.5 rounded-lg border border-zinc-100 bg-zinc-50/60 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono font-bold text-zinc-600 uppercase">Space Reverb</span>
                      <select
                        value={selectedSound.reverbType || 'none'}
                        onChange={(e) => onUpdateSound(selectedSound.id, { reverbType: e.target.value as any })}
                        className="text-[9px] font-mono bg-white border border-zinc-200 rounded-md px-1.5 py-0.5 focus:outline-hidden font-bold cursor-pointer"
                      >
                        <option value="none">None (Dry)</option>
                        <option value="short">Short Reverb</option>
                        <option value="long">Long Reverb</option>
                      </select>
                    </div>
                    {selectedSound.reverbType && selectedSound.reverbType !== 'none' && (
                      <div className="space-y-1 pl-1">
                        <div className="flex justify-between text-[8px] font-mono text-zinc-400">
                          <span>Wetness</span>
                          <span>
                            {Math.round(
                              (selectedSound.reverbWetness !== undefined ? selectedSound.reverbWetness : 0.3) * 100
                            )}
                            %
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={selectedSound.reverbWetness !== undefined ? selectedSound.reverbWetness : 0.3}
                          onChange={(e) => onUpdateSound(selectedSound.id, { reverbWetness: parseFloat(e.target.value) })}
                          onKeyDown={handleSliderKeyDown}
                          className="w-full accent-zinc-950 h-1 bg-zinc-200 rounded-lg cursor-pointer appearance-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* 2. Echo / Delay Config */}
                  <div className="p-1.5 rounded-lg border border-zinc-100 bg-zinc-50/60 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono font-bold text-zinc-600 uppercase">
                        Echo Loop (Delay)
                      </span>
                      <input
                        type="checkbox"
                        checked={!!selectedSound.delayEnabled}
                        onChange={(e) => onUpdateSound(selectedSound.id, { delayEnabled: e.target.checked })}
                        className="w-3.5 h-3.5 rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950 cursor-pointer"
                      />
                    </div>
                    {selectedSound.delayEnabled && (
                      <div className="space-y-1.5 pl-1">
                        <div className="space-y-0.5">
                          <div className="flex justify-between text-[8px] font-mono text-zinc-400">
                            <span>Delay Time</span>
                            <span>
                              {(selectedSound.delayTime !== undefined ? selectedSound.delayTime : 0.3).toFixed(1)}s
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="1.0"
                            step="0.05"
                            value={selectedSound.delayTime !== undefined ? selectedSound.delayTime : 0.3}
                            onChange={(e) => onUpdateSound(selectedSound.id, { delayTime: parseFloat(e.target.value) })}
                            onKeyDown={handleSliderKeyDown}
                            className="w-full accent-zinc-950 h-1 bg-zinc-200 rounded-lg cursor-pointer appearance-none"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex justify-between text-[8px] font-mono text-zinc-400">
                            <span>Feedback</span>
                            <span>
                              {Math.round(
                                (selectedSound.delayFeedback !== undefined ? selectedSound.delayFeedback : 0.4) * 100
                              )}
                              %
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0.0"
                            max="0.9"
                            step="0.05"
                            value={selectedSound.delayFeedback !== undefined ? selectedSound.delayFeedback : 0.4}
                            onChange={(e) => onUpdateSound(selectedSound.id, { delayFeedback: parseFloat(e.target.value) })}
                            onKeyDown={handleSliderKeyDown}
                            className="w-full accent-zinc-950 h-1 bg-zinc-200 rounded-lg cursor-pointer appearance-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 3. Filter EQ Config */}
                  <div className="p-1.5 rounded-lg border border-zinc-100 bg-zinc-50/60 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono font-bold text-zinc-600 uppercase">Filter EQ</span>
                      <select
                        value={selectedSound.filterType || 'none'}
                        onChange={(e) => onUpdateSound(selectedSound.id, { filterType: e.target.value as any })}
                        className="text-[9px] font-mono bg-white border border-zinc-200 rounded-md px-1.5 py-0.5 focus:outline-hidden font-bold cursor-pointer"
                      >
                        <option value="none">Bypass</option>
                        <option value="lowpass">Low-Pass</option>
                        <option value="highpass">High-Pass</option>
                      </select>
                    </div>
                    {selectedSound.filterType && selectedSound.filterType !== 'none' && (
                      <div className="space-y-1 pl-1">
                        <div className="flex justify-between text-[8px] font-mono text-zinc-400">
                          <span>Frequency</span>
                          <span>
                            {selectedSound.filterFrequency !== undefined ? selectedSound.filterFrequency : 1000} Hz
                          </span>
                        </div>
                        <input
                          type="range"
                          min="100"
                          max="6000"
                          step="50"
                          value={selectedSound.filterFrequency !== undefined ? selectedSound.filterFrequency : 1000}
                          onChange={(e) =>
                            onUpdateSound(selectedSound.id, { filterFrequency: parseInt(e.target.value) })
                          }
                          onKeyDown={handleSliderKeyDown}
                          className="w-full accent-zinc-950 h-1 bg-zinc-200 rounded-lg cursor-pointer appearance-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* 4. Doppler Pitch Shifter Config */}
                  <div className="p-1.5 rounded-lg border border-zinc-100 bg-zinc-50/60 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono font-bold text-zinc-600 uppercase">
                        Doppler (Motion Pitch)
                      </span>
                      <input
                        type="checkbox"
                        checked={!!selectedSound.dopplerEnabled}
                        onChange={(e) => onUpdateSound(selectedSound.id, { dopplerEnabled: e.target.checked })}
                        className="w-3.5 h-3.5 rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950 cursor-pointer"
                      />
                    </div>
                    {selectedSound.dopplerEnabled && (
                      <div className="space-y-1 pl-1">
                        <div className="flex justify-between text-[8px] font-mono text-zinc-400">
                          <span>Pitch Intensity</span>
                          <span>
                            {(selectedSound.dopplerFactor !== undefined ? selectedSound.dopplerFactor : 1.0).toFixed(1)}
                            x
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="5.0"
                          step="0.1"
                          value={selectedSound.dopplerFactor !== undefined ? selectedSound.dopplerFactor : 1.0}
                          onChange={(e) =>
                            onUpdateSound(selectedSound.id, { dopplerFactor: parseFloat(e.target.value) })
                          }
                          onKeyDown={handleSliderKeyDown}
                          className="w-full accent-zinc-950 h-1 bg-zinc-200 rounded-lg cursor-pointer appearance-none"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* 3D Node Shape Picker */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-[9px] font-bold text-zinc-400 font-mono uppercase tracking-wider">
                    3D Node Shape
                  </p>
                  <div className="grid grid-cols-5 gap-1">
                    {(['sphere', 'cube', 'pyramid', 'torus', 'cylinder'] as const).map((shape) => (
                      <button
                        key={shape}
                        onClick={() => onUpdateSound(selectedSound.id, { nodeShape: shape })}
                        className={`py-1 rounded-md text-[9px] font-mono border transition-all cursor-pointer capitalize text-center leading-none ${
                          (selectedSound.nodeShape || 'sphere') === shape
                            ? 'bg-zinc-950 text-white border-zinc-950 shadow-xs font-bold'
                            : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-600 border-zinc-200'
                        }`}
                        title={`Set shape to ${shape}`}
                      >
                        {shape.substring(0, 4)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Aura Color Accent Selector */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-[9px] font-bold text-zinc-400 font-mono uppercase tracking-wider">
                    Aura Color Accent
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {[
                      { value: '#577E89', name: 'Smalt Blue' },
                      { value: '#DEC484', name: 'Calico' },
                      { value: '#E1A36F', name: 'Harvest' },
                      { value: '#6F9F9C', name: 'Nymph' },
                      { value: '#E2D8A5', name: 'Hampton' },
                      { value: '#EC4899', name: 'Hot Pink' },
                      { value: '#8B5CF6', name: 'Purple' },
                      { value: '#10B981', name: 'Emerald' }
                    ].map((colorOpt) => (
                      <button
                        key={colorOpt.value}
                        onClick={() => onUpdateSound(selectedSound.id, { nodeColor: colorOpt.value })}
                        className={`w-5.5 h-5.5 rounded-full border transition-all cursor-pointer flex items-center justify-center relative ${
                          selectedSound.nodeColor === colorOpt.value ||
                          (!selectedSound.nodeColor &&
                            colorOpt.value ===
                              (selectedSound.soundType === 'north'
                                ? '#577E89'
                                : selectedSound.soundType === 'east'
                                  ? '#DEC484'
                                  : selectedSound.soundType === 'south'
                                    ? '#E1A36F'
                                    : selectedSound.soundType === 'west'
                                      ? '#6F9F9C'
                                      : '#E2D8A5'))
                            ? 'scale-110 ring-2 ring-zinc-950 ring-offset-1 border-transparent'
                            : 'border-zinc-300 hover:scale-105'
                        }`}
                        style={{ backgroundColor: colorOpt.value }}
                        title={colorOpt.name}
                      >
                        {(selectedSound.nodeColor === colorOpt.value ||
                          (!selectedSound.nodeColor &&
                            colorOpt.value ===
                              (selectedSound.soundType === 'north'
                                ? '#577E89'
                                : selectedSound.soundType === 'east'
                                  ? '#DEC484'
                                  : selectedSound.soundType === 'south'
                                    ? '#E1A36F'
                                    : selectedSound.soundType === 'west'
                                      ? '#6F9F9C'
                                      : '#E2D8A5'))) && (
                          <Check className="w-3 h-3 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]" />
                        )}
                      </button>
                    ))}

                    {/* Native dynamic color wheel picker */}
                    <div
                      className="relative w-5.5 h-5.5 rounded-full border border-zinc-300 overflow-hidden cursor-pointer hover:scale-105 flex items-center justify-center bg-conic-rainbow"
                      title="Custom color picker"
                    >
                      <input
                        type="color"
                        value={selectedSound.nodeColor || '#577E89'}
                        onChange={(e) => onUpdateSound(selectedSound.id, { nodeColor: e.target.value })}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                      <Sparkles className="w-3 h-3 text-zinc-500 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="flex gap-1.5 mt-1">
                  <button
                    id="inspector-mute-btn"
                    onClick={() => onUpdateSound(selectedSound.id, { isPlaying: !selectedSound.isPlaying })}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      selectedSound.isPlaying
                        ? 'bg-zinc-100 text-zinc-800 border-zinc-200 hover:bg-zinc-200'
                        : 'bg-zinc-900 text-white border-zinc-950 hover:bg-zinc-800'
                    }`}
                  >
                    {selectedSound.isPlaying ? 'Mute' : 'Activate'}
                  </button>
                  <button
                    id="inspector-tp-btn"
                    onClick={() => onTeleportTo(selectedSound.x, selectedSound.z)}
                    className="px-3 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors flex items-center justify-center cursor-pointer border border-zinc-950"
                    title="Teleport to source"
                  >
                    <MapPin className="w-4 h-4" />
                  </button>
                  <button
                    id="inspector-del-btn"
                    onClick={() => onDeleteSound(selectedSound.id)}
                    className="px-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors border border-red-200 flex items-center justify-center cursor-pointer"
                    title="Delete source"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </>
  );
};

export default Controls;
