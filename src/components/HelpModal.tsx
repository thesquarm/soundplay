import React from 'react';
import { Volume2, ChevronRight, Move, Music, Keyboard } from 'lucide-react';

interface HelpModalProps {
  onStart: () => void;
}

export default function HelpModal({ onStart }: HelpModalProps) {
  const [showWhatIs, setShowWhatIs] = React.useState(false);

  return (
    <div 
      className="fixed inset-0 bg-[#07070a] z-50 flex flex-col items-center justify-start sm:justify-center p-4 overflow-y-auto select-none pt-16 sm:pt-4"
      style={{ backgroundColor: '#d3a74b', borderColor: '#e1e1ed' }}
    >
      {/* Invitability Background Glows with a rich, vibrant color palette */}
      <div className="absolute top-4 left-4 w-72 h-72 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/4 right-4 w-80 h-80 bg-rose-500/15 rounded-full blur-3xl pointer-events-none animate-pulse duration-[6000ms]" />
      <div className="absolute bottom-12 left-1/4 w-96 h-96 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-4 right-12 w-80 h-80 bg-amber-500/15 rounded-full blur-3xl pointer-events-none animate-pulse duration-[8000ms]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-xl w-full border border-zinc-800/80 rounded-2xl p-6 md:p-8 bg-zinc-950/80 backdrop-blur-xl shadow-2xl flex flex-col gap-6 relative z-10 hover:border-zinc-700/50 transition-colors duration-500">
        
        {/* Sound Logo from Screenshot */}
        <div className="flex flex-col items-center justify-center text-center select-none order-1">
          <h1 
            className="text-3xl md:text-[40px] font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-zinc-100 to-zinc-400 font-sans uppercase"
            style={{ fontSize: '40px' }}
          >
            sound_play
          </h1>
          <p 
            className="text-[10px] md:text-xs font-bold tracking-[0.25em] text-zinc-300 font-mono uppercase mt-2"
            style={{ fontFamily: 'monospace' }}
          >
            A spatial soundscape designer
          </p>
          
          {/* Vertical lines and dot logo with colorful ambient aura: | · | */}
          <div className="flex items-center gap-1.5 mt-4 relative">
            <span className="w-1 h-5 bg-gradient-to-b from-indigo-400 to-indigo-600 rounded-full opacity-95 shadow-lg shadow-indigo-500/50" />
            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full opacity-95 shadow-lg shadow-rose-500/50 animate-ping absolute left-2.5" />
            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full opacity-95 shadow-lg shadow-rose-500/50" />
            <span className="w-1 h-5 bg-gradient-to-b from-emerald-400 to-emerald-600 rounded-full opacity-95 shadow-lg shadow-emerald-500/50" />
          </div>
        </div>

        {/* Central Idea Description - exactly 5 sentences hidden behind button */}
        <div className="flex flex-col gap-2 order-3">
          <button
            onClick={() => setShowWhatIs(!showWhatIs)}
            className="w-full flex items-center justify-between py-2.5 px-4 bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 rounded-xl text-xs font-semibold text-zinc-200 transition-all cursor-pointer"
          >
            <span>What is sound_play?</span>
            <ChevronRight className={`w-4 h-4 text-zinc-400 transition-transform ${showWhatIs ? 'rotate-90' : ''}`} />
          </button>
          
          {showWhatIs && (
            <>
              <p 
                className="text-[11px] md:text-xs leading-relaxed text-zinc-300 font-mono text-center bg-zinc-900/40 p-4 border border-zinc-800/60 rounded-xl mt-1"
                style={{ fontFamily: 'monospace' }}
              >
                <strong>sound_play</strong> is an interactive, browser-based 3D spatial soundscape designer that empowers users to sculpt immersive acoustic environments in real-time. By positioning procedural synthesizer nodes and custom audio uploads on a virtual spatial canvas, users can explore physical acoustic modeling such as room reverb, echo delays, and low/high-pass EQ filters.
              </p>
              <p 
                className="text-[11px] md:text-xs leading-relaxed text-zinc-300 font-mono text-center bg-zinc-900/40 p-4 border border-zinc-800/60 rounded-xl"
                style={{ fontFamily: 'monospace' }}
              >
                The platform incorporates native Doppler pitch-shifting which dynamically reacts to player movement, simulating realistic wave propagation. With high-fidelity binaural panning and an integrated multi-track performance recorder, it bridges the gap between spatial acoustic exploration and creative sound design. This makes it an ideal playground for musicians, sound engineers, and experiential creators alike.
              </p>
            </>
          )}
        </div>

        {/* Divider */}
        <hr className="border-zinc-800 order-2" />

        {/* Start Button & Recommendation - placed ABOVE the collapsible description visually */}
        <div className="space-y-3 order-2">
          <button
            id="btn-start-soundscape"
            onClick={onStart}
            className="w-full flex items-center justify-center gap-2 py-3 font-semibold rounded-xl text-sm transition-all duration-150 transform hover:scale-[1.01] active:scale-95 shadow-md cursor-pointer border border-white text-zinc-950"
            style={{ backgroundColor: '#f0f0f5' }}
          >
            Initialize Designer
            <ChevronRight className="w-4 h-4 text-zinc-950" />
          </button>

          <p className="text-[10px] text-center text-zinc-500 font-mono">
            Recommend wearing headphones for the full spatial stereo experience.
          </p>
        </div>

        {/* Divider */}
        <hr className="border-zinc-800 order-4" />

        {/* Instructions Columns */}
        <div className="space-y-4 order-5">
          <h2 className="text-xs font-bold font-mono tracking-wider text-zinc-400 uppercase">
            Acoustic & Exploration Guides
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Movement */}
            <div className="p-3 border border-zinc-800 rounded-xl space-y-2 bg-zinc-950/40">
              <span className="flex items-center gap-2 text-xs font-semibold text-zinc-100 font-sans">
                <Move className="w-4 h-4 text-zinc-400" /> Walking Controls
              </span>
              <p className="text-[11px] leading-relaxed text-zinc-400 font-sans">
                Use <strong className="text-zinc-200">WASD / Arrow keys</strong> to move. Drag the mouse on screen to look around, or use the touch <strong className="text-zinc-200">joystick</strong> on mobile.
              </p>
            </div>

            {/* Spatial Sound */}
            <div className="p-3 border border-zinc-800 rounded-xl space-y-2 bg-zinc-950/40">
              <span className="flex items-center gap-2 text-xs font-semibold text-zinc-100 font-sans">
                <Music className="w-4 h-4 text-zinc-400" /> Dynamic Acoustics
              </span>
              <p className="text-[11px] leading-relaxed text-zinc-400 font-sans">
                Select any colored audio node to toggle physical acoustics. Customize room reverb, set delay echo loops, tune filters, and toggle Doppler motion pitch shifts.
              </p>
            </div>
          </div>

          <div className="p-3 border border-zinc-800 rounded-xl space-y-1 bg-zinc-950/40">
            <span className="flex items-center gap-2 text-xs font-semibold text-zinc-100 font-sans">
              <Keyboard className="w-4 h-4 text-zinc-400" /> Interactive Sculpting
            </span>
            <p className="text-[11px] leading-relaxed text-zinc-400 font-sans">
              Click and drag sound clouds directly on the virtual coordinate plane. Drop custom `.mp3` or `.wav` files, capture mic input, and record your master live sessions to share.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
