'use client';

import html2canvas from 'html2canvas';

export type PosterHeaderLayerKey = 'programName' | 'categoryName' | 'resultNumber';

export type PosterFontWeight = '400' | '500' | '600' | '700' | '800' | '900';
export type PosterTextTransform = 'none' | 'uppercase' | 'capitalize';
export type PosterTextAlign = 'left' | 'center' | 'right';
export type PosterBadgeMode = 'none' | 'number' | 'boxed-number' | 'dots' | 'boxed-dots';
export type PosterNumberFormat = '1' | '01' | '1ST';

export interface PosterTextLayerStyle {
  x: number;
  y: number;
  maxWidth: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: PosterFontWeight;
  textTransform: PosterTextTransform;
  textAlign: PosterTextAlign;
  color: string;
  letterSpacing: number;
  lineHeight: number;
  textShadow: boolean;
  prefix: string;
  isVisible: boolean;
}

export interface PosterRankBadgeStyle {
  isVisible: boolean;
  mode: PosterBadgeMode;
  numberFormat: PosterNumberFormat;
  x: number;
  y: number;
  boxWidth: number;
  boxHeight: number;
  boxColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  textColor: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: PosterFontWeight;
  dotSize: number;
  dotGap: number;
  dotColor: string;
  boxShadow: boolean;
}

export interface PosterWinnerSlot {
  id: string;
  label: string;
  badge: PosterRankBadgeStyle;
  name: PosterTextLayerStyle;
  team: PosterTextLayerStyle;
}

export interface PosterRankColorTheme {
  boxColor: string;
  textColor: string;
  dotColor: string;
}

export interface PosterTemplateSettings {
  canvasWidth: number;
  canvasHeight: number;
  backgroundImageUrl: string;
  backgroundColor: string;
  overlayOpacity: number;
  colorBadgeByRank: boolean;
  rankBadgeColors: Record<'1' | '2' | '3', PosterRankColorTheme>;
  layers: Record<PosterHeaderLayerKey, PosterTextLayerStyle>;
  winnerSlots: PosterWinnerSlot[];
}

export interface PosterTemplateItem {
  id: string;
  name: string;
  isActive: boolean;
  settings: PosterTemplateSettings;
}

export interface PosterTemplateCatalog {
  defaultTemplateId: string;
  templates: PosterTemplateItem[];
}

export interface PosterResultInput {
  resultNumber?: number;
  programName: string;
  categoryName: string;
  winners: Record<string, { name: string; teamName: string }[]>;
}

export interface OrderedWinnerEntry {
  rank: 1 | 2 | 3;
  name: string;
  teamName: string;
}

export const SAMPLE_SINGLE_RESULT: PosterResultInput = {
  resultNumber: 12,
  programName: 'Classical Dance Solo',
  categoryName: 'Senior Category',
  winners: {
    '1': [{ name: 'Ameen Khalid', teamName: 'Team Falcon' }],
    '2': [{ name: 'Fathima Hana', teamName: 'Team Phoenix' }],
    '3': [{ name: 'Riyan Naseer', teamName: 'Team Orion' }],
  },
};

export const SAMPLE_TIED_RESULT: PosterResultInput = {
  resultNumber: 15,
  programName: 'Arabic Poem Recitation',
  categoryName: 'Junior Category',
  winners: {
    '1': [{ name: 'Ameen Khalid', teamName: 'Team Falcon' }],
    '2': [
      { name: 'Fathima Hana', teamName: 'Team Orion' },
      { name: 'Muhammed Zayd', teamName: 'Team Aurora' },
    ],
    '3': [
      { name: 'Riyan Naseer', teamName: 'Team Phoenix' },
      { name: 'Sinan Rashid', teamName: 'Team Falcon' },
    ],
  },
};

export function resolvePreviewResult(
  previewKey: string,
  publishedResults: (PosterResultInput & { id: string })[]
): PosterResultInput {
  if (previewKey === 'sample-ties') return SAMPLE_TIED_RESULT;
  if (previewKey === 'sample') return SAMPLE_SINGLE_RESULT;
  return publishedResults.find((r) => r.id === previewKey) || SAMPLE_SINGLE_RESULT;
}

