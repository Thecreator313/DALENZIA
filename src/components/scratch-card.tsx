
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface ScratchCardProps {
  isRevealed: boolean;
  revealedContent: React.ReactNode;
  width?: number;
  height?: number;
  coverColor?: string;
  scratchColor?: string;
  finishPercent?: number;
}

export const ScratchCardComponent = ({
  isRevealed,
  revealedContent,
  width = 96,
  height = 64,
  coverColor = '#d1d5db', // gray-300
  scratchColor = '#e5e7eb', // gray-200
  finishPercent = 50,
}: ScratchCardProps) => {
  const [isClient, setIsClient] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScratched, setIsScratched] = useState(false);
  
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Fill the canvas with the cover color
    ctx.fillStyle = coverColor;
    ctx.fillRect(0, 0, width, height);

    // Add "Scratch to reveal" text
    ctx.fillStyle = '#4b5563'; // gray-600
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Scratch', width / 2, height / 2);
  }, [width, height, coverColor]);

  useEffect(() => {
    setIsClient(true);
    if(isClient){
      setupCanvas();
    }
  }, [isClient, setupCanvas]);

  const getBrushPos = (x, y) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: x - rect.left,
      y: y - rect.top,
    };
  };

  const scratch = (ctx, x, y) => {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, 2 * Math.PI);
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

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    if (e.buttons === 1) { // Left mouse button is down
      const pos = getBrushPos(e.clientX, e.clientY);
      scratch(ctx, pos.x, pos.y);
      checkScratchCompletion();
    }
  };

  const handleTouchMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (e.targetTouches.length === 1) {
        e.preventDefault();
        const touch = e.targetTouches[0];
        const pos = getBrushPos(touch.clientX, touch.clientY);
        scratch(ctx, pos.x, pos.y);
        checkScratchCompletion();
    }
  };

  if (!isClient) {
    return (
      <div style={{ width, height }} className="flex items-center justify-center bg-gray-300 rounded-md">
         {isRevealed ? revealedContent : null}
      </div>
    );
  }

  return (
    <div className="relative" style={{ width, height }}>
      <div className="absolute inset-0 flex items-center justify-center">
        {revealedContent}
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouchMove}
        className={cn(
          "absolute inset-0 transition-opacity duration-500 rounded-md",
          (isScratched || isRevealed) ? 'opacity-0 pointer-events-none' : 'opacity-100'
        )}
      />
    </div>
  );
};

export { ScratchCardComponent as ScratchCard };

