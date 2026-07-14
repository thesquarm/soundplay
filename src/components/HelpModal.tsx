import React from 'react';
import { Volume2, ChevronRight, Move, Music, Keyboard } from 'lucide-react';

interface HelpModalProps {
  onStart: () => void;
}

export default function HelpModal({ onStart }: HelpModalProps) {
  return (
    <div className="fixed inset-0 bg-[#0c0c0e] z-50 flex flex-col items-center justify-start sm:justify-center p-4 overflow-y-auto select-none pt-16 sm:pt-4">
      {/* Invitability Background Glows */}
      <div className="absolute top-10 left-10 w-44 h-44 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-56 h-56 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-xl w-full border border-zinc-800 rounded-2xl p-6 md:p-8 bg-zinc-900/90 backdrop-blur-md shadow-2xl flex flex-col gap-6 relative z-10">
        
        {/* Sound Logo from Screenshot */}
        <div className="flex flex-col items-center justify-center text-center select-none">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white font-sans uppercase">
            sound_play
          </h1>
          <p className="text-[10px] md:text-xs font-bold tracking-[0.25em] text-zinc-400 font-mono uppercase mt-2">
            A Live Conversational Sound Improviser
          </p>
          
          {/* Vertical lines and dot logo: | · | */}
          <div className="flex items-center gap-1.5 mt-4">
            <span className="w-1 h-5 bg-white rounded-full opacity-90" />
            <span className="w-1.5 h-1.5 bg-white rounded-full opacity-90" />
            <span className="w-1 h-5 bg-white rounded-full opacity-90" />
          </div>
        </div>

        {/* Divider */}
        <hr className="border-zinc-800" />

        {/* Start Button & Recommendation */}
        <div className="space-y-3">
          <button
            id="btn-start-soundscape"
            onClick={onStart}
            className="w-full flex items-center justify-center gap-2 py-3 bg-zinc-100 hover:bg-white text-zinc-950 font-semibold rounded-xl text-sm transition-all duration-150 transform hover:scale-[1.01] active:scale-95 shadow-md cursor-pointer border border-white"
          >
            Initialize
            <ChevronRight className="w-4 h-4" />
          </button>

          <p className="text-[10px] text-center text-zinc-500 font-mono">
            Recommend wearing headphones for the full spatial stereo experience.
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
                <Move className="w-4 h-4 text-zinc-400" /> Moving Around
              </span>
              <p className="text-[11px] leading-relaxed text-zinc-400 font-sans">
                Use <strong className="text-zinc-200">WASD or Arrow keys</strong> on your keyboard to walk. On phone or tablet, simply use the touch <strong className="text-zinc-200">joystick</strong> on screen.
              </p>
            </div>

            {/* Spatial Sound */}
            <div className="p-3 border border-zinc-800 rounded-xl space-y-2 bg-zinc-950/40">
              <span className="flex items-center gap-2 text-xs font-semibold text-zinc-100 font-sans">
                <Music className="w-4 h-4 text-zinc-400" /> 3D Spatial Audio
              </span>
              <p className="text-[11px] leading-relaxed text-zinc-400 font-sans">
                As you walk closer to a sound cloud, it gets louder. You'll hear it in your left or right ear depending on where you stand in the room.
              </p>
            </div>
          </div>

          <div className="p-3 border border-zinc-800 rounded-xl space-y-1 bg-zinc-950/40">
            <span className="flex items-center gap-2 text-xs font-semibold text-zinc-100 font-sans">
              <Keyboard className="w-4 h-4 text-zinc-400" /> Interact & Create
            </span>
            <p className="text-[11px] leading-relaxed text-zinc-400 font-sans">
              Click on any sound cloud to rename it, adjust its volume, or delete it. You can upload your own audio files, record live from your microphone, and export your session as a video or audio file.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
