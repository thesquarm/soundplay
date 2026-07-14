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
