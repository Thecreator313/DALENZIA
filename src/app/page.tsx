'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { collection, onSnapshot, query, orderBy, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAppSettings } from '@/context/firestore-cache';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Trophy,
  LogIn,
  Search,
  Sparkles,
  Activity,
  Calendar,
  ArrowRight,
  Crown,
  Medal,
  Award,
  Loader2,
  X,
  Flame,
  Layers,
  RotateCcw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCountUp } from '@/hooks/use-count-up';
import { Input } from '@/components/ui/input';
import { MascotOrbitShowcase } from '@/components/fest-mascot';
import { AnimatedCounter } from '@/components/animated-counter';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

type PublishedResult = {
  id: string;
  resultNumber: number;
  programName: string;
  categoryName: string;
  winners: Record<string, { name: string; teamName: string }[]>;
};

type PublishedStandings = {
  results: {
    teamId: string;
    teamName: string;
    leaderName: string;
    totalPoints: number;
  }[];
  publishedAtResultCount: number;
  publishedAt: {
    seconds: number;
    nanoseconds: number;
  };
};

function TeamStandingsRow({
  team,
  index,
  topScore,
}: {
  team: PublishedStandings['results'][0];
  index: number;
  topScore: number;
}) {
  const animatedPoints = useCountUp(team.totalPoints);
  const progressPct = topScore > 0 ? Math.max(6, Math.round((team.totalPoints / topScore) * 100)) : 0;

  return (
    <TableRow className="group border-border/40 transition-colors hover:bg-primary/[0.04]">
      <TableCell className="w-[72px] pl-5 font-bold">
        {index < 3 ? (
          <div
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm',
              index === 0
                ? 'bg-gradient-to-br from-amber-400 via-yellow-500 to-orange-500 ring-2 ring-amber-400/30'
                : index === 1
                ? 'bg-gradient-to-br from-slate-300 via-slate-400 to-slate-500 ring-2 ring-slate-300/30'
                : 'bg-gradient-to-br from-amber-600 via-orange-700 to-amber-800 ring-2 ring-amber-500/30'
            )}
          >
            {index === 0 ? <Crown className="h-4 w-4" /> : <Medal className="h-4 w-4" />}
          </div>
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/80 font-mono text-xs font-semibold text-muted-foreground">
            #{index + 1}
          </div>
        )}
      </TableCell>
      <TableCell className="py-3.5">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm sm:text-base transition-colors group-hover:text-primary">
              {team.teamName}
            </span>
          </div>
          <div className="h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-muted/80">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-700',
                index === 0
                  ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                  : index === 1
                  ? 'bg-gradient-to-r from-slate-400 to-slate-500'
                  : index === 2
                  ? 'bg-gradient-to-r from-amber-600 to-orange-700'
                  : 'bg-gradient-to-r from-indigo-500 to-purple-500'
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </TableCell>
      <TableCell className="pr-5 text-right font-mono text-lg font-bold">
        <span className="bg-gradient-to-r from-primary via-indigo-500 to-purple-500 bg-clip-text text-transparent">
          {animatedPoints.toFixed(2)}
        </span>
      </TableCell>
    </TableRow>
  );
}

function getPrimaryWinner(winners?: Record<string, { name: string; teamName: string }[]>) {
  if (!winners) return null;
  const preferredKeys = ['first', '1st', '1', 'First'];
  for (const key of preferredKeys) {
    const holders = winners[key];
    if (holders && holders.length > 0) {
      return { rank: key, holders };
    }
  }
  const firstValid = Object.entries(winners).find(([, holders]) => holders && holders.length > 0);
  return firstValid ? { rank: firstValid[0], holders: firstValid[1] } : null;
}

