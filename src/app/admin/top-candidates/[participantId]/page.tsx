'use client';

import { useState, useMemo } from 'react';
import { doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAppSettings, useCachedDoc, useSharedCollection } from '@/context/firestore-cache';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  ArrowLeft,
  Trophy,
  Medal,
  Crown,
  Download,
  FileSpreadsheet,
  Award,
  Sparkles,
  Star,
  FileText,
  Layers,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { Program as BaseProgram } from '@/app/admin/programs/page';
import type { Participant as BaseParticipant } from '@/app/teams/add-participants/page';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { motion } from 'framer-motion';
import type { Category } from '@/app/admin/categories/page';
import type { Team } from '@/app/admin/teams/page';

type Program = BaseProgram & { isGeneral?: boolean };
type Assignment = { id: string; programId: string; studentId: string; teamId: string; status?: 'cancelled' };
type Score = { programId: string; assignmentId: string; judgeId: string; score: number };
type PointsSettings = {
  normalGradePoints: Record<string, number>;
  specialGradePoints: Record<string, Record<string, number>>;
  rankPoints: Record<string, number>;
};

type ProgramResult = {
  programId: string;
  programName: string;
  averageScore: number;
  grade: string;
  gradePoints: number;
  rank: number | null;
  rankPoints: number;
  totalProgramPoints: number;
};

type ParticipantDetails = {
  participantId: string;
  name: string;
  chestNumber: number;
  teamName: string;
  categoryId: string;
  categoryName: string;
};

type ProgramFilter =
  | 'all'
  | 'individual'
  | 'group'
  | 'specific'
  | 'individual-specific'
  | 'group-specific';

type RawData = {
  programs: Program[];
  assignments: Assignment[];
  scores: Score[];
  pointsSettings: PointsSettings;
  programCategories: Category[];
};

const getGrade = (score: number) => {
  if (score >= 90) return 'A+';
  if (score >= 70) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  return 'No Grade';
};

