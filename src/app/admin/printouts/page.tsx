'use client';

import { useState, useMemo, useCallback } from 'react';
import { doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAppSettings, useCachedDoc, useSharedCollection } from '@/context/firestore-cache';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  Download,
  Users,
  List,
  Trophy,
  Star,
  Search,
  Award,
  Printer,
  FileSpreadsheet,
  Tv,
  CheckCircle2,
  Sparkles,
  Layers,
  FileText,
  Clock,
  Eye,
  Check,
  ChevronRight,
  Shield,
  FileDown,
  ExternalLink,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { toast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

import type { Program as BaseProgram } from '@/app/admin/programs/page';
import type { Participant as BaseParticipant } from '@/app/teams/add-participants/page';
import type { Team as BaseTeam } from '@/app/admin/teams/page';
import type { Category } from '@/app/admin/categories/page';
import type { Stage } from '@/app/admin/stage-central/page';

// Data types
type Program = BaseProgram & { categoryName?: string };
type Participant = BaseParticipant & { categoryName: string; teamName: string };
type Team = BaseTeam & { leaderName?: string };
type Assignment = { id: string; programId: string; studentId: string; teamId: string; status?: 'cancelled' };
type Score = { programId: string; assignmentId: string; judgeId: string; score: number };
type PointsSettings = {
  normalGradePoints: Record<string, number>;
  specialGradePoints: Record<string, Record<string, number>>;
  rankPoints: Record<string, number>;
};

type ProgramFilter = 'all' | 'individual' | 'group' | 'specific' | 'individual-specific' | 'group-specific';

const getGrade = (score: number) => {
  if (score >= 90) return 'A+';
  if (score >= 70) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  return 'No Grade';
};

export default function PrintoutsPage() {
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  const { data: programCategories, loading: progCatsLoading } = useSharedCollection<Category>('programCategories');
  const { data: programs, loading: progsLoading } = useSharedCollection<Program>('programs');
  const { data: participants, loading: studentsLoading } = useSharedCollection<Participant>('students');
  const { data: teams, loading: teamsLoading } = useSharedCollection<Team>('teams');
  const { data: memberCategories, loading: memCatsLoading } = useSharedCollection<Category>('memberCategories');
  const { data: assignments, loading: assignmentsLoading } = useSharedCollection<Assignment>('assignments');
  const { data: scores, loading: scoresLoading } = useSharedCollection<Score & { id: string }>('scores');
  const { data: stages, loading: stagesLoading } = useSharedCollection<Stage>('stages');
  const { data: allUsers, loading: usersLoading } = useSharedCollection<{ id: string; name: string }>('users');

  const { data: pointsSettings, loading: pointsLoading } = useCachedDoc<PointsSettings>(
    'doc:points:gradeAndRankPoints',
    () => doc(db, 'points', 'gradeAndRankPoints')
  );

  const { settings, loading: settingsLoading } = useAppSettings();
  const festName = settings?.festName || 'DALENZIA ARTS FEST';

  const loading =
    progCatsLoading ||
    progsLoading ||
    studentsLoading ||
    teamsLoading ||
    memCatsLoading ||
    assignmentsLoading ||
    scoresLoading ||
    pointsLoading ||
    stagesLoading ||
    usersLoading ||
    settingsLoading;

  // Filter States
  const [topCandidatesProgramFilter, setTopCandidatesProgramFilter] = useState<ProgramFilter>('all');
  const [programResultsRankOnly, setProgramResultsRankOnly] = useState(false);
  const [stageScheduleFilter, setStageScheduleFilter] = useState('all');

  // Preview Modal State
  const [previewData, setPreviewData] = useState<{
    title: string;
    description: string;
    headers: string[];
    rows: (string | number)[][];
  } | null>(null);

  const enrichedPrograms = useMemo(() => {
    if (programCategories.length === 0) return programs;
    const categoryMap = new Map(programCategories.map((c) => [c.id, c.name]));
    return programs.map((p) => ({
      ...p,
      categoryName: categoryMap.get(p.categoryId) || 'General',
    }));
  }, [programs, programCategories]);

  // Calculate Top Candidates
  const calculateTopCandidates = useCallback(
    (programSet: Program[]) => {
      if (!pointsSettings || loading) return [];

      const generalCategoryIds = programCategories.filter((pc) => pc.isGeneral).map((pc) => pc.id);

      let filteredPrograms = programSet;
      if (topCandidatesProgramFilter !== 'all') {
        filteredPrograms = programSet.filter((p) => {
          const isSpecific = !generalCategoryIds.includes(p.categoryId);
          switch (topCandidatesProgramFilter) {
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

      const participantResults = participants.map((participant) => {
        let totalPoints = 0;
        let gradePointsSum = 0;
        let rankPointsSum = 0;
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
            if (rank > 0) {
              if (rank === 1) rankPoints = pointsSettings.rankPoints?.first || 0;
              else if (rank === 2) rankPoints = pointsSettings.rankPoints?.second || 0;
              else if (rank === 3) rankPoints = pointsSettings.rankPoints?.third || 0;
            }
            totalPoints += gradePoints + rankPoints;
            gradePointsSum += gradePoints;
            rankPointsSum += rankPoints;
          }
        }

        return {
          name: participant.name,
          chestNumber: participant.chestNumber,
          teamName: teamMap.get(participant.teamId) || 'Unknown Team',
          categoryName: categoryMap.get(participant.categoryId) || 'General',
          totalPoints,
          gradePoints: gradePointsSum,
          rankPoints: rankPointsSum,
        };
      });

      participantResults.sort((a, b) => b.totalPoints - a.totalPoints);
      return participantResults;
    },
    [topCandidatesProgramFilter, assignments, scores, pointsSettings, teams, memberCategories, programCategories, participants, loading]
  );

  // Calculate Team Standings
  const calculateTeamStandings = useCallback(
    (programSet: Program[]) => {
      if (loading || !pointsSettings) return [];

      const teamPoints: Record<string, { total: number; grade: number; rank: number }> = {};
      teams.forEach((t) => (teamPoints[t.id] = { total: 0, grade: 0, rank: 0 }));

      const programScoresCache: Record<string, { assignmentId: string; averageScore: number }[]> = {};

      programSet.forEach((program) => {
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
      });

      const programSetIds = new Set(programSet.map((p) => p.id));

      participants.forEach((p) => {
        let pGrade = 0;
        let pRank = 0;
        const participantAssignments = assignments.filter(
          (a) =>
            a.studentId === p.id &&
            a.status !== 'cancelled' &&
            programSetIds.has(a.programId)
        );

        participantAssignments.forEach((assign) => {
          const program = programSet.find((pr) => pr.id === assign.programId);
          if (!program) return;

          const scoresForProgram = programScoresCache[program.id];
          if (!scoresForProgram) return;

          const participantScoreData = scoresForProgram.find((s) => s.assignmentId === assign.id);

          if (participantScoreData) {
            const { averageScore } = participantScoreData;
            const grade = getGrade(averageScore);

            const gradePoints =
              program.markType === 'special-mark'
                ? pointsSettings.specialGradePoints?.[program.id]?.[grade] || 0
                : pointsSettings.normalGradePoints?.[grade] || 0;

            let rank = 0;
            let lastScore = -1;
            for (let i = 0; i < scoresForProgram.length; i++) {
              if (scoresForProgram[i].averageScore !== lastScore) {
                rank = i + 1;
                lastScore = scoresForProgram[i].averageScore;
              }
              if (scoresForProgram[i].assignmentId === assign.id) {
                break;
              }
            }

            let rankPoints = 0;
            if (rank > 0) {
              if (rank === 1) rankPoints = pointsSettings.rankPoints?.first || 0;
              else if (rank === 2) rankPoints = pointsSettings.rankPoints?.second || 0;
              else if (rank === 3) rankPoints = pointsSettings.rankPoints?.third || 0;
            }

            pGrade += gradePoints;
            pRank += rankPoints;
          }
        });

        if (teamPoints[p.teamId]) {
          teamPoints[p.teamId].grade += pGrade;
          teamPoints[p.teamId].rank += pRank;
          teamPoints[p.teamId].total += pGrade + pRank;
        }
      });

      return teams
        .map((t) => ({
          ...t,
          teamName: t.name,
          gradePoints: teamPoints[t.id]?.grade || 0,
          rankPoints: teamPoints[t.id]?.rank || 0,
          totalPoints: teamPoints[t.id]?.total || 0,
        }))
        .sort((a, b) => b.totalPoints - a.totalPoints);
    },
    [loading, pointsSettings, teams, participants, assignments, scores]
  );

  const liveTeamStandings = useMemo(
    () => calculateTeamStandings(enrichedPrograms),
    [calculateTeamStandings, enrichedPrograms]
  );
  const publishedTeamStandings = useMemo(
    () => calculateTeamStandings(enrichedPrograms.filter((p) => p.isPublished)),
    [calculateTeamStandings, enrichedPrograms]
  );

  const liveTopCandidates = useMemo(
    () => calculateTopCandidates(enrichedPrograms),
    [calculateTopCandidates, enrichedPrograms]
  );
  const publishedTopCandidates = useMemo(
    () => calculateTopCandidates(enrichedPrograms.filter((p) => p.isPublished)),
    [calculateTopCandidates, enrichedPrograms]
  );

  // Overall festival stats summary
  const festivalTelemetry = useMemo(() => {
    const totalProgramsCount = programs.length;
    const publishedCount = programs.filter((p) => p.isPublished).length;
    const totalStudentsCount = participants.length;
    const totalTeamsCount = teams.length;
    const leadingTeam = liveTeamStandings[0] || null;

    return {
      totalProgramsCount,
      publishedCount,
      totalStudentsCount,
      totalTeamsCount,
      leadingTeam,
    };
  }, [programs, participants, teams, liveTeamStandings]);

  // Shared Helper to create PDF Document with Festival Headers & Signatures
  const createPdfDoc = (title: string, subtitle?: string) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Top Header Ribbon
    doc.setFillColor(15, 23, 42); // Slate 900
    doc.rect(0, 0, pageWidth, 26, 'F');

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text(festName.toUpperCase(), 14, 11);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225);
    doc.text(title.toUpperCase(), 14, 17);

    const printDate = new Date().toLocaleString();
    doc.setFontSize(7.5);
    doc.text(`Generated: ${printDate}${subtitle ? ` | ${subtitle}` : ''}`, 14, 22);

    return doc;
  };

  // Add Official Signatures at end of document
  const appendSignatures = (doc: jsPDF) => {
    const finalY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 22 : 250;
    if (finalY < 275) {
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.4);

      doc.line(20, finalY, 65, finalY);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text('General Convener', 30, finalY + 4.5);

      doc.line(85, finalY, 130, finalY);
      doc.text('Chief Judge', 98, finalY + 4.5);

      doc.line(150, finalY, 195, finalY);
      doc.text('Results In-Charge', 160, finalY + 4.5);
    }
  };

  // Trigger browser print from Blob
  const printPdfBlob = (doc: jsPDF) => {
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url);
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
      };
    }
  };

  // GENERATE: TEAM STANDINGS (PDF, Excel, or Print)
  const handleTeamStandingsAction = (
    type: 'live' | 'published',
    action: 'pdf' | 'excel' | 'print'
  ) => {
    const key = `standings-${type}-${action}`;
    setIsProcessing(key);

    try {
      const standings = type === 'live' ? liveTeamStandings : publishedTeamStandings;
      const title = `Team Standings (${type === 'live' ? 'Live Real-time' : 'Published'})`;

      if (action === 'excel') {
        const rows = standings.map((t, idx) => ({
          'Rank': idx + 1,
          'Team Name': t.teamName,
          'Leader': t.leaderName || 'N/A',
          'Grade Points': Number(t.gradePoints.toFixed(2)),
          'Position Points': Number(t.rankPoints.toFixed(2)),
          'Total Points': Number(t.totalPoints.toFixed(2)),
        }));
        const worksheet = XLSX.utils.json_to_sheet(rows);
        worksheet['!cols'] = [{ wch: 8 }, { wch: 28 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Standings');
        XLSX.writeFile(workbook, `team-standings-${type}.xlsx`);
        toast({ title: 'Excel Downloaded', description: 'Team standings workbook generated.' });
        return;
      }

      const doc = createPdfDoc(title, `Standings Type: ${type.toUpperCase()}`);
      autoTable(doc, {
        startY: 32,
        head: [['Rank', 'House / Team Name', 'Leader', 'Grade Pts', 'Rank Pts', 'Total Points']],
        body: standings.map((t, i) => [
          `#${i + 1}`,
          t.teamName,
          t.leaderName || 'N/A',
          t.gradePoints.toFixed(2),
          t.rankPoints.toFixed(2),
          t.totalPoints.toFixed(2),
        ]),
        headStyles: { fillColor: [245, 158, 11] }, // Amber 500
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { halign: 'center', fontStyle: 'bold', cellWidth: 14 },
          1: { fontStyle: 'bold', cellWidth: 50 },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right', fontStyle: 'bold' },
        },
      });
      appendSignatures(doc);

      if (action === 'print') {
        printPdfBlob(doc);
      } else {
        doc.save(`team-standings-${type}.pdf`);
        toast({ title: 'PDF Downloaded', description: 'Team standings report saved.' });
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to generate report.', variant: 'destructive' });
    } finally {
      setIsProcessing(null);
    }
  };

  // GENERATE: TOP CANDIDATES (PDF, Excel, or Print)
  const handleTopCandidatesAction = (
    type: 'live' | 'published',
    action: 'pdf' | 'excel' | 'print'
  ) => {
    const key = `candidates-${type}-${action}`;
    setIsProcessing(key);

    try {
      const candidates = type === 'live' ? liveTopCandidates : publishedTopCandidates;
      const title = `Top Candidates (${type === 'live' ? 'Live' : 'Published'}) - Filter: ${topCandidatesProgramFilter}`;

      if (action === 'excel') {
        const rows = candidates.map((p, idx) => ({
          'Rank': idx + 1,
          'Chest No.': p.chestNumber,
          'Name': p.name,
          'Team': p.teamName,
          'Category': p.categoryName,
          'Grade Points': Number(p.gradePoints.toFixed(2)),
          'Rank Points': Number(p.rankPoints.toFixed(2)),
          'Total Points': Number(p.totalPoints.toFixed(2)),
        }));
        const worksheet = XLSX.utils.json_to_sheet(rows);
        worksheet['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 24 }, { wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Top Candidates');
        XLSX.writeFile(workbook, `top-candidates-${type}.xlsx`);
        toast({ title: 'Excel Downloaded', description: 'Top candidates exported to Excel.' });
        return;
      }

      const doc = createPdfDoc(title, `Filter: ${topCandidatesProgramFilter}`);
      autoTable(doc, {
        startY: 32,
        head: [['Rank', 'Chest #', 'Participant Name', 'House / Team', 'Category', 'Total Pts']],
        body: candidates.map((p, i) => [
          `#${i + 1}`,
          p.chestNumber,
          p.name,
          p.teamName,
          p.categoryName,
          p.totalPoints.toFixed(2),
        ]),
        headStyles: { fillColor: [99, 102, 241] }, // Indigo 500
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { halign: 'center', fontStyle: 'bold', cellWidth: 14 },
          1: { halign: 'center', fontStyle: 'bold', cellWidth: 18 },
          2: { fontStyle: 'bold' },
          5: { halign: 'right', fontStyle: 'bold' },
        },
      });
      appendSignatures(doc);

      if (action === 'print') {
        printPdfBlob(doc);
      } else {
        doc.save(`top-candidates-${type}.pdf`);
        toast({ title: 'PDF Downloaded', description: 'Top candidates report saved.' });
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to process report.', variant: 'destructive' });
    } finally {
      setIsProcessing(null);
    }
  };

  // GENERATE: MASTER PARTICIPANT ROSTER
  const handleParticipantRosterAction = (action: 'pdf' | 'excel' | 'print') => {
    setIsProcessing(`participants-${action}`);
    try {
      const teamMap = new Map(teams.map((t) => [t.id, t.name]));
      const catMap = new Map(memberCategories.map((c) => [c.id, c.name]));

      const sorted = [...participants].sort((a, b) => a.chestNumber - b.chestNumber);

      if (action === 'excel') {
        const rows = sorted.map((p) => ({
          'Chest Number': p.chestNumber,
          'Name': p.name,
          'House / Team': teamMap.get(p.teamId) || 'N/A',
          'Category': catMap.get(p.categoryId) || 'General',
        }));
        const worksheet = XLSX.utils.json_to_sheet(rows);
        worksheet['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 22 }, { wch: 20 }];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Participants');
        XLSX.writeFile(workbook, 'master_participants_directory.xlsx');
        toast({ title: 'Excel Downloaded', description: 'Participants directory saved.' });
        return;
      }

      const doc = createPdfDoc('MASTER PARTICIPANT DIRECTORY', `Total: ${sorted.length} Contenders`);
      autoTable(doc, {
        startY: 32,
        head: [['Chest #', 'Participant Name', 'House / Team', 'Category']],
        body: sorted.map((p) => [
          p.chestNumber,
          p.name,
          teamMap.get(p.teamId) || 'N/A',
          catMap.get(p.categoryId) || 'General',
        ]),
        headStyles: { fillColor: [16, 185, 129] }, // Emerald 500
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { halign: 'center', fontStyle: 'bold', cellWidth: 22 },
          1: { fontStyle: 'bold' },
        },
      });
      appendSignatures(doc);

      if (action === 'print') {
        printPdfBlob(doc);
      } else {
        doc.save('master-participants-directory.pdf');
        toast({ title: 'PDF Downloaded', description: 'Master participant directory saved.' });
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to generate participant list.', variant: 'destructive' });
    } finally {
      setIsProcessing(null);
    }
  };

  // GENERATE: PROGRAM SCHEDULE REPORT
  const handleScheduleAction = (action: 'pdf' | 'excel' | 'print') => {
    setIsProcessing(`schedule-${action}`);
    try {
      const sorted = [...enrichedPrograms].sort((a, b) => a.name.localeCompare(b.name));

      if (action === 'excel') {
        const rows = sorted.map((p, idx) => ({
          'Sl No.': idx + 1,
          'Program Name': p.name,
          'Category': p.categoryName,
          'Type': p.type,
          'Mode': p.mode,
          'Mark Type': p.markType,
        }));
        const worksheet = XLSX.utils.json_to_sheet(rows);
        worksheet['!cols'] = [{ wch: 8 }, { wch: 32 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Schedule');
        XLSX.writeFile(workbook, 'festival_program_schedule.xlsx');
        toast({ title: 'Excel Downloaded', description: 'Program schedule saved as Excel.' });
        return;
      }

      const doc = createPdfDoc('OFFICIAL PROGRAM SCHEDULE', `Total: ${sorted.length} Programs`);
      autoTable(doc, {
        startY: 32,
        head: [['#', 'Program Name', 'Category', 'Type', 'Mode']],
        body: sorted.map((p, i) => [i + 1, p.name, p.categoryName || 'General', p.type, p.mode]),
        headStyles: { fillColor: [59, 130, 246] }, // Blue 500
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { halign: 'center', cellWidth: 12 },
          1: { fontStyle: 'bold' },
        },
      });
      appendSignatures(doc);

      if (action === 'print') {
        printPdfBlob(doc);
      } else {
        doc.save('festival-program-schedule.pdf');
        toast({ title: 'PDF Downloaded', description: 'Program schedule saved.' });
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to generate schedule.', variant: 'destructive' });
    } finally {
      setIsProcessing(null);
    }
  };

  // GENERATE: STAGE-WISE PROGRAM SCHEDULE
  const handleStageScheduleAction = (action: 'pdf' | 'excel' | 'print') => {
    setIsProcessing(`stages-${action}`);
    try {
      const userMap = new Map(allUsers.map((u) => [u.id, u.name]));
      const progMap = new Map(enrichedPrograms.map((p) => [p.id, p]));

      const targetStages =
        stageScheduleFilter === 'all'
          ? stages
          : stages.filter((s) => s.id === stageScheduleFilter);

      const rows: any[] = [];
      targetStages.forEach((stage) => {
        const pIds = stage.programIds || [];
        pIds.forEach((pId, idx) => {
          const prog = progMap.get(pId);
          if (prog) {
            rows.push({
              stageName: stage.name,
              coordinator: stage.controllerId ? userMap.get(stage.controllerId) || 'Unassigned' : 'Unassigned',
              seq: idx + 1,
              programName: prog.name,
              category: prog.categoryName,
              mode: prog.mode,
            });
          }
        });
      });

      if (action === 'excel') {
        const excelData = rows.map((r) => ({
          'Stage Venue': r.stageName,
          'Stage Coordinator': r.coordinator,
          'Sequence #': r.seq,
          'Program Name': r.programName,
          'Category': r.category,
          'Mode': r.mode,
        }));
        const worksheet = XLSX.utils.json_to_sheet(excelData);
        worksheet['!cols'] = [{ wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 14 }];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Stage Schedules');
        XLSX.writeFile(workbook, 'stage_wise_schedule.xlsx');
        toast({ title: 'Excel Downloaded', description: 'Stage-wise schedule saved.' });
        return;
      }

      const doc = createPdfDoc('STAGE-WISE PROGRAM PERFORMANCE SCHEDULE');
      autoTable(doc, {
        startY: 32,
        head: [['Stage Venue', 'Coordinator', 'Seq #', 'Program Name', 'Category']],
        body: rows.map((r) => [r.stageName, r.coordinator, `#${r.seq}`, r.programName, r.category]),
        headStyles: { fillColor: [8, 145, 178] }, // Cyan 600
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { fontStyle: 'bold' },
          2: { halign: 'center', fontStyle: 'bold' },
        },
      });
      appendSignatures(doc);

      if (action === 'print') {
        printPdfBlob(doc);
      } else {
        doc.save('stage-wise-schedule.pdf');
        toast({ title: 'PDF Downloaded', description: 'Stage schedule saved.' });
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to generate stage schedule.', variant: 'destructive' });
    } finally {
      setIsProcessing(null);
    }
  };

  // GENERATE: BLANK JUDGE EVALUATION MARKING SHEET
  const handleBlankJudgeSheetAction = (action: 'pdf' | 'print') => {
    setIsProcessing(`blank-judge-${action}`);
    try {
      const doc = createPdfDoc('JUDGES OFFICIAL SCORE SHEET TEMPLATE');
      const sampleRows = Array.from({ length: 15 }, (_, i) => [
        i + 1,
        '',
        '',
        '',
        '',
        '',
        '',
      ]);

      autoTable(doc, {
        startY: 32,
        head: [['Sl #', 'Code / Chest', 'Criterion 1 (30)', 'Criterion 2 (30)', 'Criterion 3 (20)', 'Criterion 4 (20)', 'Total (100)']],
        body: sampleRows,
        headStyles: { fillColor: [147, 51, 234] }, // Purple 600
        theme: 'grid',
        bodyStyles: { minCellHeight: 10 },
        columnStyles: {
          0: { halign: 'center', cellWidth: 14 },
          1: { cellWidth: 28 },
          6: { fontStyle: 'bold' },
        },
      });

      appendSignatures(doc);

      if (action === 'print') {
        printPdfBlob(doc);
      } else {
        doc.save('blank-judges-score-sheet.pdf');
        toast({ title: 'PDF Downloaded', description: 'Blank judge evaluation template saved.' });
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to generate judge sheet.', variant: 'destructive' });
    } finally {
      setIsProcessing(null);
    }
  };

  // GENERATE: PROGRAM RESULTS GAZETTE
  const handleProgramResultsAction = (action: 'pdf' | 'excel' | 'print') => {
    setIsProcessing(`results-${action}`);
    try {
      const sortedPrograms = [...enrichedPrograms].sort((a, b) => a.name.localeCompare(b.name));

      const programScoresCache: Record<string, { assignmentId: string; averageScore: number }[]> = {};
      sortedPrograms.forEach((program) => {
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
      });

      const excelRows: any[] = [];
      const pdfTableRows: any[] = [];

      sortedPrograms.forEach((program) => {
        const programAssignments = assignments.filter(
          (a) => a.programId === program.id && a.status !== 'cancelled'
        );
        const scoresList = programScoresCache[program.id] || [];

        let currentRank = 0;
        let lastScore = -1;

        scoresList.forEach((scoreItem, index) => {
          if (scoreItem.averageScore !== lastScore) {
            currentRank = index + 1;
            lastScore = scoreItem.averageScore;
          }

          if (programResultsRankOnly && currentRank > 3) return;

          const assign = programAssignments.find((a) => a.id === scoreItem.assignmentId);
          if (!assign) return;

          const participant = participants.find((p) => p.id === assign.studentId);
          const team = teams.find((t) => t.id === assign.teamId);
          const grade = getGrade(scoreItem.averageScore);

          const gradePoints =
            program.markType === 'special-mark'
              ? pointsSettings?.specialGradePoints?.[program.id]?.[grade] || 0
              : pointsSettings?.normalGradePoints?.[grade] || 0;

          excelRows.push({
            'Program': program.name,
            'Category': program.categoryName,
            'Rank': currentRank,
            'Chest No.': participant?.chestNumber || 'N/A',
            'Name': participant?.name || 'N/A',
            'House': team?.name || 'N/A',
            'Avg Score': Number(scoreItem.averageScore.toFixed(2)),
            'Grade': grade,
            'Grade Points': gradePoints,
          });

          pdfTableRows.push([
            program.name,
            `#${currentRank}`,
            participant?.chestNumber || 'N/A',
            participant?.name || 'N/A',
            team?.name || 'N/A',
            grade,
            gradePoints.toFixed(2),
          ]);
        });
      });

      if (action === 'excel') {
        const worksheet = XLSX.utils.json_to_sheet(excelRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Results Gazette');
        XLSX.writeFile(workbook, 'official_program_results_gazette.xlsx');
        toast({ title: 'Excel Downloaded', description: 'Results gazette saved as Excel.' });
        return;
      }

      const doc = createPdfDoc('OFFICIAL PROGRAM RESULTS GAZETTE', programResultsRankOnly ? 'Rank Holders Only' : 'All Participants');
      autoTable(doc, {
        startY: 32,
        head: [['Program Name', 'Rank', 'Chest #', 'Participant Name', 'House', 'Grade', 'Points']],
        body: pdfTableRows,
        headStyles: { fillColor: [225, 29, 72] }, // Rose 600
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          1: { halign: 'center', fontStyle: 'bold' },
          2: { halign: 'center' },
          6: { halign: 'right', fontStyle: 'bold' },
        },
      });
      appendSignatures(doc);

      if (action === 'print') {
        printPdfBlob(doc);
      } else {
        doc.save('program-results-gazette.pdf');
        toast({ title: 'PDF Downloaded', description: 'Results gazette saved.' });
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to generate results gazette.', variant: 'destructive' });
    } finally {
      setIsProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[65vh]">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-indigo-500/20 blur-xl animate-pulse" />
          <Loader2 className="h-10 w-10 animate-spin text-indigo-500 relative z-10" />
        </div>
        <p className="text-muted-foreground animate-pulse mt-4 text-sm font-medium">
          Loading Official Print & Publication Center...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 relative min-h-screen p-1 pb-16">
      {/* Background Ambient Glows */}
      <div className="fixed inset-0 -z-10 h-full w-full bg-background overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-indigo-500/5 blur-[130px]" />
        <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-amber-500/5 blur-[130px]" />
        <div className="absolute bottom-[-10%] left-[20%] w-[40%] h-[40%] rounded-full bg-rose-500/5 blur-[140px]" />
      </div>

      {/* Top Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-extrabold tracking-tight font-headline">Print & Report Center</h1>
            <Badge variant="outline" className="bg-indigo-500/10 text-indigo-500 border-indigo-500/25 text-xs font-semibold px-2.5 py-0.5">
              <Printer className="mr-1.5 h-3.5 w-3.5" />
              Official Publications
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Generate, preview, print, and export official certified festival reports, rosters, gazettes, and score sheets.
          </p>
        </div>
      </motion.div>

      {/* KPI Telemetry Stat Cards */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {/* Published Results Count */}
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm relative overflow-hidden group hover:border-amber-500/40 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-all pointer-events-none" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium">Published Programs</CardDescription>
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black font-mono mt-1 text-amber-500">
              {festivalTelemetry.publishedCount}{' '}
              <span className="text-sm font-normal text-muted-foreground font-sans">
                / {festivalTelemetry.totalProgramsCount}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">Certified results ready for printing</p>
          </CardContent>
        </Card>

        {/* Registered Contenders */}
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm relative overflow-hidden group hover:border-emerald-500/40 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-all pointer-events-none" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium">Contender Database</CardDescription>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black font-mono mt-1">
              {festivalTelemetry.totalStudentsCount}{' '}
              <span className="text-xs font-normal text-muted-foreground font-sans">Participants</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">Across {festivalTelemetry.totalTeamsCount} competing houses</p>
          </CardContent>
        </Card>

        {/* Championship Leader */}
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm relative overflow-hidden group hover:border-indigo-500/40 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl group-hover:bg-indigo-500/20 transition-all pointer-events-none" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium">Current Standings Leader</CardDescription>
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                <Trophy className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-lg font-bold truncate mt-1">
              {festivalTelemetry.leadingTeam ? festivalTelemetry.leadingTeam.teamName : 'No Teams'}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground font-mono">
              Score: <strong className="text-foreground">{festivalTelemetry.leadingTeam?.totalPoints.toFixed(2) || '0.00'}</strong> pts
            </p>
          </CardContent>
        </Card>

        {/* Formats Supported */}
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm relative overflow-hidden group hover:border-purple-500/40 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-xl group-hover:bg-purple-500/20 transition-all pointer-events-none" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium">Certified Output</CardDescription>
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                <Shield className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black font-mono mt-1 text-purple-500">
              PDF & Excel
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">Ready with official signature slots</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* REPORT MODULES TABS */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Tabs defaultValue="championship" className="w-full space-y-4">
          <TabsList className="bg-muted/40 p-1 border border-border/50">
            <TabsTrigger value="championship" className="text-xs sm:text-sm gap-2">
              <Trophy className="h-4 w-4" />
              Championship & Awards
            </TabsTrigger>
            <TabsTrigger value="operations" className="text-xs sm:text-sm gap-2">
              <Tv className="h-4 w-4" />
              Schedules & Stages
            </TabsTrigger>
            <TabsTrigger value="participants" className="text-xs sm:text-sm gap-2">
              <Users className="h-4 w-4" />
              Participants & Rosters
            </TabsTrigger>
            <TabsTrigger value="gazette" className="text-xs sm:text-sm gap-2">
              <Award className="h-4 w-4" />
              Results Gazette
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: CHAMPIONSHIP & AWARDS */}
          <TabsContent value="championship" className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              {/* Report 1: Team Standings */}
              <Card className="border-border/50 bg-card/40 backdrop-blur-sm flex flex-col justify-between">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="border-amber-500/30 text-amber-500 bg-amber-500/5 text-xs font-semibold">
                      Championship
                    </Badge>
                  </div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2 mt-2">
                    <Trophy className="h-5 w-5 text-amber-500" />
                    House Team Standings
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Overall house performance ranked by accumulated points. Choose between verified published standings or real-time live standings.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="p-3 rounded-xl border border-border/40 bg-muted/20 text-xs flex justify-between">
                    <span className="text-muted-foreground">Certified Published Leader:</span>
                    <strong className="text-foreground">
                      {publishedTeamStandings[0]?.teamName || 'N/A'} ({publishedTeamStandings[0]?.totalPoints.toFixed(1) || '0'} pts)
                    </strong>
                  </div>
                </CardContent>

                <CardFooter className="pt-2 pb-4 border-t border-border/40 bg-muted/10 flex flex-wrap gap-2">
                  <div className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground mb-1">
                    <span>Published Results:</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleTeamStandingsAction('published', 'pdf')}
                    disabled={!!isProcessing}
                    className="text-xs rounded-xl bg-amber-500 hover:bg-amber-600 text-white"
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTeamStandingsAction('published', 'excel')}
                    disabled={!!isProcessing}
                    className="text-xs rounded-xl"
                  >
                    <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                    Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTeamStandingsAction('published', 'print')}
                    disabled={!!isProcessing}
                    className="text-xs rounded-xl"
                  >
                    <Printer className="mr-1.5 h-3.5 w-3.5" />
                    Print
                  </Button>

                  <div className="w-full border-t border-border/30 pt-2 flex items-center justify-between text-xs font-semibold text-muted-foreground mt-1 mb-1">
                    <span>Live Real-Time Standings:</span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleTeamStandingsAction('live', 'pdf')}
                    disabled={!!isProcessing}
                    className="text-xs rounded-xl"
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Live PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTeamStandingsAction('live', 'excel')}
                    disabled={!!isProcessing}
                    className="text-xs rounded-xl"
                  >
                    <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                    Live Excel
                  </Button>
                </CardFooter>
              </Card>

              {/* Report 2: Top Candidates */}
              <Card className="border-border/50 bg-card/40 backdrop-blur-sm flex flex-col justify-between">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="border-indigo-500/30 text-indigo-500 bg-indigo-500/5 text-xs font-semibold">
                      Star Contenders
                    </Badge>
                  </div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2 mt-2">
                    <Star className="h-5 w-5 text-indigo-500" />
                    Top Candidates / Star of Fest
                  </CardTitle>
                  <CardDescription className="text-xs">
                    All student participants ranked by individual score points. Filter by program category or type for Star Award calculations.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                      Program Scope Filter:
                    </Label>
                    <Select
                      value={topCandidatesProgramFilter}
                      onValueChange={(val: any) => setTopCandidatesProgramFilter(val)}
                    >
                      <SelectTrigger className="w-full h-8 text-xs rounded-xl bg-muted/30 border-border/50">
                        <SelectValue placeholder="Scope" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Programs</SelectItem>
                        <SelectItem value="individual">All Individual Programs</SelectItem>
                        <SelectItem value="group">All Group Programs</SelectItem>
                        <SelectItem value="specific">Category Specific Programs Only</SelectItem>
                        <SelectItem value="individual-specific">Individual (Category Specific)</SelectItem>
                        <SelectItem value="group-specific">Group (Category Specific)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>

                <CardFooter className="pt-2 pb-4 border-t border-border/40 bg-muted/10 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleTopCandidatesAction('published', 'pdf')}
                    disabled={!!isProcessing}
                    className="text-xs rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Published PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTopCandidatesAction('published', 'excel')}
                    disabled={!!isProcessing}
                    className="text-xs rounded-xl"
                  >
                    <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                    Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTopCandidatesAction('published', 'print')}
                    disabled={!!isProcessing}
                    className="text-xs rounded-xl"
                  >
                    <Printer className="mr-1.5 h-3.5 w-3.5" />
                    Print
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleTopCandidatesAction('live', 'pdf')}
                    disabled={!!isProcessing}
                    className="text-xs rounded-xl"
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Live PDF
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 2: SCHEDULES & STAGES */}
          <TabsContent value="operations" className="space-y-5">
            <div className="grid gap-5 md:grid-cols-3">
              {/* Master Program Schedule */}
              <Card className="border-border/50 bg-card/40 backdrop-blur-sm flex flex-col justify-between">
                <CardHeader>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <List className="h-5 w-5 text-blue-500" />
                    Master Program Schedule
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Comprehensive chronological list of all {programs.length} programs with categories and modes.
                  </CardDescription>
                </CardHeader>
                <CardFooter className="pt-2 border-t border-border/40 bg-muted/10 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleScheduleAction('pdf')}
                    disabled={!!isProcessing}
                    className="text-xs rounded-xl flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleScheduleAction('excel')}
                    disabled={!!isProcessing}
                    className="text-xs rounded-xl"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleScheduleAction('print')}
                    disabled={!!isProcessing}
                    className="text-xs rounded-xl"
                  >
                    <Printer className="h-3.5 w-3.5" />
                  </Button>
                </CardFooter>
              </Card>

              {/* Stage-Wise Program Schedule */}
              <Card className="border-border/50 bg-card/40 backdrop-blur-sm flex flex-col justify-between">
                <CardHeader>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Tv className="h-5 w-5 text-cyan-500" />
                    Stage Venue Schedules
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Events grouped by performance stage venue and execution sequence.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Select value={stageScheduleFilter} onValueChange={setStageScheduleFilter}>
                    <SelectTrigger className="w-full h-8 text-xs rounded-xl bg-muted/30 border-border/50">
                      <SelectValue placeholder="Venue Filter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Stage Venues</SelectItem>
                      {stages.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
                <CardFooter className="pt-2 border-t border-border/40 bg-muted/10 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleStageScheduleAction('pdf')}
                    disabled={!!isProcessing}
                    className="text-xs rounded-xl flex-1 bg-cyan-600 hover:bg-cyan-700 text-white"
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStageScheduleAction('excel')}
                    disabled={!!isProcessing}
                    className="text-xs rounded-xl"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStageScheduleAction('print')}
                    disabled={!!isProcessing}
                    className="text-xs rounded-xl"
                  >
                    <Printer className="h-3.5 w-3.5" />
                  </Button>
                </CardFooter>
              </Card>

              {/* Blank Judge Score Sheets */}
              <Card className="border-border/50 bg-card/40 backdrop-blur-sm flex flex-col justify-between">
                <CardHeader>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <FileText className="h-5 w-5 text-purple-500" />
                    Judge Evaluation Templates
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Ready-to-print blank judging sheets with criteria grids and signature blocks for evaluators.
                  </CardDescription>
                </CardHeader>
                <CardFooter className="pt-2 border-t border-border/40 bg-muted/10 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleBlankJudgeSheetAction('pdf')}
                    disabled={!!isProcessing}
                    className="text-xs rounded-xl flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Blank PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBlankJudgeSheetAction('print')}
                    disabled={!!isProcessing}
                    className="text-xs rounded-xl"
                  >
                    <Printer className="mr-1.5 h-3.5 w-3.5" />
                    Direct Print
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 3: PARTICIPANTS & ROSTERS */}
          <TabsContent value="participants" className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              {/* Master Participant Roster */}
              <Card className="border-border/50 bg-card/40 backdrop-blur-sm flex flex-col justify-between">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 bg-emerald-500/5 text-xs font-semibold">
                      Master Registry
                    </Badge>
                  </div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2 mt-2">
                    <Users className="h-5 w-5 text-emerald-500" />
                    Master Participant Directory
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Complete numerical list of all {participants.length} registered contenders sorted by chest number with house assignments.
                  </CardDescription>
                </CardHeader>
                <CardFooter className="pt-2 pb-4 border-t border-border/40 bg-muted/10 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleParticipantRosterAction('pdf')}
                    disabled={!!isProcessing}
                    className="text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Download PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleParticipantRosterAction('excel')}
                    disabled={!!isProcessing}
                    className="text-xs rounded-xl"
                  >
                    <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                    Excel Directory
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleParticipantRosterAction('print')}
                    disabled={!!isProcessing}
                    className="text-xs rounded-xl"
                  >
                    <Printer className="mr-1.5 h-3.5 w-3.5" />
                    Print
                  </Button>
                </CardFooter>
              </Card>

              {/* Coordination Roster Shortcut */}
              <Card className="border-border/50 bg-card/40 backdrop-blur-sm flex flex-col justify-between">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="border-indigo-500/30 text-indigo-500 bg-indigo-500/5 text-xs font-semibold">
                      Coordination
                    </Badge>
                  </div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2 mt-2">
                    <Layers className="h-5 w-5 text-indigo-500" />
                    Program Coordination Allocation Roster
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Full breakdown of which student is allocated to which program under each house team.
                  </CardDescription>
                </CardHeader>
                <CardFooter className="pt-2 pb-4 border-t border-border/40 bg-muted/10 flex gap-2">
                  <Button asChild size="sm" variant="outline" className="text-xs rounded-xl">
                    <a href="/admin/program-coordination">
                      Open Program Coordination <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                    </a>
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 4: RESULTS GAZETTE */}
          <TabsContent value="gazette" className="space-y-5">
            <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="border-rose-500/30 text-rose-500 bg-rose-500/5 text-xs font-semibold">
                    Official Gazette
                  </Badge>
                </div>
                <CardTitle className="text-lg font-bold flex items-center gap-2 mt-2">
                  <Award className="h-5 w-5 text-rose-500" />
                  Official Program Results Gazette
                </CardTitle>
                <CardDescription className="text-xs">
                  Certified event winners gazette formatted with official signature blocks for publication.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2 p-3 rounded-xl border border-border/40 bg-muted/20">
                  <Checkbox
                    id="rank-only"
                    checked={programResultsRankOnly}
                    onCheckedChange={(checked) => setProgramResultsRankOnly(Boolean(checked))}
                    className="rounded-md"
                  />
                  <Label htmlFor="rank-only" className="text-xs font-medium cursor-pointer">
                    Show Podium Rank Holders Only (1st, 2nd, 3rd places)
                  </Label>
                </div>
              </CardContent>
              <CardFooter className="pt-2 pb-4 border-t border-border/40 bg-muted/10 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => handleProgramResultsAction('pdf')}
                  disabled={!!isProcessing}
                  className="text-xs rounded-xl bg-rose-600 hover:bg-rose-700 text-white"
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download Gazette PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleProgramResultsAction('excel')}
                  disabled={!!isProcessing}
                  className="text-xs rounded-xl"
                >
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                  Gazette Excel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleProgramResultsAction('print')}
                  disabled={!!isProcessing}
                  className="text-xs rounded-xl"
                >
                  <Printer className="mr-1.5 h-3.5 w-3.5" />
                  Print Gazette
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
