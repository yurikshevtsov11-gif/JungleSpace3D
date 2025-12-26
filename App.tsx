
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DrumStyle, AmenType, SoundPreset, AudioSettings, KandinskyShape, PhilosophyFragment, TtsProvider, FlyingChar, PlanetConfig } from './types';
import { audioEngine } from './services/audioEngine';
import { generatePhilosophy } from './services/philosophyService';
import Visualizer from './components/Visualizer';
import NumericControl from './components/NumericControl';

const App: React.FC = () => {
  const generatePlanetConfig = (): PlanetConfig => {
    const groundColors = ['#1a1a3a', '#3a2010', '#153a15', '#351035', '#102540', '#111111', '#441111'];
    const fogColors = ['#0a0a20', '#2a1505', '#052a05', '#1a0525', '#051525', '#250505', '#111111'];
    const hazards: ('fire' | 'steam' | 'none')[] = ['fire', 'steam', 'none'];
    
    return {
      groundColor: groundColors[Math.floor(Math.random() * groundColors.length)],
      waterColor: ['#00ffff', '#ff00ff', '#4444ff', '#00ffaa'][ Math.floor(Math.random() * 4)],
      fogColor: fogColors[Math.floor(Math.random() * fogColors.length)],
      fogDensity: 0.0002 + Math.random() * 0.0008,
      hasWater: Math.random() > 0.4,
      hazardType: hazards[Math.floor(Math.random() * hazards.length)],
      cloudColor: ['#ffffff', '#ffcc55', '#cc55ff', '#55ccff'][Math.floor(Math.random() * 4)],
      treeColor: ['#1a1a1a', '#2a2a2a', '#332211', '#000000'][Math.floor(Math.random() * 4)],
      hasStructures: Math.random() > 0.5,
      structureColor: ['#888888', '#555555', '#333333', '#ffffff', '#ff0055'][Math.floor(Math.random() * 5)]
    };
  };

  const [settings, setSettings] = useState<AudioSettings>({
    bpm: 174,
    synthVolume: 0.6,
    beatVolume: 0.4,
    voiceVolume: 0.8,
    drumStyle: DrumStyle.DNB,
    amenType: AmenType.CLASSIC,
    soundPreset: SoundPreset.STELLAR_WINDS,
    glowEnabled: true,
    glitchEnabled: false,
    glitchIntensity: 10,
    shuffleEnabled: false,
    bloomIntensity: 1.2,
    noiseIntensity: 0.05,
    aoEnabled: false,
    aoRadius: 10,
    aoIntensity: 0.1, 
    aoBlur: 10,
    aoDistance: 500,
    godRaysEnabled: false,
    godRaysExposure: 0.6,
    godRaysDensity: 0.96,
    godRaysDecay: 0.93,
    chromaticEnabled: true,
    chromaticIntensity: 0.003,
    ttsEnabled: false,
    ttsProvider: TtsProvider.GEMINI,
    selectedVoice: 'Zephyr',
    charSize: 1.0,
    charSpeed: 1.0,
    charLifetime: 6000,
    shapeGlowIntensity: 1.5,
    ttsPitch: 1.0,
    ttsRate: 1.0
  });
  const [isStarted, setIsStarted] = useState(false);
  const [isWarping, setIsWarping] = useState(false);
  const [isLanded, setIsLanded] = useState(false);
  const [planetConfig, setPlanetConfig] = useState<PlanetConfig>(generatePlanetConfig());
  const [shapes, setShapes] = useState<KandinskyShape[]>([]);
  const [fragments, setFragments] = useState<PhilosophyFragment[]>([]);
  const [flyingChars, setFlyingChars] = useState<FlyingChar[]>([]);
  const [fps, setFps] = useState(0);
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([]);
  const philosophyPool = useRef<string[]>([]);
  
  const lastKeyTime = useRef<number>(0);

  useEffect(() => {
    const loadPool = async () => {
      const texts = await generatePhilosophy();
      philosophyPool.current = texts;
    };
    loadPool();

    const fetchVoices = () => {
      const voices = audioEngine.getSystemVoices();
      if (voices.length > 0) setSystemVoices(voices);
    };
    fetchVoices();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = fetchVoices;
    }
  }, []);

  const handleStart = () => {
    audioEngine.init();
    audioEngine.setPreset(settings.soundPreset);
    audioEngine.setVolumes(settings.synthVolume, settings.beatVolume, settings.voiceVolume);
    audioEngine.startBeats(settings.bpm, settings.drumStyle, settings.amenType);
    setIsStarted(true);
  };

  const handleHyper = () => {
    const randomBpm = Math.floor(Math.random() * (220 - 120) + 120);
    const styles = [DrumStyle.DNB, DrumStyle.JUNGLE, DrumStyle.BREAKCORE];
    const amens = Object.values(AmenType);
    const presets = Object.values(SoundPreset);
    
    const nextStyle = styles[Math.floor(Math.random() * styles.length)];
    const nextAmen = amens[Math.floor(Math.random() * amens.length)];
    const nextPreset = presets[Math.floor(Math.random() * presets.length)];

    setSettings(prev => ({
      ...prev,
      bpm: randomBpm,
      drumStyle: nextStyle,
      amenType: nextAmen,
      soundPreset: nextPreset
    }));

    audioEngine.clearAllNotes();
    audioEngine.generateKeyMap();
    setIsWarping(true);
    setIsLanded(false); 
    setPlanetConfig(generatePlanetConfig()); 
    setTimeout(() => setIsWarping(false), 2500);
    
    if (isStarted) {
      audioEngine.stopBeats();
      audioEngine.startBeats(randomBpm, nextStyle, nextAmen);
    }
  };

  const handleStopAll = () => {
    audioEngine.clearAllNotes();
    audioEngine.stopBeats();
  };

  const toggleLanding = () => {
    setIsLanded(!isLanded);
  };

  useEffect(() => {
    if (isStarted) {
      audioEngine.setPreset(settings.soundPreset);
      audioEngine.setVolumes(settings.synthVolume, settings.beatVolume, settings.voiceVolume);
      audioEngine.stopBeats();
      audioEngine.startBeats(settings.bpm, settings.drumStyle, settings.amenType);
    }
  }, [settings.bpm, settings.drumStyle, settings.amenType, settings.soundPreset, settings.synthVolume, settings.beatVolume, settings.voiceVolume, isStarted]);

  const addShape = useCallback((keyCode: string, char: string) => {
    const types: KandinskyShape['type'][] = ['sphere', 'torus', 'octahedron', 'box', 'cylinder', 'line'];
    const colors = ['#ff00ff', '#00ffff', '#ffff00', '#ff0000', '#00ff00', '#ffffff', '#ffa500', '#8a2be2', '#ec4899', '#06b6d4'];
    const type = types[Math.floor(Math.random() * types.length)];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    const mainShape: KandinskyShape = {
      id: Math.random().toString(36).substr(2, 9),
      type: type,
      color: color,
      position: [(Math.random() - 0.5) * 4500, (Math.random() - 0.5) * 3600, -3000 - Math.random() * 4000],
      velocity: [(Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, 0.5 + Math.random() * 1.5],
      rotation: [Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI],
      rotationSpeed: [(Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.01], 
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

    setShapes(prev => [...prev.slice(-150), mainShape]);

    const newChar: FlyingChar = {
      id: Math.random().toString(36).substr(2, 9),
      char: char.toUpperCase(),
      position: [(Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200, -50], 
      velocity: [
        (Math.random() - 0.5) * 1.0 * settings.charSpeed, 
        (Math.random() - 0.5) * 1.0 * settings.charSpeed, 
        (-2 - Math.random() * 18) * settings.charSpeed
      ], 
      createdAt: Date.now(),
      lifeTime: settings.charLifetime, 
      color: '#ffffff', 
      scale: settings.charSize,
      chaosParams: {
        freqX: (0.0015 + Math.random() * 0.004),
        freqY: (0.0015 + Math.random() * 0.004),
        freqZ: (0.0015 + Math.random() * 0.004),
        ampX: (15 + Math.random() * 45) * settings.charSize, 
        ampY: (15 + Math.random() * 45) * settings.charSize, 
      }
    };
    setFlyingChars(prev => [...prev.slice(-100), newChar]);

    if (Date.now() - lastKeyTime.current > 4000 && philosophyPool.current.length > 0) {
      const text = philosophyPool.current[Math.floor(Math.random() * philosophyPool.current.length)];
      const newFragment: PhilosophyFragment = {
        id: Math.random().toString(36).substr(2, 9),
        text,
        position: [(Math.random() - 0.5) * 1500, (Math.random() - 0.5) * 1000, -1500 - Math.random() * 1500],
        velocity: [(Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, 0.5 + Math.random() * 1.5],
        createdAt: Date.now(),
        scale: 10 + Math.random() * 15,
        lifeTime: 30000 + Math.random() * 10000 
      };
      setFragments(prev => [...prev.slice(-10), newFragment]);
      lastKeyTime.current = Date.now();

      if (settings.ttsEnabled) {
        if (settings.ttsProvider === TtsProvider.BROWSER) {
          audioEngine.speakWebSpeech(text, settings.voiceVolume, settings.selectedVoice, settings.ttsPitch, settings.ttsRate);
        } else {
          audioEngine.speakCloud(text, settings.ttsProvider, settings.selectedVoice, settings.voiceVolume);
        }
      }
    }
  }, [settings, philosophyPool.current]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isStarted) return;
      if (e.key === 'ArrowUp') { setSettings(s => ({ ...s, bpm: Math.min(240, s.bpm + 2) })); return; }
      if (e.key === 'ArrowDown') { setSettings(s => ({ ...s, bpm: Math.max(40, s.bpm - 2) })); return; }
      if (e.repeat) return;
      if (e.key.length === 1 && /[a-zA-Zа-яА-ЯёЁ]/.test(e.key)) {
        audioEngine.playNote(e.code);
        addShape(e.code, e.key);
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
      setFlyingChars(prev => prev.filter(c => now - c.createdAt < c.lifeTime));
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const toggleSetting = (key: keyof AudioSettings) => setSettings(prev => ({ ...prev, [key]: !prev[key] }));

  const getFpsColor = () => {
    if (fps < 30) return 'text-red-500';
    if (fps < 55) return 'text-yellow-400';
    return 'text-emerald-400';
  };

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const provider = e.target.value as TtsProvider;
    setSettings(s => ({
      ...s,
      ttsProvider: provider,
      selectedVoice: provider === TtsProvider.BROWSER ? (systemVoices[0]?.name || '') : 'Zephyr'
    }));
  };

  // Mappers for 0-100 controls
  const map0100 = (val: number, min: number, max: number) => min + (val / 100) * (max - min);
  const rev0100 = (val: number, min: number, max: number) => ((val - min) / (max - min)) * 100;

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#010103] select-none font-['Inter'] text-white">
      <style>{`
        .bpm-transparent-text {
          color: rgba(255, 255, 255, 0.08);
          -webkit-text-stroke: 1px rgba(0, 0, 0, 0.6);
        }
        .outline-text {
          text-shadow: -1px -1px 0 rgba(0,0,0,0.8), 1px -1px 0 rgba(0,0,0,0.8), -1px 1px 0 rgba(0,0,0,0.8), 1px 1px 0 rgba(0,0,0,0.8);
        }
        button:hover { text-shadow: 0 0 10px currentColor; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .block-label {
          font-size: 9px;
          letter-spacing: 0.25em;
          color: rgba(255,255,255,0.25);
          font-weight: 900;
          text-transform: uppercase;
          border-bottom: 1px solid rgba(255,255,255,0.1);
          padding-bottom: 4px;
          width: 100%;
          text-align: right;
        }
        .block-label-left {
          text-align: left;
        }
      `}</style>

      <Visualizer 
        shapes={shapes} fragments={fragments} flyingChars={flyingChars} isStarted={isStarted} 
        isWarping={isWarping} isLanded={isLanded} planetConfig={planetConfig} onFpsUpdate={setFps} 
        glowEnabled={settings.glowEnabled} 
        glitchEnabled={settings.glitchEnabled} 
        glitchIntensity={settings.glitchIntensity}
        bloomIntensity={settings.bloomIntensity} 
        noiseIntensity={settings.noiseIntensity} 
        aoEnabled={settings.aoEnabled} 
        aoRadius={settings.aoRadius}
        aoIntensity={settings.aoIntensity}
        aoBlur={settings.aoBlur}
        aoDistance={settings.aoDistance}
        godRaysEnabled={settings.godRaysEnabled} 
        godRaysExposure={settings.godRaysExposure}
        godRaysDensity={settings.godRaysDensity}
        godRaysDecay={settings.godRaysDecay}
        chromaticEnabled={settings.chromaticEnabled}
        chromaticIntensity={settings.chromaticIntensity}
        shapeGlowIntensity={settings.shapeGlowIntensity}
      />

      {isStarted && (
        <>
          <div className={`absolute top-6 right-6 z-50 font-mono font-black text-xl flex items-center gap-2 drop-shadow-[0_0_10px_rgba(0,0,0,1)] ${getFpsColor()}`}>
            <span className="text-[10px] uppercase opacity-50 tracking-widest">FPS</span>
            {fps}
          </div>

          <div className="absolute top-1/2 right-24 -translate-y-1/2 text-[28vw] font-black tabular-nums bpm-transparent-text pointer-events-none select-none z-10 leading-none tracking-tighter">
            {settings.bpm}
          </div>

          {/* Left Side Panel: Mixer, Characters, Shapes */}
          <div className="absolute left-8 top-1/2 -translate-y-1/2 h-[90vh] overflow-y-auto no-scrollbar flex flex-col gap-12 z-40 pointer-events-auto items-start py-8">
            
            {/* Block: Mixer */}
            <div className="flex flex-col gap-8 items-start w-48">
              <span className="block-label block-label-left">MIXER</span>
              <div className="flex gap-10">
                {['synthVolume', 'beatVolume', 'voiceVolume'].map((volKey) => (
                  <NumericControl 
                    key={volKey}
                    label={volKey.replace('Volume', '')}
                    value={rev0100((settings as any)[volKey], 0, 1)}
                    onChange={(v) => setSettings(s => ({...s, [volKey]: map0100(v, 0, 1)}))}
                    vertical
                  />
                ))}
              </div>
            </div>

            {/* Block: Characters */}
            <div className="flex flex-col gap-6 items-start w-48">
               <span className="block-label block-label-left">CHARACTERS</span>
               <NumericControl label="SIZE" value={rev0100(settings.charSize, 0.2, 4.0)} onChange={(v) => setSettings(s => ({...s, charSize: map0100(v, 0.2, 4.0)}))} />
               <NumericControl label="SPEED" value={rev0100(settings.charSpeed, 0.02, 5.0)} onChange={(v) => setSettings(s => ({...s, charSpeed: map0100(v, 0.02, 5.0)}))} />
               <NumericControl label="LIFE" value={rev0100(settings.charLifetime, 1000, 15000)} onChange={(v) => setSettings(s => ({...s, charLifetime: map0100(v, 1000, 15000)}))} />
             </div>

             {/* Block: Shapes Glow */}
             <div className="flex flex-col gap-6 items-start w-48">
               <span className="block-label block-label-left">SHAPES</span>
               <NumericControl label="GLOW" value={rev0100(settings.shapeGlowIntensity, 0, 10)} onChange={(v) => setSettings(s => ({...s, shapeGlowIntensity: map0100(v, 0, 10)}))} />
             </div>
          </div>

          {/* Right Side Panel: AO, GodRays, PostFX */}
          <div className="absolute right-8 top-1/2 -translate-y-1/2 h-[90vh] overflow-y-auto no-scrollbar flex flex-col gap-10 z-40 pointer-events-auto items-end pr-2 py-8">
             
             {/* Block: Ambient Occlusion */}
             <div className="flex flex-col gap-6 items-end w-48">
               <span className="block-label">AMBIENT OCCLUSION</span>
               <NumericControl label="AO.RAD" value={rev0100(settings.aoRadius, 0.1, 80)} onChange={(v) => setSettings(s => ({...s, aoRadius: map0100(v, 0.1, 80)}))} />
               <NumericControl 
                 label="AO.PWR" 
                 value={settings.aoIntensity} 
                 max={100}
                 onChange={(v) => setSettings(s => ({...s, aoIntensity: v}))}
                 getStep={(current, dir) => (current < 0.2 || (current === 0.2 && dir < 0)) ? 0.01 : (current < 1 || (current === 1 && dir < 0)) ? 0.1 : 1.0}
               />
               <NumericControl label="AO.DIST" value={rev0100(settings.aoDistance, 1, 3000)} onChange={(v) => setSettings(s => ({...s, aoDistance: map0100(v, 1, 3000)}))} />
               <NumericControl label="AO.BLUR" value={rev0100(settings.aoBlur, 0, 40)} onChange={(v) => setSettings(s => ({...s, aoBlur: map0100(v, 0, 40)}))} />
             </div>

             {/* Block: God Rays */}
             <div className="flex flex-col gap-6 items-end w-48">
               <span className="block-label">GOD RAYS</span>
               <NumericControl label="GOD.EXP" value={rev0100(settings.godRaysExposure, 0, 2.0)} onChange={(v) => setSettings(s => ({...s, godRaysExposure: map0100(v, 0, 2.0)}))} />
               <NumericControl label="GOD.DNS" value={rev0100(settings.godRaysDensity, 0.5, 1.0)} onChange={(v) => setSettings(s => ({...s, godRaysDensity: map0100(v, 0.5, 1.0)}))} />
               <NumericControl label="GOD.DCY" value={rev0100(settings.godRaysDecay, 0.8, 1.0)} onChange={(v) => setSettings(s => ({...s, godRaysDecay: map0100(v, 0.8, 1.0)}))} />
             </div>

             {/* Block: RGB & FX */}
             <div className="flex flex-col gap-6 items-end w-48">
               <span className="block-label">VISUAL EFFECTS</span>
               <NumericControl label="RGB.AMT" value={rev0100(settings.chromaticIntensity, 0, 0.05)} onChange={(v) => setSettings(s => ({...s, chromaticIntensity: map0100(v, 0, 0.05)}))} />
               <NumericControl label="FX.GLITCH" value={rev0100(settings.glitchIntensity, 0, 100)} onChange={(v) => setSettings(s => ({...s, glitchIntensity: v}))} />
               <NumericControl label="NOISE" value={rev0100(settings.noiseIntensity, 0, 0.3)} onChange={(v) => setSettings(s => ({...s, noiseIntensity: map0100(v, 0, 0.3)}))} />
               <NumericControl label="BLOOM" value={rev0100(settings.bloomIntensity, 0, 5)} onChange={(v) => setSettings(s => ({...s, bloomIntensity: map0100(v, 0, 5)}))} />
             </div>
          </div>
        </>
      )}

      {!isStarted ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/98 z-50 p-6">
          <h1 className="text-8xl md:text-[10rem] font-black mb-8 bg-gradient-to-tr from-indigo-500 via-cyan-400 to-white bg-clip-text text-transparent tracking-tighter filter drop-shadow-[0_0_50px_rgba(6,182,212,0.6)]">
            KANDINSKY 16.5
          </h1>
          <button onClick={handleStart} className="px-32 py-12 border-2 border-white/50 text-white rounded-full text-4xl font-black transition-all hover:bg-white hover:text-black hover:scale-105 active:scale-90 shadow-[0_0_80px_rgba(255,255,255,0.2)] uppercase tracking-[0.3em]">
            ENTER
          </button>
        </div>
      ) : (
        <div className="absolute bottom-0 left-0 w-full p-12 z-40 pointer-events-none">
          <div className="flex flex-col gap-8 pointer-events-auto">
            <div className="flex flex-wrap items-center justify-center gap-8">
              <button onClick={handleHyper} className={`text-sm font-black transition-all uppercase tracking-[0.3em] outline-text ${isWarping ? 'text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,1)] scale-110' : 'text-white/80 hover:text-white'}`}>
                HYPER
              </button>
              <button onClick={toggleLanding} className={`text-sm font-black transition-all uppercase tracking-[0.3em] outline-text ${isLanded ? 'text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,1)] scale-110' : 'text-white/80 hover:text-white'}`}>
                {isLanded ? 'ORBIT' : 'LAND'}
              </button>
              <button onClick={handleStopAll} className="text-sm font-black text-red-500/80 hover:text-red-400 transition-all uppercase tracking-[0.3em] outline-text">
                STOP
              </button>
              
              <div className="flex gap-4 items-center">
                 <button onClick={() => toggleSetting('glitchEnabled')} className={`text-[10px] font-black uppercase tracking-widest outline-text ${settings.glitchEnabled ? 'text-fuchsia-400' : 'text-white/30'}`}>FX</button>
                 <button onClick={() => toggleSetting('aoEnabled')} className={`text-[10px] font-black uppercase tracking-widest outline-text ${settings.aoEnabled ? 'text-indigo-400' : 'text-white/30'}`}>AO</button>
                 <button onClick={() => toggleSetting('godRaysEnabled')} className={`text-[10px] font-black uppercase tracking-widest outline-text ${settings.godRaysEnabled ? 'text-yellow-400' : 'text-white/30'}`}>GOD</button>
                 <button onClick={() => toggleSetting('chromaticEnabled')} className={`text-[10px] font-black uppercase tracking-widest outline-text ${settings.chromaticEnabled ? 'text-emerald-400' : 'text-white/30'}`}>RGB</button>
              </div>

              <div className="flex flex-wrap gap-6 items-center bg-white/5 p-3 rounded-xl border border-white/10">
                <div className="flex flex-col gap-1">
                  <select 
                    value={settings.ttsProvider} 
                    onChange={handleProviderChange} 
                    className="bg-transparent text-[10px] font-black uppercase text-white/60 outline-none cursor-pointer hover:text-white outline-text"
                  >
                    {Object.values(TtsProvider).map(tp => <option key={tp} value={tp} className="bg-black text-white">{tp}</option>)}
                  </select>
                  
                  <select 
                    value={settings.selectedVoice} 
                    onChange={(e) => setSettings(s => ({...s, selectedVoice: e.target.value}))} 
                    className="bg-transparent text-[9px] font-black uppercase text-white/40 outline-none cursor-pointer hover:text-white outline-text max-w-[150px]"
                  >
                    {settings.ttsProvider === TtsProvider.BROWSER ? (
                      systemVoices.map(v => <option key={v.name} value={v.name} className="bg-black text-white">{v.name} ({v.lang})</option>)
                    ) : (
                      audioEngine.geminiVoices.map(v => <option key={v} value={v} className="bg-black text-white">{v}</option>)
                    )}
                  </select>
                </div>

                <button onClick={() => toggleSetting('ttsEnabled')} className={`text-xs font-black uppercase tracking-widest outline-text px-4 py-2 rounded-lg border transition-all ${settings.ttsEnabled ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5' : 'text-white/30 border-white/5 hover:border-white/20'}`}>
                  {settings.ttsEnabled ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="flex items-center gap-6 bg-white/5 px-6 py-2 rounded-full border border-white/10">
                <NumericControl label="BPM" value={rev0100(settings.bpm, 60, 220)} onChange={(v) => setSettings(s => ({...s, bpm: Math.round(map0100(v, 60, 220))}))} />
              </div>
            </div>

            <div className="flex flex-col gap-4 items-center">
              <div className="flex gap-4 overflow-x-auto max-w-full no-scrollbar pb-2">
                {Object.values(SoundPreset).map(p => (
                  <button key={p} onClick={() => setSettings(s => ({...s, soundPreset: p}))} className={`text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap outline-text ${settings.soundPreset === p ? 'text-cyan-400' : 'text-white/40 hover:text-white/70'}`}>
                    {p}
                  </button>
                ))}
              </div>

              <div className="flex gap-8 items-center pt-2 border-t border-white/10 w-full justify-center">
                <div className="flex gap-6">
                  {[DrumStyle.DNB, DrumStyle.JUNGLE, DrumStyle.BREAKCORE].map(style => (
                    <button key={style} onClick={() => setSettings(s => ({...s, drumStyle: style}))} className={`text-[10px] font-black uppercase tracking-[0.2em] transition-all outline-text ${settings.drumStyle === style ? 'text-white' : 'text-white/30 hover:text-white/60'}`}>
                      {style}
                    </button>
                  ))}
                </div>

                {settings.drumStyle === DrumStyle.JUNGLE && (
                  <div className="flex gap-4 pl-8 border-l border-white/20">
                    <div className="flex flex-wrap gap-2 max-w-md justify-center">
                      {Object.values(AmenType).map(amen => (
                        <button key={amen} onClick={() => setSettings(s => ({...s, amenType: amen}))} className={`text-[9px] font-black uppercase tracking-widest transition-all outline-text ${settings.amenType === amen ? 'text-pink-400' : 'text-white/30 hover:text-white/60'}`}>
                          {amen.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
