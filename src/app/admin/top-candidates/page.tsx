'use client';

import { useState, useMemo, useCallback } from 'react';
import { doc } from 'firebase/firestore';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { useAppSettings, useCachedDoc, useSharedCollection } from '@/context/firestore-cache';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Loader2,
  Download,
  Search,
  Crown,
  ArrowRight,
  Filter,
  Medal,
  Trophy,
  Star,
  Award,
  Sparkles,
  Eye,
  FileSpreadsheet,
  Printer,
  BarChart3,
  PieChart as PieIcon,
  Flame,
  Users,
  Layers,
  CheckCircle2,
  TrendingUp,
  Sliders,
  ExternalLink,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { toast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
} from 'recharts';

import type { Program as BaseProgram } from '@/app/admin/programs/page';
import type { Participant as BaseParticipant } from '@/app/teams/add-participants/page';
import type { Team } from '@/app/admin/teams/page';
import type { Category } from '@/app/admin/categories/page';

// Data types
type Participant = BaseParticipant & { categoryName?: string };
type Program = BaseProgram & { isGeneral?: boolean; isPublished?: boolean };
type Assignment = { id: string; programId: string; studentId: string; teamId: string; status?: 'cancelled' };
type Score = { programId: string; assignmentId: string; judgeId: string; score: number };
type PointsSettings = {
  normalGradePoints: Record<string, number>;
  specialGradePoints: Record<string, Record<string, number>>;
  rankPoints: Record<string, number>;
};

export type ProgramBreakdownItem = {
  programId: string;
  programName: string;
  averageScore: number;
  grade: string;
  gradePoints: number;
  rank: number | null;
  rankPoints: number;
  totalProgramPoints: number;
};

export type ParticipantResult = {
  participantId: string;
  name: string;
  chestNumber: number;
  teamId: string;
  teamName: string;
  categoryId: string;
  categoryName: string;
  totalPoints: number;
  gradePointsTotal: number;
  rankPointsTotal: number;
  firstCount: number;
  secondCount: number;
  thirdCount: number;
  gradeACount: number;
  programsParticipated: number;
  breakdown: ProgramBreakdownItem[];
};

export type ProgramFilter =
  | 'all'
  | 'individual'
  | 'group'
  | 'specific'
  | 'individual-specific'
  | 'group-specific';

const getGrade = (score: number) => {
  if (score >= 90) return 'A+';
  if (score >= 70) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  return 'No Grade';
};