export const POSTER_FONTS: {
  id: string;
  label: string;
  cssFamily: string;
  group: 'Display' | 'Sans' | 'Malayalam';
}[] = [
  { id: 'Poppins', label: 'Poppins', cssFamily: "'Poppins', sans-serif", group: 'Sans' },
  { id: 'Montserrat', label: 'Montserrat', cssFamily: "'Montserrat', sans-serif", group: 'Sans' },
  { id: 'Inter', label: 'Inter', cssFamily: "'Inter', sans-serif", group: 'Sans' },
  {
    id: 'Plus Jakarta Sans',
    label: 'Plus Jakarta Sans',
    cssFamily: "'Plus Jakarta Sans', sans-serif",
    group: 'Sans',
  },
  { id: 'Outfit', label: 'Outfit', cssFamily: "'Outfit', sans-serif", group: 'Sans' },
  { id: 'Bebas Neue', label: 'Bebas Neue', cssFamily: "'Bebas Neue', sans-serif", group: 'Display' },
  { id: 'Oswald', label: 'Oswald', cssFamily: "'Oswald', sans-serif", group: 'Display' },
  {
    id: 'Playfair Display',
    label: 'Playfair Display',
    cssFamily: "'Playfair Display', serif",
    group: 'Display',
  },
  { id: 'Cinzel', label: 'Cinzel', cssFamily: "'Cinzel', serif", group: 'Display' },
  {
    id: 'Noto Sans Malayalam',
    label: 'Noto Sans Malayalam',
    cssFamily: "'Noto Sans Malayalam', sans-serif",
    group: 'Malayalam',
  },
  {
    id: 'Anek Malayalam',
    label: 'Anek Malayalam',
    cssFamily: "'Anek Malayalam', sans-serif",
    group: 'Malayalam',
  },
  { id: 'Manjari', label: 'Manjari', cssFamily: "'Manjari', sans-serif", group: 'Malayalam' },
  { id: 'Gayathri', label: 'Gayathri', cssFamily: "'Gayathri', sans-serif", group: 'Malayalam' },
];

export const CANVAS_PRESETS = [
  {
    id: 'ig-1080-1440',
    label: 'IG Portrait (1080×1440)',
    shortLabel: 'IG Portrait',
    aspect: '3:4',
    width: 1080,
    height: 1440,
  },
  {
    id: 'ig-1080-1350',
    label: 'IG Feed 4:5 (1080×1350)',
    shortLabel: 'IG 4:5',
    aspect: '4:5',
    width: 1080,
    height: 1350,
  },
  {
    id: 'ig-1080-1080',
    label: 'Square 1:1 (1080×1080)',
    shortLabel: 'Square',
    aspect: '1:1',
    width: 1080,
    height: 1080,
  },
  {
    id: 'story-9-16',
    label: 'Story / Status (1080×1920)',
    shortLabel: 'Story',
    aspect: '9:16',
    width: 1080,
    height: 1920,
  },
  {
    id: 'landscape-1440-1080',
    label: 'Landscape 4:3 (1440×1080)',
    shortLabel: 'Landscape',
    aspect: '4:3',
    width: 1440,
    height: 1080,
  },
] as const;

export const POSTER_HEADER_LAYER_META: {
  key: PosterHeaderLayerKey;
  label: string;
  shortLabel: string;
  badgeColor: string;
}[] = [
  {
    key: 'resultNumber',
    label: 'Result Number',
    shortLabel: 'Result #',
    badgeColor: 'bg-indigo-500/15 text-indigo-500 border-indigo-500/30',
  },
  {
    key: 'programName',
    label: 'Program Name',
    shortLabel: 'Program',
    badgeColor: 'bg-sky-500/15 text-sky-500 border-sky-500/30',
  },
  {
    key: 'categoryName',
    label: 'Category Name',
    shortLabel: 'Category',
    badgeColor: 'bg-purple-500/15 text-purple-500 border-purple-500/30',
  },
];

const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Anek+Malayalam:wght@400;600;700;800&family=Bebas+Neue&family=Cinzel:wght@600;700;800&family=Gayathri:wght@400;700&family=Manjari:wght@400;700&family=Montserrat:wght@400;500;600;700;800;900&family=Noto+Sans+Malayalam:wght@400;600;700;800&family=Oswald:wght@500;600;700&family=Outfit:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Poppins:wght@400;500;600;700;800;900&display=swap';

