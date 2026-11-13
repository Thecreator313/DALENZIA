'use client';

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  buildOrderedWinnerQueue,
  ensurePosterFontsLoaded,
  formatRankNumber,
  getFontCssFamily,
  POSTER_HEADER_LAYER_META,
  renderPosterElementToPngBlob,
  type PosterHeaderLayerKey,
  type PosterRankBadgeStyle,
  type PosterResultInput,
  type PosterTemplateSettings,
  type PosterTextLayerStyle,
  type PosterWinnerSlot,
} from '@/lib/poster-template';
import { cn } from '@/lib/utils';

export type PosterSelectionTarget =
  | { kind: 'canvas' }
  | { kind: 'header'; key: PosterHeaderLayerKey }
  | { kind: 'slot-group'; slotId: string }
  | { kind: 'slot-part'; slotId: string; part: 'badge' | 'name' | 'team' };

export interface ResultPosterCanvasHandle {
  exportPngBlob: () => Promise<Blob>;
}

export interface SlotPositionsUpdate {
  badge?: { x: number; y: number };
  name?: { x: number; y: number };
  team?: { x: number; y: number };
}

interface ResultPosterCanvasProps {
  settings: PosterTemplateSettings;
  result: PosterResultInput;
  festName?: string;
  editable?: boolean;
  thumbnailOnly?: boolean;
  selection?: PosterSelectionTarget;
  showGuides?: boolean;
  forcedWidthPx?: number;
  onSelectTarget?: (target: PosterSelectionTarget) => void;
  onMoveHeaderLayer?: (key: PosterHeaderLayerKey, x: number, y: number) => void;
  onMoveSlotPositions?: (slotId: string, next: SlotPositionsUpdate) => void;
  className?: string;
}

