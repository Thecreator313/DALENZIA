
'use client';

import { useState, useMemo } from 'react';
import { doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCachedDoc, useSharedCollection } from '@/context/firestore-cache';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Trophy } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { Program as BaseProgram } from '@/app/admin/programs/page';
import type { Participant as BaseParticipant } from '@/app/teams/add-participants/page';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Category } from '@/app/admin/categories/page';
import type { Team } from '@/app/admin/teams/page';

type Program = BaseProgram & { isGeneral?: boolean };
type Assignment = { id: string; programId: string; studentId: string; teamId: string; status?: 'cancelled' };
type Score = { programId: string; assignmentId: string; judgeId:string; score: number };
type PointsSettings = {
  normalGradePoints: Record<string, number>;
  specialGradePoints: Record<string, Record<string, number>>;
  rankPoints: Record<string, number>;
};

type ProgramResult = {
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
}

type ProgramFilter =
  | 'all'
  | 'individual'
  | 'group'
  | 'specific'
  | 'individual-specific'
  | 'group-specific';

// Raw data state
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

  const { data: students, loading: studentsLoading } = useSharedCollection<BaseParticipant>('students');
  const { data: teams, loading: teamsLoading } = useSharedCollection<Team>('teams');
  const { data: rawPrograms, loading: progsLoading } = useSharedCollection<Program>('programs');
  const { data: assignments, loading: assignmentsLoading } = useSharedCollection<Assignment>('assignments');
  const { data: scores, loading: scoresLoading } = useSharedCollection<Score & { id: string }>('scores');
  const { data: programCategories, loading: catsLoading } = useSharedCollection<Category>('programCategories');
  const { data: pointsSettings, loading: pointsLoading } = useCachedDoc<PointsSettings>(
    'doc:points:gradeAndRankPoints',
    () => doc(db, 'points', 'gradeAndRankPoints')
  );

  const loading =
    studentsLoading ||
    teamsLoading ||
    progsLoading ||
    assignmentsLoading ||
    scoresLoading ||
    catsLoading ||
    pointsLoading;

  const details = useMemo<ParticipantDetails | null>(() => {
    const participant = students.find((s) => s.id === participantId);
    if (!participant) return null;
    const teamName = teams.find((t) => t.id === participant.teamId)?.name || 'Unknown Team';
    return {
      participantId: participant.id,
      name: participant.name,
      chestNumber: participant.chestNumber,
      teamName,
    };
  }, [students, teams, participantId]);

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

  // Perform calculations based on raw data and filters
  const { programResults, totalPoints } = useMemo(() => {
    if (!rawData) return { programResults: [], totalPoints: 0 };
    
    const { programs, assignments, scores, pointsSettings, programCategories } = rawData;
    const generalCategoryIds = programCategories.filter(c => c.isGeneral).map(c => c.id);

    const filteredPrograms = programs.filter(p => {
        if (programFilter === 'all') return true;
        const isSpecific = !generalCategoryIds.includes(p.categoryId);
        switch (programFilter) {
            case 'individual': return p.type === 'individual';
            case 'group': return p.type === 'group';
            case 'specific': return isSpecific;
            case 'individual-specific': return p.type === 'individual' && isSpecific;
            case 'group-specific': return p.type === 'group' && isSpecific;
            default: return true;
        }
    });

    const programScoresCache: Record<string, { assignmentId: string, averageScore: number }[]> = {};
    let participantTotalPoints = 0;
    const calculatedProgramResults: ProgramResult[] = [];
    
    const participantAssignments = assignments.filter(a => a.studentId === participantId && a.status !== 'cancelled');
    
    for (const assignment of participantAssignments) {
        const program = filteredPrograms.find(p => p.id === assignment.programId);
        if (!program) continue;

        if (!programScoresCache[program.id]) {
            const programAssignments = assignments.filter(a => a.programId === program.id && a.status !== 'cancelled');
            const scoresList = programAssignments.map(pa => {
                const assignmentScores = scores.filter(s => s.assignmentId === pa.id);
                if (assignmentScores.length === 0) return null;
                const totalScore = assignmentScores.reduce((sum, s) => sum + s.score, 0);
                return { assignmentId: pa.id, averageScore: totalScore / assignmentScores.length };
            }).filter(Boolean) as { assignmentId: string, averageScore: number }[];
            scoresList.sort((a,b) => b.averageScore - a.averageScore);
            programScoresCache[program.id] = scoresList;
        }

        const scoresForProgram = programScoresCache[program.id];
        const participantScoreData = scoresForProgram.find(s => s.assignmentId === assignment.id);
        
        if (participantScoreData) {
            const { averageScore } = participantScoreData;
            const grade = getGrade(averageScore);
            
            const gradePoints = program.markType === 'special-mark'
                ? pointsSettings.specialGradePoints?.[program.id]?.[grade] || 0
                : pointsSettings.normalGradePoints?.[grade] || 0;
            
            let rank = 0;
            let lastScore = -1;
            for (let i = 0; i < scoresForProgram.length; i++) {
                if(scoresForProgram[i].averageScore !== lastScore) {
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
            calculatedProgramResults.push({ programName: program.name, averageScore, grade, gradePoints, rank, rankPoints, totalProgramPoints });
        }
    }
    
    return { programResults: calculatedProgramResults, totalPoints: participantTotalPoints };

  }, [rawData, programFilter, participantId]);


  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="mr-2 h-8 w-8 animate-spin" />
        <span>Loading Participant Report...</span>
      </div>
    );
  }

  if (!details) {
      return <div>Participant not found.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                    <AvatarFallback>{details.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                    <h1 className="text-3xl font-bold font-headline">{details.name}</h1>
                    <p className="text-muted-foreground">
                        Chest No: {details.chestNumber} | Team: {details.teamName}
                    </p>
                </div>
            </div>
        </div>
        <Card className="p-4 text-center sm:text-left">
            <p className="text-sm text-muted-foreground">Total Points (Filtered)</p>
            <p className="text-3xl font-bold font-mono">{totalPoints.toFixed(2)}</p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Program-wise Point Breakdown</CardTitle>
              <CardDescription>
                Detailed points awarded for each program participation based on the selected filter.
              </CardDescription>
            </div>
            <Select value={programFilter} onValueChange={(value) => setProgramFilter(value as ProgramFilter)}>
                <SelectTrigger className="w-full sm:w-[300px]"><SelectValue placeholder="Filter by program type" /></SelectTrigger>
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
        <CardContent>
          <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Program</TableHead>
                    <TableHead className="text-center">Avg. Score</TableHead>
                    <TableHead className="text-center">Grade</TableHead>
                    <TableHead className="text-center">Grade Points</TableHead>
                    <TableHead className="text-center">Rank</TableHead>
                    <TableHead className="text-center">Rank Points</TableHead>
                    <TableHead className="text-right">Total Program Points</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {programResults.length > 0 ? programResults.map((res, i) => (
                    <TableRow key={i}>
                        <TableCell className="font-medium">{res.programName}</TableCell>
                        <TableCell className="text-center font-mono">{res.averageScore.toFixed(2)}</TableCell>
                        <TableCell className="text-center"><Badge>{res.grade}</Badge></TableCell>
                        <TableCell className="text-center font-mono">{res.gradePoints.toFixed(2)}</TableCell>
                        <TableCell className="text-center">
                            {res.rank ? (
                                <div className="flex items-center justify-center gap-1">
                                    {res.rank <=3 && <Trophy className={`h-4 w-4 ${res.rank === 1 ? 'text-yellow-500' : res.rank === 2 ? 'text-gray-400' : 'text-amber-700'}`} />}
                                    <span>{res.rank}</span>
                                </div>
                            ) : '-'}
                        </TableCell>
                        <TableCell className="text-center font-mono">{res.rankPoints.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{res.totalProgramPoints.toFixed(2)}</TableCell>
                    </TableRow>
                )) : (
                    <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                            This participant has no points matching the current filter.
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