const CHART_COLORS = [
  '#f59e0b', // amber
  '#3b82f6', // blue
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

export default function TopCandidatesPage() {
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);
  const [isDownloadingXLSX, setIsDownloadingXLSX] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [programFilter, setProgramFilter] = useState<ProgramFilter>('all');
  const [hideUnscored, setHideUnscored] = useState(true);
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'analytics' | 'categories'>('leaderboard');

  // Quick Peek Modal State
  const [peekParticipant, setPeekParticipant] = useState<ParticipantResult | null>(null);

  // Firestore Collections & Settings
  const { data: programs, loading: progsLoading } = useSharedCollection<Program>('programs');
  const { data: participants, loading: studentsLoading } = useSharedCollection<Participant>('students');
  const { data: assignments, loading: assignmentsLoading } = useSharedCollection<Assignment>('assignments');
  const { data: scores, loading: scoresLoading } = useSharedCollection<Score & { id: string }>('scores');
  const { data: pointsSettings, loading: pointsLoading } = useCachedDoc<PointsSettings>(
    'doc:points:gradeAndRankPoints',
    () => doc(db, 'points', 'gradeAndRankPoints')
  );
  const { data: teams, loading: teamsLoading } = useSharedCollection<Team>('teams');
  const { data: memberCategories, loading: memCatsLoading } = useSharedCollection<Category>('memberCategories');
  const { data: programCategories, loading: progCatsLoading } = useSharedCollection<Category>('programCategories');
  const { settings, loading: settingsLoading } = useAppSettings();

  const festName = settings?.festName || 'DALENZIA ARTS FEST';

  const loading =
    progsLoading ||
    studentsLoading ||
    assignmentsLoading ||
    scoresLoading ||
    pointsLoading ||
    teamsLoading ||
    memCatsLoading ||
    progCatsLoading ||
    settingsLoading;

  // Comprehensive Top Candidates Calculation
  const results: ParticipantResult[] = useMemo(() => {
    if (!pointsSettings || loading) return [];

    const generalCategoryIds = programCategories.filter((pc) => pc.isGeneral).map((pc) => pc.id);
    const publishedPrograms = programs.filter((p) => p.isPublished);

    let filteredPrograms = publishedPrograms;
    if (programFilter !== 'all') {
      filteredPrograms = publishedPrograms.filter((p) => {
        const isSpecific = !generalCategoryIds.includes(p.categoryId);
        switch (programFilter) {
          case 'individual':
            return p.type === 'individual';
          case 'group':
            return p.type === 'group';
          case 'specific':
            return isSpecific;
          case 'individual-specific':
            return p.type === 'individual' && isSpecific;
          case 'group-specific':
            return p.type === 'group' && isSpecific;
          default:
            return true;
        }
      });
    }

    // Cache averages and rank sorting per program
    const programScoresCache: Record<string, { assignmentId: string; averageScore: number }[]> = {};
    for (const program of filteredPrograms) {
      const programAssignments = assignments.filter(
        (a) => a.programId === program.id && a.status !== 'cancelled'
      );
      const scoresList = programAssignments
        .map((pa) => {
          const assignmentScores = scores.filter((s) => s.assignmentId === pa.id);
          if (assignmentScores.length === 0) return null;
          const totalScore = assignmentScores.reduce((sum, s) => sum + s.score, 0);
          return { assignmentId: pa.id, averageScore: totalScore / assignmentScores.length };
        })
        .filter(Boolean) as { assignmentId: string; averageScore: number }[];

      scoresList.sort((a, b) => b.averageScore - a.averageScore);
      programScoresCache[program.id] = scoresList;
    }

    const teamMap = new Map(teams.map((t) => [t.id, t.name]));
    const categoryMap = new Map(memberCategories.map((c) => [c.id, c.name]));

    const participantResults: ParticipantResult[] = participants.map((participant) => {
      let totalPoints = 0;
      let gradePointsTotal = 0;
      let rankPointsTotal = 0;
      let firstCount = 0;
      let secondCount = 0;
      let thirdCount = 0;
      let gradeACount = 0;
      const breakdown: ProgramBreakdownItem[] = [];

      const participantAssignments = assignments.filter(
        (a) => a.studentId === participant.id && a.status !== 'cancelled'
      );

      for (const assignment of participantAssignments) {
        const program = filteredPrograms.find((p) => p.id === assignment.programId);
        if (!program) continue;

        const scoresForProgram = programScoresCache[program.id];
        if (!scoresForProgram) continue;

        const participantScoreData = scoresForProgram.find((s) => s.assignmentId === assignment.id);
        if (participantScoreData) {
          const { averageScore } = participantScoreData;
          const grade = getGrade(averageScore);

          const gradePoints =
            program.markType === 'special-mark'
              ? pointsSettings.specialGradePoints?.[program.id]?.[grade] || 0
              : pointsSettings.normalGradePoints?.[grade] || 0;

          if (grade === 'A+' || grade === 'A') {
            gradeACount++;
          }

          let rank = 0;
          let lastScore = -1;
          for (let i = 0; i < scoresForProgram.length; i++) {
            if (scoresForProgram[i].averageScore !== lastScore) {
              rank = i + 1;
              lastScore = scoresForProgram[i].averageScore;
            }
            if (scoresForProgram[i].assignmentId === assignment.id) {
              break;
            }
          }

          let rankPoints = 0;
          if (rank === 1) {
            rankPoints = pointsSettings.rankPoints?.first || 0;
            firstCount++;
          } else if (rank === 2) {
            rankPoints = pointsSettings.rankPoints?.second || 0;
            secondCount++;
          } else if (rank === 3) {
            rankPoints = pointsSettings.rankPoints?.third || 0;
            thirdCount++;
          }

          const totalProgramPoints = gradePoints + rankPoints;
          totalPoints += totalProgramPoints;
          gradePointsTotal += gradePoints;
          rankPointsTotal += rankPoints;

          breakdown.push({
            programId: program.id,
            programName: program.name,
            averageScore,
            grade,
            gradePoints,
            rank: rank > 0 && rank <= 3 ? rank : null,
            rankPoints,
            totalProgramPoints,
          });
        }
      }

      return {
        participantId: participant.id,
        name: participant.name,
        chestNumber: participant.chestNumber,
        teamId: participant.teamId,
        teamName: teamMap.get(participant.teamId) || 'Unknown House',
        categoryId: participant.categoryId,
        categoryName: categoryMap.get(participant.categoryId) || 'General',
        totalPoints,
        gradePointsTotal,
        rankPointsTotal,
        firstCount,
        secondCount,
        thirdCount,
        gradeACount,
        programsParticipated: breakdown.length,
        breakdown,
      };
    });

    // Multi-tier sorting: Total points -> Firsts -> Seconds -> Thirds -> Grade Points
    participantResults.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.firstCount !== a.firstCount) return b.firstCount - a.firstCount;
      if (b.secondCount !== a.secondCount) return b.secondCount - a.secondCount;
      if (b.thirdCount !== a.thirdCount) return b.thirdCount - a.thirdCount;
      return b.gradePointsTotal - a.gradePointsTotal;
    });

    return participantResults;
  }, [
    programFilter,
    programs,
    participants,
    assignments,
    scores,
    pointsSettings,
    teams,
    memberCategories,
    programCategories,
    loading,
  ]);

  // Filtered Results based on search and dropdown selections
  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      if (hideUnscored && r.totalPoints <= 0) return false;
      if (teamFilter !== 'all' && r.teamName !== teamFilter) return false;
      if (categoryFilter !== 'all' && r.categoryId !== categoryFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchesName = r.name.toLowerCase().includes(q);
        const matchesChest = r.chestNumber.toString().includes(q);
        const matchesHouse = r.teamName.toLowerCase().includes(q);
        const matchesCat = r.categoryName.toLowerCase().includes(q);
        return matchesName || matchesChest || matchesHouse || matchesCat;
      }
      return true;
    });
  }, [results, teamFilter, categoryFilter, searchTerm, hideUnscored]);

  // Telemetry KPIs
  const telemetry = useMemo(() => {
    const scoredParticipants = results.filter((r) => r.totalPoints > 0);
    const topScorer = scoredParticipants.length > 0 ? scoredParticipants[0] : null;

    let totalGolds = 0;
    let totalSilvers = 0;
    let totalBronzes = 0;
    for (const r of scoredParticipants) {
      totalGolds += r.firstCount;
      totalSilvers += r.secondCount;
      totalBronzes += r.thirdCount;
    }

    // Top house in top 10
    const top10 = scoredParticipants.slice(0, 10);
    const houseCount = new Map<string, number>();
    for (const p of top10) {
      houseCount.set(p.teamName, (houseCount.get(p.teamName) || 0) + 1);
    }
    let dominantHouse = 'None';
    let maxCount = 0;
    for (const [house, count] of houseCount.entries()) {
      if (count > maxCount) {
        maxCount = count;
        dominantHouse = house;
      }
    }

    return {
      scoredCount: scoredParticipants.length,
      topScorer,
      totalMedals: totalGolds + totalSilvers + totalBronzes,
      dominantHouse,
      dominantCount: maxCount,
    };
  }, [results]);

  // Top 3 Olympic Podium Candidates
  const topThree = useMemo(() => {
    const scored = results.filter((r) => r.totalPoints > 0);
    return {
      first: scored[0] || null,
      second: scored[1] || null,
      third: scored[2] || null,
    };
  }, [results]);

  // Category Champions (Leading student per category)
  const categoryChampions = useMemo(() => {
    const categoryMap = new Map<string, ParticipantResult[]>();
    for (const r of results) {
      if (r.totalPoints <= 0) continue;
      const list = categoryMap.get(r.categoryName) || [];
      list.push(r);
      categoryMap.set(r.categoryName, list);
    }

    const champions: { categoryName: string; topper: ParticipantResult; runnersUp: ParticipantResult[] }[] = [];
    for (const [catName, list] of categoryMap.entries()) {
      if (list.length > 0) {
        champions.push({
          categoryName: catName,
          topper: list[0],
          runnersUp: list.slice(1, 4),
        });
      }
    }

    return champions.sort((a, b) => b.topper.totalPoints - a.topper.totalPoints);
  }, [results]);

  // Recharts Analytics Datasets
  const analyticsData = useMemo(() => {
    const top10 = results.filter((r) => r.totalPoints > 0).slice(0, 10);

    const barData = top10.map((r, i) => ({
      name: `#${r.chestNumber} ${r.name.split(' ')[0]}`,
      fullName: r.name,
      chestNumber: r.chestNumber,
      totalPoints: Number(r.totalPoints.toFixed(2)),
      gradePoints: Number(r.gradePointsTotal.toFixed(2)),
      rankPoints: Number(r.rankPointsTotal.toFixed(2)),
      teamName: r.teamName,
    }));

    // House share in Top 20
    const top20 = results.filter((r) => r.totalPoints > 0).slice(0, 20);
    const housePointsMap = new Map<string, number>();
    for (const p of top20) {
      housePointsMap.set(p.teamName, (housePointsMap.get(p.teamName) || 0) + p.totalPoints);
    }
    const pieData = Array.from(housePointsMap.entries()).map(([name, value]) => ({
      name,
      value: Number(value.toFixed(2)),
    }));

    return { barData, pieData };
  }, [results]);

  // -------------------------------------------------------------
  // PUBLICATION-GRADE PDF EXPORT
  // -------------------------------------------------------------
  const handleDownloadPDF = () => {
    setIsDownloadingPDF(true);
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      // Header Banner
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, 210, 28, 'F');

      doc.setFillColor(245, 158, 11); // amber-500 accent line
      doc.rect(0, 27.2, 210, 0.8, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text(festName.toUpperCase(), 14, 11);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(245, 158, 11);
      doc.text('OFFICIAL TOP CANDIDATES & INDIVIDUAL MERIT GAZETTE', 14, 18);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(203, 213, 225);
      doc.text(
        `Generated: ${new Date().toLocaleString()}  |  Filter: ${programFilter.toUpperCase()}  |  Total Scored: ${
          filteredResults.length
        }`,
        14,
        24
      );

      // Table Generation
      autoTable(doc, {
        startY: 34,
        head: [['Rank', 'Chest #', 'Participant Name', 'House / Team', 'Category', '1st', '2nd', '3rd', 'Points']],
        body: filteredResults.map((r, i) => [
          `#${i + 1}`,
          r.chestNumber,
          r.name,
          r.teamName,
          r.categoryName,
          r.firstCount > 0 ? r.firstCount : '-',
          r.secondCount > 0 ? r.secondCount : '-',
          r.thirdCount > 0 ? r.thirdCount : '-',
          r.totalPoints.toFixed(2),
        ]),
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8.5,
          halign: 'left',
        },
        columnStyles: {
          0: { halign: 'center', fontStyle: 'bold', cellWidth: 16 },
          1: { halign: 'center', cellWidth: 18 },
          2: { fontStyle: 'bold', cellWidth: 50 },
          3: { cellWidth: 32 },
          4: { cellWidth: 28 },
          5: { halign: 'center', cellWidth: 12 },
          6: { halign: 'center', cellWidth: 12 },
          7: { halign: 'center', cellWidth: 12 },
          8: { halign: 'right', fontStyle: 'bold', cellWidth: 20 },
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        styles: {
          fontSize: 8,
          cellPadding: 2.5,
          textColor: [30, 41, 59],
        },
        margin: { left: 12, right: 12 },
      });

      // Signature Block on the last page
      const finalY = (doc as any).lastAutoTable?.finalY || 200;
      const pageHeight = doc.internal.pageSize.getHeight();
      let sigY = finalY + 20;

      if (sigY + 25 > pageHeight) {
        doc.addPage();
        sigY = 30;
      }

      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.3);

      // Convener
      doc.line(20, sigY, 75, sigY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(50, 50, 50);
      doc.text('General Convener', 47.5, sigY + 4.5, { align: 'center' });

      // Tabulation Controller
      doc.line(135, sigY, 190, sigY);
      doc.text('Chief Tabulation Officer', 162.5, sigY + 4.5, { align: 'center' });

      doc.save(`dalenzia-top-candidates-${new Date().toISOString().split('T')[0]}.pdf`);
      toast({
        title: 'PDF Gazette Exported',
        description: `Exported ${filteredResults.length} candidates with certified signature blocks.`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: 'Export Failed',
        description: 'Failed to generate PDF document.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloadingPDF(false);
    }
  };

  // -------------------------------------------------------------
  // EXCEL (.xlsx) EXPORT
  // -------------------------------------------------------------
  const handleDownloadXLSX = () => {
    setIsDownloadingXLSX(true);
    try {
      const dataForExport = filteredResults.map((r, i) => ({
        'Official Rank': i + 1,
        'Chest Number': r.chestNumber,
        'Participant Name': r.name,
        'House / Team': r.teamName,
        'Category': r.categoryName,
        '1st Ranks (Gold)': r.firstCount,
        '2nd Ranks (Silver)': r.secondCount,
        '3rd Ranks (Bronze)': r.thirdCount,
        'A/A+ Grades': r.gradeACount,
        'Grade Points': Number(r.gradePointsTotal.toFixed(2)),
        'Rank Points': Number(r.rankPointsTotal.toFixed(2)),
        'Total Championship Points': Number(r.totalPoints.toFixed(2)),
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataForExport);

      const colWidths = [
        { wch: 14 },
        { wch: 14 },
        { wch: 30 },
        { wch: 22 },
        { wch: 20 },
        { wch: 16 },
        { wch: 16 },
        { wch: 16 },
        { wch: 14 },
        { wch: 15 },
        { wch: 15 },
        { wch: 24 },
      ];
      worksheet['!cols'] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Top Candidates');
      XLSX.writeFile(workbook, `dalenzia-top-candidates-${new Date().toISOString().split('T')[0]}.xlsx`);

      toast({
        title: 'Excel Exported',
        description: `Successfully exported spreadsheet with ${filteredResults.length} candidates.`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: 'Export Failed',
        description: 'Failed to export Excel file.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloadingXLSX(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)]">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
          <Loader2 className="h-12 w-12 animate-spin text-primary relative z-10" />
        </div>
        <p className="text-muted-foreground animate-pulse mt-4 text-sm font-medium">
          Tabulating Scores & Live Talent Rankings...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative min-h-screen pb-12">
      {/* Dynamic Ambient Background Glow */}
      <div className="fixed inset-0 -z-10 h-full w-full bg-background overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[45%] h-[45%] rounded-full bg-amber-500/5 blur-[130px]" />
        <div className="absolute top-[20%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-[130px]" />
        <div className="absolute bottom-[-10%] right-[10%] w-[40%] h-[40%] rounded-full bg-emerald-500/5 blur-[140px]" />
      </div>

      {/* ========================================================= */}
      {/* HEADER SECTION                                            */}
      {/* ========================================================= */}
      <motion.div
        initial={{ opacity: 0, y: -15 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl md:text-3xl font-bold font-headline tracking-tight flex items-center gap-2.5">
              <Star className="h-7 w-7 text-amber-500 fill-amber-500/20" />
              Top Candidates & Talent Leaderboard
            </h1>
            <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-xs">
              Live Tabulation
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time individual championship standings, Kalaprathibha / Kalathilakam rankings, and category champions.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadXLSX}
            disabled={isDownloadingXLSX}
            className="gap-1.5 shadow-xs"
          >
            {isDownloadingXLSX ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 text-emerald-500" />}
            Export Excel
          </Button>

          <Button
            size="sm"
            onClick={handleDownloadPDF}
            disabled={isDownloadingPDF}
            className="gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-md shadow-amber-500/20 font-semibold"
          >
            {isDownloadingPDF ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download PDF Gazette
          </Button>
        </div>
      </motion.div>

      {/* ========================================================= */}
      {/* TOP TELEMETRY KPI CARDS                                   */}
      {/* ========================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <Card className="border-border/50 bg-card/60 backdrop-blur-xs relative overflow-hidden group hover:border-amber-500/40 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-xl pointer-events-none" />
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Championship Leader</p>
              <h3 className="text-lg md:text-xl font-bold truncate max-w-[150px] mt-0.5 text-amber-500">
                {telemetry.topScorer ? telemetry.topScorer.name : 'Awaiting Scores'}
              </h3>
              <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                {telemetry.topScorer ? `${telemetry.topScorer.totalPoints.toFixed(2)} pts` : '--'}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500">
              <Crown className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/60 backdrop-blur-xs relative overflow-hidden group hover:border-blue-500/40 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-xl pointer-events-none" />
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Scored Candidates</p>
              <h3 className="text-xl md:text-2xl font-bold font-mono tracking-tight mt-0.5">
                {telemetry.scoredCount}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                of {results.length} registered
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
              <Users className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/60 backdrop-blur-xs relative overflow-hidden group hover:border-emerald-500/40 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Medals Awarded</p>
              <h3 className="text-xl md:text-2xl font-bold font-mono tracking-tight mt-0.5">
                {telemetry.totalMedals}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                1st, 2nd & 3rd ranks
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
              <Medal className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/60 backdrop-blur-xs relative overflow-hidden group hover:border-purple-500/40 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-xl pointer-events-none" />
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Top House in Top 10</p>
              <h3 className="text-base md:text-lg font-bold truncate max-w-[150px] mt-0.5 text-purple-400">
                {telemetry.dominantHouse}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {telemetry.dominantCount > 0 ? `${telemetry.dominantCount} candidates` : 'Pending'}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-500">
              <Flame className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ========================================================= */}
      {/* OLYMPIC PODIUM FOR TOP 3 CANDIDATES                       */}
      {/* ========================================================= */}
      {topThree.first && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1 items-end">
          {/* SILVER - 2ND PLACE */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="order-2 md:order-1"
          >
            {topThree.second ? (
              <Card className="border-border/60 bg-gradient-to-t from-slate-900/40 via-card/70 to-card/90 shadow-md relative overflow-hidden group hover:border-slate-400/50 transition-all">
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-slate-400 via-gray-300 to-slate-400" />
                <CardContent className="p-5 flex flex-col items-center text-center">
                  <div className="relative mb-2">
                    <Avatar className="h-16 w-16 border-2 border-slate-300 shadow-md">
                      <AvatarFallback className="bg-slate-800 text-slate-200 font-bold text-lg">
                        {topThree.second.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-1 -right-1 p-1 bg-slate-200 text-slate-950 rounded-full font-black text-xs shadow-sm">
                      #2
                    </div>
                  </div>

                  <Badge variant="outline" className="text-[10px] bg-slate-500/10 text-slate-300 border-slate-400/30 mb-1">
                    🥈 Silver Medalist
                  </Badge>

                  <h3 className="font-bold text-base truncate max-w-[200px]">
                    {topThree.second.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Chest #{topThree.second.chestNumber} • {topThree.second.teamName}
                  </p>

                  <div className="mt-3 py-1.5 px-3 rounded-lg bg-muted/40 w-full flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Championship:</span>
                    <span className="font-mono font-bold text-foreground text-sm">
                      {topThree.second.totalPoints.toFixed(2)} pts
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-2 w-full">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs h-8 gap-1"
                      onClick={() => setPeekParticipant(topThree.second)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Peek Scorecard
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed border-border/60 bg-muted/10 h-56 flex items-center justify-center text-muted-foreground text-xs">
                Awaiting 2nd Place
              </Card>
            )}
          </motion.div>

          {/* GOLD - 1ST PLACE (CENTER ELEVATED) */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            className="order-1 md:order-2"
          >
            <Card className="border-amber-500/40 bg-gradient-to-t from-amber-950/20 via-card/80 to-card shadow-xl relative overflow-hidden group hover:border-amber-500 transition-all ring-1 ring-amber-500/30">
              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500" />
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/20 rounded-full blur-2xl pointer-events-none" />

              <CardContent className="p-6 flex flex-col items-center text-center">
                <div className="relative mb-2">
                  <div className="absolute -top-5 inset-x-0 flex justify-center text-amber-400 animate-bounce">
                    <Crown className="h-7 w-7 fill-amber-400 drop-shadow-[0_2px_8px_rgba(245,158,11,0.5)]" />
                  </div>
                  <Avatar className="h-20 w-20 border-2 border-amber-400 shadow-xl ring-4 ring-amber-500/20">
                    <AvatarFallback className="bg-amber-950 text-amber-200 font-black text-2xl">
                      {topThree.first.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-1 -right-1 p-1.5 bg-amber-400 text-zinc-950 rounded-full font-black text-xs shadow-md">
                    #1
                  </div>
                </div>

                <Badge className="text-xs bg-amber-500 text-zinc-950 font-bold mb-1 shadow-sm">
                  🥇 Fest Kalaprathibha
                </Badge>

                <h3 className="font-extrabold text-lg md:text-xl truncate max-w-[220px] text-foreground">
                  {topThree.first.name}
                </h3>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">
                  Chest #{topThree.first.chestNumber} • <span className="text-amber-400 font-semibold">{topThree.first.teamName}</span>
                </p>

                <div className="mt-4 py-2 px-4 rounded-xl bg-amber-500/10 border border-amber-500/20 w-full flex items-center justify-between text-xs">
                  <span className="text-amber-300 font-semibold">Championship Score:</span>
                  <span className="font-mono font-black text-amber-400 text-base">
                    {topThree.first.totalPoints.toFixed(2)} pts
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-2 w-full">
                  <Button
                    size="sm"
                    className="w-full text-xs h-8 gap-1 bg-amber-500 text-zinc-950 hover:bg-amber-400 font-bold"
                    onClick={() => setPeekParticipant(topThree.first)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Peek Scorecard
                  </Button>
                  <Button asChild size="sm" variant="outline" className="text-xs h-8 px-2.5">
                    <Link href={`/admin/top-candidates/${topThree.first.participantId}`}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* BRONZE - 3RD PLACE */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="order-3"
          >
            {topThree.third ? (
              <Card className="border-border/60 bg-gradient-to-t from-stone-900/40 via-card/70 to-card/90 shadow-md relative overflow-hidden group hover:border-amber-700/50 transition-all">
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-700 via-amber-600 to-amber-800" />
                <CardContent className="p-5 flex flex-col items-center text-center">
                  <div className="relative mb-2">
                    <Avatar className="h-16 w-16 border-2 border-amber-700 shadow-md">
                      <AvatarFallback className="bg-amber-950 text-amber-300 font-bold text-lg">
                        {topThree.third.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-1 -right-1 p-1 bg-amber-700 text-white rounded-full font-black text-xs shadow-sm">
                      #3
                    </div>
                  </div>

                  <Badge variant="outline" className="text-[10px] bg-amber-800/20 text-amber-400 border-amber-700/30 mb-1">
                    🥉 Bronze Medalist
                  </Badge>

                  <h3 className="font-bold text-base truncate max-w-[200px]">
                    {topThree.third.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Chest #{topThree.third.chestNumber} • {topThree.third.teamName}
                  </p>

                  <div className="mt-3 py-1.5 px-3 rounded-lg bg-muted/40 w-full flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Championship:</span>
                    <span className="font-mono font-bold text-foreground text-sm">
                      {topThree.third.totalPoints.toFixed(2)} pts
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-2 w-full">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs h-8 gap-1"
                      onClick={() => setPeekParticipant(topThree.third)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Peek Scorecard
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed border-border/60 bg-muted/10 h-56 flex items-center justify-center text-muted-foreground text-xs">
                Awaiting 3rd Place
              </Card>
            )}
          </motion.div>
        </div>
      )}

      {/* ========================================================= */}
      {/* CATEGORY CHAMPIONS SPOTLIGHT CHIPS                        */}
      {/* ========================================================= */}
      {categoryChampions.length > 0 && (
        <Card className="border-border/60 shadow-xs bg-card/60 backdrop-blur-xs">
          <CardHeader className="py-3 px-4 border-b border-border/40">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" />
              Category Star Performers
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {categoryChampions.map((cat, idx) => (
                <div
                  key={cat.categoryName}
                  className="p-3 rounded-xl border border-border/50 bg-background/60 hover:bg-muted/40 transition-colors cursor-pointer group"
                  onClick={() => setPeekParticipant(cat.topper)}
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground mb-1">
                    <span className="uppercase tracking-wider">{cat.categoryName}</span>
                    <Badge variant="secondary" className="text-[10px] py-0 h-4">
                      Topper
                    </Badge>
                  </div>
                  <h4 className="font-bold text-sm truncate group-hover:text-primary transition-colors">
                    {cat.topper.name}
                  </h4>
                  <div className="flex items-center justify-between text-xs mt-1 text-muted-foreground">
                    <span className="font-mono">#{cat.topper.chestNumber} • {cat.topper.teamName}</span>
                    <span className="font-mono font-bold text-amber-500">
                      {cat.topper.totalPoints.toFixed(2)} pts
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ========================================================= */}
      {/* FILTER & SEARCH TOOLBAR                                   */}
      {/* ========================================================= */}
      <Card className="border-border/60 shadow-xs bg-card/70 backdrop-blur-xs">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            {/* Omnisearch */}
            <div className="sm:col-span-4 relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search chest #, candidate name, house, or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            {/* Team Filter */}
            <div className="sm:col-span-3">
              <Select value={teamFilter} onValueChange={setTeamFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Teams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Houses / Teams</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.name}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category Filter */}
            <div className="sm:col-span-3">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Member Categories</SelectItem>
                  {memberCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Program Type Filter */}
            <div className="sm:col-span-2">
              <Select
                value={programFilter}
                onValueChange={(val) => setProgramFilter(val as ProgramFilter)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Filter Program Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Programs</SelectItem>
                  <SelectItem value="individual">Individual Only</SelectItem>
                  <SelectItem value="group">Group Only</SelectItem>
                  <SelectItem value="specific">Specific Cat Only</SelectItem>
                  <SelectItem value="individual-specific">Individual (Specific)</SelectItem>
                  <SelectItem value="group-specific">Group (Specific)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Sub Toolbar with Toggle & Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/40 text-xs">
            <div className="flex items-center gap-2">
              <Switch checked={hideUnscored} onCheckedChange={setHideUnscored} id="hide-unscored" />
              <Label htmlFor="hide-unscored" className="text-xs font-medium cursor-pointer">
                Only Scored Candidates (&gt; 0 pts)
              </Label>
              <Badge variant="secondary" className="text-[10px] py-0 h-4 ml-1">
                {filteredResults.length} Matched
              </Badge>
            </div>

            {/* View Tabs */}
            <div className="flex items-center rounded-lg border border-border/60 p-0.5 bg-muted/40">
              <button
                onClick={() => setActiveTab('leaderboard')}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5',
                  activeTab === 'leaderboard'
                    ? 'bg-background text-foreground shadow-2xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Trophy className="h-3.5 w-3.5" />
                Table Standings
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5',
                  activeTab === 'analytics'
                    ? 'bg-background text-foreground shadow-2xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Analytics Charts
              </button>
              <button
                onClick={() => setActiveTab('categories')}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5',
                  activeTab === 'categories'
                    ? 'bg-background text-foreground shadow-2xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Layers className="h-3.5 w-3.5" />
                Category Grids
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ========================================================= */}
      {/* MAIN VIEW CONTENT: TABS                                   */}
      {/* ========================================================= */}

      {/* TAB 1: LEADERBOARD TABLE */}
      {activeTab === 'leaderboard' && (
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-16 text-center">Rank</TableHead>
                    <TableHead className="w-24">Chest #</TableHead>
                    <TableHead>Participant</TableHead>
                    <TableHead>House / Team</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-center">Medals (1st / 2nd / 3rd)</TableHead>
                    <TableHead className="text-center">Scored Events</TableHead>
                    <TableHead className="text-right">Total Points</TableHead>
                    <TableHead className="w-28 text-right pr-6">Scorecard</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredResults.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-32 text-center text-muted-foreground text-sm">
                        No candidates match the selected criteria.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredResults.map((r, index) => {
                      const isTop1 = index === 0 && r.totalPoints > 0;
                      const isTop2 = index === 1 && r.totalPoints > 0;
                      const isTop3 = index === 2 && r.totalPoints > 0;

                      return (
                        <TableRow
                          key={r.participantId}
                          className={cn(
                            'hover:bg-muted/40 transition-colors cursor-pointer group',
                            isTop1 && 'bg-amber-500/5'
                          )}
                          onClick={() => setPeekParticipant(r)}
                        >
                          {/* Rank Column */}
                          <TableCell className="text-center font-bold font-mono">
                            <div className="flex items-center justify-center gap-1">
                              {isTop1 && <Crown className="h-4 w-4 text-amber-500 fill-amber-500/30" />}
                              {isTop2 && <Medal className="h-4 w-4 text-slate-300 fill-slate-300/30" />}
                              {isTop3 && <Medal className="h-4 w-4 text-amber-700 fill-amber-700/30" />}
                              <span
                                className={cn(
                                  'text-sm',
                                  isTop1
                                    ? 'text-amber-500 font-extrabold'
                                    : isTop2
                                    ? 'text-slate-200 font-bold'
                                    : isTop3
                                    ? 'text-amber-600 font-bold'
                                    : 'text-muted-foreground'
                                )}
                              >
                                #{index + 1}
                              </span>
                            </div>
                          </TableCell>

                          {/* Chest Number */}
                          <TableCell>
                            <Badge variant="outline" className="font-mono font-bold text-xs bg-muted/50">
                              #{r.chestNumber}
                            </Badge>
                          </TableCell>

                          {/* Participant Name */}
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-8 w-8 border border-border/60">
                                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                  {r.name.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                                  {r.name}
                                </p>
                              </div>
                            </div>
                          </TableCell>

                          {/* House / Team */}
                          <TableCell>
                            <Badge variant="secondary" className="text-xs font-semibold">
                              {r.teamName}
                            </Badge>
                          </TableCell>

                          {/* Category */}
                          <TableCell className="text-xs text-muted-foreground">{r.categoryName}</TableCell>

                          {/* Medals Tally */}
                          <TableCell className="text-center">
                            <div className="inline-flex items-center justify-center gap-2 text-xs">
                              {r.firstCount > 0 && (
                                <span className="flex items-center gap-0.5 font-bold text-amber-400">
                                  🥇 {r.firstCount}
                                </span>
                              )}
                              {r.secondCount > 0 && (
                                <span className="flex items-center gap-0.5 font-bold text-slate-300">
                                  🥈 {r.secondCount}
                                </span>
                              )}
                              {r.thirdCount > 0 && (
                                <span className="flex items-center gap-0.5 font-bold text-amber-600">
                                  🥉 {r.thirdCount}
                                </span>
                              )}
                              {r.firstCount === 0 && r.secondCount === 0 && r.thirdCount === 0 && (
                                <span className="text-muted-foreground text-[11px]">-</span>
                              )}
                            </div>
                          </TableCell>

                          {/* Scored Events Count */}
                          <TableCell className="text-center font-mono text-xs">
                            {r.programsParticipated > 0 ? (
                              <Badge variant="outline" className="text-xs">
                                {r.programsParticipated} {r.programsParticipated === 1 ? 'Event' : 'Events'}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>

                          {/* Total Points */}
                          <TableCell className="text-right">
                            <span className="font-mono font-black text-base text-primary">
                              {r.totalPoints.toFixed(2)}
                            </span>
                          </TableCell>

                          {/* Actions */}
                          <TableCell className="text-right pr-6" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs gap-1"
                                onClick={() => setPeekParticipant(r)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Peek
                              </Button>
                              <Button asChild size="sm" variant="ghost" className="h-8 text-xs px-2">
                                <Link href={`/admin/top-candidates/${r.participantId}`}>
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
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
      )}

      {/* TAB 2: ANALYTICS CHARTS */}
      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Top 10 Participants Bar Chart */}
          <Card className="lg:col-span-8 border-border/60 shadow-sm">
            <CardHeader className="pb-2 border-b border-border/40">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Top 10 Points Breakdown (Grade vs Rank Points)
              </CardTitle>
              <CardDescription>
                Compares how leading performers accumulated their points across grade rubric vs podium ranks.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 h-[350px]">
              {analyticsData.barData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsData.barData} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="name"
                      angle={-25}
                      textAnchor="end"
                      height={40}
                      tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.8 }}
                    />
                    <YAxis tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.8 }} />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Bar dataKey="gradePoints" name="Grade Points" stackId="a" fill="#3b82f6" radius={[0, 0, 4, 4]} />
                    <Bar dataKey="rankPoints" name="Rank Points" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  No scored candidates to graph yet.
                </div>
              )}
            </CardContent>
          </Card>

          {/* House Points Share in Top 20 Candidates */}
          <Card className="lg:col-span-4 border-border/60 shadow-sm">
            <CardHeader className="pb-2 border-b border-border/40">
              <CardTitle className="text-base flex items-center gap-2">
                <PieIcon className="h-4 w-4 text-primary" />
                House Share in Top 20
              </CardTitle>
              <CardDescription>Points distribution among the top 20 performers.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 h-[350px]">
              {analyticsData.pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analyticsData.pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={3}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {analyticsData.pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  Awaiting scores for house distribution.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: CATEGORY GRIDS */}
      {activeTab === 'categories' && (
        <div className="space-y-6">
          {categoryChampions.map((cat) => (
            <Card key={cat.categoryName} className="border-border/60 shadow-sm">
              <CardHeader className="pb-3 border-b border-border/40 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Award className="h-4 w-4 text-amber-500" />
                    {cat.categoryName} Standings
                  </CardTitle>
                  <CardDescription>
                    Leading student: {cat.topper.name} ({cat.topper.teamName}) — {cat.topper.totalPoints.toFixed(2)} pts
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">
                  {cat.runnersUp.length + 1} Scored
                </Badge>
              </CardHeader>

              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="w-16 text-center">Rank</TableHead>
                      <TableHead className="w-24">Chest #</TableHead>
                      <TableHead>Candidate</TableHead>
                      <TableHead>House</TableHead>
                      <TableHead className="text-center">Medals</TableHead>
                      <TableHead className="text-right">Total Points</TableHead>
                      <TableHead className="w-24 text-right pr-6">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[cat.topper, ...cat.runnersUp].map((student, rankIdx) => (
                      <TableRow key={student.participantId} className="hover:bg-muted/40 transition-colors">
                        <TableCell className="text-center font-bold">
                          {rankIdx === 0 ? (
                            <span className="text-amber-500 font-extrabold flex items-center justify-center gap-1">
                              <Crown className="h-4 w-4" /> #1
                            </span>
                          ) : (
                            <span className="text-muted-foreground">#{rankIdx + 1}</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono font-semibold">#{student.chestNumber}</TableCell>
                        <TableCell className="font-semibold text-sm">{student.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {student.teamName}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-xs">
                          {student.firstCount > 0 && `🥇 ${student.firstCount} `}
                          {student.secondCount > 0 && `🥈 ${student.secondCount} `}
                          {student.thirdCount > 0 && `🥉 ${student.thirdCount}`}
                          {student.firstCount === 0 && student.secondCount === 0 && student.thirdCount === 0 && '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono font-black text-primary">
                          {student.totalPoints.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => setPeekParticipant(student)}
                          >
                            Peek
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ========================================================= */}
      {/* QUICK PEEK SCORECARD MODAL DIALOG                         */}
      {/* ========================================================= */}
      <Dialog open={!!peekParticipant} onOpenChange={(open) => !open && setPeekParticipant(null)}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
          {peekParticipant && (
            <>
              <DialogHeader className="p-5 pb-3 border-b border-border/40 shrink-0 bg-muted/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 border-2 border-primary/40">
                      <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">
                        {peekParticipant.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <DialogTitle className="text-lg font-bold flex items-center gap-2">
                        {peekParticipant.name}
                        <Badge variant="outline" className="font-mono text-xs font-bold">
                          Chest #{peekParticipant.chestNumber}
                        </Badge>
                      </DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                        {peekParticipant.teamName} • {peekParticipant.categoryName}
                      </DialogDescription>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                      Total Points
                    </span>
                    <h3 className="text-2xl font-black font-mono text-primary">
                      {peekParticipant.totalPoints.toFixed(2)}
                    </h3>
                  </div>
                </div>

                {/* Badges Bar */}
                <div className="flex flex-wrap items-center gap-2 pt-3 text-xs">
                  <Badge variant="secondary" className="gap-1 font-mono">
                    Grade Pts: <strong>{peekParticipant.gradePointsTotal.toFixed(2)}</strong>
                  </Badge>
                  <Badge variant="secondary" className="gap-1 font-mono">
                    Rank Pts: <strong>{peekParticipant.rankPointsTotal.toFixed(2)}</strong>
                  </Badge>
                  {peekParticipant.firstCount > 0 && (
                    <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 font-bold">
                      🥇 {peekParticipant.firstCount} Firsts
                    </Badge>
                  )}
                  {peekParticipant.secondCount > 0 && (
                    <Badge className="bg-slate-500/10 text-slate-300 border-slate-500/20 font-bold">
                      🥈 {peekParticipant.secondCount} Seconds
                    </Badge>
                  )}
                  {peekParticipant.thirdCount > 0 && (
                    <Badge className="bg-amber-700/10 text-amber-600 border-amber-700/20 font-bold">
                      🥉 {peekParticipant.thirdCount} Thirds
                    </Badge>
                  )}
                </div>
              </DialogHeader>

              {/* Scored Events Breakdown Table */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Program Event Breakdown ({peekParticipant.breakdown.length} Events):
                </h4>

                {peekParticipant.breakdown.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-6 text-center">
                    No individual scores recorded for this candidate under the current program filter.
                  </p>
                ) : (
                  <div className="rounded-lg border border-border/50 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow className="text-xs">
                          <TableHead>Program</TableHead>
                          <TableHead className="text-center">Score</TableHead>
                          <TableHead className="text-center">Grade</TableHead>
                          <TableHead className="text-center">Rank</TableHead>
                          <TableHead className="text-right pr-4">Points</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="text-xs">
                        {peekParticipant.breakdown.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{item.programName}</TableCell>
                            <TableCell className="text-center font-mono">
                              {item.averageScore.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="text-[11px] py-0 h-5 font-bold">
                                {item.grade}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              {item.rank ? (
                                <span className="font-bold text-amber-500">
                                  {item.rank === 1 ? '🥇 1st' : item.rank === 2 ? '🥈 2nd' : '🥉 3rd'}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-foreground pr-4">
                              {item.totalProgramPoints.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <DialogFooter className="p-3 px-5 border-t border-border/40 shrink-0 bg-muted/20 flex flex-row items-center justify-between">
                <Button asChild size="sm" variant="outline" className="text-xs gap-1.5">
                  <Link href={`/admin/top-candidates/${peekParticipant.participantId}`}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open Full Profile & Scorecard
                  </Link>
                </Button>
                <DialogClose asChild>
                  <Button size="sm" variant="secondary" className="text-xs">
                    Close
                  </Button>
                </DialogClose>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