interface PosterSurfaceProps {
  settings: PosterTemplateSettings;
  result: PosterResultInput;
  festName?: string;
  editable?: boolean;
  previewScale?: number;
  selection?: PosterSelectionTarget;
  showGuides?: boolean;
  snappedX?: boolean;
  snappedY?: boolean;
  onPointerDownHeader?: (key: PosterHeaderLayerKey, e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerDownSlotGroup?: (slot: PosterWinnerSlot, e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerDownSlotPart?: (
    slot: PosterWinnerSlot,
    part: 'badge' | 'name' | 'team',
    e: React.PointerEvent<HTMLDivElement>
  ) => void;
  onPointerDownBackground?: () => void;
}

function getHeaderDisplayText(
  key: PosterHeaderLayerKey,
  result: PosterResultInput,
  style: PosterTextLayerStyle,
  editable: boolean,
  shortLabel: string
): string | null {
  let raw = '';
  if (key === 'resultNumber') {
    raw =
      result.resultNumber !== undefined && result.resultNumber !== null
        ? String(result.resultNumber)
        : '';
  } else if (key === 'programName') {
    raw = result.programName || '';
  } else {
    raw = result.categoryName || '';
  }

  if (!raw.trim()) {
    return editable ? `[${shortLabel}]` : null;
  }
  return `${style.prefix || ''}${raw}`;
}

function renderBadgeInner(
  badge: PosterRankBadgeStyle,
  rank: 1 | 2 | 3,
  settings: PosterTemplateSettings
) {
  const rankTheme = settings.colorBadgeByRank
    ? settings.rankBadgeColors[String(rank) as '1' | '2' | '3']
    : null;

  const boxColor = rankTheme ? rankTheme.boxColor : badge.boxColor;
  const textColor = rankTheme ? rankTheme.textColor : badge.textColor;
  const dotColor = rankTheme ? rankTheme.dotColor : badge.dotColor;

  const boxShadowStyle = badge.boxShadow ? '0 8px 24px rgba(0,0,0,0.45)' : 'none';
  const dropTextShadow = badge.boxShadow ? '0 4px 16px rgba(0,0,0,0.65)' : 'none';

  const renderDotsRow = () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: `${badge.dotGap}px`,
      }}
    >
      {Array.from({ length: rank }).map((_, idx) => (
        <div
          key={idx}
          style={{
            width: `${badge.dotSize}px`,
            height: `${badge.dotSize}px`,
            borderRadius: '9999px',
            backgroundColor: dotColor,
            boxShadow: badge.mode === 'dots' && badge.boxShadow ? '0 3px 10px rgba(0,0,0,0.55)' : 'none',
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );

  if (badge.mode === 'number') {
    return (
      <div
        style={{
          fontFamily: getFontCssFamily(badge.fontFamily),
          fontSize: `${badge.fontSize}px`,
          fontWeight: Number(badge.fontWeight),
          color: textColor,
          lineHeight: 1,
          textShadow: dropTextShadow,
          whiteSpace: 'nowrap',
        }}
      >
        {formatRankNumber(rank, badge.numberFormat)}
      </div>
    );
  }

  if (badge.mode === 'dots') {
    return renderDotsRow();
  }

  const isBoxedDots = badge.mode === 'boxed-dots';

  return (
    <div
      style={{
        width: `${badge.boxWidth}px`,
        height: `${badge.boxHeight}px`,
        backgroundColor: boxColor,
        borderRadius: `${badge.borderRadius}px`,
        border:
          badge.borderWidth > 0 ? `${badge.borderWidth}px solid ${badge.borderColor}` : 'none',
        boxShadow: boxShadowStyle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
      }}
    >
      {isBoxedDots ? (
        renderDotsRow()
      ) : (
        <span
          style={{
            fontFamily: getFontCssFamily(badge.fontFamily),
            fontSize: `${badge.fontSize}px`,
            fontWeight: Number(badge.fontWeight),
            color: textColor,
            lineHeight: 1,
          }}
        >
          {formatRankNumber(rank, badge.numberFormat)}
        </span>
      )}
    </div>
  );
}

function buildTextStyle(style: PosterTextLayerStyle): React.CSSProperties {
  return {
    width: `${style.maxWidth}%`,
    fontFamily: getFontCssFamily(style.fontFamily),
    fontSize: `${style.fontSize}px`,
    fontWeight: Number(style.fontWeight),
    textTransform: style.textTransform,
    textAlign: style.textAlign,
    color: style.color,
    letterSpacing: `${style.letterSpacing}px`,
    lineHeight: style.lineHeight,
    textShadow: style.textShadow
      ? '0 4px 18px rgba(0, 0, 0, 0.72), 0 1px 4px rgba(0, 0, 0, 0.55)'
      : 'none',
    wordBreak: 'break-word',
  };
}

function PosterSurface({
  settings,
  result,
  festName,
  editable = false,
  previewScale = 1,
  selection,
  showGuides = false,
  snappedX = false,
  snappedY = false,
  onPointerDownHeader,
  onPointerDownSlotGroup,
  onPointerDownSlotPart,
  onPointerDownBackground,
}: PosterSurfaceProps) {
  const {
    canvasWidth,
    canvasHeight,
    backgroundImageUrl,
    backgroundColor,
    overlayOpacity,
    layers,
    winnerSlots,
  } = settings;

  const outlineWidth = Math.max(1.5, 2 / Math.max(previewScale, 0.2));
  const labelScale = 1 / Math.max(previewScale, 0.35);
  const queue = useMemo(() => buildOrderedWinnerQueue(result), [result]);

  return (
    <div
      onPointerDown={(e) => {
        if (!editable) return;
        e.stopPropagation();
        onPointerDownBackground?.();
      }}
      style={{
        width: `${canvasWidth}px`,
        height: `${canvasHeight}px`,
        backgroundColor: backgroundColor || '#0f172a',
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Background image or sleek festival fallback backdrop */}
      {backgroundImageUrl ? (
        <img
          src={backgroundImageUrl}
          alt="Poster background"
          crossOrigin="anonymous"
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            pointerEvents: 'none',
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(circle at 20% 20%, rgba(245,158,11,0.22), transparent 50%), radial-gradient(circle at 80% 80%, rgba(99,102,241,0.28), transparent 55%), linear-gradient(135deg, ${
              backgroundColor || '#0f172a'
            } 0%, #1e1b4b 55%, #090d1a 100%)`,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: '28px',
              borderRadius: '28px',
              border: '2px solid rgba(255,255,255,0.12)',
            }}
          />
          {festName && (
            <div
              style={{
                position: 'absolute',
                bottom: '38px',
                right: '54px',
                fontSize: '20px',
                fontWeight: 700,
                letterSpacing: '3px',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.38)',
                fontFamily: "'Poppins', sans-serif",
              }}
            >
              {festName}
            </div>
          )}
        </div>
      )}

      {/* Optional readability overlay */}
      {overlayOpacity > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: `rgba(0, 0, 0, ${overlayOpacity / 100})`,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Studio alignment guides */}
      {editable && (showGuides || snappedX || snappedY) && (
        <>
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              bottom: 0,
              width: snappedX ? '2px' : '1px',
              backgroundColor: snappedX ? 'rgba(34,211,238,0.9)' : 'rgba(255,255,255,0.2)',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: 0,
              right: 0,
              height: snappedY ? '2px' : '1px',
              backgroundColor: snappedY ? 'rgba(34,211,238,0.9)' : 'rgba(255,255,255,0.2)',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          />
        </>
      )}

      {/* Global Program / Category / Result # Header Layers */}
      {POSTER_HEADER_LAYER_META.map(({ key, shortLabel }) => {
        const style = layers[key];
        if (!style || !style.isVisible) return null;
        const displayText = getHeaderDisplayText(key, result, style, editable, shortLabel);
        if (!displayText) return null;

        const isSelected = editable && selection?.kind === 'header' && selection.key === key;

        return (
          <div
            key={key}
            onPointerDown={(e) => {
              if (!editable) return;
              onPointerDownHeader?.(key, e);
            }}
            style={{
              position: 'absolute',
              left: `${style.x}%`,
              top: `${style.y}%`,
              transform: 'translate(-50%, -50%)',
              ...buildTextStyle(style),
              cursor: editable ? 'grab' : 'default',
              zIndex: isSelected ? 30 : 12,
              padding: editable ? '6px 10px' : '0',
              borderRadius: '8px',
              outline: isSelected
                ? `${outlineWidth}px dashed #38bdf8`
                : editable
                ? `${Math.max(1, outlineWidth * 0.5)}px dashed rgba(255,255,255,0.14)`
                : 'none',
              backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.14)' : 'transparent',
            }}
          >
            {isSelected && (
              <div
                style={{
                  position: 'absolute',
                  top: `${-24 * labelScale}px`,
                  left: '50%',
                  transform: `translateX(-50%) scale(${labelScale})`,
                  transformOrigin: 'bottom center',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                }}
              >
                {shortLabel}
              </div>
            )}
            {displayText}
          </div>
        );
      })}

      {/* Ordered Winner Slot Groups -> Filled sequentially in strict Rank Queue order */}
      {winnerSlots.map((slot, slotIdx) => {
        const entry = queue[slotIdx];
        if (!editable && !entry) return null;

        const isPlaceholder = editable && !entry;
        const effectiveRank: 1 | 2 | 3 = entry
          ? entry.rank
          : (Math.min(3, slotIdx + 1) as 1 | 2 | 3);

        const nameValue = entry ? entry.name : `Tie Slot #${slotIdx + 1}`;
        const teamValue = entry ? entry.teamName : 'Auto-fills on tie';

        const isSlotGroupSelected =
          editable && selection?.kind === 'slot-group' && selection.slotId === slot.id;
        const selectedPart =
          editable && selection?.kind === 'slot-part' && selection.slotId === slot.id
            ? selection.part
            : null;
        const isAnyInSlotSelected = isSlotGroupSelected || selectedPart !== null;

        // Compute group bounding box in % coordinates for the studio group frame & drag handle
        const activePoints: { x: number; y: number }[] = [];
        if (slot.badge.isVisible && slot.badge.mode !== 'none') {
          activePoints.push({ x: slot.badge.x, y: slot.badge.y });
        }
        if (slot.name.isVisible) activePoints.push({ x: slot.name.x, y: slot.name.y });
        if (slot.team.isVisible) activePoints.push({ x: slot.team.x, y: slot.team.y });

        const minY = activePoints.length > 0 ? Math.min(...activePoints.map((p) => p.y)) : 50;
        const maxY = activePoints.length > 0 ? Math.max(...activePoints.map((p) => p.y)) : 55;
        const centerX =
          activePoints.length > 0
            ? activePoints.reduce((sum, p) => sum + p.x, 0) / activePoints.length
            : 50;

        const opacityVal = isPlaceholder ? 0.45 : 1;

        return (
          <React.Fragment key={slot.id}>
            {/* Studio Group Handle Pill (always lets user drag all 3 parts together!) */}
            {editable && isAnyInSlotSelected && (
              <div
                onPointerDown={(e) => onPointerDownSlotGroup?.(slot, e)}
                style={{
                  position: 'absolute',
                  left: `${centerX}%`,
                  top: `${Math.max(2, minY - 4.5)}%`,
                  transform: `translate(-50%, -100%) scale(${labelScale})`,
                  transformOrigin: 'bottom center',
                  backgroundColor: isSlotGroupSelected ? '#0284c7' : '#0f172a',
                  border: '1px solid #38bdf8',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: '999px',
                  whiteSpace: 'nowrap',
                  cursor: 'move',
                  zIndex: 40,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                }}
              >
                {slot.label} • Drag Group
              </div>
            )}

            {/* 1. Slot Rank Prefix Badge (Plain Number, Boxed Number, Dots, or Boxed Dots) */}
            {slot.badge.isVisible && slot.badge.mode !== 'none' && (
              <div
                onPointerDown={(e) => {
                  if (!editable) return;
                  if (isSlotGroupSelected) {
                    onPointerDownSlotGroup?.(slot, e);
                  } else {
                    onPointerDownSlotPart?.(slot, 'badge', e);
                  }
                }}
                style={{
                  position: 'absolute',
                  left: `${slot.badge.x}%`,
                  top: `${slot.badge.y}%`,
                  transform: 'translate(-50%, -50%)',
                  opacity: opacityVal,
                  cursor: editable ? (isSlotGroupSelected ? 'move' : 'grab') : 'default',
                  zIndex: selectedPart === 'badge' || isSlotGroupSelected ? 32 : 16,
                  padding: editable ? '4px' : '0',
                  borderRadius: '10px',
                  outline:
                    editable && (selectedPart === 'badge' || isSlotGroupSelected)
                      ? `${outlineWidth}px dashed ${
                          selectedPart === 'badge' ? '#f59e0b' : '#38bdf8'
                        }`
                      : editable
                      ? `${Math.max(1, outlineWidth * 0.45)}px dashed rgba(255,255,255,0.12)`
                      : 'none',
                  backgroundColor:
                    editable && selectedPart === 'badge'
                      ? 'rgba(245, 158, 11, 0.14)'
                      : editable && isSlotGroupSelected
                      ? 'rgba(56, 189, 248, 0.12)'
                      : 'transparent',
                }}
              >
                {renderBadgeInner(slot.badge, effectiveRank, settings)}
              </div>
            )}

            {/* 2. Slot Winner Name */}
            {slot.name.isVisible && (nameValue.trim() || editable) && (
              <div
                onPointerDown={(e) => {
                  if (!editable) return;
                  if (isSlotGroupSelected) {
                    onPointerDownSlotGroup?.(slot, e);
                  } else {
                    onPointerDownSlotPart?.(slot, 'name', e);
                  }
                }}
                style={{
                  position: 'absolute',
                  left: `${slot.name.x}%`,
                  top: `${slot.name.y}%`,
                  transform: 'translate(-50%, -50%)',
                  ...buildTextStyle(slot.name),
                  opacity: opacityVal,
                  cursor: editable ? (isSlotGroupSelected ? 'move' : 'grab') : 'default',
                  zIndex: selectedPart === 'name' || isSlotGroupSelected ? 31 : 15,
                  padding: editable ? '4px 8px' : '0',
                  borderRadius: '8px',
                  outline:
                    editable && (selectedPart === 'name' || isSlotGroupSelected)
                      ? `${outlineWidth}px dashed ${
                          selectedPart === 'name' ? '#38bdf8' : 'rgba(56,189,248,0.85)'
                        }`
                      : editable
                      ? `${Math.max(1, outlineWidth * 0.45)}px dashed rgba(255,255,255,0.12)`
                      : 'none',
                  backgroundColor:
                    editable && (selectedPart === 'name' || isSlotGroupSelected)
                      ? 'rgba(56, 189, 248, 0.12)'
                      : 'transparent',
                }}
              >
                {slot.name.prefix || ''}
                {nameValue}
              </div>
            )}

            {/* 3. Slot Team Name */}
            {slot.team.isVisible && (teamValue.trim() || editable) && (
              <div
                onPointerDown={(e) => {
                  if (!editable) return;
                  if (isSlotGroupSelected) {
                    onPointerDownSlotGroup?.(slot, e);
                  } else {
                    onPointerDownSlotPart?.(slot, 'team', e);
                  }
                }}
                style={{
                  position: 'absolute',
                  left: `${slot.team.x}%`,
                  top: `${slot.team.y}%`,
                  transform: 'translate(-50%, -50%)',
                  ...buildTextStyle(slot.team),
                  opacity: opacityVal,
                  cursor: editable ? (isSlotGroupSelected ? 'move' : 'grab') : 'default',
                  zIndex: selectedPart === 'team' || isSlotGroupSelected ? 31 : 14,
                  padding: editable ? '4px 8px' : '0',
                  borderRadius: '8px',
                  outline:
                    editable && (selectedPart === 'team' || isSlotGroupSelected)
                      ? `${outlineWidth}px dashed ${
                          selectedPart === 'team' ? '#a855f7' : 'rgba(56,189,248,0.85)'
                        }`
                      : editable
                      ? `${Math.max(1, outlineWidth * 0.45)}px dashed rgba(255,255,255,0.12)`
                      : 'none',
                  backgroundColor:
                    editable && selectedPart === 'team'
                      ? 'rgba(168, 85, 247, 0.14)'
                      : editable && isSlotGroupSelected
                      ? 'rgba(56, 189, 248, 0.12)'
                      : 'transparent',
                }}
              >
                {slot.team.prefix || ''}
                {teamValue}
              </div>
            )}

            {/* Quiet indicator band around slot vertically if extra empty slot */}
            {editable && isAnyInSlotSelected && (
              <div
                style={{
                  position: 'absolute',
                  left: '4%',
                  right: '4%',
                  top: `${Math.max(1, minY - 3.5)}%`,
                  bottom: `${Math.max(1, 100 - maxY - 3.5)}%`,
                  border: `${Math.max(1, outlineWidth * 0.5)}px dotted rgba(56,189,248,0.35)`,
                  borderRadius: '14px',
                  pointerEvents: 'none',
                  zIndex: 6,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

type DragSession =
  | {
      mode: 'header';
      key: PosterHeaderLayerKey;
      startX: number;
      startY: number;
      origX: number;
      origY: number;
    }
  | {
      mode: 'slot-part';
      slotId: string;
      part: 'badge' | 'name' | 'team';
      startX: number;
      startY: number;
      origX: number;
      origY: number;
    }
  | {
      mode: 'slot-group';
      slotId: string;
      startX: number;
      startY: number;
      origBadge: { x: number; y: number };
      origName: { x: number; y: number };
      origTeam: { x: number; y: number };
    };

export const ResultPosterCanvas = forwardRef<ResultPosterCanvasHandle, ResultPosterCanvasProps>(
  function ResultPosterCanvas(
    {
      settings,
      result,
      festName,
      editable = false,
      thumbnailOnly = false,
      selection,
      showGuides = false,
      forcedWidthPx,
      onSelectTarget,
      onMoveHeaderLayer,
      onMoveSlotPositions,
      className,
    },
    ref
  ) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const exportRootRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(forcedWidthPx || 560);
    const [snapState, setSnapState] = useState<{ snappedX: boolean; snappedY: boolean }>({
      snappedX: false,
      snappedY: false,
    });
    const dragRef = useRef<DragSession | null>(null);

    useEffect(() => {
      ensurePosterFontsLoaded();
    }, []);

    useEffect(() => {
      if (forcedWidthPx) {
        setContainerWidth(forcedWidthPx);
        return;
      }
      const el = wrapperRef.current;
      if (!el) return;

      const updateSize = () => {
        const w = el.clientWidth;
        if (w > 0) setContainerWidth(w);
      };
      updateSize();

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry && entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, [forcedWidthPx]);

    const effectiveWidth = forcedWidthPx || containerWidth;
    const scale = Math.min(1, effectiveWidth / settings.canvasWidth);
    const scaledHeight = Math.round(settings.canvasHeight * scale);

    useImperativeHandle(
      ref,
      () => ({
        exportPngBlob: async () => {
          if (!exportRootRef.current) {
            throw new Error('Poster export surface is not ready.');
          }
          return await renderPosterElementToPngBlob(
            exportRootRef.current,
            settings.canvasWidth,
            settings.canvasHeight
          );
        },
      }),
      [settings.canvasWidth, settings.canvasHeight]
    );

    const attachWindowDragListeners = () => {
      const clampPct = (val: number) => Math.round(Math.max(0, Math.min(100, val)) * 10) / 10;

      const onWindowMove = (moveEvent: PointerEvent) => {
        const session = dragRef.current;
        if (!session) return;

        const renderedW = settings.canvasWidth * scale;
        const renderedH = settings.canvasHeight * scale;
        const dxPct = ((moveEvent.clientX - session.startX) / renderedW) * 100;
        const dyPct = ((moveEvent.clientY - session.startY) / renderedH) * 100;

        if (session.mode === 'header') {
          let nextX = clampPct(session.origX + dxPct);
          let nextY = clampPct(session.origY + dyPct);
          let snappedX = false;
          let snappedY = false;
          if (Math.abs(nextX - 50) <= 1.2) {
            nextX = 50;
            snappedX = true;
          }
          if (Math.abs(nextY - 50) <= 1.2) {
            nextY = 50;
            snappedY = true;
          }
          setSnapState({ snappedX, snappedY });
          onMoveHeaderLayer?.(session.key, nextX, nextY);
          return;
        }

        if (session.mode === 'slot-part') {
          let nextX = clampPct(session.origX + dxPct);
          let nextY = clampPct(session.origY + dyPct);
          let snappedX = false;
          let snappedY = false;
          if (Math.abs(nextX - 50) <= 1.2) {
            nextX = 50;
            snappedX = true;
          }
          if (Math.abs(nextY - 50) <= 1.2) {
            nextY = 50;
            snappedY = true;
          }
          setSnapState({ snappedX, snappedY });
          onMoveSlotPositions?.(session.slotId, {
            [session.part]: { x: nextX, y: nextY },
          });
          return;
        }

        // Slot group: move badge, name, and team together preserving relative offsets
        let snappedX = false;
        let snappedY = false;
        let adjustedDx = dxPct;
        const candNameX = session.origName.x + dxPct;
        if (Math.abs(candNameX - 50) <= 1.2) {
          adjustedDx = 50 - session.origName.x;
          snappedX = true;
        }

        setSnapState({ snappedX, snappedY });
        onMoveSlotPositions?.(session.slotId, {
          badge: {
            x: clampPct(session.origBadge.x + adjustedDx),
            y: clampPct(session.origBadge.y + dyPct),
          },
          name: {
            x: clampPct(session.origName.x + adjustedDx),
            y: clampPct(session.origName.y + dyPct),
          },
          team: {
            x: clampPct(session.origTeam.x + adjustedDx),
            y: clampPct(session.origTeam.y + dyPct),
          },
        });
      };

      const onWindowUp = () => {
        dragRef.current = null;
        setSnapState({ snappedX: false, snappedY: false });
        window.removeEventListener('pointermove', onWindowMove);
        window.removeEventListener('pointerup', onWindowUp);
      };

      window.addEventListener('pointermove', onWindowMove);
      window.addEventListener('pointerup', onWindowUp);
    };

    const handlePointerDownHeader = (
      key: PosterHeaderLayerKey,
      e: React.PointerEvent<HTMLDivElement>
    ) => {
      if (!editable) return;
      e.stopPropagation();
      e.preventDefault();
      onSelectTarget?.({ kind: 'header', key });
      const layer = settings.layers[key];
      dragRef.current = {
        mode: 'header',
        key,
        startX: e.clientX,
        startY: e.clientY,
        origX: layer.x,
        origY: layer.y,
      };
      attachWindowDragListeners();
    };

    const handlePointerDownSlotPart = (
      slot: PosterWinnerSlot,
      part: 'badge' | 'name' | 'team',
      e: React.PointerEvent<HTMLDivElement>
    ) => {
      if (!editable) return;
      e.stopPropagation();
      e.preventDefault();
      onSelectTarget?.({ kind: 'slot-part', slotId: slot.id, part });
      const targetStyle = slot[part];
      dragRef.current = {
        mode: 'slot-part',
        slotId: slot.id,
        part,
        startX: e.clientX,
        startY: e.clientY,
        origX: targetStyle.x,
        origY: targetStyle.y,
      };
      attachWindowDragListeners();
    };

    const handlePointerDownSlotGroup = (
      slot: PosterWinnerSlot,
      e: React.PointerEvent<HTMLDivElement>
    ) => {
      if (!editable) return;
      e.stopPropagation();
      e.preventDefault();
      onSelectTarget?.({ kind: 'slot-group', slotId: slot.id });
      dragRef.current = {
        mode: 'slot-group',
        slotId: slot.id,
        startX: e.clientX,
        startY: e.clientY,
        origBadge: { x: slot.badge.x, y: slot.badge.y },
        origName: { x: slot.name.x, y: slot.name.y },
        origTeam: { x: slot.team.x, y: slot.team.y },
      };
      attachWindowDragListeners();
    };

    return (
      <>
        <div
          ref={wrapperRef}
          className={cn(
            'relative overflow-hidden rounded-2xl shadow-2xl',
            forcedWidthPx ? '' : 'w-full',
            className
          )}
          style={{
            width: forcedWidthPx ? `${effectiveWidth}px` : undefined,
            height: `${scaledHeight}px`,
          }}
        >
          <div
            style={{
              width: `${settings.canvasWidth}px`,
              height: `${settings.canvasHeight}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <PosterSurface
              settings={settings}
              result={result}
              festName={festName}
              editable={editable}
              previewScale={scale}
              selection={selection}
              showGuides={showGuides}
              snappedX={snapState.snappedX}
              snappedY={snapState.snappedY}
              onPointerDownHeader={handlePointerDownHeader}
              onPointerDownSlotGroup={handlePointerDownSlotGroup}
              onPointerDownSlotPart={handlePointerDownSlotPart}
              onPointerDownBackground={() => onSelectTarget?.({ kind: 'canvas' })}
            />
          </div>
        </div>

        {/* Hidden full-resolution offscreen render surface for crisp HD PNG export */}
        {!thumbnailOnly && (
          <div
            ref={exportRootRef}
            aria-hidden="true"
            style={{
              position: 'fixed',
              left: '-99999px',
              top: 0,
              width: `${settings.canvasWidth}px`,
              height: `${settings.canvasHeight}px`,
              pointerEvents: 'none',
            }}
          >
            <PosterSurface settings={settings} result={result} festName={festName} />
          </div>
        )}
      </>
    );
  }
);
