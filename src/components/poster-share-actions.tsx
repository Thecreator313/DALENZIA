'use client';

import { useState, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Check, Copy, Download, Loader2, MessageCircle } from 'lucide-react';
import {
  buildWhatsAppSummaryText,
  downloadPosterBlob,
  type PosterResultInput,
} from '@/lib/poster-template';
import type { ResultPosterCanvasHandle } from '@/components/result-poster-canvas';
import { cn } from '@/lib/utils';

interface PosterShareActionsProps {
  posterRef: RefObject<ResultPosterCanvasHandle | null>;
  result: PosterResultInput;
  festName: string;
  templateName?: string;
  shareUrl?: string;
  compact?: boolean;
  className?: string;
}

function toSafeFilename(programName: string, resultNumber?: number, templateName?: string) {
  const slug = (programName || 'poster')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const tplSlug = templateName
    ? templateName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
    : '';
  return `result${resultNumber ? `-${resultNumber}` : ''}-${slug || 'poster'}${
    tplSlug ? `-${tplSlug}` : ''
  }.png`;
}

/**
 * Shared Download HD PNG, Copy Poster to Clipboard, and Direct WhatsApp Share controls.
 */
export function PosterShareActions({
  posterRef,
  result,
  festName,
  templateName,
  shareUrl,
  compact = false,
  className,
}: PosterShareActionsProps) {
  const [busyAction, setBusyAction] = useState<'download' | 'whatsapp' | 'copy' | null>(null);
  const [copied, setCopied] = useState(false);

  const exportBlob = async () => {
    if (!posterRef.current) {
      throw new Error('Poster canvas is still initializing.');
    }
    return await posterRef.current.exportPngBlob();
  };

  const handleExportError = (err: unknown) => {
    console.error('Poster export failed:', err);
    toast({
      title: 'Export Failed',
      description:
        'Could not render poster PNG. If using a pasted external URL, re-upload the background image via the Upload button so CORS allows export.',
      variant: 'destructive',
    });
  };

  const handleDownload = async () => {
    setBusyAction('download');
    try {
      const blob = await exportBlob();
      downloadPosterBlob(blob, toSafeFilename(result.programName, result.resultNumber, templateName));
      toast({ title: 'Poster Downloaded', description: 'Saved high-resolution PNG poster.' });
    } catch (err) {
      handleExportError(err);
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopyImage = async () => {
    setBusyAction('copy');
    try {
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
        toast({
          title: 'Clipboard Unavailable',
          description: 'Use Download PNG and attach the file manually in WhatsApp.',
          variant: 'destructive',
        });
        return;
      }
      const blob = await exportBlob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      toast({
        title: 'Poster Copied',
        description: 'Paste (Cmd+V / Ctrl+V) directly into any WhatsApp chat!',
      });
    } catch (err) {
      handleExportError(err);
    } finally {
      setBusyAction(null);
    }
  };

  const handleShareWhatsApp = async () => {
    setBusyAction('whatsapp');
    try {
      const blob = await exportBlob();
      const filename = toSafeFilename(result.programName, result.resultNumber, templateName);
      const file = new File([blob], filename, { type: 'image/png' });
      const resolvedUrl =
        shareUrl || (typeof window !== 'undefined' ? window.location.href : undefined);
      const caption = buildWhatsAppSummaryText(result, festName, resolvedUrl);

      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({
            files: [file],
            title: `${festName} - ${result.programName}`,
            text: caption,
          });
          return;
        } catch (shareErr: any) {
          if (shareErr?.name === 'AbortError') return;
        }
      }

      // Desktop fallback: download PNG, copy to clipboard if permitted, and open WhatsApp Web with caption
      downloadPosterBlob(blob, filename);
      let clipboardCopied = false;
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          clipboardCopied = true;
        } catch {
          // Ignore clipboard write rejection if browser blocks background copy
        }
      }

      const waUrl = `https://wa.me/?text=${encodeURIComponent(caption)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');

      toast({
        title: 'Ready for WhatsApp',
        description: clipboardCopied
          ? 'Poster PNG downloaded & copied! Paste or attach it in the opened WhatsApp window.'
          : 'Poster PNG downloaded! Attach the saved PNG in the opened WhatsApp window.',
      });
    } catch (err) {
      handleExportError(err);
    } finally {
      setBusyAction(null);
    }
  };

  const isBusy = busyAction !== null;

  return (
    <div className={cn('flex flex-wrap items-center gap-2.5', className)}>
      <Button
        type="button"
        onClick={handleDownload}
        disabled={isBusy}
        size={compact ? 'sm' : 'default'}
        className="rounded-xl shadow-sm"
      >
        {busyAction === 'download' ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Download className="mr-2 h-4 w-4" />
        )}
        Download PNG
      </Button>

      <Button
        type="button"
        onClick={handleShareWhatsApp}
        disabled={isBusy}
        size={compact ? 'sm' : 'default'}
        className="rounded-xl border-0 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
      >
        {busyAction === 'whatsapp' ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <MessageCircle className="mr-2 h-4 w-4" />
        )}
        Share to WhatsApp
      </Button>

      <Button
        type="button"
        variant="outline"
        onClick={handleCopyImage}
        disabled={isBusy}
        size={compact ? 'sm' : 'default'}
        className="rounded-xl"
      >
        {busyAction === 'copy' ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : copied ? (
          <Check className="mr-2 h-4 w-4 text-emerald-500" />
        ) : (
          <Copy className="mr-2 h-4 w-4" />
        )}
        {copied ? 'Copied' : 'Copy Image'}
      </Button>
    </div>
  );
}
