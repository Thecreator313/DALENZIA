'use client';

import { useState, useMemo, useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCachedDoc, useSharedCollection, useAppSettings } from '@/context/firestore-cache';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Loader2,
  Search,
  ArrowRight,
  Trophy,
  Megaphone,
  CheckSquare,
  Crown,
  Medal,
  Download,
  FileSpreadsheet,
  Printer,
  Sparkles,
  BarChart3,
  Users,
  Award,
  Layers,
  TrendingUp,
  ExternalLink,
  Eye,
  RefreshCw,
  Flame,
  Star,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  PieChart as PieIcon,
  Shield,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { Program } from '@/app/admin/programs/page';
import type { Participant as BaseParticipant } from '@/app/teams/add-participants/page';
import type { Team as BaseTeam } from '@/app/admin/teams/page';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { AnimatedCounter } from '@/components/animated-counter';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
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

// Data types
type Team = BaseTeam & { leaderName?: string; startingChestNumber?: number };
type Assignment = { id: string; programId: string; studentId: string; teamId: string; status?: 'cancelled' };
type Score = { programId: string; assignmentId: string; judgeId: string; score: number };
type PointsSettings = {
  normalGradePoints: Record<string, number>;
  specialGradePoints: Record<string, Record<string, number>>;
  rankPoints: Record<string, number>;
};

type TopParticipant = {
  id: string;
  name: string;
  chestNumber: number;
  points: number;
};

export type EnhancedTeamResult = {
  teamId: string;
  teamName: string;
  leaderName: string;
  startingChestNumber?: number;
  totalPoints: number;
  gradePoints: number;
  rankPoints: number;
  individualPoints: number;
  groupPoints: number;
  onStagePoints: number;
  offStagePoints: number;
  firstCount: number;
  secondCount: number;
  thirdCount: number;
  totalMedals: number;
  gradeCounts: {
    'A+': number;
    'A': number;
    'B': number;
    'C': number;
  };
  totalParticipants: number;
  scoringParticipantsCount: number;
  topParticipants: TopParticipant[];
  rank: number;
  gapToLeader: number;
  percentageOfTotal: number;
};

type PublishedStandings = {
  results: {
    teamId: string;
    teamName: string;
    leaderName: string;
    totalPoints: number;
  }[];
  publishedAtResultCount: number;
  publishedAt: any;
};

const getGrade = (score: number) => {
  if (score >= 90) return 'A+';
  if (score >= 70) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  return 'No Grade';
};

const CHART_COLORS = [
  '#f59e0b', // Gold / Amber
  '#94a3b8', // Silver / Slate
  '#d97706', // Bronze / Orange-Amber
  '#6366f1', // Indigo
  '#ec4899', // Pink
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#8b5cf6', // Violet
];

