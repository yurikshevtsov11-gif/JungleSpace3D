
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DrumStyle, SoundPreset, AudioSettings, KandinskyShape, PhilosophyFragment, TtsProvider } from './types';
import { audioEngine } from './services/audioEngine';
import { generatePhilosophy } from './services/philosophyService';
import Visualizer from './components/Visualizer';

const App: React.FC = () => {
  const [settings, setSettings] = useState<AudioSettings>({
    bpm: 174,
    synthVolume: 0.6,
    beatVolume: 0.4,
    voiceVolume: 0.8,
    drumStyle: DrumStyle.DNB,
    soundPreset: SoundPreset.CRYSTAL_ORBIT,
    glowEnabled: true,
    glitchEnabled: false,
    shuffleEnabled: false,
    bloomIntensity: 1.2,
    noiseIntensity: 0.05,
    aoEnabled: false,
    chromaticEnabled: true,
    ttsEnabled: false,
    ttsProvider: TtsProvider.GEMINI,
    selectedVoice: 'Zephyr'
  });
  const [isStarted, setIsStarted] = useState(false);
  const [isWarping, setIsWarping] = useState(false);
  const [shapes, setShapes] = useState<KandinskyShape[]>([]);
  const [fragments, setFragments] = useState<PhilosophyFragment[]>([]);
  const [fps, setFps] = useState(0);
  const philosophyPool = useRef<string[]>([]);
  
  const lastKeyTime = useRef<number>(0);

  useEffect(() => {
    const loadPool = async () => {
      const texts = await generatePhilosophy();
      philosophyPool.current = texts;
    };
    loadPool();
  }, []);

  const handleStart = () => {
    audioEngine.init();
    audioEngine.setPreset(settings.soundPreset);
    audioEngine.setVolumes(settings.synthVolume, settings.beatVolume, settings.voiceVolume);
    audioEngine.setShuffle(settings.shuffleEnabled);
    audioEngine.startBeats(settings.bpm, settings.drumStyle);
    setIsStarted(true);
  };

  const refreshSound = () => {
    audioEngine.clearAllNotes();
    audioEngine.generateKeyMap();
    setIsWarping(true);
    setTimeout(() => setIsWarping(false), 2500);
    if (isStarted) {
      audioEngine.stopBeats();
      audioEngine.startBeats(settings.bpm, settings.drumStyle);
    }
  };

  useEffect(() => {
    if (isStarted) {
      audioEngine.setPreset(settings.soundPreset);
      audioEngine.setVolumes(settings.synthVolume, settings.beatVolume, settings.voiceVolume);
      audioEngine.setShuffle(settings.shuffleEnabled);
      audioEngine.startBeats(settings.bpm, settings.drumStyle);
    }
  }, [settings.bpm, settings.drumStyle, settings.soundPreset, settings.synthVolume, settings.beatVolume, settings.voiceVolume, settings.shuffleEnabled, isStarted]);

  const addShape = useCallback((keyCode: string) => {
    const types: KandinskyShape['type'][] = ['sphere', 'torus', 'octahedron', 'box', 'cylinder', 'line'];
    const colors = ['#ff00ff', '#00ffff', '#ffff00', '#ff0000', '#00ff00', '#ffffff', '#ffa500', '#8a2be2', '#ec4899', '#06b6d4'];
    const type = types[Math.floor(Math.random() * types.length)];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    const mainShape: KandinskyShape = {
      id: Math.random().toString(36).substr(2, 9),
      type: type,
      color: color,
      position: [(Math.random() - 0.5) * 4500, (Math.random() - 0.5) * 3600, -3000 - Math.random() * 4000],
      velocity: [(Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, 0.2 + Math.random() * 0.3],
      rotation: [Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI],
      rotationSpeed: [(Math.random() - 0.5) * 0.005, (Math.random() - 0.5) * 0.005, (Math.random() - 0.5) * 0.005], 
      scale: 50 + Math.random() * 750, 
      createdAt: Date.now(),
      lifeTime: 12000 + Math.random() * 30000, 
      jitter: Math.random() * 0.05
    };

    if (type === 'line') {
      const points = new Float32Array(6);
      points[3] = (Math.random() - 0.5) * 1000; points[4] = (Math.random() - 0.5) * 1000; points[5] = (Math.random() - 0.5) * 1000;
      mainShape.pointsData = points;
    }

    setShapes(prev => [...prev.slice(-200), mainShape]);

    if (Date.now() - lastKeyTime.current > 4000 && philosophyPool.current.length > 0) {
      const text = philosophyPool.current[Math.floor(Math.random() * philosophyPool.current.length)];
      const newFragment: PhilosophyFragment = {
        id: Math.random().toString(36).substr(2, 9),
        text,
        position: [(Math.random() - 0.5) * 1500, (Math.random() - 0.5) * 1000, -1500 - Math.random() * 1500],
        velocity: [(Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05, 0.1 + Math.random() * 0.1],
        createdAt: Date.now(),
        scale: 10 + Math.random() * 15,
        lifeTime: 30000 + Math.random() * 10000 
      };
      setFragments(prev => [...prev.slice(-12), newFragment]);
      lastKeyTime.current = Date.now();

      if (settings.ttsEnabled) {
        if (settings.ttsProvider === TtsProvider.BROWSER) {
          audioEngine.speakWebSpeech(text, settings.voiceVolume);
        } else {
          audioEngine.speakCloud(text, settings.ttsProvider, settings.selectedVoice, settings.voiceVolume);
        }
      }
    }
  }, [settings.ttsEnabled, settings.ttsProvider, settings.selectedVoice, settings.voiceVolume]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isStarted) return;
      if (e.repeat) return;
      if (e.key.length === 1 && /[a-zA-Zа-яА-ЯёЁ]/.test(e.key)) {
        audioEngine.playNote(e.code);
        addShape(e.code);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => { if (!isStarted) return; audioEngine.stopNote(e.code); };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [isStarted, addShape]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setShapes(prev => prev.filter(s => now - s.createdAt < s.lifeTime));
      setFragments(prev => prev.filter(f => now - f.createdAt < f.lifeTime));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleSetting = (key: keyof AudioSettings) => setSettings(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#010103] select-none font-['Inter'] text-white">
      <Visualizer 
        shapes={shapes} fragments={fragments} isStarted={isStarted} isWarping={isWarping} onFpsUpdate={setFps} 
        glowEnabled={settings.glowEnabled} glitchEnabled={settings.glitchEnabled} 
        bloomIntensity={settings.bloomIntensity} noiseIntensity={settings.noiseIntensity} 
        aoEnabled={settings.aoEnabled} chromaticEnabled={settings.chromaticEnabled}
      />

      {isStarted && (
        <>
          <div className="absolute top-1/2 right-12 -translate-y-1/2 text-[28vw] font-black tabular-nums text-white/[0.18] pointer-events-none select-none z-10 leading-none tracking-tighter">
            {settings.bpm}
          </div>

          <div className="absolute left-8 top-1/2 -translate-y-1/2 flex flex-col gap-16 z-40 pointer-events-auto">
            {['synthVolume', 'beatVolume', 'voiceVolume'].map((volKey, idx) => (
              <div key={volKey} className="flex flex-col items-center gap-4">
                <span className="text-[10px] text-white/40 font-black uppercase tracking-tighter vertical-text transform -rotate-90 origin-center whitespace-nowrap mb-8">
                  {volKey.replace('Volume', '').toUpperCase()}
                </span>
                <div className="relative h-40 w-12 flex items-center justify-center">
                  <input 
                    type="range" min="0" max="1" step="0.05"
                    value={(settings as any)[volKey]}
                    onChange={(e) => setSettings(s => ({...s, [volKey]: parseFloat(e.target.value)}))}
                    className={`w-40 h-2 bg-white/10 rounded-full appearance-none cursor-pointer transform -rotate-90 ${idx === 0 ? 'accent-cyan-400' : idx === 1 ? 'accent-pink-500' : 'accent-emerald-400'}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!isStarted ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/98 z-50 p-6">
          <h1 className="text-8xl md:text-[10rem] font-black mb-8 bg-gradient-to-tr from-indigo-500 via-cyan-400 to-white bg-clip-text text-transparent tracking-tighter filter drop-shadow-[0_0_50px_rgba(6,182,212,0.6)]">
            KANDINSKY 16.5
          </h1>
          <button onClick={handleStart} className="px-32 py-12 bg-white text-black rounded-full text-4xl font-black transition-all hover:scale-105 active:scale-90 shadow-[0_0_80px_rgba(255,255,255,0.4)] uppercase tracking-[0.3em]">
            Инициировать
          </button>
        </div>
      ) : (
        <div className="absolute bottom-0 left-0 w-full p-8 z-40 pointer-events-none">
          <div className="flex flex-col gap-6 p-7 rounded-[3rem] bg-black/10 backdrop-blur-[40px] border border-white/5 pointer-events-auto max-w-full mx-auto">
            
            <div className="flex flex-wrap items-center justify-center gap-6">
              <div className="flex gap-3 pr-6 border-r border-white/10">
                <button onClick={refreshSound} className={`px-6 py-4 rounded-2xl text-sm font-black transition-all border border-white/10 uppercase tracking-widest ${isWarping ? 'bg-cyan-500 text-black border-cyan-400' : 'text-white/60 hover:bg-white/10'}`}>
                  SOUNDS ⟳
                </button>
                <button 
                  onClick={() => toggleSetting('shuffleEnabled')}
                  className={`px-6 py-4 rounded-2xl text-sm font-black transition-all border uppercase tracking-widest ${settings.shuffleEnabled ? 'bg-orange-500/30 text-orange-400 border-orange-500/50' : 'text-white/40 border-white/5'}`}
                >
                  CHAOS
                </button>
              </div>

              <div className="flex flex-col gap-3 px-6 border-r border-white/10 min-w-[160px]">
                <div className="flex items-center gap-4">
                  <span className="text-[10px] text-white/30 uppercase font-black w-14">Bloom</span>
                  <input 
                    type="range" min="0" max="4" step="0.1"
                    value={settings.bloomIntensity}
                    onChange={(e) => setSettings(s => ({...s, bloomIntensity: parseFloat(e.target.value)}))}
                    className="w-28 h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] text-white/30 uppercase font-black w-14">Noise</span>
                  <input 
                    type="range" min="0" max="0.5" step="0.01"
                    value={settings.noiseIntensity}
                    onChange={(e) => setSettings(s => ({...s, noiseIntensity: parseFloat(e.target.value)}))}
                    className="w-28 h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-fuchsia-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 px-6 border-r border-white/10">
                <button onClick={() => toggleSetting('glitchEnabled')} className={`px-4 py-4 rounded-2xl text-xs font-black transition-all border uppercase tracking-widest ${settings.glitchEnabled ? 'bg-fuchsia-500/30 text-fuchsia-400 border-fuchsia-500/50' : 'text-white/40 border-white/5'}`}>FX</button>
                <button onClick={() => toggleSetting('aoEnabled')} className={`px-4 py-4 rounded-2xl text-xs font-black transition-all border uppercase tracking-widest ${settings.aoEnabled ? 'bg-indigo-500/30 text-indigo-400 border-indigo-500/50' : 'text-white/40 border-white/5'}`}>AO</button>
                <button onClick={() => toggleSetting('chromaticEnabled')} className={`px-4 py-4 rounded-2xl text-xs font-black transition-all border uppercase tracking-widest ${settings.chromaticEnabled ? 'bg-emerald-500/30 text-emerald-400 border-emerald-500/50' : 'text-white/40 border-white/5'}`}>RGB</button>
              </div>

              <div className="flex gap-4 px-6 border-r border-white/10 items-center">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-white/30 uppercase font-black">Движок</span>
                  <select 
                    value={settings.ttsProvider}
                    onChange={(e) => setSettings(s => ({...s, ttsProvider: e.target.value as TtsProvider}))}
                    className="bg-black/40 text-[10px] font-black p-2 rounded-xl border border-white/10 text-cyan-400 outline-none"
                  >
                    {Object.values(TtsProvider).map(tp => <option key={tp} value={tp}>{tp}</option>)}
                  </select>
                </div>
                
                {settings.ttsProvider !== TtsProvider.BROWSER && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-white/30 uppercase font-black">Голос</span>
                    <select 
                      value={settings.selectedVoice}
                      onChange={(e) => setSettings(s => ({...s, selectedVoice: e.target.value}))}
                      className="bg-black/40 text-[10px] font-black p-2 rounded-xl border border-white/10 text-fuchsia-400 outline-none"
                    >
                      {audioEngine.geminiVoices.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                )}
                
                <button 
                  onClick={() => toggleSetting('ttsEnabled')}
                  className={`px-5 py-4 rounded-2xl text-sm font-black transition-all border uppercase tracking-widest ${settings.ttsEnabled ? 'bg-emerald-500 text-black border-emerald-400' : 'text-white/40 border-white/5'}`}
                >
                  VOICE {settings.ttsEnabled ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="flex items-center gap-5 px-6">
                <span className="text-sm text-white/30 font-black uppercase">BPM</span>
                <input 
                  type="range" min="60" max="240" step="1"
                  value={settings.bpm}
                  onChange={(e) => setSettings(s => ({...s, bpm: parseInt(e.target.value)}))}
                  className="w-32 h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-white"
                />
                <span className="text-xl text-white/90 font-mono w-12 tabular-nums">{settings.bpm}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 pt-4 border-t border-white/5">
              <div className="flex gap-2">
                {Object.values(SoundPreset).map(p => (
                  <button
                    key={p}
                    onClick={() => setSettings(s => ({...s, soundPreset: p}))}
                    className={`px-3 py-2 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest border ${settings.soundPreset === p ? 'bg-cyan-500 text-black border-cyan-400' : 'text-white/20 border-white/5 hover:text-white/50'}`}
                  >
                    {p.split(' ')[0]}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {[DrumStyle.DNB, DrumStyle.JUNGLE, DrumStyle.BREAKCORE].map(style => (
                  <button 
                    key={style}
                    onClick={() => setSettings(s => ({...s, drumStyle: style}))}
                    className={`px-4 py-2 text-[10px] font-black rounded-xl transition-all border uppercase tracking-widest ${settings.drumStyle === style ? 'bg-white text-black border-white' : 'text-white/30 border-white/5 hover:bg-white/5'}`}
                  >
                    {style.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default App;
