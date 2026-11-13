'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import {
  collection,
  doc,
  query,
  where,
  deleteDoc,
  addDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAppSettings, useCachedCollection, useSharedCollection } from '@/context/firestore-cache';
import { TeamOrbitCanvas } from '@/components/team-orbit-canvas';
import { AnimatedCounter } from '@/components/animated-counter';
import type { User } from '@/app/admin/access-central/page';
import type { Program as BaseProgram } from '@/app/admin/programs/page';
import type { Participant as BaseParticipant } from '@/app/teams/add-participants/page';
import type { Category } from '@/app/admin/categories/page';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2,
  Users,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  XCircle,
  UserCheck,
  Mic2,
  Sparkles,
  Lock,
  LayoutGrid,
  List as ListIcon,
  X,
  User as UserIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// Extend types to include categoryName
type Participant = BaseParticipant & { categoryName?: string };
type Program = BaseProgram & { isGeneral?: boolean };
type TeamAssignment = { id: string; programId: string; studentId: string; teamId: string };

export default function AssignParticipantsPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userChecked, setUserChecked] = useState(false);
  const { settings, loading: settingsLoading } = useAppSettings();

  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const pageRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const heroAnimatedRef = useRef(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('fest-central-user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
    setUserChecked(true);
  }, []);

  const { data: userTeams, loading: teamLoading } = useCachedCollection<{ id: string }>(
    currentUser ? `query:team:${currentUser.id}` : 'query:team:none',
    () => query(collection(db, 'teams'), where('leaderId', '==', currentUser!.id)),
    { enabled: !!currentUser }
  );
  const teamId = userTeams[0]?.id ?? null;

  const { data: programCategories, loading: progCatsLoading } = useSharedCollection<Category>('programCategories');
  const { data: memberCategories, loading: memCatsLoading } = useSharedCollection<Category>('memberCategories');

  const { data: rawParticipants, loading: studentsLoading } = useCachedCollection<BaseParticipant>(
    teamId ? `query:students:${teamId}` : 'query:students:none',
    () => query(collection(db, 'students'), where('teamId', '==', teamId!)),
    { enabled: !!teamId }
  );

  const { data: rawPrograms, loading: programsLoading } = useSharedCollection<BaseProgram>('programs', {
    enabled: !!teamId,
  });

  const { data: rawAssignments, loading: assignmentsLoading } = useCachedCollection<TeamAssignment>(
    teamId ? `query:assignments:${teamId}` : 'query:assignments:none',
    () => query(collection(db, 'assignments'), where('teamId', '==', teamId!)),
    { enabled: !!teamId }
  );

  const participants = useMemo(() => {
    const memCatMap = new Map(memberCategories.map((c) => [c.id, c.name]));
    return rawParticipants.map((p) => ({
      ...p,
      categoryName: memCatMap.get(p.categoryId),
    })) as Participant[];
  }, [rawParticipants, memberCategories]);

  const programs = useMemo(() => {
    const progCatMap = new Map(programCategories.map((c) => [c.id, c]));
    return rawPrograms.map((p) => {
      const cat = progCatMap.get(p.categoryId);
      return {
        ...p,
        categoryName: cat?.name || 'Unknown',
        isGeneral: cat?.isGeneral,
      } as Program;
    });
  }, [rawPrograms, programCategories]);

  const assignments = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const a of rawAssignments) {
      if (!map[a.programId]) map[a.programId] = [];
      map[a.programId].push(a.studentId);
    }
    return map;
  }, [rawAssignments]);

  const loading =
    !userChecked ||
    settingsLoading ||
    progCatsLoading ||
    memCatsLoading ||
    (!!currentUser &&
      (teamLoading || (!!teamId && (studentsLoading || programsLoading || assignmentsLoading))));


  const getAssignmentStatus = (program: Program) => {
    const assignedCount = assignments[program.id]?.length || 0;
    const participantsCount = program.participantsCount;

    if (assignedCount === 0) {
      return { text: "Not Assigned", className: "bg-red-500/10 text-red-500 border-red-500/20", key: "not", icon: XCircle };
    }
    if (assignedCount >= participantsCount) {
      return { text: "Fully Assigned", className: "bg-green-500/10 text-green-500 border-green-500/20", key: "full", icon: CheckCircle2 };
    }
    return { text: "Partially Assigned", className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20", key: "partial", icon: AlertCircle };
  };

  const filteredPrograms = useMemo(() => {
    return programs
      .filter(p => searchTerm ? p.name.toLowerCase().includes(searchTerm.toLowerCase()) : true)
      .filter(p => typeFilter === 'all' ? true : p.type === typeFilter)
      .filter(p => statusFilter === 'all' ? true : getAssignmentStatus(p).key === statusFilter)
      .filter(p => categoryFilter === 'all' ? true : p.categoryId === categoryFilter);
  }, [programs, searchTerm, typeFilter, statusFilter, categoryFilter, assignments]);


  const handleAssignClick = (program: Program) => {
    setSelectedProgram(program);
    setIsAssignDialogOpen(true);
  };


  const studentNameMap = useMemo(
    () => new Map(participants.map((p) => [p.id, p])),
    [participants]
  );

  const statusCounts = useMemo(() => {
    let full = 0;
    let partial = 0;
    let not = 0;
    for (const p of programs) {
      const count = assignments[p.id]?.length || 0;
      if (count === 0) not++;
      else if (count >= p.participantsCount) full++;
      else partial++;
    }
    return { total: programs.length, full, partial, not };
  }, [programs, assignments]);

  const hasActiveFilters =
    searchTerm !== '' || typeFilter !== 'all' || statusFilter !== 'all' || categoryFilter !== 'all';

  const resetFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setStatusFilter('all');
    setCategoryFilter('all');
  };

  useEffect(() => {
    if (loading || !teamId || heroAnimatedRef.current || !pageRef.current) return;
    heroAnimatedRef.current = true;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      gsap.from('.assign-hero-stagger', {
        y: 22,
        opacity: 0,
        duration: 0.65,
        stagger: 0.08,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      });
      gsap.from('.assign-kpi-pill', {
        scale: 0.94,
        y: 16,
        opacity: 0,
        duration: 0.5,
        stagger: 0.06,
        delay: 0.15,
        ease: 'back.out(1.4)',
        clearProps: 'transform,opacity',
      });
    }, pageRef);

    return () => ctx.revert();
  }, [loading, teamId]);

  useEffect(() => {
    if (loading || !teamId || !gridRef.current) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      const items = gsap.utils.toArray<HTMLElement>('.assign-anim-item');
      if (items.length === 0) return;
      gsap.fromTo(
        items,
        { y: 16, opacity: 0, scale: 0.98 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.38,
          stagger: { amount: Math.min(items.length * 0.03, 0.35) },
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        }
      );
    }, gridRef);

    return () => ctx.revert();
  }, [loading, teamId, typeFilter, statusFilter, categoryFilter, viewMode]);

  const handleCardPointerMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
  };

  if (loading || settings === null) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-6rem)] gap-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/25 blur-xl animate-pulse" />
          <Loader2 className="h-12 w-12 animate-spin text-primary relative z-10" />
        </div>
        <p className="text-muted-foreground animate-pulse font-medium">Loading Assignment Studio...</p>
      </div>
    );
  }

  if (!teamId) {
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

  const completionPct =
    statusCounts.total > 0 ? Math.round((statusCounts.full / statusCounts.total) * 100) : 0;

  return (
    <div ref={pageRef} className="space-y-6 sm:space-y-8 relative min-h-screen pb-8">
      {/* Ambient Background */}
      <div className="fixed inset-0 -z-10 h-full w-full overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-indigo-500/10 blur-[120px]" />
        <div className="absolute top-1/3 -right-24 w-96 h-96 rounded-full bg-purple-500/10 blur-[120px]" />
        <div className="absolute -bottom-24 left-1/3 w-80 h-80 rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      {/* Hero Assignment Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card/85 via-card/65 to-indigo-500/10 backdrop-blur-xl shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.16),transparent_55%),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.12),transparent_50%)] pointer-events-none" />
        <div className="grid lg:grid-cols-[1.45fr_1fr] items-center gap-5 sm:gap-6 p-4 sm:p-8 relative z-10">
          <div className="space-y-5 sm:space-y-6">
            <div className="space-y-2.5 sm:space-y-3">
              <div className="assign-hero-stagger inline-flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
                  </span>
                  Assignment Studio • Live Sync
                </span>
                {!settings.allowTeamAssignment && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    <Lock className="h-3 w-3" /> Editing Locked by Admin
                  </span>
                )}
              </div>

              <div className="assign-hero-stagger">
                <h1 className="text-2xl sm:text-4xl font-bold font-headline tracking-tight bg-gradient-to-r from-foreground via-foreground to-indigo-500 bg-clip-text text-transparent">
                  Assign Participants
                </h1>
                <p className="text-muted-foreground mt-1 max-w-xl text-xs sm:text-base">
                  Match eligible team members to stage and off-stage events and track slot completion in real time.
                </p>
              </div>
            </div>

            {/* Completion Bar */}
            <div className="assign-hero-stagger rounded-2xl border border-border/60 bg-background/55 backdrop-blur-md p-3 sm:p-4 space-y-2 max-w-xl">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="font-medium text-muted-foreground">Overall Assignment Completion</span>
                <span className="font-mono font-semibold text-foreground">
                  {statusCounts.full} / {statusCounts.total} Full ({completionPct}%)
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 transition-all duration-700"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
            </div>

            {/* Interactive Status Filter KPI Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5 pt-1">
              {[
                { key: 'all', label: 'All Programs', val: statusCounts.total, icon: Filter, accent: 'text-primary bg-primary/10 border-primary/20' },
                { key: 'full', label: 'Fully Assigned', val: statusCounts.full, icon: CheckCircle2, accent: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
                { key: 'partial', label: 'Partial', val: statusCounts.partial, icon: AlertCircle, accent: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
                { key: 'not', label: 'Unassigned', val: statusCounts.not, icon: XCircle, accent: 'text-rose-500 bg-rose-500/10 border-rose-500/20' },
              ].map((item) => {
                const isActive = statusFilter === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setStatusFilter(item.key)}
                    className={cn(
                      'assign-kpi-pill text-left rounded-2xl border backdrop-blur-md p-2.5 sm:p-3 transition-all duration-200 hover:-translate-y-0.5',
                      isActive
                        ? 'border-primary/50 bg-primary/10 shadow-md ring-1 ring-primary/25'
                        : 'border-border/60 bg-background/60 hover:border-primary/30'
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                        {item.label}
                      </span>
                      <span className={cn('p-1 rounded-md border', item.accent)}>
                        <item.icon className="h-3 w-3" />
                      </span>
                    </div>
                    <div className="text-lg sm:text-xl font-bold font-headline tracking-tight">
                      <AnimatedCounter value={item.val} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Three.js Crest */}
          <div className="relative h-56 sm:h-72 lg:h-80 w-full rounded-2xl border border-border/40 bg-gradient-to-b from-indigo-500/5 via-transparent to-purple-500/5 overflow-hidden">
            <TeamOrbitCanvas variant="assignments" pulseKey={`${statusCounts.full}-${statusCounts.partial}`} />
            <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-background/75 backdrop-blur-md border border-border/50 px-2.5 py-1">
                <Users className="h-3 w-3 text-indigo-500" />
                {participants.length} Eligible
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-background/75 backdrop-blur-md border border-border/50 px-2.5 py-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                {statusCounts.full} Complete
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Filter & Program Cards Directory */}
      <Card className="border-border/60 bg-card/55 backdrop-blur-xl shadow-lg overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20 p-4 sm:p-6 space-y-3 sm:space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Filter className="w-5 h-5 text-primary" />
                Program Assignments
                <Badge variant="secondary" className="rounded-full font-mono text-xs">
                  {filteredPrograms.length} / {programs.length}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Select any program to assign or update your team participants.</CardDescription>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search programs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-8 bg-background/70 border-border/60 rounded-xl text-sm"
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

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-[185px] bg-background/70 border-border/60 rounded-xl text-sm">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {programCategories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="inline-flex rounded-xl border border-border/60 bg-background/70 p-1 self-stretch sm:self-auto justify-center sm:justify-start">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                    viewMode === 'grid'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <LayoutGrid className="h-3.5 w-3.5" /> Grid
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                    viewMode === 'list'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <ListIcon className="h-3.5 w-3.5" /> List
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 pt-1">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="inline-flex rounded-xl border border-border/60 bg-background/60 p-1 justify-center sm:justify-start">
                {(['all', 'individual', 'group'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTypeFilter(type)}
                    className={cn(
                      'flex-1 sm:flex-none rounded-lg px-3 py-1 text-xs font-medium capitalize transition-all text-center',
                      typeFilter === type
                        ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25 shadow-sm'
                        : 'text-muted-foreground hover:text-foreground border border-transparent'
                    )}
                  >
                    {type === 'all' ? 'All Types' : type}
                  </button>
                ))}
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-full sm:w-[165px] bg-background/60 border-border/60 rounded-xl text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="not">Not Assigned</SelectItem>
                  <SelectItem value="partial">Partially Assigned</SelectItem>
                  <SelectItem value="full">Fully Assigned</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-xs text-muted-foreground hover:text-foreground self-end sm:self-auto">
                <X className="mr-1.5 h-3.5 w-3.5" /> Reset Filters
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-3.5 sm:p-6">
          <div
            ref={gridRef}
            className={cn(
              viewMode === 'grid'
                ? 'grid gap-3 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                : 'flex flex-col gap-3'
            )}
          >
            {filteredPrograms.map((program) => {
              const status = getAssignmentStatus(program);
              const StatusIcon = status.icon;
              const assignedIds = assignments[program.id] || [];
              const assignedStudents = assignedIds
                .map((id) => studentNameMap.get(id))
                .filter(Boolean) as Participant[];
              const targetCount = Math.max(program.participantsCount || 1, 1);
              const fillPct = Math.min(100, Math.round((assignedIds.length / targetCount) * 100));
              const isOnStage = program.mode === 'on-stage';
              const isGroup = program.type === 'group';

              const stripGradient =
                status.key === 'full'
                  ? 'from-emerald-400 via-green-500 to-teal-500'
                  : status.key === 'partial'
                  ? 'from-amber-400 via-yellow-500 to-orange-500'
                  : 'from-rose-400 via-red-500 to-pink-500';

              if (viewMode === 'list') {
                return (
                  <div
                    key={program.id}
                    onMouseMove={handleCardPointerMove}
                    className="assign-anim-item group relative overflow-hidden rounded-2xl border border-border/60 bg-background/70 backdrop-blur-md p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
                  >
                    <div
                      className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      style={{
                        background:
                          'radial-gradient(380px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(99,102,241,0.12), transparent 60%)',
                      }}
                    />
                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-base truncate">{program.name}</h3>
                          <Badge variant="outline" className="text-[11px]">{program.categoryName}</Badge>
                          <Badge variant="secondary" className="capitalize text-[11px]">{program.type}</Badge>
                        </div>
                        {assignedStudents.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {assignedStudents.map((s) => (
                              <Badge key={s.id} variant="outline" className="text-[10px] bg-primary/5 border-primary/20 text-primary">
                                #{s.chestNumber} {s.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 md:gap-4 shrink-0">
                        <div className="w-28">
                          <div className="flex justify-between text-[11px] mb-1">
                            <span className="text-muted-foreground">Slots</span>
                            <span className="font-mono font-semibold">{assignedIds.length}/{program.participantsCount}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-500', stripGradient)}
                              style={{ width: `${fillPct}%` }}
                            />
                          </div>
                        </div>

                        <Badge className={cn('border text-xs', status.className)}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {status.text}
                        </Badge>

                        {settings?.allowTeamAssignment && (
                          <Button size="sm" onClick={() => handleAssignClick(program)} className="rounded-xl">
                            <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                            {assignedIds.length > 0 ? 'Update' : 'Assign'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <Card
                  key={program.id}
                  onMouseMove={handleCardPointerMove}
                  className="assign-anim-item group relative flex flex-col overflow-hidden rounded-2xl border-border/60 bg-background/70 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
                >
                  <div className={cn('h-1.5 w-full bg-gradient-to-r', stripGradient)} />
                  <div
                    className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                      background:
                        'radial-gradient(320px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(99,102,241,0.12), transparent 60%)',
                    }}
                  />

                  <CardHeader className="relative z-10 pb-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="space-y-1 min-w-0">
                        <span className="inline-flex items-center rounded-md bg-muted/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {program.categoryName}
                        </span>
                        <CardTitle className="text-base leading-snug group-hover:text-primary transition-colors">
                          {program.name}
                        </CardTitle>
                      </div>
                      <Badge variant="outline" className={cn('border text-[11px] shrink-0', status.className)}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {status.key === 'full' ? 'Full' : status.key === 'partial' ? 'Partial' : 'Empty'}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="relative z-10 flex-grow space-y-3.5 pb-4">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          'capitalize text-xs',
                          isOnStage
                            ? 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400'
                            : 'border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400'
                        )}
                      >
                        {isOnStage ? <Mic2 className="mr-1 h-3 w-3" /> : <Sparkles className="mr-1 h-3 w-3" />}
                        {program.mode}
                      </Badge>
                      <Badge variant="secondary" className="capitalize text-xs">
                        {isGroup ? <Users className="mr-1 h-3 w-3" /> : <UserIcon className="mr-1 h-3 w-3" />}
                        {program.type}{isGroup && program.groupMembers ? ` (${program.groupMembers})` : ''}
                      </Badge>
                    </div>

                    {/* Slot Progress */}
                    <div className="rounded-xl border border-border/50 bg-muted/30 p-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground font-medium">Assigned Slots</span>
                        <span className="font-mono font-semibold">{assignedIds.length} / {program.participantsCount}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-500', stripGradient)}
                          style={{ width: `${fillPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Preview of Assigned Team Members */}
                    {assignedStudents.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {assignedStudents.slice(0, 3).map((s) => (
                          <Badge key={s.id} variant="outline" className="text-[10px] bg-primary/5 border-primary/20 text-primary">
                            #{s.chestNumber} {s.name}
                          </Badge>
                        ))}
                        {assignedStudents.length > 3 && (
                          <Badge variant="outline" className="text-[10px]">
                            +{assignedStudents.length - 3} more
                          </Badge>
                        )}
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="relative z-10 flex flex-col gap-2 pt-3 border-t border-border/50 bg-muted/15">
                    {settings?.allowTeamAssignment ? (
                      <Button
                        className="w-full rounded-xl shadow-sm"
                        variant={assignedIds.length > 0 ? 'outline' : 'default'}
                        onClick={() => handleAssignClick(program)}
                      >
                        <UserCheck className="mr-2 h-4 w-4" />
                        {assignedIds.length > 0 ? 'Edit Assignments' : 'Assign Participants'}
                      </Button>
                    ) : (
                      <Badge variant="outline" className="w-full justify-center py-1.5 text-muted-foreground">
                        <Lock className="mr-1.5 h-3 w-3" /> Assignments Locked
                      </Badge>
                    )}
                  </CardFooter>
                </Card>
              );
            })}

            {filteredPrograms.length === 0 && (
              <div className="col-span-full text-center text-muted-foreground py-14 flex flex-col items-center justify-center border border-dashed border-border/60 rounded-2xl bg-muted/10">
                <div className="p-4 rounded-full bg-muted/30 mb-3">
                  <Filter className="h-8 w-8 opacity-50" />
                </div>
                <p className="font-semibold text-base text-foreground">No Programs Found</p>
                <p className="text-sm mt-1">Try adjusting or resetting your filter criteria.</p>
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" onClick={resetFilters} className="mt-4 rounded-xl">
                    Reset Filters
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedProgram && (
        <AssignParticipantDialog
          isOpen={isAssignDialogOpen}
          onOpenChange={setIsAssignDialogOpen}
          program={selectedProgram}
          participants={participants}
          teamId={teamId}
          programCategories={programCategories}
          memberCategories={memberCategories}
          existingAssignments={assignments[selectedProgram.id] || []}
          programAssignmentDocs={rawAssignments.filter((a) => a.programId === selectedProgram.id)}
        />
      )}
    </div>
  );
}


interface AssignParticipantDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  program: Program;
  participants: Participant[];
  teamId: string;
  programCategories: Category[];
  memberCategories: Category[];
  existingAssignments: string[];
  programAssignmentDocs: TeamAssignment[];
}

function AssignParticipantDialog({
  isOpen,
  onOpenChange,
  program,
  participants,
  teamId,
  programCategories,
  memberCategories,
  existingAssignments,
  programAssignmentDocs,
}: AssignParticipantDialogProps) {
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSelectedParticipants(existingAssignments);
      setSearchTerm('');
    }
  }, [existingAssignments, isOpen]);

  const programCategory = useMemo(() => {
    return programCategories.find(c => c.id === program.categoryId)
  }, [program.categoryId, programCategories]);


  const eligibleParticipants = useMemo(() => {
    let filteredParticipants: Participant[] = [];
    if (programCategory?.isGeneral) {
      filteredParticipants = participants;
    } else {
      filteredParticipants = participants.filter(participant => participant.categoryName === programCategory?.name);
    }

    if (searchTerm) {
      return filteredParticipants.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return filteredParticipants;
  }, [participants, programCategory, searchTerm]);

  const handleCheckboxChange = (participantId: string, checked: boolean) => {
    const limit = program.participantsCount;
    if (checked && selectedParticipants.length >= limit) {
      toast({
        title: 'Limit Reached',
        description: `You can only assign up to ${limit} participant(s) for this program.`,
        variant: 'destructive',
      });
      return;
    }
    setSelectedParticipants(prev =>
      checked ? [...prev, participantId] : prev.filter(id => id !== participantId)
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const assignmentsRef = collection(db, 'assignments');

      const currentAssignments = existingAssignments;
      const newAssignments = selectedParticipants;

      const toDelete = currentAssignments.filter(id => !newAssignments.includes(id));
      const toAdd = newAssignments.filter(id => !currentAssignments.includes(id));

      // Delete assignments directly by known document IDs (0 extra reads)
      if (toDelete.length > 0) {
        const docsToDelete = programAssignmentDocs.filter((a) =>
          toDelete.includes(a.studentId)
        );
        await Promise.all(
          docsToDelete.map((a) => deleteDoc(doc(db, 'assignments', a.id)))
        );
      }

      // Add new assignments
      const addPromises = toAdd.map(participantId => {
        return addDoc(assignmentsRef, {
          programId: program.id,
          studentId: participantId,
          teamId: teamId,
        });
      });

      await Promise.all(addPromises);

      toast({ title: 'Success', description: 'Assignments updated successfully.' });
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving assignments:', error);
      toast({ title: 'Error', description: 'Failed to save assignments.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg w-[94vw] max-h-[88vh] overflow-y-auto p-4 sm:p-6 rounded-2xl bg-background/95 backdrop-blur-xl border-border/60">
        <DialogHeader>
          <DialogTitle className="font-headline text-lg sm:text-xl">Assign Participants to &quot;{program.name}&quot;</DialogTitle>
          <div className="flex items-center justify-between gap-2 pt-1">
            <DialogDescription className="text-xs sm:text-sm">
              Select up to {program.participantsCount} participant(s).
            </DialogDescription>
            <div className="flex items-center gap-2 shrink-0">
              {selectedParticipants.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedParticipants([])}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  Clear all
                </button>
              )}
              <Badge
                variant="outline"
                className={cn(
                  'font-mono text-xs',
                  selectedParticipants.length === program.participantsCount
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                    : ''
                )}
              >
                {selectedParticipants.length} / {program.participantsCount}
              </Badge>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search eligible participants..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-muted/50 border-white/10 text-sm"
            />
          </div>
          <ScrollArea className="h-60 sm:h-72 border border-border/40 rounded-xl bg-muted/20 p-2">
            <div className="space-y-2">
              {eligibleParticipants.length > 0 ? (
                eligibleParticipants.map((participant) => {
                  const isSelected = selectedParticipants.includes(participant.id);
                  return (
                    <div
                      key={participant.id}
                      className={cn(
                        "flex items-center justify-between rounded-lg p-2.5 sm:p-3 transition-colors cursor-pointer border border-transparent",
                        isSelected ? "bg-primary/10 border-primary/20" : "hover:bg-muted/40"
                      )}
                      onClick={() => handleCheckboxChange(participant.id, !isSelected)}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border border-border/60">
                          <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{participant.name.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-sm leading-none text-foreground">{participant.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">Chest No: <span className="font-mono font-bold text-primary">#{participant.chestNumber}</span></p>
                        </div>
                      </div>
                      <Checkbox
                        id={`participant-${participant.id}`}
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={(checked) => handleCheckboxChange(participant.id, !!checked)}
                        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                    </div>
                  );
                })
              ) : (
                <div className="text-center text-muted-foreground py-10 flex flex-col items-center">
                  <Users className="h-10 w-10 opacity-30 mb-3" />
                  <p className="font-semibold text-sm text-foreground">No Eligible Participants</p>
                  <p className="text-xs mt-1 max-w-[220px]">
                    {searchTerm
                      ? "No participants match your search."
                      : "There are no participants in your team eligible for this program's category."
                    }
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0 pt-2">
          <DialogClose asChild>
            <Button type="button" variant="outline" className="w-full sm:w-auto">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto">
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Assignments
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
