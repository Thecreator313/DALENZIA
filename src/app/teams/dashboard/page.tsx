'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { collection, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCachedCollection, useSharedCollection } from '@/context/firestore-cache';
import { MascotOrbitShowcase } from '@/components/fest-mascot';
import { AnimatedCounter } from '@/components/animated-counter';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  UserPlus,
  UserCheck,
  Users,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  BarChart3,
  Sparkles,
  Hash,
} from "lucide-react";
import type { User } from '@/app/admin/access-central/page';
import type { Team } from '@/app/admin/teams/page';
import type { Participant } from '@/app/teams/add-participants/page';
import type { Program } from '@/app/admin/programs/page';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Assignment = {
  id: string;
  programId: string;
  studentId: string;
};

type ProgramWithParticipants = Program & {
  participantNames: string[];
};

export default function TeamDashboard() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userChecked, setUserChecked] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const heroAnimatedRef = useRef(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('fest-central-user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
    setUserChecked(true);
  }, []);

  const { data: userTeams, loading: teamLoading } = useCachedCollection<Team>(
    currentUser ? `query:team:${currentUser.id}` : 'query:team:none',
    () => query(collection(db, 'teams'), where('leaderId', '==', currentUser!.id)),
    { enabled: !!currentUser }
  );
  const team = userTeams[0] ?? null;

  const { data: participants, loading: participantsLoading } = useCachedCollection<Participant>(
    team ? `query:students:${team.id}` : 'query:students:none',
    () => query(collection(db, 'students'), where('teamId', '==', team!.id)),
    { enabled: !!team }
  );

  const { data: programsData, loading: programsLoading } = useSharedCollection<Program>('programs', {
    enabled: !!team,
  });

  const { data: assignmentList, loading: assignmentsLoading } = useCachedCollection<Assignment>(
    team ? `query:assignments:${team.id}` : 'query:assignments:none',
    () => query(collection(db, 'assignments'), where('teamId', '==', team!.id)),
    { enabled: !!team }
  );

  const { stats, recentAssignments } = useMemo(() => {
    let fullyAssigned = 0;
    let partiallyAssigned = 0;

    programsData.forEach((program) => {
      const assignedCount = assignmentList.filter((a) => a.programId === program.id).length;
      if (assignedCount > 0) {
        if (assignedCount >= program.participantsCount) fullyAssigned++;
        else partiallyAssigned++;
      }
    });

    const programsWithAssignments = new Set(assignmentList.map((a) => a.programId));
    const notAssigned = programsData.length - programsWithAssignments.size;

    const uniqueProgramIds = [...new Set(assignmentList.map((a) => a.programId))].slice(0, 5);
    const recentProgramsData = programsData.filter((p) => uniqueProgramIds.includes(p.id));
    const studentMap = new Map(participants.map((s) => [s.id, s.name]));

    const assignmentsWithNames = recentProgramsData.map((program) => {
      const programAssignments = assignmentList.filter((a) => a.programId === program.id);
      const participantNames = programAssignments.map(
        (pa) => studentMap.get(pa.studentId) || 'Unknown'
      );
      return { ...program, participantNames };
    });

    return {
      stats: {
        participants: participants.length,
        fullyAssigned,
        partiallyAssigned,
        notAssigned,
      },
      recentAssignments: assignmentsWithNames,
    };
  }, [participants, programsData, assignmentList]);

  const loading =
    !userChecked ||
    (!!currentUser && (teamLoading || (!!team && (participantsLoading || programsLoading || assignmentsLoading))));

  const totalPrograms = programsData.length;
  const assignedProgramCount = stats.fullyAssigned + stats.partiallyAssigned;
  const completionPct = totalPrograms > 0 ? Math.round((stats.fullyAssigned / totalPrograms) * 100) : 0;

  useEffect(() => {
    if (loading || !team || heroAnimatedRef.current || !pageRef.current) return;
    heroAnimatedRef.current = true;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      gsap.from('.team-dash-stagger', {
        y: 22,
        opacity: 0,
        duration: 0.65,
        stagger: 0.08,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      });
      gsap.from('.team-dash-card', {
        y: 18,
        scale: 0.96,
        opacity: 0,
        duration: 0.5,
        stagger: 0.07,
        delay: 0.15,
        ease: 'power2.out',
        clearProps: 'transform,opacity',
      });
    }, pageRef);

    return () => ctx.revert();
  }, [loading, team]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-6rem)] gap-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/25 blur-xl animate-pulse" />
          <Loader2 className="h-12 w-12 animate-spin text-primary relative z-10" />
        </div>
        <p className="text-muted-foreground animate-pulse font-medium">Loading Team Command Center...</p>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-6rem)]">
        <Card className="max-w-md w-full border-border/60 bg-card/60 backdrop-blur-xl shadow-lg">
          <CardHeader>
            <CardTitle className="text-center text-xl">No Team Assigned</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-muted-foreground">You are not assigned as a leader for any team. Please contact the administrator.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statItems = [
    {
      title: 'Total Participants',
      value: stats.participants,
      icon: Users,
      href: '/teams/add-participants',
      accent: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
      strip: 'from-sky-400 via-blue-500 to-indigo-500',
    },
    {
      title: 'Fully Assigned',
      value: stats.fullyAssigned,
      icon: CheckCircle2,
      href: '/teams/assign-students',
      accent: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
      strip: 'from-emerald-400 via-green-500 to-teal-500',
    },
    {
      title: 'Partially Assigned',
      value: stats.partiallyAssigned,
      icon: AlertCircle,
      href: '/teams/assign-students',
      accent: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
      strip: 'from-amber-400 via-yellow-500 to-orange-500',
    },
    {
      title: 'Not Assigned',
      value: stats.notAssigned,
      icon: XCircle,
      href: '/teams/assign-students',
      accent: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
      strip: 'from-rose-400 via-red-500 to-pink-500',
    },
  ];

  return (
    <div ref={pageRef} className="space-y-5 sm:space-y-8 relative min-h-screen pb-6 sm:pb-8">
      {/* Ambient Background */}
      <div className="fixed inset-0 -z-10 h-full w-full overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-blue-500/10 blur-[120px]" />
        <div className="absolute top-1/3 -right-24 w-96 h-96 rounded-full bg-indigo-500/10 blur-[120px]" />
        <div className="absolute -bottom-24 left-1/3 w-80 h-80 rounded-full bg-cyan-500/10 blur-[120px]" />
      </div>

      {/* Hero Command Banner with Interactive Three.js Crest */}
      <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-border/60 bg-gradient-to-br from-card/85 via-card/65 to-primary/10 backdrop-blur-xl shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_55%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.12),transparent_50%)] pointer-events-none" />
        <div className="grid lg:grid-cols-[1.45fr_1fr] items-center gap-5 sm:gap-6 p-4 sm:p-8 relative z-10">
          <div className="space-y-5 sm:space-y-6">
            <div className="space-y-2.5 sm:space-y-3">
              <div className="team-dash-stagger inline-flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                  </span>
                  Team Hub • Live Sync
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground">
                  <Hash className="h-3 w-3 text-primary" />
                  Chest Starts #{team.startingChestNumber}
                </span>
              </div>

              <div className="team-dash-stagger">
                <h1 className="text-2xl sm:text-4xl font-bold font-headline tracking-tight bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent break-words">
                  {team.name}
                </h1>
                <p className="text-muted-foreground mt-1 max-w-xl text-xs sm:text-base">
                  Track team roster growth, monitor program assignment progress, and jump straight to participant registration.
                </p>
              </div>
            </div>

            {/* Readiness Progress Bar */}
            <div className="team-dash-stagger rounded-xl sm:rounded-2xl border border-border/60 bg-background/55 backdrop-blur-md p-3.5 sm:p-4 space-y-2.5 max-w-xl">
              <div className="flex flex-wrap items-center justify-between gap-1 text-xs sm:text-sm">
                <span className="font-medium text-muted-foreground">Program Readiness</span>
                <span className="font-mono font-semibold text-foreground">
                  {stats.fullyAssigned} / {totalPrograms} Full ({completionPct}%)
                </span>
              </div>
              <div className="h-2 sm:h-2.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 transition-all duration-700"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground">
                <strong className="text-foreground">{assignedProgramCount}</strong> of {totalPrograms} programs have at least one participant assigned.
              </p>
            </div>

            <div className="team-dash-stagger flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
              <Button
                asChild
                size="default"
                className="rounded-xl shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all duration-200 bg-gradient-to-r from-blue-600 via-primary to-indigo-600 text-white border-0 justify-center h-10 sm:h-11 text-xs sm:text-sm"
              >
                <Link href="/teams/add-participants"><UserPlus className="mr-2 h-4 w-4" /> Add Participants</Link>
              </Button>
              <Button asChild size="default" variant="outline" className="rounded-xl bg-background/60 backdrop-blur-md border-border/60 hover:border-primary/40 justify-center h-10 sm:h-11 text-xs sm:text-sm">
                <Link href="/teams/assign-students"><UserCheck className="mr-2 h-4 w-4" /> Assign Participants</Link>
              </Button>
              <Button asChild size="default" variant="ghost" className="rounded-xl hover:bg-muted/60 justify-center h-10 sm:h-11 text-xs sm:text-sm">
                <Link href="/teams/reports"><BarChart3 className="mr-2 h-4 w-4" /> Reports</Link>
              </Button>
            </div>
          </div>

          {/* Interactive Animated Mascot & 3D Team Crest */}
          <MascotOrbitShowcase
            orbitVariant="dashboard"
            badgeText={team.name}
            pulseKey={`${stats.participants}-${stats.fullyAssigned}`}
            footerLeftText={`${stats.participants} Members`}
            footerRightText={`${completionPct}% Ready`}
            frameTone="adaptive"
            className="h-60 sm:h-80 lg:h-[330px]"
          />
        </div>
      </section>

      {/* GSAP Animated KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {statItems.map((item) => (
          <Link key={item.title} href={item.href} className="block group">
            <Card className="team-dash-card relative overflow-hidden rounded-xl sm:rounded-2xl border-border/60 bg-card/60 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl">
              <div className={cn('h-1 w-full bg-gradient-to-r', item.strip)} />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-5 pb-1 sm:pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate mr-1">
                  {item.title}
                </CardTitle>
                <div className={cn('p-1.5 sm:p-2 rounded-lg sm:rounded-xl border transition-transform duration-200 group-hover:scale-110 shrink-0', item.accent)}>
                  <item.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
              </CardHeader>
              <CardContent className="p-3 sm:p-5 pt-0 flex items-end justify-between">
                <div className="text-2xl sm:text-3xl font-bold font-headline tracking-tight">
                  <AnimatedCounter value={item.value} />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all hidden sm:inline-block" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent Program Assignments */}
      <Card className="team-dash-card border-border/60 bg-card/55 backdrop-blur-xl shadow-lg overflow-hidden rounded-xl sm:rounded-2xl">
        <CardHeader className="border-b border-border/50 bg-muted/20 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl font-headline">
                <ClipboardCheck className="w-5 h-5 text-primary" />
                Recent Program Assignments
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Latest programs your team members are entered in.</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild className="rounded-xl self-start sm:self-auto text-xs">
              <Link href="/teams/assign-students">
                Manage All <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile Card View for Recent Assignments */}
          <div className="block md:hidden p-3 space-y-3">
            {recentAssignments.length > 0 ? (
              recentAssignments.map((program) => (
                <div
                  key={program.id}
                  className="rounded-xl border border-border/50 bg-background/60 p-3.5 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm">{program.name}</p>
                    <Badge variant="outline" className="capitalize text-[10px] px-1.5 py-0.2 shrink-0">
                      {program.type}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Assigned Slots:</span>
                    <span className="font-mono font-semibold text-foreground">
                      {program.participantNames.length} / {program.participantsCount}
                    </span>
                  </div>
                  {program.participantNames.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {program.participantNames.map((name, idx) => (
                        <Badge key={idx} variant="secondary" className="bg-primary/10 text-primary text-[10px] px-2 py-0.5">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-center py-8 text-xs text-muted-foreground">
                No assignments have been made yet.
              </p>
            )}
          </div>

          {/* Desktop Table View */}
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead>Program Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Assigned Slots</TableHead>
                <TableHead>Participants</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentAssignments.length > 0 ? recentAssignments.map((program) => (
                <TableRow
                  key={program.id}
                  className="border-b border-border/40 hover:bg-muted/30 transition-colors"
                >
                  <TableCell className="font-medium">{program.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize bg-muted/50 border-border/60">{program.type}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs font-semibold">
                      {program.participantNames.length} / {program.participantsCount}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {program.participantNames.map((name, idx) => (
                        <Badge key={idx} variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                    No assignments have been made yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