export function ensurePosterFontsLoaded(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('poster-google-fonts')) return;
  const link = document.createElement('link');
  link.id = 'poster-google-fonts';
  link.rel = 'stylesheet';
  link.href = GOOGLE_FONTS_HREF;
  document.head.appendChild(link);
}

export function getFontCssFamily(fontId: string): string {
  return POSTER_FONTS.find((f) => f.id === fontId)?.cssFamily || `'${fontId}', sans-serif`;
}

export const BASE_TEXT_LAYER_STYLE: PosterTextLayerStyle = {
  x: 50,
  y: 50,
  maxWidth: 82,
  fontFamily: 'Poppins',
  fontSize: 42,
  fontWeight: '700',
  textTransform: 'none',
  textAlign: 'center',
  color: '#ffffff',
  letterSpacing: 0,
  lineHeight: 1.2,
  textShadow: true,
  prefix: '',
  isVisible: true,
};

const SLOT_PALETTES: { boxColor: string; teamColor: string }[] = [
  { boxColor: '#f59e0b', teamColor: '#fcd34d' },
  { boxColor: '#cbd5e1', teamColor: '#cbd5e1' },
  { boxColor: '#fb923c', teamColor: '#fdba74' },
  { boxColor: '#38bdf8', teamColor: '#7dd3fc' },
];

export const DEFAULT_RANK_BADGE_COLORS: Record<'1' | '2' | '3', PosterRankColorTheme> = {
  '1': { boxColor: '#f59e0b', textColor: '#0f172a', dotColor: '#f59e0b' },
  '2': { boxColor: '#cbd5e1', textColor: '#0f172a', dotColor: '#e2e8f0' },
  '3': { boxColor: '#fb923c', textColor: '#0f172a', dotColor: '#fb923c' },
};

export function createWinnerSlot(
  index: number,
  overrides?: Partial<PosterWinnerSlot>
): PosterWinnerSlot {
  const palette = SLOT_PALETTES[index % SLOT_PALETTES.length];
  const baseY = Math.min(89, 43 + index * 16);
  const slotNum = index + 1;

  return {
    id: overrides?.id || `slot-${slotNum}-${Math.random().toString(36).slice(2, 6)}`,
    label: overrides?.label || `Slot ${slotNum}`,
    badge: {
      isVisible: true,
      mode: 'boxed-number',
      numberFormat: '1',
      x: 18,
      y: baseY + 2.5,
      boxWidth: 74,
      boxHeight: 74,
      boxColor: palette.boxColor,
      borderColor: '#ffffff',
      borderWidth: 0,
      borderRadius: 18,
      textColor: '#0f172a',
      fontFamily: 'Montserrat',
      fontSize: 38,
      fontWeight: '800',
      dotSize: 12,
      dotGap: 7,
      dotColor: '#0f172a',
      boxShadow: true,
      ...(overrides?.badge || {}),
    },
    name: {
      ...BASE_TEXT_LAYER_STYLE,
      x: 56,
      y: baseY,
      maxWidth: 62,
      textAlign: 'left',
      fontFamily: 'Poppins',
      fontSize: 42,
      fontWeight: '800',
      color: '#ffffff',
      ...(overrides?.name || {}),
    },
    team: {
      ...BASE_TEXT_LAYER_STYLE,
      x: 56,
      y: Math.min(96, baseY + 4.8),
      maxWidth: 62,
      textAlign: 'left',
      fontFamily: 'Poppins',
      fontSize: 24,
      fontWeight: '600',
      color: palette.teamColor,
      ...(overrides?.team || {}),
    },
  };
}

export function duplicateWinnerSlot(source: PosterWinnerSlot, nextIndex: number): PosterWinnerSlot {
  const copy = structuredCloneSafe(source);
  const shiftY = 13;
  copy.id = `slot-${nextIndex + 1}-${Math.random().toString(36).slice(2, 6)}`;
  copy.label = `Slot ${nextIndex + 1}`;
  copy.badge.y = Math.min(94, Number((source.badge.y + shiftY).toFixed(1)));
  copy.name.y = Math.min(94, Number((source.name.y + shiftY).toFixed(1)));
  copy.team.y = Math.min(96, Number((source.team.y + shiftY).toFixed(1)));
  return copy;
}

