
'use client';

import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  getFirestore,
  doc,
  getDoc,
  onSnapshot,
  getDocs,
} from 'firebase/firestore';
import Link from 'next/link';
import { app } from '@/lib/firebase';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Program } from '@/app/admin/programs/page';
import { User } from '@/app/admin/access-central/page';
import { Loader2, Users, Edit, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const db = getFirestore(app);

type ProgramWithStats = Program & {
  totalReportedIncludingCancelled: number;
  activeReportedCount: number;
  scoredByThisJudge: number;
};

export default function JudgingPointPage() {
  const [assignedPrograms, setAssignedPrograms] = useState<ProgramWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [judge, setJudge] = useState<User | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('fest-central-user');
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setJudge(userData);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!judge) return;

    setLoading(true);
    const programsRef = collection(db, 'programs');
    const q = query(programsRef, where('judges', 'array-contains', judge.id));

    const unsubscribe = onSnapshot(q, async (querySnapshot) => {
      const programsListPromises = querySnapshot.docs.map(async (programDoc) => {
        const programData = programDoc.data();
        const programId = programDoc.id;

        let categoryName = 'Unknown';
        if (programData.categoryId) {
            try {
                const catDoc = await getDoc(doc(db, 'programCategories', programData.categoryId));
                if (catDoc.exists()) {
                    categoryName = catDoc.data().name;
                }
            } catch (e) { console.error("Error fetching category", e) }
        }

        const assignmentsQuery = query(collection(db, 'assignments'), where('programId', '==', programId));
        const assignmentsSnapshot = await getDocs(assignmentsQuery);
        
        const allReportedAssignments = assignmentsSnapshot.docs.filter(doc => doc.data().codeLetter);
        const totalReportedIncludingCancelled = allReportedAssignments.length;
        const activeReportedCount = allReportedAssignments.filter(doc => doc.data().status !== 'cancelled').length;

        const scoresQuery = query(collection(db, 'scores'), where('programId', '==', programId), where('judgeId', '==', judge.id));
        const scoresSnapshot = await getDocs(scoresQuery);
        const scoredByThisJudge = scoresSnapshot.size;
        
        return { 
          id: programDoc.id, 
          ...programData, 
          categoryName, 
          totalReportedIncludingCancelled,
          activeReportedCount,
          scoredByThisJudge 
        } as ProgramWithStats;
      });

      const programsList = await Promise.all(programsListPromises);
      setAssignedPrograms(programsList);
      setLoading(false);
    }, (error) => {
        console.error("Error fetching assigned programs:", error);
        setLoading(false);
    });

    return () => unsubscribe();
  }, [judge]);

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