export default function PublicResultsPage() {
  const { settings } = useAppSettings();
  const festName = settings.festName || 'Fest Central';
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const router = useRouter();

  const pageRef = useRef<HTMLDivElement>(null);
  const resultsGridRef = useRef<HTMLDivElement>(null);
  const heroAnimatedRef = useRef(false);

  const [results, setResults] = useState<PublishedResult[]>([]);
  const [teamStandings, setTeamStandings] = useState<PublishedStandings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    let resultsSettled = false;
    let standingsSettled = false;
    const settle = () => {
      if (resultsSettled && standingsSettled) {
        setLoading(false);
      }
    };

    const resultsQuery = query(collection(db, 'publishedResults'), orderBy('resultNumber', 'desc'));
    const unsubscribeResults = onSnapshot(
      resultsQuery,
      (snapshot) => {
        const resultsList = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() } as PublishedResult)
        );
        setResults(resultsList);
        resultsSettled = true;
        settle();
      },
      (error) => {
        console.error('Error fetching published results:', error);
        resultsSettled = true;
        settle();
      }
    );

    const unsubscribeStandings = onSnapshot(
      doc(db, 'standings', 'team_marks'),
      (snap) => {
        if (snap.exists()) {
          setTeamStandings(snap.data() as PublishedStandings);
        } else {
          setTeamStandings(null);
        }
        standingsSettled = true;
        settle();
      },
      (error) => {
        console.error('Error fetching standings:', error);
        standingsSettled = true;
        settle();
      }
    );

    return () => {
      unsubscribeResults();
      unsubscribeStandings();
    };
  }, []);

  const resultCategories = useMemo(() => {
    const unique = Array.from(new Set(results.map((r) => r.categoryName).filter(Boolean)));
    return unique.sort((a, b) => a.localeCompare(b));
  }, [results]);

  const filteredResults = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return results
      .filter((r) => (categoryFilter === 'all' ? true : r.categoryName === categoryFilter))
      .filter((result) => {
        if (!q) return true;
        if (
          result.programName.toLowerCase().includes(q) ||
          result.categoryName.toLowerCase().includes(q) ||
          String(result.resultNumber).includes(q)
        ) {
          return true;
        }
        return Object.values(result.winners || {}).some((holders) =>
          holders?.some(
            (h) =>
              h.name?.toLowerCase().includes(q) || h.teamName?.toLowerCase().includes(q)
          )
        );
      });
  }, [results, searchTerm, categoryFilter]);

  const sortedTeams = teamStandings?.results ?? [];
  const topTeam = sortedTeams[0] ?? null;
  const topScore = topTeam?.totalPoints ?? 0;
  const latestResultNumber = results[0]?.resultNumber ?? null;

  useEffect(() => {
    if (loading || heroAnimatedRef.current || !pageRef.current) return;
    heroAnimatedRef.current = true;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      gsap.from('.home-hero-stagger', {
        y: 22,
        opacity: 0,
        duration: 0.65,
        stagger: 0.08,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      });
      gsap.from('.home-podium-card', {
        y: 18,
        scale: 0.96,
        opacity: 0,
        duration: 0.55,
        stagger: 0.08,
        delay: 0.15,
        ease: 'back.out(1.4)',
        clearProps: 'transform,opacity',
      });
    }, pageRef);

    return () => ctx.revert();
  }, [loading]);

  useEffect(() => {
    if (loading || !resultsGridRef.current) return;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray<HTMLElement>('.home-result-card');
      if (cards.length === 0) return;
      gsap.fromTo(
        cards,
        { y: 16, opacity: 0, scale: 0.98 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.4,
          stagger: { amount: Math.min(cards.length * 0.035, 0.4) },
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        }
      );
    }, resultsGridRef);

    return () => ctx.revert();
  }, [loading, categoryFilter, results.length]);

  const handleCardPointerMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
  };

  const navigateToResult = (resultNumber: number) => {
    router.push(`/results/${resultNumber}`);
  };

  const hasActiveFilters = searchTerm.trim() !== '' || categoryFilter !== 'all';

  return (
    <div
      ref={pageRef}
      className="relative flex min-h-screen flex-col overflow-x-hidden bg-background text-foreground selection:bg-primary/20"
    >
      {/* Ambient Background */}
      <div className="pointer-events-none fixed inset-0 -z-10 h-full w-full overflow-hidden bg-background">
        <div className="absolute -left-[10%] -top-[10%] h-[42%] w-[42%] rounded-full bg-amber-500/10 blur-[130px]" />
        <div className="absolute -bottom-[10%] -right-[10%] h-[42%] w-[42%] rounded-full bg-indigo-500/10 blur-[130px]" />
        <div className="absolute left-1/2 top-[38%] h-[45%] w-[45%] -translate-x-1/2 rounded-full bg-pink-500/5 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] opacity-[0.16] [background-size:24px_24px] [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] dark:opacity-[0.1]" />
      </div>

      {/* Glass Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/75 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <Link href="/" className="group flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-amber-500/25 blur-md transition-colors group-hover:bg-amber-500/40" />
              <div className="relative rounded-xl border border-amber-500/25 bg-amber-500/10 p-2 text-amber-500 transition-transform duration-200 group-hover:scale-105">
                <Trophy className="h-5 w-5" />
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="font-headline text-lg font-bold tracking-tight sm:text-xl">
                {festName}
              </span>
              <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 sm:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                LIVE
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="hidden text-muted-foreground hover:text-foreground md:inline-flex"
            >
              <a href="#leaderboard">Leaderboard</a>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="hidden text-muted-foreground hover:text-foreground md:inline-flex"
            >
              <a href="#results">Results</a>
            </Button>
            <ThemeToggle />
            <Button
              size="sm"
              asChild
              className="rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white shadow-md shadow-amber-500/20 hover:opacity-95 border-0"
            >
              <Link href="/login">
                <LogIn className="mr-1.5 h-4 w-4" />
                <span className="hidden sm:inline">Official Login</span>
                <span className="sm:hidden">Login</span>
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="container mx-auto flex-1 px-4 py-8 md:px-6 md:py-10">
        {loading ? (
          <div className="flex h-[60vh] flex-col items-center justify-center gap-5">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-amber-500/25 blur-xl animate-pulse" />
              <div className="relative rounded-2xl border border-amber-500/25 bg-card/80 p-4 shadow-xl backdrop-blur-md">
                <Loader2 className="h-9 w-9 animate-spin text-amber-500" />
              </div>
            </div>
            <p className="font-medium text-muted-foreground animate-pulse">
              Syncing live standings &amp; results...
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Hero Showcase with Three.js Festival Crest */}
            <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white shadow-2xl">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.16),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(139,92,246,0.18),transparent_55%)]" />

              <div className="relative z-10 grid items-center gap-8 p-6 sm:p-8 lg:grid-cols-[1.35fr_1fr] lg:p-10">
                <div className="space-y-6">
                  <div className="home-hero-stagger inline-flex flex-wrap items-center gap-2">
                    <Badge className="border-amber-400/30 bg-amber-500/15 px-3.5 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/20">
                      <span className="relative mr-2 flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                      </span>
                      Live Fest Scoreboard
                    </Badge>
                    {latestResultNumber !== null && (
                      <Badge className="border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-slate-200 backdrop-blur-md hover:bg-white/15">
                        <Flame className="mr-1.5 h-3.5 w-3.5 text-amber-400" />
                        Latest: Result #{latestResultNumber}
                      </Badge>
                    )}
                  </div>

                  <div className="home-hero-stagger space-y-3">
                    <h1 className="font-headline text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
                      <span className="bg-gradient-to-r from-white via-amber-100 to-amber-400 bg-clip-text text-transparent">
                        {festName}
                      </span>
                    </h1>
                    <p className="max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
                      Experience every stage triumph as it happens — live overall team standings, verified
                      winners, and instant result cards.
                    </p>
                  </div>

                  {/* Hero Live Telemetry Pills */}
                  <div className="home-hero-stagger grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
                      <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Published Results
                      </span>
                      <div className="mt-1 font-headline text-2xl font-bold text-white sm:text-3xl">
                        <AnimatedCounter value={results.length} />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
                      <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Competing Teams
                      </span>
                      <div className="mt-1 font-headline text-2xl font-bold text-white sm:text-3xl">
                        <AnimatedCounter value={sortedTeams.length} />
                      </div>
                    </div>

                    <div className="col-span-2 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3.5 backdrop-blur-md sm:col-span-1">
                      <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-amber-200/80">
                        <Crown className="h-3 w-3 text-amber-300" /> Current Leader
                      </span>
                      <div className="mt-1 truncate font-headline text-lg font-bold text-amber-300 sm:text-xl">
                        {topTeam ? topTeam.teamName : 'Coming Soon'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Interactive Animated Mascot & Three.js Trophy Crest */}
                <MascotOrbitShowcase
                  orbitVariant="festival"
                  badgeText={festName}
                  pulseKey={`${results.length}-${topScore}`}
                  footerLeftText="Click crest to pulse"
                  footerRightText={topTeam ? `${topTeam.totalPoints.toFixed(2)} pts` : undefined}
                  frameTone="dark"
                />
              </div>
            </section>

            {/* Top 3 Championship Podium Strip */}
            {sortedTeams.length > 0 && (
              <section className="grid gap-4 sm:grid-cols-3">
                {sortedTeams.slice(0, 3).map((team, idx) => {
                  const isFirst = idx === 0;
                  const isSecond = idx === 1;
                  return (
                    <Card
                      key={team.teamId}
                      onMouseMove={handleCardPointerMove}
                      className={cn(
                        'home-podium-card group relative overflow-hidden rounded-2xl border backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl',
                        isFirst
                          ? 'border-amber-500/35 bg-gradient-to-br from-amber-500/10 via-card/85 to-card/75 shadow-lg shadow-amber-500/5'
                          : isSecond
                          ? 'border-slate-400/35 bg-gradient-to-br from-slate-400/10 via-card/85 to-card/75'
                          : 'border-orange-700/35 bg-gradient-to-br from-orange-600/10 via-card/85 to-card/75'
                      )}
                    >
                      <div
                        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                        style={{
                          background:
                            'radial-gradient(280px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(245,158,11,0.14), transparent 60%)',
                        }}
                      />
                      <CardContent className="relative z-10 flex items-center justify-between gap-4 p-5">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider',
                                isFirst
                                  ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300'
                                  : isSecond
                                  ? 'bg-slate-400/20 text-slate-600 dark:text-slate-300'
                                  : 'bg-amber-700/20 text-amber-700 dark:text-amber-400'
                              )}
                            >
                              {isFirst ? '1st Place' : isSecond ? '2nd Place' : '3rd Place'}
                            </span>
                          </div>
                          <h3 className="truncate font-headline text-xl font-bold">{team.teamName}</h3>
                          {team.leaderName && (
                            <p className="truncate text-xs text-muted-foreground">
                              Lead: {team.leaderName}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col items-end shrink-0">
                          <div
                            className={cn(
                              'mb-1.5 flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-md',
                              isFirst
                                ? 'bg-gradient-to-br from-amber-400 to-orange-500'
                                : isSecond
                                ? 'bg-gradient-to-br from-slate-400 to-slate-600'
                                : 'bg-gradient-to-br from-amber-600 to-amber-800'
                            )}
                          >
                            {isFirst ? (
                              <Crown className="h-5 w-5" />
                            ) : isSecond ? (
                              <Medal className="h-5 w-5" />
                            ) : (
                              <Award className="h-5 w-5" />
                            )}
                          </div>
                          <span className="font-mono text-lg font-extrabold tracking-tight">
                            {team.totalPoints.toFixed(2)}
                          </span>
                          <span className="text-[10px] font-medium uppercase text-muted-foreground">
                            Points
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </section>
            )}

            {/* Main Two-Column Arena */}
            <div className="grid gap-8 lg:grid-cols-12">
              {/* Leaderboard Column */}
              <section id="leaderboard" className="scroll-mt-24 space-y-5 lg:col-span-5">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                      <Activity className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="font-headline text-2xl font-bold tracking-tight">Leaderboard</h2>
                      <p className="text-xs text-muted-foreground">
                        {teamStandings
                          ? `Updated after Result #${teamStandings.publishedAtResultCount}`
                          : 'Awaiting first standings update'}
                      </p>
                    </div>
                  </div>
                </div>

                {teamStandings && sortedTeams.length > 0 ? (
                  <Card className="overflow-hidden rounded-2xl border-border/60 bg-card/75 shadow-lg backdrop-blur-xl">
                    <CardHeader className="border-b border-border/50 bg-muted/25 py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="font-headline text-lg">Overall Standings</CardTitle>
                          <CardDescription>Live cumulative team points</CardDescription>
                        </div>
                        <Badge variant="outline" className="font-mono text-xs">
                          Top {Math.min(10, sortedTeams.length)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-border/50 bg-muted/10 hover:bg-muted/10">
                              <TableHead className="w-[72px] pl-5">Rank</TableHead>
                              <TableHead>Team</TableHead>
                              <TableHead className="pr-5 text-right">Points</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedTeams.slice(0, 10).map((team, index) => (
                              <TeamStandingsRow
                                key={team.teamId}
                                team={team}
                                index={index}
                                topScore={topScore}
                              />
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="rounded-2xl border-dashed border-border/70 bg-muted/15">
                    <CardContent className="flex flex-col items-center justify-center py-14 text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                        <Trophy className="h-6 w-6" />
                      </div>
                      <h3 className="font-headline text-base font-semibold">Standings Coming Soon</h3>
                      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                        Team rankings will appear automatically once results are published.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </section>

              {/* Results Column */}
              <section id="results" className="scroll-mt-24 space-y-5 lg:col-span-7">
                <div className="flex flex-col gap-4 px-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
                      <Calendar className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="font-headline text-2xl font-bold tracking-tight">Latest Results</h2>
                      <p className="text-xs text-muted-foreground">
                        Click any program card to view full rank &amp; grade sheet
                      </p>
                    </div>
                  </div>

                  <div className="relative w-full sm:w-72">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search program, winner, or team..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-10 rounded-xl border-border/60 bg-card/80 pl-10 pr-9 shadow-sm backdrop-blur-md"
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        aria-label="Clear results search"
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Category Filter Pills */}
                {resultCategories.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 px-1">
                    <button
                      type="button"
                      onClick={() => setCategoryFilter('all')}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all',
                        categoryFilter === 'all'
                          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                          : 'border-border/60 bg-card/70 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                      )}
                    >
                      <Layers className="h-3.5 w-3.5" />
                      All ({results.length})
                    </button>
                    {resultCategories.map((cat) => {
                      const isActive = categoryFilter === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCategoryFilter(cat)}
                          className={cn(
                            'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all',
                            isActive
                              ? 'border-indigo-500 bg-indigo-500 text-white shadow-sm'
                              : 'border-border/60 bg-card/70 text-muted-foreground hover:border-indigo-500/40 hover:text-foreground'
                          )}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div ref={resultsGridRef}>
                  {filteredResults.length === 0 ? (
                    <Card className="rounded-2xl border-dashed border-border/70 bg-muted/15">
                      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                          <Search className="h-7 w-7" />
                        </div>
                        <h3 className="font-headline text-lg font-semibold">No results found</h3>
                        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                          {results.length === 0
                            ? 'Results will be published here soon. Stay tuned!'
                            : 'No published results match your search or category filter.'}
                        </p>
                        {hasActiveFilters && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-4 rounded-xl"
                            onClick={() => {
                              setSearchTerm('');
                              setCategoryFilter('all');
                            }}
                          >
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                            Reset Filters
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-5 sm:grid-cols-2">
                      {filteredResults.map((result) => {
                        const primaryWinner = getPrimaryWinner(result.winners);
                        return (
                          <Card
                            key={result.id}
                            onMouseMove={handleCardPointerMove}
                            onClick={() => navigateToResult(result.resultNumber)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                navigateToResult(result.resultNumber);
                              }
                            }}
                            className="home-result-card group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border-border/60 bg-card/75 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
                          >
                            <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-indigo-500 to-pink-500 opacity-75 transition-opacity group-hover:opacity-100" />
                            <div
                              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                              style={{
                                background:
                                  'radial-gradient(300px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(245,158,11,0.12), transparent 60%)',
                              }}
                            />

                            <CardHeader className="relative z-10 pb-3">
                              <div className="pointer-events-none absolute right-2 top-2 opacity-[0.06] transition-opacity group-hover:opacity-[0.14]">
                                <Trophy className="h-20 w-20 -rotate-12" />
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <Badge
                                  variant="outline"
                                  className="rounded-md border-amber-500/30 bg-amber-500/10 font-mono text-xs text-amber-600 dark:text-amber-300"
                                >
                                  Result #{result.resultNumber}
                                </Badge>
                                <Badge variant="secondary" className="rounded-md text-[11px] truncate max-w-[140px]">
                                  {result.categoryName}
                                </Badge>
                              </div>
                              <CardTitle className="mt-2 line-clamp-2 font-headline text-lg leading-snug transition-colors group-hover:text-primary">
                                {result.programName}
                              </CardTitle>
                            </CardHeader>

                            <CardContent className="relative z-10 flex flex-1 flex-col justify-between gap-4 pt-0">
                              {primaryWinner ? (
                                <div className="rounded-xl border border-border/50 bg-muted/35 p-3.5 transition-colors group-hover:border-primary/20">
                                  <div className="mb-1.5 flex items-center gap-2">
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300">
                                      <Crown className="h-3.5 w-3.5" />
                                    </span>
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                      Winner
                                    </span>
                                  </div>
                                  <div className="pl-8">
                                    <p className="truncate font-semibold text-sm text-foreground">
                                      {primaryWinner.holders[0].name}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                      {primaryWinner.holders[0].teamName}
                                    </p>
                                    {primaryWinner.holders.length > 1 && (
                                      <Badge variant="secondary" className="mt-1.5 h-5 text-[10px]">
                                        +{primaryWinner.holders.length - 1} others
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="rounded-xl border border-dashed border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
                                  View result details
                                </div>
                              )}

                              <div className="flex items-center justify-between border-t border-border/40 pt-3 text-xs font-medium text-muted-foreground transition-colors group-hover:text-primary">
                                <span>Full Result Sheet</span>
                                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-auto border-t border-border/60 bg-muted/20 py-7 backdrop-blur-md">
        <div className="container mx-auto flex flex-col items-center justify-between gap-3 px-4 md:flex-row md:px-6">
          <p className="text-center text-sm text-muted-foreground md:text-left">
            © {new Date().getFullYear()} {festName}. All rights reserved.
          </p>
          <p className="text-center text-sm text-muted-foreground md:text-right">
            Developed by{' '}
            <a
              href="https://wa.me/9744460317"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
            >
              Habeeb Rahman
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
