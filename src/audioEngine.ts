import { SoundSource, CameraState } from './types';

// Global non-reactive registry to store running Web Audio nodes and buffers
class AudioEngine {
  public ctx: AudioContext | null = null;
  public masterGain: GainNode | null = null;
  public recorderDestination: MediaStreamAudioDestinationNode | null = null;
  
  public shortReverbNode: ConvolverNode | null = null;
  public longReverbNode: ConvolverNode | null = null;

  // Track sources: id -> active Web Audio nodes
  private activeNodes: Map<
    string,
    {
      sourceNode: AudioNode;
      gainNode: GainNode;
      filterNode: BiquadFilterNode;
      pannerNode: StereoPannerNode;
      analyserNode: AnalyserNode;
      dryGainNode: GainNode;
      wetGainNode: GainNode;
      delayNode: DelayNode;
      delayFeedbackNode: GainNode;
      delayWetGainNode: GainNode;
      prevDistance?: number;
      smoothVelocity?: number;
      proceduralIntervals?: any[]; // For intervals/timeouts of procedural audio
    }
  > = new Map();

  // Track decoded buffers for uploaded files so they can be re-played
  private audioBuffers: Map<string, AudioBuffer> = new Map();

  // Reference parameters for spatial audio
  private readonly REF_DISTANCE = 1.5;
  private readonly MAX_DISTANCE = 22.0;

  constructor() {
    // AudioContext will be initialized on user interaction
  }

  public init() {
    if (this.ctx) return;

    // Create AudioContext
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioCtxClass();
    
    // Master volume node
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // Reverb convolver node setups
    try {
      this.shortReverbNode = this.ctx.createConvolver();
      this.shortReverbNode.buffer = this.createReverbImpulseResponse(1.2, 2.5, false);
      this.shortReverbNode.connect(this.masterGain);

      this.longReverbNode = this.ctx.createConvolver();
      this.longReverbNode.buffer = this.createReverbImpulseResponse(3.8, 1.2, false);
      this.longReverbNode.connect(this.masterGain);
    } catch (e) {
      console.error('Failed to initialize convolvers:', e);
    }

    // Recording node helper (captures master output)
    this.recorderDestination = this.ctx.createMediaStreamDestination();
    this.masterGain.connect(this.recorderDestination);
  }

