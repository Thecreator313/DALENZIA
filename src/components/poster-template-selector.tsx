'use client';

import Link from 'next/link';
import type { PosterTemplateItem } from '@/lib/poster-template';
import { cn } from '@/lib/utils';
import { Check, LayoutTemplate, Settings2 } from 'lucide-react';

interface PosterTemplateSelectorProps {
  templates: PosterTemplateItem[];
  selectedId: string;
  onSelect: (templateId: string) => void;
  className?: string;
}

/**
 * Clean template switcher allowing users to toggle between active poster styles
 * before downloading PNG or sharing to WhatsApp.
 */
export function PosterTemplateSelector({
  templates,
  selectedId,
  onSelect,
  className,
}: PosterTemplateSelectorProps) {
  if (!templates || templates.length === 0) return null;

  return (
    <div className={cn('space-y-2 rounded-2xl border border-border/60 bg-muted/20 p-3 sm:p-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <LayoutTemplate className="h-4 w-4 text-primary" />
          <span>Select Poster Template {templates.length > 1 ? `(${templates.length} Available)` : ''}</span>
        </div>
        <Link
          href="/admin/poster-template"
          className="text-xs font-medium normal-case text-primary hover:underline inline-flex items-center gap-1 transition-colors"
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span>Manage in Poster Studio</span>
        </Link>
      </div>
      <div className="flex flex-wrap gap-2.5 pt-1">
        {templates.map((tpl) => {
          const isSelected = tpl.id === selectedId;
          const isPortrait = tpl.settings.canvasHeight >= tpl.settings.canvasWidth;

          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onSelect(tpl.id)}
              className={cn(
                'flex items-center gap-2.5 rounded-xl border p-2 sm:px-3 sm:py-2 text-left transition-all',
                isSelected
                  ? 'border-primary bg-primary/15 text-foreground ring-1 ring-primary/40 shadow-sm'
                  : 'border-border/60 bg-background/70 text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              <div
                className={cn(
                  'relative shrink-0 overflow-hidden rounded-md border border-white/20 shadow-sm',
                  isPortrait ? 'h-9 w-7' : 'h-7 w-9'
                )}
                style={{
                  backgroundImage: tpl.settings.backgroundImageUrl
                    ? `url(${tpl.settings.backgroundImageUrl})`
                    : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundColor: tpl.settings.backgroundColor || '#0f172a',
                }}
              >
                {isSelected && (
                  <span className="absolute inset-0 flex items-center justify-center bg-primary/40 backdrop-blur-[1px]">
                    <Check className="h-3.5 w-3.5 text-white drop-shadow" />
                  </span>
                )}
              </div>
              <div className="min-w-0 pr-1">
                <div className="truncate text-xs font-semibold leading-tight flex items-center gap-1.5">
                  <span>{tpl.name}</span>
                  {isSelected && (
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                  {tpl.settings.canvasWidth}×{tpl.settings.canvasHeight}px
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

