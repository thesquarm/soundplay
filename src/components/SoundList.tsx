import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Trash2, MapPin, Volume2, Plus, Upload, Music, Mic, Square } from 'lucide-react';
import { SoundSource, SoundType } from '../types';
import { audioService } from '../audioEngine';

interface SoundListProps {
  sounds: SoundSource[];
  listenerPos: { x: number; z: number };
  onUpdateSound: (id: string, updates: Partial<SoundSource>) => void;
  onDeleteSound: (id: string) => void;
  onAddSound: (type: SoundType, name: string, file?: File) => void;
  onTeleportTo: (x: number, z: number) => void;
  onClose?: () => void;
}

export default function SoundList({
  sounds,
  listenerPos,
  onUpdateSound,
  onDeleteSound,
  onAddSound,
  onTeleportTo,
  onClose,
}: SoundListProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        const blob = new Blob(micChunksRef.current, { type: 'audio/wav' });
        const file = new File([blob], `mic_recording_${Date.now()}.wav`, { type: 'audio/wav' });
        
        // Spawn node with name "Recorded Sound"
        onAddSound('uploaded', `Recorded Sound #${sounds.length + 1}`, file);

        // Turn off stream tracks to stop mic indicator
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

  // Helper to compute distance
  const getDistance = (sound: SoundSource) => {
    const dx = sound.x - listenerPos.x;
    const dz = sound.z - listenerPos.z;
    return Math.sqrt(dx * dx + dz * dz).toFixed(1);
  };

  // Handle local file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const name = file.name.split('.')[0] || 'Custom Sound';
    
    onAddSound('uploaded', name, file);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-white w-full md:w-80 select-none">
      {/* List Header */}
      <div className="p-4 bg-zinc-50/50 flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900 font-sans flex items-center gap-2">
            <Music className="w-4 h-4 text-zinc-500" />
            Soundscape Sources
          </h2>
          {onClose && (
            <button
              id="close-soundlist-drawer-btn"
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-950 p-1 rounded-lg hover:bg-zinc-150 transition-colors font-bold font-mono text-xs cursor-pointer"
              title="Close Panel"
            >
              ✕
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          Adjust, mute, teleport, or append custom audio nodes below.
        </p>
      </div>

      {/* Dynamic List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {sounds.length === 0 ? (
          <div className="text-center py-8 rounded-lg bg-zinc-50/50">
            <p className="text-xs text-zinc-400">No active sounds in the world</p>
          </div>
        ) : (
          sounds.map((sound) => {
            const distance = getDistance(sound);
            const isNear = parseFloat(distance) < 2.5;

            return (
              <div
                key={sound.id}
                id={`sound-card-${sound.id}`}
                className={`p-3 rounded-xl border transition-all duration-200 bg-white ${
                  isNear 
                    ? 'border-zinc-900 shadow-xs ring-1 ring-zinc-950/5' 
                    : 'border-zinc-200 hover:border-zinc-400'
                }`}
              >
                {/* Title & Type */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-900 truncate font-sans">
                      {sound.name}
                    </p>
                    <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-mono mt-0.5">
                      {sound.soundType}
                    </p>
                  </div>
                  
                  {/* Action row */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Teleport */}
                    <button
                      id={`teleport-btn-${sound.id}`}
                      onClick={() => onTeleportTo(sound.x, sound.z)}
                      title="Teleport to sound"
                      className="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete */}
                    <button
                      id={`delete-btn-${sound.id}`}
                      onClick={() => onDeleteSound(sound.id)}
                      title="Remove sound source"
                      className="p-1.5 rounded-md hover:bg-red-50 text-zinc-400 hover:text-red-600 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* State Controls (volume, play/pause, distance) */}
                <div className="mt-3 flex items-center justify-between gap-4">
                  {/* Play/Pause toggle */}
                  <button
                    id={`toggle-play-${sound.id}`}
                    onClick={() => onUpdateSound(sound.id, { isPlaying: !sound.isPlaying })}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                      sound.isPlaying
                        ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                        : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                    }`}
                  >
                    {sound.isPlaying ? (
                      <>
                        <Pause className="w-2.5 h-2.5" /> Paused
                      </>
                    ) : (
                      <>
                        <Play className="w-2.5 h-2.5" /> Playing
                      </>
                    )}
                  </button>

                  {/* Distance display */}
                  <span className="text-[10px] font-mono text-zinc-400">
                    dist: <strong className="text-zinc-600 font-medium">{distance}m</strong>
                  </span>
                </div>

                {/* Volume Slider */}
                {sound.isPlaying && (
                  <div className="mt-3 flex items-center gap-2">
                    <Volume2 className="w-3 h-3 text-zinc-400 shrink-0" />
                    <input
                      id={`volume-slider-${sound.id}`}
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={sound.volume}
                      onChange={(e) => onUpdateSound(sound.id, { volume: parseFloat(e.target.value) })}
                      className="w-full h-1 bg-zinc-100 rounded-lg appearance-none cursor-pointer accent-zinc-800"
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add Sound Panel */}
      <div className="p-4 space-y-3 bg-zinc-50/50">
        <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
          Create Sound Node
        </h3>
        
        {/* Presets Grid */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            id="add-north-btn"
            onClick={() => onAddSound('north', 'Forest Birds')}
            className="flex flex-col items-center justify-center p-2 rounded-lg border border-zinc-200 hover:border-[#577E89] bg-[#577E89]/5 hover:bg-[#577E89]/10 transition-all cursor-pointer text-center"
          >
            <span className="text-[10px] font-semibold text-zinc-700">▲ North (Smalt Blue)</span>
          </button>
          <button
            id="add-east-btn"
            onClick={() => onAddSound('east', 'Honeybees')}
            className="flex flex-col items-center justify-center p-2 rounded-lg border border-zinc-200 hover:border-[#DEC484] bg-[#DEC484]/5 hover:bg-[#DEC484]/10 transition-all cursor-pointer text-center"
          >
            <span className="text-[10px] font-semibold text-zinc-700">▶ East (Calico)</span>
          </button>
          <button
            id="add-south-btn"
            onClick={() => onAddSound('south', 'Rain & Thunder')}
            className="flex flex-col items-center justify-center p-2 rounded-lg border border-zinc-200 hover:border-[#E1A36F] bg-[#E1A36F]/5 hover:bg-[#E1A36F]/10 transition-all cursor-pointer text-center"
          >
            <span className="text-[10px] font-semibold text-zinc-700">▼ South (Harvest Gold)</span>
          </button>
          <button
            id="add-west-btn"
            onClick={() => onAddSound('west', 'Hearing Resonance')}
            className="flex flex-col items-center justify-center p-2 rounded-lg border border-zinc-200 hover:border-[#6F9F9C] bg-[#6F9F9C]/5 hover:bg-[#6F9F9C]/10 transition-all cursor-pointer text-center"
          >
            <span className="text-[10px] font-semibold text-zinc-700">◀ West (Sea Nymph)</span>
          </button>
        </div>

        {/* Upload Custom File button */}
        <div className="relative">
          <input
            ref={fileInputRef}
            id="audio-file-upload"
            type="file"
            accept="audio/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            id="trigger-upload-btn"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 border border-zinc-300 rounded-lg bg-white hover:bg-zinc-50 text-xs font-medium text-zinc-700 hover:border-zinc-900 shadow-2xs transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-zinc-500" />
            Upload Sound File
          </button>
        </div>

        {/* Live Microphone Recording Option */}
        <div className="pt-3 mt-1">
          {!isRecordingMic ? (
            <button
              id="start-mic-record-btn"
              onClick={startMicRecording}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 border border-red-200 rounded-lg bg-red-50/50 hover:bg-red-50 text-xs font-semibold text-red-700 hover:border-red-400 shadow-2xs transition-colors cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5 text-red-500" />
              Record Live Audio (Mic)
            </button>
          ) : (
            <button
              id="stop-mic-record-btn"
              onClick={stopMicRecording}
              className="w-full flex items-center justify-between gap-2 py-2 px-3 border border-red-600 rounded-lg bg-red-600 text-xs font-bold text-white shadow-sm hover:bg-red-700 transition-colors cursor-pointer animate-pulse"
            >
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                Recording Mic ({micSeconds}s)...
              </span>
              <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-mono">
                <Square className="w-3 h-3 fill-white text-white" /> Stop
              </span>
            </button>
          )}

          {micError && (
            <p className="text-[10px] text-red-500 mt-1.5 text-center font-medium">
              ⚠️ {micError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
