
'use client';

import { useState, useMemo } from 'react';
import {
  doc,
  updateDoc,
} from 'firebase/firestore';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { useSharedCollection } from '@/context/firestore-cache';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import type { Category } from '@/app/admin/categories/page';
import { Button } from '@/components/ui/button';
import type { Program as BaseProgram } from '@/app/admin/programs/page';
import {
  Loader2,
  PackageOpen,
  ArrowRight,
  CheckCircle2,
  List,
  Clock,
  BarChart,
  MoreVertical,
  Lock,
  Unlock,
  Megaphone,
  Trophy,
  Activity,
  AlertCircle,
  Sparkles,
  FileImage,
  X,
  Filter,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const StatCard = ({
  title,
  value,
  icon: Icon,
  color,
  delay,
  isActive,
  onClick,
}: {
  title: string;
  value: number;
  icon: any;
  color: string;
  delay: number;
  isActive?: boolean;
  onClick?: () => void;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.4 }}
    onClick={onClick}
    className="cursor-pointer"
  >
    <Card
      className={cn(
        "border-border/60 bg-card/50 backdrop-blur-md overflow-hidden relative group hover:shadow-lg transition-all duration-300 rounded-2xl",
        isActive ? "ring-2 ring-primary border-primary/50 shadow-md" : "hover:border-primary/40"
      )}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-[0.04] group-hover:opacity-[0.09] transition-opacity`} />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</CardTitle>
        <div className={`p-2 rounded-xl ${color} bg-opacity-15 text-opacity-100`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className="text-2xl font-bold font-headline">{value}</div>
      </CardContent>
    </Card>
  </motion.div>
);

export default function ResultsPage() {
  const { data: categories, loading: catsLoading } = useSharedCollection<Category>('programCategories');
  const { data: rawPrograms, loading: progsLoading } = useSharedCollection<Program>('programs');
  const { data: assignments, loading: assignmentsLoading } = useSharedCollection<{
    id: string;
    programId: string;
    status?: string;
    codeLetter?: string;
  }>('assignments');
  const { data: scores, loading: scoresLoading } = useSharedCollection<{
    id: string;
    assignmentId: string;
  }>('scores');

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [programToUpdate, setProgramToUpdate] = useState<Program | null>(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  const programsWithStatus = useMemo(() => {
    const categoryMap = new Map(categories.map((d) => [d.id, d.name]));
    return rawPrograms.map((programData): ProgramWithStatus => {
      const program = {
        ...programData,
        categoryName: categoryMap.get(programData.categoryId) || 'Unknown Category',
      };
      const status = getProgramStatus(program, assignments, scores);
      return { ...program, status };
    });
  }, [rawPrograms, categories, assignments, scores]);

  const loading = catsLoading || progsLoading || assignmentsLoading || scoresLoading;

  const filteredPrograms = useMemo(() => {
    return programsWithStatus
      .filter((p) => (activeTab === 'all' ? true : p.status.key === activeTab))
      .filter((p) => (selectedCategory === 'all' ? true : p.categoryId === selectedCategory))
      .filter(
        (p) =>
          p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.categoryName?.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [programsWithStatus, searchTerm, activeTab, selectedCategory]);

  const stats = useMemo(() => {
    return programsWithStatus.reduce(
      (acc, p) => {
        acc[p.status.key] = (acc[p.status.key] || 0) + 1;
        return acc;
      },
      {
        published: 0,
        completed: 0,
        in_progress: 0,
        ready: 0,
        reporting: 0,
        not_started: 0,
      } as Record<ProgramStatusKey, number>
    );
  }, [programsWithStatus]);

  const handleUpdateStatus = async () => {
    if (!programToUpdate) return;
    const newStatus = programToUpdate.judgingStatus === 'closed' ? 'open' : 'closed';
    try {
      const programDocRef = doc(db, 'programs', programToUpdate.id);
      await updateDoc(programDocRef, { judgingStatus: newStatus });

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
    <div className="space-y-6 sm:space-y-8 relative min-h-screen pb-10">
      {/* Dynamic Ambient Background */}
      <div className="fixed inset-0 -z-10 h-full w-full bg-background overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[45%] h-[45%] rounded-full bg-purple-500/10 blur-[130px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-emerald-500/10 blur-[130px]" />
        <div className="absolute top-1/2 left-1/3 w-80 h-80 rounded-full bg-blue-500/5 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Trophy className="h-3.5 w-3.5 text-primary" />
            Official Results Hub
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold font-headline tracking-tight bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent">
            Results & Judging Central
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl">
            Monitor score submissions, verify final standings, preview official posters, and publish results to the homepage.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" asChild className="rounded-xl shadow-sm text-xs sm:text-sm">
            <Link href="/admin/poster-template">
              <Sparkles className="mr-1.5 h-4 w-4 text-purple-500" />
              <span>Poster Studio</span>
            </Link>
          </Button>
        </div>
      </motion.div>

      {/* Interactive KPI Summary Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
        <StatCard
          title="Published"
          value={stats.published || 0}
          icon={Megaphone}
          color="bg-purple-500 text-purple-500"
          delay={0.05}
          isActive={activeTab === 'published'}
          onClick={() => setActiveTab((cur) => (cur === 'published' ? 'all' : 'published'))}
        />
        <StatCard
          title="Completed"
          value={stats.completed || 0}
          icon={CheckCircle2}
          color="bg-emerald-500 text-emerald-500"
          delay={0.1}
          isActive={activeTab === 'completed'}
          onClick={() => setActiveTab((cur) => (cur === 'completed' ? 'all' : 'completed'))}
        />
        <StatCard
          title="In Progress"
          value={stats.in_progress || 0}
          icon={Clock}
          color="bg-amber-500 text-amber-500"
          delay={0.15}
          isActive={activeTab === 'in_progress'}
          onClick={() => setActiveTab((cur) => (cur === 'in_progress' ? 'all' : 'in_progress'))}
        />
        <StatCard
          title="Ready to Judge"
          value={stats.ready || 0}
          icon={BarChart}
          color="bg-blue-500 text-blue-500"
          delay={0.2}
          isActive={activeTab === 'ready'}
          onClick={() => setActiveTab((cur) => (cur === 'ready' ? 'all' : 'ready'))}
        />
        <StatCard
          title="Reporting"
          value={stats.reporting || 0}
          icon={List}
          color="bg-orange-500 text-orange-500"
          delay={0.25}
          isActive={activeTab === 'reporting'}
          onClick={() => setActiveTab((cur) => (cur === 'reporting' ? 'all' : 'reporting'))}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Scrollable Tabs on mobile with badge counts */}
          <div className="overflow-x-auto no-scrollbar pb-1">
            <TabsList className="bg-muted/40 border border-border/60 backdrop-blur-md p-1 inline-flex w-auto min-w-max rounded-xl">
              <TabsTrigger value="all" className="gap-1.5 text-xs sm:text-sm rounded-lg">
                <span>All</span>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-mono">
                  {programsWithStatus.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="published" className="gap-1.5 text-xs sm:text-sm rounded-lg">
                <span>Published</span>
                {stats.published > 0 && (
                  <Badge className="h-5 px-1.5 text-[10px] bg-purple-500 text-white font-mono">
                    {stats.published}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="completed" className="gap-1.5 text-xs sm:text-sm rounded-lg">
                <span>Completed</span>
                {stats.completed > 0 && (
                  <Badge className="h-5 px-1.5 text-[10px] bg-emerald-500 text-white font-mono">
                    {stats.completed}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="in_progress" className="gap-1.5 text-xs sm:text-sm rounded-lg">
                <span>In Progress</span>
                {stats.in_progress > 0 && (
                  <Badge className="h-5 px-1.5 text-[10px] bg-amber-500 text-white font-mono">
                    {stats.in_progress}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="ready" className="gap-1.5 text-xs sm:text-sm rounded-lg">
                <span>Ready</span>
                {stats.ready > 0 && (
                  <Badge className="h-5 px-1.5 text-[10px] bg-blue-500 text-white font-mono">
                    {stats.ready}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="reporting" className="gap-1.5 text-xs sm:text-sm rounded-lg">
                <span>Reporting</span>
                {stats.reporting > 0 && (
                  <Badge className="h-5 px-1.5 text-[10px] bg-orange-500 text-white font-mono">
                    {stats.reporting}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Search & Category Filter Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full sm:w-[170px] bg-background/70 border-border/60 rounded-xl h-10 text-xs sm:text-sm">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search programs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-8 bg-background/70 border-border/60 rounded-xl h-10 text-xs sm:text-sm"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <TabsContent value={activeTab} className="mt-4">
          {filteredPrograms.length > 0 ? (
            <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence>
                {filteredPrograms.map((program, index) => {
                  const isReadyOrDone =
                    program.status.key === 'completed' || program.status.key === 'published';

                  return (
                    <motion.div
                      key={program.id}
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: Math.min(index * 0.04, 0.3) }}
                    >
                      <Card className="flex flex-col h-full rounded-2xl border-border/60 bg-card/50 backdrop-blur-md hover:bg-card/75 transition-all duration-300 hover:shadow-xl hover:border-primary/40 group overflow-hidden">
                        <div
                          className={cn(
                            'h-1.5 w-full bg-gradient-to-r',
                            program.status.key === 'published'
                              ? 'from-purple-500 to-indigo-500'
                              : program.status.key === 'completed'
                              ? 'from-emerald-500 to-teal-500'
                              : program.status.key === 'in_progress'
                              ? 'from-amber-400 to-orange-500'
                              : program.status.key === 'ready'
                              ? 'from-blue-400 to-cyan-500'
                              : 'from-slate-400 to-slate-500'
                          )}
                        />
                        <CardHeader className="flex-row items-start justify-between pb-2 p-4 sm:p-5">
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                              <Badge variant="outline" className="text-[11px] font-medium border-border/60 text-muted-foreground">
                                {program.categoryName}
                              </Badge>
                              {program.markType === 'special-mark' && (
                                <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                  Special
                                </Badge>
                              )}
                            </div>
                            <CardTitle
                              className="text-base sm:text-lg font-headline font-bold line-clamp-1"
                              title={program.name}
                            >
                              {program.name}
                            </CardTitle>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {program.judgingStatus === 'closed' && program.status.key !== 'published' && (
                              <span title="Judging closed" className="text-muted-foreground p-1">
                                <Lock className="h-3.5 w-3.5" />
                              </span>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg opacity-70 group-hover:opacity-100 transition-opacity"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link href={`/admin/results/${program.id}`}>
                                    <ArrowRight className="mr-2 h-4 w-4" /> View Results
                                  </Link>
                                </DropdownMenuItem>
                                {isReadyOrDone && (
                                  <DropdownMenuItem asChild>
                                    <Link href={`/admin/results/${program.id}?poster=true`}>
                                      <Sparkles className="mr-2 h-4 w-4 text-purple-500" /> Poster Preview
                                    </Link>
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => {
                                    setProgramToUpdate(program);
                                    setIsAlertOpen(true);
                                  }}
                                  disabled={program.status.key === 'published'}
                                >
                                  {program.judgingStatus === 'closed' ? (
                                    <>
                                      <Unlock className="mr-2 h-4 w-4" /> Re-open Judging
                                    </>
                                  ) : (
                                    <>
                                      <Lock className="mr-2 h-4 w-4" /> Close Judging
                                    </>
                                  )}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardHeader>

                        <CardContent className="flex-grow space-y-3.5 px-4 sm:px-5 pb-3">
                          <div className="flex items-center justify-between">
                            <Badge className={cn('text-white text-xs font-semibold shadow-sm', statusColors[program.status.key])}>
                              {program.status.text}
                            </Badge>
                            <span className="text-xs font-mono font-bold text-muted-foreground">
                              {program.status.progress}%
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            <Progress value={program.status.progress} className="h-2 bg-muted/60" />
                            <p className="text-xs text-muted-foreground line-clamp-1">{program.status.detail}</p>
                          </div>
                        </CardContent>

                        <CardFooter className="pt-2 pb-4 px-4 sm:px-5 flex items-center gap-2 border-t border-border/40">
                          <Button
                            asChild
                            className={cn(
                              'flex-1 rounded-xl transition-all duration-300 text-xs sm:text-sm font-semibold h-9 sm:h-10',
                              isReadyOrDone
                                ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20'
                                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                            )}
                          >
                            <Link href={`/admin/results/${program.id}`}>
                              <span>{program.status.key === 'published' ? 'View Published Result' : 'View Results'}</span>
                              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                            </Link>
                          </Button>

                          {isReadyOrDone && (
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                              className="rounded-xl border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 hover:border-purple-500/50 h-9 sm:h-10 px-3 text-xs"
                              title="Preview official result poster"
                            >
                              <Link href={`/admin/results/${program.id}?poster=true`}>
                                <Sparkles className="h-3.5 w-3.5 mr-1 text-purple-500" />
                                <span>Poster</span>
                              </Link>
                            </Button>
                          )}
                        </CardFooter>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground bg-card/25 rounded-2xl border border-dashed border-border/60">
              <PackageOpen className="h-14 w-14 opacity-30 mb-3" />
              <p className="font-semibold text-lg text-foreground">No Programs Found</p>
              <p className="text-xs sm:text-sm mt-1 max-w-sm mx-auto text-muted-foreground">
                No programs match the selected criteria. Try adjusting your search or category filter.
              </p>
              {(searchTerm || selectedCategory !== 'all' || activeTab !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedCategory('all');
                    setActiveTab('all');
                  }}
                  className="mt-3 text-xs text-primary hover:underline"
                >
                  Reset All Filters
                </Button>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent className="bg-background/95 backdrop-blur-xl border-border/60 rounded-2xl">
          {programToUpdate && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription className="text-xs sm:text-sm">
                  {programToUpdate.judgingStatus === 'closed'
                    ? `This will re-open judging for "${programToUpdate.name}", allowing judges to submit or edit scores again.`
                    : `This will close judging for "${programToUpdate.name}". Judges will no longer be able to submit or edit scores.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
                <AlertDialogCancel onClick={() => setProgramToUpdate(null)} className="rounded-xl">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction onClick={handleUpdateStatus} className="rounded-xl">
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
