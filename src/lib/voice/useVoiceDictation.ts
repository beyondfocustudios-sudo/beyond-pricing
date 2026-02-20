"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ── Web Speech API type declarations (avoids conflict with dom lib) ──
interface BPSpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface BPSpeechRecognitionResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: BPSpeechRecognitionAlternative;
}
interface BPSpeechRecognitionResultList {
  readonly length: number;
  [index: number]: BPSpeechRecognitionResult;
}
interface BPSpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: BPSpeechRecognitionResultList;
}
interface BPSpeechRecognitionErrorEvent extends Event {
  error: string;
}
interface ISpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: BPSpeechRecognitionEvent) => void) | null;
  onerror: ((e: BPSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => ISpeechRecognition;

// ── Types ────────────────────────────────────────────────────
export interface VoiceDictationState {
  isSupported: boolean;
  isRecording: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
}

export interface VoiceDictationActions {
  start: () => void;
  stop: () => void;
  toggle: () => void;
  clear: () => void;
}

export type UseVoiceDictationReturn = VoiceDictationState & VoiceDictationActions;

interface UseVoiceDictationOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onTranscript?: (text: string) => void;
}

// Language fallback chain
const LANG_CHAIN = ["pt-PT", "pt-BR", "en-US"];

// ── Hook ─────────────────────────────────────────────────────
export function useVoiceDictation(opts: UseVoiceDictationOptions = {}): UseVoiceDictationReturn {
  const {
    lang = "pt-PT",
    continuous = true,
    interimResults = true,
    onTranscript,
  } = opts;

  const [state, setState] = useState<VoiceDictationState>({
    isSupported: false,
    isRecording: false,
    transcript: "",
    interimTranscript: "",
    error: null,
  });

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const langIndexRef = useRef(0);
  const startingRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  // Check support on mount (client-only)
  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
    setState((s) => ({ ...s, isSupported: supported }));
  }, []);

  const buildRecognition = useCallback(
    (langOverride?: string): ISpeechRecognition | null => {
      if (typeof window === "undefined") return null;
      const w = window as typeof window & {
        SpeechRecognition?: SpeechRecognitionCtor;
        webkitSpeechRecognition?: SpeechRecognitionCtor;
      };
      const SpeechRec = w.SpeechRecognition ?? w.webkitSpeechRecognition;
      if (!SpeechRec) return null;

      const rec = new SpeechRec();
      rec.lang = langOverride ?? LANG_CHAIN[langIndexRef.current] ?? lang;
      rec.continuous = continuous;
      rec.interimResults = interimResults;

      rec.onresult = (e: BPSpeechRecognitionEvent) => {
        let interim = "";
        let final = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i];
          if (result && result.isFinal) {
            final += result[0]?.transcript ?? "";
          } else if (result) {
            interim += result[0]?.transcript ?? "";
          }
        }
        setState((s) => {
          const newTranscript = s.transcript + (final ? (s.transcript ? " " : "") + final : "");
          if (final && onTranscriptRef.current) onTranscriptRef.current(newTranscript);
          return {
            ...s,
            transcript: newTranscript,
            interimTranscript: interim,
            error: null,
          };
        });
      };

      rec.onerror = (e: BPSpeechRecognitionErrorEvent) => {
        if (e.error === "language-not-supported" || e.error === "no-speech") {
          // Try next language
          langIndexRef.current = (langIndexRef.current + 1) % LANG_CHAIN.length;
          if (langIndexRef.current < LANG_CHAIN.length) {
            const nextLang = LANG_CHAIN[langIndexRef.current];
            if (nextLang && nextLang !== rec.lang) {
              rec.stop();
              setTimeout(() => {
                const newRec = buildRecognition(nextLang);
                if (newRec) {
                  recognitionRef.current = newRec;
                  newRec.start();
                }
              }, 300);
              return;
            }
          }
        }
        setState((s) => ({
          ...s,
          isRecording: false,
          error: friendlyError(e.error),
        }));
      };

      rec.onend = () => {
        startingRef.current = false;
        setState((s) => ({ ...s, isRecording: false, interimTranscript: "" }));
      };

      return rec;
    },
    [continuous, interimResults, lang]
  );

  // Cleanup on unmount
  useEffect(() => {
    const stopRef = () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
    return stopRef;
  }, []);

  const start = useCallback(() => {
    if (startingRef.current) return;
    startingRef.current = true;
    langIndexRef.current = LANG_CHAIN.indexOf(lang) >= 0 ? LANG_CHAIN.indexOf(lang) : 0;

    const rec = buildRecognition();
    if (!rec) {
      setState((s) => ({ ...s, error: "Browser não suporta ditado por voz.", isRecording: false }));
      startingRef.current = false;
      return;
    }
    recognitionRef.current = rec;
    setState((s) => ({ ...s, isRecording: true, error: null }));
    try { rec.start(); } catch { startingRef.current = false; }
  }, [buildRecognition, lang]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    startingRef.current = false;
    setState((s) => ({ ...s, isRecording: false, interimTranscript: "" }));
  }, []);

  const toggle = useCallback(() => {
    if (state.isRecording) stop();
    else start();
  }, [state.isRecording, start, stop]);

  const clear = useCallback(() => {
    setState((s) => ({ ...s, transcript: "", interimTranscript: "" }));
  }, []);

  return { ...state, start, stop, toggle, clear };
}

// ── Error messages ───────────────────────────────────────────
function friendlyError(error: string): string {
  const map: Record<string, string> = {
    "no-speech": "Nenhuma fala detectada. Tenta novamente.",
    "aborted": "Ditado cancelado.",
    "audio-capture": "Microfone não encontrado. Verifica as permissões.",
    "network": "Erro de rede no reconhecimento de voz.",
    "not-allowed": "Permissão do microfone negada.",
    "service-not-allowed": "Serviço de voz não disponível.",
    "language-not-supported": "Idioma não suportado. A tentar alternativa…",
    "bad-grammar": "Gramática inválida.",
  };
  return map[error] ?? `Erro de ditado: ${error}`;
}
