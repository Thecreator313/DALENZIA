'use client';

import { useState, useMemo } from 'react';
import { doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCachedDoc, useSharedCollection, useAppSettings } from '@/context/firestore-cache';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Loader2,
  ArrowLeft,
  Search,
  Download,
  FileSpreadsheet,
  Printer,
  Users,
  Trophy,
  Award,
  Medal,
  Star,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { Program } from '@/app/admin/programs/page';
import type { Participant as BaseParticipant } from '@/app/teams/add-participants/page';
import type { Team } from '@/app/admin/teams/page';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// Data types
type Assignment = { id: string; programId: string; studentId: string; teamId: string; status?: 'cancelled' };
type Score = { programId: string; assignmentId: string; judgeId: string; score: number };
type PointsSettings = {
  normalGradePoints: Record<string, number>;
  specialGradePoints: Record<string, Record<string, number>>;
  rankPoints: Record<string, number>;
};

type ParticipantWithPoints = BaseParticipant & {
  totalPoints: number;
  gradePoints: number;
  rankPoints: number;
  programResults: {
    programName: string;
    averageScore: number;
    grade: string;
    rank: number;
    gradePoints: number;
    rankPoints: number;
    points: number;
  }[];
};

const getGrade = (score: number) => {
  if (score >= 90) return 'A+';
  if (score >= 70) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  return 'No Grade';
};

