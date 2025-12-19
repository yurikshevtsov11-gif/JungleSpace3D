
import { GoogleGenAI, Modality } from "@google/genai";
import { DrumStyle, SoundPreset, TtsProvider } from '../types';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private synthGain: GainNode | null = null;
  private beatGain: GainNode | null = null;
  private ttsGain: GainNode | null = null;
  private echoNode: DelayNode | null = null;
  private echoFeedback: GainNode | null = null;
  private activeOscillators: Map<string, { nodes: AudioNode[]; gain: GainNode }> = new Map();
  private beatTimer: number | null = null;
  private currentStep = 0;
  private currentPreset: SoundPreset = SoundPreset.CRYSTAL_ORBIT;
  private keyFreqMap: Map<string, number> = new Map();
  private isShuffleMode = false;
  
  public readonly geminiVoices = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
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

    const reverb = this.ctx.createConvolver();
    const length = this.ctx.sampleRate * 3;
    const buffer = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
    for (let i = 0; i < 2; i++) {
      const channel = buffer.getChannelData(i);
      for (let j = 0; j < length; j++) {
        channel[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / length, 2);
      }
    }
    reverb.buffer = buffer;

    const reverbGain = this.ctx.createGain();
    reverbGain.gain.value = 0.5;

    this.synthGain.connect(reverb);
    reverb.connect(reverbGain);
    reverbGain.connect(this.masterGain);
    this.synthGain.connect(this.masterGain);
    
    this.beatGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
    
    this.generateKeyMap();
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
    this.activeOscillators.forEach((data) => {
      const { nodes, gain } = data;
      if (this.ctx) {
        gain.gain.cancelScheduledValues(this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);
        setTimeout(() => {
          nodes.forEach(n => { try { if (n instanceof OscillatorNode || n instanceof AudioBufferSourceNode) n.stop(); } catch(e) {} });
        }, 150);
      }
    });
    this.activeOscillators.clear();
  }

  setPreset(preset: SoundPreset) { this.currentPreset = preset; }

  setVolumes(synth: number, beat: number, voice: number) {
    if (this.synthGain && this.ctx) this.synthGain.gain.setTargetAtTime(synth, this.ctx.currentTime, 0.2);
    if (this.beatGain && this.ctx) this.beatGain.gain.setTargetAtTime(beat, this.ctx.currentTime, 0.2);
    if (this.ttsGain && this.ctx) this.ttsGain.gain.setTargetAtTime(voice, this.ctx.currentTime, 0.2);
  }

  setShuffle(enabled: boolean) { this.isShuffleMode = enabled; }

  async speakCloud(text: string, provider: TtsProvider, voiceName: string, volume: number) {
    if (!this.ctx || !this.ttsGain) return;
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      let systemPrompt = "Ты — созерцательный философ.";
      if (provider === TtsProvider.YANDEX) systemPrompt = "Ты — Алиса от Яндекса. Говори дружелюбно, иногда иронично, используй интонации умного помощника. Твой стиль — легкий и современный.";
      if (provider === TtsProvider.GIGACHAT) systemPrompt = "Ты — GigaChat от Сбера. Твой стиль — уверенный, энергичный, интеллектуальный и технологичный. Ты всегда готова помочь делом.";
      if (provider === TtsProvider.OPENAI) systemPrompt = "Ты — OpenAI TTS. Твой стиль — нейтральный, идеально четкий, профессиональный и спокойный.";

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `ПРОИЗНЕСИ СЛЕДУЮЩУЮ ФРАЗУ, СТРОГО СОБЛЮДАЯ СВОЙ ХАРАКТЕР: "${text}"` }] }],
        config: {
          systemInstruction: systemPrompt,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName || (provider === TtsProvider.YANDEX ? 'Kore' : 'Zephyr') },
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
      console.warn("TTS fallback active:", e?.message);
      this.speakWebSpeech(text, volume);
    }
  }

  speakWebSpeech(text: string, volume: number) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ru-RU';
    utterance.rate = 0.95;
    utterance.pitch = 0.8;
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
    const attack = 0.5 + Math.random() * 1.5;
    
    const osc = this.ctx.createOscillator();
    osc.frequency.value = freq;
    osc.connect(mainGain);
    osc.start();
    nodes.push(osc);
    mainGain.gain.linearRampToValueAtTime(0.4, this.ctx.currentTime + attack);

    mainGain.connect(this.synthGain);
    this.activeOscillators.set(keyCode, { nodes, gain: mainGain });
  }

  stopNote(keyCode: string) {
    const data = this.activeOscillators.get(keyCode);
    if (data && this.ctx) {
      const { nodes, gain } = data;
      const release = 4 + Math.random() * 12;
      gain.gain.cancelScheduledValues(this.ctx.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + release);
      setTimeout(() => {
        nodes.forEach(n => { try { if (n instanceof OscillatorNode || n instanceof AudioBufferSourceNode) n.stop(); } catch(e) {} });
        this.activeOscillators.delete(keyCode);
      }, release * 1000);
    }
  }

  startBeats(bpm: number, style: DrumStyle) {
    if (this.beatTimer) clearInterval(this.beatTimer);
    this.currentStep = 0;
    const interval = (60 / bpm) / 4 * 1000;
    this.beatTimer = window.setInterval(() => {
      if (!this.ctx) return;
      const step = this.currentStep % 16;
      const time = this.ctx.currentTime + 0.05;
      
      if (style === DrumStyle.DNB) {
        if (step === 0 || step === 10) this.playDrum('kick', time);
        if (step === 4 || step === 12) this.playDrum('snare', time);
        this.playDrum('hat', time, 0.15);
      } else if (style === DrumStyle.JUNGLE) {
        // Authentic Jungle Syncopation (Broken Amen Feel)
        if (step === 0 || step === 7 || step === 10) this.playDrum('kick', time);
        if (step === 4 || step === 12) this.playDrum('snare', time, 0.8);
        // Fast ghost notes for Jungle rolling feel
        if (step === 6 || step === 14 || step === 15) this.playDrum('snare', time, 0.3);
        if (step % 2 === 0) this.playDrum('hat', time, 0.2);
      } else if (style === DrumStyle.BREAKCORE) {
        if (Math.random() > 0.6) this.playDrum('kick', time);
        if (Math.random() > 0.4) this.playDrum('snare', time, Math.random());
        if (Math.random() > 0.3) this.playDrum('hat', time, 0.1);
      }
      
      this.currentStep++;
    }, interval);
  }

  private playDrum(type: string, time: number, volume = 1.0) {
    if (!this.ctx || !this.beatGain) return;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(volume, time);
    
    if (type === 'kick') {
      const osc = this.ctx.createOscillator();
      osc.frequency.setValueAtTime(150, time);
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
      filter.type = 'highpass'; filter.frequency.value = 1000;
      g.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
      noise.connect(filter); filter.connect(g); noise.start(time); noise.stop(time + 0.15);
    } else if (type === 'hat') {
      const osc = this.ctx.createOscillator();
      osc.type = 'square'; osc.frequency.value = 8000;
      g.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
      osc.connect(g); osc.start(time); osc.stop(time + 0.06);
    }
    
    g.connect(this.beatGain);
  }

  stopBeats() { if (this.beatTimer) { clearInterval(this.beatTimer); this.beatTimer = null; } }
}

export const audioEngine = new AudioEngine();
