"use client";

import { useEffect, useState } from "react";
import { useReducedMotion, type MotionProps, type Transition, type Variants } from "framer-motion";

const easeOutBase44 = [0.22, 1, 0.36, 1] as const;
const easeInOutBase44 = [0.4, 0, 0.2, 1] as const;

export const spring = {
  fast: { type: "spring", stiffness: 380, damping: 32, mass: 0.7 } satisfies Transition,
  ui: { type: "spring", stiffness: 300, damping: 30, mass: 0.8 } satisfies Transition,
  soft: { type: "spring", stiffness: 220, damping: 26, mass: 0.9 } satisfies Transition,
};

export const durations = {
  fadeFast: 0.18,
  fade: 0.22,
  fadeSlow: 0.24,
};

export const transitions = {
  page: { duration: durations.fade, ease: easeOutBase44 } satisfies Transition,
  fadeSlide: { duration: durations.fade, ease: easeOutBase44 } satisfies Transition,
  micro: spring.fast,
  ui: spring.ui,
  soft: spring.soft,
  smooth: { duration: durations.fade, ease: easeOutBase44 } satisfies Transition,
  inOut: { duration: durations.fadeSlow, ease: easeInOutBase44 } satisfies Transition,
};

export const variants = {
  page: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  } satisfies Variants,
  containerStagger: {
    initial: {},
    animate: {
      transition: {
        staggerChildren: 0.06,
        delayChildren: 0.02,
      },
    },
    exit: {
      transition: {
        staggerChildren: 0.03,
        staggerDirection: -1,
      },
    },
  } satisfies Variants,
  itemEnter: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0, transition: transitions.fadeSlide },
    exit: { opacity: 0, y: -8, transition: transitions.fadeSlide },
  } satisfies Variants,
  cardEnter: {
    initial: { opacity: 0, y: 14, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1, transition: transitions.soft },
    exit: { opacity: 0, y: -10, scale: 0.985, transition: transitions.fadeSlide },
  } satisfies Variants,
  modalEnter: {
    initial: { opacity: 0, scale: 0.98, y: 8 },
    animate: { opacity: 1, scale: 1, y: 0, transition: transitions.soft },
    exit: { opacity: 0, scale: 0.985, y: 6, transition: transitions.fadeSlide },
  } satisfies Variants,
  tab: {
    initial: { opacity: 0, x: 10 },
    animate: { opacity: 1, x: 0, transition: transitions.fadeSlide },
    exit: { opacity: 0, x: -10, transition: transitions.fadeSlide },
  } satisfies Variants,
  listItem: {
    initial: { opacity: 0, height: 0, y: 8 },
    animate: { opacity: 1, height: "auto", y: 0, transition: transitions.soft },
    exit: { opacity: 0, height: 0, y: -8, transition: transitions.fadeSlide },
  } satisfies Variants,
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: transitions.fadeSlide },
    exit: { opacity: 0, transition: transitions.fadeSlide },
  } satisfies Variants,
};

export function useMotionEnabled() {
  const reduceMotion = useReducedMotion();
  return !reduceMotion;
}

export function motionSafe<T>(enabled: boolean, value: T): T | undefined {
  return enabled ? value : undefined;
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
    whileHover: { y: opts.hoverY ?? -1.5, scale: 1.01 },
    whileTap: { scale: opts.tapScale ?? 0.98 },
    transition: transitions.ui,
  };
}

export function cardHoverProps(enabled: boolean): Pick<MotionProps, "whileHover" | "transition"> {
  if (!enabled) return {};
  return {
    whileHover: { y: -4, scale: 1.004 },
    transition: transitions.ui,
  };
}
