'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import gsap from 'gsap';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSharedCollection } from '@/context/firestore-cache';
import { AnimatedCounter } from '@/components/animated-counter';
import { ReportingRevealCanvas } from '@/components/reporting-reveal-canvas';
import { ScratchCard } from '@/components/scratch-card';
import { QrScannerDialog } from '@/components/qr-scanner-dialog';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  Loader2,
  Award,
  Check,
  Search,
  MoreVertical,
  Edit,
  Trash,
  Ban,
  RotateCcw,
  Download,
  UserCheck,
  Sparkles,
  Zap,
  Eye,
  X,
  Users,
  List as ListIcon,
  Mic2,
  PackageOpen,
  QrCode,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { Program } from '@/app/admin/programs/page';
import type { Participant } from '@/app/teams/add-participants/page';
import type { Team } from '@/app/admin/teams/page';
import type { Category } from '@/app/admin/categories/page';

type Assignment = {
  id: string;
  programId: string;
  studentId: string;
  teamId: string;
  codeLetter?: string;
  codeRevealed?: boolean;
  status?: 'cancelled';
};

type ParticipantWithAssignment = Participant & {
  assignmentId: string;
  codeLetter?: string;
  codeRevealed?: boolean;
  teamName: string;
  status?: 'cancelled';
};

const generateCodePool = (count: number): string[] => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const pool: string[] = [];
  for (let i = 0; i < count; i++) {
    if (i < 26) {
      pool.push(alphabet[i]);
    } else {
      const first = alphabet[Math.floor((i - 26) / 26) % 26];
      const second = alphabet[(i - 26) % 26];
      pool.push(`${first}${second}`);
    }
  }
  return pool;
};