export const DEFAULT_POSTER_SETTINGS: PosterTemplateSettings = {
  canvasWidth: 1080,
  canvasHeight: 1440,
  backgroundImageUrl: '',
  backgroundColor: '#0f172a',
  overlayOpacity: 0,
  colorBadgeByRank: false,
  rankBadgeColors: structuredCloneSafe(DEFAULT_RANK_BADGE_COLORS),
  layers: {
    resultNumber: {
      ...BASE_TEXT_LAYER_STYLE,
      x: 50,
      y: 11,
      fontSize: 28,
      fontWeight: '700',
      letterSpacing: 3,
      textTransform: 'uppercase',
      color: '#fbbf24',
      prefix: 'RESULT #',
    },
    programName: {
      ...BASE_TEXT_LAYER_STYLE,
      x: 50,
      y: 19,
      maxWidth: 84,
      fontFamily: 'Montserrat',
      fontSize: 58,
      fontWeight: '800',
      textTransform: 'uppercase',
      color: '#ffffff',
    },
    categoryName: {
      ...BASE_TEXT_LAYER_STYLE,
      x: 50,
      y: 26,
      fontSize: 28,
      fontWeight: '600',
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: '#93c5fd',
    },
  },
  winnerSlots: [
    createWinnerSlot(0, { id: 'slot-1', label: 'Slot 1' }),
    createWinnerSlot(1, { id: 'slot-2', label: 'Slot 2' }),
    createWinnerSlot(2, { id: 'slot-3', label: 'Slot 3' }),
  ],
};

function mergeLayer(
  fallback: PosterTextLayerStyle,
  candidate?: Partial<PosterTextLayerStyle> | null
): PosterTextLayerStyle {
  if (!candidate) return { ...fallback };
  const rawWeight = String(candidate.fontWeight ?? fallback.fontWeight);
  const normalizedWeight: PosterFontWeight =
    rawWeight === 'bold'
      ? '700'
      : rawWeight === 'normal'
      ? '400'
      : ['400', '500', '600', '700', '800', '900'].includes(rawWeight)
      ? (rawWeight as PosterFontWeight)
      : fallback.fontWeight;

  return {
    ...fallback,
    ...candidate,
    fontWeight: normalizedWeight,
    x: Number.isFinite(Number(candidate.x)) ? Number(candidate.x) : fallback.x,
    y: Number.isFinite(Number(candidate.y)) ? Number(candidate.y) : fallback.y,
    maxWidth: Number.isFinite(Number(candidate.maxWidth))
      ? Number(candidate.maxWidth)
      : fallback.maxWidth,
    fontSize: Number.isFinite(Number(candidate.fontSize))
      ? Math.max(8, Number(candidate.fontSize))
      : fallback.fontSize,
    letterSpacing: Number.isFinite(Number(candidate.letterSpacing))
      ? Number(candidate.letterSpacing)
      : fallback.letterSpacing,
    lineHeight: Number.isFinite(Number(candidate.lineHeight))
      ? Number(candidate.lineHeight)
      : fallback.lineHeight,
  };
}

