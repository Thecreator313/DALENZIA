'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  collection,
  query,
  where,
  doc,
  updateDoc,
  setDoc,
} from 'firebase/firestore';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { db } from '@/lib/firebase';
import {
  useCachedCollection,
  useCachedDoc,
  useSharedCollection,
  useAppSettings,
} from '@/context/firestore-cache';
import type { Category } from '@/app/admin/categories/page';
import type { Program } from '@/app/admin/programs/page';
import type { User } from '@/app/admin/access-central/page';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  Loader2,
  ArrowLeft,
  Save,
  Timer,
  Play,
  Pause,
  RefreshCw,
  Ban,
  Lock,
  Volume2,
  VolumeX,
  Plus,
  Minus,
  Sparkles,
  Trophy,
  CheckCircle2,
  Clock,
  Mic2,
  BellRing,
  RotateCcw,
} from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
import { cn } from '@/lib/utils';

type Assignment = {
  id: string;
  programId: string;
  studentId: string;
  teamId: string;
  codeLetter: string;
  status?: 'cancelled';
};

const scoreItemSchema = z.object({
  assignmentId: z.string(),
  scoreId: z.string().optional(),
  codeLetter: z.string(),
  score: z.coerce.number().min(0, 'Score must be at least 0').max(100, 'Score cannot be over 100').optional().nullable(),
  review: z.string().optional(),
  status: z.enum(['cancelled']).optional().nullable(),
});

const formSchema = z.object({
  scores: z.array(scoreItemSchema),
});

const getGrade = (score: number | undefined | null) => {
  if (score === undefined || score === null || isNaN(score)) return { grade: 'N/A', isScored: false };
  if (score > 100 || score < 0) return { grade: 'Error', isScored: true, className: 'bg-red-500 text-white' };
  if (score >= 90) return { grade: 'A+', isScored: true, className: 'bg-emerald-500 text-white' };
  if (score >= 70 && score < 90) return { grade: 'A', isScored: true, className: 'bg-teal-500 text-white' };
  if (score >= 60 && score < 70) return { grade: 'B', isScored: true, className: 'bg-amber-500 text-white' };
  if (score >= 50 && score < 60) return { grade: 'C', isScored: true, className: 'bg-orange-500 text-white' };
  return { grade: 'No Grade', isScored: true, className: 'bg-rose-500 text-white' };
};

const REVIEW_SUGGESTIONS = [
  'Excellent Performance',
  'Great Energy & Stage Presence',
  'Good Rhythm & Modulation',
  'Pitch & Tone on Point',
  'Needs More Practice',
  'Time Limit Exceeded',
];

const TIMER_PRESETS = [3, 5, 7, 10, 15];

/**
 * Web Audio API synthesizer that plays a distinct, resonant festival stage chime sequence.
 */
function playStageAlarmSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;
    const chimeTones = [
      { f: 880, start: 0.0, dur: 0.35 },     // A5
      { f: 1108.73, start: 0.18, dur: 0.4 }, // C#6
      { f: 1318.51, start: 0.38, dur: 0.5 }, // E6
      { f: 1760, start: 0.65, dur: 0.9 },    // A6 final resonance
    ];

    chimeTones.forEach(({ f, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + start);

      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.35, now + start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + start);
      osc.stop(now + start + dur);
    });
  } catch (err) {
    console.warn('Could not play stage timer sound:', err);
  }
}

