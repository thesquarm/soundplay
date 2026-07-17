export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export type SoundType = 'north' | 'east' | 'south' | 'west' | 'uploaded';

export interface SoundSource {
  id: string;
  name: string;
  type: 'procedural' | 'uploaded';
  soundType: SoundType;
  x: number;
  z: number;
  isPlaying: boolean;
  volume: number; // 0 to 1
  fileSize?: string;
  nodeShape?: 'sphere' | 'cube' | 'pyramid' | 'torus' | 'cylinder';
  nodeColor?: string;
  reverbWetness?: number; // 0 to 1
  reverbType?: 'none' | 'short' | 'long';
  delayEnabled?: boolean;
  delayTime?: number; // 0.1 to 1.0
  delayFeedback?: number; // 0 to 0.9
  filterType?: 'none' | 'lowpass' | 'highpass';
  filterFrequency?: number; // 100 to 10000
  dopplerEnabled?: boolean;
  dopplerFactor?: number; // 0 to 10
}

export interface CameraState {
  x: number;
  z: number;
  angle: number; // Yaw angle in radians (looking around)
  pitch: number; // Pitch angle in radians (looking up/down)
}

export interface RecordingState {
  isRecording: boolean;
  duration: number; // in seconds
  type: 'audio-video' | 'audio-only';
}
