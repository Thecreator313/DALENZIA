'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import gsap from 'gsap';
import { cn } from '@/lib/utils';

interface ScratchCardProps {
  isRevealed: boolean;
  revealedContent: React.ReactNode;
  width?: number;
  height?: number;
  coverColor?: string;
  scratchColor?: string;
  finishPercent?: number;
  label?: string;
  onRevealComplete?: () => void;
  className?: string;
}

export const ScratchCardComponent = ({
  isRevealed,
  revealedContent,
  width = 96,
  height = 64,
  coverColor = '#94a3b8',
  scratchColor = '#e2e8f0',
  finishPercent = 45,
  label = 'Scratch',
  onRevealComplete,
  className,
}: ScratchCardProps) => {
  const [isClient, setIsClient] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isScratched, setIsScratched] = useState(false);
  const hasNotifiedRef = useRef(false);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.globalCompositeOperation = 'source-over';

    // Metallic foil gradient
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#64748b');
    grad.addColorStop(0.35, scratchColor);
    grad.addColorStop(0.65, coverColor);
    grad.addColorStop(1, '#475569');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Subtle diagonal foil pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1;
    for (let i = -height; i < width + height; i += 10) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + height, height);
      ctx.stroke();
    }

    // Label text
    ctx.fillStyle = '#0f172a';
    ctx.font = `600 ${width >= 160 ? 13 : 11}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, width / 2, height / 2);
  }, [width, height, coverColor, scratchColor, label]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isClient) {
      setupCanvas();
    }
  }, [isClient, setupCanvas]);

  // GSAP pop-in animation when revealed
  useEffect(() => {
    const revealedNow = isScratched || isRevealed;
    if (!revealedNow) {
      hasNotifiedRef.current = false;
      return;
    }

    if (isScratched && !hasNotifiedRef.current) {
      hasNotifiedRef.current = true;
      onRevealComplete?.();
    }

    const el = contentRef.current;
    if (!el) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) return;

    gsap.fromTo(
      el,
      { scale: 0.55, opacity: 0, rotateY: -28 },
      {
        scale: 1,
        opacity: 1,
        rotateY: 0,
        duration: 0.65,
        ease: 'elastic.out(1, 0.6)',
      }
    );
  }, [isScratched, isRevealed, onRevealComplete]);

  const getBrushPos = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((x - rect.left) / rect.width) * width,
      y: ((y - rect.top) / rect.height) * height,
    };
  };

  const scratch = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, width >= 160 ? 18 : 12, 0, 2 * Math.PI);
    ctx.fill();
  };

  const checkScratchCompletion = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;
    let transparentPixels = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] === 0) {
        transparentPixels++;
      }
    }

    const totalPixels = width * height;
    const scratchedPercentage = (transparentPixels / totalPixels) * 100;

    if (scratchedPercentage > finishPercent) {
      setIsScratched(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (e.buttons === 1) {
      const pos = getBrushPos(e.clientX, e.clientY);
      scratch(ctx, pos.x, pos.y);
      checkScratchCompletion();
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getBrushPos(e.clientX, e.clientY);
    scratch(ctx, pos.x, pos.y);
    checkScratchCompletion();
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (e.targetTouches.length === 1) {
      const touch = e.targetTouches[0];
      const pos = getBrushPos(touch.clientX, touch.clientY);
      scratch(ctx, pos.x, pos.y);
      checkScratchCompletion();
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (e.targetTouches.length === 1) {
      const touch = e.targetTouches[0];
      const pos = getBrushPos(touch.clientX, touch.clientY);
      scratch(ctx, pos.x, pos.y);
      checkScratchCompletion();
    }
  };

  if (!isClient) {
    return (
      <div
        style={{ width, height }}
        className={cn('flex items-center justify-center bg-slate-300 rounded-md', className)}
      >
        {isRevealed ? revealedContent : null}
      </div>
    );
  }

  return (
    <div
      className={cn('relative overflow-hidden select-none', className)}
      style={{ width, height, perspective: 600 }}
    >
      <div ref={contentRef} className="absolute inset-0 flex items-center justify-center">
        {revealedContent}
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        className={cn(
          'absolute inset-0 cursor-crosshair touch-none transition-opacity duration-500 rounded-md',
          isScratched || isRevealed ? 'opacity-0 pointer-events-none' : 'opacity-100'
        )}
      />
    </div>
  );
};

export { ScratchCardComponent as ScratchCard };