function mergeBadgeStyle(
  fallback: PosterRankBadgeStyle,
  candidate?: Partial<PosterRankBadgeStyle> | null
): PosterRankBadgeStyle {
  if (!candidate) return { ...fallback };
  const validModes: PosterBadgeMode[] = ['none', 'number', 'boxed-number', 'dots', 'boxed-dots'];
  const validFormats: PosterNumberFormat[] = ['1', '01', '1ST'];
  const rawWeight = String(candidate.fontWeight ?? fallback.fontWeight);
  const fontWeight: PosterFontWeight = ['400', '500', '600', '700', '800', '900'].includes(
    rawWeight
  )
    ? (rawWeight as PosterFontWeight)
    : fallback.fontWeight;

  return {
    ...fallback,
    ...candidate,
    mode: validModes.includes(candidate.mode as PosterBadgeMode)
      ? (candidate.mode as PosterBadgeMode)
      : fallback.mode,
    numberFormat: validFormats.includes(candidate.numberFormat as PosterNumberFormat)
      ? (candidate.numberFormat as PosterNumberFormat)
      : fallback.numberFormat,
    fontWeight,
    x: Number.isFinite(Number(candidate.x)) ? Number(candidate.x) : fallback.x,
    y: Number.isFinite(Number(candidate.y)) ? Number(candidate.y) : fallback.y,
    boxWidth: Number.isFinite(Number(candidate.boxWidth))
      ? Math.max(20, Number(candidate.boxWidth))
      : fallback.boxWidth,
    boxHeight: Number.isFinite(Number(candidate.boxHeight))
      ? Math.max(20, Number(candidate.boxHeight))
      : fallback.boxHeight,
    borderWidth: Number.isFinite(Number(candidate.borderWidth))
      ? Math.max(0, Number(candidate.borderWidth))
      : fallback.borderWidth,
    borderRadius: Number.isFinite(Number(candidate.borderRadius))
      ? Math.max(0, Number(candidate.borderRadius))
      : fallback.borderRadius,
    fontSize: Number.isFinite(Number(candidate.fontSize))
      ? Math.max(10, Number(candidate.fontSize))
      : fallback.fontSize,
    dotSize: Number.isFinite(Number(candidate.dotSize))
      ? Math.max(4, Number(candidate.dotSize))
      : fallback.dotSize,
    dotGap: Number.isFinite(Number(candidate.dotGap))
      ? Math.max(1, Number(candidate.dotGap))
      : fallback.dotGap,
  };
}

function stripLegacyRankPrefix(prefix?: string): string {
  if (!prefix) return '';
  if (/^\s*(1st|2nd|3rd|1|2|3)\s*[•:\-]?\s*$/i.test(prefix)) {
    return '';
  }
  return prefix;
}

function migrateLegacyWinnerSlots(raw: any): PosterWinnerSlot[] {
  const defaults = DEFAULT_POSTER_SETTINGS.winnerSlots;
  const rawLayers = (raw?.layers || {}) as Record<string, Partial<PosterTextLayerStyle> | undefined>;

  const pairs: {
    nameRaw?: Partial<PosterTextLayerStyle>;
    teamRaw?: Partial<PosterTextLayerStyle>;
  }[] = [
    { nameRaw: rawLayers.winner1Name || raw?.winner1, teamRaw: rawLayers.winner1Team },
    { nameRaw: rawLayers.winner2Name || raw?.winner2, teamRaw: rawLayers.winner2Team },
    { nameRaw: rawLayers.winner3Name || raw?.winner3, teamRaw: rawLayers.winner3Team },
  ];

  return defaults.map((defSlot, idx) => {
    const pair = pairs[idx];
    if (!pair?.nameRaw && !pair?.teamRaw) {
      return structuredCloneSafe(defSlot);
    }

    const migratedName = mergeLayer(defSlot.name, {
      ...pair.nameRaw,
      prefix: stripLegacyRankPrefix(pair.nameRaw?.prefix),
    });
    const migratedTeam = mergeLayer(defSlot.team, pair.teamRaw);
    const badgeX =
      migratedName.textAlign === 'left'
        ? Math.max(8, Number((migratedName.x - migratedName.maxWidth / 2 - 7).toFixed(1)))
        : Math.max(8, Number((migratedName.x - 28).toFixed(1)));

    return {
      id: defSlot.id,
      label: `Slot ${idx + 1}`,
      badge: {
        ...defSlot.badge,
        x: badgeX,
        y: Number(((migratedName.y + migratedTeam.y) / 2).toFixed(1)),
      },
      name: migratedName,
      team: migratedTeam,
    };
  });
}

/**
 * Safely normalizes both slot-based poster templates and legacy templates
 * (automatically converting legacy `layers.winner1..3` into 3 ordered slots).
 */
