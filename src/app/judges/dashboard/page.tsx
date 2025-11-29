
'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, getFirestore, onSnapshot, getDocs } from 'firebase/firestore';
import { app } from '@/lib/firebase';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Trophy, Edit, User, List, CheckCircle, Sparkles } from "lucide-react";
import type { User as JudgeUser } from '@/app/admin/access-central/page';
import { Loader2 } from 'lucide-react';
import type { Program } from '@/app/admin/programs/page';
import { motion } from 'framer-motion';

const db = getFirestore(app);

export default function JudgeDashboard() {
  const [judge, setJudge] = useState<JudgeUser | null>(null);
  const [assignedProgramsCount, setAssignedProgramsCount] = useState(0);
  const [completedProgramsCount, setCompletedProgramsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('fest-central-user');
    if (!storedUser) {
      setLoading(false);
      return;
    }

    const judgeData: JudgeUser = JSON.parse(storedUser);
    setJudge(judgeData);

    const programsQuery = query(collection(db, 'programs'), where('judges', 'array-contains', judgeData.id));

    const unsubscribePrograms = onSnapshot(programsQuery, async (snapshot) => {
      const programs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Program));
      setAssignedProgramsCount(programs.length);

      if (programs.length === 0) {
        setCompletedProgramsCount(0);
        setLoading(false);
        return;
      }

      const programIds = programs.map(p => p.id);
      const assignmentsQuery = query(collection(db, 'assignments'), where('programId', 'in', programIds));
      const scoresQuery = query(collection(db, 'scores'), where('judgeId', '==', judgeData.id), where('programId', 'in', programIds));

      const [assignmentsSnapshot, scoresSnapshot] = await Promise.all([
        getDocs(assignmentsQuery),
        getDocs(scoresQuery)
      ]);

      const assignments = assignmentsSnapshot.docs.map(doc => doc.data());
      const scores = scoresSnapshot.docs.map(doc => doc.data());

      let completedCount = 0;
      for (const program of programs) {
        const reportedParticipants = assignments.filter(a => a.programId === program.id && a.status !== 'cancelled' && a.codeLetter);
        if (reportedParticipants.length === 0) continue;

        const scoresForProgram = scores.filter(s => s.programId === program.id);

        if (scoresForProgram.length >= reportedParticipants.length) {
          completedCount++;
        }
      }
      setCompletedProgramsCount(completedCount);
      setLoading(false);

    }, (error) => {
      console.error("Error fetching data:", error);
      setLoading(false);
    });

    return () => {
      unsubscribePrograms();
    };
  }, []);


  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)]">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
          <Loader2 className="h-12 w-12 animate-spin text-primary relative z-10" />
        </div>
        <p className="text-muted-foreground animate-pulse mt-4">Loading Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 relative min-h-screen p-1">
      {/* Dynamic Background */}
      <div className="fixed inset-0 -z-10 h-full w-full bg-background overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/5 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold font-headline tracking-tight">Judge Dashboard</h1>
          <p className="text-lg text-muted-foreground">Welcome back, <span className="text-foreground font-medium">{judge?.name || 'Judge'}</span>!</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground bg-muted/50 px-3 py-1 rounded-full border border-white/5">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden relative group hover:shadow-lg transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-medium text-muted-foreground">Programs Assigned</CardTitle>
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                <List className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-3xl font-bold">{assignedProgramsCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Total programs assigned to you</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden relative group hover:shadow-lg transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-medium text-muted-foreground">Programs Completed</CardTitle>
              <div className="p-2 rounded-lg bg-green-500/10 text-green-500">
                <CheckCircle className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-3xl font-bold">{completedProgramsCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Programs fully scored</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20 overflow-hidden relative group hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/20 blur-2xl rounded-full group-hover:bg-primary/30 transition-colors" />
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Ready to Go?
              </CardTitle>
              <CardContent className="p-0 pt-4 relative z-10">
                <Button asChild size="lg" className="w-full shadow-lg shadow-primary/20 group-hover:scale-[1.02] transition-transform">
                  <Link href="/judges/judging-point">
                    <Trophy className="mr-2 h-4 w-4" />
                    Start Judging
                  </Link>
                </Button>
              </CardContent>
            </CardHeader>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
