"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { BookOpen, Mic, MicOff, Download, Sparkles, Plus, X, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/components/Toast";

type Mood = "great" | "good" | "neutral" | "bad" | "terrible";

const MOODS: { value: Mood; emoji: string; label: string }[] = [
  { value: "great", emoji: "😄", label: "Ótimo" },
  { value: "good", emoji: "😊", label: "Bom" },
  { value: "neutral", emoji: "😐", label: "Normal" },
  { value: "bad", emoji: "😞", label: "Mau" },
  { value: "terrible", emoji: "😢", label: "Péssimo" },
];

const MOOD_MAP: Record<Mood, string> = {
  great: "😄", good: "😊", neutral: "😐", bad: "😞", terrible: "😢",
};

interface JournalEntry {
  id: string;
  title: string;
  body: string;
  mood: Mood | null;
  tags: string[];
  created_at: string;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

export default function JournalPage() {
  const toast = useToast();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mood, setMood] = useState<Mood | null>(null);
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);

  const [recording, setRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const [summarizing, setSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSpeechSupported(!!SR);
  }, []);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/journal");
      if (res.ok) {
        const data = await res.json() as { entries: JournalEntry[] };
        setEntries(data.entries ?? []);
      } else {
        const msg = "Erro ao carregar entradas do journal";
        setLoadError(msg);
        toast.error(msg);
      }
    } catch {
      const msg = "Sem ligação — não foi possível carregar o journal";
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const toggleRecording = () => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return;
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "pt-PT";
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(" ");
      setBody((prev) => prev ? prev + " " + transcript : transcript);
    };
    rec.onerror = () => setRecording(false);
    rec.start();
    recognitionRef.current = rec;
    setRecording(true);
  };

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    try {
      const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, mood, tags }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        toast.error(errData.error ?? "Erro ao guardar entrada");
        return;
      }
      toast.success("Entrada guardada");
      setTitle(""); setBody(""); setMood(null); setTagsInput(""); setSummary(null);
      setShowForm(false);
      await fetchEntries();
    } catch {
      toast.error("Sem ligação — entrada não guardada");
    } finally {
      setSaving(false);
    }
  };

  const handleSummarize = async () => {
    if (!body.trim()) return;
    setSummarizing(true);
    try {
      const res = await fetch("/api/journal/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        const data = await res.json() as { summary: string };
        setSummary(data.summary ?? "");
      }
    } finally {
      setSummarizing(false);
    }
  };

  const downloadAs = (ext: "txt" | "md") => {
    const content = ext === "md"
      ? `# ${title}\n\n${body}`
      : `${title}\n${"=".repeat(title.length)}\n\n${body}`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `journal-${Date.now()}.${ext}`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6" style={{ color: "var(--accent)" }} />
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>Journal</h1>
            <p className="text-sm" style={{ color: "var(--text-3)" }}>As tuas notas e reflexões</p>
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" />
          Nova entrada
        </button>
      </div>

      {showForm && (
        <div className="card-glass rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold" style={{ color: "var(--text)" }}>Nova entrada</h2>
            <button className="btn btn-ghost btn-icon-sm" onClick={() => setShowForm(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <input
            className="input w-full"
            placeholder="Título..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="relative">
            <textarea
              className="input w-full min-h-[160px] resize-y"
              placeholder="Escreve aqui..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            {speechSupported && (
              <button
                className={`absolute bottom-3 right-3 btn btn-sm ${recording ? "btn-primary" : "btn-secondary"}`}
                onClick={toggleRecording}
                title={recording ? "Parar ditado" : "Iniciar ditado por voz"}
              >
                {recording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                {recording ? "Parar" : "Voz"}
              </button>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Humor</p>
            <div className="flex gap-2 flex-wrap">
              {MOODS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMood(mood === m.value ? null : m.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all ${mood === m.value ? "ring-2" : ""}`}
                  style={{
                    background: mood === m.value ? "var(--accent)" : "var(--surface-2)",
                    color: "var(--text)",
                  }}
                  title={m.label}
                >
                  {m.emoji} {m.label}
                </button>
              ))}
            </div>
          </div>

          <input
            className="input w-full"
            placeholder="Tags (separadas por vírgula)..."
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
          />

          {summary && (
            <div className="rounded-lg p-3 text-sm" style={{ background: "var(--accent-subtle)", color: "var(--text-2)", border: "1px solid var(--accent)" }}>
              <p className="font-medium mb-1" style={{ color: "var(--accent)" }}>Resumo IA</p>
              {summary}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !title.trim() || !body.trim()}>
              {saving ? "A guardar…" : "Guardar"}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleSummarize} disabled={summarizing || !body.trim()}>
              <Sparkles className="h-3.5 w-3.5" />
              {summarizing ? "A resumir…" : "Resumir com IA"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => downloadAs("txt")} disabled={!body.trim()}>
              <Download className="h-3.5 w-3.5" /> .txt
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => downloadAs("md")} disabled={!body.trim()}>
              <Download className="h-3.5 w-3.5" /> .md
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card-glass rounded-xl p-4 animate-pulse h-20" style={{ background: "var(--surface)" }} />
          ))}
        </div>
      ) : loadError ? (
        <div className="card-glass rounded-xl p-10 text-center space-y-3">
          <p style={{ color: "var(--text-2)" }}>{loadError}</p>
          <button className="btn btn-secondary btn-sm" onClick={fetchEntries}>Tentar novamente</button>
        </div>
      ) : entries.length === 0 ? (
        <div className="card-glass rounded-xl p-10 text-center space-y-2">
          <BookOpen className="h-10 w-10 mx-auto" style={{ color: "var(--text-3)" }} />
          <p style={{ color: "var(--text-2)" }}>Sem entradas ainda</p>
          <p className="text-sm" style={{ color: "var(--text-3)" }}>Começa por escrever a tua primeira nota</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const expanded = expandedId === entry.id;
            return (
              <div key={entry.id} className="card-glass rounded-xl p-4 space-y-2 cursor-pointer" onClick={() => setExpandedId(expanded ? null : entry.id)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {entry.mood && <span className="text-lg shrink-0">{MOOD_MAP[entry.mood]}</span>}
                    <p className="font-semibold truncate" style={{ color: "var(--text)" }}>{entry.title}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs" style={{ color: "var(--text-3)" }}>
                      {new Date(entry.created_at).toLocaleDateString("pt-PT")}
                    </span>
                    {expanded ? <ChevronUp className="h-4 w-4" style={{ color: "var(--text-3)" }} /> : <ChevronDown className="h-4 w-4" style={{ color: "var(--text-3)" }} />}
                  </div>
                </div>
                <p className="text-sm" style={{ color: "var(--text-2)" }}>
                  {expanded ? entry.body : entry.body.slice(0, 100) + (entry.body.length > 100 ? "…" : "")}
                </p>
                {entry.tags.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {entry.tags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 rounded-full text-xs" style={{ background: "var(--surface-2)", color: "var(--text-3)" }}>
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