export function normalizePosterSettings(raw: any): PosterTemplateSettings {
  if (!raw || typeof raw !== 'object') {
    return structuredCloneSafe(DEFAULT_POSTER_SETTINGS);
  }

  const defaults = DEFAULT_POSTER_SETTINGS;
  const rawLayers = (raw.layers || {}) as Partial<
    Record<PosterHeaderLayerKey, Partial<PosterTextLayerStyle>>
  >;

  let winnerSlots: PosterWinnerSlot[];
  if (Array.isArray(raw.winnerSlots) && raw.winnerSlots.length > 0) {
    winnerSlots = raw.winnerSlots.map((rawSlot: any, idx: number) => {
      const baseSlot = createWinnerSlot(idx);
      const id =
        typeof rawSlot?.id === 'string' && rawSlot.id.trim() ? rawSlot.id.trim() : baseSlot.id;
      const label =
        typeof rawSlot?.label === 'string' && rawSlot.label.trim()
          ? rawSlot.label.trim()
          : `Slot ${idx + 1}`;
      return {
        id,
        label,
        badge: mergeBadgeStyle(baseSlot.badge, rawSlot?.badge),
        name: mergeLayer(baseSlot.name, rawSlot?.name),
        team: mergeLayer(baseSlot.team, rawSlot?.team),
      };
    });
  } else {
    winnerSlots = migrateLegacyWinnerSlots(raw);
  }

  const rawRankColors = raw.rankBadgeColors || {};
  const rankBadgeColors: Record<'1' | '2' | '3', PosterRankColorTheme> = {
    '1': { ...DEFAULT_RANK_BADGE_COLORS['1'], ...(rawRankColors['1'] || {}) },
    '2': { ...DEFAULT_RANK_BADGE_COLORS['2'], ...(rawRankColors['2'] || {}) },
    '3': { ...DEFAULT_RANK_BADGE_COLORS['3'], ...(rawRankColors['3'] || {}) },
  };

  return {
    canvasWidth:
      Number.isFinite(Number(raw.canvasWidth)) && Number(raw.canvasWidth) >= 320
        ? Number(raw.canvasWidth)
        : defaults.canvasWidth,
    canvasHeight:
      Number.isFinite(Number(raw.canvasHeight)) && Number(raw.canvasHeight) >= 320
        ? Number(raw.canvasHeight)
        : defaults.canvasHeight,
    backgroundImageUrl:
      typeof raw.backgroundImageUrl === 'string' ? raw.backgroundImageUrl : '',
    backgroundColor:
      typeof raw.backgroundColor === 'string' && raw.backgroundColor
        ? raw.backgroundColor
        : defaults.backgroundColor,
    overlayOpacity: Number.isFinite(Number(raw.overlayOpacity))
      ? Math.max(0, Math.min(85, Number(raw.overlayOpacity)))
      : defaults.overlayOpacity,
    colorBadgeByRank:
      typeof raw.colorBadgeByRank === 'boolean'
        ? raw.colorBadgeByRank
        : defaults.colorBadgeByRank,
    rankBadgeColors,
    layers: {
      resultNumber: mergeLayer(defaults.layers.resultNumber, rawLayers.resultNumber),
      programName: mergeLayer(defaults.layers.programName, rawLayers.programName || raw.programName),
      categoryName: mergeLayer(
        defaults.layers.categoryName,
        rawLayers.categoryName || raw.categoryName
      ),
    },
    winnerSlots,
  };
}

