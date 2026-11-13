'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { collection, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  useAppSettings,
  useCachedChunkedIn,
  useCachedCollection,
  useSharedCollection,
} from '@/context/firestore-cache';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import {
  Trophy,
  User as UserIcon,
  List,
  CheckCircle2,
  Clock,
  Sparkles,
  Loader2,
  ArrowRight,
  Mic2,
  Calendar,
  Activity,
} from 'lucide-react';
import type { User as JudgeUser } from '@/app/admin/access-central/page';
import type { Program } from '@/app/admin/programs/page';
import type { Category } from '@/app/admin/categories/page';
import { MascotOrbitShowcase } from '@/components/fest-mascot';
import { AnimatedCounter } from '@/components/animated-counter';
import { cn } from '@/lib/utils';

type JudgeAssignment = {
  id: string;
  programId: string;
  status?: string;
  codeLetter?: string;
};

type JudgeScore = {
  id: string;
  programId: string;
  assignmentId: string;
  judgeId: string;
};

export default function JudgeDashboard() {
  const [judge, setJudge] = useState<JudgeUser | null>(null);
  const [userChecked, setUserChecked] = useState(false);
  const { settings } = useAppSettings();

  const pageRef = useRef<HTMLDivElement>(null);
  const heroAnimatedRef = useRef(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('fest-central-user');
    if (storedUser) {
      setJudge(JSON.parse(storedUser));
    }
    setUserChecked(true);
  }, []);

  const { data: programs, loading: programsLoading } = useCachedCollection<Program>(
    judge ? `query:judge:programs:${judge.id}` : 'query:judge:programs:none',
    () => query(collection(db, 'programs'), where('judges', 'array-contains', judge!.id)),
    { enabled: !!judge, keepAlive: true }
  );

  const programIds = useMemo(() => programs.map((p) => p.id), [programs]);

  const { data: assignments, loading: assignmentsLoading } =
    useCachedChunkedIn<JudgeAssignment>('judge-assignments', 'assignments', 'programId', programIds, {
      enabled: !!judge && programIds.length > 0,
      keepAlive: true,
    });

  const { data: scores, loading: scoresLoading } = useCachedCollection<JudgeScore>(
    judge ? `query:judge:scores:${judge.id}` : 'query:judge:scores:none',
    () => query(collection(db, 'scores'), where('judgeId', '==', judge!.id)),
    { enabled: !!judge, keepAlive: true }
  );

  const { data: programCategories, loading: catsLoading } =
    useSharedCollection<Category>('programCategories', { enabled: !!judge });

  const categoryMap = useMemo(
    () => new Map(programCategories.map((c) => [c.id, c.name])),
    [programCategories]
  );

  const metrics = useMemo(() => {
    let completedCount = 0;
    let totalReportedEntries = 0;
    let totalScoredEntries = 0;

    const programRows = programs.map((program) => {
      const reportedParticipants = assignments.filter(
        (a) => a.programId === program.id && a.status !== 'cancelled' && a.codeLetter
      );
      const scoresForProgram = scores.filter((s) => s.programId === program.id);
      const reportedCount = reportedParticipants.length;
      const scoredCount = Math.min(scoresForProgram.length, reportedCount || scoresForProgram.length);

      totalReportedEntries += reportedCount;
      totalScoredEntries += scoresForProgram.length;

      let status: 'completed' | 'in_progress' | 'ready' | 'awaiting' = 'awaiting';
      if (reportedCount > 0 && scoresForProgram.length >= reportedCount) {
        status = 'completed';
        completedCount++;
      } else if (scoresForProgram.length > 0) {
        status = 'in_progress';
      } else if (reportedCount > 0) {
        status = 'ready';
      }

      const pct =
        reportedCount > 0
          ? Math.min(100, Math.round((scoresForProgram.length / reportedCount) * 100))
          : 0;

      return {
        program,
        categoryName: categoryMap.get(program.categoryId) || program.categoryName || 'General',
        reportedCount,
        scoredCount,
        pct,
        status,
      };
    });

    const assignedCount = programs.length;
    const pendingCount = Math.max(0, assignedCount - completedCount);
    const overallPct =
      assignedCount > 0 ? Math.round((completedCount / assignedCount) * 100) : 0;

    return {
      assignedCount,
      completedCount,
      pendingCount,
      totalReportedEntries,
      totalScoredEntries,
      overallPct,
      programRows,
    };
  }, [programs, assignments, scores, categoryMap]);

  const loading =
    !userChecked ||
    (!!judge &&
      (programsLoading ||
        scoresLoading ||
        catsLoading ||
        (programIds.length > 0 && assignmentsLoading)));

  useEffect(() => {
    if (loading || heroAnimatedRef.current || !pageRef.current) return;
    heroAnimatedRef.current = true;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      gsap.from('.judge-dash-stagger', {
        y: 20,
        opacity: 0,
        duration: 0.6,
        stagger: 0.07,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      });
      gsap.from('.judge-dash-card', {
        y: 16,
        scale: 0.97,
        opacity: 0,
        duration: 0.5,
        stagger: 0.06,
        delay: 0.1,
        ease: 'power2.out',
        clearProps: 'transform,opacity',
      });
    }, pageRef);

    return () => ctx.revert();
  }, [loading]);

  const handleCardPointerMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
  };

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-5rem)] flex-col items-center justify-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-indigo-500/25 blur-xl animate-pulse" />
          <Loader2 className="relative z-10 h-12 w-12 animate-spin text-indigo-500" />
        </div>
        <p className="font-medium text-muted-foreground animate-pulse">
          Loading Judge Scoring Console...
        </p>
      </div>
    );
  }

  const formattedDate = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const statCards = [
    {
      title: 'Assigned Programs',
      value: metrics.assignedCount,
      subtitle: 'Events in your judging queue',
      icon: List,
      href: '/judges/judging-point',
      accent: 'from-blue-500 to-cyan-500',
      iconColor: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    },
    {
      title: 'Completed Events',
      value: metrics.completedCount,
      subtitle: `${metrics.overallPct}% programs finished`,
      icon: CheckCircle2,
      href: '/judges/judging-point',
      accent: 'from-emerald-500 to-teal-500',
      iconColor: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    },
    {
      title: 'Pending Programs',
      value: metrics.pendingCount,
      subtitle: metrics.pendingCount === 0 ? 'All caught up!' : 'Awaiting scoring completion',
      icon: Clock,
      href: '/judges/judging-point',
      accent: 'from-amber-500 to-orange-500',
      iconColor: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    },
    {
      title: 'Entries Scored',
      value: metrics.totalScoredEntries,
      subtitle: `${metrics.totalReportedEntries} reported contestants`,
      icon: Trophy,
      href: '/judges/judging-point',
      accent: 'from-purple-500 to-pink-500',
      iconColor: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    },
  ];

  return (
    <div ref={pageRef} className="relative min-h-screen space-y-5 sm:space-y-7 pb-6 sm:pb-10">
      {/* Ambient Background */}
      <div className="pointer-events-none fixed inset-0 -z-10 h-full w-full overflow-hidden">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-indigo-500/10 blur-[130px]" />
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-amber-500/10 blur-[130px]" />
      </div>

      {/* Hero Command Banner with Animated Mascot & 3D Crest */}
      <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white shadow-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.22),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.14),transparent_55%)]" />

        <div className="relative z-10 grid items-center gap-5 sm:gap-6 p-4 sm:p-8 lg:grid-cols-[1.38fr_1fr]">
          <div className="space-y-5 sm:space-y-6">
            <div className="judge-dash-stagger flex flex-wrap items-center gap-2">
              <Badge className="border-indigo-400/30 bg-indigo-500/15 px-3 py-1 text-[11px] sm:text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20">
                <span className="relative mr-2 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                Judge Portal • {settings.festName || 'Fest Central'}
              </Badge>

              <Badge className="border-white/15 bg-white/10 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-medium text-slate-200 backdrop-blur-md hover:bg-white/15">
                <Calendar className="mr-1.5 h-3.5 w-3.5 text-amber-300" />
                {formattedDate}
              </Badge>
            </div>

            <div className="judge-dash-stagger space-y-1.5 sm:space-y-2">
              <h1 className="font-headline text-2xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl break-words">
                <span className="bg-gradient-to-r from-white via-indigo-100 to-amber-300 bg-clip-text text-transparent">
                  Welcome, {judge?.name || 'Judge'}
                </span>
              </h1>
              <p className="max-w-xl text-xs sm:text-sm leading-relaxed text-slate-300 sm:text-base">
                Review assigned competitions, track reported stage entries in real time, and submit
                verified marks directly from Judging Point.
              </p>
            </div>

            {/* Judging Progress Meter */}
            <div className="judge-dash-stagger max-w-xl space-y-2 rounded-xl sm:rounded-2xl border border-white/10 bg-white/5 p-3.5 sm:p-4 backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-between gap-1 text-xs sm:text-sm">
                <span className="font-medium text-slate-300">Overall Judging Progress</span>
                <span className="font-mono font-semibold text-amber-300">
                  {metrics.completedCount} / {metrics.assignedCount} Programs ({metrics.overallPct}%)
                </span>
              </div>
              <div className="h-2 sm:h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-emerald-400 to-amber-400 transition-all duration-700"
                  style={{ width: `${metrics.overallPct}%` }}
                />
              </div>
              <p className="text-[11px] sm:text-xs text-slate-300">
                {metrics.totalScoredEntries} of {metrics.totalReportedEntries} reported entries scored
                across your panel.
              </p>
            </div>

            <div className="judge-dash-stagger flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
              <Button
                asChild
                size="default"
                className="rounded-xl border-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-500 text-white shadow-lg shadow-indigo-500/25 transition-all hover:-translate-y-0.5 hover:opacity-95 justify-center h-10 sm:h-11 text-xs sm:text-sm"
              >
                <Link href="/judges/judging-point">
                  <Trophy className="mr-2 h-4 w-4" />
                  Start Judging
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="default"
                className="rounded-xl border-white/20 bg-white/10 text-white backdrop-blur-md hover:bg-white/20 hover:text-white justify-center h-10 sm:h-11 text-xs sm:text-sm"
              >
                <Link href="/judges/profile">
                  <UserIcon className="mr-2 h-4 w-4" />
                  My Profile
                </Link>
              </Button>
            </div>
          </div>

          <MascotOrbitShowcase
            orbitVariant="assignments"
            badgeText={judge?.name || 'Judge Portal'}
            pulseKey={`${metrics.assignedCount}-${metrics.completedCount}-${metrics.totalScoredEntries}`}
            footerLeftText={`${metrics.totalReportedEntries} Reported`}
            footerRightText={`${metrics.overallPct}% Scored`}
            frameTone="dark"
            className="h-60 sm:h-80 lg:h-[330px]"
          />
        </div>
      </section>

      {/* KPI Cards */}
      <section className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {statCards.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.title} href={item.href} className="group block">
              <Card
                onMouseMove={handleCardPointerMove}
                className="judge-dash-card relative h-full overflow-hidden rounded-xl sm:rounded-2xl border-border/60 bg-card/75 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
              >
                <div className={cn('h-1 w-full bg-gradient-to-r', item.accent)} />
                <div
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background:
                      'radial-gradient(280px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(99,102,241,0.12), transparent 60%)',
                  }}
                />
                <CardHeader className="relative z-10 flex flex-row items-center justify-between space-y-0 p-3 sm:p-5 pb-1 sm:pb-2">
                  <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground truncate mr-1">
                    {item.title}
                  </CardTitle>
                  <div className={cn('rounded-lg sm:rounded-xl border p-1.5 sm:p-2 shrink-0', item.iconColor)}>
                    <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </div>
                </CardHeader>
                <CardContent className="relative z-10 p-3 sm:p-5 pt-0">
                  <div className="font-headline text-2xl sm:text-3xl font-bold tracking-tight">
                    <AnimatedCounter value={item.value} />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] sm:text-xs text-muted-foreground">
                    <span className="truncate">{item.subtitle}</span>
                    <ArrowRight className="h-3 w-3 shrink-0 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100 hidden sm:inline-block" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>

      {/* Assigned Judging Queue + Quick Guide */}
      <section className="grid gap-5 sm:gap-6 lg:grid-cols-12">
        <Card className="judge-dash-card overflow-hidden rounded-xl sm:rounded-2xl border-border/60 bg-card/75 shadow-lg backdrop-blur-xl lg:col-span-8">
          <CardHeader className="border-b border-border/50 bg-muted/20 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 font-headline text-lg sm:text-xl">
                  <Activity className="h-5 w-5 text-indigo-500" />
                  Your Judging Queue
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Click any event to open live code-letter scoring sheets.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild className="rounded-xl self-start sm:self-auto text-xs">
                <Link href="/judges/judging-point">
                  All Events <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-3.5 sm:p-5">
            {metrics.programRows.length > 0 ? (
              <div className="space-y-3">
                {metrics.programRows.map(({ program, categoryName, reportedCount, scoredCount, pct, status }) => {
                  const isOnStage = program.mode === 'on-stage';
                  return (
                    <Link
                      key={program.id}
                      href={`/judges/judging-point/${program.id}`}
                      className="group block rounded-xl sm:rounded-2xl border border-border/50 bg-background/60 p-3.5 sm:p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-500/40 hover:bg-muted/35 hover:shadow-md"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={cn(
                              'flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl border',
                              isOnStage
                                ? 'border-sky-500/25 bg-sky-500/10 text-sky-500'
                                : 'border-purple-500/25 bg-purple-500/10 text-purple-500'
                            )}
                          >
                            {isOnStage ? <Mic2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-sm sm:text-base transition-colors group-hover:text-primary">
                              {program.name}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline" className="rounded-md text-[10px] sm:text-[11px] px-1.5 py-0.5">
                                {categoryName}
                              </Badge>
                              <Badge variant="secondary" className="rounded-md text-[10px] sm:text-[11px] capitalize px-1.5 py-0.5">
                                {program.type}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto ml-auto sm:ml-0">
                          <Badge
                            variant="outline"
                            className={cn(
                              'rounded-full text-[11px] sm:text-xs',
                              status === 'completed'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                                : status === 'in_progress'
                                ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300'
                                : status === 'ready'
                                ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
                                : 'border-border bg-muted/50 text-muted-foreground'
                            )}
                          >
                            {status === 'completed'
                              ? 'Completed'
                              : status === 'in_progress'
                              ? 'In Progress'
                              : status === 'ready'
                              ? 'Ready to Score'
                              : 'Awaiting Stage Report'}
                          </Badge>
                          <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground opacity-50 transition-all group-hover:translate-x-1 group-hover:text-primary group-hover:opacity-100" />
                        </div>
                      </div>

                      <div className="mt-2.5 sm:mt-3 space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Entries Scored</span>
                          <span className="font-mono font-semibold text-foreground">
                            {scoredCount} / {reportedCount} ({pct}%)
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-500',
                              status === 'completed'
                                ? 'bg-gradient-to-r from-emerald-400 to-teal-500'
                                : 'bg-gradient-to-r from-indigo-500 to-purple-500'
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/15 py-14 text-center">
                <Trophy className="mb-3 h-9 w-9 text-muted-foreground/35" />
                <p className="font-semibold">No Programs Assigned Yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Once the fest coordinator links you to programs, they will stream here live.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="judge-dash-card flex flex-col justify-between overflow-hidden rounded-xl sm:rounded-2xl border-border/60 bg-card/75 shadow-lg backdrop-blur-xl lg:col-span-4">
          <CardHeader className="border-b border-border/50 bg-muted/20 p-4 sm:p-5">
            <CardTitle className="font-headline text-lg sm:text-xl">Quick Controls</CardTitle>
            <CardDescription className="text-xs">Navigate your judging workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4 sm:p-5">
            <Link
              href="/judges/judging-point"
              className="group flex items-center justify-between rounded-xl sm:rounded-2xl border border-indigo-500/25 bg-indigo-500/10 p-3.5 sm:p-4 transition-all hover:-translate-y-0.5 hover:border-indigo-500/45 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 text-white shadow-sm">
                  <Trophy className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Judging Point</p>
                  <p className="text-xs text-muted-foreground">Enter &amp; save live scores</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-indigo-500 transition-transform group-hover:translate-x-1" />
            </Link>

            <Link
              href="/judges/profile"
              className="group flex items-center justify-between rounded-xl sm:rounded-2xl border border-border/60 bg-background/60 p-3.5 sm:p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-muted text-foreground">
                  <UserIcon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Judge Profile</p>
                  <p className="text-xs text-muted-foreground">View account credentials</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </Link>

            <div className="rounded-xl sm:rounded-2xl border border-border/50 bg-muted/25 p-3.5 sm:p-4 text-xs leading-relaxed text-muted-foreground">
              Scores are matched anonymously using participant <strong className="text-foreground">Code Letters</strong>{' '}
              issued by Stage Control and sync automatically once saved.
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
