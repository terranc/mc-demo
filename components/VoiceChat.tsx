
import React, { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

// --- Helper Functions ---

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
  const setIsTalking = useStore((state) => state.setIsTalking);
  const setNpcChatText = useStore((state) => state.setNpcChatText);
  const setVoiceStatus = useStore((state) => state.setVoiceStatus);

  // Refs for audio resources to allow cleanup
  const audioContextsRef = useRef<{ input: AudioContext | null; output: AudioContext | null }>({ input: null, output: null });
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const currentTranscriptionRef = useRef('');

  useEffect(() => {
    // Local flag to track if this specific effect run has been cancelled/cleaned up
    let isCancelled = false;
    let currentSession: any = null;

    if (!isTalking || !closestNpcId) {
      setNpcChatText('');
      setVoiceStatus('disconnected');
      return;
    }

    const currentNpc = useStore.getState().npcs.find((n) => n.id === closestNpcId);
    if (!currentNpc) {
        setIsTalking(false);
        return;
    }

    const startSession = async () => {
      try {
        setVoiceStatus('connecting');
        currentTranscriptionRef.current = '';
        nextStartTimeRef.current = 0;

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const inputCtx = new AudioContextClass({ sampleRate: 16000 });
        const outputCtx = new AudioContextClass({ sampleRate: 24000 });
        
        audioContextsRef.current = { input: inputCtx, output: outputCtx };

        if (isCancelled) return; // Exit if cleaned up during context creation

        // Resume contexts if suspended
        if (outputCtx.state === 'suspended') await outputCtx.resume();
        if (inputCtx.state === 'suspended') await inputCtx.resume();

        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } 
        });
        
        if (isCancelled) {
            stream.getTracks().forEach(t => t.stop());
            return;
        }
        streamRef.current = stream;

        // Establish connection
        // We use the promise to send input, but we also store the session for closing
        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          callbacks: {
            onopen: () => {
              if (isCancelled || !audioContextsRef.current.input) return;
              console.log('Voice Session Opened');
              setVoiceStatus('connected');

              const source = inputCtx.createMediaStreamSource(stream);
              const processor = inputCtx.createScriptProcessor(4096, 1, 1);
              processorRef.current = processor;

              processor.onaudioprocess = (e) => {
                if (isCancelled) return;
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData);
                
                // Use the resolved sessionPromise to ensure we send to the correct session
                sessionPromise.then((session) => {
                    if (!isCancelled) session.sendRealtimeInput({ media: pcmBlob });
                });
              };

              source.connect(processor);
              processor.connect(inputCtx.destination);
            },
            onmessage: async (message: LiveServerMessage) => {
              if (isCancelled || !audioContextsRef.current.output) return;

              if (message.serverContent?.outputTranscription?.text) {
                  currentTranscriptionRef.current += message.serverContent.outputTranscription.text;
                  setNpcChatText(currentTranscriptionRef.current);
              }

              const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              if (base64Audio) {
                const ctx = audioContextsRef.current.output;
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                
                const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                
                if (isCancelled) return;

                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(ctx.destination);
                source.onended = () => sourcesRef.current.delete(source);
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(source);
              }

              if (message.serverContent?.interrupted) {
                sourcesRef.current.forEach((s) => s.stop());
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
                currentTranscriptionRef.current = '';
                setNpcChatText('');
              }
            },
            onclose: (e) => {
               if (!isCancelled) {
                   console.log('Session closed remotely');
                   setVoiceStatus('disconnected');
                   setIsTalking(false);
               }
            },
            onerror: (e) => {
               console.error('Session error', e);
               if (!isCancelled) {
                   setVoiceStatus('error');
                   // Delay disconnect slightly to show error
                   setTimeout(() => setIsTalking(false), 2000);
               }
            }
          },
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
            },
            outputAudioTranscription: {}, 
            systemInstruction: `You are ${currentNpc.name}. ${currentNpc.personality}. Keep responses extremely short (max 1-2 sentences). Be conversational and witty.`,
          },
        });

        const session = await sessionPromise;
        if (isCancelled) {
            session.close();
            return;
        }
        currentSession = session;

      } catch (err) {
        console.error("Failed to initialize voice chat:", err);
        if (!isCancelled) {
            setVoiceStatus('error');
            setTimeout(() => setIsTalking(false), 1500);
        }
      }
    };

    startSession();

    // Cleanup function
    return () => {
      isCancelled = true;
      
      if (currentSession) {
          try {
            currentSession.close();
          } catch(e) { console.warn("Error closing session", e); }
      }

      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }

      sourcesRef.current.forEach(s => s.stop());
      sourcesRef.current.clear();

      if (audioContextsRef.current.input) {
          audioContextsRef.current.input.close();
          audioContextsRef.current.input = null;
      }
      if (audioContextsRef.current.output) {
          audioContextsRef.current.output.close();
          audioContextsRef.current.output = null;
      }
    };
  }, [isTalking, closestNpcId, setIsTalking, setNpcChatText, setVoiceStatus]);

  return null;
};
