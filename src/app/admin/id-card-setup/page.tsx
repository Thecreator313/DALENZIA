'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import { useAppSettings, useSharedCollection } from '@/context/firestore-cache';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Loader2,
  Download,
  Contact,
  FileText,
  QrCode,
  Printer,
  Search,
  Eye,
  RotateCw,
  Sparkles,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  Layers,
  Palette,
  Sliders,
  CheckSquare,
  Square,
  Users,
  Grid,
  Filter,
  ExternalLink,
  Info,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

import type { Program } from '@/app/admin/programs/page';
import type { Participant as BaseParticipant } from '@/app/teams/add-participants/page';
import type { Team } from '@/app/admin/teams/page';
import type { Category } from '@/app/admin/categories/page';

type Assignment = { id: string; programId: string; studentId: string; teamId: string; status?: 'cancelled' };

export type CardTheme = 'midnight' | 'crimson' | 'emerald' | 'dynamic' | 'monochrome';
export type CardOrientation = 'landscape' | 'portrait';
export type SheetLayout = 'a4-grid-8' | 'a4-grid-4' | 'single-cr80';
export type CardSides = 'front-only' | 'both-sides';

interface ParticipantWithDetails extends BaseParticipant {
  teamName: string;
  categoryName: string;
  assignedProgramIds: string[];
  assignedProgramNames: string[];
}

