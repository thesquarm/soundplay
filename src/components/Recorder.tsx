import React, { useState, useRef, useEffect } from 'react';
import { Radio, Square, Download, Video, Mic, AlertCircle, Info } from 'lucide-react';
import { audioService } from '../audioEngine';

interface RecorderProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  audioDestination: MediaStreamAudioDestinationNode | null;
  className?: string;
}

// CD-quality WAV PCM 16-bit Stereo Encoder
function bufferToWav(channels: Float32Array[], sampleRate: number): Blob {
  const numOfChan = channels.length;
  const length = channels[0].length * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  let pos = 0;

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  // RIFF identifier
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  // FMT sub-chunk
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16);         // chunk length
  setUint16(1);          // sample format (1 = raw PCM)
  setUint16(numOfChan);  // channel count
  setUint32(sampleRate); // sample rate
  setUint32(sampleRate * 2 * numOfChan); // byte rate
  setUint16(numOfChan * 2);             // block align
  setUint16(16);                        // bits per sample

  // DATA sub-chunk
  setUint32(0x61746164); // "data" chunk
  setUint32(length - pos - 4); // chunk length

  // Write interleaved PCM samples
  const l1 = channels[0].length;
  for (let i = 0; i < l1; i++) {
    for (let channel = 0; channel < numOfChan; channel++) {
      let sample = channels[channel][i];
      // Clamp sample to [-1, 1]
      sample = Math.max(-1, Math.min(1, sample));
      // Convert to 16-bit signed integer
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(pos, intSample, true);
      pos += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export default function Recorder({ canvasRef, audioDestination, className = '' }: RecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordType, setRecordType] = useState<'video-audio' | 'audio-only'>('video-audio');
  const [seconds, setSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  // PCM capture arrays for custom WAV Audio Recording
  const leftChannelRef = useRef<Float32Array[]>([]);
  const rightChannelRef = useRef<Float32Array[]>([]);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);

  // Stop recording timer when unmounted
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
      }
    };
  }, []);

  const startRecording = () => {
    setErrorMessage(null);
    chunksRef.current = [];
    
    try {
      if (recordType === 'audio-only') {
        // --- HIGH COMPATIBILITY WAV AUDIO-ONLY RECORDING ---
        const ctx = audioDestination?.context as AudioContext;
        if (!ctx) {
          throw new Error('Audio engine not initialized yet. Press start first.');
        }

        leftChannelRef.current = [];
        rightChannelRef.current = [];

        // Create ScriptProcessor to capture raw audio chunks in high quality
        const scriptNode = ctx.createScriptProcessor(4096, 2, 2);
        scriptProcessorRef.current = scriptNode;

        if (audioService.masterGain) {
          audioService.masterGain.connect(scriptNode);
        }
        scriptNode.connect(ctx.destination);

        scriptNode.onaudioprocess = (e) => {
          const leftInput = e.inputBuffer.getChannelData(0);
          const rightInput = e.inputBuffer.getChannelData(1);
          
          // Clone data so it does not get overwritten by AudioContext recycle
          leftChannelRef.current.push(new Float32Array(leftInput));
          rightChannelRef.current.push(new Float32Array(rightInput));
        };

        setIsRecording(true);
        setSeconds(0);
        timerRef.current = setInterval(() => {
          setSeconds((prev) => prev + 1);
        }, 1000);

      } else {
        // --- VIDEO + AUDIO WEB CONFORMANT CAPTURE ---
        const streams: MediaStreamTrack[] = [];

        // 1. Capture spatial audio track
        if (audioDestination) {
          const audioTracks = audioDestination.stream.getAudioTracks();
          if (audioTracks.length > 0) {
            streams.push(audioTracks[0]);
          }
        }

        // 2. Capture canvas video track
        const canvas = canvasRef.current;
        if (!canvas) {
          throw new Error('Render canvas not available for capture');
        }
        
        // Capture stream at 30 fps
        const canvasStream = (canvas as any).captureStream ? (canvas as any).captureStream(30) : (canvas as any).mozCaptureStream?.(30);
        if (canvasStream) {
          const videoTracks = canvasStream.getVideoTracks();
          if (videoTracks.length > 0) {
            streams.push(videoTracks[0]);
          }
        }

        if (streams.length === 0) {
          throw new Error('No active streams available. Interact with the canvas first.');
        }

        const combinedStream = new MediaStream(streams);

        // Select the absolute best supported container format
        let options: MediaRecorderOptions = {};
        if (MediaRecorder.isTypeSupported('video/mp4;codecs=h264,aac')) {
          options = { mimeType: 'video/mp4;codecs=h264,aac' };
        } else if (MediaRecorder.isTypeSupported('video/mp4')) {
          options = { mimeType: 'video/mp4' };
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=h264,opus')) {
          options = { mimeType: 'video/webm;codecs=h264,opus' };
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
          options = { mimeType: 'video/webm;codecs=vp9,opus' };
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
          options = { mimeType: 'video/webm;codecs=vp8,opus' };
        } else if (MediaRecorder.isTypeSupported('video/webm')) {
          options = { mimeType: 'video/webm' };
        }

        const mediaRecorder = new MediaRecorder(combinedStream, options);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };

        mediaRecorder.onstop = () => {
          const actualMimeType = mediaRecorder.mimeType || 'video/webm';
          const blob = new Blob(chunksRef.current, { type: actualMimeType });
          const url = URL.createObjectURL(blob);

          let extension = 'webm';
          if (actualMimeType.includes('mp4')) {
            extension = 'mp4';
          }

          const a = document.createElement('a');
          a.href = url;
          a.download = `sound_play_perf_${Date.now()}.${extension}`;
          document.body.appendChild(a);
          a.click();
          
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 100);
        };

        mediaRecorder.start(100);
        setIsRecording(true);
        setSeconds(0);
        timerRef.current = setInterval(() => {
          setSeconds((prev) => prev + 1);
        }, 1000);
      }

    } catch (err: any) {
      console.error('Recording initialization failed:', err);
      setErrorMessage(err.message || 'Recording failed to initialize. Try starting the explorer first.');
    }
  };

  const stopRecording = () => {
    if (recordType === 'audio-only') {
      // Clean up processor node
      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        if (audioService.masterGain) {
          try {
            audioService.masterGain.disconnect(scriptProcessorRef.current);
          } catch (e) {}
        }
        scriptProcessorRef.current.onaudioprocess = null;
        scriptProcessorRef.current = null;
      }

      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // Merge samples and export as high compatibility WAV
      const leftBuffers = leftChannelRef.current;
      const rightBuffers = rightChannelRef.current;

      if (leftBuffers.length === 0) {
        setErrorMessage("No audio samples were captured.");
        return;
      }

      const totalLength = leftBuffers.reduce((acc, b) => acc + b.length, 0);
      const leftMerged = new Float32Array(totalLength);
      const rightMerged = new Float32Array(totalLength);

      let offset = 0;
      for (let i = 0; i < leftBuffers.length; i++) {
        leftMerged.set(leftBuffers[i], offset);
        rightMerged.set(rightBuffers[i], offset);
        offset += leftBuffers[i].length;
      }

      const sampleRate = audioDestination?.context.sampleRate || 44100;
      const wavBlob = bufferToWav([leftMerged, rightMerged], sampleRate);
      const url = URL.createObjectURL(wavBlob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `sound_play_perf_${Date.now()}.wav`;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);

    } else {
      if (!mediaRecorderRef.current || !isRecording) return;
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`p-4 bg-zinc-950 text-white rounded-xl flex flex-col gap-3 shadow-md select-none border border-zinc-800 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-widest font-mono text-zinc-400 flex items-center gap-1.5">
          <Radio className={`w-3.5 h-3.5 ${isRecording ? 'text-red-500 animate-pulse' : 'text-zinc-500'}`} />
          Performance Recorder
        </span>
        {isRecording && (
          <span className="text-[11px] font-mono font-bold bg-red-950 border border-red-800 text-red-400 px-2 py-0.5 rounded-sm animate-pulse">
            REC {formatTime(seconds)}
          </span>
        )}
      </div>

      {!isRecording ? (
        <div className="flex items-center gap-3">
          {/* Format selector */}
          <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 flex-1">
            <button
              id="record-video-selector"
              onClick={() => setRecordType('video-audio')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                recordType === 'video-audio' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              Video + Audio
            </button>
            <button
              id="record-audio-selector"
              onClick={() => setRecordType('audio-only')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                recordType === 'audio-only' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              Audio Only (WAV)
            </button>
          </div>

          {/* Record button */}
          <button
            id="start-recording-btn"
            onClick={startRecording}
            className="flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-md active:scale-95 transition-all cursor-pointer border border-red-500"
          >
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            Record
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-3">
          <span className="text-xs text-zinc-300 font-sans">
            Recording {recordType === 'video-audio' ? 'screen performance...' : 'audio output to WAV...'}
          </span>
          <button
            id="stop-recording-btn"
            onClick={stopRecording}
            className="flex items-center gap-1.5 bg-white text-zinc-950 hover:bg-zinc-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
          >
            <Square className="w-3 h-3 text-red-600 fill-red-600" />
            Stop & Export
          </button>
        </div>
      )}

      {/* COMPATIBILITY INFORMATION HELPER */}
      <div className="flex items-start gap-1.5 p-2 rounded-md bg-zinc-900/60 border border-zinc-800/80 text-[10px] text-zinc-400">
        <Info className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
        <p className="leading-normal">
          {recordType === 'audio-only' 
            ? "Exports a high-fidelity, uncompressed standard .wav file that is playable instantly on all macOS, iOS, Windows, and Android devices." 
            : "Video is exported as standard WebM. If your default player (like macOS QuickTime) cannot open it, play via VLC or drag into Google Chrome."
          }
        </p>
      </div>

      {errorMessage && (
        <div className="flex items-start gap-1.5 p-2 rounded-md bg-red-950/40 border border-red-900 text-[10px] text-red-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
