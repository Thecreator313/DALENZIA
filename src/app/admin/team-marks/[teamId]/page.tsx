
'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  getFirestore,
  onSnapshot,
  getDocs,
  doc,
  query,
  where,
  getDoc
} from 'firebase/firestore';
import { app } from '@/lib/firebase';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Loader2, ArrowLeft } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { Program } from '@/app/admin/programs/page';
import type { Participant as BaseParticipant } from '@/app/teams/add-participants/page';
import type { Team } from '@/app/admin/teams/page';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

const db = getFirestore(app);

// Data types
type Assignment = { id: string; programId: string; studentId: string; teamId: string; status?: 'cancelled' };
type Score = { programId: string; assignmentId: string; judgeId:string; score: number };
type PointsSettings = {
  normalGradePoints: Record<string, number>;
  specialGradePoints: Record<string, Record<string, number>>;
  rankPoints: Record<string, number>;
};

type ParticipantWithPoints = BaseParticipant & {
    totalPoints: number;
    programResults: {
        programName: string;
        averageScore: number;
        grade: string;
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

  const [team, setTeam] = useState<Team | null>(null);
  const [participantResults, setParticipantResults] = useState<ParticipantWithPoints[]>([]);
  const [teamTotalPoints, setTeamTotalPoints] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;

    const calculateTeamDetails = async () => {
      setLoading(true);
      try {
        const teamDoc = await getDoc(doc(db, 'teams', teamId));
        if (!teamDoc.exists()) throw new Error("Team not found");
        setTeam({id: teamDoc.id, ...teamDoc.data()} as Team);

        // Fetch all data required for calculations globally, not just for one team
        const [
          programsSnap,
          allParticipantsSnap,
          allAssignmentsSnap,
          allScoresSnap,
          pointsSnap,
        ] = await Promise.all([
          getDocs(collection(db, 'programs')),
          getDocs(collection(db, 'students')),
          getDocs(collection(db, 'assignments')),
          getDocs(collection(db, 'scores')),
          getDoc(doc(db, 'points', 'gradeAndRankPoints')),
        ]);
        
        const allPrograms = programsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Program);
        const publishedPrograms = allPrograms.filter(p => p.isPublished);
        const publishedProgramIds = new Set(publishedPrograms.map(p => p.id));

        const teamParticipants = allParticipantsSnap.docs
            .filter(doc => doc.data().teamId === teamId)
            .map(d => ({ id: d.id, ...d.data() }) as BaseParticipant);

        const allAssignments = allAssignmentsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Assignment);
        const allScores = allScoresSnap.docs.map(d => d.data() as Score);
        
        const pointsSettings: PointsSettings = (pointsSnap.data() as PointsSettings) || {
          normalGradePoints: {}, specialGradePoints: {}, rankPoints: {},
        };

        // Pre-calculate scores and ranks for every published program
        const programScoresCache: Record<string, { assignmentId: string, averageScore: number }[]> = {};
        for (const program of publishedPrograms) {
          const programAssignments = allAssignments.filter(a => a.programId === program.id && a.status !== 'cancelled');
          const scoresList = programAssignments.map(pa => {
              const assignmentScores = allScores.filter(s => s.assignmentId === pa.id);
              if (assignmentScores.length === 0) return null;
              const totalScore = assignmentScores.reduce((sum, s) => sum + s.score, 0);
              return { assignmentId: pa.id, averageScore: totalScore / assignmentScores.length };
          }).filter(Boolean) as { assignmentId: string, averageScore: number }[];
          
          scoresList.sort((a,b) => b.averageScore - a.averageScore);
          programScoresCache[program.id] = scoresList;
        }

        const results = teamParticipants.map(participant => {
            let participantTotalPoints = 0;
            const programResults: ParticipantWithPoints['programResults'] = [];
            
            // Get assignments only for the current participant
            const participantAssignments = allAssignments.filter(a => a.studentId === participant.id && a.status !== 'cancelled' && publishedProgramIds.has(a.programId));
            
            for (const assignment of participantAssignments) {
                const program = publishedPrograms.find(p => p.id === assignment.programId);
                if (!program) continue;

                const scoresForProgram = programScoresCache[program.id];
                if (!scoresForProgram) continue;

                const participantScoreData = scoresForProgram.find(s => s.assignmentId === assignment.id);
                
                if (participantScoreData) {
                    const { averageScore } = participantScoreData;
                    const grade = getGrade(averageScore);
                    
                    const gradePoints = program.markType === 'special-mark'
                        ? pointsSettings.specialGradePoints?.[program.id]?.[grade] || 0
                        : pointsSettings.normalGradePoints?.[grade] || 0;
                    
                    // Determine rank based on the pre-calculated sorted list
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
                    programResults.push({ programName: program.name, averageScore, grade, points: totalProgramPoints });
                }
            }
            return { ...participant, totalPoints: participantTotalPoints, programResults };
        });

        results.sort((a,b) => b.totalPoints - a.totalPoints);
        setParticipantResults(results);
        setTeamTotalPoints(results.reduce((sum, r) => sum + r.totalPoints, 0));

      } catch (error) {
        console.error("Error calculating team details:", error);
        toast({ title: "Error", description: "Could not load team details.", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    
    calculateTeamDetails();
    
  }, [teamId]);


  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="mr-2 h-8 w-8 animate-spin" />
        <span>Loading Team Report...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
                <h1 className="text-3xl font-bold font-headline">{team?.name || 'Team Report'}</h1>
                <p className="text-muted-foreground">
                    Total Points: <span className="font-bold font-mono text-foreground">{teamTotalPoints.toFixed(2)}</span>
                </p>
            </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Participant Breakdown</CardTitle>
          <CardDescription>
            Points earned by each participant in the team from published programs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full space-y-2">
            {participantResults.map(participant => (
              <AccordionItem value={participant.id} key={participant.id} className="border-b-0 rounded-lg border overflow-hidden">
                <AccordionTrigger className="hover:no-underline px-4 py-2 text-base data-[state=open]:bg-muted/50">
                    <div className="grid grid-cols-4 w-full text-left items-center">
                        <div className="flex items-center gap-3 col-span-2">
                            <Avatar>
                                <AvatarFallback>{participant.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div>
                                <p className="font-medium text-sm">{participant.name}</p>
                                <p className="text-xs text-muted-foreground">Chest: {participant.chestNumber}</p>
                            </div>
                        </div>
                        <div className="text-sm col-span-2 text-right font-mono font-bold text-lg">
                            {participant.totalPoints.toFixed(2)} Points
                        </div>
                    </div>
                </AccordionTrigger>
                <AccordionContent>
                    <div className="p-4 bg-muted/30 border-t space-y-4">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Program</TableHead>
                                    <TableHead className="text-center">Score</TableHead>
                                    <TableHead className="text-center">Grade</TableHead>
                                    <TableHead className="text-right">Points Earned</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {participant.programResults.length > 0 ? participant.programResults.map((res, i) => (
                                    <TableRow key={i}>
                                        <TableCell className="font-medium">{res.programName}</TableCell>
                                        <TableCell className="text-center font-mono">{res.averageScore.toFixed(2)}</TableCell>
                                        <TableCell className="text-center"><Badge>{res.grade}</Badge></TableCell>
                                        <TableCell className="text-right font-mono">{res.points.toFixed(2)}</TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                            This participant has not earned any points from published programs yet.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

    </div>
  );
}