export default function ParticipantReportPage() {
  const router = useRouter();
  const params = useParams();
  const participantId = params.participantId as string;

  const [programFilter, setProgramFilter] = useState<ProgramFilter>('all');
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);
  const [isDownloadingXLSX, setIsDownloadingXLSX] = useState(false);

  const { data: students, loading: studentsLoading } = useSharedCollection<BaseParticipant>('students');
  const { data: teams, loading: teamsLoading } = useSharedCollection<Team>('teams');
  const { data: rawPrograms, loading: progsLoading } = useSharedCollection<Program>('programs');
  const { data: assignments, loading: assignmentsLoading } = useSharedCollection<Assignment>('assignments');
  const { data: scores, loading: scoresLoading } = useSharedCollection<Score & { id: string }>('scores');
  const { data: programCategories, loading: catsLoading } = useSharedCollection<Category>('programCategories');
  const { data: memberCategories, loading: memCatsLoading } = useSharedCollection<Category>('memberCategories');
  const { data: pointsSettings, loading: pointsLoading } = useCachedDoc<PointsSettings>(
    'doc:points:gradeAndRankPoints',
    () => doc(db, 'points', 'gradeAndRankPoints')
  );
  const { settings, loading: settingsLoading } = useAppSettings();

  const festName = settings?.festName || 'DALENZIA ARTS FEST';

  const loading =
    studentsLoading ||
    teamsLoading ||
    progsLoading ||
    assignmentsLoading ||
    scoresLoading ||
    catsLoading ||
    memCatsLoading ||
    pointsLoading ||
    settingsLoading;

  const details = useMemo<ParticipantDetails | null>(() => {
    const participant = students.find((s) => s.id === participantId);
    if (!participant) return null;
    const teamName = teams.find((t) => t.id === participant.teamId)?.name || 'Unknown Team';
    const categoryName = memberCategories.find((c) => c.id === participant.categoryId)?.name || 'General';
    return {
      participantId: participant.id,
      name: participant.name,
      chestNumber: participant.chestNumber,
      teamName,
      categoryId: participant.categoryId,
      categoryName,
    };
  }, [students, teams, memberCategories, participantId]);

  const rawData = useMemo<RawData | null>(() => {
    if (loading) return null;
    const generalCatSet = new Set(programCategories.filter((c) => c.isGeneral).map((c) => c.id));
    const programs = rawPrograms.map((p) => ({
      ...p,
      isGeneral: generalCatSet.has(p.categoryId),
    }));
    return {
      programs,
      assignments,
      scores,
      pointsSettings: pointsSettings || {
        normalGradePoints: {},
        specialGradePoints: {},
        rankPoints: {},
      },
      programCategories,
    };
  }, [loading, rawPrograms, assignments, scores, pointsSettings, programCategories]);

  // Calculations based on raw data and filters
  const { programResults, totalPoints, gradePointsTotal, rankPointsTotal, medals } = useMemo(() => {
    if (!rawData) {
      return {
        programResults: [],
        totalPoints: 0,
        gradePointsTotal: 0,
        rankPointsTotal: 0,
        medals: { first: 0, second: 0, third: 0 },
      };
    }

    const { programs, assignments, scores, pointsSettings, programCategories } = rawData;
    const generalCategoryIds = programCategories.filter((c) => c.isGeneral).map((c) => c.id);

    const filteredPrograms = programs.filter((p) => {
      if (programFilter === 'all') return true;
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

    const programScoresCache: Record<string, { assignmentId: string; averageScore: number }[]> = {};
    let participantTotalPoints = 0;
    let gradePtsSum = 0;
    let rankPtsSum = 0;
    let firsts = 0;
    let seconds = 0;
    let thirds = 0;
    const calculatedProgramResults: ProgramResult[] = [];

    const participantAssignments = assignments.filter(
      (a) => a.studentId === participantId && a.status !== 'cancelled'
    );

    for (const assignment of participantAssignments) {
      const program = filteredPrograms.find((p) => p.id === assignment.programId);
      if (!program) continue;

      if (!programScoresCache[program.id]) {
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

      const scoresForProgram = programScoresCache[program.id];
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
        if (rank === 1) {
          rankPoints = pointsSettings.rankPoints?.first || 0;
          firsts++;
        } else if (rank === 2) {
          rankPoints = pointsSettings.rankPoints?.second || 0;
          seconds++;
        } else if (rank === 3) {
          rankPoints = pointsSettings.rankPoints?.third || 0;
          thirds++;
        }

        const totalProgramPoints = gradePoints + rankPoints;
        participantTotalPoints += totalProgramPoints;
        gradePtsSum += gradePoints;
        rankPtsSum += rankPoints;

        calculatedProgramResults.push({
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
      programResults: calculatedProgramResults,
      totalPoints: participantTotalPoints,
      gradePointsTotal: gradePtsSum,
      rankPointsTotal: rankPtsSum,
      medals: { first: firsts, second: seconds, third: thirds },
    };
  }, [rawData, programFilter, participantId]);

  // PDF Export for Single Candidate Transcript
  const handleDownloadPDF = () => {
    if (!details) return;
    setIsDownloadingPDF(true);
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      // Header Banner
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, 210, 30, 'F');

      doc.setFillColor(245, 158, 11);
      doc.rect(0, 29.2, 210, 0.8, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text(festName.toUpperCase(), 14, 12);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(245, 158, 11);
      doc.text('OFFICIAL CANDIDATE PERFORMANCE SCORECARD & TRANSCRIPT', 14, 19);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(203, 213, 225);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 25);

      // Candidate Metadata Box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, 35, 182, 22, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(details.name, 18, 43);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Chest Number: #${details.chestNumber}   |   House: ${details.teamName}   |   Category: ${details.categoryName}`,
        18,
        50
      );

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text(`${totalPoints.toFixed(2)} pts`, 192, 45, { align: 'right' });
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL POINTS', 192, 51, { align: 'right' });

      // Program Breakdown Table
      autoTable(doc, {
        startY: 62,
        head: [['#', 'Program Event Name', 'Avg Score', 'Grade', 'Grade Pts', 'Rank', 'Rank Pts', 'Total Pts']],
        body: programResults.map((p, i) => [
          i + 1,
          p.programName,
          p.averageScore.toFixed(2),
          p.grade,
          p.gradePoints.toFixed(2),
          p.rank ? `${p.rank === 1 ? '1st' : p.rank === 2 ? '2nd' : '3rd'}` : '-',
          p.rankPoints.toFixed(2),
          p.totalProgramPoints.toFixed(2),
        ]),
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8.5,
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 10 },
          1: { cellWidth: 65, fontStyle: 'bold' },
          2: { halign: 'center', cellWidth: 20 },
          3: { halign: 'center', cellWidth: 16 },
          4: { halign: 'right', cellWidth: 20 },
          5: { halign: 'center', cellWidth: 16 },
          6: { halign: 'right', cellWidth: 18 },
          7: { halign: 'right', fontStyle: 'bold', cellWidth: 20 },
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        styles: {
          fontSize: 8,
          cellPadding: 3,
        },
        margin: { left: 14, right: 14 },
      });

      // Signature Block
      const finalY = (doc as any).lastAutoTable?.finalY || 180;
      const sigY = Math.min(finalY + 25, 260);

      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.3);

      doc.line(20, sigY, 75, sigY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(50, 50, 50);
      doc.text('General Convener', 47.5, sigY + 4.5, { align: 'center' });

      doc.line(135, sigY, 190, sigY);
      doc.text('Chief Tabulation Officer', 162.5, sigY + 4.5, { align: 'center' });

      doc.save(`Scorecard_Chest_${details.chestNumber}_${details.name}.pdf`);
      toast({
        title: 'Scorecard Downloaded',
        description: `Exported transcript for ${details.name}.`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: 'Export Failed',
        description: 'Failed to create scorecard PDF.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloadingPDF(false);
    }
  };

  // Excel Export
  const handleDownloadXLSX = () => {
    if (!details) return;
    setIsDownloadingXLSX(true);
    try {
      const dataForExport = programResults.map((p, i) => ({
        '#': i + 1,
        'Program Event': p.programName,
        'Average Score': Number(p.averageScore.toFixed(2)),
        'Letter Grade': p.grade,
        'Grade Points': Number(p.gradePoints.toFixed(2)),
        'Podium Rank': p.rank ? p.rank : 'None',
        'Rank Points': Number(p.rankPoints.toFixed(2)),
        'Total Program Points': Number(p.totalProgramPoints.toFixed(2)),
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataForExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Participant Scorecard');
      XLSX.writeFile(workbook, `Scorecard_Chest_${details.chestNumber}_${details.name}.xlsx`);

      toast({
        title: 'Excel Exported',
        description: `Exported Excel scorecard for ${details.name}.`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: 'Export Failed',
        description: 'Failed to export spreadsheet.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloadingXLSX(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
        <span className="text-sm font-medium text-muted-foreground">
          Loading Candidate Performance Transcript...
        </span>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="p-8 text-center space-y-4">
        <h2 className="text-xl font-bold">Participant Not Found</h2>
        <p className="text-muted-foreground text-sm">
          No participant was found matching the specified ID.
        </p>
        <Button onClick={() => router.push('/admin/top-candidates')}>
          Return to Leaderboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Navigation & Profile Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/admin/top-candidates')}
            className="h-9 w-9 shrink-0 shadow-2xs"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 border-2 border-primary/30 shadow-md">
              <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">
                {details.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold font-headline">{details.name}</h1>
                <Badge variant="outline" className="font-mono text-xs font-bold bg-muted/50">
                  Chest #{details.chestNumber}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                House: <span className="text-foreground font-semibold">{details.teamName}</span> •{' '}
                Category: <span className="text-foreground font-semibold">{details.categoryName}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadXLSX}
            disabled={isDownloadingXLSX}
            className="text-xs h-9 gap-1.5 shadow-2xs"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
            Export Excel
          </Button>
          <Button
            size="sm"
            onClick={handleDownloadPDF}
            disabled={isDownloadingPDF}
            className="text-xs h-9 gap-1.5 shadow-sm font-semibold"
          >
            {isDownloadingPDF ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download Scorecard PDF
          </Button>
        </div>
      </div>

      {/* Points Telemetry Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <Card className="border-border/50 bg-card/60 backdrop-blur-xs relative overflow-hidden">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Championship Points</p>
              <h3 className="text-2xl font-black font-mono tracking-tight mt-0.5 text-primary">
                {totalPoints.toFixed(2)}
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Star className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/60 backdrop-blur-xs relative overflow-hidden">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Grade Points</p>
              <h3 className="text-xl font-bold font-mono tracking-tight mt-0.5">
                {gradePointsTotal.toFixed(2)}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Performance Rubric</p>
            </div>
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
              <Award className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/60 backdrop-blur-xs relative overflow-hidden">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Rank Points</p>
              <h3 className="text-xl font-bold font-mono tracking-tight mt-0.5">
                {rankPointsTotal.toFixed(2)}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Podium Bonus</p>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500">
              <Trophy className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/60 backdrop-blur-xs relative overflow-hidden">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Podium Medals</p>
              <div className="flex items-center gap-2 mt-1 text-xs font-bold">
                {medals.first > 0 && <span className="text-amber-500">🥇 {medals.first}</span>}
                {medals.second > 0 && <span className="text-slate-300">🥈 {medals.second}</span>}
                {medals.third > 0 && <span className="text-amber-700">🥉 {medals.third}</span>}
                {medals.first === 0 && medals.second === 0 && medals.third === 0 && (
                  <span className="text-muted-foreground text-sm font-normal">None yet</span>
                )}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
              <Medal className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Program Breakdown Card */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="border-b border-border/40 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Program-wise Point Breakdown
              </CardTitle>
              <CardDescription>
                Detailed points awarded for each program participation based on the selected filter.
              </CardDescription>
            </div>

            {/* Filter Selector */}
            <Select
              value={programFilter}
              onValueChange={(value) => setProgramFilter(value as ProgramFilter)}
            >
              <SelectTrigger className="w-full sm:w-[260px] h-9 text-xs">
                <SelectValue placeholder="Filter by program type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Programs</SelectItem>
                <SelectItem value="individual">All Individual Programs</SelectItem>
                <SelectItem value="group">All Group Programs</SelectItem>
                <SelectItem value="specific">All Specific Category Programs</SelectItem>
                <SelectItem value="individual-specific">Individual Programs (Specific)</SelectItem>
                <SelectItem value="group-specific">Group Programs (Specific)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Program Event</TableHead>
                <TableHead className="text-center">Avg. Score</TableHead>
                <TableHead className="text-center">Grade</TableHead>
                <TableHead className="text-center">Grade Points</TableHead>
                <TableHead className="text-center">Rank</TableHead>
                <TableHead className="text-center">Rank Points</TableHead>
                <TableHead className="text-right pr-6">Total Program Points</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {programResults.length > 0 ? (
                programResults.map((res, i) => (
                  <TableRow key={i} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="font-semibold text-sm">{res.programName}</TableCell>
                    <TableCell className="text-center font-mono text-sm">{res.averageScore.toFixed(2)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="font-bold text-xs">
                        {res.grade}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm text-blue-500 font-semibold">
                      +{res.gradePoints.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">
                      {res.rank ? (
                        <div className="flex items-center justify-center gap-1 font-bold">
                          {res.rank === 1 && <Crown className="h-4 w-4 text-amber-500 fill-amber-500/30" />}
                          {res.rank === 2 && <Medal className="h-4 w-4 text-slate-300 fill-slate-300/30" />}
                          {res.rank === 3 && <Medal className="h-4 w-4 text-amber-700 fill-amber-700/30" />}
                          <span
                            className={
                              res.rank === 1
                                ? 'text-amber-500'
                                : res.rank === 2
                                ? 'text-slate-300'
                                : 'text-amber-700'
                            }
                          >
                            #{res.rank}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm text-amber-500 font-semibold">
                      {res.rankPoints > 0 ? `+${res.rankPoints.toFixed(2)}` : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono font-black text-primary text-base pr-6">
                      {res.totalProgramPoints.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-28 text-center text-muted-foreground text-sm">
                    This participant has no scored events matching the current program filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
