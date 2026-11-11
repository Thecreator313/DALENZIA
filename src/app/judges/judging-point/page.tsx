
'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  where,
} from 'firebase/firestore';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import {
  useCachedChunkedIn,
  useCachedCollection,
  useSharedCollection,
} from '@/context/firestore-cache';
import type { Category } from '@/app/admin/categories/page';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Program } from '@/app/admin/programs/page';
import { User } from '@/app/admin/access-central/page';
import { Loader2, Users, Edit, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type ProgramWithStats = Program & {
  totalReportedIncludingCancelled: number;
  activeReportedCount: number;
  scoredByThisJudge: number;
};

export default function JudgingPointPage() {
  const [judge, setJudge] = useState<User | null>(null);
  const [userChecked, setUserChecked] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('fest-central-user');
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setJudge(userData);
    }
    setUserChecked(true);
  }, []);

  const { data: programs, loading: programsLoading } = useCachedCollection<Program>(
    judge ? `query:judge:programs:${judge.id}` : 'query:judge:programs:none',
    () => query(collection(db, 'programs'), where('judges', 'array-contains', judge!.id)),
    { enabled: !!judge }
  );

  const { data: categories, loading: catsLoading } = useSharedCollection<Category>(
    'programCategories',
    { enabled: !!judge }
  );

  const programIds = useMemo(() => programs.map((p) => p.id), [programs]);

  const { data: assignments, loading: assignmentsLoading } = useCachedChunkedIn<{
    id: string;
    programId: string;
    codeLetter?: string;
    status?: string;
  }>('judge-assignments', 'assignments', 'programId', programIds, {
    enabled: !!judge && programIds.length > 0,
  });

  const { data: scores, loading: scoresLoading } = useCachedCollection<{
    id: string;
    programId: string;
    judgeId: string;
  }>(
    judge ? `query:judge:scores:${judge.id}` : 'query:judge:scores:none',
    () => query(collection(db, 'scores'), where('judgeId', '==', judge!.id)),
    { enabled: !!judge }
  );

  const assignedPrograms = useMemo<ProgramWithStats[]>(() => {
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

    return programs.map((programData) => {
      const categoryName =
        (programData.categoryId && categoryMap.get(programData.categoryId)) || 'Unknown';
      const allReportedAssignments = assignments.filter(
        (a) => a.programId === programData.id && a.codeLetter
      );
      const totalReportedIncludingCancelled = allReportedAssignments.length;
      const activeReportedCount = allReportedAssignments.filter(
        (a) => a.status !== 'cancelled'
      ).length;
      const scoredByThisJudge = scores.filter((s) => s.programId === programData.id).length;

      return {
        ...programData,
        categoryName,
        totalReportedIncludingCancelled,
        activeReportedCount,
        scoredByThisJudge,
      };
    });
  }, [programs, categories, assignments, scores]);

  const loading =
    !userChecked ||
    (!!judge &&
      (programsLoading ||
        catsLoading ||
        scoresLoading ||
        (programIds.length > 0 && assignmentsLoading)));

  if (loading) {
     return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="mr-2 h-8 w-8 animate-spin" />
        <span>Loading Assigned Programs...</span>
      </div>
    );
  }

  if (!judge) {
      return <div>Could not identify judge. Please log in again.</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold font-headline">Judging Point</h1>
      <p className="text-muted-foreground">
        Welcome, {judge.name}. Select a program to start scoring.
      </p>

      {assignedPrograms.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-center py-10">You have no programs assigned to you at the moment.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {assignedPrograms.map((program) => {
            const isScoringComplete = program.scoredByThisJudge === program.activeReportedCount && program.activeReportedCount > 0;
            const isJudgingClosed = program.judgingStatus === 'closed';

            return (
                <Card key={program.id} className={cn("flex flex-col", isJudgingClosed && "bg-muted/50")}>
                <CardHeader>
                    <CardTitle>{program.name}</CardTitle>
                    <CardDescription>{program.categoryName}</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                    <div className="flex items-center text-muted-foreground text-sm">
                        <Users className="mr-2 h-4 w-4" />
                        <span>{program.totalReportedIncludingCancelled} Participants Reported</span>
                    </div>
                </CardContent>
                <CardFooter className="flex flex-col items-start gap-2 border-t pt-4">
                    {isJudgingClosed ? (
                         <Badge variant="destructive" className="w-full justify-center text-base"><Lock className="mr-2 h-4 w-4" /> Judging Closed</Badge>
                    ): (
                        <Badge variant={isScoringComplete ? "default" : "secondary"}>
                            {program.scoredByThisJudge} / {program.activeReportedCount} Scored
                        </Badge>
                    )}
                    <Button asChild className="w-full" disabled={program.activeReportedCount === 0 || isJudgingClosed}>
                        <Link href={`/judges/judging-point/${program.id}`}>
                            <Edit className="mr-2 h-4 w-4" />
                            {isJudgingClosed ? "View Scores" : (program.scoredByThisJudge > 0 ? "Edit Scores" : "Start Judging")}
                        </Link>
                    </Button>
                </CardFooter>
                </Card>
            )
          })}
        </div>
      )}
    </div>
  );
}
