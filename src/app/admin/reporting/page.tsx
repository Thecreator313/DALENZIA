'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useSharedCollection } from '@/context/firestore-cache';
import { AnimatedCounter } from '@/components/animated-counter';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Loader2,
  Users,
  SlidersHorizontal,
  PackageOpen,
  Award,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  LayoutGrid,
  List as ListIcon,
  X,
  Download,
  Sparkles,
  Mic2,
  Layers,
  FilterX,
  ArrowRight,
} from 'lucide-react';
import type { Program } from '@/app/admin/programs/page';
import type { Participant } from '@/app/teams/add-participants/page';
import type { Team } from '@/app/admin/teams/page';
import type { Category } from '@/app/admin/categories/page';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

type Assignment = {
  id: string;
  programId: string;
  studentId: string;
  teamId: string;
  codeLetter?: string;
  status?: 'cancelled';
};

type ParticipantWithAssignment = Participant & {
  assignmentId: string;
  codeLetter?: string;
  teamName: string;
  status?: 'cancelled';
};

type ProgramWithDetails = Program & {
  assignments: {
    teamId: string;
    teamName: string;
    participants: ParticipantWithAssignment[];
  }[];
  allParticipants: ParticipantWithAssignment[];
};

type StatusKey = 'no_participants' | 'not_started' | 'in_progress' | 'completed';

interface ReportingStatusInfo {
  key: StatusKey;
  text: string;
  badgeClass: string;
  dotClass: string;
  activeCount: number;
  reportedCount: number;
  cancelledCount: number;
  percent: number;
}

const getReportingStatus = (program: ProgramWithDetails): ReportingStatusInfo => {
  const activeParticipants = program.allParticipants.filter((p) => p.status !== 'cancelled');
  const cancelledCount = program.allParticipants.length - activeParticipants.length;
  const activeCount = activeParticipants.length;
  const reportedCount = activeParticipants.filter((p) => !!p.codeLetter).length;
  const percent = activeCount > 0 ? Math.round((reportedCount / activeCount) * 100) : 0;

  if (activeCount === 0) {
    return {
      key: 'no_participants',
      text: 'No Participants',
      badgeClass: 'bg-muted text-muted-foreground border-border',
      dotClass: 'bg-muted-foreground',
      activeCount,
      reportedCount,
      cancelledCount,
      percent: 0,
    };
  }
  if (reportedCount === 0) {
    return {
      key: 'not_started',
      text: 'Not Started',
      badgeClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
      dotClass: 'bg-rose-500',
      activeCount,
      reportedCount,
      cancelledCount,
      percent,
    };
  }
  if (reportedCount === activeCount) {
    return {
      key: 'completed',
      text: 'Completed',
      badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      dotClass: 'bg-emerald-500',
      activeCount,
      reportedCount,
      cancelledCount,
      percent: 100,
    };
  }
  return {
    key: 'in_progress',
    text: 'In Progress',
    badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
    dotClass: 'bg-amber-500',
    activeCount,
    reportedCount,
    cancelledCount,
    percent,
  };
};

