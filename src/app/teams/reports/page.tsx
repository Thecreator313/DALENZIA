
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import {
  collection,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAppSettings, useCachedCollection, useSharedCollection } from '@/context/firestore-cache';
import type { User } from '@/app/admin/access-central/page';
import type { Program } from '@/app/admin/programs/page';
import type { Participant } from '@/app/teams/add-participants/page';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Loader2,
  Download,
  Search,
  FileText,
  Users,
  ListChecks,
  Sparkles,
  X,
  Mic2,
  Layers,
  Filter,
  RotateCcw,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Category } from '@/app/admin/categories/page';
import { TeamOrbitCanvas } from '@/components/team-orbit-canvas';
import { AnimatedCounter } from '@/components/animated-counter';


type Assignment = {
  id: string;
  programId: string;
  studentId: string;
  teamId: string;
};

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'P'
  );
}

export default function ReportsPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userChecked, setUserChecked] = useState(false);
  const { settings, loading: settingsLoading } = useAppSettings();

  const [downloadingReport, setDownloadingReport] = useState<'participant' | 'program' | null>(null);
  const isDownloading = downloadingReport !== null;
  const [activeTab, setActiveTab] = useState<'participant' | 'program'>('participant');

  const [participantSearch, setParticipantSearch] = useState('');
  const [programSearch, setProgramSearch] = useState('');
  const [participantCategoryFilter, setParticipantCategoryFilter] = useState('all');
  const [programCategoryFilter, setProgramCategoryFilter] = useState('all');

  const pageRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('fest-central-user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
    setUserChecked(true);
  }, []);

  const { data: userTeams, loading: teamLoading } = useCachedCollection<{ id: string; name: string }>(
    currentUser ? `query:team:${currentUser.id}` : 'query:team:none',
    () => query(collection(db, 'teams'), where('leaderId', '==', currentUser!.id)),
    { enabled: !!currentUser }
  );
  const team = userTeams[0] ?? null;

  const { data: programCategories, loading: progCatsLoading } = useSharedCollection<Category>('programCategories');
  const { data: memberCategories, loading: memCatsLoading } = useSharedCollection<Category>('memberCategories');

  const { data: rawParticipants, loading: studentsLoading } = useCachedCollection<Participant>(
    team ? `query:students:${team.id}` : 'query:students:none',
    () => query(collection(db, 'students'), where('teamId', '==', team!.id)),
    { enabled: !!team }
  );

  const { data: rawPrograms, loading: programsLoading } = useSharedCollection<Program>('programs', {
    enabled: !!team,
  });

  const { data: assignments, loading: assignmentsLoading } = useCachedCollection<Assignment>(
    team ? `query:assignments:${team.id}` : 'query:assignments:none',
    () => query(collection(db, 'assignments'), where('teamId', '==', team!.id)),
    { enabled: !!team }
  );

  const participants = useMemo<(Participant & { categoryName: string })[]>(() => {
    const memCatMap = new Map(memberCategories.map((c) => [c.id, c.name]));
    return rawParticipants.map((p) => ({
      ...p,
      categoryName: memCatMap.get(p.categoryId) || 'N/A',
    }));
  }, [rawParticipants, memberCategories]);

  const programs = useMemo<Program[]>(() => {
    const progCatMap = new Map(programCategories.map((c) => [c.id, c.name]));
    return rawPrograms.map((p) => ({
      ...p,
      categoryName: progCatMap.get(p.categoryId) || 'N/A',
    }));
  }, [rawPrograms, programCategories]);

  const loading =
    !userChecked ||
    settingsLoading ||
    progCatsLoading ||
    memCatsLoading ||
    (!!currentUser &&
      (teamLoading || (!!team && (studentsLoading || programsLoading || assignmentsLoading))));

  const summary = useMemo(() => {
    const assignedStudentIds = new Set(assignments.map((a) => a.studentId));
    const assignedProgramIds = new Set(assignments.map((a) => a.programId));
    return {
      totalParticipants: participants.length,
      participantsWithPrograms: participants.filter((p) => assignedStudentIds.has(p.id)).length,
      activeProgramsCount: programs.filter((p) => assignedProgramIds.has(p.id)).length,
      totalEntries: assignments.length,
    };
  }, [participants, programs, assignments]);

  const participantReportData = useMemo(() => {
    const q = participantSearch.trim().toLowerCase();
    return participants
      .filter(
        (p) =>
          q === '' ||
          p.name.toLowerCase().includes(q) ||
          String(p.chestNumber ?? '').toLowerCase().includes(q)
      )
      .filter((p) => participantCategoryFilter === 'all' || p.categoryId === participantCategoryFilter)
      .map((participant) => {
        const participantAssignments = assignments.filter((a) => a.studentId === participant.id);
        const assignedPrograms = participantAssignments
          .map((pa) => programs.find((p) => p.id === pa.programId))
          .filter((p): p is Program => !!p);
        return { ...participant, programs: assignedPrograms };
      });
  }, [participants, assignments, programs, participantSearch, participantCategoryFilter]);

  const programReportData = useMemo(() => {
    const q = programSearch.trim().toLowerCase();
    return programs
      .map((program) => {
        const programAssignments = assignments.filter((a) => a.programId === program.id);
        const assignedParticipants = programAssignments
          .map((pa) => participants.find((p) => p.id === pa.studentId))
          .filter((p): p is Participant & { categoryName: string } => !!p);
        return { ...program, participants: assignedParticipants };
      })
      .filter((p) => p.participants.length > 0)
      .filter((p) => q === '' || p.name.toLowerCase().includes(q))
      .filter((p) => programCategoryFilter === 'all' || p.categoryId === programCategoryFilter);
  }, [programs, assignments, participants, programSearch, programCategoryFilter]);

  useEffect(() => {
    if (loading || !team?.id) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const ctx = gsap.context(() => {
      gsap.from('.reports-hero-stagger', {
        y: 18,
        opacity: 0,
        duration: 0.55,
        stagger: 0.08,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      });
    }, pageRef);

    return () => ctx.revert();
  }, [loading, team?.id]);

  useEffect(() => {
    if (loading || !team?.id) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.report-item-card',
        { y: 14, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.42,
          stagger: 0.045,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        }
      );
    }, listRef);

    return () => ctx.revert();
  }, [loading, team?.id, activeTab, participantCategoryFilter, programCategoryFilter]);

  const handleDownloadPDF = async (reportType: 'participant' | 'program') => {
    setDownloadingReport(reportType);

    try {
        const doc = new jsPDF({
            orientation: 'p',
            unit: 'mm',
            format: 'a4'
        });
        
        const festName = settings?.festName || 'Fest Central';
        const reportTitle = `${festName} - ${reportType === 'participant' ? 'Participant Report' : 'Program Report'}`;
        const primaryColor: [number, number, number] = [59, 130, 246]; // A nice blue color

        const addHeaderAndFooter = () => {
            const pageCount = (doc as any).internal.getNumberOfPages();
            for(let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(16);
                doc.setTextColor(40);
                doc.text(reportTitle, 14, 15);
                doc.setFontSize(12);
                doc.text(`Team: ${team?.name || 'N/A'}`, 14, 22);
                doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
                doc.line(14, 25, 200, 25);
                
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(`Page ${i} of ${pageCount}`, 14, 287);
                doc.text(`Generated: ${new Date().toLocaleString()}`, 200, 287, {align: 'right'});
            }
        };
        
        let finalY = 30;

        if(reportType === 'participant') {
            participantReportData.forEach(participant => {
                const participantHeader = [
                    [{ content: `Participant: ${participant.name} (Chest No: ${participant.chestNumber}) - Category: ${participant.categoryName}`, colSpan: 4, styles: { fontStyle: 'bold' as const, fillColor: [230, 247, 255] as [number, number, number], textColor: [40, 40, 40] as [number, number, number] } }]
                ];
                autoTable(doc, {
                    body: participantHeader,
                    startY: finalY,
                    theme: 'grid',
                    didDrawPage: (data) => { finalY = data.cursor?.y || 30 },
                });
                
                if (participant.programs.length > 0) {
                    autoTable(doc, {
                        head: [['Program Name', 'Program Category', 'Type', 'Mode']],
                        body: participant.programs.map(p => [p.name, p.categoryName || 'N/A', p.type, p.mode]),
                        startY: (doc as any).lastAutoTable.finalY,
                        theme: 'grid',
                        headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
                        didDrawPage: (data) => { finalY = data.cursor?.y || 30 },
                    });
                } else {
                     autoTable(doc, {
                        body: [['Not assigned to any programs.']],
                        startY: (doc as any).lastAutoTable.finalY,
                        theme: 'grid',
                        didDrawPage: (data) => { finalY = data.cursor?.y || 30 },
                    });
                }
                finalY = (doc as any).lastAutoTable.finalY + 10;
            });
        }

        if(reportType === 'program') {
            programReportData.forEach(program => {
                const programHeader = [
                     [{ content: `Program: ${program.name} - Category: ${program.categoryName}`, colSpan: 3, styles: { fontStyle: 'bold' as const, fillColor: [230, 247, 255] as [number, number, number], textColor: [40, 40, 40] as [number, number, number] } }]
                ];
                 autoTable(doc, {
                    body: programHeader,
                    startY: finalY,
                    theme: 'grid',
                    didDrawPage: (data) => { finalY = data.cursor?.y || 30 },
                });

                if (program.participants.length > 0) {
                     autoTable(doc, {
                        head: [['Participant Name', 'Chest Number', 'Participant Category']],
                        body: program.participants.map(p => [p.name, p.chestNumber, (p as any).categoryName]),
                         startY: (doc as any).lastAutoTable.finalY,
                         theme: 'grid',
                         headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
                         didDrawPage: (data) => { finalY = data.cursor?.y || 30 },
                    });
                } else {
                    autoTable(doc, {
                        body: [['No participants assigned from your team.']],
                        startY: (doc as any).lastAutoTable.finalY,
                        theme: 'grid',
                        didDrawPage: (data) => { finalY = data.cursor?.y || 30 },
                    });
                }

                finalY = (doc as any).lastAutoTable.finalY + 10;
            });
        }
        
        addHeaderAndFooter();

        doc.save(`fest-central-report-${reportType}-${new Date().toISOString().split('T')[0]}.pdf`);

    } catch (error) {
        console.error("Error generating PDF:", error);
    } finally {
        setDownloadingReport(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 shadow-lg">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        <div className="text-center">
          <p className="font-headline text-lg font-semibold">Preparing Team Reports</p>
          <p className="text-sm text-muted-foreground">Syncing participants, programs, and assignments...</p>
        </div>
      </div>
    );
  }

  if (!team?.id) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card className="border-border/60 bg-card/85 shadow-lg backdrop-blur-md">
          <CardHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <CardTitle className="font-headline text-2xl">No Team Assigned</CardTitle>
            <CardDescription>
              You are not currently assigned as a leader for any team. Contact the fest administrator to link your account.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const hasParticipantFilters = participantSearch.trim() !== '' || participantCategoryFilter !== 'all';
  const hasProgramFilters = programSearch.trim() !== '' || programCategoryFilter !== 'all';

  return (
    <div ref={pageRef} className="relative space-y-6 pb-10">
      <div className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-primary/15 via-sky-500/10 to-violet-500/15 blur-3xl" />

      {/* Reports Studio Hero Banner */}
      <section className="reports-hero-stagger relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white shadow-xl">
        <div className="pointer-events-none absolute inset-0 opacity-85">
          <TeamOrbitCanvas
            variant={activeTab === 'participant' ? 'participants' : 'assignments'}
            pulseKey={`${activeTab}-${participantCategoryFilter}-${programCategoryFilter}`}
          />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/65 to-transparent" />

        <div className="relative z-10 flex flex-col gap-6 p-6 md:p-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur-md hover:bg-white/15">
                <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-300" />
                Team Reports Studio
              </Badge>
              <Badge className="border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-200 backdrop-blur-md hover:bg-emerald-500/20">
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                {team.name}
              </Badge>
            </div>

            <h1 className="font-headline text-3xl font-bold tracking-tight sm:text-4xl">
              Team Reports &amp; Exports
            </h1>
            <p className="text-sm leading-relaxed text-slate-300 sm:text-base">
              Inspect live participant schedules and program-wise rosters for{' '}
              <span className="font-semibold text-white">{settings?.festName || 'Fest Central'}</span>, filter by
              category, and export print-ready A4 PDF reports in one click.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => handleDownloadPDF('participant')}
              disabled={isDownloading}
              className="h-11 rounded-xl bg-primary px-5 font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-[1.01]"
            >
              {downloadingReport === 'participant' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Participant PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => handleDownloadPDF('program')}
              disabled={isDownloading}
              className="h-11 rounded-xl border-white/20 bg-white/10 px-5 font-medium text-white backdrop-blur-md transition-all hover:bg-white/20 hover:text-white"
            >
              {downloadingReport === 'program' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Program PDF
            </Button>
          </div>
        </div>
      </section>

      {/* KPI Strip */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setActiveTab('participant')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveTab('participant');
            }
          }}
          className="reports-hero-stagger group cursor-pointer border-border/60 bg-card/80 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
        >
          <CardContent className="flex items-center justify-between p-5">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Team Participants</p>
              <p className="font-headline text-3xl font-bold">
                <AnimatedCounter value={summary.totalParticipants} />
              </p>
              <p className="text-xs text-muted-foreground">
                {summary.participantsWithPrograms} assigned to programs
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
              <Users className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          onClick={() => setActiveTab('program')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveTab('program');
            }
          }}
          className="reports-hero-stagger group cursor-pointer border-border/60 bg-card/80 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-indigo-500/40 hover:shadow-md"
        >
          <CardContent className="flex items-center justify-between p-5">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Active Programs</p>
              <p className="font-headline text-3xl font-bold">
                <AnimatedCounter value={summary.activeProgramsCount} />
              </p>
              <p className="text-xs text-muted-foreground">
                Across {programCategories.length} program categories
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500 transition-transform duration-300 group-hover:scale-110">
              <Mic2 className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="reports-hero-stagger border-border/60 bg-card/80 backdrop-blur-md">
          <CardContent className="flex items-center justify-between p-5">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Entries</p>
              <p className="font-headline text-3xl font-bold">
                <AnimatedCounter value={summary.totalEntries} />
              </p>
              <p className="text-xs text-muted-foreground">Live stage &amp; off-stage allocations</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
              <ListChecks className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="reports-hero-stagger border-border/60 bg-card/80 backdrop-blur-md">
          <CardContent className="flex items-center justify-between p-5">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Filtered View</p>
              <p className="font-headline text-3xl font-bold">
                <AnimatedCounter
                  value={activeTab === 'participant' ? participantReportData.length : programReportData.length}
                />
              </p>
              <p className="text-xs text-muted-foreground">
                {activeTab === 'participant' ? 'Participants in report' : 'Programs in report'}
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
              <FileText className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Main Tabs & Report Views */}
      <div ref={listRef} className="reports-hero-stagger">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as 'participant' | 'program')}
          className="w-full space-y-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList className="grid h-12 w-full max-w-md grid-cols-2 rounded-2xl border border-border/60 bg-muted/60 p-1 backdrop-blur-md">
              <TabsTrigger
                value="participant"
                className="flex items-center justify-center gap-2 rounded-xl text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <Users className="h-4 w-4" />
                <span>Participant-Based</span>
                <Badge variant="secondary" className="ml-1 rounded-full px-2 py-0 text-[11px]">
                  {participantReportData.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger
                value="program"
                className="flex items-center justify-center gap-2 rounded-xl text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <Layers className="h-4 w-4" />
                <span>Program-Based</span>
                <Badge variant="secondary" className="ml-1 rounded-full px-2 py-0 text-[11px]">
                  {programReportData.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <p className="text-xs text-muted-foreground">
              PDF downloads reflect your active search and category filters.
            </p>
          </div>

          <TabsContent value="participant" className="mt-0">
            <Card className="overflow-hidden rounded-2xl border-border/60 bg-card/80 shadow-sm backdrop-blur-md">
              <CardHeader className="border-b border-border/50 bg-muted/20 pb-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="font-headline text-xl">Participant-Based Report</CardTitle>
                    <CardDescription>
                      Review every team member&apos;s assigned stage and off-stage events.
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => handleDownloadPDF('participant')}
                    disabled={isDownloading}
                    className="rounded-xl shadow-sm"
                  >
                    {downloadingReport === 'participant' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Download PDF
                  </Button>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search by participant name or chest number..."
                      value={participantSearch}
                      onChange={(e) => setParticipantSearch(e.target.value)}
                      className="h-10 rounded-xl border-border/60 bg-background/80 pl-10 pr-9"
                    />
                    {participantSearch && (
                      <button
                        type="button"
                        onClick={() => setParticipantSearch('')}
                        aria-label="Clear participant search"
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <Select value={participantCategoryFilter} onValueChange={setParticipantCategoryFilter}>
                    <SelectTrigger className="h-10 w-full rounded-xl border-border/60 bg-background/80 sm:w-[240px]">
                      <div className="flex items-center gap-2 truncate">
                        <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <SelectValue placeholder="Filter by category..." />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {memberCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {hasParticipantFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setParticipantSearch('');
                        setParticipantCategoryFilter('all');
                      }}
                      className="h-10 rounded-xl px-3 text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      Reset
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-5 sm:p-6">
                {participantReportData.length > 0 ? (
                  <div className="space-y-5">
                    {participantReportData.map((participant) => (
                      <div
                        key={participant.id}
                        className="report-item-card overflow-hidden rounded-2xl border border-border/60 bg-background/70 shadow-sm transition-all duration-300 hover:border-primary/35 hover:shadow-md"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-muted/30 px-5 py-3.5">
                          <div className="flex items-center gap-3.5">
                            <Avatar className="h-10 w-10 border border-primary/20 bg-primary/10 text-primary">
                              <AvatarFallback className="bg-primary/10 font-headline text-sm font-semibold text-primary">
                                {getInitials(participant.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <h3 className="font-headline text-base font-bold sm:text-lg">{participant.name}</h3>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="rounded-md font-mono text-[11px]">
                                  Chest #{participant.chestNumber}
                                </Badge>
                                <Badge variant="secondary" className="rounded-md text-[11px]">
                                  {participant.categoryName}
                                </Badge>
                              </div>
                            </div>
                          </div>

                          <Badge
                            variant={participant.programs.length > 0 ? 'default' : 'outline'}
                            className="rounded-full px-3 py-1 text-xs font-medium"
                          >
                            {participant.programs.length}{' '}
                            {participant.programs.length === 1 ? 'Program' : 'Programs'}
                          </Badge>
                        </div>

                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/10 hover:bg-muted/10">
                                <TableHead className="pl-5">Program Name</TableHead>
                                <TableHead>Program Category</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead className="pr-5">Mode</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {participant.programs.length > 0 ? (
                                participant.programs.map((program) => (
                                  <TableRow key={program.id} className="hover:bg-primary/[0.03]">
                                    <TableCell className="pl-5 font-medium">{program.name}</TableCell>
                                    <TableCell>
                                      <Badge variant="outline" className="rounded-md font-normal">
                                        {program.categoryName}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="secondary" className="rounded-md capitalize font-normal">
                                        {program.type}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="pr-5">
                                      <Badge
                                        variant="outline"
                                        className={
                                          program.mode?.toLowerCase().includes('stage') &&
                                          !program.mode?.toLowerCase().includes('non') &&
                                          !program.mode?.toLowerCase().includes('off')
                                            ? 'rounded-md border-indigo-500/30 bg-indigo-500/10 capitalize text-indigo-600 dark:text-indigo-300'
                                            : 'rounded-md border-amber-500/30 bg-amber-500/10 capitalize text-amber-700 dark:text-amber-300'
                                        }
                                      >
                                        {program.mode}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                ))
                              ) : (
                                <TableRow>
                                  <TableCell colSpan={4} className="h-20 text-center text-sm text-muted-foreground">
                                    Not assigned to any programs yet.
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/15 px-6 py-14 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                      <Users className="h-6 w-6" />
                    </div>
                    <h3 className="font-headline text-lg font-semibold">No participants match your filters</h3>
                    <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                      {hasParticipantFilters
                        ? 'Try clearing your search query or switching to all member categories.'
                        : 'Add team participants to start viewing participant-based schedules.'}
                    </p>
                    {hasParticipantFilters && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4 rounded-xl"
                        onClick={() => {
                          setParticipantSearch('');
                          setParticipantCategoryFilter('all');
                        }}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Clear filters
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="program" className="mt-0">
            <Card className="overflow-hidden rounded-2xl border-border/60 bg-card/80 shadow-sm backdrop-blur-md">
              <CardHeader className="border-b border-border/50 bg-muted/20 pb-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="font-headline text-xl">Program-Based Report</CardTitle>
                    <CardDescription>
                      View your team&apos;s participant roster grouped by competition program.
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => handleDownloadPDF('program')}
                    disabled={isDownloading}
                    className="rounded-xl shadow-sm"
                  >
                    {downloadingReport === 'program' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Download PDF
                  </Button>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search assigned programs..."
                      value={programSearch}
                      onChange={(e) => setProgramSearch(e.target.value)}
                      className="h-10 rounded-xl border-border/60 bg-background/80 pl-10 pr-9"
                    />
                    {programSearch && (
                      <button
                        type="button"
                        onClick={() => setProgramSearch('')}
                        aria-label="Clear program search"
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <Select value={programCategoryFilter} onValueChange={setProgramCategoryFilter}>
                    <SelectTrigger className="h-10 w-full rounded-xl border-border/60 bg-background/80 sm:w-[240px]">
                      <div className="flex items-center gap-2 truncate">
                        <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <SelectValue placeholder="Filter by category..." />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {programCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {hasProgramFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setProgramSearch('');
                        setProgramCategoryFilter('all');
                      }}
                      className="h-10 rounded-xl px-3 text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      Reset
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-5 sm:p-6">
                {programReportData.length > 0 ? (
                  <div className="space-y-5">
                    {programReportData.map((program) => (
                      <div
                        key={program.id}
                        className="report-item-card overflow-hidden rounded-2xl border border-border/60 bg-background/70 shadow-sm transition-all duration-300 hover:border-indigo-500/35 hover:shadow-md"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-muted/30 px-5 py-3.5">
                          <div className="flex items-center gap-3.5">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-500">
                              <Mic2 className="h-5 w-5" />
                            </div>
                            <div>
                              <h3 className="font-headline text-base font-bold sm:text-lg">{program.name}</h3>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="rounded-md text-[11px]">
                                  {program.categoryName}
                                </Badge>
                                <Badge variant="secondary" className="rounded-md text-[11px] capitalize">
                                  {program.type}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className="rounded-md border-indigo-500/25 bg-indigo-500/10 text-[11px] capitalize text-indigo-600 dark:text-indigo-300"
                                >
                                  {program.mode}
                                </Badge>
                              </div>
                            </div>
                          </div>

                          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs font-medium">
                            {program.participants.length}{' '}
                            {program.participants.length === 1 ? 'Participant' : 'Participants'}
                          </Badge>
                        </div>

                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/10 hover:bg-muted/10">
                                <TableHead className="pl-5">Participant Name</TableHead>
                                <TableHead>Chest Number</TableHead>
                                <TableHead className="pr-5">Participant Category</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {program.participants.length > 0 ? (
                                program.participants.map((participant) => (
                                  <TableRow key={participant.id} className="hover:bg-primary/[0.03]">
                                    <TableCell className="pl-5">
                                      <div className="flex items-center gap-2.5">
                                        <Avatar className="h-7 w-7 border border-border/60 bg-muted">
                                          <AvatarFallback className="text-[11px] font-semibold">
                                            {getInitials(participant.name)}
                                          </AvatarFallback>
                                        </Avatar>
                                        <span className="font-medium">{participant.name}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="outline" className="rounded-md font-mono text-xs">
                                        #{participant.chestNumber}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="pr-5">
                                      <Badge variant="secondary" className="rounded-md font-normal">
                                        {participant.categoryName}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                ))
                              ) : (
                                <TableRow>
                                  <TableCell colSpan={3} className="h-20 text-center text-sm text-muted-foreground">
                                    No participants assigned from your team.
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/15 px-6 py-14 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                      <Layers className="h-6 w-6" />
                    </div>
                    <h3 className="font-headline text-lg font-semibold">No programs match your filters</h3>
                    <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                      {hasProgramFilters
                        ? 'Try clearing your search term or selecting all program categories.'
                        : 'Assign participants to programs first to generate program-based reports.'}
                    </p>
                    {hasProgramFilters && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4 rounded-xl"
                        onClick={() => {
                          setProgramSearch('');
                          setProgramCategoryFilter('all');
                        }}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Clear filters
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