export default function ProgramJudgingPage() {
  const router = useRouter();
  const params = useParams();
  const programId = params.programId as string;
  const { settings } = useAppSettings();

  const [judge, setJudge] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Timer states
  const [duration, setDuration] = useState(10); // in minutes
  const [customMinutesInput, setCustomMinutesInput] = useState('10');
  const [timeLeft, setTimeLeft] = useState(duration * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isTimeUp, setIsTimeUp] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { scores: [] },
  });

  const { fields, replace } = useFieldArray({
    control: form.control,
    name: 'scores',
  });
  const watchedScores = form.watch('scores');

  useEffect(() => {
    const storedUser = localStorage.getItem('fest-central-user');
    if (storedUser) {
      setJudge(JSON.parse(storedUser));
    } else {
      router.push('/login');
    }
  }, [router]);

  const { data: judgePrograms, loading: judgeProgramsLoading } = useCachedCollection<Program>(
    judge ? `query:judge:programs:${judge.id}` : 'query:judge:programs:none',
    () => query(collection(db, 'programs'), where('judges', 'array-contains', judge!.id)),
    { enabled: !!judge }
  );

  const foundProgramInCache = useMemo(
    () => judgePrograms.find((p) => p.id === programId) ?? null,
    [judgePrograms, programId]
  );

  const { data: fallbackProgram, loading: fallbackLoading } = useCachedDoc<Omit<Program, 'id'>>(
    `doc:program:${programId}`,
    () => doc(db, 'programs', programId),
    { enabled: !!judge && !judgeProgramsLoading && !foundProgramInCache && !!programId, keepAlive: false }
  );

  const { data: categories, loading: catsLoading } = useSharedCollection<Category>(
    'programCategories',
    { enabled: !!judge }
  );

  const program = useMemo<Program | null>(() => {
    const raw =
      foundProgramInCache ??
      (fallbackProgram ? ({ ...fallbackProgram, id: programId } as Program) : null);
    if (!raw) return null;
    const categoryName =
      (raw.categoryId && categories.find((c) => c.id === raw.categoryId)?.name) || 'Unknown';
    return { ...raw, categoryName };
  }, [foundProgramInCache, fallbackProgram, programId, categories]);

  const isJudgingClosed = program?.judgingStatus === 'closed';

  const { data: rawAssignments, loading: assignmentsLoading } = useCachedCollection<Assignment>(
    programId ? `query:program:assignments:${programId}` : 'query:program:assignments:none',
    () => query(collection(db, 'assignments'), where('programId', '==', programId)),
    { enabled: !!judge && !!programId, keepAlive: false }
  );

  const { data: allJudgeScores, loading: scoresLoading } = useCachedCollection<{
    id: string;
    programId: string;
    assignmentId: string;
    judgeId: string;
    score?: number;
    review?: string;
  }>(
    judge ? `query:judge:scores:${judge.id}` : 'query:judge:scores:none',
    () => query(collection(db, 'scores'), where('judgeId', '==', judge!.id)),
    { enabled: !!judge }
  );

  const { getValues, setValue } = form;

  useEffect(() => {
    if (assignmentsLoading || scoresLoading || !judge) return;

    const reportedAssignments = rawAssignments.filter((a) => a.codeLetter);
    const programScores = allJudgeScores.filter((s) => s.programId === programId);
    const scoresMap = new Map(programScores.map((s) => [s.assignmentId, s]));

    const currentRows = getValues('scores') || [];
    const currentByAssignment = new Map(currentRows.map((r) => [r.assignmentId, r]));

    const formScores = [...reportedAssignments]
      .sort((a, b) => a.codeLetter.localeCompare(b.codeLetter))
      .map((assignment) => {
        const existingScore = scoresMap.get(assignment.id);
        const draft = currentByAssignment.get(assignment.id);
        const hasDraftScore = draft && draft.score !== null && draft.score !== undefined && !isNaN(draft.score);
        const hasDraftReview = draft && typeof draft.review === 'string' && draft.review.length > 0;

        return {
          assignmentId: assignment.id,
          scoreId: existingScore?.id,
          codeLetter: assignment.codeLetter,
          score: existingScore?.score ?? (hasDraftScore ? draft.score : null),
          review: existingScore?.review ?? (hasDraftReview ? draft.review : ''),
          status: assignment.status ?? null,
        };
      });

    replace(formScores);
  }, [rawAssignments, allJudgeScores, assignmentsLoading, scoresLoading, judge, programId, replace, getValues]);

  const loading =
    !judge ||
    judgeProgramsLoading ||
    (!foundProgramInCache && fallbackLoading) ||
    catsLoading ||
    assignmentsLoading ||
    scoresLoading;

  // Timer Tick & Alarm sound trigger
  useEffect(() => {
    if (isTimerRunning && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isTimerRunning) {
      setIsTimerRunning(false);
      setIsTimeUp(true);
      if (soundEnabled) {
        playStageAlarmSound();
      }
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning, timeLeft, soundEnabled]);

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    if (!judge || !programId || isJudgingClosed) return;
    setIsSubmitting(true);

    try {
      const scoresToSave = data.scores.filter(
        (item) =>
          item.status !== 'cancelled' &&
          item.score !== null &&
          item.score !== undefined &&
          !isNaN(item.score)
      );

      if (scoresToSave.length === 0) {
        toast({
          title: 'No scores to save',
          description: 'Please enter at least one score before saving.',
          variant: 'destructive',
        });
        setIsSubmitting(false);
        return;
      }

      const promises = scoresToSave.map(async (item) => {
        const scoreData = {
          programId,
          assignmentId: item.assignmentId,
          judgeId: judge.id,
          score: item.score,
          review: item.review || '',
        };

        if (item.scoreId) {
          const scoreDocRef = doc(db, 'scores', item.scoreId);
          return updateDoc(scoreDocRef, scoreData);
        } else {
          const newScoreDocRef = doc(collection(db, 'scores'));
          return setDoc(newScoreDocRef, scoreData);
        }
      });

      await Promise.all(promises);

      toast({
        title: 'Scores Submitted',
        description: 'All participant marks have been saved.',
      });
      router.push('/judges/judging-point');
    } catch (error) {
      console.error('Error submitting scores:', error);
      toast({
        title: 'Submission Failed',
        description: 'Failed to submit scores. Please check network.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTimerStartPause = () => {
    setIsTimerRunning((prev) => !prev);
  };

  const handleTimerReset = () => {
    setIsTimerRunning(false);
    setTimeLeft(Math.round(duration * 60));
  };

  const handleSetPreset = (mins: number) => {
    setDuration(mins);
    setCustomMinutesInput(String(mins));
    setIsTimerRunning(false);
    setTimeLeft(mins * 60);
  };

  const handleCustomDurationChange = (valStr: string) => {
    setCustomMinutesInput(valStr);
    if (valStr.trim() === '') return;
    const parsed = parseFloat(valStr);
    if (!isNaN(parsed) && parsed > 0) {
      setDuration(parsed);
      if (!isTimerRunning) {
        setTimeLeft(Math.round(parsed * 60));
      }
    }
  };

  const handleQuickAddSeconds = (seconds: number) => {
    if (isJudgingClosed) return;
    setTimeLeft((prev) => Math.max(0, prev + seconds));
    toast({
      title: seconds > 0 ? `+${seconds}s Added` : `${seconds}s Adjusted`,
      description: 'Timer duration updated.',
    });
  };

  const handleAddOvertime = (mins = 1) => {
    setTimeLeft((prev) => prev + mins * 60);
    setIsTimeUp(false);
    setIsTimerRunning(true);
    toast({
      title: `Added +${mins} Minute`,
      description: 'Timer extended.',
    });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Quick score steppers
  const handleScoreNudge = (index: number, delta: number) => {
    if (isJudgingClosed) return;
    const current = watchedScores[index]?.score;
    const base = current === null || current === undefined || isNaN(current) ? 50 : current;
    const next = Math.max(0, Math.min(100, base + delta));
    setValue(`scores.${index}.score`, next, { shouldDirty: true });
  };

  const handleQuickSetScore = (index: number, target: number) => {
    if (isJudgingClosed) return;
    setValue(`scores.${index}.score`, target, { shouldDirty: true });
  };

  const handleAppendReviewChip = (index: number, chipText: string) => {
    if (isJudgingClosed) return;
    const existing = watchedScores[index]?.review || '';
    const updated = existing ? `${existing}, ${chipText}` : chipText;
    setValue(`scores.${index}.review`, updated, { shouldDirty: true });
  };

  // Scoring metrics
  const activeEntries = fields.filter((f) => f.status !== 'cancelled');
  const scoredCount = watchedScores.filter(
    (s) => s.status !== 'cancelled' && s.score !== null && s.score !== undefined && !isNaN(s.score)
  ).length;
  const progressPct =
    activeEntries.length > 0 ? Math.round((scoredCount / activeEntries.length) * 100) : 0;

  // Timer visual math
  const totalDurationSeconds = Math.max(1, duration * 60);
  const timerRatio = Math.min(1, Math.max(0, timeLeft / totalDurationSeconds));
  const isUrgent = timeLeft <= 30 && timeLeft > 0;
  const isWarning = timeLeft <= 60 && !isUrgent && timeLeft > 0;

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-5rem)] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading Contestant Code Letters...</p>
      </div>
    );
  }

  if (!program) {
    return (
      <div className="flex h-[calc(100vh-6rem)] items-center justify-center">
        <Card className="max-w-md w-full border-border/60 bg-card/80 p-6 text-center">
          <p className="text-sm text-muted-foreground">Program not found or access restricted.</p>
          <Button asChild className="mt-4" size="sm">
            <Link href="/judges/judging-point">Back to Events</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen space-y-5 sm:space-y-6 pb-12">
      {/* Ambient Glow */}
      <div className="pointer-events-none fixed inset-0 -z-10 h-full w-full overflow-hidden">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-indigo-500/10 blur-[130px]" />
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-cyan-500/10 blur-[130px]" />
      </div>

      {/* Sticky Top Header Bar */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl py-3 border-b border-border/80 -mt-3 -mx-3 px-3 sm:-mt-6 sm:-mx-6 sm:px-6 mb-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => router.push('/judges/judging-point')}
              className="h-9 w-9 shrink-0 rounded-xl"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-xl font-bold font-headline truncate">{program.name}</h1>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0.2 shrink-0 hidden sm:inline-flex">
                  {program.categoryName}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span className="sm:hidden">{program.categoryName} •</span>
                <span className="font-semibold text-foreground">
                  {scoredCount} of {activeEntries.length} Scored
                </span>
                <span>({progressPct}%)</span>
              </div>
            </div>
          </div>

          {/* Quick Progress Bar on Header */}
          <div className="flex items-center gap-3 self-end sm:self-auto w-full sm:w-auto">
            <div className="h-2 w-full sm:w-36 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {isJudgingClosed && (
              <Badge variant="destructive" className="text-xs px-2 py-0.5 shrink-0">
                <Lock className="mr-1 h-3 w-3" /> Closed
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Festival Stage Timer Console */}
      <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-border/70 bg-card/80 p-4 sm:p-5 shadow-lg backdrop-blur-xl">
        <div
          className={cn(
            'pointer-events-none absolute inset-0 transition-opacity duration-700',
            isUrgent
              ? 'bg-rose-500/10'
              : isWarning
              ? 'bg-amber-500/10'
              : 'bg-indigo-500/5'
          )}
        />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left: Timer Dial & Display */}
          <div className="flex items-center gap-4">
            {/* Animated Gauge Ring */}
            <div className="relative flex h-16 w-16 sm:h-20 sm:w-20 shrink-0 items-center justify-center">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 44 44">
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  className="stroke-muted fill-none"
                  strokeWidth="3.5"
                />
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  className={cn(
                    'fill-none transition-all duration-500',
                    isUrgent
                      ? 'stroke-rose-500'
                      : isWarning
                      ? 'stroke-amber-500'
                      : 'stroke-indigo-500'
                  )}
                  strokeWidth="3.5"
                  strokeDasharray={113.1}
                  strokeDashoffset={113.1 * (1 - timerRatio)}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <Timer
                  className={cn(
                    'h-6 w-6 sm:h-7 sm:w-7 transition-colors',
                    isUrgent
                      ? 'text-rose-500 animate-ping'
                      : isWarning
                      ? 'text-amber-500'
                      : 'text-indigo-500'
                  )}
                />
              </div>
            </div>

            {/* Digits & Status */}
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'font-mono text-3xl sm:text-4xl font-extrabold tracking-tight transition-colors',
                    isUrgent
                      ? 'text-rose-500 animate-pulse'
                      : isWarning
                      ? 'text-amber-500'
                      : 'text-foreground'
                  )}
                >
                  {formatTime(timeLeft)}
                </span>
                {isTimerRunning && (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isTimerRunning
                  ? 'Performance in progress...'
                  : timeLeft === 0
                  ? 'Time limit completed!'
                  : 'Stage timer ready'}
              </p>
            </div>
          </div>

          {/* Center: Presets, Custom Manual Input & Quick Seconds */}
          <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
            {/* Presets */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase text-muted-foreground">Presets:</span>
              <div className="flex items-center gap-1">
                {TIMER_PRESETS.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    disabled={isTimerRunning || isJudgingClosed}
                    onClick={() => handleSetPreset(mins)}
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-xs font-semibold font-mono border transition-all active:scale-95',
                      duration === mins
                        ? 'border-indigo-500 bg-indigo-500 text-white shadow-sm'
                        : 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Manual Time Input */}
            <div className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-background/80 px-2 py-0.5 shadow-sm backdrop-blur-md">
              <span className="text-[11px] font-medium text-muted-foreground">Custom:</span>
              <Input
                type="number"
                min="0.5"
                max="180"
                step="any"
                inputMode="decimal"
                disabled={isTimerRunning || isJudgingClosed}
                value={customMinutesInput}
                onChange={(e) => handleCustomDurationChange(e.target.value)}
                placeholder="Mins"
                className="h-7 w-14 text-center font-mono text-xs font-bold rounded-lg border-border/50 bg-muted/30 px-1 py-0 focus-visible:ring-1 focus-visible:ring-indigo-500"
              />
              <span className="text-[11px] font-semibold text-foreground">min</span>
            </div>

            {/* In-Flight Quick Adjust */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={isJudgingClosed}
                onClick={() => handleQuickAddSeconds(30)}
                className="rounded-lg border border-border/60 bg-muted/30 hover:bg-muted px-2 py-1 text-[11px] font-mono font-medium text-muted-foreground transition-all active:scale-95"
                title="Add 30 seconds"
              >
                +30s
              </button>
              <button
                type="button"
                disabled={isJudgingClosed}
                onClick={() => handleQuickAddSeconds(60)}
                className="rounded-lg border border-border/60 bg-muted/30 hover:bg-muted px-2 py-1 text-[11px] font-mono font-medium text-muted-foreground transition-all active:scale-95"
                title="Add 1 minute"
              >
                +1m
              </button>
            </div>
          </div>

          {/* Right: Controls & Sound Toggle */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setSoundEnabled((prev) => !prev)}
              className="h-10 w-10 rounded-xl border-border/60"
              title={soundEnabled ? 'Alarm Sound: Enabled' : 'Alarm Sound: Muted'}
            >
              {soundEnabled ? (
                <Volume2 className="h-4 w-4 text-indigo-500" />
              ) : (
                <VolumeX className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleTimerReset}
              disabled={isJudgingClosed}
              className="h-10 w-10 rounded-xl border-border/60"
              title="Reset Timer"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              onClick={handleTimerStartPause}
              disabled={isJudgingClosed}
              className={cn(
                'h-10 px-4 rounded-xl font-semibold text-xs sm:text-sm shadow-md transition-all active:scale-95 text-white',
                isTimerRunning
                  ? 'bg-amber-600 hover:bg-amber-500'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-95'
              )}
            >
              {isTimerRunning ? (
                <>
                  <Pause className="mr-1.5 h-4 w-4" /> Pause
                </>
              ) : (
                <>
                  <Play className="mr-1.5 h-4 w-4" /> Start Timer
                </>
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* Closed Banner */}
      {isJudgingClosed && (
        <div className="p-4 bg-yellow-100 dark:bg-yellow-900/50 border border-yellow-300 dark:border-yellow-700 rounded-2xl flex items-center gap-3">
          <Lock className="h-5 w-5 text-yellow-700 dark:text-yellow-300 shrink-0" />
          <div className="text-yellow-800 dark:text-yellow-200 text-xs sm:text-sm">
            <h3 className="font-bold">Judging Closed</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              This competition has been concluded by the festival coordinator. Scores are now locked.
            </p>
          </div>
        </div>
      )}

      {/* Scoring Form */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-5">
          {fields.length === 0 ? (
            <Card className="rounded-2xl border-border/60 bg-card/75 backdrop-blur-xl">
              <CardContent className="flex flex-col items-center justify-center py-14 text-center">
                <Trophy className="h-10 w-10 text-muted-foreground/35 mb-2" />
                <p className="font-semibold text-base">No Contestants Reported Yet</p>
                <p className="text-xs text-muted-foreground max-w-sm mt-1">
                  Once Stage Control scans or checks in contestants, their anonymous Code Letters will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Accordion type="single" collapsible className="w-full space-y-3">
              {fields.map((field, index) => {
                const currentScore = watchedScores[index]?.score;
                const scoreInfo = getGrade(currentScore);
                const isCancelled = field.status === 'cancelled';

                return (
                  <AccordionItem
                    value={`item-${index}`}
                    key={field.id}
                    className="border-b-0 rounded-2xl border border-border/60 bg-card/75 overflow-hidden shadow-sm backdrop-blur-xl transition-all duration-200"
                  >
                    <div className={cn('relative', isCancelled && 'bg-muted/60 opacity-60')}>
                      <AccordionTrigger className="hover:no-underline px-4 py-3.5 text-sm sm:text-base">
                        <div className="flex flex-wrap items-center justify-between gap-2 w-full pr-2">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 font-bold text-white shadow-sm font-headline text-lg">
                              {field.codeLetter}
                            </div>
                            <div className="text-left">
                              <span className="font-bold text-sm sm:text-base block">
                                Code Letter {field.codeLetter}
                              </span>
                              <span className="text-xs text-muted-foreground font-mono">
                                Score:{' '}
                                <strong className="text-foreground">
                                  {currentScore === null || currentScore === undefined || isNaN(currentScore)
                                    ? '—'
                                    : currentScore}
                                </strong>
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {isCancelled ? (
                              <Badge variant="destructive" className="text-xs flex items-center gap-1.5">
                                <Ban className="h-3 w-3" /> CANCELLED
                              </Badge>
                            ) : (
                              <Badge
                                variant={scoreInfo.isScored ? 'default' : 'outline'}
                                className={cn(
                                  'text-xs sm:text-sm px-2.5 py-0.5 justify-center rounded-md font-bold',
                                  scoreInfo.className
                                )}
                              >
                                {scoreInfo.grade || 'Not Scored'}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </AccordionTrigger>

                      <AccordionContent>
                        <div className="p-4 sm:p-5 bg-muted/30 border-t border-border/50 space-y-4">
                          {/* Score Input & Quick Nudge Steppers */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                            <FormField
                              control={form.control}
                              name={`scores.${index}.score`}
                              render={({ field: formField }) => (
                                <FormItem className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <FormLabel className="text-xs sm:text-sm font-semibold flex items-center gap-1.5">
                                      <span>Marks (0 - 100)</span>
                                      <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0 border-indigo-500/30 text-indigo-500">
                                        Manual / Custom
                                      </Badge>
                                    </FormLabel>
                                    <span className="text-xs font-mono font-bold text-indigo-500">
                                      Grade: {scoreInfo.grade}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      onClick={() => handleScoreNudge(index, -5)}
                                      disabled={isCancelled || isJudgingClosed}
                                      className="h-11 w-11 rounded-xl shrink-0 font-bold text-xs"
                                      title="-5 marks"
                                    >
                                      -5
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      onClick={() => handleScoreNudge(index, -1)}
                                      disabled={isCancelled || isJudgingClosed}
                                      className="h-11 w-11 rounded-xl shrink-0"
                                      title="-1 mark"
                                    >
                                      <Minus className="h-4 w-4" />
                                    </Button>

                                    <FormControl>
                                      <div className="relative flex-1">
                                        <Input
                                          type="number"
                                          step="any"
                                          inputMode="decimal"
                                          min="0"
                                          max="100"
                                          placeholder="Type marks..."
                                          className="h-11 text-center font-mono text-xl font-extrabold rounded-xl border-border/80 bg-background focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                                          {...formField}
                                          disabled={isCancelled || isJudgingClosed}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === '') {
                                              formField.onChange(null);
                                            } else {
                                              const num = parseFloat(val);
                                              formField.onChange(isNaN(num) ? null : num);
                                            }
                                          }}
                                          value={
                                            formField.value === null ||
                                            formField.value === undefined ||
                                            isNaN(formField.value)
                                              ? ''
                                              : formField.value
                                          }
                                        />
                                        {formField.value !== null && formField.value !== undefined && !isCancelled && !isJudgingClosed && (
                                          <button
                                            type="button"
                                            onClick={() => formField.onChange(null)}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground hover:text-foreground bg-muted/80 px-1.5 py-0.5 rounded font-medium transition-colors"
                                            title="Clear custom marks"
                                          >
                                            Clear
                                          </button>
                                        )}
                                      </div>
                                    </FormControl>

                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      onClick={() => handleScoreNudge(index, +1)}
                                      disabled={isCancelled || isJudgingClosed}
                                      className="h-11 w-11 rounded-xl shrink-0"
                                      title="+1 mark"
                                    >
                                      <Plus className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      onClick={() => handleScoreNudge(index, +5)}
                                      disabled={isCancelled || isJudgingClosed}
                                      className="h-11 w-11 rounded-xl shrink-0 font-bold text-xs"
                                      title="+5 marks"
                                    >
                                      +5
                                    </Button>
                                  </div>

                                  {/* Quick Score preset chips */}
                                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                    <span className="text-[10px] text-muted-foreground mr-1">Quick:</span>
                                    {[60, 70, 75, 80, 85, 90, 95].map((val) => (
                                      <button
                                        key={val}
                                        type="button"
                                        disabled={isCancelled || isJudgingClosed}
                                        onClick={() => handleQuickSetScore(index, val)}
                                        className={cn(
                                          'px-2 py-0.5 rounded-md text-[11px] font-mono border transition-all active:scale-95',
                                          currentScore === val
                                            ? 'bg-primary text-primary-foreground font-bold'
                                            : 'bg-background hover:bg-muted text-muted-foreground'
                                        )}
                                      >
                                        {val}
                                      </button>
                                    ))}
                                  </div>

                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Remarks Field & Suggestion Chips */}
                            <FormField
                              control={form.control}
                              name={`scores.${index}.review`}
                              render={({ field: formField }) => (
                                <FormItem className="space-y-2">
                                  <FormLabel className="text-xs sm:text-sm font-semibold">
                                    Judges Review / Remarks (Optional)
                                  </FormLabel>
                                  <FormControl>
                                    <Textarea
                                      placeholder="Enter specific comments or appraisal..."
                                      className="rounded-xl resize-none text-xs sm:text-sm h-14"
                                      {...formField}
                                      disabled={isCancelled || isJudgingClosed}
                                    />
                                  </FormControl>

                                  {/* Suggestion Chips */}
                                  <div className="flex flex-wrap items-center gap-1 pt-1">
                                    {REVIEW_SUGGESTIONS.map((chip) => (
                                      <button
                                        key={chip}
                                        type="button"
                                        disabled={isCancelled || isJudgingClosed}
                                        onClick={() => handleAppendReviewChip(index, chip)}
                                        className="text-[10px] rounded-md border border-border/60 bg-background/80 px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-95"
                                      >
                                        + {chip}
                                      </button>
                                    ))}
                                  </div>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      </AccordionContent>

                      {isCancelled && <div className="absolute inset-0 bg-white/40 dark:bg-black/40 cursor-not-allowed" />}
                    </div>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}

          {/* Sticky Save Button floating comfortably above mobile bottom navigation bar */}
          {fields.length > 0 && !isJudgingClosed && (
            <div className="sticky bottom-20 md:bottom-6 z-30 pt-3">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card/90 backdrop-blur-xl p-3.5 shadow-xl">
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>
                    <strong className="text-foreground">{scoredCount}</strong> of{' '}
                    <strong className="text-foreground">{activeEntries.length}</strong> participants scored
                  </span>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/25 h-11 text-xs sm:text-sm font-semibold transition-all hover:opacity-95"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving Marks...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" /> Save All Scores
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </form>
      </Form>

      {/* Time's Up Alarm Dialog */}
      <AlertDialog open={isTimeUp} onOpenChange={setIsTimeUp}>
        <AlertDialogContent className="rounded-2xl border-rose-500/30">
          <AlertDialogHeader>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 mb-2">
              <BellRing className="h-8 w-8 animate-bounce" />
            </div>
            <AlertDialogTitle className="text-center font-headline text-xl">
              Time&apos;s Up!
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-sm">
              The {duration}-minute performance duration for this stage item has elapsed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel
              onClick={() => handleAddOvertime(1)}
              className="rounded-xl border-indigo-500/30 text-indigo-600 dark:text-indigo-400"
            >
              +1 Min Overtime
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => setIsTimeUp(false)}
              className="rounded-xl bg-rose-600 hover:bg-rose-500 text-white"
            >
              Acknowledge &amp; Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
