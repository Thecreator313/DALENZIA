
'use client';

import { useState, useMemo } from 'react';
import {
  collection,
  query,
  where,
  doc,
  getDocs,
  runTransaction,
  orderBy,
  limit,
} from 'firebase/firestore';
import { useParams, useRouter } from 'next/navigation';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from '@/lib/firebase';
import { useCachedDoc, useSharedCollection } from '@/context/firestore-cache';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Loader2, ArrowLeft, Download, Trophy, Megaphone, Unplug } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { Program as BaseProgram } from '@/app/admin/programs/page';
import type { Participant as BaseParticipant } from '@/app/teams/add-participants/page';
import type { Team } from '@/app/admin/teams/page';
import type { User as JudgeUser } from '@/app/admin/access-central/page';
import type { Category } from '@/app/admin/categories/page';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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


// Data types
type Program = BaseProgram & { categoryName?: string; isPublished?: boolean };
type Participant = BaseParticipant & { teamName: string };
type Assignment = { id: string; programId: string; studentId: string; teamId: string; codeLetter?: string; status?: 'cancelled' };
type Score = { programId: string; assignmentId: string; judgeId: string; score: number, review?: string };
type PointsSettings = {
  normalGradePoints: Record<string, number>;
  specialGradePoints: Record<string, Record<string, number>>;
  rankPoints: Record<string, number>;
};

type JudgeScoreDetail = {
    judgeName: string;
    score: number;
    review?: string;
}

type ParticipantResult = {
  participantId: string;
  name: string;
  chestNumber: number;
  codeLetter: string;
  teamName: string;
  averageScore: number;
  grade: string;
  rank: number;
  points: number;
  judgeScores: JudgeScoreDetail[];
};

const getGrade = (score: number) => {
  if (score >= 90) return 'A+';
  if (score >= 70) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  return 'No Grade';
};

