'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { collection, doc, getCountFromServer, query, setDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  useAppSettings,
  useCachedDoc,
  useFirestoreCacheStore,
  useSharedCollection,
} from '@/context/firestore-cache';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import Link from 'next/link';
import {
  ArrowRight,
  Users,
  List,
  UserCheck,
  Trophy,
  BarChart3,
  PlusCircle,
  Activity,
  Sparkles,
  Shield,
  Settings,
  Mic2,
  Radio,
  CreditCard,
  Lock,
  Unlock,
  ExternalLink,
  Loader2,
  Crown,
  Medal,
  Search,
  X,
  Layers,
  PieChart,
} from 'lucide-react';
import type { Program } from '@/app/admin/programs/page';
import type { Category } from '@/app/admin/categories/page';
import { TeamOrbitCanvas } from '@/components/team-orbit-canvas';
import { AnimatedCounter } from '@/components/animated-counter';
import { cn } from '@/lib/utils';

type AdminStats = {
  teams: number;
  judges: number;
  participants: number;
  publishedResults: number;
};

type PublishedStandings = {
  results: {
    teamId: string;
    teamName: string;
    leaderName: string;
    totalPoints: number;
  }[];
  publishedAtResultCount: number;
};

type OrbitMode = 'admin' | 'festival' | 'assignments';

const QUICK_ACTIONS = [
  {
    label: 'Manage Teams',
    subtitle: 'Houses, leaders & chest ranges',
    icon: Users,
    href: '/admin/teams',
    accent: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  },
  {
    label: 'Manage Programs',
    subtitle: 'Events, judges & quotas',
    icon: List,
    href: '/admin/programs',
    accent: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
  },
  {
    label: 'Access Central',
    subtitle: 'User roles & portal passwords',
    icon: Shield,
    href: '/admin/access-central',
    accent: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20',
  },
  {
    label: 'Results Center',
    subtitle: 'Verify & publish event ranks',
    icon: Trophy,
    href: '/admin/results',
    accent: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  },
  {
    label: 'Stage Central',
    subtitle: 'Live stage flow & coordination',
    icon: Radio,
    href: '/admin/stage-central',
    accent: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
  },
  {
    label: 'Reporting & Analytics',
    subtitle: 'Standings, points & summaries',
    icon: BarChart3,
    href: '/admin/reporting',
    accent: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
  },
  {
    label: 'ID Card Setup',
    subtitle: 'QR badges & printable exports',
    icon: CreditCard,
    href: '/admin/id-card-setup',
    accent: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
  },
  {
    label: 'Global Settings',
    subtitle: 'Fest title & portal permissions',
    icon: Settings,
    href: '/admin/settings',
    accent: 'text-slate-500 bg-slate-500/10 border-slate-500/20',
  },
];