export default function StageControlProgramReportingSubPage() {
  const params = useParams<{ programId: string }>();
  const programId = params?.programId;

  const { data: rawPrograms, loading: progsLoading } = useSharedCollection<Program>('programs');
  const { data: programCategories, loading: catsLoading } = useSharedCollection<Category>('programCategories');
  const { data: teams, loading: teamsLoading } = useSharedCollection<Team>('teams');
  const { data: students, loading: studentsLoading } = useSharedCollection<Participant>('students');
  const { data: assignments, loading: assignmentsLoading } = useSharedCollection<Assignment>('assignments');

  const [searchQuery, setSearchQuery] = useState('');
  const [quickChestInput, setQuickChestInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'reported' | 'cancelled'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'team'>('list');

  const [reportingId, setReportingId] = useState<string | null>(null);
  const [isBatchReporting, setIsBatchReporting] = useState(false);
  const [confirmReportAll, setConfirmReportAll] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const [participantToEdit, setParticipantToEdit] = useState<ParticipantWithAssignment | null>(null);
  const [participantToDelete, setParticipantToDelete] = useState<ParticipantWithAssignment | null>(null);
  const [participantToCancel, setParticipantToCancel] = useState<ParticipantWithAssignment | null>(null);
  const [participantToReEnable, setParticipantToReEnable] = useState<ParticipantWithAssignment | null>(null);

  // Animated Scratch Card Reveal Popup state
  const [revealAssignmentId, setRevealAssignmentId] = useState<string | null>(null);
  const [isScratchRevealed, setIsScratchRevealed] = useState(false);
  const [revealTrigger, setRevealTrigger] = useState(0);
  const revealPopupRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const loading = progsLoading || catsLoading || teamsLoading || studentsLoading || assignmentsLoading;

  const program = useMemo(() => {
    if (!programId) return null;
    const found = rawPrograms.find((p) => p.id === programId);
    if (!found) return null;

    const categoryMap = new Map(programCategories.map((c) => [c.id, c.name]));
    const teamMap = new Map(teams.map((t) => [t.id, t.name]));
    const studentMap = new Map(students.map((s) => [s.id, s]));

    const allParticipants = assignments
      .filter((a) => a.programId === programId)
      .map((assignment) => {
        const student = studentMap.get(assignment.studentId);
        return student
          ? ({
              ...student,
              assignmentId: assignment.id,
              codeLetter: assignment.codeLetter,
              codeRevealed: assignment.codeRevealed,
              teamName: teamMap.get(assignment.teamId) || 'Unknown Team',
              status: assignment.status,
            } as ParticipantWithAssignment)
          : null;
      })
      .filter(Boolean) as ParticipantWithAssignment[];

    return {
      ...found,
      categoryName: categoryMap.get(found.categoryId) || 'Unknown Category',
      allParticipants,
    };
  }, [programId, rawPrograms, programCategories, teams, students, assignments]);

  const revealParticipant = useMemo(
    () =>
      revealAssignmentId && program
        ? program.allParticipants.find((p) => p.assignmentId === revealAssignmentId) ?? null
        : null,
    [revealAssignmentId, program]
  );

  // GSAP pop-in for the animated scratch card popup
  useEffect(() => {
    const el = revealPopupRef.current;
    if (!el || !revealParticipant) return;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    gsap.fromTo(
      el,
      { scale: 0.78, y: 24, opacity: 0 },
      { scale: 1, y: 0, opacity: 1, duration: 0.55, ease: 'elastic.out(1, 0.7)' }
    );
  }, [revealParticipant?.assignmentId]);

  // GSAP stagger for participant rows
  useEffect(() => {
    const container = listRef.current;
    if (!container || loading || !program) return;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const rows = container.querySelectorAll('.reporting-row');
    if (!rows.length) return;
    gsap.fromTo(
      rows,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.3, stagger: 0.025, ease: 'power2.out', clearProps: 'transform' }
    );
  }, [loading, viewMode, program?.id]);

  const stats = useMemo(() => {
    if (!program) {
      return {
        total: 0,
        activeCount: 0,
        reportedCount: 0,
        pendingCount: 0,
        cancelledCount: 0,
        availableCodes: [] as string[],
        percent: 0,
      };
    }
    const active = program.allParticipants.filter((p) => p.status !== 'cancelled');
    const reported = active.filter((p) => !!p.codeLetter);
    const pending = active.filter((p) => !p.codeLetter);
    const cancelled = program.allParticipants.filter((p) => p.status === 'cancelled');

    const pool = generateCodePool(program.allParticipants.length);
    const usedCodes = new Set(program.allParticipants.map((p) => p.codeLetter).filter(Boolean) as string[]);
    const availableCodes = pool.filter((c) => !usedCodes.has(c));
    const percent = active.length > 0 ? Math.round((reported.length / active.length) * 100) : 0;

    return {
      total: program.allParticipants.length,
      activeCount: active.length,
      reportedCount: reported.length,
      pendingCount: pending.length,
      cancelledCount: cancelled.length,
      availableCodes,
      percent,
    };
  }, [program]);

  const filteredParticipants = useMemo(() => {
    if (!program) return [];
    const q = searchQuery.trim().toLowerCase();

    return [...program.allParticipants]
      .filter((p) => {
        if (statusFilter === 'pending' && (p.status === 'cancelled' || !!p.codeLetter)) return false;
        if (statusFilter === 'reported' && (p.status === 'cancelled' || !p.codeLetter)) return false;
        if (statusFilter === 'cancelled' && p.status !== 'cancelled') return false;

        if (q) {
          const matches =
            p.name.toLowerCase().includes(q) ||
            String(p.chestNumber).toLowerCase().includes(q) ||
            p.teamName.toLowerCase().includes(q) ||
            (p.codeLetter || '').toLowerCase().includes(q);
          if (!matches) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.status === 'cancelled' && b.status !== 'cancelled') return 1;
        if (a.status !== 'cancelled' && b.status === 'cancelled') return -1;
        if (a.codeLetter && !b.codeLetter) return -1;
        if (!a.codeLetter && b.codeLetter) return 1;
        if (a.codeLetter && b.codeLetter) return a.codeLetter.localeCompare(b.codeLetter);
        return a.chestNumber - b.chestNumber;
      });
  }, [program, searchQuery, statusFilter]);

  const groupedByTeam = useMemo(() => {
    const groups = new Map<string, { teamName: string; participants: ParticipantWithAssignment[] }>();
    for (const p of filteredParticipants) {
      const existing = groups.get(p.teamId);
      if (existing) {
        existing.participants.push(p);
      } else {
        groups.set(p.teamId, { teamName: p.teamName, participants: [p] });
      }
    }
    return Array.from(groups.entries()).map(([teamId, data]) => {
      const active = data.participants.filter((p) => p.status !== 'cancelled');
      const reported = active.filter((p) => !!p.codeLetter);
      return {
        teamId,
        teamName: data.teamName,
        participants: data.participants,
        activeCount: active.length,
        reportedCount: reported.length,
      };
    });
  }, [filteredParticipants]);

  const openRevealPopup = (assignmentId: string) => {
    setRevealAssignmentId(assignmentId);
    setIsScratchRevealed(false);
    setRevealTrigger((c) => c + 1);
  };

  const markCodeRevealed = async (assignmentId: string) => {
    setIsScratchRevealed(true);
    setRevealTrigger((c) => c + 1);
    try {
      await updateDoc(doc(db, 'assignments', assignmentId), { codeRevealed: true });
    } catch (err) {
      console.error('Failed to persist codeRevealed state:', err);
    }
  };

  const handleReport = async (participant: ParticipantWithAssignment) => {
    if (!program) return;
    if (participant.codeLetter) {
      openRevealPopup(participant.assignmentId);
      return;
    }

    setReportingId(participant.assignmentId);
    try {
      const programAssignmentsQuery = query(
        collection(db, 'assignments'),
        where('programId', '==', program.id)
      );
      const snapshot = await getDocs(programAssignmentsQuery);
      const existingCodes = snapshot.docs.map((d) => d.data().codeLetter).filter(Boolean);

      const codeLetterPool = generateCodePool(program.allParticipants.length);
      const availableLetters = codeLetterPool.filter((l) => !existingCodes.includes(l));

      if (availableLetters.length === 0) {
        throw new Error('No available code letters left for this program.');
      }

      const randomIndex = Math.floor(Math.random() * availableLetters.length);
      const newCodeLetter = availableLetters[randomIndex];

      const assignmentDocRef = doc(db, 'assignments', participant.assignmentId);
      await updateDoc(assignmentDocRef, { codeLetter: newCodeLetter, codeRevealed: false, status: null });

      openRevealPopup(participant.assignmentId);
    } catch (error) {
      console.error('Failed to assign code letter:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      toast({
        title: 'Error',
        description: `Failed to assign code. ${errorMessage}`,
        variant: 'destructive',
      });
    } finally {
      setReportingId(null);
    }
  };

  const handleQuickCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!program) return;
    const raw = quickChestInput.trim().toLowerCase();
    if (!raw) return;

    const activePending = program.allParticipants.filter(
      (p) => p.status !== 'cancelled' && !p.codeLetter
    );
    const exactChest = activePending.find((p) => String(p.chestNumber).toLowerCase() === raw);
    const nameMatches = activePending.filter((p) => p.name.toLowerCase().includes(raw));
    const target = exactChest || (nameMatches.length === 1 ? nameMatches[0] : null);

    if (!target) {
      const alreadyReported = program.allParticipants.find(
        (p) => String(p.chestNumber).toLowerCase() === raw && !!p.codeLetter
      );
      if (alreadyReported) {
        openRevealPopup(alreadyReported.assignmentId);
        setQuickChestInput('');
        return;
      }
      toast({
        title: 'No Unique Match',
        description:
          nameMatches.length > 1
            ? `Found ${nameMatches.length} pending participants matching "${quickChestInput}". Please enter exact Chest #.`
            : `No pending participant found for "${quickChestInput}".`,
        variant: 'destructive',
      });
      return;
    }

    setQuickChestInput('');
    await handleReport(target);
  };

  const handleQrScan = async (scannedValue: string) => {
    if (!program) return;
    const cleaned = scannedValue.trim();
    const matched = program.allParticipants.find(
      (p) => String(p.chestNumber).toLowerCase() === cleaned.toLowerCase()
    );

    if (!matched) {
      toast({
        title: 'Participant Not Found',
        description: `Chest #${cleaned} is not registered in ${program.name}.`,
        variant: 'destructive',
      });
      return;
    }

    if (matched.status === 'cancelled') {
      toast({
        title: 'Participant Cancelled',
        description: `${matched.name} (#${matched.chestNumber}) is marked as cancelled. Re-enable them first to report.`,
        variant: 'destructive',
      });
      return;
    }

    if (matched.codeLetter) {
      toast({
        title: 'Already Reported',
        description: `${matched.name} (#${matched.chestNumber}) already has code ${matched.codeLetter}.`,
      });
      openRevealPopup(matched.assignmentId);
      return;
    }

    await handleReport(matched);
  };

  const handleReportAllPending = async () => {
    if (!program) return;
    setIsBatchReporting(true);
    try {
      const programAssignmentsQuery = query(
        collection(db, 'assignments'),
        where('programId', '==', program.id)
      );
      const snapshot = await getDocs(programAssignmentsQuery);
      const existingCodes = new Set(snapshot.docs.map((d) => d.data().codeLetter).filter(Boolean) as string[]);

      const pendingParticipants = program.allParticipants.filter(
        (p) => p.status !== 'cancelled' && !p.codeLetter
      );

      if (pendingParticipants.length === 0) {
        toast({ title: 'Nothing to Report', description: 'All active participants already have codes.' });
        setConfirmReportAll(false);
        return;
      }

      const pool = generateCodePool(program.allParticipants.length);
      const available = pool.filter((l) => !existingCodes.has(l));

      for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [available[i], available[j]] = [available[j], available[i]];
      }

      if (available.length < pendingParticipants.length) {
        throw new Error('Not enough available code letters for all pending participants.');
      }

      const batch = writeBatch(db);
      pendingParticipants.forEach((participant, idx) => {
        const ref = doc(db, 'assignments', participant.assignmentId);
        batch.update(ref, { codeLetter: available[idx], codeRevealed: false, status: null });
      });

      await batch.commit();
      toast({
        title: 'Batch Reporting Complete',
        description: `Assigned code letters to ${pendingParticipants.length} participant${pendingParticipants.length > 1 ? 's' : ''}.`,
      });
      setConfirmReportAll(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error occurred.';
      toast({ title: 'Batch Error', description: msg, variant: 'destructive' });
    } finally {
      setIsBatchReporting(false);
    }
  };

  const handleDeleteCode = async () => {
    if (!participantToDelete) return;
    try {
      const assignmentRef = doc(db, 'assignments', participantToDelete.assignmentId);
      await updateDoc(assignmentRef, { codeLetter: null, codeRevealed: false });
      toast({
        title: 'Code Removed',
        description: `Code letter for ${participantToDelete.name} has been removed.`,
      });
      setParticipantToDelete(null);
    } catch {
      toast({ title: 'Error', description: 'Failed to delete code letter.', variant: 'destructive' });
    }
  };

  const handleCancelParticipant = async () => {
    if (!participantToCancel) return;
    try {
      const assignmentRef = doc(db, 'assignments', participantToCancel.assignmentId);
      await updateDoc(assignmentRef, { status: 'cancelled' });
      toast({
        title: 'Participant Cancelled',
        description: `${participantToCancel.name} has been marked as cancelled.`,
      });
      setParticipantToCancel(null);
    } catch {
      toast({ title: 'Error', description: 'Failed to cancel participant.', variant: 'destructive' });
    }
  };

  const handleReEnableParticipant = async () => {
    if (!participantToReEnable) return;
    try {
      const assignmentRef = doc(db, 'assignments', participantToReEnable.assignmentId);
      await updateDoc(assignmentRef, { status: null });
      toast({
        title: 'Participant Re-enabled',
        description: `${participantToReEnable.name} has been re-enabled.`,
      });
      setParticipantToReEnable(null);
    } catch {
      toast({ title: 'Error', description: 'Failed to re-enable participant.', variant: 'destructive' });
    }
  };

  const exportCsv = () => {
    if (!program) return;
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm font-medium">Loading Program Reporting...</span>
      </div>
    );
  }

  if (!program) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
        <PackageOpen className="h-14 w-14 text-muted-foreground/60" />
        <div>
          <h2 className="text-xl font-bold">Program Not Found</h2>
          <p className="text-sm text-muted-foreground mt-1">
            The requested program could not be loaded or does not exist.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/stage-control/programs">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Reporting
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Navigation + Program Hero */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/stage-control/programs">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            <span className="hidden xs:inline">Back to All Programs</span>
            <span className="xs:hidden">Back</span>
          </Link>
        </Button>
        <div className="flex items-center gap-2 flex-wrap">
          {stats.reportedCount > 0 && (
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export CSV
            </Button>
          )}
          {stats.pendingCount > 0 && (
            <Button size="sm" onClick={() => setConfirmReportAll(true)}>
              <UserCheck className="mr-1.5 h-3.5 w-3.5" />
              Report All ({stats.pendingCount})
            </Button>
          )}
        </div>
      </div>

      <section className="rounded-2xl border border-border/60 bg-gradient-to-br from-primary/5 via-card/80 to-card/60 backdrop-blur-xl p-4 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {program.categoryName}
              </Badge>
              {program.mode && (
                <Badge variant="outline" className="text-xs capitalize">
                  {program.mode === 'on-stage' ? (
                    <Mic2 className="mr-1 h-3 w-3" />
                  ) : (
                    <Sparkles className="mr-1 h-3 w-3" />
                  )}
                  {program.mode}
                </Badge>
              )}
              {program.type && (
                <Badge variant="outline" className="text-xs capitalize">
                  {program.type}
                </Badge>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-headline tracking-tight">{program.name}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Scan a participant&apos;s ID card QR code (or use Quick Check-In) to assign a code letter and launch the animated scratch card reveal.
            </p>
          </div>

          {/* Quick Check-In Form + Enhanced Scan QR CTA */}
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center w-full lg:w-auto">
            <Button
              type="button"
              className="group relative h-11 px-5 rounded-xl shrink-0 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-600 hover:via-teal-600 hover:to-cyan-600 text-white font-semibold shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 border-0"
              onClick={() => setIsScannerOpen(true)}
            >
              <span className="relative flex h-2.5 w-2.5 mr-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
              </span>
              <QrCode className="mr-2 h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
              Scan QR Code
            </Button>
            <form onSubmit={handleQuickCheckIn} className="flex gap-2 items-center flex-1 lg:min-w-[280px]">
              <div className="relative flex-1">
                <Zap className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-500" />
                <Input
                  placeholder="Quick Check-In: Chest # + Enter"
                  value={quickChestInput}
                  onChange={(e) => setQuickChestInput(e.target.value)}
                  className="pl-9 h-11 rounded-xl bg-background/80 border-amber-500/30 focus-visible:ring-amber-500/40"
                />
              </div>
              <Button type="submit" variant="secondary" className="h-11 rounded-xl shrink-0" disabled={!quickChestInput.trim()}>
                Check In
              </Button>
            </form>
          </div>
        </div>

        {/* KPI Strip + Progress */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border/60 bg-background/60 p-3.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Active</span>
            <div className="text-2xl font-bold font-headline mt-1">
              <AnimatedCounter value={stats.activeCount} />
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/60 p-3.5">
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              Reported
            </span>
            <div className="text-2xl font-bold font-headline mt-1">
              <AnimatedCounter value={stats.reportedCount} />
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/60 p-3.5">
            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              Pending
            </span>
            <div className="text-2xl font-bold font-headline mt-1">
              <AnimatedCounter value={stats.pendingCount} />
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/60 p-3.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              <span>Completion</span>
              <span className="font-mono text-foreground">{stats.percent}%</span>
            </div>
            <Progress value={stats.percent} className="h-2 mt-3" />
          </div>
        </div>
      </section>

      {/* Participants Directory Card */}
      <Card className="border-border/60 bg-card/60 backdrop-blur-xl shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Participants ({filteredParticipants.length})</CardTitle>
              <CardDescription>
                Available codes:{' '}
                <span className="font-mono font-semibold text-foreground">
                  {stats.availableCodes.length > 0
                    ? stats.availableCodes.slice(0, 10).join(', ') +
                      (stats.availableCodes.length > 10 ? ` +${stats.availableCodes.length - 10}` : '')
                    : 'None'}
                </span>
              </CardDescription>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
              <div className="flex flex-wrap rounded-lg border border-border/60 bg-background/70 p-0.5 gap-0.5">
                {(
                  [
                    { key: 'all', label: `All (${stats.total})` },
                    { key: 'pending', label: `Pending (${stats.pendingCount})` },
                    { key: 'reported', label: `Reported (${stats.reportedCount})` },
                    ...(stats.cancelledCount > 0
                      ? [{ key: 'cancelled' as const, label: `Cancelled (${stats.cancelledCount})` }]
                      : []),
                  ] as Array<{ key: 'all' | 'pending' | 'reported' | 'cancelled'; label: string }>
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStatusFilter(tab.key)}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                      statusFilter === tab.key
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="inline-flex rounded-lg border border-border/60 bg-background/70 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                    viewMode === 'list' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
                  )}
                >
                  <ListIcon className="h-3.5 w-3.5" />
                  List
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('team')}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                    viewMode === 'team' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
                  )}
                >
                  <Users className="h-3.5 w-3.5" />
                  By Team
                </button>
              </div>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search participant by name, chest #, team, or code letter..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8 bg-background/70 border-border/60 rounded-xl"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0" ref={listRef}>
          {viewMode === 'team' ? (
            <div className="p-4 space-y-4">
              {groupedByTeam.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No participants match your search or filter.
                </div>
              ) : (
                groupedByTeam.map((group) => (
                  <div key={group.teamId} className="rounded-xl border border-border/60 bg-background/60 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border/50">
                      <span className="font-semibold text-sm">{group.teamName}</span>
                      <Badge variant="secondary" className="text-xs font-mono">
                        {group.reportedCount} / {group.activeCount} reported
                      </Badge>
                    </div>
                    <div className="divide-y divide-border/40">
                      {group.participants.map((participant) => {
                        const isReportingThis = reportingId === participant.assignmentId;
                        const isCodeRevealed = Boolean(participant.codeLetter && participant.codeRevealed !== false);
                        return (
                          <div
                            key={participant.assignmentId}
                            className={cn(
                              'reporting-row flex flex-wrap items-center justify-between gap-3 px-4 py-3',
                              participant.status === 'cancelled' && 'opacity-60 bg-muted/40'
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9">
                                <AvatarFallback className="text-xs font-semibold">
                                  {participant.name.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-semibold text-sm leading-tight">{participant.name}</p>
                                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                  Chest #{participant.chestNumber}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {participant.status === 'cancelled' ? (
                                <>
                                  <Badge variant="destructive">CANCELLED</Badge>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setParticipantToReEnable(participant)}
                                  >
                                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Re-enable
                                  </Button>
                                </>
                              ) : (
                                <>
                                  {participant.codeLetter ? (
                                    <>
                                      {isCodeRevealed ? (
                                        <Badge className="font-mono text-sm px-2.5 py-0.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                          {participant.codeLetter}
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10">
                                          Hidden
                                        </Badge>
                                      )}
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => openRevealPopup(participant.assignmentId)}
                                      >
                                        <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
                                        Scratch Reveal
                                      </Button>
                                    </>
                                  ) : (
                                    <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10">
                                      {isReportingThis ? 'Assigning...' : 'Pending Scan'}
                                    </Badge>
                                  )}

                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      {!participant.codeLetter && (
                                        <>
                                          <DropdownMenuItem
                                            onClick={() => handleReport(participant)}
                                            disabled={isReportingThis || isBatchReporting}
                                          >
                                            <Award className="mr-2 h-4 w-4" /> Report Manually
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                        </>
                                      )}
                                      {participant.codeLetter && (
                                        <>
                                          <DropdownMenuItem onClick={() => setParticipantToEdit(participant)}>
                                            <Edit className="mr-2 h-4 w-4" /> Edit Code
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => setParticipantToDelete(participant)}
                                            className="text-destructive"
                                          >
                                            <Trash className="mr-2 h-4 w-4" /> Delete Code
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                        </>
                                      )}
                                      <DropdownMenuItem
                                        onClick={() => setParticipantToCancel(participant)}
                                        className="text-destructive"
                                      >
                                        <Ban className="mr-2 h-4 w-4" /> Cancel Participant
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <>
              {/* Mobile Card List (< md) */}
              <div className="md:hidden divide-y divide-border/50">
                {filteredParticipants.length === 0 ? (
                  <div className="text-center py-12 px-4 text-muted-foreground text-sm">
                    No participants match your search or filter.
                  </div>
                ) : (
                  filteredParticipants.map((participant) => {
                    const isReportingThis = reportingId === participant.assignmentId;
                    const isCodeRevealed = Boolean(participant.codeLetter && participant.codeRevealed !== false);
                    return (
                      <div
                        key={participant.assignmentId}
                        className={cn(
                          'reporting-row p-4 space-y-3',
                          participant.status === 'cancelled' && 'opacity-60 bg-muted/40'
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar className="h-10 w-10 shrink-0">
                              <AvatarFallback className="text-xs font-semibold">
                                {participant.name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm leading-tight truncate">{participant.name}</p>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                <span className="text-xs text-muted-foreground font-mono">
                                  Chest #{participant.chestNumber}
                                </span>
                                <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0">
                                  {participant.teamName}
                                </Badge>
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {participant.status === 'cancelled' ? (
                              <Badge variant="destructive">CANCELLED</Badge>
                            ) : (
                              <div
                                className={cn(
                                  'w-20 h-12 flex items-center justify-center text-lg font-bold border rounded-md bg-background',
                                  participant.codeLetter && !isCodeRevealed && 'cursor-pointer'
                                )}
                                onClick={() => {
                                  if (participant.codeLetter && !isCodeRevealed) {
                                    openRevealPopup(participant.assignmentId);
                                  }
                                }}
                              >
                                <ScratchCard
                                  key={`mob-${participant.assignmentId}-${isCodeRevealed ? '1' : '0'}`}
                                  width={80}
                                  height={48}
                                  label={participant.codeLetter ? 'Tap' : 'Pending'}
                                  isRevealed={isCodeRevealed}
                                  revealedContent={isCodeRevealed ? <span>{participant.codeLetter}</span> : null}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          {participant.status !== 'cancelled' ? (
                            <>
                              {participant.codeLetter ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1"
                                  onClick={() => openRevealPopup(participant.assignmentId)}
                                >
                                  <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
                                  Scratch Reveal
                                </Button>
                              ) : (
                                <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10 py-1 px-2.5">
                                  {isReportingThis ? 'Assigning...' : 'Pending QR Scan'}
                                </Badge>
                              )}

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="icon" className="h-9 w-9 shrink-0">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {!participant.codeLetter && (
                                    <>
                                      <DropdownMenuItem
                                        onClick={() => handleReport(participant)}
                                        disabled={isReportingThis || isBatchReporting}
                                      >
                                        <Award className="mr-2 h-4 w-4" /> Report Manually
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                    </>
                                  )}
                                  {participant.codeLetter && (
                                    <>
                                      <DropdownMenuItem onClick={() => setParticipantToEdit(participant)}>
                                        <Edit className="mr-2 h-4 w-4" /> Edit Code
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => setParticipantToDelete(participant)}
                                        className="text-destructive"
                                      >
                                        <Trash className="mr-2 h-4 w-4" /> Delete Code
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                    </>
                                  )}
                                  <DropdownMenuItem
                                    onClick={() => setParticipantToCancel(participant)}
                                    className="text-destructive"
                                  >
                                    <Ban className="mr-2 h-4 w-4" /> Cancel Participant
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full"
                              onClick={() => setParticipantToReEnable(participant)}
                            >
                              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Re-enable
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Desktop Table (>= md) */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Participant</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-center">Code Card</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredParticipants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                      No participants match your search or filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredParticipants.map((participant) => {
                    const isReportingThis = reportingId === participant.assignmentId;
                    const isCodeRevealed = Boolean(participant.codeLetter && participant.codeRevealed !== false);
                    return (
                      <TableRow
                        key={participant.assignmentId}
                        className={cn(
                          'reporting-row',
                          participant.status === 'cancelled' && 'opacity-60 bg-muted/40'
                        )}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarFallback className="text-xs font-semibold">
                                {participant.name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold leading-tight">{participant.name}</p>
                              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                Chest #{participant.chestNumber}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {participant.teamName}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {participant.status === 'cancelled' ? (
                            <Badge variant="destructive">CANCELLED</Badge>
                          ) : (
                            <div
                              className={cn(
                                'w-24 h-16 mx-auto flex items-center justify-center text-2xl font-bold border rounded-md bg-background',
                                participant.codeLetter && !isCodeRevealed && 'cursor-pointer'
                              )}
                              onClick={() => {
                                if (participant.codeLetter && !isCodeRevealed) {
                                  openRevealPopup(participant.assignmentId);
                                }
                              }}
                            >
                              <ScratchCard
                                key={`${participant.assignmentId}-${isCodeRevealed ? '1' : '0'}`}
                                label={participant.codeLetter ? 'Scratch' : 'Pending'}
                                isRevealed={isCodeRevealed}
                                revealedContent={isCodeRevealed ? <span>{participant.codeLetter}</span> : null}
                              />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {participant.status !== 'cancelled' ? (
                              <>
                                {participant.codeLetter ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openRevealPopup(participant.assignmentId)}
                                  >
                                    <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
                                    Scratch Reveal
                                  </Button>
                                ) : (
                                  <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10">
                                    {isReportingThis ? 'Assigning...' : 'Pending'}
                                  </Badge>
                                )}

                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {!participant.codeLetter && (
                                      <>
                                        <DropdownMenuItem
                                          onClick={() => handleReport(participant)}
                                          disabled={isReportingThis || isBatchReporting}
                                        >
                                          <Award className="mr-2 h-4 w-4" /> Report Manually
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                      </>
                                    )}
                                    {participant.codeLetter && (
                                      <>
                                        <DropdownMenuItem onClick={() => setParticipantToEdit(participant)}>
                                          <Edit className="mr-2 h-4 w-4" /> Edit Code
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => setParticipantToDelete(participant)}
                                          className="text-destructive"
                                        >
                                          <Trash className="mr-2 h-4 w-4" /> Delete Code
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                      </>
                                    )}
                                    <DropdownMenuItem
                                      onClick={() => setParticipantToCancel(participant)}
                                      className="text-destructive"
                                    >
                                      <Ban className="mr-2 h-4 w-4" /> Cancel Participant
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setParticipantToReEnable(participant)}
                              >
                                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Re-enable
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* QR Code Scanner Dialog */}
      <QrScannerDialog
        open={isScannerOpen}
        onOpenChange={setIsScannerOpen}
        onScan={handleQrScan}
        title={`Scan QR — ${program.name}`}
        description="Scan the participant's ID card QR code (Chest Number) to automatically report them."
      />

      {/* Animated Three.js + GSAP Scratch Card Reveal Popup */}
      <Dialog
        open={!!revealParticipant && !!revealParticipant.codeLetter}
        onOpenChange={(open) => {
          if (!open) {
            setRevealAssignmentId(null);
            setIsScratchRevealed(false);
          }
        }}
      >
        <DialogContent className="w-[94vw] max-w-lg rounded-2xl p-0 overflow-hidden border-primary/30 bg-slate-950 text-white">
          {revealParticipant && revealParticipant.codeLetter && (
            <div ref={revealPopupRef} className="relative">
              <div className="absolute inset-0 pointer-events-none opacity-85">
                <ReportingRevealCanvas revealTrigger={revealTrigger} isRevealed={isScratchRevealed} />
              </div>

              <div className="relative z-10 p-6 flex flex-col items-center text-center space-y-5">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  {isScratchRevealed ? 'Code Letter Revealed!' : 'Scratch Foil to Reveal Your Code'}
                </div>

                <div className="flex flex-col items-center gap-2">
                  <Avatar className="h-14 w-14 border-2 border-amber-400/60 shadow-lg">
                    <AvatarFallback className="bg-indigo-600 text-white text-lg font-bold">
                      {revealParticipant.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <DialogTitle className="text-xl font-bold text-white">
                      {revealParticipant.name}
                    </DialogTitle>
                    <DialogDescription className="text-slate-300 text-xs font-mono mt-0.5">
                      Chest #{revealParticipant.chestNumber} • {revealParticipant.teamName}
                    </DialogDescription>
                  </div>
                </div>

                {/* Large Interactive Metallic Scratch Card */}
                <div className="rounded-2xl border-2 border-amber-400/70 bg-slate-900/95 p-1.5 shadow-2xl">
                  <ScratchCard
                    key={`popup-${revealParticipant.assignmentId}-${revealParticipant.codeLetter}`}
                    width={260}
                    height={132}
                    coverColor="#d97706"
                    scratchColor="#fde68a"
                    label="Scratch Here"
                    isRevealed={isScratchRevealed}
                    onRevealComplete={() => {
                      markCodeRevealed(revealParticipant.assignmentId);
                    }}
                    revealedContent={
                      <div className="flex flex-col items-center justify-center">
                        <span className="text-[11px] uppercase tracking-widest text-emerald-400 font-semibold">
                          Assigned Code
                        </span>
                        <span className="text-5xl font-black tracking-wider text-amber-300 drop-shadow-md">
                          {revealParticipant.codeLetter}
                        </span>
                      </div>
                    }
                  />
                </div>

                <div className="flex items-center justify-center gap-3 w-full pt-1">
                  {!isScratchRevealed && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        markCodeRevealed(revealParticipant.assignmentId);
                      }}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      Quick Reveal
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant={isScratchRevealed ? 'default' : 'outline'}
                    className={!isScratchRevealed ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : ''}
                    onClick={() => {
                      setRevealAssignmentId(null);
                      setIsScratchRevealed(false);
                    }}
                  >
                    Done
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Code Dialog */}
      {participantToEdit && (
        <EditCodeDialog
          participant={participantToEdit}
          allParticipants={program.allParticipants}
          onOpenChange={(open) => !open && setParticipantToEdit(null)}
        />
      )}

      {/* Delete Code Alert */}
      {participantToDelete && (
        <AlertDialog
          open={!!participantToDelete}
          onOpenChange={(open) => !open && setParticipantToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Code Letter?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the code letter for <span className="font-bold">{participantToDelete.name}</span>.
                The letter will become available for other participants in this program.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteCode} className="bg-destructive hover:bg-destructive/90">
                Delete Code
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Cancel Participant Alert */}
      {participantToCancel && (
        <AlertDialog
          open={!!participantToCancel}
          onOpenChange={(open) => !open && setParticipantToCancel(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel Participant?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to cancel <span className="font-bold">{participantToCancel.name}</span>? They
                will not be able to be scored by judges. This action can be reversed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Close</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCancelParticipant}
                className="bg-destructive hover:bg-destructive/90"
              >
                Yes, Cancel
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Re-enable Participant Alert */}
      {participantToReEnable && (
        <AlertDialog
          open={!!participantToReEnable}
          onOpenChange={(open) => !open && setParticipantToReEnable(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Re-enable Participant?</AlertDialogTitle>
              <AlertDialogDescription>
                This will make <span className="font-bold">{participantToReEnable.name}</span> available for
                reporting and judging again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Close</AlertDialogCancel>
              <AlertDialogAction onClick={handleReEnableParticipant}>Yes, Re-enable</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Report All Pending Alert */}
      <AlertDialog open={confirmReportAll} onOpenChange={setConfirmReportAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Report All Pending Participants?</AlertDialogTitle>
            <AlertDialogDescription>
              This will randomly assign unique code letters to all{' '}
              <span className="font-bold">{stats.pendingCount}</span> pending active participants in{' '}
              <span className="font-bold">{program.name}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBatchReporting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReportAllPending} disabled={isBatchReporting}>
              {isBatchReporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Assigning...
                </>
              ) : (
                'Confirm & Assign All'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface EditCodeDialogProps {
  participant: ParticipantWithAssignment;
  allParticipants: ParticipantWithAssignment[];
  onOpenChange: (isOpen: boolean) => void;
}

function EditCodeDialog({ participant, allParticipants, onOpenChange }: EditCodeDialogProps) {
  const [newCode, setNewCode] = useState(participant.codeLetter || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const codeLetterPool = useMemo(() => generateCodePool(allParticipants.length), [allParticipants.length]);
  const usedLetters = useMemo(
    () =>
      new Set(
        allParticipants
          .filter((p) => p.id !== participant.id && p.codeLetter)
          .map((p) => p.codeLetter as string)
      ),
    [allParticipants, participant.id]
  );
  const availableLetters = useMemo(
    () => codeLetterPool.filter((l) => !usedLetters.has(l)),
    [codeLetterPool, usedLetters]
  );

  const handleSave = async () => {
    setError('');
    const newCodeUpper = newCode.trim().toUpperCase();

    if (!newCodeUpper) {
      setError('Code letter cannot be empty.');
      return;
    }

    if (!codeLetterPool.includes(newCodeUpper)) {
      setError(
        `Please enter a valid code from ${codeLetterPool[0]} to ${codeLetterPool[codeLetterPool.length - 1]}.`
      );
      return;
    }

    if (usedLetters.has(newCodeUpper)) {
      setError(`The code ${newCodeUpper} is already in use for this program.`);
      return;
    }

    setSaving(true);
    try {
      const assignmentRef = doc(db, 'assignments', participant.assignmentId);
      await updateDoc(assignmentRef, { codeLetter: newCodeUpper });
      toast({ title: 'Success', description: 'Code letter updated successfully.' });
      onOpenChange(false);
    } catch {
      toast({ title: 'Error', description: 'Failed to update code letter.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Code for {participant.name}</DialogTitle>
          <DialogDescription>
            Enter or pick an available unique code letter for this participant.
          </DialogDescription>
        </DialogHeader>
        <div className="py-3 space-y-4">
          <Input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toUpperCase())}
            maxLength={2}
            className="text-2xl text-center font-bold h-16 tracking-widest"
          />

          {availableLetters.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Available codes (click to select):</p>
              <div className="flex flex-wrap gap-1.5">
                {availableLetters.map((letter) => (
                  <Button
                    key={letter}
                    type="button"
                    size="sm"
                    variant={newCode.toUpperCase() === letter ? 'default' : 'outline'}
                    className="h-7 px-2.5 font-mono text-xs"
                    onClick={() => {
                      setNewCode(letter);
                      setError('');
                    }}
                  >
                    {letter}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={saving}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

