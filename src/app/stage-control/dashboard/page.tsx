'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { collection, documentId, query, where } from 'firebase/firestore';
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
  List,
  Megaphone,
  Tv,
  PlayCircle,
  Loader2,
  ArrowRight,
  CheckCircle2,
  Clock,
  Users,
  Mic2,
  Sparkles,
  Activity,
} from 'lucide-react';
import type { User } from '@/app/admin/access-central/page';
import type { Stage } from '@/app/admin/stage-central/page';
import type { Program as BaseProgram } from '@/app/admin/programs/page';
import type { Category } from '@/app/admin/categories/page';
import { MascotOrbitShowcase } from '@/components/fest-mascot';
import { AnimatedCounter } from '@/components/animated-counter';
import { cn } from '@/lib/utils';

type StageAssignment = {
  id: string;
  programId: string;
  studentId: string;
  teamId: string;
  codeLetter?: string;
  status?: 'cancelled';
};

export default function StageControlDashboard() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userChecked, setUserChecked] = useState(false);
  const { settings } = useAppSettings();

  const pageRef = useRef<HTMLDivElement>(null);
  const heroAnimatedRef = useRef(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('fest-central-user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
    setUserChecked(true);
  }, []);

  const { data: stages, loading: stageLoading } = useCachedCollection<Stage>(
    currentUser ? `query:stage:${currentUser.id}` : 'query:stage:none',
    () => query(collection(db, 'stages'), where('controllerId', '==', currentUser!.id)),
    { enabled: !!currentUser, keepAlive: true }
  );

  const stage = stages[0] ?? null;
  const stageProgramIds = useMemo(
    () =>
      Array.isArray(stage?.programIds)
        ? stage.programIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : [],
    [stage?.programIds]
  );
  const hasStagePrograms = stageProgramIds.length > 0;

  const { data: programCategories, loading: catsLoading } =
    useSharedCollection<Category>('programCategories', { enabled: hasStagePrograms });

  const { data: rawPrograms, loading: progsLoading } = useCachedChunkedIn<BaseProgram>(
    'stage-programs',
    'programs',
    documentId(),
    stageProgramIds,
    { enabled: hasStagePrograms, keepAlive: true }
  );

  const { data: assignments, loading: assignmentsLoading } =
    useCachedChunkedIn<StageAssignment>(
      'stage-assignments',
      'assignments',
      'programId',
      stageProgramIds,
      { enabled: hasStagePrograms, keepAlive: true }
    );

  const categoryMap = useMemo(
    () => new Map(programCategories.map((c) => [c.id, c.name])),
    [programCategories]
  );

  const stageMetrics = useMemo(() => {
    let completedPrograms = 0;
    let inProgressPrograms = 0;
    let notStartedPrograms = 0;
    let totalActiveEntries = 0;
    let totalReportedEntries = 0;

    const programRows = rawPrograms
      .map((program) => {
        const activeEntries = assignments.filter(
          (a) => a.programId === program.id && a.status !== 'cancelled'
        );
        const reportedEntries = activeEntries.filter((a) => !!a.codeLetter);

        const activeCount = activeEntries.length;
        const reportedCount = reportedEntries.length;

        totalActiveEntries += activeCount;
        totalReportedEntries += reportedCount;

        let status: 'completed' | 'in_progress' | 'not_started' | 'empty' = 'empty';
        if (activeCount === 0) {
          status = 'empty';
        } else if (reportedCount >= activeCount) {
          status = 'completed';
          completedPrograms++;
        } else if (reportedCount > 0) {
          status = 'in_progress';
          inProgressPrograms++;
        } else {
          status = 'not_started';
          notStartedPrograms++;
        }

        const pct = activeCount > 0 ? Math.round((reportedCount / activeCount) * 100) : 0;

        return {
          program,
          categoryName: categoryMap.get(program.categoryId) || program.categoryName || 'General',
          activeCount,
          reportedCount,
          pct,
          status,
        };
      })
      .sort((a, b) => (a.program.name || '').localeCompare(b.program.name || ''));

    const totalPrograms = stageProgramIds.length;
    const overallReportingPct =
      totalActiveEntries > 0 ? Math.round((totalReportedEntries / totalActiveEntries) * 100) : 0;

    return {
      totalPrograms,
      completedPrograms,
      inProgressPrograms,
      notStartedPrograms,
      totalActiveEntries,
      totalReportedEntries,
      overallReportingPct,
      programRows,
    };
  }, [rawPrograms, assignments, categoryMap, stageProgramIds.length]);

  const loading =
    !userChecked ||
    (!!currentUser &&
      (stageLoading || (hasStagePrograms && (catsLoading || progsLoading || assignmentsLoading))));

  useEffect(() => {
    if (loading || !stage || heroAnimatedRef.current || !pageRef.current) return;
    heroAnimatedRef.current = true;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      gsap.from('.stage-dash-stagger', {
        y: 20,
        opacity: 0,
        duration: 0.6,
        stagger: 0.07,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      });
      gsap.from('.stage-dash-card', {
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
  }, [loading, stage]);

  const handleCardPointerMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
  };

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-5rem)] flex-col items-center justify-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-cyan-500/25 blur-xl animate-pulse" />
          <Loader2 className="relative z-10 h-12 w-12 animate-spin text-cyan-500" />
        </div>
        <p className="font-medium text-muted-foreground animate-pulse">
          Loading Stage Control Console...
        </p>
      </div>
    );
  }

  if (!stage) {
    return (
      <div className="flex h-[calc(100vh-6rem)] items-center justify-center">
        <Card className="w-full max-w-md border-border/60 bg-card/75 shadow-lg backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-center font-headline text-xl">No Stage Assigned</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-sm text-muted-foreground">
              You have not been assigned to control any stage. Please contact the administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Assigned Programs',
      value: stageMetrics.totalPrograms,
      subtitle: 'Scheduled for this stage',
      icon: List,
      href: '/stage-control/programs',
      accent: 'from-cyan-500 to-blue-500',
      iconColor: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
    },
    {
      title: 'Ready / Completed',
      value: stageMetrics.completedPrograms,
      subtitle: `${stageMetrics.inProgressPrograms} in progress`,
      icon: CheckCircle2,
      href: '/stage-control/programs',
      accent: 'from-emerald-500 to-teal-500',
      iconColor: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    },
    {
      title: 'Participants Reported',
      value: stageMetrics.totalReportedEntries,
      subtitle: `of ${stageMetrics.totalActiveEntries} active contestants`,
      icon: Users,
      href: '/stage-control/programs',
      accent: 'from-indigo-500 to-purple-500',
      iconColor: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
    },
    {
      title: 'Pending Start',
      value: stageMetrics.notStartedPrograms,
      subtitle: 'Events awaiting check-in',
      icon: Clock,
      href: '/stage-control/programs',
      accent: 'from-amber-500 to-orange-500',
      iconColor: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    },
  ];

  return (
    <div ref={pageRef} className="relative min-h-screen space-y-5 sm:space-y-7 pb-6 sm:pb-10">
      {/* Ambient Background */}
      <div className="pointer-events-none fixed inset-0 -z-10 h-full w-full overflow-hidden">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-cyan-500/10 blur-[130px]" />
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-indigo-500/10 blur-[130px]" />
      </div>

      {/* Hero Stage Command Banner with Animated Mascot & 3D Crest */}
      <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white shadow-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(6,182,212,0.2),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.16),transparent_55%)]" />

        <div className="relative z-10 grid items-center gap-5 sm:gap-6 p-4 sm:p-8 lg:grid-cols-[1.38fr_1fr]">
          <div className="space-y-5 sm:space-y-6">
            <div className="stage-dash-stagger flex flex-wrap items-center gap-2">
              <Badge className="border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-[11px] sm:text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20">
                <span className="relative mr-2 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                Stage Active • Live Operations
              </Badge>

              <Badge className="border-white/15 bg-white/10 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-medium text-slate-200 backdrop-blur-md hover:bg-white/15">
                <Tv className="mr-1.5 h-3.5 w-3.5 text-cyan-300" />
                {settings.festName || 'Fest Central'}
              </Badge>
            </div>

            <div className="stage-dash-stagger space-y-1.5 sm:space-y-2">
              <h1 className="font-headline text-2xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl break-words">
                <span className="bg-gradient-to-r from-white via-cyan-100 to-sky-300 bg-clip-text text-transparent">
                  {stage.name}
                </span>
              </h1>
              <p className="max-w-xl text-xs sm:text-sm leading-relaxed text-slate-300 sm:text-base">
                Coordinate backstage contestant check-ins, issue randomized code letters, and keep
                your stage lineup running on schedule.
              </p>
            </div>

            {/* Reporting Readiness Meter */}
            <div className="stage-dash-stagger max-w-xl space-y-2 rounded-xl sm:rounded-2xl border border-white/10 bg-white/5 p-3.5 sm:p-4 backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-between gap-1 text-xs sm:text-sm">
                <span className="font-medium text-slate-300">Backstage Check-In Progress</span>
                <span className="font-mono font-semibold text-cyan-300">
                  {stageMetrics.totalReportedEntries} / {stageMetrics.totalActiveEntries} Entries (
                  {stageMetrics.overallReportingPct}%)
                </span>
              </div>
              <div className="h-2 sm:h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-400 transition-all duration-700"
                  style={{ width: `${stageMetrics.overallReportingPct}%` }}
                />
              </div>
              <p className="text-[11px] sm:text-xs text-slate-300">
                {stageMetrics.completedPrograms} of {stageMetrics.totalPrograms} stage events fully
                checked in.
              </p>
            </div>

            <div className="stage-dash-stagger flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
              <Button
                asChild
                size="default"
                className="rounded-xl border-0 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 text-white shadow-lg shadow-cyan-500/25 transition-all hover:-translate-y-0.5 hover:opacity-95 justify-center h-10 sm:h-11 text-xs sm:text-sm"
              >
                <Link href="/stage-control/programs">
                  <List className="mr-2 h-4 w-4" />
                  Manage Stage Programs
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="default"
                className="rounded-xl border-white/20 bg-white/10 text-white backdrop-blur-md hover:bg-white/20 hover:text-white justify-center h-10 sm:h-11 text-xs sm:text-sm"
              >
                <Link href="/stage-control/inform">
                  <Megaphone className="mr-2 h-4 w-4 text-amber-300" />
                  Make Announcement
                </Link>
              </Button>
            </div>
          </div>

          <MascotOrbitShowcase
            orbitVariant="participants"
            badgeText={stage.name}
            pulseKey={`${stageMetrics.totalPrograms}-${stageMetrics.completedPrograms}-${stageMetrics.totalReportedEntries}`}
            footerLeftText={`${stageMetrics.totalPrograms} Events`}
            footerRightText={`${stageMetrics.overallReportingPct}% Checked In`}
            frameTone="dark"
            className="h-60 sm:h-80 lg:h-[330px]"
          />
        </div>
      </section>

      {/* KPI Strip */}
      <section className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {statCards.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.title} href={item.href} className="group block">
              <Card
                onMouseMove={handleCardPointerMove}
                className="stage-dash-card relative h-full overflow-hidden rounded-xl sm:rounded-2xl border-border/60 bg-card/75 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
              >
                <div className={cn('h-1 w-full bg-gradient-to-r', item.accent)} />
                <div
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background:
                      'radial-gradient(280px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(6,182,212,0.12), transparent 60%)',
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

      {/* Stage Lineup & Quick Operations */}
      <section className="grid gap-5 sm:gap-6 lg:grid-cols-12">
        <Card className="stage-dash-card overflow-hidden rounded-xl sm:rounded-2xl border-border/60 bg-card/75 shadow-lg backdrop-blur-xl lg:col-span-8">
          <CardHeader className="border-b border-border/50 bg-muted/20 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 font-headline text-lg sm:text-xl">
                  <Activity className="h-5 w-5 text-cyan-500" />
                  Stage Event Lineup
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Live reporting &amp; code-letter assignment status across stage programs.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild className="rounded-xl self-start sm:self-auto text-xs">
                <Link href="/stage-control/programs">
                  Open Reporting <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-3.5 sm:p-5">
            {stageMetrics.programRows.length > 0 ? (
              <div className="space-y-3">
                {stageMetrics.programRows.map(
                  ({ program, categoryName, activeCount, reportedCount, pct, status }) => {
                    const isOnStage = program.mode === 'on-stage';
                    return (
                      <Link
                        key={program.id}
                        href="/stage-control/programs"
                        className="group block rounded-xl sm:rounded-2xl border border-border/50 bg-background/60 p-3.5 sm:p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-500/40 hover:bg-muted/35 hover:shadow-md"
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
                              {isOnStage ? (
                                <Mic2 className="h-4 w-4" />
                              ) : (
                                <Sparkles className="h-4 w-4" />
                              )}
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
                                  : status === 'not_started'
                                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300'
                                  : 'border-border bg-muted/50 text-muted-foreground'
                              )}
                            >
                              {status === 'completed'
                                ? 'Completed'
                                : status === 'in_progress'
                                ? 'In Progress'
                                : status === 'not_started'
                                ? 'Not Started'
                                : 'No Participants'}
                            </Badge>
                            <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground opacity-50 transition-all group-hover:translate-x-1 group-hover:text-primary group-hover:opacity-100" />
                          </div>
                        </div>

                        <div className="mt-2.5 sm:mt-3 space-y-1.5">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Reported Contestants</span>
                            <span className="font-mono font-semibold text-foreground">
                              {reportedCount} / {activeCount} ({pct}%)
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all duration-500',
                                status === 'completed'
                                  ? 'bg-gradient-to-r from-emerald-400 to-teal-500'
                                  : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </Link>
                    );
                  }
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/15 py-14 text-center">
                <Tv className="mb-3 h-9 w-9 text-muted-foreground/35" />
                <p className="font-semibold">No Programs Scheduled on This Stage</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Programs assigned to {stage.name} in Stage Central will appear here live.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="stage-dash-card flex flex-col justify-between overflow-hidden rounded-2xl border-border/60 bg-card/75 shadow-lg backdrop-blur-xl lg:col-span-4">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="font-headline text-xl">Stage Operations</CardTitle>
            <CardDescription>Quick actions for {stage.name}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-5">
            <Link
              href="/stage-control/programs"
              className="group flex items-center justify-between rounded-2xl border border-cyan-500/25 bg-cyan-500/10 p-4 transition-all hover:-translate-y-0.5 hover:border-cyan-500/45 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500 text-white shadow-sm">
                  <List className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Stage Programs</p>
                  <p className="text-xs text-muted-foreground">Assign code letters &amp; check in</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-cyan-500 transition-transform group-hover:translate-x-1" />
            </Link>

            <Link
              href="/stage-control/inform"
              className="group flex items-center justify-between rounded-2xl border border-border/60 bg-background/60 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-muted text-foreground">
                  <Megaphone className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Stage Announcements</p>
                  <p className="text-xs text-muted-foreground">Open coordinator alerts</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </Link>

            <div className="rounded-2xl border border-border/50 bg-muted/25 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <PlayCircle className="h-3.5 w-3.5 text-emerald-500" /> Stage Status
                </span>
                <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30 text-[11px]">
                  Active
                </Badge>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Reporting updates synchronize instantaneously with Judges&apos; Judging Point and Admin
                Coordination.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
