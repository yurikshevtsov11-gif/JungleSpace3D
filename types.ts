
export enum DrumStyle {
  DNB = 'Drum & Bass',
  JUNGLE = 'Jungle',
  BREAKCORE = 'Breakcore'
}

export enum SoundPreset {
  CRYSTAL_ORBIT = 'Crystal Orbit',
  NEBULA_PAD = 'Nebula Pad',
  DEEP_SPACE_ORGAN = 'Deep Space Organ',
  STELLAR_WINDS = 'Stellar Winds',
  PULSAR_DRONE = 'Pulsar Drone',
  VOID_RESONANCE = 'Void Resonance',
  GRAVITY_WELL = 'Gravity Well',
  GALACTIC_FLUTE = 'Galactic Flute'
}

export enum TtsProvider {
  GEMINI = 'Gemini AI',
  BROWSER = 'Web Speech (System)',
  YANDEX = 'Yandex Alice',
  GIGACHAT = 'GigaChat',
  OPENAI = 'OpenAI TTS'
}

export interface AudioSettings {
  bpm: number;
  synthVolume: number;
  beatVolume: number;
  voiceVolume: number;
  drumStyle: DrumStyle;
  soundPreset: SoundPreset;
  glowEnabled: boolean; 
  glitchEnabled: boolean;
  shuffleEnabled: boolean;
  bloomIntensity: number;
  noiseIntensity: number;
  aoEnabled: boolean;
  chromaticEnabled: boolean;
  ttsEnabled: boolean;
  ttsProvider: TtsProvider;
  selectedVoice: string;
}

export interface KandinskyShape {
  id: string;
  type: 'sphere' | 'torus' | 'octahedron' | 'box' | 'cylinder' | 'points' | 'line';
  color: string;
  position: [number, number, number];
  velocity: [number, number, number];
  rotation: [number, number, number];
  rotationSpeed: [number, number, number];
  scale: number;
  createdAt: number;
  lifeTime: number;
  jitter: number;
  pointsData?: Float32Array;
}

export interface PhilosophyFragment {
  id: string;
  text: string;
  position: [number, number, number];
  velocity: [number, number, number];
  createdAt: number;
  scale: number;
  lifeTime: number;
}