export default function ProgramResultPage() {
  const router = useRouter();
  const params = useParams();
  const programId = params.programId as string;

  const { data: allPrograms, loading: progsLoading } = useSharedCollection<BaseProgram>('programs');
  const { data: categories, loading: catsLoading } = useSharedCollection<Category>('programCategories');
  const { data: allAssignments, loading: assignmentsLoading } = useSharedCollection<Assignment>('assignments');
  const { data: allScores, loading: scoresLoading } = useSharedCollection<Score & { id: string }>('scores');
  const { data: students, loading: studentsLoading } = useSharedCollection<BaseParticipant>('students');
  const { data: teams, loading: teamsLoading } = useSharedCollection<Team>('teams');
  const { data: allUsers, loading: usersLoading } = useSharedCollection<JudgeUser>('users');
  const { data: pointsSettings, loading: pointsLoading } = useCachedDoc<PointsSettings>(
    'doc:points:gradeAndRankPoints',
    () => doc(db, 'points', 'gradeAndRankPoints')
  );

  // UI states
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertType, setAlertType] = useState<'publish' | 'unpublish' | null>(null);

  const judges = useMemo(
    () => allUsers.filter((u) => u.role === 'judges'),
    [allUsers]
  );

  const programData = useMemo(
    () => allPrograms.find((p) => p.id === programId) ?? null,
    [allPrograms, programId]
  );

  const program = useMemo<Program | null>(() => {
    if (!programData) return null;
    const categoryName =
      categories.find((c) => c.id === programData.categoryId)?.name || 'Unknown';
    return {
      ...programData,
      categoryName,
      isPublished: programData.isPublished || false,
    };
  }, [programData, categories]);

  const assignments = useMemo(
    () => allAssignments.filter((a) => a.programId === programId),
    [allAssignments, programId]
  );

  const scores = useMemo(
    () => allScores.filter((s) => s.programId === programId),
    [allScores, programId]
  );

  const loading =
    progsLoading ||
    catsLoading ||
    assignmentsLoading ||
    scoresLoading ||
    studentsLoading ||
    teamsLoading ||
    usersLoading ||
    pointsLoading;

  const results = useMemo(() => {
    if (!programData || !pointsSettings || teams.length === 0 || students.length === 0) {
      return [];
    }

    const teamMap = new Map(teams.map(t => [t.id, t.name]));
    const judgeMap = new Map(judges.map(j => [j.id, j.name]));

    const participantResultsTemp = assignments
      .filter(a => a.codeLetter && a.status !== 'cancelled')
      .map(assignment => {
        const participant = students.find(s => s.id === assignment.studentId);
        if (!participant) return null;

        const assignmentScores = scores.filter(s => s.assignmentId === assignment.id);
        const totalScore = assignmentScores.reduce((sum, s) => sum + s.score, 0);
        const averageScore = assignmentScores.length > 0 ? totalScore / assignmentScores.length : 0;
        const grade = getGrade(averageScore);

        const judgeScores = assignmentScores.map(s => ({
            judgeName: judgeMap.get(s.judgeId) || 'Unknown Judge',
            score: s.score,
            review: s.review,
        }));

        return {
          participantId: participant.id,
          name: participant.name,
          chestNumber: participant.chestNumber,
          codeLetter: assignment.codeLetter || 'N/A',
          teamName: teamMap.get(participant.teamId) || 'Unknown Team',
          averageScore,
          grade,
          judgeScores,
        };
      })
      .filter(Boolean) as (Omit<ParticipantResult, 'rank' | 'points'> & {judgeScores: JudgeScoreDetail[]})[];

    participantResultsTemp.sort((a, b) => b.averageScore - a.averageScore);

    const finalResults: ParticipantResult[] = [];
    let currentRank = 0;
    let lastScore = -1;
    participantResultsTemp.forEach((res, index) => {
        if (res.averageScore !== lastScore) {
            currentRank++;
            lastScore = res.averageScore;
        }

        let rankPoints = 0;
        if (currentRank === 1) rankPoints = pointsSettings.rankPoints?.first || 0;
        else if (currentRank === 2) rankPoints = pointsSettings.rankPoints?.second || 0;
        else if (currentRank === 3) rankPoints = pointsSettings.rankPoints?.third || 0;

        const gradePoints = programData.markType === 'special-mark'
            ? pointsSettings.specialGradePoints?.[programId]?.[res.grade] || 0
            : pointsSettings.normalGradePoints?.[res.grade] || 0;

        const totalPoints = gradePoints + rankPoints;

        finalResults.push({ ...res, rank: currentRank, points: totalPoints });
    });
    
    return finalResults;
  }, [programId, programData, pointsSettings, assignments, scores, students, teams, judges]);


  const handleDownloadPDF = () => {
    if (!program) return;
    setIsDownloading(true);
    try {
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.text(program.name, 14, 22);
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Category: ${program.categoryName}`, 14, 30);

        autoTable(doc, {
            startY: 40,
            head: [['Rank', 'Code', 'Participant', 'Chest No.', 'Team', 'Points', 'Grade']],
            body: results.map(r => [
                r.rank,
                r.codeLetter,
                r.name,
                r.chestNumber,
                r.teamName,
                r.points.toFixed(2),
                r.grade,
            ]),
            headStyles: { fillColor: [22, 163, 74] },
        });

        doc.save(`results-${program.name.replace(/ /g, '_')}.pdf`);
    } catch(e) {
        toast({title: "Error", description: "Failed to generate PDF.", variant: "destructive"})
    } finally {
        setIsDownloading(false);
    }
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    if (!program) return;

    try {
        // Find the next available result number (only fetch the highest 1 document)
        const publishedResultsQuery = query(collection(db, 'publishedResults'), orderBy('resultNumber', 'desc'), limit(1));
        const publishedResultsSnap = await getDocs(publishedResultsQuery);
        let nextResultNumber = 1;
        if (!publishedResultsSnap.empty) {
            nextResultNumber = publishedResultsSnap.docs[0].data().resultNumber + 1;
        }

        await runTransaction(db, async (transaction) => {
            const winners: Record<string, {name: string, teamName: string}[]> = { '1': [], '2': [], '3': [] };
            
            results.forEach(res => {
                if (res.rank <= 3) {
                    if (!winners[res.rank]) {
                        winners[res.rank] = [];
                    }
                    winners[res.rank].push({ name: res.name, teamName: res.teamName });
                }
            });

            const newPublishedResultRef = doc(collection(db, 'publishedResults'));
            transaction.set(newPublishedResultRef, {
                programId: program.id,
                programName: program.name,
                categoryName: program.categoryName,
                resultNumber: nextResultNumber,
                winners: winners,
                publishedAt: new Date(),
            });
            
            const programRef = doc(db, 'programs', program.id);
            transaction.update(programRef, { isPublished: true, judgingStatus: 'closed' });
        });
        
        toast({ title: "Success!", description: "Results have been published to the homepage." });
    } catch (e) {
        console.error(e);
        toast({ title: "Error", description: "Failed to publish results.", variant: "destructive" });
    } finally {
        setIsPublishing(false);
        setIsAlertOpen(false);
    }
  };

  const handleUnpublish = async () => {
    setIsUnpublishing(true);
    if (!program) return;

    try {
      const q = query(collection(db, "publishedResults"), where("programId", "==", program.id));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        throw new Error("Published result document not found.");
      }

      const publishedResultDoc = querySnapshot.docs[0];

      await runTransaction(db, async (transaction) => {
        const programRef = doc(db, 'programs', program.id);
        transaction.update(programRef, { isPublished: false });
        transaction.delete(publishedResultDoc.ref);
      });

      toast({ title: "Success!", description: "Results have been unpublished and removed from the homepage." });

    } catch (e) {
        console.error(e);
        toast({ title: "Error", description: "Failed to unpublish results.", variant: "destructive" });
    } finally {
        setIsUnpublishing(false);
        setIsAlertOpen(false);
    }
  };
  
  const openAlertDialog = (type: 'publish' | 'unpublish') => {
    setAlertType(type);
    setIsAlertOpen(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="mr-2 h-8 w-8 animate-spin" />
        <span>Calculating Final Results...</span>
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
                <h1 className="text-3xl font-bold font-headline">{program?.name || 'Results'}</h1>
                <p className="text-muted-foreground">{program?.categoryName}</p>
            </div>
        </div>
        <div className="flex items-center gap-2">
            <Button onClick={handleDownloadPDF} disabled={isDownloading} variant="outline">
                {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Download PDF
            </Button>
            {program?.isPublished ? (
                 <Button onClick={() => openAlertDialog('unpublish')} disabled={isUnpublishing} variant="destructive">
                    {isUnpublishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unplug className="mr-2 h-4 w-4" />}
                    Unpublish
                </Button>
            ) : (
                <Button onClick={() => openAlertDialog('publish')} disabled={isPublishing}>
                    {isPublishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Megaphone className="mr-2 h-4 w-4" />}
                    Publish Result
                </Button>
            )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Final Standings</CardTitle>
          <CardDescription>
            Results are ranked by average score. Click on a participant to see detailed scores.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <Accordion type="multiple" className="w-full space-y-2">
                {results.map((result) => (
                    <AccordionItem value={result.participantId} key={result.participantId} className="border-b-0 rounded-lg border overflow-hidden">
                        <AccordionTrigger className="hover:no-underline px-4 py-2 text-base data-[state=open]:bg-muted/50">
                            <div className="grid grid-cols-6 w-full text-left items-center">
                                <div className="font-bold text-lg text-center flex items-center gap-2 col-span-1">
                                    {result.rank <= 3 && <Trophy className={`h-5 w-5 ${result.rank === 1 ? 'text-yellow-500' : result.rank === 2 ? 'text-gray-400' : 'text-amber-700'}`} />}
                                    <span>{result.rank}</span>
                                </div>
                                <div className="col-span-2">
                                     <div className="flex items-center gap-3">
                                        <Avatar>
                                            <AvatarFallback>{result.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="font-medium text-sm">{result.name}</p>
                                            <p className="text-xs text-muted-foreground">Chest: {result.chestNumber}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-sm col-span-1">{result.teamName}</div>
                                <div className="text-center font-mono font-bold text-lg col-span-1">{result.points.toFixed(2)}</div>
                                <div className="text-center col-span-1">
                                    <Badge className="text-base">{result.grade}</Badge>
                                </div>
                            </div>
                        </AccordionTrigger>
                         <AccordionContent>
                            <div className="p-4 bg-muted/30 border-t space-y-4">
                               <div className="flex justify-between items-center bg-background p-3 rounded-md border">
                                    <h4 className="font-semibold">Final Average Score</h4>
                                    <p className="font-bold text-2xl font-mono">{result.averageScore.toFixed(2)}</p>
                               </div>
                               <h4 className="font-semibold pt-2">Judge-wise Breakdown</h4>
                               <Table>
                                 <TableHeader>
                                    <TableRow>
                                        <TableHead>Judge</TableHead>
                                        <TableHead className="text-right">Score</TableHead>
                                        <TableHead>Review</TableHead>
                                    </TableRow>
                                 </TableHeader>
                                 <TableBody>
                                    {result.judgeScores.map((s, i) => (
                                        <TableRow key={i}>
                                            <TableCell className="font-medium">{s.judgeName}</TableCell>
                                            <TableCell className="text-right font-mono">{s.score.toFixed(2)}</TableCell>
                                            <TableCell className="text-muted-foreground italic">"{s.review || 'No review provided'}"</TableCell>
                                        </TableRow>
                                    ))}
                                 </TableBody>
                               </Table>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
             {results.length === 0 && (
                <div className="h-24 text-center text-muted-foreground flex items-center justify-center">No results to display.</div>
              )}
        </CardContent>
      </Card>
        
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                      {alertType === 'publish'
                        ? `This will make the top 3 rank holders for "${program?.name}" visible to the public on the homepage. Judging will be automatically closed. This action can be undone.`
                        : `This will remove the published result for "${program?.name}" from the public homepage. You will be able to publish it again later.`
                      }
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={alertType === 'publish' ? handlePublish : handleUnpublish}>
                      {alertType === 'publish' ? 'Yes, Publish' : 'Yes, Unpublish'}
                  </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

    </div>
  );
}
