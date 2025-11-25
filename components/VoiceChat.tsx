import React, { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

// --- Helper Functions from Guidelines ---

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function createBlob(data: Float32Array): { data: string; mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// --- Component ---

export const VoiceChat: React.FC = () => {
  const isTalking = useStore((state) => state.isTalking);
  const closestNpcId = useStore((state) => state.closestNpcId);
  const npcs = useStore((state) => state.npcs);
  const setIsTalking = useStore((state) => state.setIsTalking);
  const setNpcChatText = useStore((state) => state.setNpcChatText);

  const mounted = useRef(false);
  const inputContext = useRef<AudioContext | null>(null);
  const outputContext = useRef<AudioContext | null>(null);
  const nextStartTime = useRef<number>(0);
  const sources = useRef<Set<AudioBufferSourceNode>>(new Set());
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Helper to ensure audio is ready
  const ensureAudioContext = async () => {
    if (outputContext.current?.state === 'suspended') {
        try {
            await outputContext.current.resume();
        } catch (e) {
            console.warn("Could not resume audio context (user interaction needed first)");
        }
    }
  };

  useEffect(() => {
    mounted.current = true;

    if (!isTalking || !closestNpcId) {
      setNpcChatText('');
      return () => { mounted.current = false; };
    }

    const currentNpc = npcs.find((n) => n.id === closestNpcId);
    if (!currentNpc) return () => { mounted.current = false; };

    let sessionPromise: Promise<any> | null = null;
    let currentTranscription = '';

    const startSession = async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        inputContext.current = new AudioContextClass({ sampleRate: 16000 });
        outputContext.current = new AudioContextClass({ sampleRate: 24000 });

        await ensureAudioContext();

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          callbacks: {
            onopen: () => {
              if (!mounted.current || !inputContext.current) return;
              console.log('Voice Session Opened');

              const source = inputContext.current.createMediaStreamSource(stream);
              const processor = inputContext.current.createScriptProcessor(4096, 1, 1);
              processorRef.current = processor;

              processor.onaudioprocess = (e) => {
                if (!mounted.current || !sessionPromise) return;
                
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData);

                sessionPromise.then((session) => {
                  if (mounted.current) {
                    session.sendRealtimeInput({ media: pcmBlob });
                  }
                });
              };

              source.connect(processor);
              processor.connect(inputContext.current.destination);
            },
            onmessage: async (message: LiveServerMessage) => {
              if (!mounted.current || !outputContext.current) return;

              // Handle Transcription (Speech Bubble)
              if (message.serverContent?.outputTranscription?.text) {
                  currentTranscription += message.serverContent.outputTranscription.text;
                  setNpcChatText(currentTranscription);
              }
              
              if (message.serverContent?.turnComplete) {
                  // Keep text for a bit, then clear could be handled elsewhere, 
                  // but for now we keep the last sentence until new one starts.
                   currentTranscription = '';
              }

              // Handle Audio Output
              const base64EncodedAudioString = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              if (base64EncodedAudioString) {
                const ctx = outputContext.current;
                nextStartTime.current = Math.max(nextStartTime.current, ctx.currentTime);
                
                const audioBuffer = await decodeAudioData(
                  decode(base64EncodedAudioString),
                  ctx,
                  24000,
                  1
                );

                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(ctx.destination);
                
                source.addEventListener('ended', () => {
                   sources.current.delete(source);
                });

                source.start(nextStartTime.current);
                nextStartTime.current += audioBuffer.duration;
                sources.current.add(source);
              }

              const interrupted = message.serverContent?.interrupted;
              if (interrupted) {
                sources.current.forEach((source) => {
                  source.stop();
                  sources.current.delete(source);
                });
                nextStartTime.current = 0;
                currentTranscription = '';
                setNpcChatText('');
              }
            },
            onclose: (e) => {
              console.log('Voice Session Closed', e);
              if (mounted.current) setIsTalking(false);
            },
            onerror: (e) => {
              console.error('Voice Session Error', e);
              if (mounted.current) setIsTalking(false);
            },
          },
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
            },
            outputAudioTranscription: {}, // Request text transcription of model audio
            systemInstruction: `You are ${currentNpc.name}. ${currentNpc.personality}. Keep responses extremely short (max 1 sentence), conversational and reactive.`,
          },
        });
      } catch (err) {
        console.error("Failed to start voice session:", err);
        setIsTalking(false);
      }
    };

    startSession();

    return () => {
      mounted.current = false;
      
      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (inputContext.current) {
        inputContext.current.close();
        inputContext.current = null;
      }
      if (outputContext.current) {
        outputContext.current.close();
        outputContext.current = null;
      }
      sources.current.forEach(s => s.stop());
      sources.current.clear();
      nextStartTime.current = 0;
    };
  }, [isTalking, closestNpcId, npcs, setIsTalking, setNpcChatText]);

  return null;
};