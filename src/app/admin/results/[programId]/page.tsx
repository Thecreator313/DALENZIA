
'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import {
  collection,
  query,
  where,
  doc,
  getDocs,
  onSnapshot,
  runTransaction,
  orderBy,
  limit,
} from 'firebase/firestore';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from '@/lib/firebase';
import { useCachedDoc, useSharedCollection, useAppSettings } from '@/context/firestore-cache';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Loader2,
  ArrowLeft,
  Download,
  Trophy,
  Megaphone,
  Unplug,
  FileImage,
  Settings2,
  Sparkles,
  Award,
  Medal,
  Crown,
  Star,
  Share2,
  Check,
  ExternalLink,
  Users,
  BarChart3,
  Calendar,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { normalizePosterCatalog, type PosterResultInput } from '@/lib/poster-template';
import { ResultPosterCanvas, type ResultPosterCanvasHandle } from '@/components/result-poster-canvas';
import { PosterShareActions } from '@/components/poster-share-actions';
import { PosterTemplateSelector } from '@/components/poster-template-selector';
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
  const searchParams = useSearchParams();
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
  const { data: rawPosterTemplate } = useCachedDoc<Record<string, unknown>>(
    'doc:settings:posterTemplate',
    () => doc(db, 'settings', 'posterTemplate')
  );
  const { settings: appSettings } = useAppSettings();
  const festName = appSettings.festName || 'Fest Central';
  const posterCatalog = useMemo(
    () => normalizePosterCatalog(rawPosterTemplate),
    [rawPosterTemplate]
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('tpl-default');

  useEffect(() => {
    setSelectedTemplateId((prev) =>
      posterCatalog.templates.some((t) => t.id === prev)
        ? prev
        : posterCatalog.defaultTemplateId
    );
  }, [posterCatalog]);

  const activeTemplate = useMemo(
    () =>
      posterCatalog.templates.find((t) => t.id === selectedTemplateId) ||
      posterCatalog.templates[0],
    [posterCatalog.templates, selectedTemplateId]
  );
  const posterSettings = activeTemplate.settings;

  // UI states
  const posterRef = useRef<ResultPosterCanvasHandle | null>(null);
  const [publishedResultNumber, setPublishedResultNumber] = useState<number | undefined>(undefined);
  const [isPosterDialogOpen, setIsPosterDialogOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertType, setAlertType] = useState<'publish' | 'unpublish' | null>(null);

  // Auto-open poster modal if URL contains ?poster=true
  useEffect(() => {
    if (searchParams?.get('poster') === 'true') {
      setIsPosterDialogOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!programId) return;
    const q = query(
      collection(db, 'publishedResults'),
      where('programId', '==', programId),
      limit(1)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        setPublishedResultNumber(typeof data.resultNumber === 'number' ? data.resultNumber : undefined);
      } else {
        setPublishedResultNumber(undefined);
      }
    });
    return () => unsubscribe();
  }, [programId]);

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

  const topWinners = useMemo(() => {
    return results.filter((r) => r.rank <= 3);
  }, [results]);

  const resultStats = useMemo(() => {
    const totalReported = assignments.filter((a) => a.codeLetter && a.status !== 'cancelled').length;
    const totalScores = scores.length;
    const topScore = results.length > 0 ? results[0].averageScore : 0;
    const judgesCount = new Set(scores.map((s) => s.judgeId)).size;
    return {
      totalReported,
      totalScores,
      topScore,
      judgesCount,
    };
  }, [assignments, scores, results]);

  const posterResultData = useMemo<PosterResultInput>(() => {
    const winners: Record<string, { name: string; teamName: string }[]> = {
      '1': [],
      '2': [],
      '3': [],
    };
    results.forEach((res) => {
      if (res.rank <= 3) {
        if (!winners[res.rank]) winners[res.rank] = [];
        winners[res.rank].push({ name: res.name, teamName: res.teamName });
      }
    });
    return {
      resultNumber: publishedResultNumber,
      programName: program?.name || 'Program Result',
      categoryName: program?.categoryName || 'Category',
      winners,
    };
  }, [program?.name, program?.categoryName, publishedResultNumber, results]);

  const publicShareUrl = useMemo(() => {
    if (!publishedResultNumber || typeof window === 'undefined') return undefined;
    return `${window.location.origin}/results/${publishedResultNumber}`;
  }, [publishedResultNumber]);


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
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-base font-medium text-foreground">Calculating Final Results...</p>
        <p className="text-xs text-muted-foreground">Compiling judge evaluations & rank scores</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Navigation & Action Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.back()}
            className="shrink-0 h-9 w-9 sm:h-10 sm:w-10 rounded-xl"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-headline">
                {program?.name || 'Program Results'}
              </h1>
              {program?.isPublished ? (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs font-semibold px-2.5 py-0.5">
                  Published
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs font-semibold px-2.5 py-0.5">
                  Draft
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-muted-foreground">
              <span className="font-medium text-foreground/80">{program?.categoryName || 'General Category'}</span>
              <span>•</span>
              <span className="capitalize">{program?.type || 'individual'}</span>
              <span>•</span>
              <span className="capitalize">{program?.mode || 'on-stage'}</span>
              {publishedResultNumber && (
                <>
                  <span>•</span>
                  <span className="text-primary font-medium">Result #{publishedResultNumber}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Main Poster Preview Button */}
          <Button
            onClick={() => setIsPosterDialogOpen(true)}
            disabled={results.length === 0}
            className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 text-white shadow-md shadow-amber-500/20 font-medium"
          >
            <Sparkles className="mr-2 h-4 w-4 fill-white/20" />
            Poster Preview
            {posterCatalog.templates.length > 1 && (
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-black/20 text-[10px] font-mono">
                {posterCatalog.templates.length}
              </span>
            )}
          </Button>

          <Button
            onClick={handleDownloadPDF}
            disabled={isDownloading || results.length === 0}
            variant="outline"
          >
            {isDownloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            PDF Report
          </Button>

          {program?.isPublished ? (
            <Button
              onClick={() => openAlertDialog('unpublish')}
              disabled={isUnpublishing}
              variant="destructive"
            >
              {isUnpublishing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Unplug className="mr-2 h-4 w-4" />
              )}
              Unpublish
            </Button>
          ) : (
            <Button
              onClick={() => openAlertDialog('publish')}
              disabled={isPublishing || results.length === 0}
            >
              {isPublishing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Megaphone className="mr-2 h-4 w-4" />
              )}
              Publish Result
            </Button>
          )}
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4 bg-card/60 backdrop-blur-sm border shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reported</span>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono">{resultStats.totalReported}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Participants checked-in</p>
        </Card>

        <Card className="p-4 bg-card/60 backdrop-blur-sm border shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Evaluated</span>
            <Check className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono">{results.length}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{resultStats.judgesCount} judges submitted marks</p>
        </Card>

        <Card className="p-4 bg-card/60 backdrop-blur-sm border shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Top Score</span>
            <Trophy className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {resultStats.topScore > 0 ? resultStats.topScore.toFixed(2) : '-'}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Highest average score</p>
        </Card>

        <Card className="p-4 bg-card/60 backdrop-blur-sm border shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Poster Templates</span>
            <FileImage className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono">{posterCatalog.templates.length}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Active: {activeTemplate.name}</p>
        </Card>
      </div>

      {/* Top 3 Rank Holders Podium */}
      {topWinners.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-bold">Top Rank Holders (Podium)</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsPosterDialogOpen(true)}
              className="text-xs text-primary hover:text-primary gap-1"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Preview on Poster
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Rank 1 */}
            {topWinners.filter((w) => w.rank === 1).map((winner, idx) => (
              <Card
                key={`rank-1-${idx}`}
                className="relative overflow-hidden border-2 border-amber-400/60 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-card shadow-md transition-all hover:shadow-lg"
              >
                <div className="absolute top-0 right-0 transform translate-x-2 -translate-y-2 opacity-10">
                  <Crown className="w-28 h-28 text-amber-500" />
                </div>
                <CardContent className="p-5 space-y-3 relative">
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500 text-amber-950 font-bold text-xs shadow-sm">
                      <Crown className="h-3.5 w-3.5" />
                      1st Place (Gold)
                    </div>
                    <Badge variant="outline" className="font-mono text-xs font-bold border-amber-500/40 text-amber-700 dark:text-amber-300">
                      Grade: {winner.grade}
                    </Badge>
                  </div>

                  <div>
                    <h3 className="font-bold text-lg text-foreground truncate">{winner.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Chest No: <span className="font-mono font-medium text-foreground">{winner.chestNumber}</span>
                    </p>
                  </div>

                  <div className="pt-2 border-t border-amber-500/20 flex items-center justify-between">
                    <span className="text-xs font-semibold text-primary truncate max-w-[140px]">
                      {winner.teamName}
                    </span>
                    <div className="text-right">
                      <span className="text-xs text-muted-foreground block">Points</span>
                      <span className="text-base font-bold font-mono text-foreground">
                        {winner.points.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Rank 2 */}
            {topWinners.filter((w) => w.rank === 2).map((winner, idx) => (
              <Card
                key={`rank-2-${idx}`}
                className="relative overflow-hidden border-2 border-slate-300 dark:border-slate-700 bg-gradient-to-br from-slate-400/15 via-slate-400/5 to-card shadow-sm transition-all hover:shadow-md"
              >
                <CardContent className="p-5 space-y-3 relative">
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-300 dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-bold text-xs shadow-sm">
                      <Medal className="h-3.5 w-3.5" />
                      2nd Place (Silver)
                    </div>
                    <Badge variant="outline" className="font-mono text-xs font-bold">
                      Grade: {winner.grade}
                    </Badge>
                  </div>

                  <div>
                    <h3 className="font-bold text-lg text-foreground truncate">{winner.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Chest No: <span className="font-mono font-medium text-foreground">{winner.chestNumber}</span>
                    </p>
                  </div>

                  <div className="pt-2 border-t border-border flex items-center justify-between">
                    <span className="text-xs font-semibold text-primary truncate max-w-[140px]">
                      {winner.teamName}
                    </span>
                    <div className="text-right">
                      <span className="text-xs text-muted-foreground block">Points</span>
                      <span className="text-base font-bold font-mono text-foreground">
                        {winner.points.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Rank 3 */}
            {topWinners.filter((w) => w.rank === 3).map((winner, idx) => (
              <Card
                key={`rank-3-${idx}`}
                className="relative overflow-hidden border-2 border-amber-700/30 bg-gradient-to-br from-amber-700/10 via-amber-700/5 to-card shadow-sm transition-all hover:shadow-md"
              >
                <CardContent className="p-5 space-y-3 relative">
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-700/20 text-amber-900 dark:text-amber-200 font-bold text-xs border border-amber-700/30">
                      <Award className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
                      3rd Place (Bronze)
                    </div>
                    <Badge variant="outline" className="font-mono text-xs font-bold">
                      Grade: {winner.grade}
                    </Badge>
                  </div>

                  <div>
                    <h3 className="font-bold text-lg text-foreground truncate">{winner.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Chest No: <span className="font-mono font-medium text-foreground">{winner.chestNumber}</span>
                    </p>
                  </div>

                  <div className="pt-2 border-t border-border flex items-center justify-between">
                    <span className="text-xs font-semibold text-primary truncate max-w-[140px]">
                      {winner.teamName}
                    </span>
                    <div className="text-right">
                      <span className="text-xs text-muted-foreground block">Points</span>
                      <span className="text-base font-bold font-mono text-foreground">
                        {winner.points.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Full Final Standings Card */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-xl">Final Standings & Scoring Breakdown</CardTitle>
              <CardDescription>
                Ranked by average score across all judges. Expand any row to view judge-wise breakdown and comments.
              </CardDescription>
            </div>
            <div className="text-xs font-medium text-muted-foreground">
              Total {results.length} ranked participant{results.length !== 1 ? 's' : ''}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0">
          <Accordion type="multiple" className="w-full space-y-2.5">
            {results.map((result) => {
              const isFirst = result.rank === 1;
              const isSecond = result.rank === 2;
              const isThird = result.rank === 3;

              return (
                <AccordionItem
                  value={result.participantId}
                  key={result.participantId}
                  className={`rounded-xl border overflow-hidden transition-colors ${
                    isFirst
                      ? 'border-amber-400/50 bg-amber-500/[0.02]'
                      : isSecond
                      ? 'border-slate-300 dark:border-slate-700'
                      : isThird
                      ? 'border-amber-700/30'
                      : 'border-border'
                  }`}
                >
                  <AccordionTrigger className="hover:no-underline px-3 sm:px-4 py-3 text-base data-[state=open]:bg-muted/40">
                    <div className="grid grid-cols-12 w-full text-left items-center gap-2 sm:gap-4 pr-2">
                      {/* Rank badge */}
                      <div className="col-span-2 sm:col-span-1 flex items-center justify-center">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                            isFirst
                              ? 'bg-amber-500 text-amber-950 font-extrabold shadow-sm'
                              : isSecond
                              ? 'bg-slate-300 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
                              : isThird
                              ? 'bg-amber-700/20 text-amber-900 dark:text-amber-200 border border-amber-700/40'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {result.rank}
                        </div>
                      </div>

                      {/* Participant Details */}
                      <div className="col-span-6 sm:col-span-5 flex items-center gap-2.5 sm:gap-3 min-w-0">
                        <Avatar className="h-8 w-8 sm:h-9 sm:w-9 shrink-0">
                          <AvatarFallback className="font-semibold text-xs sm:text-sm">
                            {result.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="truncate">
                          <p className="font-semibold text-sm sm:text-base text-foreground truncate">
                            {result.name}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Chest: <strong className="font-mono text-foreground">{result.chestNumber}</strong></span>
                            <span className="sm:hidden text-primary font-medium">• {result.teamName}</span>
                          </div>
                        </div>
                      </div>

                      {/* Team Name (Desktop) */}
                      <div className="hidden sm:block sm:col-span-3 text-xs sm:text-sm font-medium text-foreground/80 truncate">
                        {result.teamName}
                      </div>

                      {/* Total Points */}
                      <div className="col-span-2 sm:col-span-2 text-center">
                        <span className="block text-[10px] uppercase font-bold text-muted-foreground sm:hidden">Pts</span>
                        <span className="font-mono font-bold text-sm sm:text-base text-foreground">
                          {result.points.toFixed(2)}
                        </span>
                      </div>

                      {/* Grade Badge */}
                      <div className="col-span-2 sm:col-span-1 flex justify-end sm:justify-center">
                        <Badge
                          variant={result.grade === 'No Grade' ? 'secondary' : 'default'}
                          className="font-mono text-xs px-2 py-0.5"
                        >
                          {result.grade}
                        </Badge>
                      </div>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent>
                    <div className="p-3 sm:p-5 bg-muted/20 border-t space-y-4">
                      {/* Summary Banner */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-background p-3 rounded-lg border">
                          <span className="text-xs text-muted-foreground block">Average Judge Score</span>
                          <span className="font-mono font-bold text-xl text-primary">
                            {result.averageScore.toFixed(2)}
                          </span>
                        </div>
                        <div className="bg-background p-3 rounded-lg border">
                          <span className="text-xs text-muted-foreground block">Assigned Grade</span>
                          <span className="font-mono font-bold text-xl text-foreground">
                            {result.grade}
                          </span>
                        </div>
                        <div className="bg-background p-3 rounded-lg border">
                          <span className="text-xs text-muted-foreground block">Total Standing Points</span>
                          <span className="font-mono font-bold text-xl text-emerald-600 dark:text-emerald-400">
                            {result.points.toFixed(2)} pts
                          </span>
                        </div>
                      </div>

                      {/* Judge Scores Table */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Judge-wise Breakdown
                        </h4>
                        <div className="rounded-lg border overflow-hidden bg-background">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/40">
                                <TableHead className="font-semibold text-xs">Judge</TableHead>
                                <TableHead className="text-right font-semibold text-xs">Score</TableHead>
                                <TableHead className="font-semibold text-xs">Remarks / Feedback</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {result.judgeScores.length > 0 ? (
                                result.judgeScores.map((s, i) => (
                                  <TableRow key={i}>
                                    <TableCell className="font-medium text-xs sm:text-sm">
                                      {s.judgeName}
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-bold text-xs sm:text-sm">
                                      {s.score.toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-xs sm:text-sm italic">
                                      {s.review ? `"${s.review}"` : <span className="not-italic text-muted-foreground/60">No remarks</span>}
                                    </TableCell>
                                  </TableRow>
                                ))
                              ) : (
                                <TableRow>
                                  <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-4">
                                    No judge scores recorded.
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          {results.length === 0 && (
            <div className="py-12 text-center space-y-2">
              <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="font-medium text-foreground">No results calculated yet</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Ensure participants have reported and judges have submitted their scores for this program.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Poster Preview Modal Dialog */}
      <Dialog open={isPosterDialogOpen} onOpenChange={setIsPosterDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="space-y-2 pb-2 border-b">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pr-6">
              <div>
                <DialogTitle className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                  {program?.name || 'Program'} — Result Poster
                </DialogTitle>
                <DialogDescription className="text-xs sm:text-sm mt-1">
                  {program?.categoryName || 'Category'} •{' '}
                  {publishedResultNumber ? `Result #${publishedResultNumber}` : 'Pre-publish Preview'} •{' '}
                  {posterSettings.canvasWidth}×{posterSettings.canvasHeight}px
                </DialogDescription>
              </div>
              <Button variant="outline" size="sm" asChild className="self-start text-xs">
                <Link href="/admin/poster-template">
                  <Settings2 className="mr-1.5 h-3.5 w-3.5" />
                  Poster Studio
                </Link>
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-5 pt-3">
            {/* Template Selector Section */}
            <div className="rounded-xl border bg-muted/20 p-3 sm:p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Available Poster Templates
                  </span>
                  <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                    {posterCatalog.templates.length}
                  </Badge>
                </div>
                <span className="text-xs text-primary font-medium truncate max-w-[180px]">
                  Using: {activeTemplate.name}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Switch templates below to preview how this result looks with different festival designs.
              </p>
              <PosterTemplateSelector
                templates={posterCatalog.templates}
                selectedId={activeTemplate.id}
                onSelect={setSelectedTemplateId}
              />
            </div>

            {/* Poster Canvas Preview */}
            <div className="rounded-2xl border bg-muted/40 p-3 sm:p-6 flex justify-center items-center overflow-hidden min-h-[340px] shadow-inner">
              <ResultPosterCanvas
                ref={posterRef}
                settings={posterSettings}
                result={posterResultData}
                festName={festName}
                className={
                  posterSettings.canvasHeight > posterSettings.canvasWidth
                    ? "w-full max-w-[420px] shadow-2xl rounded-xl"
                    : "w-full max-w-[680px] shadow-2xl rounded-xl"
                }
              />
            </div>

            {/* Poster Share & Download Actions */}
            <PosterShareActions
              posterRef={posterRef}
              result={posterResultData}
              festName={festName}
              templateName={activeTemplate.name}
              shareUrl={publicShareUrl}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Alert Dialog */}
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {alertType === 'publish'
                ? `This will publish the top 3 rank holders for "${program?.name}" to the public festival portal. Judging will be closed for this program. You can unpublish anytime.`
                : `This will remove the published result for "${program?.name}" from the public festival portal. You can republish it later.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={alertType === 'publish' ? handlePublish : handleUnpublish}
              className={alertType === 'unpublish' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {alertType === 'publish' ? 'Yes, Publish Result' : 'Yes, Unpublish Result'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
