'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

/**
 * Smoothly animates numeric values using GSAP while respecting reduced-motion preferences.
 */
export function AnimatedCounter({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value);
  const trackerRef = useRef({ val: value });

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      trackerRef.current.val = value;
      setDisplayValue(value);
      return;
    }

    const tween = gsap.to(trackerRef.current, {
      val: value,
      duration: 0.75,
      ease: 'power3.out',
      onUpdate: () => setDisplayValue(Math.round(trackerRef.current.val)),
    });

    return () => {
      tween.kill();
    };
  }, [value]);

  return <span>{displayValue}</span>;
}

