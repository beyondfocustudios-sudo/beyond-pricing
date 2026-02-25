"use client";

import { useEffect, useMemo, useRef } from "react";

export function OtpCodeInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const chars = useMemo(
    () => Array.from({ length }, (_, i) => value[i] ?? ""),
    [length, value],
  );

  useEffect(() => {
    if (!autoFocus || disabled) return;
    const firstEmpty = chars.findIndex((char) => !char);
    const targetIndex = firstEmpty >= 0 ? firstEmpty : length - 1;
    refs.current[targetIndex]?.focus();
  }, [autoFocus, chars, disabled, length]);

  const writeAt = (index: number, char: string) => {
    const next = chars.slice();
    next[index] = char;
    onChange(next.join(""));
  };

  return (
    <div className="flex items-center gap-2">
      {chars.map((char, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={char}
          disabled={disabled}
          className="h-11 w-10 rounded-xl border text-center text-base font-semibold tabular-nums outline-none transition-all"
          style={{
            borderColor: "var(--border-soft)",
            background: "linear-gradient(180deg, rgba(255,255,255,0.08), transparent), var(--surface-2)",
            color: "var(--text)",
          }}
          onChange={(event) => {
            const digit = event.target.value.replace(/\D/g, "").slice(-1);
            writeAt(index, digit);
            if (digit && index < length - 1) refs.current[index + 1]?.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace") {
              if (chars[index]) {
                writeAt(index, "");
                return;
              }
              if (index > 0) {
                refs.current[index - 1]?.focus();
                writeAt(index - 1, "");
              }
              return;
            }
            if (event.key === "ArrowLeft" && index > 0) {
              refs.current[index - 1]?.focus();
            }
            if (event.key === "ArrowRight" && index < length - 1) {
              refs.current[index + 1]?.focus();
            }
          }}
          onPaste={(event) => {
            event.preventDefault();
            const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
            if (!digits) return;
            onChange(digits);
            refs.current[Math.min(digits.length, length) - 1]?.focus();
          }}
        />
      ))}
    </div>
  );
}
