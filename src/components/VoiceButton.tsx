"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff, AlertCircle } from "lucide-react";
import { useVoiceDictation } from "@/lib/voice/useVoiceDictation";

interface VoiceButtonProps {
  /** Called when user clicks "Inserir" — receives the full transcript */
  onInsert: (text: string) => void;
  /** Language override (default: pt-PT) */
  lang?: string;
  /** Extra class on the container */
  className?: string;
}

export function VoiceButton({ onInsert, lang = "pt-PT", className = "" }: VoiceButtonProps) {
  const { isSupported, isRecording, transcript, interimTranscript, error, toggle, clear } =
    useVoiceDictation({ lang });

  // Auto-stop on unmount (safety)
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    return () => { stopRef.current?.(); };
  }, []);

  if (!isSupported) {
    return (
      <div
        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg ${className}`}
        style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.2)" }}
      >
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span>Ditado não disponível — usa Chrome ou Edge</span>
      </div>
    );
  }

  const hasContent = transcript.trim().length > 0 || interimTranscript.trim().length > 0;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Main row */}
      <div className="flex items-center gap-2">
        {/* Mic toggle button */}
        <button
          type="button"
          onClick={toggle}
          title={isRecording ? "Parar ditado" : "Iniciar ditado por voz (grátis — requer Chrome/Edge)"}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all select-none"
          style={{
            background: isRecording
              ? "rgba(239,68,68,0.15)"
              : "rgba(26,143,163,0.12)",
            color: isRecording ? "#ef4444" : "var(--accent, #1a8fa3)",
            border: `1px solid ${isRecording ? "rgba(239,68,68,0.3)" : "rgba(26,143,163,0.25)"}`,
            boxShadow: isRecording ? "0 0 0 2px rgba(239,68,68,0.15)" : "none",
          }}
        >
          {isRecording ? (
            <>
              {/* Pulse animation */}
              <span className="relative flex h-3.5 w-3.5">
                <span
                  className="absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{ background: "#ef4444", animation: "ping 1s cubic-bezier(0,0,0.2,1) infinite" }}
                />
                <MicOff className="relative h-3.5 w-3.5" />
              </span>
              A gravar…
            </>
          ) : (
            <>
              <Mic className="h-3.5 w-3.5" />
              Ditado
            </>
          )}
        </button>

        {/* Insert button — only shown when there is content */}
        {hasContent && !isRecording && (
          <button
            type="button"
            onClick={() => {
              if (transcript.trim()) {
                onInsert(transcript.trim());
                clear();
              }
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: "var(--accent, #1a8fa3)",
              color: "white",
            }}
          >
            Inserir
          </button>
        )}

        {/* Clear */}
        {hasContent && (
          <button
            type="button"
            onClick={clear}
            className="px-2 py-1.5 rounded-lg text-xs transition-all"
            style={{ color: "var(--text-3, #8b98b0)" }}
          >
            Limpar
          </button>
        )}
      </div>

      {/* Transcript preview */}
      {(hasContent || isRecording) && (
        <div
          className="text-xs px-3 py-2 rounded-lg min-h-[2rem]"
          style={{
            background: "var(--surface-2, rgba(13,17,27,0.6))",
            border: "1px solid var(--border, rgba(30,39,54,0.8))",
            color: "var(--text, #f0f4f8)",
            lineHeight: 1.5,
          }}
        >
          {transcript}
          {interimTranscript && (
            <span style={{ color: "var(--text-3, #8b98b0)" }}> {interimTranscript}</span>
          )}
          {isRecording && !hasContent && (
            <span style={{ color: "var(--text-3, #8b98b0)" }}>A ouvir…</span>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs flex items-center gap-1" style={{ color: "#f87171" }}>
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
