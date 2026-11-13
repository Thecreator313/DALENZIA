'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera, RefreshCw, AlertCircle, QrCode, Loader2 } from 'lucide-react';

interface QrScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (value: string) => void;
  title?: string;
  description?: string;
}

/**
 * Cross-browser mobile & desktop QR code scanner dialog powered by getUserMedia + jsQR.
 * Defaults to the rear camera (`environment`) and provides camera switching and manual fallback.
 */
export function QrScannerDialog({
  open,
  onOpenChange,
  onScan,
  title = 'Scan Participant QR Code',
  description = 'Point the camera at the participant ID card QR code to automatically report them.',
}: QrScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const scanLockedRef = useRef(false);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraState, setCameraState] = useState<'starting' | 'active' | 'error'>('starting');
  const [errorMessage, setErrorMessage] = useState('');
  const [manualValue, setManualValue] = useState('');

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopCamera();
      scanLockedRef.current = false;
      return;
    }

    let cancelled = false;
    scanLockedRef.current = false;
    setCameraState('starting');
    setErrorMessage('');

    const startCamera = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) {
          setCameraState('error');
          setErrorMessage(
            'Camera access is unavailable in this browser context. Please use HTTPS or localhost, or enter the Chest # below.'
          );
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        await video.play();
        setCameraState('active');

        const scanFrame = () => {
          if (cancelled || scanLockedRef.current) return;

          const v = videoRef.current;
          const c = canvasRef.current;
          if (v && c && v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth > 0 && v.videoHeight > 0) {
            if (c.width !== v.videoWidth) c.width = v.videoWidth;
            if (c.height !== v.videoHeight) c.height = v.videoHeight;

            const ctx = c.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(v, 0, 0, c.width, c.height);
              const imageData = ctx.getImageData(0, 0, c.width, c.height);
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert',
              });

              if (code && code.data?.trim()) {
                scanLockedRef.current = true;
                stopCamera();
                onOpenChange(false);
                onScan(code.data.trim());
                return;
              }
            }
          }

          rafRef.current = requestAnimationFrame(scanFrame);
        };

        rafRef.current = requestAnimationFrame(scanFrame);
      } catch (err) {
        if (cancelled) return;
        setCameraState('error');
        const msg =
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Camera permission was denied. Please allow camera access in your browser settings.'
            : 'Unable to start camera. Make sure no other app is using it, or enter the Chest # below.';
        setErrorMessage(msg);
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, facingMode, onOpenChange, onScan, stopCamera]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualValue.trim();
    if (!trimmed) return;
    setManualValue('');
    stopCamera();
    onOpenChange(false);
    onScan(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[94vw] max-w-md rounded-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Camera Viewport */}
          <div className="relative aspect-square sm:aspect-[4/3] w-full overflow-hidden rounded-xl border border-border/60 bg-slate-950 flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="h-full w-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />

            {cameraState === 'starting' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/80 text-slate-200 text-xs">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span>Starting camera...</span>
              </div>
            )}

            {cameraState === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-5 text-center bg-slate-950/90 text-slate-200">
                <AlertCircle className="h-8 w-8 text-rose-400" />
                <p className="text-xs leading-relaxed text-slate-300">{errorMessage}</p>
              </div>
            )}

            {cameraState === 'active' && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-48 w-48 sm:h-52 sm:w-52">
                  {/* Corner reticles */}
                  <span className="absolute top-0 left-0 h-6 w-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                  <span className="absolute top-0 right-0 h-6 w-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                  <span className="absolute bottom-0 left-0 h-6 w-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                  <span className="absolute bottom-0 right-0 h-6 w-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
                  {/* Scan line */}
                  <div className="absolute inset-x-2 top-1/2 h-0.5 bg-emerald-400/80 shadow-[0_0_12px_rgba(52,211,153,0.9)] animate-pulse" />
                </div>
              </div>
            )}
          </div>

          {/* Manual Chest # fallback */}
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <Input
              placeholder="Or type Chest # manually..."
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              className="h-9 text-sm"
            />
            <Button type="submit" size="sm" variant="secondary" disabled={!manualValue.trim()}>
              Submit
            </Button>
          </form>
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Flip Camera
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            <Camera className="mr-1.5 h-3.5 w-3.5" />
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

