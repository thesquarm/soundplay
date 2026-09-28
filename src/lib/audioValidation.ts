export const AUDIO_INPUT_ACCEPT =
  'audio/*,.wav,.WAV,.wave,.mp3,.m4a,.m4r,.aac,.caf,.aiff,.aif,.flac,.ogg,.weba,.webm,audio/wav,audio/x-wav,audio/wave,audio/vnd.wave,audio/mpeg,audio/mp4,audio/aac,audio/x-m4a,audio/m4a,audio/caf,audio/aiff';

export const MAX_AUDIO_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

const KNOWN_AUDIO_EXTENSIONS = new Set([
  'wav',
  'wave',
  'mp3',
  'm4a',
  'm4r',
  'aac',
  'flac',
  'ogg',
  'oga',
  'weba',
  'webm',
  'caf',
  'aif',
  'aiff',
  'opus',
  'wma'
]);

export interface AudioValidationResult {
  valid: boolean;
  error?: string;
}

export function validateAudioUpload(file: File): AudioValidationResult {
  if (file.size > MAX_AUDIO_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File "${file.name}" (${sizeMb} MB) exceeds the maximum allowed size of 50 MB.`
    };
  }

  const isAudioMime = file.type && file.type.startsWith('audio/');
  const extMatch = file.name.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  const hasKnownExt = KNOWN_AUDIO_EXTENSIONS.has(ext);

  if (!isAudioMime && !hasKnownExt) {
    return {
      valid: false,
      error: `"${file.name}" is not a recognized audio file. Please select a valid audio file (e.g. .wav, .mp3, .m4a, .aac, .flac).`
    };
  }

  return { valid: true };
}

export function extractSoundName(fileName: string): string {
  const baseName = fileName.replace(/\.[^.]+$/, '').trim();
  return baseName.length > 0 ? baseName : 'Custom Sound';
}