export default function IdCardSetupPage() {
  // Collections & App Settings
  const { data: programs, loading: progsLoading } = useSharedCollection<Program>('programs');
  const { data: participants, loading: studentsLoading } = useSharedCollection<BaseParticipant>('students');
  const { data: teams, loading: teamsLoading } = useSharedCollection<Team>('teams');
  const { data: memberCategories, loading: catsLoading } = useSharedCollection<Category>('memberCategories');
  const { data: assignments, loading: assignmentsLoading } = useSharedCollection<Assignment>('assignments');
  const { settings, loading: settingsLoading } = useAppSettings();

  const festName = settings?.festName || 'DALENZIA ARTS FEST';

  const loading =
    progsLoading ||
    studentsLoading ||
    teamsLoading ||
    catsLoading ||
    assignmentsLoading ||
    settingsLoading;

  // Studio Customization States
  const [theme, setTheme] = useState<CardTheme>('midnight');
  const [orientation, setOrientation] = useState<CardOrientation>('landscape');
  const [isFlipped, setIsFlipped] = useState(false);
  const [showQr, setShowQr] = useState(true);
  const [showHouse, setShowHouse] = useState(true);
  const [showCategory, setShowCategory] = useState(true);
  const [showProgramsOnBack, setShowProgramsOnBack] = useState(true);
  const [showSignature, setShowSignature] = useState(true);
  const [includeCropMarks, setIncludeCropMarks] = useState(true);

  // Print Sheet Config
  const [sheetLayout, setSheetLayout] = useState<SheetLayout>('a4-grid-8');
  const [cardSides, setCardSides] = useState<CardSides>('front-only');

  // Filter & Search States
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Participants for Batch Operations
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<Set<string>>(new Set());

  // Currently Previewed Participant
  const [previewParticipantId, setPreviewParticipantId] = useState<string | null>(null);
  const [previewQrDataUrl, setPreviewQrDataUrl] = useState<string>('');

  // Batch Processing Modal State
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchStatus, setBatchStatus] = useState({
    title: '',
    description: '',
    current: 0,
    total: 0,
  });
  const abortBatchRef = useRef(false);

  // Enrich Participants with House, Category, and Assigned Programs
  const enrichedParticipants: ParticipantWithDetails[] = useMemo(() => {
    if (!participants || participants.length === 0) return [];

    const teamMap = new Map(teams.map((t) => [t.id, t.name]));
    const categoryMap = new Map(memberCategories.map((c) => [c.id, c.name]));
    const programMap = new Map(programs.map((p) => [p.id, p.name]));

    // Map active assignments by studentId
    const assignmentsByStudent = new Map<string, string[]>();
    for (const a of assignments) {
      if (a.status !== 'cancelled' && a.studentId) {
        const list = assignmentsByStudent.get(a.studentId) || [];
        list.push(a.programId);
        assignmentsByStudent.set(a.studentId, list);
      }
    }

    return participants
      .map((p) => {
        const pIds = assignmentsByStudent.get(p.id) || [];
        const pNames = pIds.map((id) => programMap.get(id) || 'Unknown Event').filter(Boolean);
        return {
          ...p,
          teamName: teamMap.get(p.teamId) || p.teamName || 'Independent',
          categoryName: categoryMap.get(p.categoryId) || 'General',
          assignedProgramIds: pIds,
          assignedProgramNames: pNames,
        };
      })
      .sort((a, b) => (Number(a.chestNumber) || 0) - (Number(b.chestNumber) || 0));
  }, [participants, teams, memberCategories, programs, assignments]);

  // Filtered Participants based on search and dropdowns
  const filteredParticipants = useMemo(() => {
    return enrichedParticipants.filter((p) => {
      if (selectedTeam !== 'all' && p.teamId !== selectedTeam) return false;
      if (selectedCategory !== 'all' && p.categoryId !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesChest = p.chestNumber.toString().includes(q);
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesTeam = p.teamName.toLowerCase().includes(q);
        const matchesCategory = p.categoryName.toLowerCase().includes(q);
        return matchesChest || matchesName || matchesTeam || matchesCategory;
      }
      return true;
    });
  }, [enrichedParticipants, selectedTeam, selectedCategory, searchQuery]);

  // Active Preview Participant
  const previewParticipant = useMemo(() => {
    if (previewParticipantId) {
      const found = enrichedParticipants.find((p) => p.id === previewParticipantId);
      if (found) return found;
    }
    if (filteredParticipants.length > 0) return filteredParticipants[0];
    if (enrichedParticipants.length > 0) return enrichedParticipants[0];
    return null;
  }, [previewParticipantId, filteredParticipants, enrichedParticipants]);

  // Auto-set preview participant if unset
  useEffect(() => {
    if (!previewParticipantId && enrichedParticipants.length > 0) {
      setPreviewParticipantId(enrichedParticipants[0].id);
    }
  }, [enrichedParticipants, previewParticipantId]);

  // Generate live QR code for the active preview card
  useEffect(() => {
    if (!previewParticipant) return;
    let isCancelled = false;
    const qrPayload = previewParticipant.chestNumber.toString();
    QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 300,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    })
      .then((dataUrl) => {
        if (!isCancelled) setPreviewQrDataUrl(dataUrl);
      })
      .catch((err) => console.error('Error generating preview QR:', err));

    return () => {
      isCancelled = true;
    };
  }, [previewParticipant]);

  // Team Index Map for House Dynamic colors
  const teamIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    teams.forEach((t, i) => map.set(t.id, i));
    return map;
  }, [teams]);

  // Dynamic House Colors Palette Helper
  const getHouseTheme = useCallback(
    (teamName: string, teamId: string) => {
      const idx = teamIndexMap.get(teamId) ?? 0;
      const lower = (teamName || '').toLowerCase();
      if (lower.includes('blue') || lower.includes('sapphire') || lower.includes('ocean')) {
        return {
          name: 'Blue',
          bg: [13, 37, 85] as [number, number, number],
          headerBg: [9, 26, 60] as [number, number, number],
          accent: [59, 130, 246] as [number, number, number],
          cssGradient: 'from-blue-950 via-indigo-900 to-slate-900',
          accentBorder: 'border-blue-400',
          badgeBg: 'bg-blue-600',
          textHex: '#60a5fa',
        };
      }
      if (lower.includes('green') || lower.includes('emerald') || lower.includes('forest')) {
        return {
          name: 'Green',
          bg: [6, 78, 59] as [number, number, number],
          headerBg: [4, 50, 38] as [number, number, number],
          accent: [52, 211, 153] as [number, number, number],
          cssGradient: 'from-emerald-950 via-teal-900 to-slate-900',
          accentBorder: 'border-emerald-400',
          badgeBg: 'bg-emerald-600',
          textHex: '#34d399',
        };
      }
      if (lower.includes('red') || lower.includes('ruby') || lower.includes('crimson')) {
        return {
          name: 'Red',
          bg: [127, 29, 29] as [number, number, number],
          headerBg: [85, 18, 18] as [number, number, number],
          accent: [248, 113, 113] as [number, number, number],
          cssGradient: 'from-red-950 via-rose-950 to-neutral-900',
          accentBorder: 'border-rose-400',
          badgeBg: 'bg-rose-600',
          textHex: '#f87171',
        };
      }
      if (lower.includes('yellow') || lower.includes('gold') || lower.includes('topaz') || lower.includes('amber')) {
        return {
          name: 'Gold',
          bg: [120, 53, 15] as [number, number, number],
          headerBg: [80, 35, 10] as [number, number, number],
          accent: [251, 191, 36] as [number, number, number],
          cssGradient: 'from-amber-950 via-yellow-950 to-neutral-900',
          accentBorder: 'border-amber-400',
          badgeBg: 'bg-amber-600',
          textHex: '#fbbf24',
        };
      }
      if (lower.includes('purple') || lower.includes('violet') || lower.includes('amethyst')) {
        return {
          name: 'Purple',
          bg: [76, 29, 149] as [number, number, number],
          headerBg: [50, 19, 98] as [number, number, number],
          accent: [167, 139, 250] as [number, number, number],
          cssGradient: 'from-purple-950 via-violet-950 to-slate-900',
          accentBorder: 'border-purple-400',
          badgeBg: 'bg-purple-600',
          textHex: '#a78bfa',
        };
      }

      // Fallback cyclic presets
      const palettes = [
        {
          name: 'Blue',
          bg: [13, 37, 85] as [number, number, number],
          headerBg: [9, 26, 60] as [number, number, number],
          accent: [59, 130, 246] as [number, number, number],
          cssGradient: 'from-blue-950 via-indigo-900 to-slate-900',
          accentBorder: 'border-blue-400',
          badgeBg: 'bg-blue-600',
          textHex: '#60a5fa',
        },
        {
          name: 'Green',
          bg: [6, 78, 59] as [number, number, number],
          headerBg: [4, 50, 38] as [number, number, number],
          accent: [52, 211, 153] as [number, number, number],
          cssGradient: 'from-emerald-950 via-teal-900 to-slate-900',
          accentBorder: 'border-emerald-400',
          badgeBg: 'bg-emerald-600',
          textHex: '#34d399',
        },
        {
          name: 'Red',
          bg: [127, 29, 29] as [number, number, number],
          headerBg: [85, 18, 18] as [number, number, number],
          accent: [248, 113, 113] as [number, number, number],
          cssGradient: 'from-red-950 via-rose-950 to-neutral-900',
          accentBorder: 'border-rose-400',
          badgeBg: 'bg-rose-600',
          textHex: '#f87171',
        },
        {
          name: 'Gold',
          bg: [120, 53, 15] as [number, number, number],
          headerBg: [80, 35, 10] as [number, number, number],
          accent: [251, 191, 36] as [number, number, number],
          cssGradient: 'from-amber-950 via-yellow-950 to-neutral-900',
          accentBorder: 'border-amber-400',
          badgeBg: 'bg-amber-600',
          textHex: '#fbbf24',
        },
        {
          name: 'Purple',
          bg: [76, 29, 149] as [number, number, number],
          headerBg: [50, 19, 98] as [number, number, number],
          accent: [167, 139, 250] as [number, number, number],
          cssGradient: 'from-purple-950 via-violet-950 to-slate-900',
          accentBorder: 'border-purple-400',
          badgeBg: 'bg-purple-600',
          textHex: '#a78bfa',
        },
      ];
      return palettes[idx % palettes.length];
    },
    [teamIndexMap]
  );

  // Active Card Visual Theme Config
  const currentCardThemeConfig = useMemo(() => {
    if (theme === 'midnight') {
      return {
        bg: [13, 27, 76] as [number, number, number],
        headerBg: [8, 18, 52] as [number, number, number],
        accent: [245, 158, 11] as [number, number, number],
        cssGradient: 'from-[#0b132b] via-[#1c2541] to-[#0b132b]',
        accentBorder: 'border-amber-400',
        badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        textHex: '#fbbf24',
        isDark: true,
      };
    }
    if (theme === 'crimson') {
      return {
        bg: [74, 4, 23] as [number, number, number],
        headerBg: [50, 3, 15] as [number, number, number],
        accent: [251, 191, 36] as [number, number, number],
        cssGradient: 'from-rose-950 via-red-900 to-stone-950',
        accentBorder: 'border-rose-400',
        badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
        textHex: '#fb7185',
        isDark: true,
      };
    }
    if (theme === 'emerald') {
      return {
        bg: [6, 78, 59] as [number, number, number],
        headerBg: [4, 52, 39] as [number, number, number],
        accent: [52, 211, 153] as [number, number, number],
        cssGradient: 'from-emerald-950 via-teal-900 to-stone-950',
        accentBorder: 'border-emerald-400',
        badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        textHex: '#34d399',
        isDark: true,
      };
    }
    if (theme === 'dynamic') {
      const house = getHouseTheme(
        previewParticipant?.teamName || '',
        previewParticipant?.teamId || ''
      );
      return {
        bg: house.bg,
        headerBg: house.headerBg,
        accent: house.accent,
        cssGradient: house.cssGradient,
        accentBorder: house.accentBorder,
        badgeBg: 'bg-primary/20 text-white border-white/20',
        textHex: house.textHex,
        isDark: true,
      };
    }
    // Monochrome Minimalist
    return {
      bg: [255, 255, 255] as [number, number, number],
      headerBg: [24, 24, 27] as [number, number, number],
      accent: [71, 85, 105] as [number, number, number],
      cssGradient: 'from-zinc-100 to-zinc-50 border border-zinc-300 text-zinc-900',
      accentBorder: 'border-zinc-800',
      badgeBg: 'bg-zinc-800 text-white border-zinc-700',
      textHex: '#18181b',
      isDark: false,
    };
  }, [theme, previewParticipant, getHouseTheme]);

  // Selection Handlers
  const handleToggleSelectAllFiltered = () => {
    const allFilteredIds = filteredParticipants.map((p) => p.id);
    const allSelected = allFilteredIds.every((id) => selectedParticipantIds.has(id));

    const next = new Set(selectedParticipantIds);
    if (allSelected) {
      allFilteredIds.forEach((id) => next.delete(id));
    } else {
      allFilteredIds.forEach((id) => next.add(id));
    }
    setSelectedParticipantIds(next);
  };

  const handleToggleSelectParticipant = (id: string) => {
    const next = new Set(selectedParticipantIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedParticipantIds(next);
  };

  const handleClearSelection = () => {
    setSelectedParticipantIds(new Set());
  };

  // Get active targets for batch operations (if none selected, use all filtered)
  const getBatchTargets = (): ParticipantWithDetails[] => {
    if (selectedParticipantIds.size > 0) {
      return enrichedParticipants.filter((p) => selectedParticipantIds.has(p.id));
    }
    return filteredParticipants;
  };

  // -------------------------------------------------------------
  // PDF VECTOR CARD RENDERER ENGINE (CR-80 Landscape & Portrait)
  // -------------------------------------------------------------
  const drawCardOnDoc = async (
    doc: jsPDF,
    participant: ParticipantWithDetails,
    options: {
      x: number;
      y: number;
      w: number;
      h: number;
      side: 'front' | 'back';
      orientation: CardOrientation;
      theme: CardTheme;
      qrCache: Map<number, string>;
    }
  ) => {
    const { x, y, w, h, side, orientation: orient, theme: cardTheme, qrCache } = options;

    // Resolve Theme Colors for this specific card
    let bg = [13, 27, 76] as [number, number, number];
    let headerBg = [8, 18, 52] as [number, number, number];
    let accent = [245, 158, 11] as [number, number, number];
    let isMono = false;

    if (cardTheme === 'midnight') {
      bg = [13, 27, 76];
      headerBg = [8, 18, 52];
      accent = [245, 158, 11];
    } else if (cardTheme === 'crimson') {
      bg = [74, 4, 23];
      headerBg = [50, 3, 15];
      accent = [251, 191, 36];
    } else if (cardTheme === 'emerald') {
      bg = [6, 78, 59];
      headerBg = [4, 52, 39];
      accent = [52, 211, 153];
    } else if (cardTheme === 'dynamic') {
      const house = getHouseTheme(participant.teamName, participant.teamId);
      bg = house.bg;
      headerBg = house.headerBg;
      accent = house.accent;
    } else {
      isMono = true;
      bg = [255, 255, 255];
      headerBg = [24, 24, 27];
      accent = [71, 85, 105];
    }

    // 1. Draw Crop Marks if enabled
    if (includeCropMarks && sheetLayout !== 'single-cr80') {
      const markLen = 2.5;
      const offset = 0.8;
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.12);
      // Top-Left
      doc.line(x - offset - markLen, y, x - offset, y);
      doc.line(x, y - offset - markLen, x, y - offset);
      // Top-Right
      doc.line(x + w + offset, y, x + w + offset + markLen, y);
      doc.line(x + w, y - offset - markLen, x + w, y - offset);
      // Bottom-Left
      doc.line(x - offset - markLen, y + h, x - offset, y + h);
      doc.line(x, y + h + offset, x, y + h + offset + markLen);
      // Bottom-Right
      doc.line(x + w + offset, y + h, x + w + offset + markLen, y + h);
      doc.line(x + w, y + h + offset, x + w, y + h + offset + markLen);
    }

    // 2. Base Card Container
    if (isMono) {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.25);
      doc.roundedRect(x, y, w, h, 3, 3, 'FD');
    } else {
      doc.setFillColor(bg[0], bg[1], bg[2]);
      doc.roundedRect(x, y, w, h, 3, 3, 'F');
    }

    // ==========================================
    // FRONT SIDE RENDERING
    // ==========================================
    if (side === 'front') {
      if (orient === 'landscape') {
        // Top Header Banner
        const headerH = 11;
        doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
        doc.roundedRect(x, y, w, headerH, 3, 3, 'F');
        doc.rect(x, y + headerH - 3, w, 3, 'F'); // Square bottom corners of header

        // Gold/Accent Separator Line
        doc.setFillColor(accent[0], accent[1], accent[2]);
        doc.rect(x, y + headerH, w, 0.7, 'F');

        // Header Fest Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(255, 255, 255);
        doc.text(festName.toUpperCase(), x + 5, y + 5.5);

        // Header Subtitle
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5);
        doc.setTextColor(210, 210, 215);
        doc.text('OFFICIAL PARTICIPANT DELEGATE', x + 5, y + 9.2);

        // Header Right Edition Pill
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5);
        doc.setTextColor(accent[0], accent[1], accent[2]);
        doc.text('AUTHENTICATED', x + w - 5, y + 6.5, { align: 'right' });

        // Content Area Calculations
        const qrSize = 22;
        const qrX = x + w - qrSize - 4.5;
        const qrY = y + headerH + 2.5;

        // Draw Scannable QR Code Box
        if (showQr) {
          doc.setFillColor(255, 255, 255);
          doc.roundedRect(qrX, qrY, qrSize, qrSize + 4.5, 2, 2, 'F');

          let qrDataUrl = qrCache.get(participant.chestNumber);
          if (!qrDataUrl) {
            qrDataUrl = await QRCode.toDataURL(participant.chestNumber.toString(), {
              errorCorrectionLevel: 'M',
              margin: 1,
              width: 256,
              color: { dark: '#000000', light: '#FFFFFF' },
            });
            qrCache.set(participant.chestNumber, qrDataUrl);
          }

          doc.addImage(qrDataUrl, 'PNG', qrX + 1.2, qrY + 1.2, qrSize - 2.4, qrSize - 2.4);

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(4);
          doc.setTextColor(60, 60, 60);
          doc.text('SCAN TO VERIFY', qrX + qrSize / 2, qrY + qrSize + 2.5, { align: 'center' });
        }

        // Left Information Column
        const leftX = x + 5;
        const maxTextW = showQr ? qrX - leftX - 3 : w - 10;

        // Chest Number Badge Box
        const badgeW = 28;
        const badgeH = 6.5;
        doc.setFillColor(accent[0], accent[1], accent[2]);
        doc.roundedRect(leftX, y + headerH + 3, badgeW, badgeH, 1.5, 1.5, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);
        doc.text(`CHEST #${participant.chestNumber}`, leftX + badgeW / 2, y + headerH + 7.3, {
          align: 'center',
        });

        // Participant Name
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        if (isMono) {
          doc.setTextColor(15, 23, 42);
        } else {
          doc.setTextColor(255, 255, 255);
        }
        doc.text(participant.name, leftX, y + headerH + 15, { maxWidth: maxTextW });

        // House & Category Info
        let metaY = y + headerH + 20.5;
        if (showHouse) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(5.5);
          doc.setTextColor(accent[0], accent[1], accent[2]);
          doc.text('HOUSE: ', leftX, metaY);

          doc.setFont('helvetica', 'normal');
          doc.setTextColor(isMono ? 40 : 230, isMono ? 40 : 230, isMono ? 40 : 235);
          doc.text(participant.teamName, leftX + 10, metaY);
          metaY += 4.5;
        }

        if (showCategory) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(5.5);
          doc.setTextColor(accent[0], accent[1], accent[2]);
          doc.text('CATEGORY: ', leftX, metaY);

          doc.setFont('helvetica', 'normal');
          doc.setTextColor(isMono ? 40 : 230, isMono ? 40 : 230, isMono ? 40 : 235);
          doc.text(participant.categoryName, leftX + 14.5, metaY);
        }

        // Bottom Watermark / Security Strip
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(4);
        doc.setTextColor(isMono ? 120 : 170, isMono ? 120 : 180, isMono ? 120 : 190);
        doc.text(
          'NON-TRANSFERABLE • MUST BE WORN AT VENUE • DALENZIA AUTH',
          x + 5,
          y + h - 3.2
        );
      } else {
        // ==========================================
        // FRONT SIDE: PORTRAIT (54 x 85.6 mm)
        // ==========================================
        const headerH = 14;
        doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
        doc.roundedRect(x, y, w, headerH, 3, 3, 'F');
        doc.rect(x, y + headerH - 3, w, 3, 'F');

        doc.setFillColor(accent[0], accent[1], accent[2]);
        doc.rect(x, y + headerH, w, 0.7, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text(festName.toUpperCase(), x + w / 2, y + 6, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(4.5);
        doc.setTextColor(210, 210, 215);
        doc.text('OFFICIAL DELEGATE PASS', x + w / 2, y + 10, { align: 'center' });

        // Chest Number Pill
        const badgeW = 28;
        const badgeH = 7;
        doc.setFillColor(accent[0], accent[1], accent[2]);
        doc.roundedRect(x + (w - badgeW) / 2, y + headerH + 3.5, badgeW, badgeH, 1.5, 1.5, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text(`CHEST #${participant.chestNumber}`, x + w / 2, y + headerH + 8.2, {
          align: 'center',
        });

        // Participant Name
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(isMono ? 15 : 255, isMono ? 23 : 255, isMono ? 42 : 255);
        doc.text(participant.name, x + w / 2, y + headerH + 17, {
          align: 'center',
          maxWidth: w - 8,
        });

        // House & Category Pills
        let pY = y + headerH + 23;
        if (showHouse) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor(accent[0], accent[1], accent[2]);
          doc.text(participant.teamName, x + w / 2, pY, { align: 'center' });
          pY += 4.5;
        }

        if (showCategory) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(5.5);
          doc.setTextColor(isMono ? 50 : 210, isMono ? 50 : 210, isMono ? 50 : 215);
          doc.text(participant.categoryName, x + w / 2, pY, { align: 'center' });
        }

        // Center Scannable QR Code
        if (showQr) {
          const qrSize = 25;
          const qrX = x + (w - qrSize) / 2;
          const qrY = y + 47;

          doc.setFillColor(255, 255, 255);
          doc.roundedRect(qrX, qrY, qrSize, qrSize + 4.5, 2, 2, 'F');

          let qrDataUrl = qrCache.get(participant.chestNumber);
          if (!qrDataUrl) {
            qrDataUrl = await QRCode.toDataURL(participant.chestNumber.toString(), {
              errorCorrectionLevel: 'M',
              margin: 1,
              width: 256,
              color: { dark: '#000000', light: '#FFFFFF' },
            });
            qrCache.set(participant.chestNumber, qrDataUrl);
          }

          doc.addImage(qrDataUrl, 'PNG', qrX + 1.2, qrY + 1.2, qrSize - 2.4, qrSize - 2.4);

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(4);
          doc.setTextColor(60, 60, 60);
          doc.text('SCAN TO VERIFY', x + w / 2, qrY + qrSize + 2.8, { align: 'center' });
        }

        // Bottom Footer
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(4);
        doc.setTextColor(isMono ? 120 : 170, isMono ? 120 : 180, isMono ? 120 : 190);
        doc.text('DALENZIA OFFICIAL DELEGATE PASS', x + w / 2, y + h - 3, { align: 'center' });
      }
    } else {
      // ==========================================
      // BACK SIDE RENDERING (SCHEDULE & PASS)
      // ==========================================
      // Header Bar
      const headerH = orient === 'landscape' ? 9 : 12;
      doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
      doc.roundedRect(x, y, w, headerH, 3, 3, 'F');
      doc.rect(x, y + headerH - 3, w, 3, 'F');

      doc.setFillColor(accent[0], accent[1], accent[2]);
      doc.rect(x, y + headerH, w, 0.6, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text('SCHEDULE & VENUE ACCESS', x + w / 2, y + 5.5, { align: 'center' });

      // Participant mini identification
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5);
      doc.setTextColor(isMono ? 40 : 220, isMono ? 40 : 220, isMono ? 40 : 225);
      doc.text(
        `CHEST #${participant.chestNumber}  |  ${participant.name}  |  ${participant.teamName}`,
        x + w / 2,
        y + headerH + 3.5,
        { align: 'center', maxWidth: w - 8 }
      );

      // Program Events List
      let progY = y + headerH + 8;
      if (showProgramsOnBack) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5);
        doc.setTextColor(accent[0], accent[1], accent[2]);
        doc.text('REGISTERED COMPETITION EVENTS:', x + 5, progY);
        progY += 3.8;

        const maxEvents = orient === 'landscape' ? 3 : 5;
        const events = participant.assignedProgramNames;

        if (events && events.length > 0) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(5);
          doc.setTextColor(isMono ? 20 : 255, isMono ? 20 : 255, isMono ? 20 : 255);

          events.slice(0, maxEvents).forEach((progName) => {
            doc.text(`• ${progName}`, x + 6, progY, { maxWidth: w - 12 });
            progY += 3.5;
          });

          if (events.length > maxEvents) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(4.5);
            doc.setTextColor(accent[0], accent[1], accent[2]);
            doc.text(`+ ${events.length - maxEvents} more registered events`, x + 6, progY);
            progY += 3.5;
          }
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(5);
          doc.setTextColor(isMono ? 100 : 180, isMono ? 100 : 180, isMono ? 100 : 180);
          doc.text('• No scheduled stage events assigned', x + 6, progY);
          progY += 3.5;
        }
      }

      // Guidelines & Signatory
      const bottomAreaY = y + h - (showSignature ? 13 : 8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(3.8);
      doc.setTextColor(isMono ? 100 : 170, isMono ? 100 : 170, isMono ? 100 : 170);
      doc.text(
        '1. Wear visibly at all times.  2. Report 15 mins prior to call.  3. Stage entry with badge only.',
        x + 5,
        bottomAreaY
      );

      if (showSignature) {
        const sigLineY = y + h - 5;
        doc.setDrawColor(isMono ? 160 : 180, isMono ? 160 : 180, isMono ? 160 : 180);
        doc.setLineWidth(0.2);
        doc.line(x + w - 30, sigLineY, x + w - 5, sigLineY);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(4);
        doc.setTextColor(isMono ? 70 : 200, isMono ? 70 : 200, isMono ? 70 : 200);
        doc.text('General Convener', x + w - 17.5, sigLineY + 3, { align: 'center' });
      }
    }
  };

  // -------------------------------------------------------------
  // BATCH PDF GENERATION DISPATCHER
  // -------------------------------------------------------------
  const generatePdfBlob = async (
    targetParticipants: ParticipantWithDetails[]
  ): Promise<{ blob: Blob; doc: jsPDF }> => {
    abortBatchRef.current = false;
    const qrCache = new Map<number, string>();
    const total = targetParticipants.length;

    // Dimensions in mm
    const isLandscape = orientation === 'landscape';
    const cardW = isLandscape ? 85.6 : 54;
    const cardH = isLandscape ? 54 : 85.6;

    let doc: jsPDF;

    if (sheetLayout === 'single-cr80') {
      // 1 card per page
      doc = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: isLandscape ? [85.6, 54] : [54, 85.6],
      });

      let pageCount = 0;
      for (let i = 0; i < total; i++) {
        if (abortBatchRef.current) break;
        const p = targetParticipants[i];

        setBatchStatus({
          title: 'Generating ID Cards (PDF)',
          description: `Rendering card ${i + 1} of ${total}: Chest #${p.chestNumber} (${p.name})...`,
          current: i + 1,
          total,
        });

        // Yield to browser event loop
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Front Side
        if (pageCount > 0) doc.addPage();
        await drawCardOnDoc(doc, p, {
          x: 0,
          y: 0,
          w: cardW,
          h: cardH,
          side: 'front',
          orientation,
          theme,
          qrCache,
        });
        pageCount++;

        // Back Side if requested
        if (cardSides === 'both-sides') {
          doc.addPage();
          await drawCardOnDoc(doc, p, {
            x: 0,
            y: 0,
            w: cardW,
            h: cardH,
            side: 'back',
            orientation,
            theme,
            qrCache,
          });
          pageCount++;
        }
      }
    } else if (sheetLayout === 'a4-grid-8') {
      // A4 Sheet with 8 cards per page (2 columns x 4 rows)
      doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4', // 210 x 297 mm
      });

      const cardsPerPage = 8;
      const cols = 2;
      const rows = 4;
      const startX = 12;
      const startY = 16;
      const gapX = 14.8;
      const gapY = 12.5;

      const chunks: ParticipantWithDetails[][] = [];
      for (let i = 0; i < total; i += cardsPerPage) {
        chunks.push(targetParticipants.slice(i, i + cardsPerPage));
      }

      let isFirstPage = true;
      let processedCount = 0;

      for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
        if (abortBatchRef.current) break;
        const chunk = chunks[chunkIdx];

        // Draw Front Page
        if (!isFirstPage) doc.addPage();
        isFirstPage = false;

        for (let idx = 0; idx < chunk.length; idx++) {
          if (abortBatchRef.current) break;
          const p = chunk[idx];
          processedCount++;

          setBatchStatus({
            title: 'Generating ID Cards (A4 Sheets)',
            description: `Rendering card ${processedCount} of ${total}: Chest #${p.chestNumber}...`,
            current: processedCount,
            total,
          });
          await new Promise((resolve) => setTimeout(resolve, 0));

          const col = idx % cols;
          const row = Math.floor(idx / cols);
          const x = startX + col * (cardW + gapX);
          const y = startY + row * (cardH + gapY);

          await drawCardOnDoc(doc, p, {
            x,
            y,
            w: cardW,
            h: cardH,
            side: 'front',
            orientation: 'landscape',
            theme,
            qrCache,
          });
        }

        // Draw Back Page if both sides
        if (cardSides === 'both-sides') {
          doc.addPage();
          for (let idx = 0; idx < chunk.length; idx++) {
            if (abortBatchRef.current) break;
            const p = chunk[idx];
            // Mirror columns for duplex printing so Front and Back align
            const originalCol = idx % cols;
            const mirroredCol = cols - 1 - originalCol;
            const row = Math.floor(idx / cols);
            const x = startX + mirroredCol * (cardW + gapX);
            const y = startY + row * (cardH + gapY);

            await drawCardOnDoc(doc, p, {
              x,
              y,
              w: cardW,
              h: cardH,
              side: 'back',
              orientation: 'landscape',
              theme,
              qrCache,
            });
          }
        }
      }
    } else {
      // a4-grid-4: 4 cards per page (2 columns x 2 rows, portrait badges)
      doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const cardsPerPage = 4;
      const cols = 2;
      const rows = 2;
      const badgeW = 85;
      const badgeH = 125;
      const startX = 14;
      const startY = 18;
      const gapX = 12;
      const gapY = 11;

      const chunks: ParticipantWithDetails[][] = [];
      for (let i = 0; i < total; i += cardsPerPage) {
        chunks.push(targetParticipants.slice(i, i + cardsPerPage));
      }

      let isFirstPage = true;
      let processedCount = 0;

      for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
        if (abortBatchRef.current) break;
        const chunk = chunks[chunkIdx];

        if (!isFirstPage) doc.addPage();
        isFirstPage = false;

        for (let idx = 0; idx < chunk.length; idx++) {
          if (abortBatchRef.current) break;
          const p = chunk[idx];
          processedCount++;

          setBatchStatus({
            title: 'Generating Lanyard Badges (A4)',
            description: `Rendering badge ${processedCount} of ${total}: Chest #${p.chestNumber}...`,
            current: processedCount,
            total,
          });
          await new Promise((resolve) => setTimeout(resolve, 0));

          const col = idx % cols;
          const row = Math.floor(idx / cols);
          const x = startX + col * (badgeW + gapX);
          const y = startY + row * (badgeH + gapY);

          await drawCardOnDoc(doc, p, {
            x,
            y,
            w: badgeW,
            h: badgeH,
            side: 'front',
            orientation: 'portrait',
            theme,
            qrCache,
          });
        }

        if (cardSides === 'both-sides') {
          doc.addPage();
          for (let idx = 0; idx < chunk.length; idx++) {
            if (abortBatchRef.current) break;
            const p = chunk[idx];
            const originalCol = idx % cols;
            const mirroredCol = cols - 1 - originalCol;
            const row = Math.floor(idx / cols);
            const x = startX + mirroredCol * (badgeW + gapX);
            const y = startY + row * (badgeH + gapY);

            await drawCardOnDoc(doc, p, {
              x,
              y,
              w: badgeW,
              h: badgeH,
              side: 'back',
              orientation: 'portrait',
              theme,
              qrCache,
            });
          }
        }
      }
    }

    const blob = doc.output('blob');
    return { blob, doc };
  };

  // -------------------------------------------------------------
  // USER ACTIONS: PDF DOWNLOAD & INSTANT PRINT
  // -------------------------------------------------------------
  const handleDownloadPDF = async () => {
    const targets = getBatchTargets();
    if (targets.length === 0) {
      toast({
        title: 'No Participants Selected',
        description: 'Please select at least one participant to generate cards.',
        variant: 'destructive',
      });
      return;
    }

    setBatchModalOpen(true);
    try {
      const { doc } = await generatePdfBlob(targets);
      if (!abortBatchRef.current) {
        const teamLabel = selectedTeam === 'all' ? 'all-teams' : 'team';
        doc.save(`dalenzia-id-cards-${teamLabel}-${targets.length}.pdf`);
        toast({
          title: 'ID Cards Generated',
          description: `Successfully exported ${targets.length} ID cards in ${sheetLayout} format.`,
        });
      }
    } catch (err) {
      console.error(err);
      toast({
        title: 'Export Failed',
        description: 'An error occurred during PDF generation.',
        variant: 'destructive',
      });
    } finally {
      setBatchModalOpen(false);
    }
  };

  const handleDirectPrint = async () => {
    const targets = getBatchTargets();
    if (targets.length === 0) {
      toast({
        title: 'No Participants Selected',
        description: 'Please select at least one participant to print.',
        variant: 'destructive',
      });
      return;
    }

    setBatchModalOpen(true);
    try {
      const { blob } = await generatePdfBlob(targets);
      if (!abortBatchRef.current) {
        const blobUrl = URL.createObjectURL(blob);
        const printWindow = window.open(blobUrl, '_blank');
        if (printWindow) {
          printWindow.addEventListener('load', () => {
            printWindow.print();
          });
        } else {
          // If popup is blocked, create hidden iframe
          const iframe = document.createElement('iframe');
          iframe.style.position = 'fixed';
          iframe.style.right = '0';
          iframe.style.bottom = '0';
          iframe.style.width = '0';
          iframe.style.height = '0';
          iframe.style.border = '0';
          iframe.src = blobUrl;
          document.body.appendChild(iframe);
          iframe.onload = () => {
            iframe.contentWindow?.print();
          };
        }
      }
    } catch (err) {
      console.error(err);
      toast({
        title: 'Print Failed',
        description: 'Failed to trigger direct printing dialog.',
        variant: 'destructive',
      });
    } finally {
      setBatchModalOpen(false);
    }
  };

  // Quick Action: Print Single Card (Current Preview)
  const handlePrintSingleCard = async (participant: ParticipantWithDetails) => {
    setBatchModalOpen(true);
    try {
      const { blob } = await generatePdfBlob([participant]);
      const blobUrl = URL.createObjectURL(blob);
      const printWindow = window.open(blobUrl, '_blank');
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          printWindow.print();
        });
      }
    } catch (err) {
      console.error(err);
      toast({
        title: 'Print Error',
        description: 'Failed to print single card.',
        variant: 'destructive',
      });
    } finally {
      setBatchModalOpen(false);
    }
  };

  // -------------------------------------------------------------
  // USER ACTIONS: QR CODE ZIP EXPORT
  // -------------------------------------------------------------
  const handleDownloadQRCodes = async () => {
    const targets = getBatchTargets();
    if (targets.length === 0) {
      toast({
        title: 'No Participants Selected',
        description: 'Select at least one participant to download QR codes.',
        variant: 'destructive',
      });
      return;
    }

    abortBatchRef.current = false;
    setBatchModalOpen(true);
    const zip = new JSZip();
    const qrFolder = zip.folder('participant_qrcodes');

    try {
      for (let i = 0; i < targets.length; i++) {
        if (abortBatchRef.current) break;
        const p = targets[i];

        setBatchStatus({
          title: 'Generating High-Res QR Codes (ZIP)',
          description: `Processing QR for Chest #${p.chestNumber}: ${p.name}...`,
          current: i + 1,
          total: targets.length,
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        const dataUrl = await QRCode.toDataURL(p.chestNumber.toString(), {
          errorCorrectionLevel: 'H',
          margin: 1,
          width: 512,
        });

        const base64Data = dataUrl.substring(dataUrl.indexOf(',') + 1);
        const safeName = p.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        qrFolder?.file(`Chest_${p.chestNumber}_${safeName}.png`, base64Data, { base64: true });
      }

      if (!abortBatchRef.current) {
        // Add Manifest CSV
        const manifestRows = [
          'Chest Number,Student Name,House,Category,QR Payload Data',
          ...targets.map(
            (p) =>
              `${p.chestNumber},"${p.name.replace(/"/g, '""')}","${p.teamName}","${p.categoryName}",${p.chestNumber}`
          ),
        ];
        zip.file('manifest.csv', manifestRows.join('\n'));

        const content = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `dalenzia-qrcodes-${targets.length}-participants.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        toast({
          title: 'QR Codes Exported',
          description: `Successfully zipped ${targets.length} QR code images.`,
        });
      }
    } catch (err) {
      console.error(err);
      toast({
        title: 'ZIP Export Failed',
        description: 'An error occurred during QR code generation.',
        variant: 'destructive',
      });
    } finally {
      setBatchModalOpen(false);
    }
  };

  // -------------------------------------------------------------
  // USER ACTIONS: EXCEL (.xlsx) EXPORT
  // -------------------------------------------------------------
  const handleDownloadXLSX = () => {
    const targets = getBatchTargets();
    if (targets.length === 0) {
      toast({
        title: 'No Participants Selected',
        description: 'Please select participants to export data.',
        variant: 'destructive',
      });
      return;
    }

    const dataForExport = targets.map((p) => ({
      'Chest Number': p.chestNumber,
      'Participant Name': p.name,
      'House / Team': p.teamName,
      'Category': p.categoryName,
      'QR Code Value': p.chestNumber.toString(),
      'Assigned Programs Count': p.assignedProgramNames.length,
      'Assigned Programs List': p.assignedProgramNames.join(', ') || 'None',
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataForExport);

    // Auto column widths
    const colWidths = [
      { wch: 14 },
      { wch: 28 },
      { wch: 20 },
      { wch: 18 },
      { wch: 15 },
      { wch: 24 },
      { wch: 45 },
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'ID Card Master Roster');
    XLSX.writeFile(workbook, `dalenzia-id-cards-roster-${targets.length}.xlsx`);

    toast({
      title: 'Spreadsheet Exported',
      description: `Saved Excel mail-merge roster with ${targets.length} participants.`,
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col h-[70vh] items-center justify-center gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <span className="text-sm font-medium text-muted-foreground">
          Loading Participant Roster & Studio Settings...
        </span>
      </div>
    );
  }

  const batchTargets = getBatchTargets();
  const allFilteredSelected =
    filteredParticipants.length > 0 &&
    filteredParticipants.every((p) => selectedParticipantIds.has(p.id));
  const someFilteredSelected =
    filteredParticipants.some((p) => selectedParticipantIds.has(p.id)) && !allFilteredSelected;

  return (
    <div className="space-y-6 pb-12">
      {/* ========================================================= */}
      {/* HEADER & TOP TELEMETRY KPI SECTION                        */}
      {/* ========================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-headline flex items-center gap-2.5">
              <CreditCard className="h-7 w-7 text-primary" />
              ID Card Studio & Pass Generation
            </h1>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
              Live Studio
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Design, preview in 3D, customize print templates, and generate official participant delegate
            credentials and scannable QR passes.
          </p>
        </div>

        {/* Top Quick Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={handleDownloadXLSX} className="gap-1.5 shadow-xs">
            <FileText className="h-4 w-4 text-emerald-500" />
            Export Excel (.xlsx)
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadQRCodes} className="gap-1.5 shadow-xs">
            <QrCode className="h-4 w-4 text-primary" />
            Export QR ZIP
          </Button>
          <Button
            size="sm"
            onClick={handleDirectPrint}
            className="gap-1.5 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            <Printer className="h-4 w-4" />
            Print Cards ({batchTargets.length})
          </Button>
        </div>
      </div>

      {/* Top Telemetry KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <Card className="border-border/50 bg-card/60 backdrop-blur-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Participants</p>
              <h3 className="text-xl md:text-2xl font-bold font-mono tracking-tight mt-0.5">
                {enrichedParticipants.length}
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/60 backdrop-blur-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Active Houses / Teams</p>
              <h3 className="text-xl md:text-2xl font-bold font-mono tracking-tight mt-0.5">
                {teams.length}
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500">
              <Layers className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/60 backdrop-blur-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Filtered Selection</p>
              <h3 className="text-xl md:text-2xl font-bold font-mono tracking-tight mt-0.5">
                {selectedParticipantIds.size > 0 ? selectedParticipantIds.size : filteredParticipants.length}
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/60 backdrop-blur-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Active Festival</p>
              <h3 className="text-base md:text-lg font-bold truncate max-w-[150px] mt-0.5 text-foreground">
                {festName}
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500">
              <Sparkles className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ========================================================= */}
      {/* 2-COLUMN STUDIO WORKSPACE: PREVIEW & CUSTOMIZATION        */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: INTERACTIVE 3D LIVE CARD PREVIEW (7 Cols) */}
        <Card className="lg:col-span-7 border-border/60 shadow-sm overflow-hidden bg-card/70 backdrop-blur-xs">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Eye className="h-5 w-5 text-primary" />
                  Interactive ID Card Studio
                </CardTitle>
                <CardDescription>
                  Real-time 3D preview with scannable QR verification.
                </CardDescription>
              </div>

              {/* Side & Flip Controls */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsFlipped((prev) => !prev)}
                  className="gap-1.5 shadow-2xs font-medium text-xs h-8"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  Flip to {isFlipped ? 'Front' : 'Back'}
                </Button>
                <div className="flex rounded-md border border-border/60 p-0.5 bg-muted/40">
                  <button
                    onClick={() => setOrientation('landscape')}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded-sm transition-all',
                      orientation === 'landscape'
                        ? 'bg-background shadow-2xs text-foreground font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Landscape
                  </button>
                  <button
                    onClick={() => setOrientation('portrait')}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded-sm transition-all',
                      orientation === 'portrait'
                        ? 'bg-background shadow-2xs text-foreground font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Portrait
                  </button>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-6 pb-6 flex flex-col items-center justify-center min-h-[380px] bg-gradient-to-b from-muted/20 to-muted/40 relative">
            {/* 3D Flippable Card Canvas */}
            <div className="relative [perspective:1000px] flex justify-center py-2 select-none">
              <div
                className={cn(
                  'relative transition-transform duration-700 [transform-style:preserve-3d] shadow-2xl rounded-2xl border cursor-pointer group',
                  orientation === 'landscape' ? 'w-[360px] sm:w-[420px] h-[235px] sm:h-[265px]' : 'w-[270px] sm:w-[290px] h-[390px] sm:h-[420px]',
                  isFlipped ? '[transform:rotateY(180deg)]' : '[transform:rotateY(0deg)]'
                )}
                onClick={() => setIsFlipped((p) => !p)}
              >
                {/* ------------------------------------------ */}
                {/* FRONT SIDE OF THE CARD                     */}
                {/* ------------------------------------------ */}
                <div
                  className={cn(
                    'absolute inset-0 [backface-visibility:hidden] rounded-2xl overflow-hidden p-5 flex flex-col justify-between transition-colors',
                    currentCardThemeConfig.cssGradient,
                    currentCardThemeConfig.isDark ? 'text-white' : 'text-zinc-900'
                  )}
                >
                  {/* Front Header */}
                  <div>
                    <div className="flex items-center justify-between border-b pb-2.5" style={{ borderColor: 'rgba(255, 255, 255, 0.15)' }}>
                      <div>
                        <h2 className="text-xs sm:text-sm font-extrabold tracking-wide uppercase truncate max-w-[220px]">
                          {festName}
                        </h2>
                        <p className="text-[10px] tracking-wider font-semibold opacity-75">
                          OFFICIAL PARTICIPANT PASS
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn('text-[9px] uppercase tracking-wider font-bold py-0 h-5', currentCardThemeConfig.badgeBg)}
                      >
                        DELEGATE
                      </Badge>
                    </div>
                  </div>

                  {/* Front Body Content */}
                  {orientation === 'landscape' ? (
                    <div className="flex items-center justify-between gap-4 my-auto">
                      <div className="space-y-2 flex-1 min-w-0">
                        {/* Chest # Pill */}
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-400 text-zinc-950 font-black text-xs sm:text-sm shadow-sm">
                          CHEST #{previewParticipant ? previewParticipant.chestNumber : '---'}
                        </div>

                        {/* Name */}
                        <h3 className="text-base sm:text-lg font-bold tracking-tight truncate">
                          {previewParticipant ? previewParticipant.name : 'Participant Name'}
                        </h3>

                        {/* House & Category details */}
                        <div className="space-y-0.5 text-xs opacity-90 font-medium">
                          {showHouse && (
                            <p className="flex items-center gap-1 truncate">
                              <span className="font-semibold text-[11px] opacity-75">HOUSE:</span>{' '}
                              <span className="font-bold text-amber-300">
                                {previewParticipant?.teamName || 'Independent'}
                              </span>
                            </p>
                          )}
                          {showCategory && (
                            <p className="flex items-center gap-1 truncate">
                              <span className="font-semibold text-[11px] opacity-75">CAT:</span>{' '}
                              <span>{previewParticipant?.categoryName || 'General'}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Scannable QR Code */}
                      {showQr && (
                        <div className="flex flex-col items-center shrink-0">
                          <div className="p-1.5 bg-white rounded-xl shadow-md">
                            {previewQrDataUrl ? (
                              <img
                                src={previewQrDataUrl}
                                alt="QR Code"
                                className="w-20 h-20 sm:w-22 sm:h-22 rounded-sm"
                              />
                            ) : (
                              <div className="w-20 h-20 bg-muted animate-pulse rounded-sm" />
                            )}
                          </div>
                          <span className="text-[8px] font-semibold tracking-wider text-center mt-1 text-white/80">
                            SCAN TO VERIFY
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Portrait Front Body */
                    <div className="flex flex-col items-center justify-center text-center space-y-2.5 my-auto">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-400 text-zinc-950 font-black text-sm shadow-sm">
                        CHEST #{previewParticipant ? previewParticipant.chestNumber : '---'}
                      </div>

                      <h3 className="text-base font-bold tracking-tight line-clamp-2 px-1">
                        {previewParticipant ? previewParticipant.name : 'Participant Name'}
                      </h3>

                      <div className="text-xs opacity-90 space-y-0.5">
                        {showHouse && (
                          <p className="font-bold text-amber-300">
                            {previewParticipant?.teamName || 'Independent'}
                          </p>
                        )}
                        {showCategory && (
                          <p className="text-[11px] opacity-75">{previewParticipant?.categoryName}</p>
                        )}
                      </div>

                      {showQr && (
                        <div className="p-1.5 bg-white rounded-xl shadow-md mt-1">
                          {previewQrDataUrl ? (
                            <img
                              src={previewQrDataUrl}
                              alt="QR Code"
                              className="w-20 h-20 rounded-sm"
                            />
                          ) : (
                            <div className="w-20 h-20 bg-muted animate-pulse rounded-sm" />
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Front Footer */}
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[9px] opacity-75">
                    <span className="font-mono">VALID ENTRY DELEGATE</span>
                    <span className="font-mono">SECURE QR ID</span>
                  </div>
                </div>

                {/* ------------------------------------------ */}
                {/* BACK SIDE OF THE CARD (SCHEDULE & RULES)   */}
                {/* ------------------------------------------ */}
                <div
                  className={cn(
                    'absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-2xl overflow-hidden p-5 flex flex-col justify-between transition-colors',
                    currentCardThemeConfig.cssGradient,
                    currentCardThemeConfig.isDark ? 'text-white' : 'text-zinc-900'
                  )}
                >
                  {/* Back Header */}
                  <div className="border-b pb-2 border-white/15">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-center text-amber-300">
                      {festName} • SCHEDULE PASS
                    </h3>
                    <p className="text-[10px] text-center opacity-80 truncate">
                      Chest #{previewParticipant?.chestNumber} | {previewParticipant?.name}
                    </p>
                  </div>

                  {/* Back Content: Assigned Programs */}
                  <div className="my-auto space-y-2 text-xs">
                    {showProgramsOnBack && (
                      <div>
                        <p className="text-[10px] font-bold uppercase text-amber-300 tracking-wider mb-1">
                          Registered Stage Events:
                        </p>
                        {previewParticipant && previewParticipant.assignedProgramNames.length > 0 ? (
                          <ul className="space-y-1 text-[11px] max-h-24 overflow-y-auto pr-1">
                            {previewParticipant.assignedProgramNames.map((prog, i) => (
                              <li key={i} className="flex items-center gap-1.5 opacity-90 truncate">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                                <span className="truncate">{prog}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[11px] italic opacity-75">
                            No scheduled stage events assigned.
                          </p>
                        )}
                      </div>
                    )}

                    <div className="text-[9px] opacity-75 space-y-0.5 border-t border-white/10 pt-2">
                      <p>1. Must be worn visibly within the festival arena at all times.</p>
                      <p>2. Report to stage call desk 15 minutes before scheduled event.</p>
                      <p>3. Non-transferable credential.</p>
                    </div>
                  </div>

                  {/* Back Footer: Convener Signatory */}
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                    <span className="text-[9px] font-mono opacity-70">STAGE CONTROLLER PASS</span>
                    {showSignature && (
                      <div className="text-center">
                        <div className="w-24 h-0.5 bg-white/40 mb-1 mx-auto" />
                        <span className="text-[9px] font-semibold opacity-90">General Convener</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Click-to-flip hint */}
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
              <RotateCw className="h-3.5 w-3.5" />
              Click the card above or use the flip button to toggle Front & Back.
            </p>

            {/* Single Card Quick Action Bar */}
            {previewParticipant && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1.5 text-xs h-8"
                  onClick={() => handlePrintSingleCard(previewParticipant)}
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print This Card (Chest #{previewParticipant.chestNumber})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs h-8"
                  onClick={async () => {
                    const { doc } = await generatePdfBlob([previewParticipant]);
                    doc.save(`ID_Card_Chest_${previewParticipant.chestNumber}_${previewParticipant.name}.pdf`);
                  }}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Single PDF
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* RIGHT COLUMN: CUSTOMIZATION & PRINT SETUP (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-base flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" />
                Badge Design & Style
              </CardTitle>
              <CardDescription>Select color palette and layout configuration.</CardDescription>
            </CardHeader>

            <CardContent className="pt-4 space-y-4">
              {/* Theme Palette Buttons */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Theme Palette</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setTheme('midnight')}
                    className={cn(
                      'flex items-center gap-2 p-2 rounded-lg border text-left text-xs font-medium transition-all',
                      theme === 'midnight'
                        ? 'border-primary ring-1 ring-primary bg-primary/5 font-semibold'
                        : 'border-border/60 hover:bg-muted/40'
                    )}
                  >
                    <span className="h-4 w-4 rounded-full bg-[#0d1b4c] border border-amber-400 shrink-0" />
                    <span>Midnight Sapphire</span>
                  </button>

                  <button
                    onClick={() => setTheme('crimson')}
                    className={cn(
                      'flex items-center gap-2 p-2 rounded-lg border text-left text-xs font-medium transition-all',
                      theme === 'crimson'
                        ? 'border-primary ring-1 ring-primary bg-primary/5 font-semibold'
                        : 'border-border/60 hover:bg-muted/40'
                    )}
                  >
                    <span className="h-4 w-4 rounded-full bg-[#4a0417] border border-rose-300 shrink-0" />
                    <span>Imperial Crimson</span>
                  </button>

                  <button
                    onClick={() => setTheme('emerald')}
                    className={cn(
                      'flex items-center gap-2 p-2 rounded-lg border text-left text-xs font-medium transition-all',
                      theme === 'emerald'
                        ? 'border-primary ring-1 ring-primary bg-primary/5 font-semibold'
                        : 'border-border/60 hover:bg-muted/40'
                    )}
                  >
                    <span className="h-4 w-4 rounded-full bg-[#064e3b] border border-emerald-300 shrink-0" />
                    <span>Emerald Prestige</span>
                  </button>

                  <button
                    onClick={() => setTheme('dynamic')}
                    className={cn(
                      'flex items-center gap-2 p-2 rounded-lg border text-left text-xs font-medium transition-all',
                      theme === 'dynamic'
                        ? 'border-primary ring-1 ring-primary bg-primary/5 font-semibold'
                        : 'border-border/60 hover:bg-muted/40'
                    )}
                  >
                    <span className="h-4 w-4 rounded-full bg-gradient-to-r from-blue-500 via-amber-500 to-rose-500 shrink-0" />
                    <span>House Dynamic</span>
                  </button>
                </div>

                <div className="pt-1">
                  <button
                    onClick={() => setTheme('monochrome')}
                    className={cn(
                      'w-full flex items-center justify-between p-2 rounded-lg border text-left text-xs font-medium transition-all',
                      theme === 'monochrome'
                        ? 'border-primary ring-1 ring-primary bg-primary/5 font-semibold'
                        : 'border-border/60 hover:bg-muted/40'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-4 w-4 rounded-full bg-white border border-zinc-700 shrink-0" />
                      <span>Monochrome Minimalist (Ink Saver)</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      Laser / Eco
                    </Badge>
                  </button>
                </div>
              </div>

              {/* Elements Visibility Switches */}
              <div className="space-y-2.5 pt-2 border-t border-border/40">
                <Label className="text-xs font-semibold">Card Data Elements</Label>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Scannable QR Code</span>
                    <Switch checked={showQr} onCheckedChange={setShowQr} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">House / Team Badge</span>
                    <Switch checked={showHouse} onCheckedChange={setShowHouse} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Member Category</span>
                    <Switch checked={showCategory} onCheckedChange={setShowCategory} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Assigned Programs (On Back)</span>
                    <Switch checked={showProgramsOnBack} onCheckedChange={setShowProgramsOnBack} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Authorized Convener Signature</span>
                    <Switch checked={showSignature} onCheckedChange={setShowSignature} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* PRINT SHEET & BATCH EXPORT CONFIG */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-base flex items-center gap-2">
                <Sliders className="h-4 w-4 text-primary" />
                Sheet Layout & Print Settings
              </CardTitle>
              <CardDescription>Paper formatting for physical printing & laminating.</CardDescription>
            </CardHeader>

            <CardContent className="pt-4 space-y-4">
              {/* Sheet Layout Selector */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Paper Sheet Layout</Label>
                <Select value={sheetLayout} onValueChange={(val) => setSheetLayout(val as SheetLayout)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select Sheet Layout" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a4-grid-8">
                      A4 Sheet — 8 Cards / Page (Standard 2x4 Landscape Grid)
                    </SelectItem>
                    <SelectItem value="a4-grid-4">
                      A4 Sheet — 4 Badges / Page (Large 2x2 Portrait Lanyards)
                    </SelectItem>
                    <SelectItem value="single-cr80">
                      Single Card — 1 Card / Page (Direct PVC Card Printer CR-80)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Card Sides Selector */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Card Sides to Export</Label>
                <Select value={cardSides} onValueChange={(val) => setCardSides(val as CardSides)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select Sides" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="front-only">Front Side Only (Single-Sided Print)</SelectItem>
                    <SelectItem value="both-sides">
                      Both Sides (Front & Back Duplex Printing)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Crop marks switch */}
              <div className="flex items-center justify-between pt-1 text-xs">
                <div>
                  <span className="font-medium text-foreground">Include Cut Crop Marks</span>
                  <p className="text-[11px] text-muted-foreground">
                    Draws corner guide lines for paper cutter / scissors.
                  </p>
                </div>
                <Switch checked={includeCropMarks} onCheckedChange={setIncludeCropMarks} />
              </div>
            </CardContent>

            <CardFooter className="pt-3 border-t border-border/40 flex flex-col gap-2">
              <Button
                className="w-full gap-2 shadow-sm font-semibold"
                onClick={handleDownloadPDF}
              >
                <Download className="h-4 w-4" />
                Download Batch PDF ({batchTargets.length} Cards)
              </Button>
              <Button
                variant="outline"
                className="w-full gap-2 text-xs"
                onClick={handleDirectPrint}
              >
                <Printer className="h-3.5 w-3.5" />
                Open Direct Print Dialog
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* ========================================================= */}
      {/* PARTICIPANT DIRECTORY & BATCH SELECTION TABLE             */}
      {/* ========================================================= */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Participant Roster & Badge Queue
              </CardTitle>
              <CardDescription>
                Search, filter by house, select individual students, or batch-print cards.
              </CardDescription>
            </div>

            {/* Selection Status Badge */}
            <div className="flex items-center gap-2">
              {selectedParticipantIds.size > 0 ? (
                <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-3 py-1 rounded-full text-xs font-semibold text-primary">
                  <span>{selectedParticipantIds.size} Selected</span>
                  <button
                    onClick={handleClearSelection}
                    className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Showing all {filteredParticipants.length} participants
                </span>
              )}
            </div>
          </div>

          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-3">
            {/* Search Input */}
            <div className="sm:col-span-5 relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search chest #, name, house, or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            {/* Team Dropdown */}
            <div className="sm:col-span-3">
              <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Teams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Houses / Teams ({enrichedParticipants.length})</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category Dropdown */}
            <div className="sm:col-span-2">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {memberCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Select All Toggle Button */}
            <div className="sm:col-span-2 flex items-center justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleSelectAllFiltered}
                className="w-full text-xs h-9 gap-1.5"
              >
                {allFilteredSelected ? (
                  <>
                    <CheckSquare className="h-3.5 w-3.5 text-primary" />
                    Deselect All
                  </>
                ) : (
                  <>
                    <Square className="h-3.5 w-3.5" />
                    Select All ({filteredParticipants.length})
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-xs z-10">
                <TableRow>
                  <TableHead className="w-12 text-center">
                    <Checkbox
                      checked={allFilteredSelected ? true : someFilteredSelected ? 'indeterminate' : false}
                      onCheckedChange={handleToggleSelectAllFiltered}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead className="w-24">Chest #</TableHead>
                  <TableHead>Participant Name</TableHead>
                  <TableHead>House / Team</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Assigned Events</TableHead>
                  <TableHead className="text-right pr-6">Studio Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredParticipants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground text-sm">
                      No participants match the selected search or filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredParticipants.map((p) => {
                    const isSelected = selectedParticipantIds.has(p.id);
                    const isPreviewed = previewParticipant?.id === p.id;

                    return (
                      <TableRow
                        key={p.id}
                        className={cn(
                          'cursor-pointer transition-colors',
                          isPreviewed && 'bg-primary/5 font-medium',
                          isSelected && 'bg-muted/50'
                        )}
                        onClick={() => setPreviewParticipantId(p.id)}
                      >
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleSelectParticipant(p.id)}
                          />
                        </TableCell>

                        <TableCell>
                          <Badge variant="outline" className="font-mono font-bold text-xs bg-muted/60">
                            #{p.chestNumber}
                          </Badge>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-foreground">{p.name}</span>
                            {isPreviewed && (
                              <Badge className="text-[10px] py-0 h-4 bg-primary text-primary-foreground">
                                Active Preview
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge variant="secondary" className="text-xs font-semibold">
                            {p.teamName}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-xs text-muted-foreground">{p.categoryName}</TableCell>

                        <TableCell>
                          {p.assignedProgramNames.length > 0 ? (
                            <Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/5">
                              {p.assignedProgramNames.length} {p.assignedProgramNames.length === 1 ? 'Event' : 'Events'}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">0 Events</span>
                          )}
                        </TableCell>

                        <TableCell className="text-right pr-6" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant={isPreviewed ? 'default' : 'ghost'}
                              className="h-8 text-xs gap-1"
                              onClick={() => {
                                setPreviewParticipantId(p.id);
                                window.scrollTo({ top: 120, behavior: 'smooth' });
                              }}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Preview
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs gap-1"
                              onClick={() => handlePrintSingleCard(p)}
                            >
                              <Printer className="h-3.5 w-3.5" />
                              Print
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ========================================================= */}
      {/* BATCH PROGRESS MODAL DIALOG                               */}
      {/* ========================================================= */}
      <Dialog open={batchModalOpen} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              {batchStatus.title || 'Processing ID Cards...'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {batchStatus.description || 'Please wait while documents and QR codes are being generated.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3">
            <Progress
              value={batchStatus.total > 0 ? (batchStatus.current / batchStatus.total) * 100 : 0}
            />
            <div className="flex justify-between text-xs text-muted-foreground font-mono">
              <span>
                {batchStatus.current} of {batchStatus.total} processed
              </span>
              <span>
                {batchStatus.total > 0
                  ? Math.round((batchStatus.current / batchStatus.total) * 100)
                  : 0}
                %
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                abortBatchRef.current = true;
                setBatchModalOpen(false);
                toast({
                  title: 'Operation Cancelled',
                  description: 'Batch export was stopped by user.',
                });
              }}
            >
              Cancel Operation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
