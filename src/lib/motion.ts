"use client";

import { useEffect, useState } from "react";
import { useReducedMotion, type MotionProps, type Transition, type Variants } from "framer-motion";

export const transitions = {
  page: { duration: 0.26, ease: "easeOut" } satisfies Transition,
  micro: { type: "spring", stiffness: 380, damping: 32, mass: 0.6 } satisfies Transition,
  smooth: { duration: 0.22, ease: "easeOut" } satisfies Transition,
};

export const variants = {
  page: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  } satisfies Variants,
  tab: {
    initial: { opacity: 0, x: 12 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -12 },
  } satisfies Variants,
  listItem: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  } satisfies Variants,
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  } satisfies Variants,
};

export function useMotionEnabled() {
  const reduceMotion = useReducedMotion();
  return !reduceMotion;
}

export function useDesktopHoverMotion() {
  const enabled = useMotionEnabled();
  const [canHover, setCanHover] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine)");
    const onChange = () => setCanHover(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return enabled && canHover;
}

export function buttonMotionProps(opts: {
  enabled: boolean;
  hoverY?: number;
  tapScale?: number;
}): Pick<MotionProps, "whileHover" | "whileTap" | "transition"> {
  if (!opts.enabled) return {};
  return {
    whileHover: { y: opts.hoverY ?? -1.5 },
    whileTap: { scale: opts.tapScale ?? 0.98 },
    transition: transitions.micro,
  };
}

export function cardHoverProps(enabled: boolean): Pick<MotionProps, "whileHover" | "transition"> {
  if (!enabled) return {};
  return {
    whileHover: { y: -4, scale: 1.004 },
    transition: transitions.micro,
  };
}
