"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ── Fully opaque Speech API types (avoids dom lib conflicts) ──────────────
// We access everything via unknown + type assertions to avoid TS conflicts
// with the dom lib's SpeechRecognition types which vary across TS versions.

// ── Public types ──────────────────────────────────────────────────────────
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

// ── Helper: build a recognition instance (fully opaque) ───────────────────
function getSpeechRecognitionCtor(): (new () => unknown) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"]) as (new () => unknown) | undefined;
  return Ctor ?? null;
}

function makeRec(Ctor: new () => unknown, lang: string, continuous: boolean, interimResults: boolean): unknown {
  const rec = new Ctor() as Record<string, unknown>;
  rec["lang"] = lang;
  rec["continuous"] = continuous;
  rec["interimResults"] = interimResults;
  return rec;
}

function setHandler(rec: unknown, event: string, handler: unknown) {
  (rec as Record<string, unknown>)[event] = handler;
}

function callMethod(rec: unknown, method: string) {
  ((rec as Record<string, unknown>)[method] as () => void)();
}

// ── Hook ──────────────────────────────────────────────────────────────────
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

  const recognitionRef = useRef<unknown>(null);
  const langIndexRef = useRef(0);
  const startingRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  // Check support on mount (client-only)
  useEffect(() => {
    const supported = getSpeechRecognitionCtor() !== null;
    setState((s) => ({ ...s, isSupported: supported }));
  }, []);

  const buildRecognition = useCallback(
    (langOverride?: string): unknown | null => {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) return null;

      const activeLang = langOverride ?? LANG_CHAIN[langIndexRef.current] ?? lang;
      const rec = makeRec(Ctor, activeLang, continuous, interimResults);

      // onresult
      setHandler(rec, "onresult", (e: unknown) => {
        const ev = e as Record<string, unknown>;
        const resultIndex = ev["resultIndex"] as number ?? 0;
        const results = ev["results"] as Record<number, unknown> & { length: number };
        let interim = "";
        let final = "";
        for (let i = resultIndex; i < results.length; i++) {
          const result = results[i] as Record<string, unknown>;
          const isFinal = result["isFinal"] as boolean;
          const alternatives = result as Record<number, { transcript: string }>;
          const text = alternatives[0]?.transcript ?? "";
          if (isFinal) final += text;
          else interim += text;
        }
        setState((s) => {
          const newTranscript = s.transcript + (final ? (s.transcript ? " " : "") + final : "");
          if (final && onTranscriptRef.current) onTranscriptRef.current(newTranscript);
          return { ...s, transcript: newTranscript, interimTranscript: interim, error: null };
        });
      });

      // onerror
      setHandler(rec, "onerror", (e: unknown) => {
        const errCode = (e as Record<string, unknown>)["error"] as string ?? "unknown";
        if (errCode === "language-not-supported" || errCode === "no-speech") {
          langIndexRef.current = (langIndexRef.current + 1) % LANG_CHAIN.length;
          const nextLang = LANG_CHAIN[langIndexRef.current];
          if (nextLang && nextLang !== activeLang) {
            callMethod(rec, "stop");
            setTimeout(() => {
              const newRec = buildRecognition(nextLang);
              if (newRec) {
                recognitionRef.current = newRec;
                callMethod(newRec, "start");
              }
            }, 300);
            return;
          }
        }
        setState((s) => ({ ...s, isRecording: false, error: friendlyError(errCode) }));
      });

      // onend
      setHandler(rec, "onend", () => {
        startingRef.current = false;
        setState((s) => ({ ...s, isRecording: false, interimTranscript: "" }));
      });

      return rec;
    },
    [continuous, interimResults, lang]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { callMethod(recognitionRef.current, "stop"); } catch { /* ignore */ }
        recognitionRef.current = null;
      }
    };
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
    try { callMethod(rec, "start"); } catch { startingRef.current = false; }
  }, [buildRecognition, lang]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try { callMethod(recognitionRef.current, "stop"); } catch { /* ignore */ }
    }
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

// ── Error messages ─────────────────────────────────────────────────────────
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