  public resume() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' || (this.ctx as any).state === 'interrupted') {
        this.ctx.resume().catch((err) => console.error("Failed to resume AudioContext:", err));
      }
    }
  }

  private createReverbImpulseResponse(duration: number, decay: number, isForest: boolean = false): AudioBuffer {
    const sampleRate = this.ctx ? this.ctx.sampleRate : 44100;
    const numSamples = Math.floor(sampleRate * duration);
    const buffer = this.ctx!.createBuffer(2, numSamples, sampleRate);
    
    for (let channel = 0; channel < 2; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < numSamples; i++) {
        // White noise base
        let noise = Math.random() * 2 - 1;
        
        // Exponential decay envelope
        const t = i / sampleRate;
        let envelope = Math.exp(-t * decay);
        
        // Forest Canopy: fluttering late reflections
        if (isForest) {
          const flutter = Math.sin(t * 80) * 0.35 + 0.65;
          envelope *= flutter;
          if (t > 0.05) {
            const tap = Math.sin(t * 120 + channel * Math.PI) > 0.8 ? 0.3 : 0;
            noise = (noise + tap) * 0.8;
          }
        }
        
        channelData[i] = noise * envelope;
      }
    }
    return buffer;
  }

  // Pre-load an uploaded audio file buffer
  public storeBuffer(id: string, buffer: AudioBuffer) {
    this.audioBuffers.set(id, buffer);
  }

  public hasBuffer(id: string): boolean {
    return this.audioBuffers.has(id);
  }

  // Robust audio decoder for iOS Safari & standard browsers
  public async decodeAudioDataFallback(arrayBuffer: ArrayBuffer, mimeType?: string, fileName?: string): Promise<AudioBuffer> {
    this.init();
    await this.resume();

    const ctx = this.ctx!;

    // 1. First attempt: standard decodeAudioData with a slice copy
    try {
      const copy1 = arrayBuffer.slice(0);
      return await new Promise<AudioBuffer>((resolve, reject) => {
        let isSettled = false;
        try {
          const p = ctx.decodeAudioData(
            copy1,
            (buf) => {
              if (!isSettled) { isSettled = true; resolve(buf); }
            },
            (err) => {
              if (!isSettled) { isSettled = true; reject(err); }
            }
          );
          if (p && typeof (p as any).then === 'function') {
            (p as any).then((buf: AudioBuffer) => {
              if (!isSettled) { isSettled = true; resolve(buf); }
            }).catch((err: any) => {
              if (!isSettled) { isSettled = true; reject(err); }
            });
          }
        } catch (e) {
          if (!isSettled) { isSettled = true; reject(e); }
        }
      });
    } catch (e1) {
      console.warn('Standard decodeAudioData failed, trying Blob arrayBuffer fallback:', e1);
    }

    // 2. Second attempt: Re-wrap in Blob with explicit audio MIME type
    try {
      const copy2 = arrayBuffer.slice(0);
      const isWav = fileName?.toLowerCase().endsWith('.wav') || mimeType?.includes('wav');
      const targetType = mimeType || (isWav ? 'audio/wav' : 'audio/mpeg');
      const blob = new Blob([copy2], { type: targetType });
      const blobBuf = await blob.arrayBuffer();

      return await new Promise<AudioBuffer>((resolve, reject) => {
        let isSettled = false;
        ctx.decodeAudioData(
          blobBuf,
          (buf) => { if (!isSettled) { isSettled = true; resolve(buf); } },
          (err) => { if (!isSettled) { isSettled = true; reject(err); } }
        );
      });
    } catch (e2) {
      console.warn('Blob decodeAudioData failed, trying audio element decoding:', e2);
    }

    // 3. Third attempt: Decode via Audio element & OfflineAudioContext
    try {
      return await this.decodeViaAudioElement(arrayBuffer, mimeType, fileName);
    } catch (e3) {
      console.error('All audio decoding methods failed:', e3);
      throw new Error('Unable to decode audio data on this device');
    }
  }

  private async decodeViaAudioElement(arrayBuffer: ArrayBuffer, mimeType?: string, fileName?: string): Promise<AudioBuffer> {
    const isWav = fileName?.toLowerCase().endsWith('.wav') || mimeType?.includes('wav');
    const targetType = mimeType || (isWav ? 'audio/wav' : 'audio/mpeg');
    const blob = new Blob([arrayBuffer], { type: targetType });
    const url = URL.createObjectURL(blob);

    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.src = url;
      audio.crossOrigin = 'anonymous';

      const timeout = setTimeout(() => {
        URL.revokeObjectURL(url);
        reject(new Error('Audio element load timeout'));
      }, 8000);

      audio.onloadeddata = async () => {
        clearTimeout(timeout);
        try {
          const duration = audio.duration;
          if (!duration || isNaN(duration) || duration <= 0) {
            URL.revokeObjectURL(url);
            return reject(new Error('Invalid duration'));
          }

          const sampleRate = this.ctx?.sampleRate || 44100;
          const offlineCtx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(
            2,
            Math.ceil(duration * sampleRate),
            sampleRate
          );

          const fetchResp = await fetch(url);
          const freshBuf = await fetchResp.arrayBuffer();
          const decoded = await offlineCtx.decodeAudioData(freshBuf);
          URL.revokeObjectURL(url);
          resolve(decoded);
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };

      audio.onerror = () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        reject(new Error('Audio element error'));
      };

      audio.load();
    });
  }

  // Start a specific sound source
  public startSound(sound: SoundSource) {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    // If already playing, stop first to be clean
    if (this.activeNodes.has(sound.id)) {
      this.stopSound(sound.id);
    }

    // Create sound chain nodes
    const gainNode = this.ctx.createGain();
    const filterNode = this.ctx.createBiquadFilter();
    const pannerNode = this.ctx.createStereoPanner();
    const analyserNode = this.ctx.createAnalyser();
    
    analyserNode.fftSize = 64; // Small fft for lightweight level analysis

    // Configure filter node: type 'allpass' is transparent bypass
    const fType = sound.filterType && sound.filterType !== 'none' ? sound.filterType : 'allpass';
    filterNode.type = fType;
    filterNode.frequency.setValueAtTime(sound.filterFrequency !== undefined ? sound.filterFrequency : 1000, this.ctx.currentTime);

    const dryGainNode = this.ctx.createGain();
    const wetGainNode = this.ctx.createGain();

    const wetness = sound.reverbWetness !== undefined ? sound.reverbWetness : 0.3;
    dryGainNode.gain.setValueAtTime(1.0 - wetness * 0.5, this.ctx.currentTime);
    wetGainNode.gain.setValueAtTime(wetness, this.ctx.currentTime);

    // Echo / Delay loop nodes
    const delayNode = this.ctx.createDelay(1.0);
    const delayFeedbackNode = this.ctx.createGain();
    const delayWetGainNode = this.ctx.createGain();

    delayNode.delayTime.setValueAtTime(sound.delayTime !== undefined ? sound.delayTime : 0.3, this.ctx.currentTime);
    delayFeedbackNode.gain.setValueAtTime(sound.delayFeedback !== undefined ? sound.delayFeedback : 0.4, this.ctx.currentTime);
    delayWetGainNode.gain.setValueAtTime(sound.delayEnabled ? 0.5 : 0.0, this.ctx.currentTime);

    // Connections in chain:
    // Source -> gainNode -> filterNode -> pannerNode -> analyserNode -> Splits:
    // Split 1: analyserNode -> dryGainNode -> masterGain
    // Split 2: analyserNode -> wetGainNode -> Reverb convolver
    // Split 3: analyserNode -> delayNode -> delayWetGainNode -> masterGain
    gainNode.connect(filterNode);
    filterNode.connect(pannerNode);
    pannerNode.connect(analyserNode);
    
    analyserNode.connect(dryGainNode);
    dryGainNode.connect(this.masterGain);

    analyserNode.connect(wetGainNode);
    if (sound.reverbType === 'short' && this.shortReverbNode) {
      wetGainNode.connect(this.shortReverbNode);
    } else if (sound.reverbType === 'long' && this.longReverbNode) {
      wetGainNode.connect(this.longReverbNode);
    }

    // Delay loop connections
    analyserNode.connect(delayNode);
    delayNode.connect(delayFeedbackNode);
    delayFeedbackNode.connect(delayNode); // feedback loop
    delayNode.connect(delayWetGainNode);
    delayWetGainNode.connect(this.masterGain);

    let sourceNode: AudioNode;
    const intervals: any[] = [];

    // Synthesize procedural audio or load buffered uploads
    if (sound.type === 'procedural') {
      if (sound.soundType === 'north') {
        sourceNode = this.createBirdsSynth(gainNode, intervals);
      } else if (sound.soundType === 'east') {
        sourceNode = this.createBeeSynth(gainNode, intervals);
      } else if (sound.soundType === 'south') {
        sourceNode = this.createRainThunderSynth(gainNode, intervals);
      } else if (sound.soundType === 'west') {
        sourceNode = this.createHearingResonanceSynth(gainNode, intervals);
      } else {
        sourceNode = this.createBirdsSynth(gainNode, intervals);
      }
    } else {
      // Uploaded sound
      const buffer = this.audioBuffers.get(sound.id);
      if (!buffer) {
        console.warn(`No buffer found for uploaded sound ${sound.id}`);
        return;
      }
      const bufferSource = this.ctx.createBufferSource();
      bufferSource.buffer = buffer;
      bufferSource.loop = true;
      bufferSource.start(0);
      bufferSource.connect(gainNode);
      sourceNode = bufferSource;
    }

    // Register active node references
    this.activeNodes.set(sound.id, {
      sourceNode,
      gainNode,
      filterNode,
      pannerNode,
      analyserNode,
      dryGainNode,
      wetGainNode,
      delayNode,
      delayFeedbackNode,
      delayWetGainNode,
      proceduralIntervals: intervals,
    });
  }

  // Stop a running sound source
  public stopSound(id: string) {
    const nodes = this.activeNodes.get(id);
    if (!nodes) return;

    // Disconnect and clean procedural schedulers
    if (nodes.proceduralIntervals) {
      nodes.proceduralIntervals.forEach((interval) => {
        if (typeof interval === 'number' || interval.unref) {
          clearInterval(interval);
          clearTimeout(interval);
        } else if (interval.stop) {
          try { interval.stop(); } catch (e) {}
        }
      });
    }

    // Stop source if it's a buffer source node
    if (nodes.sourceNode instanceof AudioBufferSourceNode) {
      try {
        nodes.sourceNode.stop();
      } catch (e) {}
    }

    // Disconnect all nodes
    try {
      nodes.sourceNode.disconnect();
      nodes.gainNode.disconnect();
      nodes.filterNode.disconnect();
      nodes.pannerNode.disconnect();
      nodes.analyserNode.disconnect();
      nodes.dryGainNode.disconnect();
      nodes.wetGainNode.disconnect();
      nodes.delayNode.disconnect();
      nodes.delayFeedbackNode.disconnect();
      nodes.delayWetGainNode.disconnect();
    } catch (e) {}

    this.activeNodes.delete(id);
  }

  // Stop everything
  public stopAll() {
    Array.from(this.activeNodes.keys()).forEach((id) => this.stopSound(id));
  }

  // Retrieve average audio volume amplitude (0-255) for jumping cube effects
  public getAmplitude(id: string): number {
    const nodes = this.activeNodes.get(id);
    if (!nodes || !this.ctx) return 0;

    const dataArray = new Uint8Array(nodes.analyserNode.frequencyBinCount);
    nodes.analyserNode.getByteFrequencyData(dataArray);

    // Return the average frequency amplitude
    let total = 0;
    for (let i = 0; i < dataArray.length; i++) {
      total += dataArray[i];
    }
    return total / dataArray.length;
  }

  // Primary spatial calculations: updates gain and stereo pan dynamically
  public updateSpatialAudio(camera: CameraState, sounds: SoundSource[], masterMute: boolean) {
    if (!this.ctx || !this.masterGain) return;

    // Set master mute status
    this.masterGain.gain.setValueAtTime(masterMute ? 0.0 : 0.8, this.ctx.currentTime);

    sounds.forEach((sound) => {
      const nodes = this.activeNodes.get(sound.id);
      if (!nodes) {
        // If sound should be playing but nodes don't exist, boot them
        if (sound.isPlaying && !masterMute) {
          this.startSound(sound);
        }
        return;
      }

      // If sound is muted/paused by user, stop nodes
      if (!sound.isPlaying) {
        this.stopSound(sound.id);
        return;
      }

      // Vector from listener (camera) to sound
      const dx = sound.x - camera.x;
      const dz = sound.z - camera.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      // --- Distance-Based Gain Roll-off ---
      let targetGain = 0;
      if (distance <= this.REF_DISTANCE) {
        targetGain = 1.0;
      } else if (distance >= this.MAX_DISTANCE) {
        targetGain = 0.0;
      } else {
        // Smooth linear roll-off
        targetGain = 1.0 - (distance - this.REF_DISTANCE) / (this.MAX_DISTANCE - this.REF_DISTANCE);
      }

      // Apply individual source volume setting
      targetGain = targetGain * sound.volume;

      // Smooth gain transition to avoid pops/crackles
      nodes.gainNode.gain.setTargetAtTime(targetGain, this.ctx!.currentTime, 0.1);

      // EQ Filter updates
      if (nodes.filterNode) {
        const targetFType = sound.filterType && sound.filterType !== 'none' ? sound.filterType : 'allpass';
        nodes.filterNode.type = targetFType;
        nodes.filterNode.frequency.setTargetAtTime(sound.filterFrequency !== undefined ? sound.filterFrequency : 1000, this.ctx!.currentTime, 0.1);
      }

      // Echo / Delay updates
      if (nodes.delayNode && nodes.delayFeedbackNode && nodes.delayWetGainNode) {
        nodes.delayNode.delayTime.setTargetAtTime(sound.delayTime !== undefined ? sound.delayTime : 0.3, this.ctx!.currentTime, 0.1);
        nodes.delayFeedbackNode.gain.setTargetAtTime(sound.delayFeedback !== undefined ? sound.delayFeedback : 0.4, this.ctx!.currentTime, 0.1);
        
        const targetDelayWet = sound.delayEnabled ? 0.5 : 0.0;
        nodes.delayWetGainNode.gain.setTargetAtTime(targetDelayWet, this.ctx!.currentTime, 0.1);
      }

      // Reverb wetness & dynamic route reconnection
      const wetness = sound.reverbWetness !== undefined ? sound.reverbWetness : 0.3;
      nodes.dryGainNode.gain.setTargetAtTime(1.0 - wetness * 0.5, this.ctx!.currentTime, 0.1);
      nodes.wetGainNode.gain.setTargetAtTime(wetness, this.ctx!.currentTime, 0.1);

      // Reconnect wetGainNode to correct convolver dynamically
      try {
        nodes.wetGainNode.disconnect();
        if (sound.reverbType === 'short' && this.shortReverbNode) {
          nodes.wetGainNode.connect(this.shortReverbNode);
        } else if (sound.reverbType === 'long' && this.longReverbNode) {
          nodes.wetGainNode.connect(this.longReverbNode);
        }
      } catch (e) {
        // Safe fail
      }

      // --- Doppler Effect (Speed of sound pitch-shifting) ---
      let dopplerPitchFactor = 1.0;
      if (sound.dopplerEnabled && nodes.prevDistance !== undefined) {
        // Delta distance change over approx ~16ms frame (60fps)
        const rawVel = (nodes.prevDistance - distance) / 0.016;
        
        // Low-pass smooth to avoid jittering
        const smoothVel = nodes.smoothVelocity !== undefined 
          ? nodes.smoothVelocity * 0.9 + rawVel * 0.1
          : rawVel;
        nodes.smoothVelocity = smoothVel;

        const factor = sound.dopplerFactor !== undefined ? sound.dopplerFactor : 1.0;
        const virtualSpeedOfSound = 30.0; // low speed of sound for dramatic effect in our small 3D coordinate system
        
        // Doppler formula multiplier
        dopplerPitchFactor = 1.0 + (smoothVel / virtualSpeedOfSound) * factor;
        // Clamp to safe audio playback limits
        dopplerPitchFactor = Math.max(0.4, Math.min(2.5, dopplerPitchFactor));
      } else {
        nodes.smoothVelocity = 0;
      }
      nodes.prevDistance = distance;

      // Apply pitch factor
      if (nodes.sourceNode instanceof AudioBufferSourceNode) {
        nodes.sourceNode.playbackRate.setTargetAtTime(dopplerPitchFactor, this.ctx!.currentTime, 0.1);
      } else if (nodes.sourceNode instanceof OscillatorNode) {
        const detuneCents = 1200 * Math.log2(dopplerPitchFactor);
        nodes.sourceNode.detune.setTargetAtTime(detuneCents, this.ctx!.currentTime, 0.1);
      }

      // --- Yaw-Aware Stereo Panning ---
      // Rotate the 2D offset vector opposite to the listener's yaw orientation
      // listener is looking at angle `camera.angle`.
      // localX represents left-right alignment (-1 is left, +1 is right)
      const cosAngle = Math.cos(camera.angle);
      const sinAngle = Math.sin(camera.angle);

      // standard 2D vector rotation
      const localX = dx * cosAngle - dz * sinAngle;

      let pan = 0;
      if (distance > 0.05) {
        // Standard projection divided by total distance
        pan = localX / distance;
        // Clamp between absolute stereo pan boundaries
        pan = Math.max(-1.0, Math.min(1.0, pan));
      }

      // Smooth pan transition
      nodes.pannerNode.pan.setTargetAtTime(pan, this.ctx!.currentTime, 0.1);
    });
  }

  // --- North Forest Birds Procedural Synthesis (Chirpy Sweeps) ---
  private createBirdsSynth(gainNode: GainNode, intervals: any[]): AudioNode {
    const ctx = this.ctx!;
    
    // A master gain for the birds to sum them up
    const birdsMerger = ctx.createGain();
    birdsMerger.gain.setValueAtTime(0.85, ctx.currentTime);
    birdsMerger.connect(gainNode);

    const triggerBirdSong = () => {
      if (!this.ctx || !this.activeNodes.has(this.getSoundIdByTypeName('north'))) return;
      
      const t = ctx.currentTime;
      const numChirps = 3 + Math.floor(Math.random() * 4); // 3 to 6 chirps
      let delay = 0;

      // Type of bird song (pitch range)
      const baseFreq = 1800 + Math.random() * 700; // 1800 to 2500 Hz
      const sweepRange = 1000 + Math.random() * 800;

      for (let i = 0; i < numChirps; i++) {
        const chirpStart = t + delay;
        const chirpDuration = 0.05 + Math.random() * 0.05; // 50ms to 100ms

        const osc = ctx.createOscillator();
        const chirpGain = ctx.createGain();

        osc.type = 'sine';
        // Sweep up or down
        const direction = Math.random() > 0.4 ? 1 : -1;
        if (direction === 1) {
          osc.frequency.setValueAtTime(baseFreq, chirpStart);
          osc.frequency.exponentialRampToValueAtTime(baseFreq + sweepRange, chirpStart + chirpDuration);
        } else {
          osc.frequency.setValueAtTime(baseFreq + sweepRange, chirpStart);
          osc.frequency.exponentialRampToValueAtTime(baseFreq, chirpStart + chirpDuration);
        }

        chirpGain.gain.setValueAtTime(0.001, chirpStart);
        chirpGain.gain.exponentialRampToValueAtTime(0.20, chirpStart + 0.008);
        chirpGain.gain.exponentialRampToValueAtTime(0.001, chirpStart + chirpDuration);

        osc.connect(chirpGain);
        chirpGain.connect(birdsMerger);

        osc.start(chirpStart);
        osc.stop(chirpStart + chirpDuration + 0.05);

        delay += chirpDuration + 0.04 + Math.random() * 0.10; // gap between chirps
      }
    };

    // Trigger initial birdsong
    triggerBirdSong();

    // Trigger repeatedly
    const birdsInterval = setInterval(() => {
      triggerBirdSong();
    }, 3500);

    intervals.push(birdsInterval);
    intervals.push({
      stop: () => {
        birdsMerger.disconnect();
      }
    });

    return birdsMerger;
  }

  // --- East Honeybee Buzz Procedural Synthesis (Frequency Modulated Sawtooth) ---
  private createBeeSynth(gainNode: GainNode, intervals: any[]): AudioNode {
    const ctx = this.ctx!;
    
    const carrier = ctx.createOscillator();
    const modulator = ctx.createOscillator();
    const modulatorGain = ctx.createGain();
    const lowpass = ctx.createBiquadFilter();
    const beeGain = ctx.createGain();

    // Modulator: creates the rapid fluttering rate (wing vibrato)
    modulator.type = 'sine';
    modulator.frequency.setValueAtTime(28.0, ctx.currentTime); // 28Hz flutter
    modulatorGain.gain.setValueAtTime(15.0, ctx.currentTime); // frequency swing of 15Hz

    // Carrier: the core wing beat pitch
    carrier.type = 'sawtooth';
    carrier.frequency.setValueAtTime(140.0, ctx.currentTime); // 140Hz honeybee pitch

    // Lowpass filter to smooth out the sawtooth and make it organic
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(500, ctx.currentTime);
    lowpass.Q.setValueAtTime(1.0, ctx.currentTime);

    // Initial gain setting
    beeGain.gain.setValueAtTime(0.07, ctx.currentTime);

    // Connections
    modulator.connect(modulatorGain);
    modulatorGain.connect(carrier.frequency); // frequency modulation!
    
    carrier.connect(lowpass);
    lowpass.connect(beeGain);
    beeGain.connect(gainNode);

    // Start oscillators
    modulator.start();
    carrier.start();

    // Modulate pitch and volume slowly to simulate the bee buzzing around
    const beeModInterval = setInterval(() => {
      const t = ctx.currentTime;
      // Drift the base frequency slightly
      const baseFreq = 140.0 + Math.sin(t * 1.6) * 16.0 + Math.cos(t * 0.8) * 5.0;
      carrier.frequency.setTargetAtTime(baseFreq, t, 0.1);

      // Drift the lowpass frequency (changes the timbre as the bee turns)
      const lpFreq = 500 + Math.sin(t * 1.3) * 150;
      lowpass.frequency.setTargetAtTime(lpFreq, t, 0.12);

      // Tremolo/vol drift (wings getting harder/softer, bee flying around)
      const vol = 0.05 + Math.abs(Math.sin(t * 0.8)) * 0.04 + Math.cos(t * 3.2) * 0.01;
      beeGain.gain.setTargetAtTime(vol, t, 0.25);
    }, 100);

    intervals.push(beeModInterval);
    intervals.push({
      stop: () => {
        try { modulator.stop(); } catch (e) {}
        try { carrier.stop(); } catch (e) {}
        modulator.disconnect();
        modulatorGain.disconnect();
        carrier.disconnect();
        lowpass.disconnect();
        beeGain.disconnect();
      }
    });

    return carrier;
  }

  // --- South: Rain & Thunder Procedural Synthesis ---
  private createRainThunderSynth(gainNode: GainNode, intervals: any[]): AudioNode {
    const ctx = this.ctx!;

    // 1. Steady Rain Noise Buffer
    const bufferSize = ctx.sampleRate * 2.0; // 2 seconds loop
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const rainSource = ctx.createBufferSource();
    rainSource.buffer = buffer;
    rainSource.loop = true;
    rainSource.start(0);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1000, ctx.currentTime);
    filter.Q.setValueAtTime(0.5, ctx.currentTime);

    const rainGain = ctx.createGain();
    rainGain.gain.setValueAtTime(0.25, ctx.currentTime);

    rainSource.connect(filter);
    filter.connect(rainGain);
    rainGain.connect(gainNode);

    // 2. Thunder Rumble Generator
    const thunderGain = ctx.createGain();
    thunderGain.gain.setValueAtTime(0.6, ctx.currentTime);
    thunderGain.connect(gainNode);

    const triggerThunder = () => {
      if (!this.ctx || !this.activeNodes.has(this.getSoundIdByTypeName('south'))) return;
      const t = ctx.currentTime;
      
      // Create oscillator for low-end boom
      const rumbleOsc = ctx.createOscillator();
      const rumbleFilter = ctx.createBiquadFilter();
      const rumbleGainNode = ctx.createGain();

      rumbleOsc.type = 'sawtooth';
      rumbleOsc.frequency.setValueAtTime(45.0 + Math.random() * 15.0, t);
      // frequency slide downwards
      rumbleOsc.frequency.exponentialRampToValueAtTime(25.0, t + 1.5);

      rumbleFilter.type = 'lowpass';
      rumbleFilter.frequency.setValueAtTime(75, t);

      // Thunder envelope: fast attack, slow rumbling decay with crackle modulation
      rumbleGainNode.gain.setValueAtTime(0.001, t);
      rumbleGainNode.gain.exponentialRampToValueAtTime(0.5, t + 0.1);
      rumbleGainNode.gain.linearRampToValueAtTime(0.2, t + 0.6);
      rumbleGainNode.gain.exponentialRampToValueAtTime(0.001, t + 2.5);

      rumbleOsc.connect(rumbleFilter);
      rumbleFilter.connect(rumbleGainNode);
      rumbleGainNode.connect(thunderGain);

      rumbleOsc.start(t);
      rumbleOsc.stop(t + 2.6);

      // Add a higher-frequency crackle for the thunder strike
      const strikeOsc = ctx.createOscillator();
      const strikeFilter = ctx.createBiquadFilter();
      const strikeGain = ctx.createGain();

      strikeOsc.type = 'triangle';
      strikeOsc.frequency.setValueAtTime(180, t);
      strikeOsc.frequency.linearRampToValueAtTime(90, t + 0.4);

      strikeFilter.type = 'bandpass';
      strikeFilter.frequency.setValueAtTime(150, t);
      strikeFilter.Q.setValueAtTime(1.0, t);

      strikeGain.gain.setValueAtTime(0.001, t);
      strikeGain.gain.linearRampToValueAtTime(0.12, t + 0.05);
      strikeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

      strikeOsc.connect(strikeFilter);
      strikeFilter.connect(strikeGain);
      strikeGain.connect(thunderGain);

      strikeOsc.start(t);
      strikeOsc.stop(t + 0.6);
    };

    // Trigger thunder immediately and at intervals
    triggerThunder();
    const thunderInterval = setInterval(() => {
      // 35% chance every 4 seconds
      if (Math.random() < 0.35) {
        triggerThunder();
      }
    }, 4000);

    intervals.push(thunderInterval);
    intervals.push(rainSource);
    intervals.push({
      stop: () => {
        try { rainSource.stop(); } catch (e) {}
        rainSource.disconnect();
        filter.disconnect();
        rainGain.disconnect();
        thunderGain.disconnect();
      }
    });

    return rainSource;
  }

  // --- West: Hearing Resonance Procedural Synthesis ---
  private createHearingResonanceSynth(gainNode: GainNode, intervals: any[]): AudioNode {
    const ctx = this.ctx!;

    const resonanceGain = ctx.createGain();
    resonanceGain.gain.setValueAtTime(0.45, ctx.currentTime);
    resonanceGain.connect(gainNode);

    // Two pure sine wave oscillators tuned to healing frequencies: 432Hz (Cosmic) and 528Hz (Transformation)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    
    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(432.0, ctx.currentTime);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(528.0, ctx.currentTime);

    gain1.gain.setValueAtTime(0.15, ctx.currentTime);
    gain2.gain.setValueAtTime(0.10, ctx.currentTime);

    osc1.connect(gain1);
    osc2.connect(gain2);

    gain1.connect(resonanceGain);
    gain2.connect(resonanceGain);

    osc1.start();
    osc2.start();

    // Create a slow wave modulator (simulating deep hearing sweep waves)
    const bufferSize = ctx.sampleRate * 4.0;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.sin(i / 1500) * 0.15 + (Math.random() * 2 - 1) * 0.85;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;
    noiseSource.start(0);

    const bpFilter = ctx.createBiquadFilter();
    bpFilter.type = 'bandpass';
    bpFilter.frequency.setValueAtTime(320, ctx.currentTime);
    bpFilter.Q.setValueAtTime(3.5, ctx.currentTime);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.08, ctx.currentTime);

    noiseSource.connect(bpFilter);
    bpFilter.connect(noiseGain);
    noiseGain.connect(resonanceGain);

    // Interval to gently sweep frequencies and volumes (like deep meditative breathing)
    const breathingInterval = setInterval(() => {
      const t = ctx.currentTime;
      // sweep oscillators slightly
      const o1Freq = 432.0 + Math.sin(t * 0.15) * 4.0;
      const o2Freq = 528.0 + Math.cos(t * 0.2) * 5.0;
      osc1.frequency.setTargetAtTime(o1Freq, t, 0.4);
      osc2.frequency.setTargetAtTime(o2Freq, t, 0.4);

      // sweep lowpass frequency of background hearing sea wave noise
      const filterFreq = 300 + Math.sin(t * 0.3) * 120;
      bpFilter.frequency.setTargetAtTime(filterFreq, t, 0.5);

      // modulate gains gently
      const g1Vol = 0.12 + Math.sin(t * 0.15) * 0.08;
      const g2Vol = 0.08 + Math.cos(t * 0.2) * 0.05;
      gain1.gain.setTargetAtTime(g1Vol, t, 0.4);
      gain2.gain.setTargetAtTime(g2Vol, t, 0.4);
    }, 150);

    intervals.push(breathingInterval);
    intervals.push(osc1);
    intervals.push(osc2);
    intervals.push(noiseSource);

    intervals.push({
      stop: () => {
        try { osc1.stop(); } catch (e) {}
        try { osc2.stop(); } catch (e) {}
        try { noiseSource.stop(); } catch (e) {}
        osc1.disconnect();
        osc2.disconnect();
        noiseSource.disconnect();
        bpFilter.disconnect();
        gain1.disconnect();
        gain2.disconnect();
        noiseGain.disconnect();
        resonanceGain.disconnect();
      }
    });

    return resonanceGain;
  }

  // Internal helper to lookup source ID for scheduled tasks
  private getSoundIdByTypeName(typeName: string): string {
    // If the activeNodes map contains a key ending with 'north', 'east', 'south', or 'west'
    const found = Array.from(this.activeNodes.keys()).find(k => k.includes(typeName));
    return found || typeName;
  }
}

export const audioService = new AudioEngine();
