import React from 'react';
import { Volume2, Play, Keyboard, Move, Eye, Music, ChevronRight } from 'lucide-react';

interface HelpModalProps {
  onStart: () => void;
}

export default function HelpModal({ onStart }: HelpModalProps) {
  return (
    <div className="fixed inset-0 bg-[#0c0c0e] z-50 flex items-center justify-center p-4 overflow-y-auto select-none">
      <div className="max-w-xl w-full border border-zinc-850 rounded-2xl p-6 md:p-8 bg-zinc-900/90 backdrop-blur-md shadow-2xl flex flex-col gap-6">
        
        {/* Title */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center p-3 rounded-full border border-zinc-800 mb-4 animate-pulse">
            <Volume2 className="w-8 h-8 text-zinc-100" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tighter text-zinc-50 font-sans uppercase">
            sound_play
          </h1>
          <p className="text-xs font-mono tracking-widest text-zinc-500 uppercase mt-1">
            Immersive 3D Spatial Soundscapes
          </p>
        </div>

        {/* Divider */}
        <hr className="border-zinc-800" />

        {/* Instructions Columns */}
        <div className="space-y-4">
          <h2 className="text-xs font-bold font-mono tracking-wider text-zinc-400 uppercase">
            How to Explore
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Movement */}
            <div className="p-3 border border-zinc-800 rounded-xl space-y-2 bg-zinc-950/40">
              <span className="flex items-center gap-2 text-xs font-semibold text-zinc-100 font-sans">
                <Move className="w-4 h-4 text-zinc-400" /> 4-Way Navigation
              </span>
              <ul className="text-[11px] text-zinc-400 space-y-1 font-mono">
                <li>• <strong className="text-zinc-200">WASD or 4 Arrows</strong> to Walk / Strafe</li>
                <li>• <strong className="text-zinc-200">Joystick</strong> for Mobile/Tablet</li>
                <li>• Perspective is locked looking North</li>
                <li>• No manual rotation is required</li>
              </ul>
            </div>

            {/* Spatial Sound */}
            <div className="p-3 border border-zinc-800 rounded-xl space-y-2 bg-zinc-950/40">
              <span className="flex items-center gap-2 text-xs font-semibold text-zinc-100 font-sans">
                <Music className="w-4 h-4 text-zinc-400" /> Spatial Audio
              </span>
              <p className="text-[11px] leading-relaxed text-zinc-400 font-sans">
                Sound nodes are rendered as <strong className="text-zinc-200">fluffy particle clouds</strong> with Simple Harmonic Longitudinal wave compression.
                Proximity increases amplitude; panning adjusts dynamically as you walk.
              </p>
            </div>
          </div>

          <div className="p-3 border border-zinc-800 rounded-xl space-y-1 bg-zinc-950/40">
            <span className="flex items-center gap-2 text-xs font-semibold text-zinc-100 font-sans">
              <Keyboard className="w-4 h-4 text-zinc-400" /> Interactive controls
            </span>
            <p className="text-[11px] leading-relaxed text-zinc-400 font-sans">
              Click directly on fluffy clouds to select, or use the panel to play, pause, change volumes, upload custom audio clips, or <strong className="text-zinc-200">teleport</strong> instantly! 
              Download high quality soundscapes with video/audio (.mp4) or only audio (.m4a).
            </p>
          </div>
        </div>

        {/* Start Button */}
        <button
          id="btn-start-soundscape"
          onClick={onStart}
          className="w-full flex items-center justify-center gap-2 py-3 bg-zinc-100 hover:bg-white text-zinc-950 font-semibold rounded-xl text-sm transition-all duration-150 transform hover:scale-[1.01] active:scale-95 shadow-md cursor-pointer border border-white"
        >
          Initialize & Start Soundscape
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Subtitle / Tip */}
        <p className="text-[10px] text-center text-zinc-500 font-mono">
          Recommend wearing headphones for the full spatial stereo experience.
        </p>
      </div>
    </div>
  );
}
