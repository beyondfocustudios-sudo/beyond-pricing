"use client";

import { AnimatePresence, LayoutGroup, motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { Check } from "lucide-react";

import { buttonMotionProps, cardHoverProps, motionSafe, transitions, useDesktopHoverMotion, variants } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function MotionPage({
  className,
  children,
  ...props
}: HTMLMotionProps<"div">) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : "initial"}
      animate={reduceMotion ? undefined : "animate"}
      exit={reduceMotion ? undefined : "exit"}
      variants={variants.page}
      transition={transitions.fadeSlide}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function MotionCard({
  className,
  children,
  ...props
}: HTMLMotionProps<"div">) {
  const reduceMotion = useReducedMotion();
  const desktopHover = useDesktopHoverMotion();

  return (
    <motion.div
      layout={motionSafe(!reduceMotion, true)}
      className={className}
      initial={reduceMotion ? false : "initial"}
      animate={reduceMotion ? undefined : "animate"}
      exit={reduceMotion ? undefined : "exit"}
      variants={variants.cardEnter}
      {...cardHoverProps(!reduceMotion && desktopHover)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function MotionList({
  className,
  children,
  ...props
}: HTMLMotionProps<"div">) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : "initial"}
      animate={reduceMotion ? undefined : "animate"}
      variants={variants.containerStagger}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function MotionListItem({
  className,
  children,
  ...props
}: HTMLMotionProps<"div">) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      layout={motionSafe(!reduceMotion, true)}
      className={className}
      variants={variants.itemEnter}
      initial={reduceMotion ? false : "initial"}
      animate={reduceMotion ? undefined : "animate"}
      exit={reduceMotion ? undefined : "exit"}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function Pressable({
  className,
  children,
  ...props
}: HTMLMotionProps<"button">) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      className={className}
      {...buttonMotionProps({ enabled: !reduceMotion })}
      {...props}
    >
      {children}
    </motion.button>
  );
}

export function MotionTabs<T extends string>({
  items,
  active,
  onChange,
  className,
}: {
  items: Array<{ id: T; label: string }>;
  active: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <LayoutGroup id="motion-tabs">
      <div className={cn("tabs-list", className)}>
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <Pressable
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={cn("tab-trigger", isActive && "active", "relative overflow-hidden")}
            >
              {isActive && !reduceMotion ? (
                <motion.span
                  layoutId="motion-tabs-indicator"
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: "color-mix(in srgb, var(--accent-primary) 70%, #0f2934 30%)",
                    border: "1px solid rgba(255,255,255,0.2)",
                  }}
                  transition={transitions.ui}
                />
              ) : null}
              <span className="relative z-10">{item.label}</span>
            </Pressable>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

export function SavedCheckmark({
  show,
  label = "Guardado",
}: {
  show: boolean;
  label?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key="saved-checkmark"
          initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.96 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -6, scale: 0.96 }}
          transition={transitions.soft}
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
          style={{
            borderColor: "var(--success-border)",
            background: "var(--success-bg)",
            color: "var(--success)",
          }}
        >
          <motion.span
            initial={reduceMotion ? false : { scale: 0.7, rotate: -15 }}
            animate={reduceMotion ? undefined : { scale: 1, rotate: 0 }}
            transition={transitions.ui}
            className="inline-flex"
          >
            <Check className="h-3.5 w-3.5" />
          </motion.span>
          {label}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function CopyToast({
  show,
  text = "Copiado",
}: {
  show: boolean;
  text?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key="copy-toast"
          initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.98 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
          transition={transitions.fadeSlide}
          className="fixed bottom-24 right-4 z-[120] rounded-xl border px-3 py-2 text-xs font-medium shadow-lg md:bottom-6"
          style={{
            borderColor: "var(--border-soft)",
            background: "color-mix(in srgb, var(--surface) 92%, transparent)",
            color: "var(--text)",
            backdropFilter: "blur(8px)",
          }}
        >
          {text}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