export default function AdminDashboard() {
  const cacheStore = useFirestoreCacheStore();
  const { settings } = useAppSettings();

  const [stats, setStats] = useState<AdminStats>({
    teams: 0,
    judges: 0,
    participants: 0,
    publishedResults: 0,
  });
  const [countsLoading, setCountsLoading] = useState(true);
  const [togglingAssignments, setTogglingAssignments] = useState(false);

  const [orbitMode, setOrbitMode] = useState<OrbitMode>('admin');
  const [programSearch, setProgramSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const pageRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const heroAnimatedRef = useRef(false);

  const { data: allPrograms, loading: programsLoading } =
    useSharedCollection<Program>('programs');
  const { data: programCategories, loading: catsLoading } =
    useSharedCollection<Category>('programCategories');
  const { data: standings, loading: standingsLoading } = useCachedDoc<PublishedStandings>(
    'doc:standings:team_marks',
    () => doc(db, 'standings', 'team_marks')
  );

  const categoryMap = useMemo(
    () => new Map(programCategories.map((c) => [c.id, c.name])),
    [programCategories]
  );

  const programBreakdown = useMemo(() => {
    let onStage = 0;
    let offStage = 0;
    let individual = 0;
    let group = 0;
    const byCategory = new Map<string, number>();

    for (const p of allPrograms) {
      if (p.mode === 'on-stage') onStage++;
      else offStage++;

      if (p.type === 'group') group++;
      else individual++;

      byCategory.set(p.categoryId, (byCategory.get(p.categoryId) || 0) + 1);
    }

    const total = allPrograms.length;
    return {
      total,
      onStage,
      offStage,
      individual,
      group,
      onStagePct: total > 0 ? Math.round((onStage / total) * 100) : 0,
      individualPct: total > 0 ? Math.round((individual / total) * 100) : 0,
      byCategory,
    };
  }, [allPrograms]);

  const filteredPrograms = useMemo(() => {
    const q = programSearch.trim().toLowerCase();
    return [...allPrograms]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((p) => (selectedCategory === 'all' ? true : p.categoryId === selectedCategory))
      .filter((p) => {
        if (!q) return true;
        const catName = (categoryMap.get(p.categoryId) || p.categoryName || '').toLowerCase();
        return p.name.toLowerCase().includes(q) || catName.includes(q);
      });
  }, [allPrograms, programSearch, selectedCategory, categoryMap]);

  useEffect(() => {
    let active = true;

    const loadCounts = async () => {
      try {
        const cachedTeams = cacheStore.peekCount('col:teams');
        const cachedStudents = cacheStore.peekCount('col:students');
        const cachedResults = cacheStore.peekCount('col:publishedResults');

        const [teamsCount, judgesCount, studentsCount, resultsCount] = await Promise.all([
          cachedTeams !== null
            ? Promise.resolve(cachedTeams)
            : getCountFromServer(collection(db, 'teams')).then((s) => s.data().count),
          getCountFromServer(query(collection(db, 'users'), where('role', '==', 'judges'))).then(
            (s) => s.data().count
          ),
          cachedStudents !== null
            ? Promise.resolve(cachedStudents)
            : getCountFromServer(collection(db, 'students')).then((s) => s.data().count),
          cachedResults !== null
            ? Promise.resolve(cachedResults)
            : getCountFromServer(collection(db, 'publishedResults')).then((s) => s.data().count),
        ]);

        if (!active) return;
        setStats({
          teams: teamsCount,
          judges: judgesCount,
          participants: studentsCount,
          publishedResults: resultsCount,
        });
      } catch (error) {
        console.error('Error loading dashboard counts:', error);
      } finally {
        if (active) setCountsLoading(false);
      }
    };

    loadCounts();
    return () => {
      active = false;
    };
  }, [cacheStore]);

  const loading = countsLoading || programsLoading || catsLoading || standingsLoading;

  useEffect(() => {
    if (loading || heroAnimatedRef.current || !pageRef.current) return;
    heroAnimatedRef.current = true;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      gsap.from('.admin-dash-stagger', {
        y: 20,
        opacity: 0,
        duration: 0.6,
        stagger: 0.07,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      });
      gsap.from('.admin-dash-card', {
        y: 16,
        scale: 0.97,
        opacity: 0,
        duration: 0.5,
        stagger: 0.05,
        delay: 0.1,
        ease: 'power2.out',
        clearProps: 'transform,opacity',
      });
    }, pageRef);

    return () => ctx.revert();
  }, [loading]);

  useEffect(() => {
    if (loading || !listRef.current) return;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      const rows = gsap.utils.toArray<HTMLElement>('.admin-prog-row');
      if (rows.length === 0) return;
      gsap.fromTo(
        rows,
        { y: 10, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.32,
          stagger: 0.035,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        }
      );
    }, listRef);

    return () => ctx.revert();
  }, [loading, selectedCategory]);

  const handleCardPointerMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
  };

  const handleToggleTeamAssignment = async (nextAllowed: boolean) => {
    setTogglingAssignments(true);
    try {
      await setDoc(
        doc(db, 'settings', 'global'),
        { allowTeamAssignment: nextAllowed },
        { merge: true }
      );
      toast({
        title: nextAllowed ? 'Team Assignments Opened' : 'Team Assignments Locked',
        description: nextAllowed
          ? 'Team leaders can now assign and update participants.'
          : 'Participant assignments are now locked for team portals.',
      });
    } catch (error) {
      console.error('Failed to update assignment setting:', error);
      toast({
        title: 'Error',
        description: 'Could not update team assignment lock.',
        variant: 'destructive',
      });
    } finally {
      setTogglingAssignments(false);
    }
  };

  const resultsProgressPct =
    programBreakdown.total > 0
      ? Math.min(100, Math.round((stats.publishedResults / programBreakdown.total) * 100))
      : 0;

  const leaderboardTeams = standings?.results ?? [];
  const topTeam = leaderboardTeams[0] ?? null;
  const topScore = topTeam?.totalPoints ?? 0;
  const avgParticipantsPerTeam =
    stats.teams > 0 ? Math.round((stats.participants / stats.teams) * 10) / 10 : 0;

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-6rem)] flex-col items-center justify-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-indigo-500/25 blur-xl animate-pulse" />
          <Loader2 className="relative z-10 h-12 w-12 animate-spin text-indigo-500" />
        </div>
        <p className="font-medium text-muted-foreground animate-pulse">
          Loading Admin Command Center...
        </p>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Teams',
      value: stats.teams,
      subtitle:
        avgParticipantsPerTeam > 0
          ? `~${avgParticipantsPerTeam} contestants per house`
          : 'Competing houses & leaders',
      icon: Users,
      href: '/admin/teams',
      accent: 'from-blue-500 to-cyan-500',
      iconColor: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    },
    {
      title: 'Total Programs',
      value: programBreakdown.total,
      subtitle: `${programBreakdown.onStage} Stage • ${programBreakdown.offStage} Off-Stage`,
      icon: List,
      href: '/admin/programs',
      accent: 'from-indigo-500 to-purple-500',
      iconColor: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
    },
    {
      title: 'Participants',
      value: stats.participants,
      subtitle: `${programCategories.length} active categories`,
      icon: UserCheck,
      href: '/admin/program-coordination',
      accent: 'from-pink-500 to-rose-500',
      iconColor: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
    },
    {
      title: 'Published Results',
      value: stats.publishedResults,
      subtitle: `${stats.judges} judges • ${resultsProgressPct}% complete`,
      icon: Trophy,
      href: '/admin/results',
      accent: 'from-amber-500 to-orange-500',
      iconColor: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    },
  ];

  return (
    <div ref={pageRef} className="relative min-h-screen space-y-7 pb-10">
      {/* Ambient Background */}
      <div className="pointer-events-none fixed inset-0 -z-10 h-full w-full overflow-hidden">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-indigo-500/10 blur-[130px]" />
        <div className="absolute -right-24 top-1/3 h-96 w-96 rounded-full bg-purple-500/10 blur-[130px]" />
        <div className="absolute -bottom-24 left-1/3 h-80 w-80 rounded-full bg-amber-500/10 blur-[120px]" />
      </div>

      {/* Hero Command Deck with Interactive Three.js Sculpture */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white shadow-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.22),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.16),transparent_55%)]" />

        <div className="relative z-10 grid items-center gap-6 p-6 sm:p-8 lg:grid-cols-[1.38fr_1fr]">
          <div className="space-y-6">
            <div className="admin-dash-stagger flex flex-wrap items-center gap-2.5">
              <Badge className="border-indigo-400/30 bg-indigo-500/15 px-3.5 py-1 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20">
                <span className="relative mr-2 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                Admin Command Center
              </Badge>

              {topTeam && (
                <Badge className="border-amber-400/30 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/20">
                  <Crown className="mr-1.5 h-3.5 w-3.5 text-amber-300" />
                  Leading: {topTeam.teamName} ({topTeam.totalPoints.toFixed(1)} pts)
                </Badge>
              )}
            </div>

            <div className="admin-dash-stagger space-y-2">
              <h1 className="font-headline text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
                <span className="bg-gradient-to-r from-white via-indigo-100 to-amber-300 bg-clip-text text-transparent">
                  {settings.festName || 'Fest Central'}
                </span>
              </h1>
              <p className="max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
                Real-time fest operations, live house standings race, program analytics, and instant
                team portal controls.
              </p>
            </div>

            {/* Live Progress + Instant Team Lock Switch */}
            <div className="admin-dash-stagger grid max-w-2xl gap-3 sm:grid-cols-[1.35fr_1fr]">
              <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="font-medium text-slate-300">Results Publication</span>
                  <span className="font-mono font-semibold text-amber-300">
                    {stats.publishedResults} / {programBreakdown.total} ({resultsProgressPct}%)
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-purple-400 to-amber-400 transition-all duration-700"
                    style={{ width: `${resultsProgressPct}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                    {settings.allowTeamAssignment ? (
                      <Unlock className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Lock className="h-3.5 w-3.5 text-amber-400" />
                    )}
                    <span>Team Editing</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-300">
                    {settings.allowTeamAssignment ? 'Portals Open' : 'Portals Locked'}
                  </p>
                </div>
                <Switch
                  checked={settings.allowTeamAssignment}
                  disabled={togglingAssignments}
                  onCheckedChange={handleToggleTeamAssignment}
                  aria-label="Toggle team assignments lock"
                />
              </div>
            </div>

            <div className="admin-dash-stagger flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"
                className="rounded-xl border-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-500 text-white shadow-lg shadow-indigo-500/25 transition-all hover:-translate-y-0.5 hover:opacity-95"
              >
                <Link href="/admin/programs">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Manage Programs
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="rounded-xl border-white/20 bg-white/10 text-white backdrop-blur-md hover:bg-white/20 hover:text-white"
              >
                <Link href="/admin/results">
                  <Trophy className="mr-2 h-4 w-4 text-amber-300" />
                  Results Center
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="rounded-xl text-slate-200 hover:bg-white/10 hover:text-white"
              >
                <Link href="/">
                  Public Scoreboard <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>

          {/* Interactive Three.js Sculpture with Switchable Palette Modes */}
          <div className="relative flex h-64 w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] sm:h-72 lg:h-[320px]">
            <div className="relative z-10 flex items-center justify-between gap-2 px-3.5 pt-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-slate-950/70 px-2.5 py-1 text-[11px] font-medium text-slate-200 backdrop-blur-md">
                <Sparkles className="h-3 w-3 text-amber-300" />
                3D Command Core
              </span>
              <div className="inline-flex rounded-full border border-white/15 bg-slate-950/75 p-0.5 backdrop-blur-md">
                {(
                  [
                    { id: 'admin', label: 'Core' },
                    { id: 'festival', label: 'Crown' },
                    { id: 'assignments', label: 'Orbit' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setOrbitMode(mode.id)}
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all',
                      orbitMode === mode.id
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-300 hover:text-white'
                    )}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <TeamOrbitCanvas
                variant={orbitMode}
                pulseKey={`${orbitMode}-${stats.publishedResults}-${programBreakdown.total}`}
              />
            </div>

            <div className="pointer-events-none flex items-center justify-between gap-2 px-3.5 pb-3 text-[11px]">
              <span className="rounded-full border border-white/15 bg-slate-950/75 px-2.5 py-1 text-slate-300 backdrop-blur-md">
                Click sculpture to pulse
              </span>
              <span className="rounded-full border border-indigo-400/30 bg-slate-950/75 px-2.5 py-1 font-mono text-indigo-200 backdrop-blur-md">
                {stats.participants} Contestants
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Executive KPI Cards */}
      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.title} href={item.href} className="group block">
              <Card
                onMouseMove={handleCardPointerMove}
                className="admin-dash-card relative h-full overflow-hidden rounded-2xl border-border/60 bg-card/75 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
              >
                <div className={cn('h-1 w-full bg-gradient-to-r', item.accent)} />
                <div
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background:
                      'radial-gradient(280px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(99,102,241,0.12), transparent 60%)',
                  }}
                />
                <CardHeader className="relative z-10 flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {item.title}
                  </CardTitle>
                  <div className={cn('rounded-xl border p-2', item.iconColor)}>
                    <Icon className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent className="relative z-10">
                  <div className="font-headline text-3xl font-bold tracking-tight">
                    <AnimatedCounter value={item.value} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{item.subtitle}</span>
                    <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>

      {/* Live Analytics Row: House Standings Race + Program Matrix */}
      <section className="grid gap-6 lg:grid-cols-12">
        {/* Live House Leaderboard */}
        <Card className="admin-dash-card flex flex-col overflow-hidden rounded-2xl border-border/60 bg-card/75 shadow-lg backdrop-blur-xl lg:col-span-5">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 font-headline text-xl">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  House Leaderboard
                </CardTitle>
                <CardDescription>
                  {standings
                    ? `Live standings after Result #${standings.publishedAtResultCount}`
                    : 'Click any house once standings publish to audit marks'}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild className="rounded-xl">
                <Link href="/admin/reporting">
                  Report <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </CardHeader>

          <CardContent className="flex-1 p-5">
            {leaderboardTeams.length > 0 ? (
              <div className="space-y-3">
                {leaderboardTeams.slice(0, 6).map((team, idx) => {
                  const pct =
                    topScore > 0 ? Math.max(8, Math.round((team.totalPoints / topScore) * 100)) : 0;
                  return (
                    <Link
                      key={team.teamId}
                      href={`/admin/team-marks/${team.teamId}`}
                      className="group block rounded-2xl border border-border/50 bg-background/60 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-500/40 hover:bg-muted/35 hover:shadow-md"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={cn(
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold',
                              idx === 0
                                ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm'
                                : idx === 1
                                ? 'bg-gradient-to-br from-slate-300 to-slate-500 text-white shadow-sm'
                                : idx === 2
                                ? 'bg-gradient-to-br from-amber-600 to-amber-800 text-white shadow-sm'
                                : 'bg-muted text-muted-foreground font-mono'
                            )}
                          >
                            {idx === 0 ? (
                              <Crown className="h-4 w-4" />
                            ) : idx < 3 ? (
                              <Medal className="h-4 w-4" />
                            ) : (
                              `#${idx + 1}`
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-sm transition-colors group-hover:text-primary">
                              {team.teamName}
                            </p>
                            {team.leaderName && (
                              <p className="truncate text-[11px] text-muted-foreground">
                                Lead: {team.leaderName}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="font-mono text-base font-bold text-foreground">
                            {team.totalPoints.toFixed(1)}
                          </span>
                          <span className="ml-1 text-[11px] text-muted-foreground">pts</span>
                        </div>
                      </div>

                      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-700',
                            idx === 0
                              ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                              : idx === 1
                              ? 'bg-gradient-to-r from-slate-400 to-slate-500'
                              : idx === 2
                              ? 'bg-gradient-to-r from-amber-600 to-amber-700'
                              : 'bg-gradient-to-r from-indigo-500 to-purple-500'
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/15 p-6 text-center">
                <Trophy className="mb-3 h-9 w-9 text-muted-foreground/35" />
                <p className="font-semibold">Standings Not Published Yet</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  Once results are published from Results Center, house rankings and score bars will
                  stream here live.
                </p>
                <Button asChild size="sm" variant="outline" className="mt-4 rounded-xl">
                  <Link href="/admin/results">Go to Results Center</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Program Analytics & Interactive Explorer */}
        <Card className="admin-dash-card flex flex-col overflow-hidden rounded-2xl border-border/60 bg-card/75 shadow-lg backdrop-blur-xl lg:col-span-7">
          <CardHeader className="border-b border-border/50 bg-muted/20 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 font-headline text-xl">
                  <PieChart className="h-5 w-5 text-indigo-500" />
                  Schedule Analytics &amp; Explorer
                </CardTitle>
                <CardDescription>
                  Mode distribution and category-filtered program overview.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild className="rounded-xl self-start sm:self-auto">
                <Link href="/admin/programs">
                  Open Programs <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>

            {/* Dual Distribution Split Bars */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/50 bg-background/60 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-muted-foreground">Stage Mode Mix</span>
                  <span className="font-mono font-semibold">
                    {programBreakdown.onStage} On • {programBreakdown.offStage} Off
                  </span>
                </div>
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-purple-500/20">
                  <div
                    className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-700"
                    style={{ width: `${programBreakdown.onStagePct}%` }}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-border/50 bg-background/60 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-muted-foreground">Entry Type Mix</span>
                  <span className="font-mono font-semibold">
                    {programBreakdown.individual} Solo • {programBreakdown.group} Group
                  </span>
                </div>
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-amber-500/20">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-700"
                    style={{ width: `${programBreakdown.individualPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Search + Category Pills */}
            <div className="space-y-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Quick filter programs or categories..."
                  value={programSearch}
                  onChange={(e) => setProgramSearch(e.target.value)}
                  className="h-9 rounded-xl border-border/60 bg-background/80 pl-9 pr-8 text-sm"
                />
                {programSearch && (
                  <button
                    type="button"
                    onClick={() => setProgramSearch('')}
                    aria-label="Clear program filter"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-all',
                    selectedCategory === 'all'
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border/60 bg-background/60 text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Layers className="h-3 w-3" />
                  All ({programBreakdown.total})
                </button>
                {programCategories.map((cat) => {
                  const count = programBreakdown.byCategory.get(cat.id) || 0;
                  const active = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(cat.id)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium transition-all',
                        active
                          ? 'border-indigo-500 bg-indigo-500 text-white shadow-sm'
                          : 'border-border/60 bg-background/60 text-muted-foreground hover:border-indigo-500/40 hover:text-foreground'
                      )}
                    >
                      {cat.name} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
          </CardHeader>

          <CardContent ref={listRef} className="flex-1 p-5">
            {filteredPrograms.length > 0 ? (
              <div className="space-y-2.5">
                {filteredPrograms.slice(0, 6).map((program) => {
                  const categoryLabel =
                    categoryMap.get(program.categoryId) || program.categoryName || 'General';
                  const isOnStage = program.mode === 'on-stage';
                  return (
                    <Link
                      key={program.id}
                      href="/admin/programs"
                      className="admin-prog-row group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background/60 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-500/35 hover:bg-muted/40 hover:shadow-md"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
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
                          <p className="truncate font-semibold text-sm transition-colors group-hover:text-primary">
                            {program.name}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="rounded-md text-[10px]">
                              {categoryLabel}
                            </Badge>
                            <Badge variant="secondary" className="rounded-md text-[10px] capitalize">
                              {program.type}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="rounded-full font-mono text-[11px]">
                          {program.participantsCount} slots
                        </Badge>
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-50 transition-all group-hover:translate-x-1 group-hover:text-primary group-hover:opacity-100" />
                      </div>
                    </Link>
                  );
                })}
                {filteredPrograms.length > 6 && (
                  <div className="pt-1 text-center">
                    <Button variant="ghost" size="sm" asChild className="rounded-xl text-xs">
                      <Link href="/admin/programs">
                        View all {filteredPrograms.length} matching programs
                        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/15 py-12 text-center">
                <Activity className="mb-2.5 h-8 w-8 text-muted-foreground/40" />
                <p className="font-semibold text-sm">No matching programs</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {programBreakdown.total === 0
                    ? 'Add your first competition event in Manage Programs.'
                    : 'Try clearing your search or category filter.'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Full-Width 8-Module Quick Control Launchpad */}
      <Card className="admin-dash-card overflow-hidden rounded-2xl border-border/60 bg-card/75 shadow-lg backdrop-blur-xl">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="font-headline text-xl">Command Launchpad</CardTitle>
              <CardDescription>
                Jump directly into any festival management module.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="w-fit rounded-full text-xs">
              {QUICK_ACTIONS.length} Modules
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK_ACTIONS.map((action) => {
              const ActionIcon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  onMouseMove={handleCardPointerMove}
                  className="group relative flex items-start gap-3.5 overflow-hidden rounded-2xl border border-border/50 bg-background/60 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted/40 hover:shadow-md"
                >
                  <div
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{
                      background:
                        'radial-gradient(220px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(99,102,241,0.12), transparent 60%)',
                    }}
                  />
                  <div
                    className={cn(
                      'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-transform duration-200 group-hover:scale-110',
                      action.accent
                    )}
                  >
                    <ActionIcon className="h-4 w-4" />
                  </div>
                  <div className="relative z-10 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-sm font-semibold group-hover:text-primary">
                        {action.label}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {action.subtitle}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
