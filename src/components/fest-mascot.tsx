'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { Sparkles } from 'lucide-react';
import { TeamOrbitCanvas } from '@/components/team-orbit-canvas';
import { cn } from '@/lib/utils';

interface FestMascotProps {
  className?: string;
  pulseKey?: string | number;
  badgeText?: string;
  onMascotClick?: () => void;
}

const WAVE_PERIOD = 190;
const CREST_START_X = 117;
const WAVE_AMPLITUDE = 25;

/**
 * Generates a continuous multi-period cosine wave SVG path between startX and endX.
 */
function buildCosineWavePath(
  startPeriodIndex: number,
  endPeriodIndex: number,
  centerY: number,
  amplitude: number
) {
  const halfWave = WAVE_PERIOD / 2;
  const handleDx = halfWave * 0.3642;
  const x0 = CREST_START_X + startPeriodIndex * WAVE_PERIOD;
  const yTop = centerY - amplitude;
  const yBot = centerY + amplitude;

  let d = `M ${x0.toFixed(1)} ${yTop.toFixed(1)}`;
  for (let p = startPeriodIndex; p < endPeriodIndex; p++) {
    const px = CREST_START_X + p * WAVE_PERIOD;
    const midX = px + halfWave;
    const nextX = px + WAVE_PERIOD;

    d += ` C ${(px + handleDx).toFixed(1)} ${yTop.toFixed(1)}, ${(midX - handleDx).toFixed(1)} ${yBot.toFixed(1)}, ${midX.toFixed(1)} ${yBot.toFixed(1)}`;
    d += ` C ${(midX + handleDx).toFixed(1)} ${yBot.toFixed(1)}, ${(nextX - handleDx).toFixed(1)} ${yTop.toFixed(1)}, ${nextX.toFixed(1)} ${yTop.toFixed(1)}`;
  }
  return d;
}

/**
 * Generates the closed rounded-arch mascot silhouette whose bottom edge follows the ocean crest curve.
 */
function buildMascotBodyPath() {
  const halfWave = WAVE_PERIOD / 2;
  const handleDx = halfWave * 0.3642;
  const bodyCenterY = 381;
  const yTop = bodyCenterY - WAVE_AMPLITUDE; // 356
  const yBot = bodyCenterY + WAVE_AMPLITUDE; // 406

  // Evaluate bottom curve smoothly across x = 459 back down to x = 75 using exact segment points
  // Left edge x = 75, Right edge x = 459, Dome radius = 192 around (267, 279)
  // Trace forward wave from x = -73 to x = 497 so bottom closes tightly, then intersect via clip rect (75..459).
  // Here we build a closed path from (75, 450) up around the dome to (459, 450) and let clip-path shape the wave cut cleanly!
  // Wait: better yet, build the exact wave bottom from right to left across periods -1..2 so no extra bottom clip is needed!
  const xStart = CREST_START_X - WAVE_PERIOD; // -73
  const xEnd = CREST_START_X + 2 * WAVE_PERIOD; // 497

  // Outer dome top path from left (-73..75..267..459..497):
  // Left column x=75 up to (75,279), semicircle arch A 192 192 0 0 1 459 279, down to (459, 440)
  // For clean subtraction/clipping, we return BOTH the dome shape and a bottom wave cutter!
  const waveCutPoints: string[] = [];
  waveCutPoints.push(`M ${xStart} 520 L ${xStart} ${yTop}`);
  for (let p = -1; p < 2; p++) {
    const px = CREST_START_X + p * WAVE_PERIOD;
    const midX = px + halfWave;
    const nextX = px + WAVE_PERIOD;
    waveCutPoints.push(
      `C ${(px + handleDx).toFixed(1)} ${yTop.toFixed(1)}, ${(midX - handleDx).toFixed(1)} ${yBot.toFixed(1)}, ${midX.toFixed(1)} ${yBot.toFixed(1)}`
    );
    waveCutPoints.push(
      `C ${(midX + handleDx).toFixed(1)} ${yBot.toFixed(1)}, ${(nextX - handleDx).toFixed(1)} ${yTop.toFixed(1)}, ${nextX.toFixed(1)} ${yTop.toFixed(1)}`
    );
  }
  waveCutPoints.push(`L ${xEnd} 520 Z`);
  return waveCutPoints.join(' ');
}