export default function TeamMarkDetailPage() {
  const router = useRouter();
  const params = useParams();
  const teamId = params.teamId as string;
  const { settings } = useAppSettings();
  const festName = settings?.festName || 'DALENZIA ARTS FEST';

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'scored' | 'unscored'>('all');
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const { data: teams, loading: teamsLoading } = useSharedCollection<Team>('teams');
  const { data: allPrograms, loading: progsLoading } = useSharedCollection<Program>('programs');
  const { data: allParticipants, loading: studentsLoading } = useSharedCollection<BaseParticipant>('students');
  const { data: allAssignments, loading: assignmentsLoading } = useSharedCollection<Assignment>('assignments');
  const { data: allScores, loading: scoresLoading } = useSharedCollection<Score & { id: string }>('scores');
  const { data: pointsDoc, loading: pointsLoading } = useCachedDoc<PointsSettings>(
    'doc:points:gradeAndRankPoints',
    () => doc(db, 'points', 'gradeAndRankPoints')
  );

  const loading =
    teamsLoading || progsLoading || studentsLoading || assignmentsLoading || scoresLoading || pointsLoading;

  const team = useMemo(
    () => teams.find((t) => t.id === teamId) ?? null,
    [teams, teamId]
  );

  const { participantResults, teamTotalPoints, teamGradePoints, teamRankPoints, topScorer } = useMemo(() => {
    if (loading || !team) {
      return {
        participantResults: [],
        teamTotalPoints: 0,
        teamGradePoints: 0,
        teamRankPoints: 0,
        topScorer: null,
      };
    }

    const publishedPrograms = allPrograms.filter((p) => p.isPublished);
    const publishedProgramIds = new Set(publishedPrograms.map((p) => p.id));
    const teamParticipants = allParticipants.filter((p) => p.teamId === teamId);
    const pointsSettings: PointsSettings = pointsDoc || {
      normalGradePoints: {},
      specialGradePoints: {},
      rankPoints: {},
    };

    const programScoresCache: Record<string, { assignmentId: string; averageScore: number }[]> = {};
    for (const program of publishedPrograms) {
      const programAssignments = allAssignments.filter(
        (a) => a.programId === program.id && a.status !== 'cancelled'
      );
      const scoresList = programAssignments
        .map((pa) => {
          const assignmentScores = allScores.filter((s) => s.assignmentId === pa.id);
          if (assignmentScores.length === 0) return null;
          const totalScore = assignmentScores.reduce((sum, s) => sum + s.score, 0);
          return { assignmentId: pa.id, averageScore: totalScore / assignmentScores.length };
        })
        .filter(Boolean) as { assignmentId: string; averageScore: number }[];

      scoresList.sort((a, b) => b.averageScore - a.averageScore);
      programScoresCache[program.id] = scoresList;
    }

    let sumGradePoints = 0;
    let sumRankPoints = 0;

    const results: ParticipantWithPoints[] = teamParticipants.map((participant) => {
      let participantTotalPoints = 0;
      let participantGradePoints = 0;
      let participantRankPoints = 0;
      const programResults: ParticipantWithPoints['programResults'] = [];

      const participantAssignments = allAssignments.filter(
        (a) =>
          a.studentId === participant.id &&
          a.status !== 'cancelled' &&
          publishedProgramIds.has(a.programId)
      );

      for (const assignment of participantAssignments) {
        const program = publishedPrograms.find((p) => p.id === assignment.programId);
        if (!program) continue;

        const scoresForProgram = programScoresCache[program.id];
        if (!scoresForProgram) continue;

        const participantScoreData = scoresForProgram.find(
          (s) => s.assignmentId === assignment.id
        );

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
          if (rank === 1) rankPoints = pointsSettings.rankPoints?.first || 0;
          else if (rank === 2) rankPoints = pointsSettings.rankPoints?.second || 0;
          else if (rank === 3) rankPoints = pointsSettings.rankPoints?.third || 0;

          const totalProgramPoints = gradePoints + rankPoints;
          participantTotalPoints += totalProgramPoints;
          participantGradePoints += gradePoints;
          participantRankPoints += rankPoints;

          programResults.push({
            programName: program.name,
            averageScore,
            grade,
            rank,
            gradePoints,
            rankPoints,
            points: totalProgramPoints,
          });
        }
      }

      sumGradePoints += participantGradePoints;
      sumRankPoints += participantRankPoints;

      return {
        ...participant,
        totalPoints: participantTotalPoints,
        gradePoints: participantGradePoints,
        rankPoints: participantRankPoints,
        programResults,
      };
    });

    results.sort((a, b) => b.totalPoints - a.totalPoints);

    return {
      participantResults: results,
      teamTotalPoints: results.reduce((sum, r) => sum + r.totalPoints, 0),
      teamGradePoints: sumGradePoints,
      teamRankPoints: sumRankPoints,
      topScorer: results[0] || null,
    };
  }, [loading, team, teamId, allPrograms, allParticipants, allAssignments, allScores, pointsDoc]);

  // Filtered participant results
  const filteredParticipants = useMemo(() => {
    return participantResults.filter((p) => {
      const matchesSearch =
        searchTerm === '' ||
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(p.chestNumber).includes(searchTerm);

      if (!matchesSearch) return false;

      if (filterType === 'scored') return p.totalPoints > 0;
      if (filterType === 'unscored') return p.totalPoints === 0;
      return true;
    });
  }, [participantResults, searchTerm, filterType]);

  // Export to Excel
  const handleExportExcel = () => {
    try {
      const rows = participantResults.map((p, idx) => ({
        'Rank': idx + 1,
        'Chest No.': p.chestNumber,
        'Name': p.name,
        'Programs Scored': p.programResults.length,
        'Grade Points': Number(p.gradePoints.toFixed(2)),
        'Position Points': Number(p.rankPoints.toFixed(2)),
        'Total Points': Number(p.totalPoints.toFixed(2)),
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, `${team?.name || 'Team'} Contenders`);

      const cleanTeam = (team?.name || 'team').toLowerCase().replace(/\s+/g, '-');
      XLSX.writeFile(workbook, `${cleanTeam}-marks-breakdown.xlsx`);

      toast({
        title: 'Excel Export Complete',
        description: 'Team participant breakdown exported successfully.',
      });
    } catch (e) {
      console.error(e);
      toast({
        title: 'Export Failed',
        description: 'Could not export team report to Excel.',
        variant: 'destructive',
      });
    }
  };

  // Export to PDF
  const handleExportPdf = () => {
    setIsDownloadingPdf(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header Banner
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 28, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(255, 255, 255);
      doc.text(`${festName.toUpperCase()} - HOUSE REPORT`, 14, 12);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(203, 213, 225);
      doc.text(`House: ${team?.name || 'Team'} | Total Score: ${teamTotalPoints.toFixed(2)} pts`, 14, 19);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 25);

      autoTable(doc, {
        startY: 34,
        head: [['Rank', 'Chest No.', 'Participant Name', 'Programs Scored', 'Grade Pts', 'Rank Pts', 'Total Points']],
        body: participantResults.map((p, i) => [
          `#${i + 1}`,
          p.chestNumber,
          p.name,
          p.programResults.length,
          p.gradePoints.toFixed(2),
          p.rankPoints.toFixed(2),
          p.totalPoints.toFixed(2),
        ]),
        headStyles: {
          fillColor: [217, 119, 6],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
      });

      const cleanTeam = (team?.name || 'team').toLowerCase().replace(/\s+/g, '-');
      doc.save(`${cleanTeam}-marks-report.pdf`);

      toast({
        title: 'PDF Downloaded',
        description: 'Team participant marks report generated.',
      });
    } catch (e) {
      console.error(e);
      toast({
        title: 'PDF Failed',
        description: 'Could not create PDF report.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-amber-500/20 blur-xl animate-pulse" />
          <Loader2 className="h-10 w-10 animate-spin text-amber-500 relative z-10" />
        </div>
        <span className="text-muted-foreground animate-pulse mt-4 text-sm font-medium">
          Loading House Report...
        </span>
      </div>
    );
  }

  const activeScorersCount = participantResults.filter((p) => p.totalPoints > 0).length;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Bar Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/admin/team-marks')}
            className="rounded-xl border-border/50 hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-headline">
                {team?.name || 'House Report'}
              </h1>
              <Badge variant="outline" className="border-amber-500/30 text-amber-500 bg-amber-500/5 text-xs">
                House Marks
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Official participant points breakdown from published programs.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="border-border/60 hover:bg-muted text-xs rounded-xl"
          >
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Print
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="border-border/60 hover:bg-muted text-xs rounded-xl"
          >
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPdf}
            disabled={isDownloadingPdf}
            className="border-border/60 hover:bg-muted text-xs rounded-xl"
          >
            {isDownloadingPdf ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin text-amber-500" />
            ) : (
              <Download className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
            )}
            PDF Report
          </Button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 no-print">
        {/* Total Points */}
        <Card className="border-border/50 bg-card/40 backdrop-blur-sm p-4">
          <p className="text-xs text-muted-foreground font-medium">Total House Points</p>
          <p className="text-2xl font-black font-mono text-amber-500 mt-1">
            {teamTotalPoints.toFixed(2)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Grade: {teamGradePoints.toFixed(1)} | Rank: {teamRankPoints.toFixed(1)}
          </p>
        </Card>

        {/* Active Scorers */}
        <Card className="border-border/50 bg-card/40 backdrop-blur-sm p-4">
          <p className="text-xs text-muted-foreground font-medium">Scoring Contenders</p>
          <p className="text-2xl font-black font-mono text-foreground mt-1">
            {activeScorersCount}{' '}
            <span className="text-xs font-normal text-muted-foreground">/ {participantResults.length}</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {participantResults.length > 0
              ? Math.round((activeScorersCount / participantResults.length) * 100)
              : 0}% participation rate
          </p>
        </Card>

        {/* Top Contender */}
        <Card className="border-border/50 bg-card/40 backdrop-blur-sm p-4 col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 text-amber-500" />
                Leading Contender
              </p>
              <p className="text-base font-bold truncate mt-1">
                {topScorer?.name || 'None'}
              </p>
              <p className="text-xs text-muted-foreground">
                Chest No: {topScorer?.chestNumber}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xl font-black font-mono text-foreground">
                {topScorer?.totalPoints.toFixed(2) || '0.00'}
              </span>
              <span className="text-xs text-muted-foreground ml-1">pts</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Contenders Breakdown Card */}
      <Card className="border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-amber-500" />
                Participant Breakdown
              </CardTitle>
              <CardDescription className="text-xs">
                Detailed scores and grade contributions per student.
              </CardDescription>
            </div>

            {/* Filter and Search */}
            <div className="flex flex-wrap items-center gap-2.5 no-print">
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search name or chest..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-xs bg-background/50 border-border/50 rounded-xl"
                />
              </div>

              <Select value={filterType} onValueChange={(val: any) => setFilterType(val)}>
                <SelectTrigger className="w-[130px] h-9 text-xs rounded-xl bg-background/50 border-border/50">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ({participantResults.length})</SelectItem>
                  <SelectItem value="scored">Scored Only ({activeScorersCount})</SelectItem>
                  <SelectItem value="unscored">Zero Points ({participantResults.length - activeScorersCount})</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4">
          <Accordion type="multiple" className="w-full space-y-2">
            {filteredParticipants.map((participant, index) => (
              <AccordionItem
                value={participant.id}
                key={participant.id}
                className="border rounded-xl overflow-hidden border-border/40 bg-background/50 transition-colors"
              >
                <AccordionTrigger className="hover:no-underline px-4 py-3 text-base data-[state=open]:bg-muted/40">
                  <div className="grid grid-cols-12 w-full text-left items-center pr-3">
                    <div className="flex items-center gap-3 col-span-8 sm:col-span-9">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted font-mono text-xs font-bold text-muted-foreground shrink-0">
                        #{index + 1}
                      </div>
                      <Avatar className="h-8 w-8 border border-border/60 shrink-0">
                        <AvatarFallback className="text-xs font-bold bg-muted/60">
                          {participant.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{participant.name}</p>
                        <p className="text-[11px] text-muted-foreground font-mono">
                          Chest No: {participant.chestNumber} • {participant.programResults.length} Event(s)
                        </p>
                      </div>
                    </div>
                    <div className="col-span-4 sm:col-span-3 text-right">
                      <span className="font-mono font-black text-base text-foreground">
                        {participant.totalPoints.toFixed(2)}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">pts</span>
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent>
                  <div className="p-4 bg-muted/20 border-t border-border/40 space-y-3">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/40 hover:bg-transparent">
                          <TableHead className="text-xs">Program</TableHead>
                          <TableHead className="text-center text-xs">Avg Score</TableHead>
                          <TableHead className="text-center text-xs">Grade</TableHead>
                          <TableHead className="text-center text-xs">Rank</TableHead>
                          <TableHead className="text-right text-xs">Points Earned</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {participant.programResults.length > 0 ? (
                          participant.programResults.map((res, i) => (
                            <TableRow key={i} className="border-border/40 hover:bg-muted/30">
                              <TableCell className="font-medium text-xs sm:text-sm">
                                {res.programName}
                              </TableCell>
                              <TableCell className="text-center font-mono text-xs">
                                {res.averageScore.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  variant="outline"
                                  className={`text-xs font-semibold ${
                                    res.grade === 'A+'
                                      ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5'
                                      : res.grade === 'A'
                                      ? 'border-blue-500/30 text-blue-500 bg-blue-500/5'
                                      : 'border-muted text-muted-foreground'
                                  }`}
                                >
                                  {res.grade}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                {res.rank === 1 ? (
                                  <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-[11px]">
                                    🥇 1st
                                  </Badge>
                                ) : res.rank === 2 ? (
                                  <Badge variant="outline" className="border-slate-400 text-slate-400 text-[11px]">
                                    🥈 2nd
                                  </Badge>
                                ) : res.rank === 3 ? (
                                  <Badge variant="outline" className="border-amber-700 text-amber-700 text-[11px]">
                                    🥉 3rd
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground font-mono">
                                    {res.rank > 0 ? `#${res.rank}` : '-'}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono font-bold text-xs sm:text-sm">
                                {res.points.toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="h-20 text-center text-xs text-muted-foreground">
                              This participant has not earned points from any published program yet.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}

            {filteredParticipants.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No participants match your search criteria.
              </div>
            )}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