const exportProgramCsv = (program: ProgramWithDetails) => {
  const rows = [
    ['Program', 'Category', 'Participant', 'Chest Number', 'Team', 'Code Letter', 'Status'],
    ...program.allParticipants
      .slice()
      .sort((a, b) => {
        if (a.codeLetter && b.codeLetter) return a.codeLetter.localeCompare(b.codeLetter);
        if (a.codeLetter) return -1;
        if (b.codeLetter) return 1;
        return a.chestNumber - b.chestNumber;
      })
      .map((p) => [
        program.name,
        program.categoryName || '',
        p.name,
        String(p.chestNumber),
        p.teamName,
        p.codeLetter || '',
        p.status === 'cancelled' ? 'Cancelled' : p.codeLetter ? 'Reported' : 'Pending',
      ]),
  ];

  const csvContent = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${program.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-reporting.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

export default function AdminReportingPage() {
  const { data: rawPrograms, loading: progsLoading } = useSharedCollection<Program>('programs');
  const { data: programCategories, loading: catsLoading } = useSharedCollection<Category>('programCategories');
  const { data: teams, loading: teamsLoading } = useSharedCollection<Team>('teams');
  const { data: students, loading: studentsLoading } = useSharedCollection<Participant>('students');
  const { data: assignments, loading: assignmentsLoading } = useSharedCollection<Assignment>('assignments');

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | StatusKey>('all');
  const [modeFilter, setModeFilter] = useState<'all' | 'on-stage' | 'off-stage'>('all');
  const [sortBy, setSortBy] = useState<'status' | 'name' | 'progress' | 'participants'>('status');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const programs = useMemo(() => {
    const categoryMap = new Map(programCategories.map((c) => [c.id, c.name]));
    const teamMap = new Map(teams.map((t) => [t.id, t.name]));
    const studentMap = new Map(students.map((s) => [s.id, s]));

    const assignmentsByProgram = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const list = assignmentsByProgram.get(a.programId);
      if (list) list.push(a);
      else assignmentsByProgram.set(a.programId, [a]);
    }

    return rawPrograms.map((programData) => {
      const programAssignmentsList = assignmentsByProgram.get(programData.id) || [];
      const participantsWithDetails = programAssignmentsList
        .map((assignment) => {
          const student = studentMap.get(assignment.studentId);
          return student
            ? {
                ...student,
                assignmentId: assignment.id,
                codeLetter: assignment.codeLetter,
                teamName: teamMap.get(assignment.teamId) || 'Unknown Team',
                status: assignment.status,
              }
            : null;
        })
        .filter(Boolean) as ParticipantWithAssignment[];

      const assignmentsByTeam = participantsWithDetails.reduce((acc, participant) => {
        if (!acc[participant.teamId]) acc[participant.teamId] = [];
        acc[participant.teamId].push(participant);
        return acc;
      }, {} as Record<string, ParticipantWithAssignment[]>);

      const programAssignments = Object.entries(assignmentsByTeam).map(([teamId, teamParticipants]) => ({
        teamId,
        teamName: teamMap.get(teamId) || 'Unknown Team',
        participants: teamParticipants.sort((a, b) => a.chestNumber - b.chestNumber),
      }));

      return {
        ...programData,
        categoryName: categoryMap.get(programData.categoryId) || 'Unknown Category',
        assignments: programAssignments,
        allParticipants: participantsWithDetails,
      } as ProgramWithDetails;
    });
  }, [rawPrograms, programCategories, teams, students, assignments]);

  const loading = progsLoading || catsLoading || teamsLoading || studentsLoading || assignmentsLoading;

  const stats = useMemo(() => {
    let completed = 0;
    let inProgress = 0;
    let notStarted = 0;
    let noParticipants = 0;
    let totalActive = 0;
    let totalReported = 0;
    let totalCancelled = 0;

    for (const p of programs) {
      const st = getReportingStatus(p);
      if (st.key === 'completed') completed++;
      else if (st.key === 'in_progress') inProgress++;
      else if (st.key === 'not_started') notStarted++;
      else noParticipants++;

      totalActive += st.activeCount;
      totalReported += st.reportedCount;
      totalCancelled += st.cancelledCount;
    }

    const overallPercent = totalActive > 0 ? Math.round((totalReported / totalActive) * 100) : 0;

    return {
      totalPrograms: programs.length,
      completed,
      inProgress,
      notStarted,
      noParticipants,
      totalActive,
      totalReported,
      totalCancelled,
      overallPercent,
    };
  }, [programs]);

  const filteredPrograms = useMemo(() => {
    const queryLower = searchTerm.trim().toLowerCase();

    const statusPriority: Record<StatusKey, number> = {
      in_progress: 0,
      not_started: 1,
      completed: 2,
      no_participants: 3,
    };

    const items = programs
      .map((p) => {
        const statusInfo = getReportingStatus(p);
        const matchingParticipants = queryLower
          ? p.allParticipants.filter(
              (part) =>
                part.name.toLowerCase().includes(queryLower) ||
                String(part.chestNumber).toLowerCase().includes(queryLower) ||
                part.teamName.toLowerCase().includes(queryLower)
            ).length
          : 0;
        return { program: p, statusInfo, matchingParticipants };
      })
      .filter(({ program, statusInfo, matchingParticipants }) => {
        if (categoryFilter !== 'all' && program.categoryId !== categoryFilter) return false;
        if (modeFilter !== 'all' && program.mode !== modeFilter) return false;
        if (statusFilter !== 'all' && statusInfo.key !== statusFilter) return false;
        if (queryLower) {
          const matchesProgram =
            program.name.toLowerCase().includes(queryLower) ||
            (program.categoryName || '').toLowerCase().includes(queryLower);
          if (!matchesProgram && matchingParticipants === 0) return false;
        }
        return true;
      });

    items.sort((a, b) => {
      if (sortBy === 'status') {
        const diff = statusPriority[a.statusInfo.key] - statusPriority[b.statusInfo.key];
        if (diff !== 0) return diff;
        return a.program.name.localeCompare(b.program.name);
      }
      if (sortBy === 'name') {
        return a.program.name.localeCompare(b.program.name);
      }
      if (sortBy === 'progress') {
        return b.statusInfo.percent - a.statusInfo.percent || a.program.name.localeCompare(b.program.name);
      }
      return b.statusInfo.activeCount - a.statusInfo.activeCount;
    });

    return items;
  }, [programs, searchTerm, categoryFilter, modeFilter, statusFilter, sortBy]);

  const hasActiveFilters =
    searchTerm.trim() !== '' || categoryFilter !== 'all' || statusFilter !== 'all' || modeFilter !== 'all';

  const clearFilters = () => {
    setSearchTerm('');
    setCategoryFilter('all');
    setStatusFilter('all');
    setModeFilter('all');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm font-medium">Loading Program & Reporting Data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Header & Live KPI Strip */}
      <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/5 via-card/80 to-card/60 backdrop-blur-xl p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5 sm:mb-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-1">
              <Award className="h-3.5 w-3.5" />
              Stage Check-In & Code Assignment
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-headline tracking-tight">Participant Reporting</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Select a program to open its reporting workspace, assign code letters, and reveal scratch cards.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full lg:w-auto">
            <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-2.5 w-full sm:w-auto sm:min-w-[220px]">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span>Overall Check-In</span>
                <span className="font-semibold text-foreground">{stats.overallPercent}%</span>
              </div>
              <Progress value={stats.overallPercent} className="h-2" />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1.5">
                <span>
                  <strong className="text-foreground">{stats.totalReported}</strong> / {stats.totalActive} reported
                </span>
                {stats.totalCancelled > 0 && (
                  <span className="text-rose-500">{stats.totalCancelled} cancelled</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: 'Total Programs',
              val: stats.totalPrograms,
              icon: Layers,
              filterKey: 'all' as const,
              accent: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
            },
            {
              label: 'Completed',
              val: stats.completed,
              icon: CheckCircle2,
              filterKey: 'completed' as const,
              accent: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
            },
            {
              label: 'In Progress',
              val: stats.inProgress,
              icon: Clock,
              filterKey: 'in_progress' as const,
              accent: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
            },
            {
              label: 'Not Started',
              val: stats.notStarted,
              icon: AlertCircle,
              filterKey: 'not_started' as const,
              accent: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
            },
          ].map((item) => {
            const isActive = statusFilter === item.filterKey;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() =>
                  setStatusFilter((prev) =>
                    prev === item.filterKey && item.filterKey !== 'all' ? 'all' : item.filterKey
                  )
                }
                className={cn(
                  'text-left rounded-2xl border bg-background/60 backdrop-blur-md p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
                  isActive ? 'border-primary ring-1 ring-primary/30' : 'border-border/60 hover:border-primary/30'
                )}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    {item.label}
                  </span>
                  <span className={cn('p-1.5 rounded-lg border', item.accent)}>
                    <item.icon className="h-3.5 w-3.5" />
                  </span>
                </div>
                <div className="text-2xl font-bold font-headline tracking-tight">
                  <AnimatedCounter value={item.val} />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Filter Toolbar & Program Showcase */}
      <Card className="border-border/60 bg-card/60 backdrop-blur-xl shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                Programs
                <Badge variant="secondary" className="rounded-full font-mono text-xs">
                  {filteredPrograms.length} / {programs.length}
                </Badge>
              </CardTitle>
              <CardDescription>
                Search by program, category, participant name, chest number, or team.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs h-8">
                  <FilterX className="mr-1.5 h-3.5 w-3.5" />
                  Clear Filters
                </Button>
              )}
              <div className="inline-flex rounded-xl border border-border/60 bg-background/70 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all',
                    viewMode === 'grid'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Grid
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all',
                    viewMode === 'table'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <ListIcon className="h-3.5 w-3.5" />
                  Table
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search program, participant, chest #, or team..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-8 bg-background/70 border-border/60 rounded-xl"
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
              <SelectTrigger className="bg-background/70 border-border/60 rounded-xl">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {programCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={modeFilter} onValueChange={(v) => setModeFilter(v as typeof modeFilter)}>
              <SelectTrigger className="bg-background/70 border-border/60 rounded-xl">
                <SelectValue placeholder="All Modes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modes</SelectItem>
                <SelectItem value="on-stage">On-Stage</SelectItem>
                <SelectItem value="off-stage">Off-Stage</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="bg-background/70 border-border/60 rounded-xl">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="status">Sort: Status Priority</SelectItem>
                <SelectItem value="name">Sort: Name (A–Z)</SelectItem>
                <SelectItem value="progress">Sort: Completion %</SelectItem>
                <SelectItem value="participants">Sort: Participants</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          {filteredPrograms.length === 0 ? (
            <div className="text-center text-muted-foreground py-16">
              <PackageOpen className="mx-auto h-14 w-14 opacity-50" />
              <p className="mt-4 font-semibold text-lg text-foreground">No Programs Found</p>
              <p className="text-sm mt-1">Try adjusting your search or filter criteria.</p>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4">
                  Reset All Filters
                </Button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {filteredPrograms.map(({ program, statusInfo, matchingParticipants }) => (
                <Card
                  key={program.id}
                  className="group flex flex-col border-border/60 bg-background/60 hover:border-primary/40 hover:shadow-md transition-all duration-200"
                >
                  <CardHeader className="pb-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <Badge variant="outline" className={cn('text-[11px] font-medium border', statusInfo.badgeClass)}>
                        <span className={cn('mr-1.5 h-1.5 w-1.5 rounded-full', statusInfo.dotClass)} />
                        {statusInfo.text}
                      </Badge>
                      <div className="flex items-center gap-1.5">
                        {program.mode && (
                          <Badge variant="secondary" className="text-[10px] capitalize">
                            {program.mode === 'on-stage' ? (
                              <Mic2 className="mr-1 h-2.5 w-2.5" />
                            ) : (
                              <Sparkles className="mr-1 h-2.5 w-2.5" />
                            )}
                            {program.mode}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div>
                      <CardTitle className="text-lg leading-snug group-hover:text-primary transition-colors">
                        {program.name}
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5 flex items-center gap-1.5">
                        <span>{program.categoryName}</span>
                        {program.type && (
                          <>
                            <span>•</span>
                            <span className="capitalize">{program.type}</span>
                          </>
                        )}
                      </CardDescription>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-grow space-y-3 pb-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" />
                          <span>
                            <strong className="text-foreground">{statusInfo.reportedCount}</strong> /{' '}
                            {statusInfo.activeCount} reported
                          </span>
                        </span>
                        <span className="font-mono font-medium text-xs">{statusInfo.percent}%</span>
                      </div>
                      <Progress value={statusInfo.percent} className="h-1.5" />
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      {statusInfo.cancelledCount > 0 && (
                        <Badge variant="outline" className="text-rose-500 border-rose-500/30 bg-rose-500/5">
                          {statusInfo.cancelledCount} cancelled
                        </Badge>
                      )}
                      {matchingParticipants > 0 && searchTerm.trim() !== '' && (
                        <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5">
                          {matchingParticipants} matching participant{matchingParticipants > 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                  </CardContent>

                  <CardFooter className="pt-0 gap-2">
                    {program.allParticipants.length === 0 ? (
                      <Button className="flex-1" variant="secondary" disabled>
                        <SlidersHorizontal className="mr-2 h-4 w-4" />
                        No Participants
                      </Button>
                    ) : (
                      <Button
                        asChild
                        className="flex-1"
                        variant={statusInfo.key === 'completed' ? 'secondary' : 'default'}
                      >
                        <Link href={`/admin/reporting/${program.id}`}>
                          <SlidersHorizontal className="mr-2 h-4 w-4" />
                          {statusInfo.key === 'completed' ? 'View / Edit Codes' : 'Manage Reporting'}
                          <ArrowRight className="ml-auto h-4 w-4 opacity-70" />
                        </Link>
                      </Button>
                    )}
                    {statusInfo.reportedCount > 0 && (
                      <Button
                        variant="outline"
                        size="icon"
                        title="Export Reporting CSV"
                        onClick={() => exportProgramCsv(program)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border/60 overflow-x-auto">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Program</TableHead>
                    <TableHead>Category & Mode</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPrograms.map(({ program, statusInfo }) => (
                    <TableRow key={program.id}>
                      <TableCell className="font-medium">
                        <div>{program.name}</div>
                        {statusInfo.cancelledCount > 0 && (
                          <span className="text-xs text-rose-500">{statusInfo.cancelledCount} cancelled</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{program.categoryName}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {program.mode} • {program.type}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[180px]">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span>
                            {statusInfo.reportedCount} / {statusInfo.activeCount}
                          </span>
                          <span className="font-mono">{statusInfo.percent}%</span>
                        </div>
                        <Progress value={statusInfo.percent} className="h-1.5" />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-xs border', statusInfo.badgeClass)}>
                          <span className={cn('mr-1.5 h-1.5 w-1.5 rounded-full', statusInfo.dotClass)} />
                          {statusInfo.text}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2">
                          {statusInfo.reportedCount > 0 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Export CSV"
                              onClick={() => exportProgramCsv(program)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                          {program.allParticipants.length === 0 ? (
                            <Button size="sm" variant="secondary" disabled>
                              Manage
                            </Button>
                          ) : (
                            <Button
                              asChild
                              size="sm"
                              variant={statusInfo.key === 'completed' ? 'secondary' : 'default'}
                            >
                              <Link href={`/admin/reporting/${program.id}`}>
                                <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
                                Manage
                              </Link>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