/**
 * Animated vector recreation of the Festival Mascot emblem with GSAP wave flow,
 * buoyant float, periodic blink, cursor-following eye tracking, and click splash.
 */
export function FestMascot({
  className,
  pulseKey = 0,
  badgeText = 'Festival Mascot',
  onMascotClick,
}: FestMascotProps) {
  const uid = useId().replace(/:/g, '');
  const columnClipId = `mascot-column-clip-${uid}`;
  const domeMaskId = `mascot-dome-mask-${uid}`;
  const stripeGradId = `mascot-stripe-shimmer-${uid}`;

  const stageRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const pupilRef = useRef<SVGGElement>(null);
  const jumpTriggerRef = useRef<(() => void) | null>(null);

  const wave1Path = useMemo(() => buildCosineWavePath(-1, 3, 434, WAVE_AMPLITUDE), []);
  const wave2Path = useMemo(() => buildCosineWavePath(-1, 3, 505, WAVE_AMPLITUDE), []);
  const wave3Path = useMemo(() => buildCosineWavePath(-1, 3, 576, WAVE_AMPLITUDE), []);
  const bottomCutMaskPath = useMemo(() => buildMascotBodyPath(), []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let movePupilX: gsap.QuickToFunc | null = null;
    let movePupilY: gsap.QuickToFunc | null = null;
    let rotateStageX: gsap.QuickToFunc | null = null;
    let rotateStageY: gsap.QuickToFunc | null = null;

    const ctx = gsap.context(() => {
      if (prefersReducedMotion) return;

      // 1. Entrance pop-up from beneath waves
      gsap.from('.mascot-dome-group', {
        y: 36,
        opacity: 0,
        scale: 0.9,
        transformOrigin: '267px 360px',
        duration: 0.85,
        ease: 'elastic.out(1, 0.65)',
      });
      gsap.from('.mascot-wave-layer', {
        y: 20,
        opacity: 0,
        duration: 0.65,
        stagger: 0.1,
        ease: 'power3.out',
      });

      // 2. Buoyant floating ride on the ocean
      gsap.to('.mascot-dome-group', {
        y: -7,
        rotation: 1.6,
        transformOrigin: '267px 360px',
        duration: 2.1,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });

      // 3. Seamless flowing triple ocean waves (translate full 190px period smoothly)
      gsap.to('.mascot-wave-1-track', {
        x: -WAVE_PERIOD,
        duration: 3.4,
        repeat: -1,
        ease: 'none',
      });
      gsap.to('.mascot-wave-2-track', {
        x: -WAVE_PERIOD,
        duration: 4.3,
        repeat: -1,
        ease: 'none',
      });
      gsap.to('.mascot-wave-3-track', {
        x: -WAVE_PERIOD,
        duration: 5.2,
        repeat: -1,
        ease: 'none',
      });

      // Staggered vertical swell per wave row
      gsap.to('.mascot-wave-row-1', { y: -3, duration: 1.7, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.to('.mascot-wave-row-2', { y: 3, duration: 2.0, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 0.35 });
      gsap.to('.mascot-wave-row-3', { y: -2.5, duration: 2.3, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 0.7 });

      // 4. Shimmer pulse along gold racing stripe
      gsap.to('.mascot-stripe-glow', {
        opacity: 0.55,
        duration: 1.6,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });

      // 5. Periodic playful eye blink
      const blinkTl = gsap.timeline({ repeat: -1, repeatDelay: 3.4 });
      blinkTl
        .to('.mascot-eye-blink', {
          scaleY: 0.08,
          transformOrigin: '159px 179px',
          duration: 0.08,
          ease: 'power2.in',
        })
        .to('.mascot-eye-blink', {
          scaleY: 1,
          transformOrigin: '159px 179px',
          duration: 0.14,
          ease: 'back.out(2)',
        })
        .to('.mascot-eye-blink', {
          scaleY: 0.08,
          transformOrigin: '159px 179px',
          duration: 0.08,
          delay: 0.14,
          ease: 'power2.in',
        })
        .to('.mascot-eye-blink', {
          scaleY: 1,
          transformOrigin: '159px 179px',
          duration: 0.15,
          ease: 'back.out(2)',
        });

      // 6. Floating sparkle accents
      gsap.to('.mascot-spark', {
        y: -8,
        opacity: 0.9,
        scale: 1.15,
        duration: 1.8,
        stagger: 0.45,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });

      if (pupilRef.current) {
        movePupilX = gsap.quickTo(pupilRef.current, 'x', { duration: 0.32, ease: 'power3.out' });
        movePupilY = gsap.quickTo(pupilRef.current, 'y', { duration: 0.32, ease: 'power3.out' });
      }
      if (tiltRef.current) {
        rotateStageX = gsap.quickTo(tiltRef.current, 'rotateX', { duration: 0.45, ease: 'power3.out' });
        rotateStageY = gsap.quickTo(tiltRef.current, 'rotateY', { duration: 0.45, ease: 'power3.out' });
      }

      jumpTriggerRef.current = () => {
        gsap.fromTo(
          '.mascot-click-bounce',
          { y: 0, scaleY: 1, scaleX: 1 },
          {
            keyframes: [
              { y: 4, scaleY: 0.93, scaleX: 1.05, duration: 0.1, ease: 'power2.out' },
              { y: -18, scaleY: 1.06, scaleX: 0.96, duration: 0.24, ease: 'power2.out' },
              { y: 0, scaleY: 1, scaleX: 1, duration: 0.45, ease: 'elastic.out(1.2, 0.45)' },
            ],
            transformOrigin: '267px 400px',
          }
        );
        gsap.fromTo(
          '.mascot-ripple-ring',
          { scale: 0.65, opacity: 0.75 },
          { scale: 1.45, opacity: 0, duration: 0.75, ease: 'power2.out' }
        );
      };
    }, stageRef);

    const handlePointerMove = (e: PointerEvent) => {
      if (prefersReducedMotion) return;
      const rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = Math.max(-1.4, Math.min(1.4, ((e.clientX - rect.left) / rect.width) * 2 - 1));
      const ny = Math.max(-1.4, Math.min(1.4, ((e.clientY - rect.top) / rect.height) * 2 - 1));
      movePupilX?.(nx * 11);
      movePupilY?.(ny * 9);
      rotateStageY?.(nx * 8);
      rotateStageX?.(-ny * 6);
    };

    const handlePointerLeave = () => {
      movePupilX?.(0);
      movePupilY?.(0);
      rotateStageX?.(0);
      rotateStageY?.(0);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    stage.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      stage.removeEventListener('pointerleave', handlePointerLeave);
      jumpTriggerRef.current = null;
      ctx.revert();
    };
  }, []);

  useEffect(() => {
    jumpTriggerRef.current?.();
  }, [pulseKey]);

  const handleClick = () => {
    jumpTriggerRef.current?.();
    onMascotClick?.();
  };

  return (
    <div
      ref={stageRef}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label="Interactive animated festival mascot — click to bounce"
      className={cn(
        'group relative flex h-full w-full cursor-pointer select-none items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-white via-slate-50 to-cyan-50/95 p-3 shadow-inner [perspective:900px]',
        className
      )}
    >
      {/* Subtle studio lighting accents behind mascot */}
      <div className="pointer-events-none absolute -top-10 right-4 h-32 w-32 rounded-full bg-amber-300/25 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-10 left-4 h-36 w-36 rounded-full bg-sky-400/25 blur-2xl" />

      {/* Ripple ring on click */}
      <div className="mascot-ripple-ring pointer-events-none absolute h-44 w-44 rounded-full border-2 border-[#036c8f]/40 opacity-0" />

      {/* Top badge */}
      <div className="pointer-events-none absolute left-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur-md">
        <Sparkles className="h-3 w-3 text-[#cf2829]" />
        <span>{badgeText}</span>
      </div>

      {/* Floating decorative sparks */}
      <span className="mascot-spark pointer-events-none absolute right-6 top-10 z-20 h-2.5 w-2.5 rounded-full bg-[#f6b648] opacity-60" />
      <span className="mascot-spark pointer-events-none absolute left-7 bottom-16 z-20 h-2 w-2 rounded-full bg-[#036c8f] opacity-55" />
      <span className="mascot-spark pointer-events-none absolute right-9 bottom-12 z-20 h-2 w-2 rounded-full bg-[#cf2829] opacity-50" />

      {/* 3D Tilt Wrapper */}
      <div
        ref={tiltRef}
        className="relative z-10 flex h-full w-full items-center justify-center [transform-style:preserve-3d]"
      >
        <svg
          viewBox="55 72 424 565"
          className="h-full max-h-[275px] w-auto drop-shadow-[0_12px_22px_rgba(3,108,143,0.16)]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Straight side bounds matching x=75..459 */}
            <clipPath id={columnClipId}>
              <rect x="75" y="70" width="384" height="575" />
            </clipPath>

            {/* Exact red rounded-dome body clip + wave-cut bottom mask */}
            <mask id={domeMaskId}>
              <rect x="0" y="0" width="540" height="680" fill="black" />
              {/* Outer rounded arch */}
              <path
                d="M 75 445 L 75 279 A 192 192 0 0 1 459 279 L 459 445 Z"
                fill="white"
              />
              {/* Carve bottom wave crest */}
              <path d={bottomCutMaskPath} fill="black" />
              {/* Carve white eye bite on upper-left */}
              <circle cx="162" cy="185" r="97" fill="black" />
            </mask>

            {/* Subtle warm highlight gradient for animated gold stripe */}
            <linearGradient id={stripeGradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fde68a" stopOpacity="0.85" />
              <stop offset="50%" stopColor="#f6b648" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#fef3c7" stopOpacity="0.7" />
            </linearGradient>
          </defs>

          <g className="mascot-click-bounce">
            {/* Buoyant Red Mascot Dome + Gold Stripe + Animated Eye */}
            <g className="mascot-dome-group">
              <g mask={`url(#${domeMaskId})`}>
                {/* Crimson Body */}
                <rect x="65" y="80" width="405" height="390" fill="#cf2829" />

                {/* Golden-Amber Racing Stripe */}
                <path
                  d="M 162 194 A 134.5 134.5 0 0 1 401.5 279 L 401.5 450"
                  fill="none"
                  stroke="#f6b648"
                  strokeWidth="37"
                  strokeLinecap="butt"
                />
                {/* Shimmer pulse pass */}
                <path
                  d="M 162 194 A 134.5 134.5 0 0 1 401.5 279 L 401.5 450"
                  fill="none"
                  stroke={`url(#${stripeGradId})`}
                  strokeWidth="37"
                  opacity="0.15"
                  className="mascot-stripe-glow"
                />
              </g>

              {/* Eye Sclera + Cursor-Tracking Blinking Pupil */}
              <circle cx="162" cy="185" r="97.5" fill="#ffffff" />
              <g className="mascot-eye-blink">
                <g ref={pupilRef}>
                  <circle cx="159" cy="179" r="34" fill="#231f20" />
                </g>
              </g>
            </g>

            {/* Flowing Triple Ocean Waves Clipped Cleanly to Mascot Columns */}
            <g clipPath={`url(#${columnClipId})`}>
              <g className="mascot-wave-layer mascot-wave-row-1">
                <g className="mascot-wave-1-track">
                  <path
                    d={wave1Path}
                    fill="none"
                    stroke="#036c8f"
                    strokeWidth="35"
                    strokeLinecap="round"
                  />
                </g>
              </g>

              <g className="mascot-wave-layer mascot-wave-row-2">
                <g className="mascot-wave-2-track">
                  <path
                    d={wave2Path}
                    fill="none"
                    stroke="#036c8f"
                    strokeWidth="35"
                    strokeLinecap="round"
                  />
                </g>
              </g>

              <g className="mascot-wave-layer mascot-wave-row-3">
                <g className="mascot-wave-3-track">
                  <path
                    d={wave3Path}
                    fill="none"
                    stroke="#036c8f"
                    strokeWidth="36"
                    strokeLinecap="round"
                  />
                </g>
              </g>
            </g>
          </g>
        </svg>
      </div>

      {/* Bottom interaction hint */}
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-20 flex items-center justify-between text-[11px] font-medium text-slate-600">
        <span className="rounded-full border border-slate-200/80 bg-white/85 px-2.5 py-0.5 shadow-sm backdrop-blur-md">
          Live Mascot
        </span>
        <span className="rounded-full border border-sky-200/80 bg-white/85 px-2.5 py-0.5 text-[#036c8f] shadow-sm backdrop-blur-md">
          Move cursor / Click
        </span>
      </div>
    </div>
  );
}

interface MascotOrbitShowcaseProps {
  orbitVariant: 'dashboard' | 'participants' | 'assignments' | 'festival' | 'admin';
  badgeText: string;
  pulseKey?: string | number;
  footerLeftText?: string;
  footerRightText?: string;
  frameTone?: 'dark' | 'adaptive';
  className?: string;
}

/**
 * Hero stage container featuring the animated FestMascot by default with a pill toggle
 * to switch to the interactive Three.js orbital crest.
 */
export function MascotOrbitShowcase({
  orbitVariant,
  badgeText,
  pulseKey = 0,
  footerLeftText = 'Click crest to pulse',
  footerRightText,
  frameTone = 'dark',
  className,
}: MascotOrbitShowcaseProps) {
  const [mode, setMode] = useState<'mascot' | '3d'>('mascot');

  return (
    <div
      className={cn(
        'relative flex h-72 w-full flex-col overflow-hidden rounded-2xl border sm:h-80 lg:h-[330px]',
        frameTone === 'dark'
          ? 'border-white/15 bg-white/[0.04]'
          : 'border-border/50 bg-gradient-to-b from-primary/5 via-transparent to-indigo-500/5',
        className
      )}
    >
      {mode === 'mascot' ? (
        <FestMascot className="h-full w-full" badgeText={badgeText} pulseKey={pulseKey} />
      ) : (
        <div className="relative flex h-full w-full flex-col">
          <div className="min-h-0 flex-1">
            <TeamOrbitCanvas variant={orbitVariant} pulseKey={pulseKey} />
          </div>
          <div className="pointer-events-none flex items-center justify-between gap-2 px-3.5 pb-3 text-[11px]">
            <span
              className={cn(
                'rounded-full border px-2.5 py-1 backdrop-blur-md',
                frameTone === 'dark'
                  ? 'border-white/15 bg-slate-950/75 text-slate-300'
                  : 'border-border/50 bg-background/75 text-muted-foreground'
              )}
            >
              {footerLeftText}
            </span>
            {footerRightText && (
              <span
                className={cn(
                  'rounded-full border px-2.5 py-1 font-mono backdrop-blur-md',
                  frameTone === 'dark'
                    ? 'border-indigo-400/30 bg-slate-950/75 text-indigo-200'
                    : 'border-border/50 bg-background/75 text-foreground'
                )}
              >
                {footerRightText}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="absolute right-3 top-3 z-30 inline-flex rounded-full border border-slate-300/60 bg-slate-950/80 p-0.5 shadow-sm backdrop-blur-md">
        {(
          [
            { id: 'mascot', label: 'Mascot' },
            { id: '3d', label: '3D Core' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMode(tab.id)}
            className={cn(
              'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all',
              mode === tab.id ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-300 hover:text-white'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
