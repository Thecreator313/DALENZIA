'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, getFirestore, onSnapshot, getDocs } from 'firebase/firestore';
import { app } from '@/lib/firebase';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { List, Megaphone, Tv, Calendar, PlayCircle, Loader2 } from "lucide-react";
import { motion } from 'framer-motion';
import type { User } from '@/app/admin/access-central/page';
import type { Stage } from '@/app/admin/stage-central/page';

const db = getFirestore(app);

export default function StageControlDashboard() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [loading, setLoading] = useState(true);
  const [programCount, setProgramCount] = useState(0);

  useEffect(() => {
    const storedUser = localStorage.getItem('fest-central-user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const stagesQuery = query(collection(db, 'stages'), where('controllerId', '==', currentUser.id));
    const unsubscribeStage = onSnapshot(stagesQuery, (snapshot) => {
      if (!snapshot.empty) {
        const stageDoc = snapshot.docs[0];
        const stageData = { id: stageDoc.id, ...stageDoc.data() } as Stage;
        setStage(stageData);
        setProgramCount(stageData.programIds?.length || 0);
      } else {
        setStage(null);
        setProgramCount(0);
      }
      setLoading(false);
    });

    return () => unsubscribeStage();
  }, [currentUser]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)]">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
          <Loader2 className="h-12 w-12 animate-spin text-primary relative z-10" />
        </div>
        <p className="text-muted-foreground animate-pulse mt-4">Loading Stage Control...</p>
      </div>
    );
  }

  if (!stage) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Card className="max-w-md w-full border-white/10 bg-card/40 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-center text-xl">No Stage Assigned</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-muted-foreground">You have not been assigned to control any stage. Please contact the administrator.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 relative min-h-screen p-1">
      {/* Dynamic Background */}
      <div className="fixed inset-0 -z-10 h-full w-full bg-background overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-pink-500/5 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold font-headline tracking-tight">Stage Control</h1>
          <p className="text-lg text-muted-foreground">Managing <span className="font-semibold text-foreground">{stage.name}</span></p>
        </div>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden relative group hover:shadow-lg transition-all duration-300 h-full">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Assigned Programs</CardTitle>
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                <Calendar className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{programCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Total programs scheduled for this stage</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden relative group hover:shadow-lg transition-all duration-300 h-full">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Current Status</CardTitle>
              <div className="p-2 rounded-lg bg-green-500/10 text-green-500">
                <PlayCircle className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Active</div>
              <p className="text-xs text-muted-foreground mt-1">Stage is currently active and running</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div
        className="flex flex-wrap gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Button asChild className="h-auto py-4 px-6 text-lg shadow-lg shadow-primary/20">
          <Link href="/stage-control/programs">
            <List className="mr-2 h-5 w-5" /> View Programs
          </Link>
        </Button>
        <Button asChild variant="secondary" className="h-auto py-4 px-6 text-lg bg-secondary/50 hover:bg-secondary/70 backdrop-blur-sm border border-white/10">
          <Link href="/stage-control/inform">
            <Megaphone className="mr-2 h-5 w-5" /> Make Announcement
          </Link>
        </Button>
      </motion.div>
    </div>
  );
}
