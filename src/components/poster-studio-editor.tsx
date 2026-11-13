'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  Loader2,
  Upload,
  Save,
  RotateCcw,
  Image as ImageIcon,
  Download,
  Move,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowLeftRight,
  Crosshair,
  Trash2,
  Eye,
  EyeOff,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minus,
  Plus,
  Layers,
  Wand2,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  Star,
  Users,
  Copy,
  Hash,
  Sparkles,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { HexColorPicker } from 'react-colorful';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  CANVAS_PRESETS,
  clonePosterSettings,
  createWinnerSlot,
  downloadPosterBlob,
  duplicateWinnerSlot,
  ensurePosterFontsLoaded,
  getFontCssFamily,
  normalizePosterSettings,
  POSTER_FONTS,
  POSTER_HEADER_LAYER_META,
  resolvePreviewResult,
  type PosterBadgeMode,
  type PosterFontWeight,
  type PosterHeaderLayerKey,
  type PosterNumberFormat,
  type PosterRankBadgeStyle,
  type PosterResultInput,
  type PosterTemplateItem,
  type PosterTemplateSettings,
  type PosterTextAlign,
  type PosterTextLayerStyle,
  type PosterTextTransform,
  type PosterWinnerSlot,
} from '@/lib/poster-template';
import {
  ResultPosterCanvas,
  type PosterSelectionTarget,
  type ResultPosterCanvasHandle,
  type SlotPositionsUpdate,
} from '@/components/result-poster-canvas';
import { cn } from '@/lib/utils';

const IMGBB_API_KEY = 'feb010b50bb6cec41cb64ca52cf9c848';

const QUICK_SWATCHES = [
  '#ffffff',
  '#f59e0b',
  '#fbbf24',
  '#cbd5e1',
  '#fb923c',
  '#93c5fd',
  '#0f172a',
  '#cf2829',
];

export type PublishedResultPreviewDoc = PosterResultInput & {
  id: string;
  resultNumber: number;
};

interface PosterStudioEditorProps {
  template: PosterTemplateItem;
  isDefault: boolean;
  publishedResults: PublishedResultPreviewDoc[];
  festName: string;
  saving: boolean;
  initialFocus?: 'canvas' | 'layer';
  onSaveTemplate: (updated: PosterTemplateItem) => Promise<void>;
  onBack: () => void;
}

function ColorSwatchPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px]">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-8 w-full items-center gap-2 rounded-lg border border-border bg-background/80 px-2.5 text-left text-xs font-mono transition-colors hover:bg-muted/40"
          >
            <span
              className="h-4 w-4 shrink-0 rounded border border-white/25 shadow-sm"
              style={{ backgroundColor: value }}
            />
            <span className="truncate uppercase">{value}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 space-y-3 p-3" align="end">
          <HexColorPicker color={value} onChange={onChange} className="!w-full" />
          <div className="grid grid-cols-4 gap-1.5">
            {QUICK_SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => onChange(hex)}
                className="h-6 rounded border border-white/20 transition-transform hover:scale-105"
                style={{ backgroundColor: hex }}
                title={hex}
              />
            ))}
          </div>
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 font-mono text-xs uppercase"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function TextStyleInspector({
  style,
  prefixPlaceholder,
  onUpdate,
  onApplyAllFonts,
  applyLabel,
}: {
  style: PosterTextLayerStyle;
  prefixPlaceholder?: string;
  onUpdate: <K extends keyof PosterTextLayerStyle>(field: K, value: PosterTextLayerStyle[K]) => void;
  onApplyAllFonts?: () => void;
  applyLabel?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/25 px-3 py-2">
        <span className="text-xs font-medium">Visible on Poster</span>
        <Switch
          checked={style.isVisible}
          onCheckedChange={(checked) => onUpdate('isVisible', checked)}
        />
      </div>

      {!style.isVisible ? (
        <div className="rounded-xl border border-dashed border-border/60 py-8 text-center text-xs text-muted-foreground">
          Hidden. Toggle <strong>Visible</strong> above or click the eye icon in Layers to show it.
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Typography
              </Label>
              {onApplyAllFonts && (
                <button
                  type="button"
                  onClick={onApplyAllFonts}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                >
                  <Wand2 className="h-3 w-3" />
                  {applyLabel || 'Apply to All'}
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px]">Font Family</Label>
              <Select value={style.fontFamily} onValueChange={(v) => onUpdate('fontFamily', v)}>
                <SelectTrigger className="h-8 rounded-lg text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSTER_FONTS.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      <span style={{ fontFamily: f.cssFamily }}>{f.label}</span>
                      <span className="ml-2 text-[10px] text-muted-foreground">({f.group})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px]">Font Size</Label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onUpdate('fontSize', Math.max(12, style.fontSize - 2))}
                    className="rounded border border-border p-0.5 hover:bg-muted"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-11 text-center font-mono text-[11px]">{style.fontSize}px</span>
                  <button
                    type="button"
                    onClick={() => onUpdate('fontSize', Math.min(130, style.fontSize + 2))}
                    className="rounded border border-border p-0.5 hover:bg-muted"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <Slider
                value={[style.fontSize]}
                min={14}
                max={120}
                step={1}
                onValueChange={([val]) => onUpdate('fontSize', val)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Weight</Label>
                <Select
                  value={style.fontWeight}
                  onValueChange={(v) => onUpdate('fontWeight', v as PosterFontWeight)}
                >
                  <SelectTrigger className="h-8 rounded-lg text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="400">Regular</SelectItem>
                    <SelectItem value="500">Medium</SelectItem>
                    <SelectItem value="600">Semi Bold</SelectItem>
                    <SelectItem value="700">Bold</SelectItem>
                    <SelectItem value="800">Extra Bold</SelectItem>
                    <SelectItem value="900">Black</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Case</Label>
                <Select
                  value={style.textTransform}
                  onValueChange={(v) => onUpdate('textTransform', v as PosterTextTransform)}
                >
                  <SelectTrigger className="h-8 rounded-lg text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Normal</SelectItem>
                    <SelectItem value="uppercase">UPPERCASE</SelectItem>
                    <SelectItem value="capitalize">Title Case</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 items-end">
              <div className="space-y-1">
                <Label className="text-[11px]">Align</Label>
                <div className="grid grid-cols-3 gap-1">
                  {(['left', 'center', 'right'] as PosterTextAlign[]).map((align) => (
                    <Button
                      key={align}
                      type="button"
                      size="sm"
                      variant={style.textAlign === align ? 'default' : 'outline'}
                      className="h-8 px-0"
                      onClick={() => onUpdate('textAlign', align)}
                    >
                      {align === 'left' && <AlignLeft className="h-3.5 w-3.5" />}
                      {align === 'center' && <AlignCenter className="h-3.5 w-3.5" />}
                      {align === 'right' && <AlignRight className="h-3.5 w-3.5" />}
                    </Button>
                  ))}
                </div>
              </div>

              <ColorSwatchPicker
                label="Text Color"
                value={style.color}
                onChange={(hex) => onUpdate('color', hex)}
              />
            </div>
          </div>

          <div className="space-y-3 border-t border-border/60 pt-4">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Position &amp; Box
            </Label>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span>X %</span>
                  <span className="font-mono text-muted-foreground">{style.x}%</span>
                </div>
                <Slider
                  value={[style.x]}
                  min={0}
                  max={100}
                  step={0.5}
                  onValueChange={([val]) => onUpdate('x', val)}
                />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span>Y %</span>
                  <span className="font-mono text-muted-foreground">{style.y}%</span>
                </div>
                <Slider
                  value={[style.y]}
                  min={0}
                  max={100}
                  step={0.5}
                  onValueChange={([val]) => onUpdate('y', val)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="flex items-center gap-1">
                  <ArrowLeftRight className="h-3 w-3" /> Max Text Width
                </span>
                <span className="font-mono text-muted-foreground">{style.maxWidth}%</span>
              </div>
              <Slider
                value={[style.maxWidth]}
                min={15}
                max={100}
                step={1}
                onValueChange={([val]) => onUpdate('maxWidth', val)}
              />
            </div>
          </div>

          <div className="space-y-3 border-t border-border/60 pt-4">
            <div className="space-y-1">
              <Label className="text-[11px]">Optional Text Prefix</Label>
              <Input
                value={style.prefix}
                onChange={(e) => onUpdate('prefix', e.target.value)}
                placeholder={prefixPlaceholder || 'Optional label before text...'}
                className="h-8 rounded-lg text-xs"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span>Letter Spacing</span>
                <span className="font-mono text-muted-foreground">{style.letterSpacing}px</span>
              </div>
              <Slider
                value={[style.letterSpacing]}
                min={-2}
                max={14}
                step={0.5}
                onValueChange={([val]) => onUpdate('letterSpacing', val)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/25 px-3 py-2">
              <span className="text-xs font-medium">Drop Shadow</span>
              <Switch
                checked={style.textShadow}
                onCheckedChange={(checked) => onUpdate('textShadow', checked)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Full-focus 3-pane Photo Editor Studio supporting Ordered Winner Slots,
 * Drag-by-Group or Individual Part, and 4 Rank Prefix Styles.
 */
export function PosterStudioEditor({
  template,
  isDefault,
  publishedResults,
  festName,
  saving,
  initialFocus = 'layer',
  onSaveTemplate,
  onBack,
}: PosterStudioEditorProps) {
  const [draft, setDraft] = useState<PosterTemplateItem>(() => ({
    ...template,
    settings: clonePosterSettings(template.settings),
  }));
  const [uploading, setUploading] = useState(false);
  const [testingDownload, setTestingDownload] = useState(false);
  const [selection, setSelection] = useState<PosterSelectionTarget>(() =>
    initialFocus === 'canvas'
      ? { kind: 'canvas' }
      : { kind: 'slot-group', slotId: template.settings.winnerSlots[0]?.id || 'slot-1' }
  );
  const [showGuides, setShowGuides] = useState(true);
  const [previewResultId, setPreviewResultId] = useState<string>('sample-ties');
  const [imageNaturalSize, setImageNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [leaveAlertOpen, setLeaveAlertOpen] = useState(false);

  const [zoomMode, setZoomMode] = useState<'fit' | 'manual'>('fit');
  const [manualZoom, setManualZoom] = useState(0.5);
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 680, h: 580 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const posterRef = useRef<ResultPosterCanvasHandle>(null);

  useEffect(() => {
    ensurePosterFontsLoaded();
  }, []);

  useEffect(() => {
    setDraft({
      ...template,
      settings: clonePosterSettings(template.settings),
    });
  }, [template]);

  const settings = draft.settings;

  const setSettings = useCallback(
    (
      updater:
        | PosterTemplateSettings
        | ((prev: PosterTemplateSettings) => PosterTemplateSettings)
    ) => {
      setDraft((prev) => ({
        ...prev,
        settings: typeof updater === 'function' ? updater(prev.settings) : updater,
      }));
    },
    []
  );

  // Measure center canvas viewport cleanly so tall IG portraits fit without clipping
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const measure = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        setStageSize({ w: el.clientWidth, h: el.clientHeight });
      }
    };
    measure();

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        setStageSize({
          w: entry.contentRect.width,
          h: entry.contentRect.height,
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!settings.backgroundImageUrl) {
      setImageNaturalSize(null);
      return;
    }
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) {
        setImageNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      }
    };
    img.onerror = () => setImageNaturalSize(null);
    img.src = settings.backgroundImageUrl;
  }, [settings.backgroundImageUrl]);

  const activePreviewResult = useMemo(
    () => resolvePreviewResult(previewResultId, publishedResults),
    [previewResultId, publishedResults]
  );

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(template),
    [draft, template]
  );

  const activePreset = useMemo(
    () =>
      CANVAS_PRESETS.find(
        (p) => p.width === settings.canvasWidth && p.height === settings.canvasHeight
      ) || null,
    [settings.canvasHeight, settings.canvasWidth]
  );

  const fitScale = useMemo(() => {
    const availW = Math.max(240, stageSize.w - 48);
    const availH = Math.max(260, stageSize.h - 48);
    const scale = Math.min(availW / settings.canvasWidth, availH / settings.canvasHeight, 1);
    return Math.max(0.18, scale);
  }, [settings.canvasHeight, settings.canvasWidth, stageSize.h, stageSize.w]);

  const effectiveScale = zoomMode === 'fit' ? fitScale : manualZoom;
  const renderedCanvasWidth = Math.max(220, Math.round(settings.canvasWidth * effectiveScale));

  const updateHeaderLayer = useCallback(
    <K extends keyof PosterTextLayerStyle>(
      key: PosterHeaderLayerKey,
      field: K,
      value: PosterTextLayerStyle[K]
    ) => {
      setSettings((prev) => ({
        ...prev,
        layers: {
          ...prev.layers,
          [key]: { ...prev.layers[key], [field]: value },
        },
      }));
    },
    [setSettings]
  );

  const updateSlot = useCallback(
    (slotId: string, updater: (slot: PosterWinnerSlot) => PosterWinnerSlot) => {
      setSettings((prev) => ({
        ...prev,
        winnerSlots: prev.winnerSlots.map((s) => (s.id === slotId ? updater(s) : s)),
      }));
    },
    [setSettings]
  );

  const handleMoveHeaderLayer = useCallback(
    (key: PosterHeaderLayerKey, x: number, y: number) => {
      setSettings((prev) => ({
        ...prev,
        layers: {
          ...prev.layers,
          [key]: { ...prev.layers[key], x, y },
        },
      }));
    },
    [setSettings]
  );

  const handleMoveSlotPositions = useCallback(
    (slotId: string, next: SlotPositionsUpdate) => {
      updateSlot(slotId, (slot) => ({
        ...slot,
        badge: next.badge ? { ...slot.badge, x: next.badge.x, y: next.badge.y } : slot.badge,
        name: next.name ? { ...slot.name, x: next.name.x, y: next.name.y } : slot.name,
        team: next.team ? { ...slot.team, x: next.team.x, y: next.team.y } : slot.team,
      }));
    },
    [updateSlot]
  );

  // Keyboard arrow nudge supporting headers, slot parts, and whole slot groups
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (selection.kind === 'canvas') return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

      e.preventDefault();
      const step = e.shiftKey ? 2 : 0.5;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));

      setSettings((prev) => {
        if (selection.kind === 'header') {
          const cur = prev.layers[selection.key];
          if (!cur) return prev;
          return {
            ...prev,
            layers: {
              ...prev.layers,
              [selection.key]: { ...cur, x: clamp(cur.x + dx), y: clamp(cur.y + dy) },
            },
          };
        }

        if (selection.kind === 'slot-part') {
          return {
            ...prev,
            winnerSlots: prev.winnerSlots.map((slot) => {
              if (slot.id !== selection.slotId) return slot;
              const partObj = slot[selection.part];
              return {
                ...slot,
                [selection.part]: {
                  ...partObj,
                  x: clamp(partObj.x + dx),
                  y: clamp(partObj.y + dy),
                },
              };
            }),
          };
        }

        return {
          ...prev,
          winnerSlots: prev.winnerSlots.map((slot) => {
            if (slot.id !== selection.slotId) return slot;
            return {
              ...slot,
              badge: { ...slot.badge, x: clamp(slot.badge.x + dx), y: clamp(slot.badge.y + dy) },
              name: { ...slot.name, x: clamp(slot.name.x + dx), y: clamp(slot.name.y + dy) },
              team: { ...slot.team, x: clamp(slot.team.x + dx), y: clamp(slot.team.y + dy) },
            };
          }),
        };
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selection, setSettings]);

  const handleAddSlot = () => {
    const last = settings.winnerSlots[settings.winnerSlots.length - 1];
    const nextIdx = settings.winnerSlots.length;
    const newSlot = last ? duplicateWinnerSlot(last, nextIdx) : createWinnerSlot(nextIdx);
    setSettings((prev) => ({
      ...prev,
      winnerSlots: [...prev.winnerSlots, newSlot],
    }));
    setSelection({ kind: 'slot-group', slotId: newSlot.id });
    toast({
      title: `Added ${newSlot.label}`,
      description: 'Extra tied winners in rank order will automatically fill this slot.',
    });
  };

  const handleDuplicateSpecificSlot = (sourceSlot: PosterWinnerSlot) => {
    const nextIdx = settings.winnerSlots.length;
    const copy = duplicateWinnerSlot(sourceSlot, nextIdx);
    setSettings((prev) => ({
      ...prev,
      winnerSlots: [...prev.winnerSlots, copy],
    }));
    setSelection({ kind: 'slot-group', slotId: copy.id });
  };

  const handleDeleteSlot = (slotId: string) => {
    if (settings.winnerSlots.length <= 1) return;
    setSettings((prev) => ({
      ...prev,
      winnerSlots: prev.winnerSlots.filter((s) => s.id !== slotId),
    }));
    setSelection({ kind: 'canvas' });
  };

  const handleCopySlotStyleToAll = (sourceSlot: PosterWinnerSlot) => {
    setSettings((prev) => ({
      ...prev,
      winnerSlots: prev.winnerSlots.map((slot) => {
        if (slot.id === sourceSlot.id) return slot;
        return {
          ...slot,
          badge: {
            ...sourceSlot.badge,
            x: slot.badge.x,
            y: slot.badge.y,
            boxColor: slot.badge.boxColor,
            textColor: slot.badge.textColor,
            dotColor: slot.badge.dotColor,
          },
          name: {
            ...sourceSlot.name,
            x: slot.name.x,
            y: slot.name.y,
            color: slot.name.color,
          },
          team: {
            ...sourceSlot.team,
            x: slot.team.x,
            y: slot.team.y,
            color: slot.team.color,
          },
        };
      }),
    }));
    toast({
      title: 'Slot Style Synced',
      description: `Applied ${sourceSlot.label}'s fonts, sizes & badge shape across all ${settings.winnerSlots.length} slots (keeping each slot's position & color).`,
    });
  };

  const handleCopyBadgeStyleToAll = (sourceBadge: PosterRankBadgeStyle, includeColors: boolean) => {
    setSettings((prev) => ({
      ...prev,
      winnerSlots: prev.winnerSlots.map((slot) => ({
        ...slot,
        badge: {
          ...sourceBadge,
          x: slot.badge.x,
          y: slot.badge.y,
          boxColor: includeColors ? sourceBadge.boxColor : slot.badge.boxColor,
          textColor: includeColors ? sourceBadge.textColor : slot.badge.textColor,
          dotColor: includeColors ? sourceBadge.dotColor : slot.badge.dotColor,
        },
      })),
    }));
    toast({
      title: 'Prefix Style Applied',
      description: `Copied prefix model & dimensions to all ${settings.winnerSlots.length} winner slots.`,
    });
  };

  const handleCopyPartFontToAllSlots = (
    part: 'name' | 'team',
    sourceStyle: PosterTextLayerStyle
  ) => {
    setSettings((prev) => ({
      ...prev,
      winnerSlots: prev.winnerSlots.map((slot) => ({
        ...slot,
        [part]: {
          ...sourceStyle,
          x: slot[part].x,
          y: slot[part].y,
          color: slot[part].color,
        },
      })),
    }));
    toast({
      title: 'Typography Synced',
      description: `Applied ${sourceStyle.fontFamily} (${sourceStyle.fontSize}px) to all slots' ${part} fields.`,
    });
  };

  const handleApplyHeaderFontToAll = (sourceStyle: PosterTextLayerStyle) => {
    setSettings((prev) => {
      const nextLayers = { ...prev.layers };
      for (const meta of POSTER_HEADER_LAYER_META) {
        nextLayers[meta.key] = {
          ...nextLayers[meta.key],
          fontFamily: sourceStyle.fontFamily,
          textShadow: sourceStyle.textShadow,
        };
      }
      return {
        ...prev,
        layers: nextLayers,
        winnerSlots: prev.winnerSlots.map((slot) => ({
          ...slot,
          name: { ...slot.name, fontFamily: sourceStyle.fontFamily, textShadow: sourceStyle.textShadow },
          team: { ...slot.team, fontFamily: sourceStyle.fontFamily, textShadow: sourceStyle.textShadow },
        })),
      };
    });
    toast({
      title: 'Global Font Applied',
      description: `Set ${sourceStyle.fontFamily} across headers and all winner slots.`,
    });
  };

  const centerSelectionAxis = (axis: 'x' | 'y') => {
    if (selection.kind === 'canvas') return;
    if (selection.kind === 'header') {
      updateHeaderLayer(selection.key, axis, 50);
      return;
    }
    if (selection.kind === 'slot-part') {
      updateSlot(selection.slotId, (slot) => ({
        ...slot,
        [selection.part]: { ...slot[selection.part], [axis]: 50 },
      }));
      return;
    }
    if (axis === 'x') {
      const slot = settings.winnerSlots.find((s) => s.id === selection.slotId);
      if (!slot) return;
      const shiftX = 50 - (slot.badge.x + slot.name.x) / 2;
      const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));
      updateSlot(slot.id, (s) => ({
        ...s,
        badge: { ...s.badge, x: clamp(s.badge.x + shiftX) },
        name: { ...s.name, x: clamp(s.name.x + shiftX) },
        team: { ...s.team, x: clamp(s.team.x + shiftX) },
      }));
    }
  };

  const handleResetDefaults = () => {
    setSettings((prev) => ({
      ...normalizePosterSettings(null),
      backgroundImageUrl: prev.backgroundImageUrl,
    }));
    setSelection({ kind: 'slot-group', slotId: 'slot-1' });
    toast({
      title: 'Reset to 3-Slot Default Layout',
      description: 'Restored IG Portrait (1080×1440) with 3 ordered winner slots.',
    });
  };

  const handleTestDownload = async () => {
    if (!posterRef.current) return;
    setTestingDownload(true);
    try {
      const blob = await posterRef.current.exportPngBlob();
      const safeName = draft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'poster';
      downloadPosterBlob(blob, `${safeName}-${settings.canvasWidth}x${settings.canvasHeight}.png`);
      toast({
        title: 'Preview Exported',
        description: `Downloaded ${settings.canvasWidth}×${settings.canvasHeight}px PNG poster.`,
      });
    } catch (error) {
      console.error('Error exporting preview:', error);
      toast({
        title: 'Export Failed',
        description:
          'Could not export PNG. Upload background files directly via Upload so CORS allows export.',
        variant: 'destructive',
      });
    } finally {
      setTestingDownload(false);
    }
  };

  const uploadBackgroundFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid File',
        description: 'Please upload a PNG, JPG, or WebP image file.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (data.success) {
        setSettings((prev) => ({ ...prev, backgroundImageUrl: data.data.url }));
        toast({
          title: 'Background Uploaded',
          description: 'Poster template background loaded into canvas.',
        });
      } else {
        throw new Error(data.error?.message || 'Upload failed');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: 'Upload Failed',
        description: 'Could not upload background image to ImgBB.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadBackgroundFile(file);
  };

  const handleDropBackground = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await uploadBackgroundFile(file);
  };

  const handleMatchImageDimensions = () => {
    if (!imageNaturalSize) return;
    const maxDim = 1600;
    const ratio = imageNaturalSize.w / imageNaturalSize.h;
    const width =
      imageNaturalSize.w >= imageNaturalSize.h
        ? Math.min(imageNaturalSize.w, maxDim)
        : Math.round(Math.min(imageNaturalSize.h, maxDim) * ratio);
    const height = Math.round(width / ratio);
    setSettings((prev) => ({
      ...prev,
      canvasWidth: Math.max(320, width),
      canvasHeight: Math.max(320, height),
    }));
    toast({
      title: 'Canvas Matched',
      description: `Set canvas to ${width}×${height}px matching uploaded image ratio.`,
    });
  };

  const handleZoomStep = (delta: number) => {
    const base = zoomMode === 'fit' ? fitScale : manualZoom;
    const next = Math.max(0.2, Math.min(1.25, Math.round((base + delta) * 20) / 20));
    setZoomMode('manual');
    setManualZoom(next);
  };

  const handleSaveClick = async () => {
    const trimmedName = draft.name.trim() || 'Untitled Template';
    await onSaveTemplate({ ...draft, name: trimmedName });
  };

  const handleRequestBack = () => {
    if (hasUnsavedChanges) setLeaveAlertOpen(true);
    else onBack();
  };

  const activeSlot = useMemo(() => {
    if (selection.kind === 'slot-group' || selection.kind === 'slot-part') {
      return settings.winnerSlots.find((s) => s.id === selection.slotId) || null;
    }
    return null;
  }, [selection, settings.winnerSlots]);

  const activeHeaderMeta = useMemo(() => {
    if (selection.kind === 'header') {
      return POSTER_HEADER_LAYER_META.find((m) => m.key === selection.key) || null;
    }
    return null;
  }, [selection]);

  const selectionSummaryLabel = useMemo(() => {
    if (selection.kind === 'canvas') return 'Background & Canvas';
    if (selection.kind === 'header') {
      return POSTER_HEADER_LAYER_META.find((m) => m.key === selection.key)?.label || 'Header';
    }
    const slot = settings.winnerSlots.find((s) => s.id === selection.slotId);
    const slotName = slot?.label || 'Slot';
    if (selection.kind === 'slot-group') return `${slotName} (Whole Group)`;
    const partLabel =
      selection.part === 'badge'
        ? 'Rank Prefix'
        : selection.part === 'name'
        ? 'Winner Name'
        : 'Team Name';
    return `${slotName} • ${partLabel}`;
  }, [selection, settings.winnerSlots]);

  return (
    <div className="flex flex-col gap-3">
      {/* Compact Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/90 px-3.5 py-2.5 shadow-sm backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRequestBack}
            className="h-8 rounded-lg px-2.5 text-xs"
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            All Templates
          </Button>

          <div className="flex items-center gap-2">
            <h1 className="font-headline text-base font-bold tracking-tight sm:text-lg">
              {draft.name || 'Untitled Template'}
            </h1>
            {isDefault && (
              <Badge
                variant="secondary"
                className="gap-1 rounded-full bg-amber-500/15 text-[11px] text-amber-600 dark:text-amber-400"
              >
                <Star className="h-3 w-3 fill-current" />
                Default
              </Badge>
            )}
            <Badge variant="outline" className="rounded-full font-mono text-[11px]">
              {activePreset ? `${activePreset.shortLabel} • ` : ''}
              {settings.canvasWidth}×{settings.canvasHeight}
            </Badge>
            {hasUnsavedChanges && (
              <Badge
                variant="outline"
                className="rounded-full border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-600 dark:text-amber-400"
              >
                Unsaved
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={previewResultId} onValueChange={setPreviewResultId}>
            <SelectTrigger className="h-8 w-[220px] rounded-lg bg-background/80 text-xs">
              <SelectValue placeholder="Preview data" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sample">Sample: Single (1st, 2nd, 3rd)</SelectItem>
              <SelectItem value="sample-ties">Sample: Ties (1 + 2×2nd + 2×3rd)</SelectItem>
              {publishedResults.slice(0, 20).map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  #{r.resultNumber} • {r.programName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestDownload}
            disabled={testingDownload}
            className="h-8 rounded-lg px-3 text-xs"
          >
            {testingDownload ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-3.5 w-3.5" />
            )}
            Export PNG
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResetDefaults}
            className="h-8 rounded-lg px-2.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleSaveClick}
            disabled={saving}
            className="h-8 rounded-lg px-4 text-xs shadow-sm"
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </div>
      </div>

      {/* 3-Pane Studio Workspace */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[260px_minmax(0,1fr)_330px] xl:grid-cols-[276px_minmax(0,1fr)_350px]">
        {/* LEFT PANE: Layers & Ordered Winner Slot Groups */}
        <div className="flex flex-col rounded-2xl border border-border/70 bg-card/85 shadow-sm backdrop-blur-xl lg:h-[calc(100vh-148px)] lg:min-h-[580px]">
          <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Layers className="h-3.5 w-3.5 text-primary" />
              Layers &amp; Slots
            </span>
            <Badge variant="secondary" className="text-[10px]">
              {settings.winnerSlots.length} Slots
            </Badge>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-2.5">
            {/* Background & Size Row */}
            <button
              type="button"
              onClick={() => setSelection({ kind: 'canvas' })}
              className={cn(
                'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs transition-all',
                selection.kind === 'canvas'
                  ? 'border-primary bg-primary/10 text-primary shadow-sm'
                  : 'border-border/60 bg-background/50 hover:bg-muted/60'
              )}
            >
              <span className="flex items-center gap-2 font-medium">
                <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                Background &amp; Size
              </span>
              <span className="font-mono text-[10px] opacity-75">
                {settings.canvasWidth}×{settings.canvasHeight}
              </span>
            </button>

            {/* Header Fields */}
            <div className="space-y-1">
              <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Program Fields
              </div>
              {POSTER_HEADER_LAYER_META.map((meta) => {
                const layer = settings.layers[meta.key];
                const isSelected = selection.kind === 'header' && selection.key === meta.key;

                return (
                  <div
                    key={meta.key}
                    className={cn(
                      'flex items-center justify-between rounded-xl border px-2 py-1.5 transition-all',
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-sm'
                        : 'border-transparent hover:border-border/60 hover:bg-muted/50'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelection({ kind: 'header', key: meta.key })}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span
                        className={cn(
                          'h-2 w-2 shrink-0 rounded-full',
                          layer.isVisible ? 'bg-primary' : 'bg-muted-foreground/30'
                        )}
                      />
                      <span
                        className={cn(
                          'truncate text-xs font-medium',
                          !layer.isVisible && 'line-through opacity-50'
                        )}
                      >
                        {meta.label}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => updateHeaderLayer(meta.key, 'isVisible', !layer.isVisible)}
                      className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      {layer.isVisible ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5 opacity-50" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Ordered Winner Slot Groups */}
            <div className="space-y-2 border-t border-border/50 pt-2.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Rank Queue Slots
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddSlot}
                  className="h-6 rounded-lg px-2 text-[10px]"
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add Slot
                </Button>
              </div>

              <div className="space-y-2">
                {settings.winnerSlots.map((slot, idx) => {
                  const isGroupSelected =
                    selection.kind === 'slot-group' && selection.slotId === slot.id;
                  const activePart =
                    selection.kind === 'slot-part' && selection.slotId === slot.id
                      ? selection.part
                      : null;
                  const isAnySelected = isGroupSelected || activePart !== null;

                  return (
                    <div
                      key={slot.id}
                      className={cn(
                        'overflow-hidden rounded-xl border transition-all',
                        isAnySelected
                          ? 'border-primary/70 bg-primary/5 shadow-sm'
                          : 'border-border/60 bg-background/40'
                      )}
                    >
                      {/* Slot Group Header */}
                      <div
                        className={cn(
                          'flex items-center justify-between gap-1 px-2.5 py-1.5',
                          isGroupSelected ? 'bg-primary/15' : 'bg-muted/30'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setSelection({ kind: 'slot-group', slotId: slot.id })}
                          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        >
                          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary/20 text-[10px] font-bold text-primary">
                            {idx + 1}
                          </span>
                          <span className="truncate text-xs font-semibold">{slot.label}</span>
                        </button>

                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleDuplicateSpecificSlot(slot)}
                            className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                            title="Duplicate slot for extra tie"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          {settings.winnerSlots.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleDeleteSlot(slot.id)}
                              className="rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                              title="Remove slot"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 3 Independent Sub-Layers Inside Slot */}
                      <div className="space-y-0.5 p-1.5">
                        {/* Prefix Badge Row */}
                        <div
                          className={cn(
                            'flex items-center justify-between rounded-lg px-2 py-1 text-[11px] transition-colors',
                            activePart === 'badge'
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300 font-semibold'
                              : 'hover:bg-muted/60 text-muted-foreground'
                          )}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setSelection({ kind: 'slot-part', slotId: slot.id, part: 'badge' })
                            }
                            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                          >
                            <Hash className="h-3 w-3 shrink-0 text-amber-500" />
                            <span
                              className={cn(
                                'truncate',
                                !slot.badge.isVisible && 'line-through opacity-50'
                              )}
                            >
                              Rank Prefix
                            </span>
                            <span className="ml-auto rounded bg-muted px-1 py-0.5 text-[9px] uppercase text-muted-foreground">
                              {slot.badge.mode === 'boxed-number'
                                ? '[1]'
                                : slot.badge.mode === 'boxed-dots'
                                ? '[••]'
                                : slot.badge.mode === 'dots'
                                ? '••'
                                : '1,2'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateSlot(slot.id, (s) => ({
                                ...s,
                                badge: { ...s.badge, isVisible: !s.badge.isVisible },
                              }))
                            }
                            className="ml-1 rounded p-0.5 hover:text-foreground"
                          >
                            {slot.badge.isVisible ? (
                              <Eye className="h-3 w-3" />
                            ) : (
                              <EyeOff className="h-3 w-3 opacity-45" />
                            )}
                          </button>
                        </div>

                        {/* Winner Name Row */}
                        <div
                          className={cn(
                            'flex items-center justify-between rounded-lg px-2 py-1 text-[11px] transition-colors',
                            activePart === 'name'
                              ? 'bg-sky-500/15 text-sky-600 dark:text-sky-300 font-semibold'
                              : 'hover:bg-muted/60 text-foreground/85'
                          )}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setSelection({ kind: 'slot-part', slotId: slot.id, part: 'name' })
                            }
                            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                          >
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                            <span
                              className={cn(
                                'truncate',
                                !slot.name.isVisible && 'line-through opacity-50'
                              )}
                            >
                              Winner Name
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateSlot(slot.id, (s) => ({
                                ...s,
                                name: { ...s.name, isVisible: !s.name.isVisible },
                              }))
                            }
                            className="ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground"
                          >
                            {slot.name.isVisible ? (
                              <Eye className="h-3 w-3" />
                            ) : (
                              <EyeOff className="h-3 w-3 opacity-45" />
                            )}
                          </button>
                        </div>

                        {/* Team Name Row */}
                        <div
                          className={cn(
                            'flex items-center justify-between rounded-lg px-2 py-1 text-[11px] transition-colors',
                            activePart === 'team'
                              ? 'bg-purple-500/15 text-purple-600 dark:text-purple-300 font-semibold'
                              : 'hover:bg-muted/60 text-foreground/85'
                          )}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setSelection({ kind: 'slot-part', slotId: slot.id, part: 'team' })
                            }
                            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                          >
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-purple-500" />
                            <span
                              className={cn(
                                'truncate',
                                !slot.team.isVisible && 'line-through opacity-50'
                              )}
                            >
                              Team Name
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateSlot(slot.id, (s) => ({
                                ...s,
                                team: { ...s.team, isVisible: !s.team.isVisible },
                              }))
                            }
                            className="ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground"
                          >
                            {slot.team.isVisible ? (
                              <Eye className="h-3 w-3" />
                            ) : (
                              <EyeOff className="h-3 w-3 opacity-45" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
            Click a Slot header to drag the whole group; click Prefix / Name / Team to fine-tune independently.
          </div>
        </div>

        {/* CENTER PANE: Live Interactive Canvas Stage */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-zinc-950/95 shadow-xl lg:h-[calc(100vh-148px)] lg:min-h-[580px]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-zinc-900/90 px-3 py-2 text-xs text-zinc-200">
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant={zoomMode === 'fit' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setZoomMode('fit')}
                className="h-7 rounded-md px-2 text-[11px]"
              >
                <Maximize2 className="mr-1 h-3 w-3" />
                Fit
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleZoomStep(-0.08)}
                className="h-7 w-7 rounded-md p-0 text-zinc-300 hover:bg-white/10 hover:text-white"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="w-11 text-center font-mono text-[11px] text-zinc-400">
                {Math.round(effectiveScale * 100)}%
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleZoomStep(0.08)}
                className="h-7 w-7 rounded-md p-0 text-zinc-300 hover:bg-white/10 hover:text-white"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="flex items-center gap-1.5">
              {selection.kind !== 'canvas' && (
                <>
                  <Badge
                    variant="outline"
                    className="hidden border-sky-500/40 bg-sky-500/10 text-[10px] text-sky-300 sm:inline-flex"
                  >
                    {selectionSummaryLabel}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => centerSelectionAxis('x')}
                    className="h-7 rounded-md px-2 text-[11px] text-zinc-300 hover:bg-white/10 hover:text-white"
                    title="Center horizontally"
                  >
                    <AlignHorizontalJustifyCenter className="h-3.5 w-3.5" />
                  </Button>
                  {selection.kind !== 'slot-group' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => centerSelectionAxis('y')}
                      className="h-7 rounded-md px-2 text-[11px] text-zinc-300 hover:bg-white/10 hover:text-white"
                      title="Center vertically"
                    >
                      <AlignVerticalJustifyCenter className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </>
              )}

              <Button
                type="button"
                variant={showGuides ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setShowGuides((v) => !v)}
                className="h-7 rounded-md px-2 text-[11px]"
              >
                <Crosshair className="mr-1 h-3.5 w-3.5" />
                Guides
              </Button>
            </div>
          </div>

          <div
            ref={stageRef}
            onClick={() => setSelection({ kind: 'canvas' })}
            className="flex flex-1 items-center justify-center overflow-auto bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:18px_18px] p-5"
          >
            <div onClick={(e) => e.stopPropagation()} className="shrink-0">
              <ResultPosterCanvas
                ref={posterRef}
                settings={settings}
                result={activePreviewResult}
                festName={festName}
                editable
                selection={selection}
                showGuides={showGuides}
                forcedWidthPx={renderedCanvasWidth}
                onSelectTarget={setSelection}
                onMoveHeaderLayer={handleMoveHeaderLayer}
                onMoveSlotPositions={handleMoveSlotPositions}
              />
            </div>
          </div>
        </div>

        {/* RIGHT PANE: Context Inspector */}
        <div className="flex flex-col rounded-2xl border border-border/70 bg-card/85 shadow-sm backdrop-blur-xl lg:h-[calc(100vh-148px)] lg:min-h-[580px]">
          <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {selection.kind === 'canvas'
                ? 'Canvas & Background'
                : selection.kind === 'slot-group'
                ? 'Winner Slot Group'
                : selection.kind === 'slot-part' && selection.part === 'badge'
                ? 'Rank Prefix Style'
                : 'Text Properties'}
            </span>
            <Badge variant="outline" className="max-w-[175px] truncate rounded-full text-[10px]">
              {selectionSummaryLabel}
            </Badge>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-3.5">
            {/* 1. CANVAS & BACKGROUND PROPERTIES */}
            {selection.kind === 'canvas' && (
              <>
                <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Template Name</Label>
                    <Input
                      value={draft.name}
                      onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Dark Gold Portrait"
                      className="h-8 rounded-lg text-xs"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Visible on Public Results</span>
                    <Switch
                      checked={draft.isActive}
                      onCheckedChange={(checked) =>
                        setDraft((prev) => ({ ...prev, isActive: checked }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Poster Size Preset
                  </Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {CANVAS_PRESETS.map((preset) => {
                      const active =
                        settings.canvasWidth === preset.width &&
                        settings.canvasHeight === preset.height;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            setSettings((prev) => ({
                              ...prev,
                              canvasWidth: preset.width,
                              canvasHeight: preset.height,
                            }))
                          }
                          className={cn(
                            'rounded-xl border px-2.5 py-2 text-left transition-all',
                            active
                              ? 'border-primary bg-primary/10 text-primary shadow-sm'
                              : 'border-border/60 bg-background/50 hover:bg-muted/50'
                          )}
                        >
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span>{preset.shortLabel}</span>
                            <span className="text-[10px] opacity-70">{preset.aspect}</span>
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {preset.width}×{preset.height}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Width (px)</Label>
                      <Input
                        type="number"
                        min={320}
                        max={2400}
                        value={settings.canvasWidth}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            canvasWidth: Math.max(320, Number(e.target.value) || 1080),
                          }))
                        }
                        className="h-8 rounded-lg font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Height (px)</Label>
                      <Input
                        type="number"
                        min={320}
                        max={2400}
                        value={settings.canvasHeight}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            canvasHeight: Math.max(320, Number(e.target.value) || 1440),
                          }))
                        }
                        className="h-8 rounded-lg font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Background Image Dropzone */}
                <div className="space-y-2 border-t border-border/60 pt-4">
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Background Design
                  </Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />

                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingFile(true);
                    }}
                    onDragLeave={() => setIsDraggingFile(false)}
                    onDrop={handleDropBackground}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      'cursor-pointer rounded-xl border-2 border-dashed p-3.5 text-center transition-colors',
                      isDraggingFile
                        ? 'border-primary bg-primary/10'
                        : 'border-border/70 bg-muted/20 hover:border-primary/50 hover:bg-muted/40'
                    )}
                  >
                    {uploading ? (
                      <div className="flex items-center justify-center gap-2 py-2 text-xs">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        Uploading artwork...
                      </div>
                    ) : (
                      <div className="space-y-1 py-1">
                        <Upload className="mx-auto h-5 w-5 text-primary" />
                        <p className="text-xs font-medium">
                          {settings.backgroundImageUrl
                            ? 'Click or drop to replace image'
                            : 'Click or drag & drop poster artwork'}
                        </p>
                      </div>
                    )}
                  </div>

                  {settings.backgroundImageUrl && (
                    <div className="flex flex-wrap gap-1.5">
                      {imageNaturalSize && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleMatchImageDimensions}
                          className="h-7 flex-1 rounded-lg text-[11px]"
                        >
                          Match Photo ({imageNaturalSize.w}×{imageNaturalSize.h})
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSettings((prev) => ({ ...prev, backgroundImageUrl: '' }))}
                        className="h-7 rounded-lg px-2 text-[11px] text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        Clear
                      </Button>
                    </div>
                  )}

                  <Input
                    value={settings.backgroundImageUrl}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, backgroundImageUrl: e.target.value }))
                    }
                    placeholder="Or paste direct image URL..."
                    className="h-8 rounded-lg font-mono text-[11px]"
                  />

                  <div className="space-y-1 pt-2">
                    <div className="flex justify-between text-[11px]">
                      <span>Readability Overlay</span>
                      <span className="font-mono text-muted-foreground">
                        {settings.overlayOpacity}%
                      </span>
                    </div>
                    <Slider
                      value={[settings.overlayOpacity]}
                      min={0}
                      max={80}
                      step={2}
                      onValueChange={([val]) =>
                        setSettings((prev) => ({ ...prev, overlayOpacity: val }))
                      }
                    />
                  </div>

                  <ColorSwatchPicker
                    label="Fallback Backdrop Color"
                    value={settings.backgroundColor}
                    onChange={(hex) =>
                      setSettings((prev) => ({ ...prev, backgroundColor: hex }))
                    }
                  />
                </div>

                {/* Dynamic Rank Auto-Color Rule */}
                <div className="space-y-3 border-t border-border/60 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                        Auto-Color Badges by Rank
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Colors each slot badge dynamically by winner&apos;s actual 1st/2nd/3rd rank.
                      </p>
                    </div>
                    <Switch
                      checked={settings.colorBadgeByRank}
                      onCheckedChange={(checked) =>
                        setSettings((prev) => ({ ...prev, colorBadgeByRank: checked }))
                      }
                    />
                  </div>

                  {settings.colorBadgeByRank && (
                    <div className="space-y-2.5 rounded-xl border border-border/60 bg-muted/20 p-2.5">
                      {(['1', '2', '3'] as const).map((rankKey) => {
                        const theme = settings.rankBadgeColors[rankKey];
                        return (
                          <div key={rankKey} className="space-y-1.5 border-b border-border/40 pb-2 last:border-none last:pb-0">
                            <span className="text-[11px] font-semibold">
                              Rank {rankKey} Palette
                            </span>
                            <div className="grid grid-cols-3 gap-1.5">
                              <ColorSwatchPicker
                                label="Box"
                                value={theme.boxColor}
                                onChange={(hex) =>
                                  setSettings((prev) => ({
                                    ...prev,
                                    rankBadgeColors: {
                                      ...prev.rankBadgeColors,
                                      [rankKey]: { ...theme, boxColor: hex },
                                    },
                                  }))
                                }
                              />
                              <ColorSwatchPicker
                                label="Text"
                                value={theme.textColor}
                                onChange={(hex) =>
                                  setSettings((prev) => ({
                                    ...prev,
                                    rankBadgeColors: {
                                      ...prev.rankBadgeColors,
                                      [rankKey]: { ...theme, textColor: hex },
                                    },
                                  }))
                                }
                              />
                              <ColorSwatchPicker
                                label="Dots"
                                value={theme.dotColor}
                                onChange={(hex) =>
                                  setSettings((prev) => ({
                                    ...prev,
                                    rankBadgeColors: {
                                      ...prev.rankBadgeColors,
                                      [rankKey]: { ...theme, dotColor: hex },
                                    },
                                  }))
                                }
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* 2. HEADER TEXT LAYER PROPERTIES */}
            {selection.kind === 'header' && activeHeaderMeta && (
              <TextStyleInspector
                style={settings.layers[selection.key]}
                prefixPlaceholder={selection.key === 'resultNumber' ? 'RESULT #' : undefined}
                onUpdate={(field, value) => updateHeaderLayer(selection.key, field, value)}
                onApplyAllFonts={() =>
                  handleApplyHeaderFontToAll(settings.layers[selection.key])
                }
                applyLabel="Apply Font Everywhere"
              />
            )}

            {/* 3. WINNER SLOT GROUP PROPERTIES */}
            {selection.kind === 'slot-group' && activeSlot && (
              <div className="space-y-4">
                <div className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                    <Move className="h-3.5 w-3.5" />
                    Group Drag Mode Active
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Dragging anywhere on <strong>{activeSlot.label}</strong> on the canvas moves its
                    Rank Prefix, Winner Name, and Team Name together!
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[11px]">Slot Group Name</Label>
                  <Input
                    value={activeSlot.label}
                    onChange={(e) =>
                      updateSlot(activeSlot.id, (s) => ({ ...s, label: e.target.value }))
                    }
                    className="h-8 rounded-lg text-xs"
                  />
                </div>

                <div className="space-y-1.5 border-t border-border/60 pt-3">
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Edit Individual Parts
                  </Label>
                  <div className="grid grid-cols-1 gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSelection({ kind: 'slot-part', slotId: activeSlot.id, part: 'badge' })
                      }
                      className="justify-between rounded-xl text-xs"
                    >
                      <span className="flex items-center gap-2">
                        <Hash className="h-3.5 w-3.5 text-amber-500" />
                        Rank Prefix Style &amp; Box
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {activeSlot.badge.mode}
                      </Badge>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSelection({ kind: 'slot-part', slotId: activeSlot.id, part: 'name' })
                      }
                      className="justify-between rounded-xl text-xs"
                    >
                      <span className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 text-sky-500" />
                        Winner Name Typography
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {activeSlot.name.fontSize}px
                      </span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSelection({ kind: 'slot-part', slotId: activeSlot.id, part: 'team' })
                      }
                      className="justify-between rounded-xl text-xs"
                    >
                      <span className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 text-purple-500" />
                        Team Name Typography
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {activeSlot.team.fontSize}px
                      </span>
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 border-t border-border/60 pt-4">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleCopySlotStyleToAll(activeSlot)}
                    className="w-full rounded-xl text-xs"
                  >
                    <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                    Sync This Slot&apos;s Style to All Slots
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleDuplicateSpecificSlot(activeSlot)}
                    className="w-full rounded-xl text-xs"
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Duplicate Slot (For Ties)
                  </Button>
                </div>
              </div>
            )}

            {/* 4. SLOT PREFIX BADGE INSPECTOR (4 MODELS: 1,2,3 | BOXED 1,2,3 | DOTS | BOXED DOTS) */}
            {selection.kind === 'slot-part' && selection.part === 'badge' && activeSlot && (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/25 px-3 py-2">
                  <span className="text-xs font-medium">Show Rank Prefix</span>
                  <Switch
                    checked={activeSlot.badge.isVisible}
                    onCheckedChange={(checked) =>
                      updateSlot(activeSlot.id, (s) => ({
                        ...s,
                        badge: { ...s.badge, isVisible: checked },
                      }))
                    }
                  />
                </div>

                {activeSlot.badge.isVisible && (
                  <>
                    {/* 4 Selectable Prefix Style Models */}
                    <div className="space-y-2">
                      <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Prefix Style Model
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            { mode: 'number', title: '1, 2, 3', sub: 'Plain Number' },
                            { mode: 'boxed-number', title: '[ 1 ]', sub: 'Boxed Number' },
                            { mode: 'dots', title: '• • •', sub: 'Rank Dots' },
                            { mode: 'boxed-dots', title: '[•••]', sub: 'Boxed Dots' },
                          ] as { mode: PosterBadgeMode; title: string; sub: string }[]
                        ).map((opt) => {
                          const isCurrent = activeSlot.badge.mode === opt.mode;
                          return (
                            <button
                              key={opt.mode}
                              type="button"
                              onClick={() =>
                                updateSlot(activeSlot.id, (s) => ({
                                  ...s,
                                  badge: { ...s.badge, mode: opt.mode },
                                }))
                              }
                              className={cn(
                                'rounded-xl border px-3 py-2 text-left transition-all',
                                isCurrent
                                  ? 'border-primary bg-primary/10 text-primary shadow-sm'
                                  : 'border-border/60 bg-background/50 hover:bg-muted/50'
                              )}
                            >
                              <div className="text-sm font-bold tracking-wider">{opt.title}</div>
                              <div className="text-[10px] text-muted-foreground">{opt.sub}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {settings.colorBadgeByRank && (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-600 dark:text-amber-300">
                        <strong>Auto-Color by Rank</strong> is ON (Canvas Settings), so badge colors
                        adapt dynamically to 1st / 2nd / 3rd rank.
                      </div>
                    )}

                    {/* Box Controls (for Boxed Number & Boxed Dots) */}
                    {(activeSlot.badge.mode === 'boxed-number' ||
                      activeSlot.badge.mode === 'boxed-dots') && (
                      <div className="space-y-3 border-t border-border/60 pt-3">
                        <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Box Dimensions &amp; Color
                        </Label>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span>Width</span>
                              <span className="font-mono text-muted-foreground">
                                {activeSlot.badge.boxWidth}px
                              </span>
                            </div>
                            <Slider
                              value={[activeSlot.badge.boxWidth]}
                              min={24}
                              max={220}
                              step={2}
                              onValueChange={([val]) =>
                                updateSlot(activeSlot.id, (s) => ({
                                  ...s,
                                  badge: { ...s.badge, boxWidth: val },
                                }))
                              }
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span>Height</span>
                              <span className="font-mono text-muted-foreground">
                                {activeSlot.badge.boxHeight}px
                              </span>
                            </div>
                            <Slider
                              value={[activeSlot.badge.boxHeight]}
                              min={24}
                              max={220}
                              step={2}
                              onValueChange={([val]) =>
                                updateSlot(activeSlot.id, (s) => ({
                                  ...s,
                                  badge: { ...s.badge, boxHeight: val },
                                }))
                              }
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span>Corner Radius</span>
                            <span className="font-mono text-muted-foreground">
                              {activeSlot.badge.borderRadius}px
                            </span>
                          </div>
                          <Slider
                            value={[activeSlot.badge.borderRadius]}
                            min={0}
                            max={100}
                            step={2}
                            onValueChange={([val]) =>
                              updateSlot(activeSlot.id, (s) => ({
                                ...s,
                                badge: { ...s.badge, borderRadius: val },
                              }))
                            }
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <ColorSwatchPicker
                            label="Box Color"
                            value={activeSlot.badge.boxColor}
                            onChange={(hex) =>
                              updateSlot(activeSlot.id, (s) => ({
                                ...s,
                                badge: { ...s.badge, boxColor: hex },
                              }))
                            }
                          />
                          <ColorSwatchPicker
                            label="Border Color"
                            value={activeSlot.badge.borderColor}
                            onChange={(hex) =>
                              updateSlot(activeSlot.id, (s) => ({
                                ...s,
                                badge: { ...s.badge, borderColor: hex },
                              }))
                            }
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span>Border Thickness</span>
                            <span className="font-mono text-muted-foreground">
                              {activeSlot.badge.borderWidth}px
                            </span>
                          </div>
                          <Slider
                            value={[activeSlot.badge.borderWidth]}
                            min={0}
                            max={12}
                            step={1}
                            onValueChange={([val]) =>
                              updateSlot(activeSlot.id, (s) => ({
                                ...s,
                                badge: { ...s.badge, borderWidth: val },
                              }))
                            }
                          />
                        </div>
                      </div>
                    )}

                    {/* Number Format & Typography (for Number & Boxed Number) */}
                    {(activeSlot.badge.mode === 'number' ||
                      activeSlot.badge.mode === 'boxed-number') && (
                      <div className="space-y-3 border-t border-border/60 pt-3">
                        <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Number Style
                        </Label>

                        <div className="grid grid-cols-3 gap-1.5">
                          {(['1', '01', '1ST'] as PosterNumberFormat[]).map((fmt) => (
                            <Button
                              key={fmt}
                              type="button"
                              size="sm"
                              variant={
                                activeSlot.badge.numberFormat === fmt ? 'default' : 'outline'
                              }
                              onClick={() =>
                                updateSlot(activeSlot.id, (s) => ({
                                  ...s,
                                  badge: { ...s.badge, numberFormat: fmt },
                                }))
                              }
                              className="h-7 text-[11px] font-mono"
                            >
                              {fmt}
                            </Button>
                          ))}
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[11px]">Font Family</Label>
                          <Select
                            value={activeSlot.badge.fontFamily}
                            onValueChange={(v) =>
                              updateSlot(activeSlot.id, (s) => ({
                                ...s,
                                badge: { ...s.badge, fontFamily: v },
                              }))
                            }
                          >
                            <SelectTrigger className="h-8 rounded-lg text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {POSTER_FONTS.map((f) => (
                                <SelectItem key={f.id} value={f.id}>
                                  <span style={{ fontFamily: getFontCssFamily(f.id) }}>
                                    {f.label}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span>Number Size</span>
                            <span className="font-mono text-muted-foreground">
                              {activeSlot.badge.fontSize}px
                            </span>
                          </div>
                          <Slider
                            value={[activeSlot.badge.fontSize]}
                            min={12}
                            max={110}
                            step={1}
                            onValueChange={([val]) =>
                              updateSlot(activeSlot.id, (s) => ({
                                ...s,
                                badge: { ...s.badge, fontSize: val },
                              }))
                            }
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[11px]">Weight</Label>
                            <Select
                              value={activeSlot.badge.fontWeight}
                              onValueChange={(v) =>
                                updateSlot(activeSlot.id, (s) => ({
                                  ...s,
                                  badge: { ...s.badge, fontWeight: v as PosterFontWeight },
                                }))
                              }
                            >
                              <SelectTrigger className="h-8 rounded-lg text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="500">Medium</SelectItem>
                                <SelectItem value="600">Semi Bold</SelectItem>
                                <SelectItem value="700">Bold</SelectItem>
                                <SelectItem value="800">Extra Bold</SelectItem>
                                <SelectItem value="900">Black</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <ColorSwatchPicker
                            label="Number Color"
                            value={activeSlot.badge.textColor}
                            onChange={(hex) =>
                              updateSlot(activeSlot.id, (s) => ({
                                ...s,
                                badge: { ...s.badge, textColor: hex },
                              }))
                            }
                          />
                        </div>
                      </div>
                    )}

                    {/* Dots Controls (for Dots & Boxed Dots) */}
                    {(activeSlot.badge.mode === 'dots' ||
                      activeSlot.badge.mode === 'boxed-dots') && (
                      <div className="space-y-3 border-t border-border/60 pt-3">
                        <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Dots Appearance (1 / 2 / 3 Dots)
                        </Label>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span>Dot Size</span>
                              <span className="font-mono text-muted-foreground">
                                {activeSlot.badge.dotSize}px
                              </span>
                            </div>
                            <Slider
                              value={[activeSlot.badge.dotSize]}
                              min={4}
                              max={42}
                              step={1}
                              onValueChange={([val]) =>
                                updateSlot(activeSlot.id, (s) => ({
                                  ...s,
                                  badge: { ...s.badge, dotSize: val },
                                }))
                              }
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span>Dot Gap</span>
                              <span className="font-mono text-muted-foreground">
                                {activeSlot.badge.dotGap}px
                              </span>
                            </div>
                            <Slider
                              value={[activeSlot.badge.dotGap]}
                              min={1}
                              max={32}
                              step={1}
                              onValueChange={([val]) =>
                                updateSlot(activeSlot.id, (s) => ({
                                  ...s,
                                  badge: { ...s.badge, dotGap: val },
                                }))
                              }
                            />
                          </div>
                        </div>

                        <ColorSwatchPicker
                          label="Dot Color"
                          value={activeSlot.badge.dotColor}
                          onChange={(hex) =>
                            updateSlot(activeSlot.id, (s) => ({
                              ...s,
                              badge: { ...s.badge, dotColor: hex },
                            }))
                          }
                        />
                      </div>
                    )}

                    {/* Badge Position & Shadow */}
                    <div className="space-y-3 border-t border-border/60 pt-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span>X %</span>
                            <span className="font-mono text-muted-foreground">
                              {activeSlot.badge.x}%
                            </span>
                          </div>
                          <Slider
                            value={[activeSlot.badge.x]}
                            min={0}
                            max={100}
                            step={0.5}
                            onValueChange={([val]) =>
                              updateSlot(activeSlot.id, (s) => ({
                                ...s,
                                badge: { ...s.badge, x: val },
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span>Y %</span>
                            <span className="font-mono text-muted-foreground">
                              {activeSlot.badge.y}%
                            </span>
                          </div>
                          <Slider
                            value={[activeSlot.badge.y]}
                            min={0}
                            max={100}
                            step={0.5}
                            onValueChange={([val]) =>
                              updateSlot(activeSlot.id, (s) => ({
                                ...s,
                                badge: { ...s.badge, y: val },
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/25 px-3 py-2">
                        <span className="text-xs font-medium">Shadow</span>
                        <Switch
                          checked={activeSlot.badge.boxShadow}
                          onCheckedChange={(checked) =>
                            updateSlot(activeSlot.id, (s) => ({
                              ...s,
                              badge: { ...s.badge, boxShadow: checked },
                            }))
                          }
                        />
                      </div>

                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleCopyBadgeStyleToAll(activeSlot.badge, false)}
                        className="w-full rounded-xl text-xs"
                      >
                        <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                        Apply Prefix Model &amp; Size to All Slots
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 5. SLOT NAME OR TEAM INSPECTOR */}
            {selection.kind === 'slot-part' &&
              (selection.part === 'name' || selection.part === 'team') &&
              activeSlot && (
                <TextStyleInspector
                  style={activeSlot[selection.part]}
                  prefixPlaceholder={selection.part === 'team' ? 'Team: ' : undefined}
                  onUpdate={(field, value) =>
                    updateSlot(activeSlot.id, (s) => ({
                      ...s,
                      [selection.part]: { ...s[selection.part], [field]: value },
                    }))
                  }
                  onApplyAllFonts={() => {
                    const textPart = selection.part as 'name' | 'team';
                    handleCopyPartFontToAllSlots(textPart, activeSlot[textPart]);
                  }}
                  applyLabel={`Sync All Slots' ${selection.part === 'name' ? 'Names' : 'Teams'}`}
                />
              )}
          </div>
        </div>
      </div>

      {/* Prompt if exiting editor with unsaved changes */}
      <AlertDialog open={leaveAlertOpen} onOpenChange={setLeaveAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save changes to &quot;{draft.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved template edits. Save them now or discard and return to the
              Templates Library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setLeaveAlertOpen(false);
                onBack();
              }}
            >
              Discard Changes
            </Button>
            <AlertDialogAction
              onClick={async () => {
                await handleSaveClick();
                setLeaveAlertOpen(false);
                onBack();
              }}
            >
              Save &amp; Back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
