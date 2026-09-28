import { useState, useRef, useEffect, useCallback } from 'react';

interface UseMicRecorderOptions {
  onRecordingComplete: (file: File) => void;
}

export function useMicRecorder({ onRecordingComplete }: UseMicRecorderOptions) {
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [micSeconds, setMicSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  // Helper to ensure all hardware tracks are stopped immediately
  const stopStreamTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          // ignore error on stop
        }
      });
      streamRef.current = null;
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Guarantee microphone hardware releases when the hook unmounts
  useEffect(() => {
    return () => {
      stopStreamTracks();
      clearTimer();
    };
  }, [stopStreamTracks, clearTimer]);

  const startMicRecording = useCallback(async () => {
    setMicError(null);
    micChunksRef.current = [];

    // Ensure any previously lingering stream tracks are closed
    stopStreamTracks();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone audio recording is not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          micChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onerror = (e) => {
        console.error('MediaRecorder error:', e);
        setMicError('Recording error occurred.');
        stopStreamTracks();
        clearTimer();
        setIsRecordingMic(false);
      };

      mediaRecorder.onstop = () => {
        try {
          const actualMimeType = mediaRecorder.mimeType || 'audio/mp4';
          const blob = new Blob(micChunksRef.current, { type: actualMimeType });

          let extension = 'mp4';
          if (actualMimeType.includes('webm')) {
            extension = 'webm';
          } else if (actualMimeType.includes('ogg')) {
            extension = 'ogg';
          } else if (actualMimeType.includes('wav')) {
            extension = 'wav';
          } else if (actualMimeType.includes('aac')) {
            extension = 'aac';
          }

          const file = new File([blob], `mic_recording_${Date.now()}.${extension}`, {
            type: actualMimeType
          });

          onRecordingComplete(file);
        } finally {
          // Always stop stream tracks when stopped
          stopStreamTracks();
        }
      };

      mediaRecorder.start();
      setIsRecordingMic(true);
      setMicSeconds(0);

      clearTimer();
      timerRef.current = setInterval(() => {
        setMicSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Mic access failed:', err);
      stopStreamTracks();
      clearTimer();
      setIsRecordingMic(false);
      setMicError(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Microphone permission was denied.'
          : err.message || 'Microphone access denied or unavailable.'
      );
    }
  }, [onRecordingComplete, stopStreamTracks, clearTimer]);

  const stopMicRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.error('Error stopping MediaRecorder:', e);
      }
    }
    setIsRecordingMic(false);
    clearTimer();
  }, [clearTimer]);

  const clearMicError = useCallback(() => {
    setMicError(null);
  }, []);

  return {
    isRecordingMic,
    micSeconds,
    micError,
    startMicRecording,
    stopMicRecording,
    clearMicError
  };
}
