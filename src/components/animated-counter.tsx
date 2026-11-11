'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

/**
 * Smoothly animates numeric values using GSAP while respecting reduced-motion preferences.
 */
export function AnimatedCounter({ value }: { value: number }) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const [displayValue, setDisplayValue] = useState(safeValue);
  const trackerRef = useRef({ val: safeValue });

  useEffect(() => {
    if (trackerRef.current.val === safeValue) {
      setDisplayValue((prev) => (prev === safeValue ? prev : safeValue));
      return;
    }

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      trackerRef.current.val = safeValue;
      setDisplayValue((prev) => (prev === safeValue ? prev : safeValue));
      return;
    }

    const tween = gsap.to(trackerRef.current, {
      val: safeValue,
      duration: 0.75,
      ease: 'power3.out',
      onUpdate: () => {
        const next = Math.round(trackerRef.current.val);
        setDisplayValue((prev) => (prev === next ? prev : next));
      },
    });

    return () => {
      tween.kill();
    };
  }, [safeValue]);

  return <span>{displayValue}</span>;
}

