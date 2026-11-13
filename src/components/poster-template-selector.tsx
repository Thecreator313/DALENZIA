'use client';

import type { PosterTemplateItem } from '@/lib/poster-template';
import { cn } from '@/lib/utils';
import { Check, LayoutTemplate } from 'lucide-react';

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
  if (templates.length <= 1) return null;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <LayoutTemplate className="h-3.5 w-3.5 text-primary" />
        Choose Poster Style
      </div>
      <div className="flex flex-wrap gap-2">
        {templates.map((tpl) => {
          const isSelected = tpl.id === selectedId;
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onSelect(tpl.id)}
              className={cn(
                'flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all',
                isSelected
                  ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary/30 shadow-sm'
                  : 'border-border/60 bg-background/60 text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              <div
                className="relative h-9 w-7 shrink-0 overflow-hidden rounded-md border border-white/20 shadow-sm"
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
                  <span className="absolute inset-0 flex items-center justify-center bg-primary/35">
                    <Check className="h-3.5 w-3.5 text-white drop-shadow" />
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold leading-tight">{tpl.name}</div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {tpl.settings.canvasWidth}×{tpl.settings.canvasHeight}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

