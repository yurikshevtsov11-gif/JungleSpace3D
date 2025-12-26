
import { GoogleGenAI, Modality } from "@google/genai";
import { DrumStyle, AmenType, SoundPreset, TtsProvider } from '../types';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private synthGain: GainNode | null = null;
  private beatGain: GainNode | null = null;
  private ttsGain: GainNode | null = null;
  private echoNode: DelayNode | null = null;
  private echoFeedback: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private activeOscillators: Map<string, { nodes: AudioNode[]; gain: GainNode }> = new Map();
  private beatTimer: number | null = null;
  private currentStep = 0;
  private currentPreset: SoundPreset = SoundPreset.STELLAR_WINDS;
  private keyFreqMap: Map<string, number> = new Map();
  
  public readonly geminiVoices = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.setupAudioGraph();
    this.generateKeyMap();
  }

  private setupAudioGraph() {
    if (!this.ctx) return;
    this.masterGain = this.ctx.createGain();
    this.synthGain = this.ctx.createGain();
    this.beatGain = this.ctx.createGain();
    this.ttsGain = this.ctx.createGain();

    this.echoNode = this.ctx.createDelay(2.0);
    this.echoNode.delayTime.value = 0.35;
    this.echoFeedback = this.ctx.createGain();
    this.echoFeedback.gain.value = 0.25;

    this.ttsGain.connect(this.echoNode);
    this.echoNode.connect(this.echoFeedback);
    this.echoFeedback.connect(this.echoNode);
    this.echoNode.connect(this.masterGain);
    this.ttsGain.connect(this.masterGain);

    this.reverbNode = this.ctx.createConvolver();
    const length = this.ctx.sampleRate * 2.5; 
    const buffer = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
    for (let i = 0; i < 2; i++) {
      const channel = buffer.getChannelData(i);
      for (let j = 0; j < length; j++) {
        channel[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / length, 2.5);
      }
    }
    this.reverbNode.buffer = buffer;

    const reverbGain = this.ctx.createGain();
    reverbGain.gain.value = 0.4;

    this.synthGain.connect(this.reverbNode);
    this.reverbNode.connect(reverbGain);
    reverbGain.connect(this.masterGain);
    this.synthGain.connect(this.masterGain);
    
    this.beatGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  public generateKeyMap() {
    const shuffledFreqs = [...this.baseFreqs].sort(() => Math.random() - 0.5);
    const keys = "QWERTYUIOPASDFGHJKLZXCVBNM".split("");
    this.keyFreqMap.clear();
    keys.forEach((key, i) => {
      this.keyFreqMap.set(`Key${key}`, shuffledFreqs[i % shuffledFreqs.length]);
    });
  }

  private baseFreqs = [
    65.41, 73.42, 82.41, 98.00, 110.00, 130.81, 146.83, 164.81, 196.00, 220.00,
    261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00
  ];

  public clearAllNotes() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    
    this.activeOscillators.forEach((data) => {
      const { nodes, gain } = data;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0, now);
      nodes.forEach(n => { 
        try { 
          if (n instanceof OscillatorNode || n instanceof AudioBufferSourceNode) {
            n.stop(now); 
            n.disconnect();
          } 
        } catch(e) {} 
      });
    });
    this.activeOscillators.clear();

    if (this.masterGain) {
      this.masterGain.disconnect();
    }
    
    this.setupAudioGraph();
    this.stopBeats();
  }

  setPreset(preset: SoundPreset) { this.currentPreset = preset; }

  setVolumes(synth: number, beat: number, voice: number) {
    if (this.synthGain && this.ctx) this.synthGain.gain.setTargetAtTime(synth, this.ctx.currentTime, 0.1);
    if (this.beatGain && this.ctx) this.beatGain.gain.setTargetAtTime(beat, this.ctx.currentTime, 0.1);
    if (this.ttsGain && this.ctx) this.ttsGain.gain.setTargetAtTime(voice, this.ctx.currentTime, 0.1);
  }

  async speakCloud(text: string, provider: TtsProvider, voiceName: string, volume: number) {
    if (!this.ctx || !this.ttsGain) return;
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Произнеси фразу: "${text}"` }] }],
        config: {
          systemInstruction: "Ты — космический разум.",
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName || 'Zephyr' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioBuffer = await this.decodeAudioData(this.decodeBase64(base64Audio), this.ctx, 24000, 1);
        const source = this.ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.ttsGain);
        source.start();
      }
    } catch (e: any) { 
      // Fallback is always provided by component calling this
    }
  }

  public getSystemVoices(): SpeechSynthesisVoice[] {
    if (!window.speechSynthesis) return [];
    return window.speechSynthesis.getVoices();
  }

  speakWebSpeech(text: string, volume: number, voiceName?: string, pitch = 1.0, rate = 1.0) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    if (voiceName) {
      const voices = window.speechSynthesis.getVoices();
      const selected = voices.find(v => v.name === voiceName);
      if (selected) utterance.voice = selected;
    }
    
    utterance.pitch = pitch;
    utterance.rate = rate;
    utterance.volume = volume;
    window.speechSynthesis.speak(utterance);
  }

  private decodeBase64(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
  }

  private async decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
    return buffer;
  }

  playNote(keyCode: string) {
    if (!this.ctx || !this.synthGain) return;
    if (this.activeOscillators.has(keyCode)) return;
    
    const freq = this.keyFreqMap.get(keyCode) || 261.63;
    const nodes: AudioNode[] = [];
    const mainGain = this.ctx.createGain();
    mainGain.gain.setValueAtTime(0, this.ctx.currentTime);
    
    let attack = 0.5;
    const preset = this.currentPreset;

    if (preset === SoundPreset.STELLAR_WINDS) {
      const noise = this.ctx.createBufferSource();
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for(let i=0; i<data.length; i++) data[i] = Math.random()*2-1;
      noise.buffer = buffer; noise.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass'; filter.frequency.value = freq; filter.Q.value = 25;
      noise.connect(filter); filter.connect(mainGain); noise.start(); nodes.push(noise, filter);
      attack = 1.8;
    } else if (preset === SoundPreset.GRAVITY_WELL) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq/5, this.ctx.currentTime + 2.5);
      osc.connect(mainGain); osc.start(); nodes.push(osc);
      attack = 0.15;
    } else if (preset === SoundPreset.AURORA_AMBIENT) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = freq;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.5;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 2;
      lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
      osc.connect(mainGain); osc.start(); lfo.start(); nodes.push(osc, lfo, lfoGain);
      attack = 2.0;
    } else if (preset === SoundPreset.VOID_TEXTURE) {
      const noise = this.ctx.createBufferSource();
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for(let i=0; i<data.length; i++) data[i] = Math.random()*0.5-0.25;
      noise.buffer = buffer; noise.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = freq / 2;
      noise.connect(filter); filter.connect(mainGain); noise.start(); nodes.push(noise, filter);
      attack = 1.0;
    } else if (preset === SoundPreset.CELESTIAL_PAD) {
      [1, 1.01, 0.5, 2].forEach(m => {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine'; osc.frequency.value = freq * m;
        osc.connect(mainGain); osc.start(); nodes.push(osc);
      });
      attack = 1.5;
    } else if (preset === SoundPreset.JUNGLE_ATMOS) {
      const noise = this.ctx.createBufferSource();
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for(let i=0; i<data.length; i++) data[i] = (Math.random()*2-1) * Math.sin(i * 0.001);
      noise.buffer = buffer; noise.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass'; filter.frequency.value = 1200;
      noise.connect(filter); filter.connect(mainGain); noise.start(); nodes.push(noise, filter);
      attack = 2.5;
    } else if (preset === SoundPreset.DREAM_STAB) {
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      osc1.type = 'square'; osc1.frequency.value = freq;
      osc2.type = 'sawtooth'; osc2.frequency.value = freq * 1.5;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.setValueAtTime(3000, this.ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.4);
      filter.Q.value = 15;
      osc1.connect(filter); osc2.connect(filter); filter.connect(mainGain);
      osc1.start(); osc2.start(); nodes.push(osc1, osc2, filter);
      attack = 0.05;
    } else if (preset === SoundPreset.SUB_RESONANCE) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = freq / 4;
      const saturation = this.ctx.createWaveShaper();
      const makeDistortionCurve = (amount: number) => {
        let k = typeof amount === 'number' ? amount : 50,
          n_samples = 44100,
          curve = new Float32Array(n_samples),
          deg = Math.PI / 180,
          i = 0,
          x;
        for ( ; i < n_samples; ++i ) {
          x = i * 2 / n_samples - 1;
          curve[i] = ( 3 + k ) * x * 20 * deg / ( Math.PI + k * Math.abs(x) );
        }
        return curve;
      };
      saturation.curve = makeDistortionCurve(10);
      osc.connect(saturation); saturation.connect(mainGain); osc.start(); nodes.push(osc, saturation);
      attack = 0.2;
    }

    mainGain.gain.linearRampToValueAtTime(0.4, this.ctx.currentTime + attack);
    mainGain.connect(this.synthGain);
    this.activeOscillators.set(keyCode, { nodes, gain: mainGain });
  }

  stopNote(keyCode: string) {
    const data = this.activeOscillators.get(keyCode);
    if (data && this.ctx) {
      const { nodes, gain } = data;
      const release = 3.0 + Math.random() * 3; 
      gain.gain.cancelScheduledValues(this.ctx.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + release);
      setTimeout(() => {
        nodes.forEach(n => { try { if (n instanceof OscillatorNode || n instanceof AudioBufferSourceNode) n.stop(); n.disconnect(); } catch(e) {} });
        this.activeOscillators.delete(keyCode);
      }, release * 1000);
    }
  }

  startBeats(bpm: number, style: DrumStyle, amen: AmenType = AmenType.CLASSIC) {
    this.stopBeats();
    this.currentStep = 0;
    const interval = (60 / bpm) / 4 * 1000;
    this.beatTimer = window.setInterval(() => {
      if (!this.ctx || !this.beatGain) return;
      const step = this.currentStep % 16;
      const time = this.ctx.currentTime + 0.05;
      
      if (style === DrumStyle.DNB) {
        if (step === 0 || step === 10) this.playDrum('kick', time, 1.0, 55);
        if (step === 4 || step === 12) this.playDrum('snare', time, 0.8, 180);
        if (step % 2 === 0) this.playDrum('hat', time, 0.15);
      } else if (style === DrumStyle.JUNGLE) {
        if (amen === AmenType.CLASSIC) {
          if (step === 0 || step === 7 || step === 10) this.playDrum('kick', time, 1.0, 70);
          if (step === 4 || step === 12) this.playDrum('snare', time, 0.9, 250);
          if ([6, 13, 14, 15].includes(step)) this.playDrum('snare', time, 0.35, 280);
        } else if (amen === AmenType.APACHE) {
          if (step === 0 || step === 2 || step === 8 || step === 10) this.playDrum('kick', time, 0.8, 65);
          if (step === 4 || step === 12) this.playDrum('snare', time, 1.0, 210);
          if (step % 2 !== 0) this.playDrum('hat', time, 0.2, 8000);
        } else if (amen === AmenType.THINK) {
          if (step === 0 || step === 10) this.playDrum('kick', time, 0.9, 80);
          if (step === 4 || step === 12) this.playDrum('snare', time, 0.7, 350);
          if (step % 2 === 0) this.playDrum('snare', time, 0.2, 400);
        } else if (amen === AmenType.HOTPANTS) {
          if (step === 0 || step === 8) this.playDrum('kick', time, 1.0, 50);
          if (step === 4 || step === 12) this.playDrum('snare', time, 0.8, 200);
          if (step % 1 === 0) this.playDrum('hat', time, 0.1, 14000);
        } else if (amen === AmenType.SOUL_PRIDE) {
          if (step === 0 || step === 7 || step === 10) this.playDrum('kick', time, 1.0, 60);
          if (step === 4 || step === 12) this.playDrum('snare', time, 0.9, 220);
          if (step % 2 === 0) this.playDrum('hat', time, 0.2, 10000);
        } else if (amen === AmenType.ASSEMBLE) {
          if (step === 0 || step === 3 || step === 8 || step === 11) this.playDrum('kick', time, 1.0, 50);
          if (step === 4 || step === 12) this.playDrum('snare', time, 0.9, 280);
          if (step % 1 === 0) this.playDrum('hat', time, 0.1, 12000);
        } else if (amen === AmenType.THE_WORM) {
          if (step === 0 || step === 10) this.playDrum('kick', time, 1.0, 55);
          if (step === 4 || step === 11 || step === 12) this.playDrum('snare', time, 0.8, 240);
          if (step % 2 === 0 || step % 3 === 0) this.playDrum('hat', time, 0.15, 15000);
        }
      } else if (style === DrumStyle.BREAKCORE) {
        if (Math.random() > 0.6) this.playDrum('kick', time, Math.random(), 40 + Math.random()*80);
        if (Math.random() > 0.4) this.playDrum('snare', time, Math.random(), 150 + Math.random()*500);
        if (Math.random() > 0.2) this.playDrum('hat', time, Math.random()*0.3);
      }
      this.currentStep++;
    }, interval);
  }

  private playDrum(type: string, time: number, volume = 1.0, basePitch = 100) {
    if (!this.ctx || !this.beatGain) return;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(volume, time);
    
    if (type === 'kick') {
      const osc = this.ctx.createOscillator();
      osc.frequency.setValueAtTime(basePitch, time);
      osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.15);
      g.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
      osc.connect(g); osc.start(time); osc.stop(time + 0.2);
    } else if (type === 'snare') {
      const noise = this.ctx.createBufferSource();
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.1, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for(let i=0; i<data.length; i++) data[i] = Math.random()*2-1;
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass'; filter.frequency.value = basePitch * 3;
      g.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
      noise.connect(filter); filter.connect(g); noise.start(time); noise.stop(time + 0.15);
    } else if (type === 'hat') {
      const osc = this.ctx.createOscillator();
      osc.type = 'square'; osc.frequency.value = 12000;
      g.gain.exponentialRampToValueAtTime(0.01, time + 0.03);
      osc.connect(g); osc.start(time); osc.stop(time + 0.05);
    }
    g.connect(this.beatGain);
  }

  stopBeats() { if (this.beatTimer) { clearInterval(this.beatTimer); this.beatTimer = null; } }
}

export const audioEngine = new AudioEngine();
