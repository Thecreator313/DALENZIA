'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where } from 'firebase/firestore';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import {
  useCachedChunkedIn,
  useCachedCollection,
  useSharedCollection,
  useAppSettings,
} from '@/context/firestore-cache';
import type { Category } from '@/app/admin/categories/page';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Program } from '@/app/admin/programs/page';
import type { User } from '@/app/admin/access-central/page';
import {
  Loader2,
  Users,
  Edit,
  Lock,
  Search,
  Trophy,
  CheckCircle2,
  Clock,
  Sparkles,
  Mic2,
  Layers,
  ArrowRight,
  FilterX,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type ProgramWithStats = Program & {
  categoryName: string;
  totalReportedIncludingCancelled: number;
  activeReportedCount: number;
  scoredByThisJudge: number;
  pct: number;
  status: 'completed' | 'in_progress' | 'ready' | 'awaiting' | 'closed';
};

export default function JudgingPointPage() {
  const [judge, setJudge] = useState<User | null>(null);
  const [userChecked, setUserChecked] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'in_progress' | 'completed' | 'closed'>('all');
  const { settings } = useAppSettings();

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
        (programData.categoryId && categoryMap.get(programData.categoryId)) ||
        programData.categoryName ||
        'General';
      const allReportedAssignments = assignments.filter(
        (a) => a.programId === programData.id && a.codeLetter
      );
      const totalReportedIncludingCancelled = allReportedAssignments.length;
      const activeReportedCount = allReportedAssignments.filter(
        (a) => a.status !== 'cancelled'
      ).length;
      const scoredByThisJudge = scores.filter((s) => s.programId === programData.id).length;

      const pct =
        activeReportedCount > 0
          ? Math.min(100, Math.round((scoredByThisJudge / activeReportedCount) * 100))
          : 0;

      let status: 'completed' | 'in_progress' | 'ready' | 'awaiting' | 'closed' = 'awaiting';
      if (programData.judgingStatus === 'closed') {
        status = 'closed';
      } else if (activeReportedCount > 0 && scoredByThisJudge >= activeReportedCount) {
        status = 'completed';
      } else if (scoredByThisJudge > 0) {
        status = 'in_progress';
      } else if (activeReportedCount > 0) {
        status = 'ready';
      }

      return {
        ...programData,
        categoryName,
        totalReportedIncludingCancelled,
        activeReportedCount,
        scoredByThisJudge,
        pct,
        status,
      };
    });
  }, [programs, categories, assignments, scores]);

  const stats = useMemo(() => {
    const total = assignedPrograms.length;
    const completed = assignedPrograms.filter((p) => p.status === 'completed').length;
    const inProgress = assignedPrograms.filter((p) => p.status === 'in_progress').length;
    const ready = assignedPrograms.filter((p) => p.status === 'ready').length;
    return { total, completed, inProgress, ready };
  }, [assignedPrograms]);

  const filteredPrograms = useMemo(() => {
    return assignedPrograms.filter((item) => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'ready' && item.status !== 'ready') return false;
        if (statusFilter === 'in_progress' && item.status !== 'in_progress') return false;
        if (statusFilter === 'completed' && item.status !== 'completed') return false;
        if (statusFilter === 'closed' && item.status !== 'closed') return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = (item.name || '').toLowerCase().includes(q);
        const matchesCategory = (item.categoryName || '').toLowerCase().includes(q);
        return matchesName || matchesCategory;
      }
      return true;
    });
  }, [assignedPrograms, statusFilter, searchQuery]);

  const loading =
    !userChecked ||
    (!!judge &&
      (programsLoading ||
        catsLoading ||
        scoresLoading ||
        (programIds.length > 0 && assignmentsLoading)));

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-5rem)] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading Assigned Programs...</p>
      </div>
    );
  }

  if (!judge) {
    return (
      <div className="flex h-[calc(100vh-6rem)] items-center justify-center">
        <Card className="max-w-md w-full border-border/60 bg-card/80 p-6 text-center">
          <p className="text-sm text-muted-foreground">Could not identify judge. Please log in again.</p>
          <Button asChild className="mt-4" size="sm">
            <Link href="/login">Go to Login</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen space-y-5 sm:space-y-6 pb-10">
      {/* Ambient background glow */}
      <div className="pointer-events-none fixed inset-0 -z-10 h-full w-full overflow-hidden">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-indigo-500/10 blur-[130px]" />
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-amber-500/10 blur-[130px]" />
      </div>

      {/* Header Banner */}
      <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white shadow-xl p-4 sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.22),transparent_50%)]" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-indigo-400/30 bg-indigo-500/15 px-3 py-1 text-[11px] sm:text-xs font-semibold text-indigo-200">
                <Trophy className="mr-1.5 h-3.5 w-3.5 text-amber-400" />
                Judging Point • Live Console
              </Badge>
              <Badge className="border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                {settings.festName || 'Fest Central'}
              </Badge>
            </div>
            <h1 className="font-headline text-2xl sm:text-3xl font-extrabold tracking-tight">
              Assigned Competitions
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
              Select an event to open anonymous contestant scoring sheets by Code Letter.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Badge className="border-white/20 bg-white/10 text-white backdrop-blur-md px-3 py-1.5 text-xs font-semibold">
              {assignedPrograms.length} {assignedPrograms.length === 1 ? 'Program' : 'Programs'} Assigned
            </Badge>
          </div>
        </div>
      </section>

      {/* Status KPI Filter Strip */}
      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 sm:grid-cols-4">
        {[
          {
            label: 'All Assigned',
            val: stats.total,
            filter: 'all' as const,
            icon: Layers,
            accent: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
          },
          {
            label: 'Ready to Score',
            val: stats.ready,
            filter: 'ready' as const,
            icon: Sparkles,
            accent: 'text-sky-500 bg-sky-500/10 border-sky-500/20',
          },
          {
            label: 'In Progress',
            val: stats.inProgress,
            filter: 'in_progress' as const,
            icon: Clock,
            accent: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
          },
          {
            label: 'Completed',
            val: stats.completed,
            filter: 'completed' as const,
            icon: CheckCircle2,
            accent: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
          },
        ].map((item) => {
          const isActive = statusFilter === item.filter;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => setStatusFilter((prev) => (prev === item.filter ? 'all' : item.filter))}
              className={cn(
                'flex flex-col justify-between rounded-xl sm:rounded-2xl border bg-card/75 p-3 sm:p-4 text-left backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-95',
                isActive
                  ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md'
                  : 'border-border/60 hover:border-indigo-500/40'
              )}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {item.label}
                </span>
                <span className={cn('p-1.5 rounded-lg border', item.accent)}>
                  <item.icon className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="font-headline text-xl sm:text-2xl font-bold tracking-tight">
                {item.val}
              </div>
            </button>
          );
        })}
      </section>

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search programs or categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 rounded-xl border-border/60 bg-card/75 text-sm h-10 backdrop-blur-md"
          />
        </div>

        {(searchQuery || statusFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
            }}
            className="text-xs h-9 self-start sm:self-auto text-muted-foreground hover:text-foreground"
          >
            <FilterX className="mr-1.5 h-3.5 w-3.5" /> Clear Filters
          </Button>
        )}
      </div>

      {/* Programs Grid */}
      {filteredPrograms.length === 0 ? (
        <Card className="rounded-2xl border-border/60 bg-card/75 backdrop-blur-xl">
          <CardContent className="flex flex-col items-center justify-center py-14 text-center">
            <Trophy className="h-10 w-10 text-muted-foreground/35 mb-3" />
            <p className="font-semibold text-base">No Matching Programs</p>
            <p className="text-xs text-muted-foreground max-w-sm mt-1">
              {searchQuery || statusFilter !== 'all'
                ? 'Try clearing search terms or status filters.'
                : 'No programs are currently assigned to your judge profile.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPrograms.map((program) => {
            const isClosed = program.status === 'closed';
            const isComplete = program.status === 'completed';
            const isOnStage = program.mode === 'on-stage';

            return (
              <Card
                key={program.id}
                className={cn(
                  'group flex flex-col justify-between overflow-hidden rounded-xl sm:rounded-2xl border-border/60 bg-card/75 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-indigo-500/40 hover:shadow-xl',
                  isClosed && 'opacity-85'
                )}
              >
                <div>
                  <div
                    className={cn(
                      'h-1 w-full bg-gradient-to-r',
                      isComplete
                        ? 'from-emerald-400 to-teal-500'
                        : program.status === 'in_progress'
                        ? 'from-amber-400 to-orange-500'
                        : 'from-indigo-500 to-cyan-500'
                    )}
                  />

                  <CardHeader className="p-4 sm:p-5 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base sm:text-lg font-bold truncate group-hover:text-primary transition-colors">
                          {program.name}
                        </CardTitle>
                        <CardDescription className="text-xs mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0.2 rounded-md">
                            {program.categoryName}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] capitalize px-1.5 py-0.2 rounded-md">
                            {program.type}
                          </Badge>
                        </CardDescription>
                      </div>

                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
                          isOnStage
                            ? 'border-sky-500/25 bg-sky-500/10 text-sky-500'
                            : 'border-purple-500/25 bg-purple-500/10 text-purple-500'
                        )}
                      >
                        {isOnStage ? <Mic2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="px-4 sm:px-5 pb-3 space-y-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        Reported Contestants
                      </span>
                      <span className="font-semibold text-foreground">
                        {program.activeReportedCount}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Scoring Progress</span>
                        <span className="font-mono font-semibold text-foreground">
                          {program.scoredByThisJudge} / {program.activeReportedCount} ({program.pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500',
                            isComplete
                              ? 'bg-gradient-to-r from-emerald-400 to-teal-500'
                              : 'bg-gradient-to-r from-indigo-500 to-purple-500'
                          )}
                          style={{ width: `${program.pct}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </div>

                <CardFooter className="p-4 sm:p-5 pt-3 border-t border-border/50 bg-muted/15 flex flex-col gap-2">
                  <div className="flex items-center justify-between w-full">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md',
                        isClosed
                          ? 'border-rose-500/30 bg-rose-500/10 text-rose-500'
                          : isComplete
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                          : program.status === 'in_progress'
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300'
                          : program.status === 'ready'
                          ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
                          : 'border-border text-muted-foreground'
                      )}
                    >
                      {isClosed
                        ? 'Judging Closed'
                        : isComplete
                        ? 'Completed'
                        : program.status === 'in_progress'
                        ? 'In Progress'
                        : program.status === 'ready'
                        ? 'Ready to Score'
                        : 'Awaiting Report'}
                    </Badge>
                  </div>

                  <Button
                    asChild
                    className={cn(
                      'w-full rounded-xl h-10 text-xs sm:text-sm font-semibold transition-all shadow-sm',
                      isClosed
                        ? 'bg-muted text-muted-foreground hover:bg-muted'
                        : isComplete
                        ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                        : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 text-white hover:opacity-95'
                    )}
                    disabled={program.activeReportedCount === 0 && !isClosed}
                  >
                    <Link href={`/judges/judging-point/${program.id}`}>
                      {isClosed ? (
                        <>
                          <Lock className="mr-2 h-3.5 w-3.5" /> View Final Scores
                        </>
                      ) : program.scoredByThisJudge > 0 ? (
                        <>
                          <Edit className="mr-2 h-3.5 w-3.5" /> Edit Scores ({program.scoredByThisJudge}/{program.activeReportedCount})
                        </>
                      ) : (
                        <>
                          <Trophy className="mr-2 h-3.5 w-3.5" /> Start Judging
                        </>
                      )}
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