export default function TeamMarksPage() {
  const { settings } = useAppSettings();
  const festName = settings?.festName || 'DALENZIA ARTS FEST';

  const { data: allPrograms, loading: progsLoading } = useSharedCollection<Program>('programs');
  const { data: participants, loading: studentsLoading } = useSharedCollection<BaseParticipant>('students');
  const { data: assignments, loading: assignmentsLoading } = useSharedCollection<Assignment>('assignments');
  const { data: scores, loading: scoresLoading } = useSharedCollection<Score & { id: string }>('scores');
  const { data: teams, loading: teamsLoading } = useSharedCollection<Team>('teams');
  const { data: users, loading: usersLoading } = useSharedCollection<{ id: string; name: string }>('users');
  const { data: pointsDoc, loading: pointsLoading } = useCachedDoc<PointsSettings>(
    'doc:points:gradeAndRankPoints',
    () => doc(db, 'points', 'gradeAndRankPoints')
  );
  const { data: publishedResults, loading: publishedLoading } = useSharedCollection<{ id: string }>('publishedResults');
  const { data: lastPublishedStandings } = useCachedDoc<PublishedStandings>(
    'doc:standings:team_marks',
    () => doc(db, 'standings', 'team_marks')
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState<'all' | 'top3' | 'top5'>('all');
  const [sortBy, setSortBy] = useState<'points' | 'name' | 'golds' | 'medals' | 'grades'>('points');
  const [isPublishing, setIsPublishing] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [previewTeam, setPreviewTeam] = useState<EnhancedTeamResult | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const publishedResultsCount = publishedResults.length;

  const loading =
    progsLoading ||
    studentsLoading ||
    assignmentsLoading ||
    scoresLoading ||
    teamsLoading ||
    usersLoading ||
    pointsLoading ||
    publishedLoading;

  // Process and calculate team results with comprehensive metrics
  const teamResults = useMemo<EnhancedTeamResult[]>(() => {
    if (loading) return [];

    const publishedPrograms = allPrograms.filter((p) => p.isPublished);
    const publishedProgramMap = new Map(publishedPrograms.map((p) => [p.id, p]));
    const userMap = new Map(users.map((u) => [u.id, u.name]));
    const pointsSettings: PointsSettings = pointsDoc || {
      normalGradePoints: {},
      specialGradePoints: {},
      rankPoints: {},
    };

    // Calculate average scores and ranks for each program
    const programScores: Record<string, { assignmentId: string; averageScore: number }[]> = {};
    for (const program of publishedPrograms) {
      const programAssignments = assignments.filter(
        (a) => a.programId === program.id && a.status !== 'cancelled'
      );
      const programScoresList = [];

      for (const assignment of programAssignments) {
        const assignmentScores = scores.filter((s) => s.assignmentId === assignment.id);
        if (assignmentScores.length > 0) {
          const totalScore = assignmentScores.reduce((sum, s) => sum + s.score, 0);
          const averageScore = totalScore / assignmentScores.length;
          programScoresList.push({ assignmentId: assignment.id, averageScore });
        }
      }
      programScoresList.sort((a, b) => b.averageScore - a.averageScore);
      programScores[program.id] = programScoresList;
    }

    // Calculate participant-level breakdown
    type ParticipantStats = {
      totalPoints: number;
      gradePoints: number;
      rankPoints: number;
      individualPoints: number;
      groupPoints: number;
      onStagePoints: number;
      offStagePoints: number;
      firstCount: number;
      secondCount: number;
      thirdCount: number;
      gradeCounts: { 'A+': number; 'A': number; 'B': number; 'C': number };
    };

    const participantStatsMap = new Map<string, ParticipantStats>();

    for (const participant of participants) {
      let participantTotal = 0;
      let participantGradePts = 0;
      let participantRankPts = 0;
      let participantIndivPts = 0;
      let participantGroupPts = 0;
      let participantOnStagePts = 0;
      let participantOffStagePts = 0;
      let pFirst = 0;
      let pSecond = 0;
      let pThird = 0;
      const pGrades = { 'A+': 0, 'A': 0, 'B': 0, 'C': 0 };

      const participantAssignments = assignments.filter(
        (a) => a.studentId === participant.id && a.status !== 'cancelled'
      );

      for (const assignment of participantAssignments) {
        const program = publishedProgramMap.get(assignment.programId);
        if (!program) continue;

        const scoresForProgram = programScores[program.id];
        const participantScoreData = scoresForProgram?.find(
          (s) => s.assignmentId === assignment.id
        );

        if (participantScoreData) {
          const { averageScore } = participantScoreData;
          const grade = getGrade(averageScore);

          const gradePoints =
            program.markType === 'special-mark'
              ? pointsSettings.specialGradePoints?.[program.id]?.[grade] || 0
              : pointsSettings.normalGradePoints?.[grade] || 0;

          if (grade in pGrades) {
            pGrades[grade as keyof typeof pGrades] += 1;
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
            rankPoints = pointsSettings.rankPoints?.['first'] || 0;
            pFirst += 1;
          } else if (rank === 2) {
            rankPoints = pointsSettings.rankPoints?.['second'] || 0;
            pSecond += 1;
          } else if (rank === 3) {
            rankPoints = pointsSettings.rankPoints?.['third'] || 0;
            pThird += 1;
          }

          const progTotal = gradePoints + rankPoints;
          participantTotal += progTotal;
          participantGradePts += gradePoints;
          participantRankPts += rankPoints;

          if (program.type === 'individual') {
            participantIndivPts += progTotal;
          } else {
            participantGroupPts += progTotal;
          }

          if (program.mode === 'on-stage') {
            participantOnStagePts += progTotal;
          } else {
            participantOffStagePts += progTotal;
          }
        }
      }

      participantStatsMap.set(participant.id, {
        totalPoints: participantTotal,
        gradePoints: participantGradePts,
        rankPoints: participantRankPts,
        individualPoints: participantIndivPts,
        groupPoints: participantGroupPts,
        onStagePoints: participantOnStagePts,
        offStagePoints: participantOffStagePts,
        firstCount: pFirst,
        secondCount: pSecond,
        thirdCount: pThird,
        gradeCounts: pGrades,
      });
    }

    // Total festival points across all teams
    let festivalTotalPoints = 0;

    // Aggregate by Team
    const rawResults = teams.map((team) => {
      let teamTotalPoints = 0;
      let teamGradePoints = 0;
      let teamRankPoints = 0;
      let teamIndivPoints = 0;
      let teamGroupPoints = 0;
      let teamOnStagePoints = 0;
      let teamOffStagePoints = 0;
      let firstCount = 0;
      let secondCount = 0;
      let thirdCount = 0;
      const gradeCounts = { 'A+': 0, 'A': 0, 'B': 0, 'C': 0 };

      const teamParticipants = participants.filter((p) => p.teamId === team.id);
      const participantPointsList: TopParticipant[] = [];

      teamParticipants.forEach((p) => {
        const stats = participantStatsMap.get(p.id);
        if (stats) {
          teamTotalPoints += stats.totalPoints;
          teamGradePoints += stats.gradePoints;
          teamRankPoints += stats.rankPoints;
          teamIndivPoints += stats.individualPoints;
          teamGroupPoints += stats.groupPoints;
          teamOnStagePoints += stats.onStagePoints;
          teamOffStagePoints += stats.offStagePoints;
          firstCount += stats.firstCount;
          secondCount += stats.secondCount;
          thirdCount += stats.thirdCount;
          gradeCounts['A+'] += stats.gradeCounts['A+'];
          gradeCounts['A'] += stats.gradeCounts['A'];
          gradeCounts['B'] += stats.gradeCounts['B'];
          gradeCounts['C'] += stats.gradeCounts['C'];

          if (stats.totalPoints > 0) {
            participantPointsList.push({
              id: p.id,
              name: p.name,
              chestNumber: p.chestNumber,
              points: stats.totalPoints,
            });
          }
        }
      });

      participantPointsList.sort((a, b) => b.points - a.points);
      festivalTotalPoints += teamTotalPoints;

      return {
        teamId: team.id,
        teamName: team.name,
        leaderName: userMap.get(team.leaderId) || 'N/A',
        startingChestNumber: team.startingChestNumber,
        totalPoints: teamTotalPoints,
        gradePoints: teamGradePoints,
        rankPoints: teamRankPoints,
        individualPoints: teamIndivPoints,
        groupPoints: teamGroupPoints,
        onStagePoints: teamOnStagePoints,
        offStagePoints: teamOffStagePoints,
        firstCount,
        secondCount,
        thirdCount,
        totalMedals: firstCount + secondCount + thirdCount,
        gradeCounts,
        totalParticipants: teamParticipants.length,
        scoringParticipantsCount: participantPointsList.length,
        topParticipants: participantPointsList.slice(0, 5),
        rank: 1,
        gapToLeader: 0,
        percentageOfTotal: 0,
      };
    });

    // Sort descending by total points
    rawResults.sort((a, b) => b.totalPoints - a.totalPoints);

    // Assign ranking & gap to leader
    const leaderScore = rawResults[0]?.totalPoints || 0;
    const runnerUpScore = rawResults[1]?.totalPoints || 0;

    let currentRank = 1;
    for (let i = 0; i < rawResults.length; i++) {
      if (i > 0 && rawResults[i].totalPoints < rawResults[i - 1].totalPoints) {
        currentRank = i + 1;
      }
      rawResults[i].rank = currentRank;

      if (i === 0) {
        // For #1, gap is margin of lead over runner up
        rawResults[i].gapToLeader = leaderScore - runnerUpScore;
      } else {
        // For others, gap is points behind #1
        rawResults[i].gapToLeader = leaderScore - rawResults[i].totalPoints;
      }

      rawResults[i].percentageOfTotal =
        festivalTotalPoints > 0 ? (rawResults[i].totalPoints / festivalTotalPoints) * 100 : 0;
    }

    return rawResults;
  }, [loading, allPrograms, participants, assignments, scores, teams, users, pointsDoc]);

  // Overall festival stats
  const festivalStats = useMemo(() => {
    const totalPoints = teamResults.reduce((acc, t) => acc + t.totalPoints, 0);
    const totalPublishedProgs = allPrograms.filter((p) => p.isPublished).length;
    const totalPrograms = allPrograms.length;
    const totalParticipantsCount = participants.length;
    const totalTeamsCount = teams.length;
    const leaderTeam = teamResults[0] || null;

    return {
      totalPoints,
      totalPublishedProgs,
      totalPrograms,
      progressPct: totalPrograms > 0 ? Math.round((totalPublishedProgs / totalPrograms) * 100) : 0,
      totalParticipantsCount,
      totalTeamsCount,
      leaderTeam,
    };
  }, [teamResults, allPrograms, participants, teams]);

  // Check if public standings are up to date
  const isUpToDate = useMemo(() => {
    if (!lastPublishedStandings) return false;
    return (lastPublishedStandings.publishedAtResultCount ?? 0) === publishedResultsCount;
  }, [lastPublishedStandings, publishedResultsCount]);

  const pendingUpdatesCount = useMemo(() => {
    const lastCount = lastPublishedStandings?.publishedAtResultCount ?? 0;
    return Math.max(0, publishedResultsCount - lastCount);
  }, [lastPublishedStandings, publishedResultsCount]);

  // Handle Publish action
  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      const standingsData: PublishedStandings = {
        results: teamResults.map((r) => ({
          teamId: r.teamId,
          teamName: r.teamName,
          leaderName: r.leaderName,
          totalPoints: r.totalPoints,
        })),
        publishedAtResultCount: publishedResultsCount,
        publishedAt: new Date(),
      };
      await setDoc(doc(db, 'standings', 'team_marks'), standingsData);
      toast({
        title: 'Standings Published!',
        description: `Successfully broadcasted standings to homepage for ${teamResults.length} teams.`,
      });
    } catch (e) {
      console.error(e);
      toast({
        title: 'Publish Failed',
        description: 'Failed to update team standings on the homepage.',
        variant: 'destructive',
      });
    } finally {
      setIsPublishing(false);
      setIsAlertOpen(false);
    }
  };

  // Filtered and Sorted results
  const filteredAndSortedResults = useMemo(() => {
    let result = teamResults.filter((r) => {
      const matchesSearch =
        searchTerm === '' ||
        r.teamName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.leaderName.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      if (tierFilter === 'top3') return r.rank <= 3;
      if (tierFilter === 'top5') return r.rank <= 5;
      return true;
    });

    result = [...result].sort((a, b) => {
      if (sortBy === 'name') return a.teamName.localeCompare(b.teamName);
      if (sortBy === 'golds') return b.firstCount - a.firstCount || b.totalPoints - a.totalPoints;
      if (sortBy === 'medals') return b.totalMedals - a.totalMedals || b.totalPoints - a.totalPoints;
      if (sortBy === 'grades') return b.gradePoints - a.gradePoints || b.totalPoints - a.totalPoints;
      return b.totalPoints - a.totalPoints;
    });

    return result;
  }, [teamResults, searchTerm, tierFilter, sortBy]);

  // Export to Excel
  const handleExportExcel = () => {
    try {
      const excelRows = teamResults.map((t) => ({
        'Rank': t.rank,
        'House / Team': t.teamName,
        'Team Leader': t.leaderName,
        'Total Participants': t.totalParticipants,
        'Active Scorers': t.scoringParticipantsCount,
        '1st Place (Gold)': t.firstCount,
        '2nd Place (Silver)': t.secondCount,
        '3rd Place (Bronze)': t.thirdCount,
        'Total Podiums': t.totalMedals,
        'A+ Grades': t.gradeCounts['A+'],
        'A Grades': t.gradeCounts['A'],
        'B Grades': t.gradeCounts['B'],
        'C Grades': t.gradeCounts['C'],
        'Grade Points': Number(t.gradePoints.toFixed(2)),
        'Position Points': Number(t.rankPoints.toFixed(2)),
        'Individual Points': Number(t.individualPoints.toFixed(2)),
        'Group Points': Number(t.groupPoints.toFixed(2)),
        'Total Points': Number(t.totalPoints.toFixed(2)),
        'Points Share (%)': Number(t.percentageOfTotal.toFixed(1)),
        'Margin / Gap': t.rank === 1 ? `Leader (+${t.gapToLeader.toFixed(2)})` : `-${t.gapToLeader.toFixed(2)} pts`,
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Team Standings');

      // Set column widths
      worksheet['!cols'] = [
        { wch: 6 },  // Rank
        { wch: 22 }, // House Team
        { wch: 20 }, // Leader
        { wch: 18 }, // Total Part
        { wch: 14 }, // Active Scorers
        { wch: 14 }, // 1st
        { wch: 14 }, // 2nd
        { wch: 14 }, // 3rd
        { wch: 14 }, // Podiums
        { wch: 10 }, // A+
        { wch: 10 }, // A
        { wch: 10 }, // B
        { wch: 10 }, // C
        { wch: 14 }, // Grade Pts
        { wch: 14 }, // Position Pts
        { wch: 16 }, // Indiv Pts
        { wch: 14 }, // Group Pts
        { wch: 14 }, // Total Pts
        { wch: 14 }, // Share
        { wch: 16 }, // Margin
      ];

      const dateStr = new Date().toISOString().split('T')[0];
      XLSX.writeFile(workbook, `${festName.toLowerCase().replace(/\s+/g, '-')}-team-standings-${dateStr}.xlsx`);

      toast({
        title: 'Excel Export Complete',
        description: 'Standings have been downloaded as an Excel spreadsheet.',
      });
    } catch (e) {
      console.error(e);
      toast({
        title: 'Export Failed',
        description: 'Could not generate Excel spreadsheet.',
        variant: 'destructive',
      });
    }
  };

  // Export to PDF
  const handleExportPDF = () => {
    setIsDownloadingPdf(true);
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = doc.internal.pageSize.getWidth();

      // Header Banner
      doc.setFillColor(15, 23, 42); // Slate 900
      doc.rect(0, 0, pageWidth, 28, 'F');

      // Title & Subtitle
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      doc.text(festName.toUpperCase(), 14, 12);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(203, 213, 225);
      doc.text('OFFICIAL TEAM MARKS & OVERALL CHAMPIONSHIP STANDINGS', 14, 19);

      const printDate = new Date().toLocaleString();
      doc.setFontSize(8);
      doc.text(`Generated: ${printDate} | Published Programs: ${festivalStats.totalPublishedProgs}/${festivalStats.totalPrograms}`, 14, 25);

      // Standings Table
      autoTable(doc, {
        startY: 34,
        head: [
          [
            'Rank',
            'House / Team Name',
            'Team Leader',
            '1st',
            '2nd',
            '3rd',
            'Grade Pts',
            'Rank Pts',
            'Total Pts',
          ],
        ],
        body: teamResults.map((t) => [
          `#${t.rank}`,
          t.teamName,
          t.leaderName,
          t.firstCount,
          t.secondCount,
          t.thirdCount,
          t.gradePoints.toFixed(2),
          t.rankPoints.toFixed(2),
          t.totalPoints.toFixed(2),
        ]),
        headStyles: {
          fillColor: [217, 119, 6], // Amber-600
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
        },
        bodyStyles: {
          fontSize: 9,
          cellPadding: 3,
        },
        columnStyles: {
          0: { halign: 'center', fontStyle: 'bold', cellWidth: 14 },
          1: { fontStyle: 'bold', cellWidth: 42 },
          2: { cellWidth: 38 },
          3: { halign: 'center', cellWidth: 12 },
          4: { halign: 'center', cellWidth: 12 },
          5: { halign: 'center', cellWidth: 12 },
          6: { halign: 'right', cellWidth: 20 },
          7: { halign: 'right', cellWidth: 20 },
          8: { halign: 'right', fontStyle: 'bold', cellWidth: 22 },
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
      });

      // Signature Section at bottom
      const finalY = (doc as any).lastAutoTable.finalY + 25;
      if (finalY < 270) {
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);

        // Convener
        doc.line(20, finalY, 65, finalY);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text('General Convener', 30, finalY + 5);

        // Chief Judge
        doc.line(85, finalY, 130, finalY);
        doc.text('Chief Judge', 98, finalY + 5);

        // Controller of Results
        doc.line(150, finalY, 195, finalY);
        doc.text('Scoring In-Charge', 160, finalY + 5);
      }

      const dateStr = new Date().toISOString().split('T')[0];
      doc.save(`${festName.toLowerCase().replace(/\s+/g, '-')}-team-standings-${dateStr}.pdf`);

      toast({
        title: 'PDF Downloaded',
        description: 'Official team marks report has been generated.',
      });
    } catch (e) {
      console.error(e);
      toast({
        title: 'PDF Generation Failed',
        description: 'Could not create PDF report.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Native Print
  const handlePrint = () => {
    window.print();
  };

  // Helper to format date
  const formatPublishedDate = (val: any) => {
    if (!val) return 'Never';
    if (val.toDate && typeof val.toDate === 'function') {
      return val.toDate().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    }
    if (val.seconds) {
      return new Date(val.seconds * 1000).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    }
    if (val instanceof Date) {
      return val.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    }
    try {
      return new Date(val).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return 'Unknown';
    }
  };

  // Top 3 Podium teams
  const podiumTop1 = teamResults[0] || null;
  const podiumTop2 = teamResults[1] || null;
  const podiumTop3 = teamResults[2] || null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh]">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-amber-500/20 blur-xl animate-pulse" />
          <Loader2 className="h-12 w-12 animate-spin text-amber-500 relative z-10" />
        </div>
        <p className="text-muted-foreground animate-pulse mt-4 font-medium">
          Compiling Real-time House Standings...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 relative min-h-screen p-1 pb-16">
      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 -z-10 h-full w-full bg-background overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-amber-500/5 blur-[130px]" />
        <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-orange-500/5 blur-[130px]" />
        <div className="absolute bottom-[-10%] left-[20%] w-[40%] h-[40%] rounded-full bg-indigo-500/5 blur-[140px]" />
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          .no-print, header, nav, aside {
            display: none !important;
          }
          .print-card {
            border: 1px solid #e2e8f0 !important;
            box-shadow: none !important;
            background: white !important;
            color: black !important;
          }
          .print-table th, .print-table td {
            color: black !important;
            border-color: #cbd5e1 !important;
          }
        }
      `}</style>

      {/* Top Header & Action Controls */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print"
      >
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-extrabold tracking-tight font-headline">Team Marks & Standings</h1>
            <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 font-semibold text-xs px-2.5 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping mr-1.5 inline-block" />
              Live Calculations
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Real-time championship leaderboard, score breakdowns, and public homepage sync.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="border-border/60 hover:bg-muted/60 transition-colors shadow-xs"
          >
            <Printer className="mr-1.5 h-4 w-4" />
            Print
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="border-border/60 hover:bg-muted/60 transition-colors shadow-xs"
          >
            <FileSpreadsheet className="mr-1.5 h-4 w-4 text-emerald-500" />
            Excel
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPDF}
            disabled={isDownloadingPdf}
            className="border-border/60 hover:bg-muted/60 transition-colors shadow-xs"
          >
            {isDownloadingPdf ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin text-amber-500" />
            ) : (
              <Download className="mr-1.5 h-4 w-4 text-amber-500" />
            )}
            PDF Report
          </Button>

          <Button
            onClick={() => setIsAlertOpen(true)}
            disabled={isPublishing}
            className="bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-md shadow-amber-500/20 font-semibold"
          >
            {isPublishing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Megaphone className="mr-2 h-4 w-4" />
            )}
            Publish Current Standings
          </Button>
        </div>
      </motion.div>

      {/* Sync Status Banner */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="no-print"
      >
        <Card className={`border overflow-hidden transition-all duration-300 ${
          isUpToDate
            ? 'border-emerald-500/20 bg-emerald-500/5'
            : 'border-amber-500/30 bg-amber-500/10'
        }`}>
          <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start md:items-center gap-3">
              <div className={`p-2.5 rounded-xl shrink-0 ${
                isUpToDate ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/20 text-amber-500'
              }`}>
                {isUpToDate ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <Flame className="h-5 w-5 animate-pulse" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm">
                    {isUpToDate
                      ? 'Homepage Standings Are Fully Synced'
                      : `${pendingUpdatesCount} New Published Result(s) Ready to Broadcast`}
                  </h3>
                  <Badge variant="secondary" className="text-[11px] font-mono">
                    Results Synced: {lastPublishedStandings?.publishedAtResultCount ?? 0} / {publishedResultsCount}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isUpToDate
                    ? `Public homepage is currently displaying standings as of ${formatPublishedDate(lastPublishedStandings?.publishedAt)}.`
                    : 'The live calculations below include newly finalized programs that are not yet visible to the public.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-center shrink-0">
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                <Link href="/" target="_blank">
                  Preview Public Homepage <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>

              {!isUpToDate && (
                <Button
                  size="sm"
                  onClick={() => setIsAlertOpen(true)}
                  disabled={isPublishing}
                  className="bg-amber-500 text-white hover:bg-amber-600 shadow-sm text-xs font-semibold"
                >
                  Sync Now
                </Button>
              )}
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Key Metric KPI Cards */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 no-print"
      >
        {/* Championship Leader */}
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm relative overflow-hidden group hover:border-amber-500/40 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-all pointer-events-none" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium">Championship Leader</CardDescription>
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                <Crown className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-xl font-bold truncate mt-1">
              {festivalStats.leaderTeam ? festivalStats.leaderTeam.teamName : 'No Teams'}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-black font-mono text-amber-500">
                {festivalStats.leaderTeam ? (
                  <span>{festivalStats.leaderTeam.totalPoints.toFixed(2)} <span className="text-xs font-normal text-muted-foreground font-sans">pts</span></span>
                ) : (
                  '0.00'
                )}
              </div>
              {festivalStats.leaderTeam && festivalStats.leaderTeam.gapToLeader > 0 && (
                <Badge variant="outline" className="text-[11px] font-mono text-emerald-500 border-emerald-500/20 bg-emerald-500/5">
                  +{festivalStats.leaderTeam.gapToLeader.toFixed(1)} lead
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              Leader: {festivalStats.leaderTeam?.leaderName || 'N/A'}
            </p>
          </CardContent>
        </Card>

        {/* Total Points Awarded */}
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm relative overflow-hidden group hover:border-indigo-500/40 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl group-hover:bg-indigo-500/20 transition-all pointer-events-none" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium">Total Festival Points</CardDescription>
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                <Trophy className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black font-mono mt-1">
              <AnimatedCounter value={Math.round(festivalStats.totalPoints)} />
              <span className="text-xs font-normal text-muted-foreground font-sans ml-1">pts</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              Avg per team:{' '}
              <span className="font-semibold text-foreground font-mono">
                {festivalStats.totalTeamsCount > 0
                  ? (festivalStats.totalPoints / festivalStats.totalTeamsCount).toFixed(1)
                  : 0}
              </span>{' '}
              pts
            </p>
            <div className="mt-2.5 h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: '100%' }} />
            </div>
          </CardContent>
        </Card>

        {/* Results Published Progress */}
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm relative overflow-hidden group hover:border-blue-500/40 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-xl group-hover:bg-blue-500/20 transition-all pointer-events-none" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium">Published Programs</CardDescription>
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                <CheckSquare className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black font-mono mt-1">
              {festivalStats.totalPublishedProgs}{' '}
              <span className="text-sm font-normal text-muted-foreground">
                / {festivalStats.totalPrograms}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>Progress</span>
              <span className="font-semibold text-foreground font-mono">{festivalStats.progressPct}%</span>
            </div>
            <Progress value={festivalStats.progressPct} className="h-1.5" />
          </CardContent>
        </Card>

        {/* Competing Teams & Students */}
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm relative overflow-hidden group hover:border-emerald-500/40 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-all pointer-events-none" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium">Houses & Contenders</CardDescription>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black font-mono mt-1">
              {festivalStats.totalTeamsCount}{' '}
              <span className="text-sm font-normal text-muted-foreground">Houses</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground font-mono">{festivalStats.totalParticipantsCount}</span>{' '}
              registered participants
            </p>
            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Shield className="h-3.5 w-3.5 text-emerald-500" />
              <span>Full roster actively competing</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Championship Podium (Top 3 Showcase) */}
      {teamResults.length >= 2 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="no-print"
        >
          <Card className="border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden relative">
            <div className="p-5 border-b border-border/40 bg-muted/20 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  Championship Podium
                </h3>
                <p className="text-xs text-muted-foreground">
                  Current top 3 contenders leading the festival standings.
                </p>
              </div>
              <Badge variant="outline" className="border-amber-500/30 text-amber-500 bg-amber-500/5">
                Top 3 Houses
              </Badge>
            </div>

            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                {/* 2nd Place - Silver (Left) */}
                {podiumTop2 && (
                  <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="order-2 md:order-1 flex flex-col items-center"
                  >
                    <div className="w-full rounded-2xl border border-slate-300/30 dark:border-slate-700/60 bg-gradient-to-b from-slate-500/10 via-background to-background p-5 text-center relative group hover:border-slate-400/50 transition-all shadow-sm">
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center justify-center h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold border-2 border-background shadow-md">
                        2
                      </div>

                      <div className="mt-2 flex justify-center mb-2">
                        <div className="p-2.5 rounded-full bg-slate-300/20 text-slate-400">
                          <Medal className="h-6 w-6" />
                        </div>
                      </div>

                      <h4 className="font-bold text-base truncate" title={podiumTop2.teamName}>
                        {podiumTop2.teamName}
                      </h4>
                      <p className="text-xs text-muted-foreground truncate mb-3">
                        Lead: {podiumTop2.leaderName}
                      </p>

                      <div className="py-2 px-3 rounded-xl bg-muted/40 border border-border/40 inline-block w-full mb-3">
                        <span className="text-2xl font-black font-mono text-foreground">
                          {podiumTop2.totalPoints.toFixed(2)}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">pts</span>
                        <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                          -{podiumTop2.gapToLeader.toFixed(2)} behind #1
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mb-4">
                        <span className="inline-flex items-center gap-0.5">🥇 {podiumTop2.firstCount}</span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-0.5">🥈 {podiumTop2.secondCount}</span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-0.5">🥉 {podiumTop2.thirdCount}</span>
                      </div>

                      <Button asChild variant="outline" size="sm" className="w-full text-xs rounded-xl">
                        <Link href={`/admin/team-marks/${podiumTop2.teamId}`}>
                          View Details <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* 1st Place - Gold (Center & Elevated) */}
                {podiumTop1 && (
                  <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="order-1 md:order-2 flex flex-col items-center"
                  >
                    <div className="w-full rounded-2xl border-2 border-amber-500/50 bg-gradient-to-b from-amber-500/15 via-background to-background p-6 text-center relative group hover:border-amber-500 transition-all shadow-lg shadow-amber-500/10">
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 flex items-center justify-center h-10 w-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white font-extrabold border-2 border-background shadow-lg">
                        <Crown className="h-5 w-5" />
                      </div>

                      <div className="mt-3 flex justify-center mb-2">
                        <div className="p-3 rounded-full bg-amber-500/20 text-amber-500 shadow-inner">
                          <Trophy className="h-8 w-8" />
                        </div>
                      </div>

                      <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                        Championship Leader
                      </Badge>

                      <h4 className="font-extrabold text-lg truncate" title={podiumTop1.teamName}>
                        {podiumTop1.teamName}
                      </h4>
                      <p className="text-xs text-muted-foreground truncate mb-3">
                        Lead: {podiumTop1.leaderName}
                      </p>

                      <div className="py-2.5 px-4 rounded-xl bg-amber-500/10 border border-amber-500/30 inline-block w-full mb-3">
                        <span className="text-3xl font-black font-mono text-amber-500">
                          {podiumTop1.totalPoints.toFixed(2)}
                        </span>
                        <span className="text-xs text-amber-500/80 ml-1">pts</span>
                        <div className="text-[11px] font-mono text-emerald-500 font-semibold mt-0.5">
                          +{podiumTop1.gapToLeader.toFixed(2)} pts lead over #2
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mb-4 font-medium">
                        <span className="inline-flex items-center gap-0.5 text-amber-500 font-bold">🥇 {podiumTop1.firstCount}</span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-0.5">🥈 {podiumTop1.secondCount}</span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-0.5">🥉 {podiumTop1.thirdCount}</span>
                        <span>•</span>
                        <span className="text-muted-foreground">{podiumTop1.totalMedals} Podiums</span>
                      </div>

                      <Button asChild size="sm" className="w-full text-xs font-semibold rounded-xl bg-amber-500 text-white hover:bg-amber-600 shadow-sm">
                        <Link href={`/admin/team-marks/${podiumTop1.teamId}`}>
                          View Champion House <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* 3rd Place - Bronze (Right) */}
                {podiumTop3 && (
                  <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="order-3 flex flex-col items-center"
                  >
                    <div className="w-full rounded-2xl border border-amber-700/30 dark:border-amber-800/50 bg-gradient-to-b from-amber-700/10 via-background to-background p-5 text-center relative group hover:border-amber-600/50 transition-all shadow-sm">
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center justify-center h-8 w-8 rounded-full bg-amber-700 text-white font-bold border-2 border-background shadow-md">
                        3
                      </div>

                      <div className="mt-2 flex justify-center mb-2">
                        <div className="p-2.5 rounded-full bg-amber-700/20 text-amber-600">
                          <Medal className="h-6 w-6" />
                        </div>
                      </div>

                      <h4 className="font-bold text-base truncate" title={podiumTop3.teamName}>
                        {podiumTop3.teamName}
                      </h4>
                      <p className="text-xs text-muted-foreground truncate mb-3">
                        Lead: {podiumTop3.leaderName}
                      </p>

                      <div className="py-2 px-3 rounded-xl bg-muted/40 border border-border/40 inline-block w-full mb-3">
                        <span className="text-2xl font-black font-mono text-foreground">
                          {podiumTop3.totalPoints.toFixed(2)}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">pts</span>
                        <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                          -{podiumTop3.gapToLeader.toFixed(2)} behind #1
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mb-4">
                        <span className="inline-flex items-center gap-0.5">🥇 {podiumTop3.firstCount}</span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-0.5">🥈 {podiumTop3.secondCount}</span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-0.5">🥉 {podiumTop3.thirdCount}</span>
                      </div>

                      <Button asChild variant="outline" size="sm" className="w-full text-xs rounded-xl">
                        <Link href={`/admin/team-marks/${podiumTop3.teamId}`}>
                          View Details <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </motion.div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Main Content Tabs: Leaderboard Table, Analytics Charts, Team Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Tabs defaultValue="leaderboard" className="w-full space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
            <TabsList className="bg-muted/40 p-1 border border-border/50">
              <TabsTrigger value="leaderboard" className="gap-2 text-xs sm:text-sm">
                <Trophy className="h-4 w-4" />
                Standings Table
              </TabsTrigger>
              <TabsTrigger value="analytics" className="gap-2 text-xs sm:text-sm">
                <BarChart3 className="h-4 w-4" />
                Score Analytics
              </TabsTrigger>
              <TabsTrigger value="cards" className="gap-2 text-xs sm:text-sm">
                <Layers className="h-4 w-4" />
                House Cards
              </TabsTrigger>
            </TabsList>

            {/* Quick Summary Pill */}
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span>Showing {filteredAndSortedResults.length} of {teamResults.length} houses</span>
            </div>
          </div>

          {/* TAB 1: STANDINGS LEADERBOARD TABLE */}
          <TabsContent value="leaderboard" className="space-y-4">
            <Card className="border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden print-card">
              {/* Filter & Search Bar */}
              <CardHeader className="border-b border-border/40 bg-muted/20 pb-4 no-print">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-amber-500" />
                      Live Standings Leaderboard
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Official house rankings based on all completed and published programs.
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Search */}
                    <div className="relative w-full sm:w-60">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search team or leader..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-9 text-xs bg-background/50 border-border/50 focus:bg-background transition-colors rounded-xl"
                      />
                    </div>

                    {/* Filter Tier */}
                    <Select value={tierFilter} onValueChange={(val: any) => setTierFilter(val)}>
                      <SelectTrigger className="w-[125px] h-9 text-xs rounded-xl bg-background/50 border-border/50">
                        <SelectValue placeholder="Tier Filter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Houses</SelectItem>
                        <SelectItem value="top3">Top 3 Only</SelectItem>
                        <SelectItem value="top5">Top 5 Only</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Sort Order */}
                    <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                      <SelectTrigger className="w-[145px] h-9 text-xs rounded-xl bg-background/50 border-border/50">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="points">Total Points</SelectItem>
                        <SelectItem value="golds">Most 1st (Golds)</SelectItem>
                        <SelectItem value="medals">Total Medals</SelectItem>
                        <SelectItem value="grades">Grade Points</SelectItem>
                        <SelectItem value="name">House Name (A-Z)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>

              {/* Table */}
              <CardContent className="p-0">
                <Table className="print-table">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border/40">
                      <TableHead className="w-[85px] text-center">Rank</TableHead>
                      <TableHead>House / Team</TableHead>
                      <TableHead className="hidden md:table-cell">Team Leader</TableHead>
                      <TableHead className="hidden lg:table-cell text-center">Medals</TableHead>
                      <TableHead className="hidden sm:table-cell text-right">Grade Pts</TableHead>
                      <TableHead className="hidden sm:table-cell text-right">Position Pts</TableHead>
                      <TableHead className="text-right">Total Points</TableHead>
                      <TableHead className="w-[150px] text-right no-print">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence>
                      {filteredAndSortedResults.map((result, index) => {
                        const isFirst = result.rank === 1;
                        const isSecond = result.rank === 2;
                        const isThird = result.rank === 3;

                        return (
                          <motion.tr
                            key={result.teamId}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.03 }}
                            className={`border-b border-border/40 hover:bg-muted/30 transition-colors group ${
                              isFirst ? 'bg-amber-500/5' : ''
                            }`}
                          >
                            {/* Rank */}
                            <TableCell className="text-center font-bold">
                              <div className="flex items-center justify-center">
                                <div
                                  className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold ${
                                    isFirst
                                      ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm'
                                      : isSecond
                                      ? 'bg-gradient-to-br from-slate-300 to-slate-500 text-white shadow-sm'
                                      : isThird
                                      ? 'bg-gradient-to-br from-amber-600 to-amber-800 text-white shadow-sm'
                                      : 'bg-muted text-muted-foreground font-mono'
                                  }`}
                                >
                                  {isFirst ? (
                                    <Crown className="h-4 w-4" />
                                  ) : isSecond || isThird ? (
                                    <Medal className="h-4 w-4" />
                                  ) : (
                                    `#${result.rank}`
                                  )}
                                </div>
                              </div>
                            </TableCell>

                            {/* Team Name */}
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8 border border-border/60">
                                  <AvatarFallback className="text-xs font-bold bg-muted">
                                    {result.teamName.charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="font-semibold text-sm hover:text-amber-500 transition-colors">
                                    <Link href={`/admin/team-marks/${result.teamId}`}>
                                      {result.teamName}
                                    </Link>
                                  </div>
                                  <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                                    <span className="md:hidden">Lead: {result.leaderName} •</span>
                                    <span>{result.totalParticipants} Contenders</span>
                                  </div>
                                </div>
                              </div>
                            </TableCell>

                            {/* Team Leader (Desktop) */}
                            <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                              {result.leaderName}
                            </TableCell>

                            {/* Medals Tally (Gold, Silver, Bronze) */}
                            <TableCell className="hidden lg:table-cell text-center">
                              <div className="flex items-center justify-center gap-2 text-xs font-mono font-medium">
                                <span className="inline-flex items-center gap-0.5 text-amber-500 font-bold" title="1st Place (Gold)">
                                  🥇 {result.firstCount}
                                </span>
                                <span className="text-muted-foreground/40">/</span>
                                <span className="inline-flex items-center gap-0.5 text-slate-400 font-bold" title="2nd Place (Silver)">
                                  🥈 {result.secondCount}
                                </span>
                                <span className="text-muted-foreground/40">/</span>
                                <span className="inline-flex items-center gap-0.5 text-amber-700 font-bold" title="3rd Place (Bronze)">
                                  🥉 {result.thirdCount}
                                </span>
                              </div>
                            </TableCell>

                            {/* Grade Points */}
                            <TableCell className="hidden sm:table-cell text-right font-mono text-sm text-muted-foreground">
                              {result.gradePoints.toFixed(2)}
                            </TableCell>

                            {/* Position Points */}
                            <TableCell className="hidden sm:table-cell text-right font-mono text-sm text-muted-foreground">
                              {result.rankPoints.toFixed(2)}
                            </TableCell>

                            {/* Total Points */}
                            <TableCell className="text-right">
                              <div className="font-mono font-black text-base text-foreground">
                                {result.totalPoints.toFixed(2)}
                              </div>
                              <div className="text-[10px] text-muted-foreground font-mono">
                                {isFirst ? (
                                  <span className="text-emerald-500 font-semibold">Leader</span>
                                ) : (
                                  `-${result.gapToLeader.toFixed(1)} pts`
                                )}
                              </div>
                            </TableCell>

                            {/* Actions */}
                            <TableCell className="text-right no-print">
                              <div className="flex items-center justify-end gap-1.5">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-lg"
                                        onClick={() => setPreviewTeam(result)}
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">Quick Preview</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>

                                <Button
                                  asChild
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-2.5 text-xs rounded-lg border-border/60 hover:bg-amber-500/10 hover:text-amber-500 hover:border-amber-500/30 transition-colors"
                                >
                                  <Link href={`/admin/team-marks/${result.teamId}`}>
                                    Report <ChevronRight className="ml-1 h-3.5 w-3.5" />
                                  </Link>
                                </Button>
                              </div>
                            </TableCell>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>

                    {filteredAndSortedResults.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                          <Trophy className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p className="font-medium text-sm">No house teams found.</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Try adjusting your search query or filters.
                          </p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>

              {/* Table Footer Summary */}
              <CardFooter className="border-t border-border/40 bg-muted/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-4">
                  <span>
                    Total Points Distributed:{' '}
                    <strong className="text-foreground font-mono font-bold">
                      {festivalStats.totalPoints.toFixed(2)}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Published Programs:{' '}
                    <strong className="text-foreground font-mono font-bold">
                      {festivalStats.totalPublishedProgs}
                    </strong>
                  </span>
                </div>
                <div className="text-[11px]">
                  Click on any house name or 'Report' to inspect the detailed participant breakdown.
                </div>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* TAB 2: SCORE ANALYTICS & CHARTS */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Chart 1: Points Comparison (Stacked Grade vs Position) */}
              <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-amber-500" />
                    Points Composition by House
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Grade points (A+, A, B, C) stacked with Position points (1st, 2nd, 3rd places).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[320px] w-full">
                    {isMounted ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={teamResults}
                          margin={{ top: 20, right: 30, left: 0, bottom: 25 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                          <XAxis
                            dataKey="teamName"
                            tick={{ fontSize: 11 }}
                            interval={0}
                            angle={-15}
                            textAnchor="end"
                          />
                          <YAxis tick={{ fontSize: 11 }} />
                          <RechartsTooltip
                            contentStyle={{
                              backgroundColor: 'rgba(15, 23, 42, 0.95)',
                              borderColor: 'rgba(255, 255, 255, 0.1)',
                              borderRadius: '0.75rem',
                              color: '#fff',
                              fontSize: '12px',
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                          <Bar dataKey="gradePoints" name="Grade Points" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="rankPoints" name="Position Points" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Chart 2: Total Points Share (Donut / Pie) */}
              <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <PieIcon className="h-4 w-4 text-indigo-500" />
                    Championship Share Distribution
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Percentage share of total festival points accumulated by each house.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[320px] w-full flex items-center justify-center">
                    {isMounted ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={teamResults}
                            dataKey="totalPoints"
                            nameKey="teamName"
                            cx="50%"
                            cy="50%"
                            innerRadius={65}
                            outerRadius={105}
                            paddingAngle={3}
                            label={({ teamName, percentageOfTotal }) =>
                              `${teamName} (${percentageOfTotal.toFixed(1)}%)`
                            }
                          >
                            {teamResults.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={CHART_COLORS[index % CHART_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            formatter={(value: any) => [`${Number(value).toFixed(2)} pts`, 'Total Points']}
                            contentStyle={{
                              backgroundColor: 'rgba(15, 23, 42, 0.95)',
                              borderColor: 'rgba(255, 255, 255, 0.1)',
                              borderRadius: '0.75rem',
                              color: '#fff',
                              fontSize: '12px',
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Program Type Split Comparison */}
            <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  Individual vs Group Program Contributions
                </CardTitle>
                <CardDescription className="text-xs">
                  Breakdown of points earned through solo events versus collective group performances.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {teamResults.map((team, idx) => {
                    const indivPct =
                      team.totalPoints > 0
                        ? Math.round((team.individualPoints / team.totalPoints) * 100)
                        : 0;
                    const groupPct =
                      team.totalPoints > 0
                        ? Math.round((team.groupPoints / team.totalPoints) * 100)
                        : 0;

                    return (
                      <div
                        key={team.teamId}
                        className="p-4 rounded-xl border border-border/40 bg-muted/20 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm truncate">{team.teamName}</span>
                          <Badge variant="outline" className="text-[10px] font-mono">
                            #{idx + 1}
                          </Badge>
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                            <span>Individual ({indivPct}%)</span>
                            <span className="font-mono">{team.individualPoints.toFixed(1)} pts</span>
                          </div>
                          <Progress value={indivPct} className="h-1.5 bg-muted" />
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                            <span>Group ({groupPct}%)</span>
                            <span className="font-mono">{team.groupPoints.toFixed(1)} pts</span>
                          </div>
                          <Progress value={groupPct} className="h-1.5 bg-muted" />
                        </div>

                        <div className="pt-2 border-t border-border/30 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>Podiums won:</span>
                          <span className="font-bold text-foreground">
                            🥇 {team.firstCount} • 🥈 {team.secondCount} • 🥉 {team.thirdCount}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: TEAM CARDS GRID */}
          <TabsContent value="cards" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {teamResults.map((team) => {
                const isLeader = team.rank === 1;
                const topScore = teamResults[0]?.totalPoints || 1;
                const relativePct = Math.round((team.totalPoints / topScore) * 100);

                return (
                  <Card
                    key={team.teamId}
                    className={`border transition-all duration-200 overflow-hidden group hover:-translate-y-1 hover:shadow-md ${
                      isLeader
                        ? 'border-amber-500/40 bg-gradient-to-b from-amber-500/10 via-card to-card'
                        : 'border-border/50 bg-card/40'
                    }`}
                  >
                    <CardHeader className="pb-3 border-b border-border/30">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-xl font-bold text-sm ${
                              team.rank === 1
                                ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm'
                                : team.rank === 2
                                ? 'bg-gradient-to-br from-slate-300 to-slate-500 text-white shadow-sm'
                                : team.rank === 3
                                ? 'bg-gradient-to-br from-amber-600 to-amber-800 text-white shadow-sm'
                                : 'bg-muted text-muted-foreground font-mono'
                            }`}
                          >
                            {team.rank === 1 ? (
                              <Crown className="h-5 w-5" />
                            ) : team.rank <= 3 ? (
                              <Medal className="h-5 w-5" />
                            ) : (
                              `#${team.rank}`
                            )}
                          </div>
                          <div>
                            <CardTitle className="text-base truncate group-hover:text-amber-500 transition-colors">
                              {team.teamName}
                            </CardTitle>
                            <CardDescription className="text-xs truncate">
                              Leader: {team.leaderName}
                            </CardDescription>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xl font-black font-mono text-foreground">
                            {team.totalPoints.toFixed(1)}
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">pts</span>
                        </div>
                      </div>

                      {/* Relative Score Progress Bar */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                          <span>Championship Index</span>
                          <span className="font-mono font-semibold">{relativePct}% of lead</span>
                        </div>
                        <Progress value={relativePct} className="h-1.5" />
                      </div>
                    </CardHeader>

                    <CardContent className="p-4 space-y-3.5">
                      {/* Medals & Grades Pill Badges */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <Badge variant="outline" className="border-amber-500/30 text-amber-500 bg-amber-500/5">
                          🥇 {team.firstCount} Gold
                        </Badge>
                        <Badge variant="outline" className="border-slate-400/30 text-slate-400 bg-slate-500/5">
                          🥈 {team.secondCount} Silver
                        </Badge>
                        <Badge variant="outline" className="border-amber-700/30 text-amber-700 bg-amber-700/5">
                          🥉 {team.thirdCount} Bronze
                        </Badge>
                        <Badge variant="secondary" className="text-[11px] font-mono">
                          A+: {team.gradeCounts['A+']} | A: {team.gradeCounts['A']}
                        </Badge>
                      </div>

                      {/* Top Scorers Preview */}
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                          Top Scorers
                        </p>
                        {team.topParticipants.length > 0 ? (
                          <div className="space-y-1.5">
                            {team.topParticipants.slice(0, 3).map((p) => (
                              <div
                                key={p.id}
                                className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-muted/30"
                              >
                                <span className="truncate max-w-[170px]">{p.name}</span>
                                <span className="font-mono font-bold text-foreground shrink-0">
                                  {p.points.toFixed(1)} pts
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">
                            No scored participants yet.
                          </p>
                        )}
                      </div>
                    </CardContent>

                    <CardFooter className="p-4 pt-0 border-t border-border/30 bg-muted/10 flex items-center justify-between gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground hover:text-foreground h-8"
                        onClick={() => setPreviewTeam(team)}
                      >
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        Quick View
                      </Button>

                      <Button
                        asChild
                        variant="default"
                        size="sm"
                        className="text-xs h-8 rounded-lg bg-primary hover:bg-primary/90 font-medium"
                      >
                        <Link href={`/admin/team-marks/${team.teamId}`}>
                          Full Report <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* QUICK PREVIEW DIALOG */}
      <Dialog open={!!previewTeam} onOpenChange={(open) => !open && setPreviewTeam(null)}>
        <DialogContent className="max-w-md bg-background/95 backdrop-blur-xl border-border/50">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl font-bold text-sm ${
                  previewTeam?.rank === 1
                    ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white'
                    : 'bg-muted text-muted-foreground font-mono'
                }`}
              >
                {previewTeam?.rank === 1 ? <Crown className="h-5 w-5" /> : `#${previewTeam?.rank}`}
              </div>
              <div>
                <DialogTitle className="text-lg">{previewTeam?.teamName}</DialogTitle>
                <DialogDescription className="text-xs">
                  Leader: {previewTeam?.leaderName} • {previewTeam?.totalParticipants} Registered Contenders
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {previewTeam && (
            <div className="space-y-4 py-2">
              {/* Score Highlight Box */}
              <div className="p-4 rounded-xl bg-muted/30 border border-border/40 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Overall Festival Score</p>
                  <p className="text-3xl font-black font-mono text-amber-500 mt-0.5">
                    {previewTeam.totalPoints.toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className="font-mono text-xs">
                    {previewTeam.rank === 1 ? 'Championship Leader' : `-${previewTeam.gapToLeader.toFixed(2)} pts`}
                  </Badge>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {previewTeam.percentageOfTotal.toFixed(1)}% of all points
                  </p>
                </div>
              </div>

              {/* Point Type Breakdown */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg border border-border/40 bg-muted/20">
                  <span className="text-muted-foreground">Grade Points:</span>
                  <p className="font-mono font-bold text-foreground text-sm mt-0.5">
                    {previewTeam.gradePoints.toFixed(2)}
                  </p>
                </div>
                <div className="p-2.5 rounded-lg border border-border/40 bg-muted/20">
                  <span className="text-muted-foreground">Position Points:</span>
                  <p className="font-mono font-bold text-foreground text-sm mt-0.5">
                    {previewTeam.rankPoints.toFixed(2)}
                  </p>
                </div>
                <div className="p-2.5 rounded-lg border border-border/40 bg-muted/20">
                  <span className="text-muted-foreground">Individual:</span>
                  <p className="font-mono font-bold text-foreground text-sm mt-0.5">
                    {previewTeam.individualPoints.toFixed(2)}
                  </p>
                </div>
                <div className="p-2.5 rounded-lg border border-border/40 bg-muted/20">
                  <span className="text-muted-foreground">Group Events:</span>
                  <p className="font-mono font-bold text-foreground text-sm mt-0.5">
                    {previewTeam.groupPoints.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Medals & Grades Banner */}
              <div className="p-3 rounded-lg border border-border/40 bg-muted/20 flex items-center justify-around text-center text-xs">
                <div>
                  <span className="text-amber-500 font-bold block text-sm">🥇 {previewTeam.firstCount}</span>
                  <span className="text-[10px] text-muted-foreground">1st Place</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block text-sm">🥈 {previewTeam.secondCount}</span>
                  <span className="text-[10px] text-muted-foreground">2nd Place</span>
                </div>
                <div>
                  <span className="text-amber-700 font-bold block text-sm">🥉 {previewTeam.thirdCount}</span>
                  <span className="text-[10px] text-muted-foreground">3rd Place</span>
                </div>
                <div className="border-l border-border/50 pl-3">
                  <span className="font-bold text-foreground block text-sm">{previewTeam.gradeCounts['A+']}</span>
                  <span className="text-[10px] text-muted-foreground">A+ Grades</span>
                </div>
              </div>

              {/* Top Scorers */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Top Point Contributors
                </p>
                {previewTeam.topParticipants.length > 0 ? (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {previewTeam.topParticipants.map((p, i) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg bg-muted/40 border border-border/30"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground font-mono text-[10px]">#{i + 1}</span>
                          <span className="font-medium">{p.name}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            (Chest: {p.chestNumber})
                          </span>
                        </div>
                        <span className="font-mono font-bold text-foreground">
                          {p.points.toFixed(2)} pts
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    No participants have scored points from published programs yet.
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="mt-2">
            <Button
              asChild
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold"
            >
              <Link href={`/admin/team-marks/${previewTeam?.teamId}`}>
                Open Complete House Breakdown <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CONFIRMATION PUBLISH DIALOG */}
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent className="bg-background/95 backdrop-blur-xl border-border/50">
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-amber-500">
              <Megaphone className="h-5 w-5" />
              <AlertDialogTitle>Broadcast Standings to Homepage?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="space-y-3 pt-2 text-sm text-foreground/80">
              <p>
                This action will update the public live standings on the homepage with the current
                scores calculated from all <strong>{publishedResultsCount} finalized programs</strong>.
              </p>
              <div className="p-3 rounded-xl bg-muted/40 border border-border/40 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Leader:</span>
                  <strong className="text-amber-500">{festivalStats.leaderTeam?.teamName}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Points Distributed:</span>
                  <span className="font-mono font-bold">{festivalStats.totalPoints.toFixed(2)} pts</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Houses Included:</span>
                  <span>{teamResults.length} Houses</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                All festival visitors on the homepage will immediately see the updated leaderboard.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPublishing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePublish}
              disabled={isPublishing}
              className="bg-amber-500 hover:bg-amber-600 text-white font-semibold"
            >
              {isPublishing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Publishing...
                </>
              ) : (
                'Yes, Publish Live'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