export function createPosterTemplateId(): string {
  return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function clonePosterSettings(settings: PosterTemplateSettings): PosterTemplateSettings {
  return structuredCloneSafe(normalizePosterSettings(settings));
}

export function normalizePosterCatalog(raw: any): PosterTemplateCatalog {
  if (raw && typeof raw === 'object' && Array.isArray(raw.templates) && raw.templates.length > 0) {
    const seenIds = new Set<string>();
    const templates: PosterTemplateItem[] = raw.templates.map((item: any, idx: number) => {
      let id = typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : `tpl-${idx + 1}`;
      if (seenIds.has(id)) {
        id = `${id}-${idx + 1}`;
      }
      seenIds.add(id);

      const name =
        typeof item?.name === 'string' && item.name.trim()
          ? item.name.trim()
          : `Template ${idx + 1}`;
      const isActive = typeof item?.isActive === 'boolean' ? item.isActive : true;
      const settings = normalizePosterSettings(item?.settings ?? item);
      return { id, name, isActive, settings };
    });

    const hasRequestedDefault =
      typeof raw.defaultTemplateId === 'string' &&
      templates.some((t) => t.id === raw.defaultTemplateId);

    return {
      defaultTemplateId: hasRequestedDefault ? raw.defaultTemplateId : templates[0].id,
      templates,
    };
  }

  const singleSettings = normalizePosterSettings(raw);
  return {
    defaultTemplateId: 'tpl-default',
    templates: [
      {
        id: 'tpl-default',
        name: 'Default Portrait',
        isActive: true,
        settings: singleSettings,
      },
    ],
  };
}

export function serializePosterCatalogForFirestore(catalog: PosterTemplateCatalog) {
  const safeCatalog = normalizePosterCatalog(catalog);
  const defaultTemplate =
    safeCatalog.templates.find((t) => t.id === safeCatalog.defaultTemplateId) ||
    safeCatalog.templates[0];

  return {
    ...defaultTemplate.settings,
    defaultTemplateId: safeCatalog.defaultTemplateId,
    templates: safeCatalog.templates,
  };
}

function structuredCloneSafe<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

const RANK_KEYS: Record<1 | 2 | 3, string[]> = {
  1: ['1', 'first', '1st', 'First'],
  2: ['2', 'second', '2nd', 'Second'],
  3: ['3', 'third', '3rd', 'Third'],
};

export function getWinnerHolders(
  result: PosterResultInput,
  rank: 1 | 2 | 3
): { name: string; teamName: string }[] {
  return getRankHolders(result.winners, RANK_KEYS[rank]);
}

function getRankHolders(
  winners: Record<string, { name: string; teamName: string }[]> | undefined,
  keys: string[]
) {
  if (!winners) return [];
  for (const key of keys) {
    const list = winners[key];
    if (Array.isArray(list) && list.length > 0) return list;
  }
  return [];
}

/**
 * Flattens all prize winners strictly in rank order (all 1st -> all 2nd -> all 3rd)
 * so ordered canvas slots automatically fill tied winners cleanly without skipping or overlapping.
 */
export function buildOrderedWinnerQueue(result: PosterResultInput): OrderedWinnerEntry[] {
  const queue: OrderedWinnerEntry[] = [];
  for (const rank of [1, 2, 3] as const) {
    for (const holder of getWinnerHolders(result, rank)) {
      if (holder?.name?.trim() || holder?.teamName?.trim()) {
        queue.push({
          rank,
          name: holder.name || '',
          teamName: holder.teamName || '',
        });
      }
    }
  }
  return queue;
}

export function formatRankNumber(rank: 1 | 2 | 3, format: PosterNumberFormat): string {
  if (format === '01') return `0${rank}`;
  if (format === '1ST') return rank === 1 ? '1ST' : rank === 2 ? '2ND' : '3RD';
  return String(rank);
}

function formatRankSummaryLine(
  label: string,
  holders: { name: string; teamName: string }[]
): string | null {
  if (holders.length === 0) return null;
  if (holders.length === 1) {
    const h = holders[0];
    return `${label}: *${h.name}*${h.teamName ? ` (${h.teamName})` : ''}`;
  }
  return `${label}: ${holders
    .map((h) => `*${h.name}*${h.teamName ? ` (${h.teamName})` : ''}`)
    .join(' & ')}`;
}

export function buildWhatsAppSummaryText(
  result: PosterResultInput,
  festName: string,
  shareUrl?: string
): string {
  const lines: string[] = [
    `*${festName}*${result.resultNumber ? ` — Result #${result.resultNumber}` : ''}`,
    `*${result.programName}* (${result.categoryName})`,
    '',
  ];
  const r1 = formatRankSummaryLine('1st', getWinnerHolders(result, 1));
  const r2 = formatRankSummaryLine('2nd', getWinnerHolders(result, 2));
  const r3 = formatRankSummaryLine('3rd', getWinnerHolders(result, 3));
  if (r1) lines.push(r1);
  if (r2) lines.push(r2);
  if (r3) lines.push(r3);
  if (shareUrl) {
    lines.push('', shareUrl);
  }
  return lines.join('\n');
}

/**
 * Renders the full-size offscreen poster DOM element to a crisp PNG Blob.
 */
export async function renderPosterElementToPngBlob(
  element: HTMLElement,
  width: number,
  height: number
): Promise<Blob> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    await (document as Document & { fonts: FontFaceSet }).fonts.ready;
  }

  const canvas = await html2canvas(element, {
    width,
    height,
    windowWidth: width,
    windowHeight: height,
    scale: 1,
    useCORS: true,
    allowTaint: false,
    backgroundColor: null,
    logging: false,
  });

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode poster PNG.'));
      },
      'image/png',
      1.0
    );
  });
}

export function downloadPosterBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
