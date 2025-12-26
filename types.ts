
export enum DrumStyle {
  DNB = 'Drum & Bass',
  JUNGLE = 'Jungle',
  BREAKCORE = 'Breakcore'
}

export enum AmenType {
  CLASSIC = 'Classic Amen',
  APACHE = 'Apache',
  THINK = 'Think',
  HOTPANTS = 'Hot Pants',
  SOUL_PRIDE = 'Soul Pride',
  ASSEMBLE = 'Assemble',
  THE_WORM = 'The Worm'
}

export enum SoundPreset {
  STELLAR_WINDS = 'Stellar Winds',
  GRAVITY_WELL = 'Gravity Well',
  AURORA_AMBIENT = 'Aurora Ambient',
  VOID_TEXTURE = 'Void Texture',
  CELESTIAL_PAD = 'Celestial Pad',
  JUNGLE_ATMOS = 'Jungle Atmos',
  DREAM_STAB = 'Dream Stab',
  SUB_RESONANCE = 'Sub Resonance'
}

export enum TtsProvider {
  GEMINI = 'Gemini AI',
  BROWSER = 'Web Speech (System)',
  YANDEX = 'Yandex Alice',
  GIGACHAT = 'GigaChat',
  OPENAI = 'OpenAI TTS'
}

export interface PlanetConfig {
  groundColor: string;
  waterColor: string;
  fogColor: string;
  fogDensity: number;
  hasWater: boolean;
  hazardType: 'fire' | 'steam' | 'none';
  cloudColor: string;
  treeColor: string;
  hasStructures: boolean;
  structureColor: string;
}

export interface AudioSettings {
  bpm: number;
  synthVolume: number;
  beatVolume: number;
  voiceVolume: number;
  drumStyle: DrumStyle;
  amenType: AmenType;
  soundPreset: SoundPreset;
  glowEnabled: boolean; 
  glitchEnabled: boolean;
  glitchIntensity: number;
  shuffleEnabled: boolean;
  bloomIntensity: number;
  noiseIntensity: number;
  aoEnabled: boolean;
  aoRadius: number;
  aoIntensity: number;
  aoBlur: number;
  aoDistance: number;
  godRaysEnabled: boolean;
  godRaysExposure: number;
  godRaysDensity: number;
  godRaysDecay: number;
  chromaticEnabled: boolean;
  chromaticIntensity: number;
  ttsEnabled: boolean;
  ttsProvider: TtsProvider;
  selectedVoice: string;
  charSize: number;
  charSpeed: number;
  charLifetime: number;
  shapeGlowIntensity: number;
  ttsPitch: number;
  ttsRate: number;
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

export interface FlyingChar {
  id: string;
  char: string;
  position: [number, number, number];
  velocity: [number, number, number];
  createdAt: number;
  lifeTime: number;
  color: string;
  scale: number;
  chaosParams: {
    freqX: number;
    freqY: number;
    freqZ: number;
    ampX: number;
    ampY: number;
  };
}
