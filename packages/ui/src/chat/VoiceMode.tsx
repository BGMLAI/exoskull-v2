"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "../common/utils";

type VoicePhase = "idle" | "listening" | "transcribing" | "thinking" | "speaking";

interface VoiceModeProps {
  /** Called with the transcribed text to send to the agent */
  onSend: (message: string) => void;
  /** Whether the agent is currently streaming a response */
  isStreaming: boolean;
  /** Latest assistant message content (for TTS) */
  lastAssistantMessage?: string;
  /** Close voice mode */
  onClose: () => void;
  /** Transcribe endpoint */
  transcribeUrl?: string;
  /** TTS endpoint */
  ttsUrl?: string;
}

// ── Silence detection config ────────────────────────────────────
const SILENCE_THRESHOLD = 0.02; // Higher = less sensitive to background noise
const SILENCE_DURATION_MS = 2000; // 2s silence = stop recording (was 1.5s — too fast)
const MIN_RECORDING_MS = 1000; // Minimum 1s recording (was 500ms — too short)

export function VoiceMode({
  onSend,
  isStreaming,
  lastAssistantMessage,
  onClose,
  transcribeUrl = "/api/voice/transcribe",
  ttsUrl = "/api/voice/tts",
}: VoiceModeProps) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0);
  const [autoListen, setAutoListen] = useState(true);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const silenceStartRef = useRef<number>(0);
  const recordingStartRef = useRef<number>(0);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const lastSpokenRef = useRef<string>("");
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
      stopMic();
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── TTS: speak when assistant finishes ──────────────────────
  useEffect(() => {
    if (
      phase !== "thinking" ||
      isStreaming ||
      !lastAssistantMessage ||
      lastAssistantMessage === lastSpokenRef.current
    )
      return;

    lastSpokenRef.current = lastAssistantMessage;
    speakText(lastAssistantMessage);
  }, [isStreaming, lastAssistantMessage, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Transition: when agent starts streaming → thinking ──────
  useEffect(() => {
    if (isStreaming && phase === "transcribing") {
      // Agent started processing
    }
    if (isStreaming && (phase === "idle" || phase === "transcribing")) {
      setPhase("thinking");
    }
  }, [isStreaming, phase]);

  // ── Microphone ──────────────────────────────────────────────

  const stopMic = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioContextRef.current?.state !== "closed") {
      audioContextRef.current?.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    cancelAnimationFrame(rafRef.current);
  }, []);

  const startListening = useCallback(async () => {
    setError(null);
    setTranscript("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: { ideal: 16000 },
        },
      });
      streamRef.current = stream;

      // Audio analysis for VAD + visualization
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      // MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size > 1000) {
          transcribeAudio(blob);
        } else if (mountedRef.current) {
          // Too short — go back to listening
          setPhase("idle");
        }
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      recordingStartRef.current = Date.now();
      silenceStartRef.current = 0;
      setPhase("listening");

      // Start VAD loop
      monitorVolume(analyser);
    } catch (err) {
      console.error("[VoiceMode] Mic error:", err);
      setError("Nie mogę uzyskać dostępu do mikrofonu");
      setPhase("idle");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const monitorVolume = useCallback(
    (analyser: AnalyserNode) => {
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (!mountedRef.current) return;

        analyser.getByteFrequencyData(data);
        // RMS volume
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = data[i] / 255;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setVolume(rms);

        // VAD: detect silence
        const now = Date.now();
        const elapsed = now - recordingStartRef.current;

        if (rms < SILENCE_THRESHOLD) {
          if (silenceStartRef.current === 0) {
            silenceStartRef.current = now;
          } else if (
            now - silenceStartRef.current > SILENCE_DURATION_MS &&
            elapsed > MIN_RECORDING_MS
          ) {
            // Silence detected — stop recording
            stopMic();
            return;
          }
        } else {
          silenceStartRef.current = 0;
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [stopMic],
  );

  // ── Transcription ──────────────────────────────────────────

  const transcribeAudio = useCallback(
    async (blob: Blob) => {
      if (!mountedRef.current) return;
      setPhase("transcribing");

      try {
        const form = new FormData();
        form.append("audio", blob, "recording.webm");

        const res = await fetch(transcribeUrl, { method: "POST", body: form });
        if (!res.ok) {
          throw new Error(`Transcription failed: ${res.status}`);
        }

        const { text } = await res.json();
        if (!text?.trim()) {
          if (mountedRef.current) {
            setPhase("idle");
            if (autoListen) startListening();
          }
          return;
        }

        setTranscript(text.trim());
        onSend(text.trim());
        // Phase will transition to "thinking" via isStreaming effect
      } catch (err) {
        console.error("[VoiceMode] Transcribe error:", err);
        if (mountedRef.current) {
          setError("Transkrypcja nie powiodła się");
          setPhase("idle");
        }
      }
    },
    [transcribeUrl, onSend, autoListen, startListening],
  );

  // ── TTS ────────────────────────────────────────────────────

  const speakText = useCallback(
    async (text: string) => {
      if (!mountedRef.current) return;
      setPhase("speaking");

      try {
        // Strip markdown for cleaner TTS
        const cleanText = text
          .replace(/```[\s\S]*?```/g, " kod pominięty ")
          .replace(/[#*_~`>\[\]()!|]/g, "")
          .replace(/https?:\/\/\S+/g, " link ")
          .replace(/\n{2,}/g, ". ")
          .replace(/\n/g, " ")
          .trim();

        if (!cleanText || cleanText.length < 3) {
          if (autoListen && mountedRef.current) startListening();
          return;
        }

        const res = await fetch(ttsUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: cleanText }),
        });

        if (!res.ok) {
          console.error("[VoiceMode] TTS error:", res.status);
          // Fall back to browser TTS
          browserSpeak(cleanText);
          return;
        }

        const audioBlob = await res.blob();
        const url = URL.createObjectURL(audioBlob);

        const audio = new Audio(url);
        audioPlayerRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          audioPlayerRef.current = null;
          if (mountedRef.current && autoListen) {
            startListening();
          } else if (mountedRef.current) {
            setPhase("idle");
          }
        };

        audio.onerror = () => {
          URL.revokeObjectURL(url);
          // Fallback to browser TTS
          browserSpeak(cleanText);
        };

        await audio.play();
      } catch (err) {
        console.error("[VoiceMode] TTS error:", err);
        if (mountedRef.current) {
          setPhase("idle");
          if (autoListen) startListening();
        }
      }
    },
    [ttsUrl, autoListen, startListening],
  );

  const browserSpeak = useCallback(
    (text: string) => {
      if (!("speechSynthesis" in window)) {
        if (mountedRef.current) {
          setPhase("idle");
          if (autoListen) startListening();
        }
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text.slice(0, 1000));
      utterance.lang = "pl-PL";
      utterance.rate = 1.05;

      utterance.onend = () => {
        if (mountedRef.current && autoListen) startListening();
        else if (mountedRef.current) setPhase("idle");
      };

      window.speechSynthesis.speak(utterance);
      setPhase("speaking");
    },
    [autoListen, startListening],
  );

  // ── Skip TTS ───────────────────────────────────────────────

  const skipSpeaking = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setPhase("idle");
    if (autoListen) startListening();
  }, [autoListen, startListening]);

  // ── Auto-start listening on open ────────────────────────────
  useEffect(() => {
    if (phase === "idle" && autoListen) {
      const timer = setTimeout(() => {
        if (mountedRef.current && phase === "idle") startListening();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ─────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background"
      style={{ backgroundColor: 'var(--background, #f5f5f5)' }}
    >
      {/* Close button */}
      <button
        onClick={() => {
          stopMic();
          onClose();
        }}
        className="absolute top-6 right-6 p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        title="Zamknij tryb głosowy (Esc)"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Auto-listen toggle */}
      <button
        onClick={() => setAutoListen(!autoListen)}
        className={cn(
          "absolute top-6 left-6 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
          autoListen
            ? "bg-emerald-500/20 text-emerald-400"
            : "bg-muted text-muted-foreground",
        )}
      >
        {autoListen ? "Auto-listen ON" : "Auto-listen OFF"}
      </button>

      {/* Main orb */}
      <div className="relative mb-12">
        <Orb phase={phase} volume={volume} />
      </div>

      {/* Phase indicator */}
      <div className="text-center space-y-3 max-w-md px-4">
        <p className="text-lg font-medium">
          {phase === "idle" && "Dotknij aby mówić"}
          {phase === "listening" && "Słucham..."}
          {phase === "transcribing" && "Przetwarzam mowę..."}
          {phase === "thinking" && "Myślę..."}
          {phase === "speaking" && "Mówię..."}
        </p>

        {transcript && (
          <p className="text-sm text-muted-foreground italic">
            &ldquo;{transcript}&rdquo;
          </p>
        )}

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
      </div>

      {/* Controls */}
      <div className="mt-12 flex items-center gap-6">
        {phase === "idle" && (
          <button
            onClick={startListening}
            className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-all hover:scale-105 active:scale-95"
          >
            <MicIcon size={28} />
          </button>
        )}

        {phase === "listening" && (
          <button
            onClick={stopMic}
            className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white animate-pulse hover:bg-red-600 transition-all"
          >
            <StopIcon size={24} />
          </button>
        )}

        {(phase === "transcribing" || phase === "thinking") && (
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <SpinnerIcon size={28} />
          </div>
        )}

        {phase === "speaking" && (
          <button
            onClick={skipSpeaking}
            className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary hover:bg-primary/30 transition-all"
            title="Pomiń odpowiedź"
          >
            <SkipIcon size={24} />
          </button>
        )}
      </div>

      {/* Keyboard hint */}
      <p className="absolute bottom-6 text-xs text-muted-foreground">
        Esc aby zamknąć
      </p>
    </div>
  );
}

// ── Orb visualization ─────────────────────────────────────────

function Orb({ phase, volume }: { phase: VoicePhase; volume: number }) {
  const scale = phase === "listening" ? 1 + volume * 2 : 1;
  const pulseClass =
    phase === "thinking" ? "animate-pulse" :
    phase === "speaking" ? "animate-pulse" : "";

  const colors: Record<VoicePhase, string> = {
    idle: "from-zinc-500/20 to-zinc-600/10",
    listening: "from-blue-500/40 to-cyan-500/20",
    transcribing: "from-amber-500/30 to-orange-500/15",
    thinking: "from-violet-500/30 to-purple-500/15",
    speaking: "from-emerald-500/30 to-teal-500/15",
  };

  const glowColors: Record<VoicePhase, string> = {
    idle: "shadow-zinc-500/10",
    listening: "shadow-blue-500/30",
    transcribing: "shadow-amber-500/20",
    thinking: "shadow-violet-500/20",
    speaking: "shadow-emerald-500/20",
  };

  return (
    <div
      className={cn(
        "w-48 h-48 rounded-full bg-gradient-to-b transition-all duration-150 shadow-[0_0_80px_20px]",
        colors[phase],
        glowColors[phase],
        pulseClass,
      )}
      style={{ transform: `scale(${scale})` }}
    >
      {/* Inner rings */}
      <div className={cn(
        "absolute inset-4 rounded-full bg-gradient-to-b opacity-60 transition-all duration-150",
        colors[phase],
      )} style={{ transform: `scale(${0.9 + volume * 0.3})` }} />
      <div className={cn(
        "absolute inset-10 rounded-full bg-gradient-to-b opacity-40 transition-all duration-150",
        colors[phase],
      )} style={{ transform: `scale(${0.85 + volume * 0.5})` }} />
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────

function MicIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function StopIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function SpinnerIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function SkipIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,4 15,12 5,20" />
      <rect x="17" y="5" width="2" height="14" />
    </svg>
  );
}
