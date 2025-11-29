
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection,
  query,
  getFirestore,
  onSnapshot,
  getDocs,
  doc,
  updateDoc,
} from 'firebase/firestore';
import Link from 'next/link';
import { app } from '@/lib/firebase';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import type { Category } from '@/app/admin/categories/page';
import { Button } from '@/components/ui/button';
import type { Program as BaseProgram } from '@/app/admin/programs/page';
import { Loader2, PackageOpen, ArrowRight, CheckCircle2, List, Clock, BarChart, MoreVertical, Lock, Unlock, Megaphone, Trophy, Activity, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { toast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

const db = getFirestore(app);

type Program = BaseProgram & {
  categoryName?: string;
  judgingStatus?: 'open' | 'closed';
  isPublished?: boolean;
};

type ProgramStatusKey = 'completed' | 'in_progress' | 'ready' | 'reporting' | 'not_started' | 'published';

type ProgramStatus = {
  key: ProgramStatusKey;
  text: string;
  progress: number;
  detail: string;
};

type ProgramWithStatus = Program & {
  status: ProgramStatus;
};

const getProgramStatus = (program: Program, assignments: any[], scores: any[]): ProgramStatus => {
  if (program.isPublished) {
    return { key: 'published', text: 'Published', progress: 100, detail: 'Results are live on the homepage.' };
  }

  const assignedJudgesCount = program.judges?.length || 0;

  const programAssignments = assignments.filter(a => a.programId === program.id);
  const activeAssignments = programAssignments.filter(a => a.status !== 'cancelled');
  const totalPossibleParticipants = activeAssignments.length;

  if (totalPossibleParticipants === 0) {
    return { key: 'not_started', text: 'No Participants', progress: 0, detail: 'No one is assigned to this program.' };
  }

  const reportedParticipants = activeAssignments.filter(a => a.codeLetter);
  const reportedAssignmentIds = reportedParticipants.map(a => a.id);

  const reportedCount = reportedParticipants.length;

  if (reportedCount === 0) {
    return { key: 'not_started', text: 'Not Started', progress: 0, detail: 'No participants reported.' };
  }

  if (reportedCount < totalPossibleParticipants) {
    const progress = Math.min(100, Math.floor((reportedCount / totalPossibleParticipants) * 100));
    return { key: 'reporting', text: 'Reporting', progress, detail: `${reportedCount}/${totalPossibleParticipants} participants reported.` };
  }

  // At this point, all active participants have reported
  if (assignedJudgesCount === 0) {
    return { key: 'ready', text: 'No Judges', progress: 50, detail: `All participants reported. No judges assigned.` };
  }

  const programScores = scores.filter(s => reportedAssignmentIds.includes(s.assignmentId));
  const actualScores = programScores.length;
  const expectedScores = reportedCount * assignedJudgesCount;


  if (actualScores === 0) {
    return { key: 'ready', text: 'Ready for Judging', progress: 50, detail: `All participants reported.` };
  }

  if (actualScores < expectedScores) {
    const progress = 50 + Math.min(50, Math.floor((actualScores / expectedScores) * 50));
    return { key: 'in_progress', text: 'Judging In Progress', progress, detail: `${actualScores}/${expectedScores} scores submitted.` };
  }

  if (actualScores >= expectedScores) {
    return { key: 'completed', text: 'Completed', progress: 100, detail: 'All scores submitted.' };
  }

  // Fallback case, should not be reached with the logic above.
  return { key: 'not_started', text: 'Calculating...', progress: 0, detail: 'Checking program status.' };
};

const StatCard = ({ title, value, icon: Icon, color, delay }: { title: string, value: number, icon: any, color: string, delay: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.5 }}
  >
    <Card className="border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden relative group hover:shadow-lg transition-all duration-300">
      <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-[0.03] group-hover:opacity-[0.08] transition-opacity`} />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`p-2 rounded-lg ${color} bg-opacity-10 text-opacity-100`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  </motion.div>
);

export default function ResultsPage() {
  const [programsWithStatus, setProgramsWithStatus] = useState<ProgramWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [programToUpdate, setProgramToUpdate] = useState<Program | null>(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);


  useEffect(() => {
    setLoading(true);

    let activePrograms: Program[] = [];
    let activeAssignments: any[] = [];
    let activeScores: any[] = [];
    let categoryMap = new Map<string, string>();

    const processData = () => {
      if (activePrograms.length === 0 && !loading) return;
      const programsStatus = activePrograms.map((program): ProgramWithStatus => {
        const status = getProgramStatus(program, activeAssignments, activeScores);
        return { ...program, status };
      });
      setProgramsWithStatus(programsStatus);
      if (loading) setLoading(false);
    };

    const catUnsubscribe = onSnapshot(collection(db, 'programCategories'), (categoriesSnapshot) => {
      categoryMap = new Map(categoriesSnapshot.docs.map(d => [d.id, d.data().name]));
      activePrograms = activePrograms.map(p => ({ ...p, categoryName: categoryMap.get(p.categoryId) || 'Unknown' }));
      processData();
    });

    const unsubAll = onSnapshot(query(collection(db, 'programs')), (snapshot) => {
      Promise.all([
        getDocs(collection(db, 'assignments')),
        getDocs(collection(db, 'scores'))
      ]).then(([assignmentsSnapshot, scoresSnapshot]) => {
        activePrograms = snapshot.docs.map(programDoc => {
          const program = { id: programDoc.id, ...programDoc.data() } as Program;
          program.categoryName = categoryMap.get(program.categoryId) || 'Unknown Category';
          return program;
        });
        activeAssignments = assignmentsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        activeScores = scoresSnapshot.docs.map(d => d.data());
        processData();
      });
    });

    return () => {
      catUnsubscribe();
      unsubAll();
    };
  }, []);

  const filteredPrograms = useMemo(() => {
    return programsWithStatus
      .filter(p => activeTab === 'all' || p.status.key === activeTab)
      .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [programsWithStatus, searchTerm, activeTab]);

  const stats = useMemo(() => {
    return programsWithStatus.reduce((acc, p) => {
      acc[p.status.key] = (acc[p.status.key] || 0) + 1;
      return acc;
    }, {} as Record<ProgramStatusKey, number>);
  }, [programsWithStatus]);

  const handleUpdateStatus = async () => {
    if (!programToUpdate) return;
    const newStatus = programToUpdate.judgingStatus === 'closed' ? 'open' : 'closed';
    try {
      const programDocRef = doc(db, 'programs', programToUpdate.id);
      await updateDoc(programDocRef, { judgingStatus: newStatus });

      setProgramsWithStatus(prev => prev.map(p => p.id === programToUpdate.id ? { ...p, judgingStatus: newStatus } : p));

      toast({
        title: 'Success',
        description: `Judging for "${programToUpdate.name}" has been ${newStatus}.`,
      });
    } catch (error) {
      console.error('Error updating judging status:', error);
      toast({ title: 'Error', description: 'Failed to update judging status.', variant: 'destructive' });
    } finally {
      setIsAlertOpen(false);
      setProgramToUpdate(null);
    }
  };


  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)]">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
          <Loader2 className="h-12 w-12 animate-spin text-primary relative z-10" />
        </div>
        <p className="text-muted-foreground animate-pulse mt-4">Calculating Results Status...</p>
      </div>
    );
  }

  const statusColors: Record<ProgramStatusKey, string> = {
    published: 'bg-purple-500',
    completed: 'bg-green-500',
    in_progress: 'bg-yellow-500',
    ready: 'bg-blue-500',
    reporting: 'bg-orange-500',
    not_started: 'bg-gray-400',
  };

  return (
    <div className="space-y-8 relative min-h-screen p-1">
      {/* Dynamic Background */}
      <div className="fixed inset-0 -z-10 h-full w-full bg-background overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-green-500/5 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold font-headline tracking-tight">Judging Dashboard</h1>
          <p className="text-lg text-muted-foreground">Monitor and manage program results.</p>
        </div>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Published" value={stats.published || 0} icon={Megaphone} color="bg-purple-500 text-purple-500" delay={0.1} />
        <StatCard title="Completed" value={stats.completed || 0} icon={CheckCircle2} color="bg-green-500 text-green-500" delay={0.2} />
        <StatCard title="In Progress" value={stats.in_progress || 0} icon={Clock} color="bg-yellow-500 text-yellow-500" delay={0.3} />
        <StatCard title="Ready to Judge" value={stats.ready || 0} icon={BarChart} color="bg-blue-500 text-blue-500" delay={0.4} />
        <StatCard title="Reporting" value={stats.reporting || 0} icon={List} color="bg-orange-500 text-orange-500" delay={0.5} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <TabsList className="bg-muted/50 border border-white/5 backdrop-blur-sm">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="published" className="hidden sm:inline-flex">Published</TabsTrigger>
            <TabsTrigger value="completed" className="hidden sm:inline-flex">Completed</TabsTrigger>
            <TabsTrigger value="in_progress" className="hidden sm:inline-flex">In Progress</TabsTrigger>
            <TabsTrigger value="ready" className="hidden sm:inline-flex">Ready</TabsTrigger>
          </TabsList>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search programs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-background/50 border-white/10 focus:bg-background transition-colors"
            />
          </div>
        </div>
        <TabsContent value={activeTab} className="mt-4">
          {filteredPrograms.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence>
                {filteredPrograms.map((program, index) => (
                  <motion.div
                    key={program.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card className="flex flex-col h-full border-white/10 bg-card/40 backdrop-blur-sm hover:bg-card/60 transition-all duration-300 hover:shadow-lg group">
                      <CardHeader className="flex-row items-start justify-between pb-2">
                        <div>
                          <CardTitle className="text-lg line-clamp-1" title={program.name}>{program.name}</CardTitle>
                          <CardDescription className="line-clamp-1">{program.categoryName}</CardDescription>
                        </div>
                        <div className="flex items-center gap-1">
                          {program.judgingStatus === 'closed' && program.status.key !== 'published' && <Lock className="h-4 w-4 text-muted-foreground" />}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setProgramToUpdate(program);
                                  setIsAlertOpen(true);
                                }}
                                disabled={program.status.key === 'published'}
                              >
                                {program.judgingStatus === 'closed' ? (
                                  <><Unlock className="mr-2 h-4 w-4" /> Re-open Judging</>
                                ) : (
                                  <><Lock className="mr-2 h-4 w-4" /> Close Judging</>
                                )}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent className="flex-grow space-y-4">
                        <div className="flex items-center justify-between">
                          <Badge className={cn("text-white shadow-sm", statusColors[program.status.key])}>{program.status.text}</Badge>
                          <span className="text-xs font-medium text-muted-foreground">{program.status.progress}%</span>
                        </div>
                        <div className="space-y-1.5">
                          <Progress value={program.status.progress} className="h-2 bg-muted/50" />
                          <p className="text-xs text-muted-foreground line-clamp-1">{program.status.detail}</p>
                        </div>
                      </CardContent>
                      <CardFooter className="pt-2">
                        <Button
                          asChild
                          className={cn(
                            "w-full transition-all duration-300",
                            (program.status.key === 'completed' || program.status.key === 'published')
                              ? "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
                              : "bg-muted hover:bg-muted/80 text-muted-foreground"
                          )}
                          disabled={program.status.key !== 'completed' && program.status.key !== 'published'}
                        >
                          <Link href={`/admin/results/${program.id}`}>
                            {program.status.key === 'published' ? 'View Published Result' : 'View Results'}
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Link>
                        </Button>
                      </CardFooter>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground bg-card/20 rounded-xl border border-dashed border-white/10">
              <PackageOpen className="h-16 w-16 opacity-20 mb-4" />
              <p className="font-semibold text-lg">No Programs Found</p>
              <p className="text-sm mt-1 max-w-sm mx-auto">No programs match the current filter criteria. Try adjusting your search or filters.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent className="bg-background/95 backdrop-blur-xl border-white/10">
          {programToUpdate && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  {programToUpdate.judgingStatus === 'closed'
                    ? `This will re-open judging for "${programToUpdate.name}", allowing judges to submit or edit scores again.`
                    : `This will close judging for "${programToUpdate.name}". Judges will no longer be able to submit or edit scores.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setProgramToUpdate(null)}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleUpdateStatus}>
                  {programToUpdate.judgingStatus === 'closed' ? 'Re-open' : 'Close'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
