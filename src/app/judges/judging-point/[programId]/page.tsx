
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection,
  query,
  where,
  getFirestore,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { app } from '@/lib/firebase';
import type { Program } from '@/app/admin/programs/page';
import type { User } from '@/app/admin/access-central/page';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Save, Timer, Play, Pause, RefreshCw, Ban, Lock } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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


const db = getFirestore(app);

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
  score: z.coerce.number().min(0, "Score must be at least 0").max(100, "Score cannot be over 100").optional().nullable(),
  review: z.string().optional(),
  status: z.enum(['cancelled']).optional().nullable(),
});

const formSchema = z.object({
  scores: z.array(scoreItemSchema),
});


const getGrade = (score: number | undefined | null) => {
    if (score === undefined || score === null || isNaN(score)) return { grade: 'N/A', isScored: false };
    if (score > 100 || score < 0) return { grade: 'Error', isScored: true, className: 'bg-red-500' };
    if (score >= 90) return { grade: 'A+', isScored: true, className: 'bg-green-500' };
    if (score >= 70 && score < 90) return { grade: 'A', isScored: true, className: 'bg-green-400' };
    if (score >= 60 && score < 70) return { grade: 'B', isScored: true, className: 'bg-yellow-500' };
    if (score >= 50 && score < 60) return { grade: 'C', isScored: true, className: 'bg-orange-500' };
    return { grade: 'No Grade', isScored: true, className: 'bg-red-400' };
}

export default function ProgramJudgingPage() {
  const router = useRouter();
  const params = useParams();
  const programId = params.programId as string;

  const [program, setProgram] = useState<Program | null>(null);
  const [judge, setJudge] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Timer state
  const [duration, setDuration] = useState(10); // Default duration in minutes
  const [timeLeft, setTimeLeft] = useState(duration * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isTimeUp, setIsTimeUp] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { scores: [] },
  });
  
  const { fields, replace } = useFieldArray({
      control: form.control,
      name: "scores",
  });
  const watchedScores = form.watch('scores');
  const isJudgingClosed = program?.judgingStatus === 'closed';

  useEffect(() => {
    const storedUser = localStorage.getItem('fest-central-user');
    if (storedUser) {
      setJudge(JSON.parse(storedUser));
    } else {
      router.push('/login');
    }
  }, [router]);

  useEffect(() => {
    if (!judge || !programId) return;

    setLoading(true);
    let unsubscribeAll: (() => void)[] = [];

    const fetchAndListen = async () => {
        try {
            const programDocRef = doc(db, 'programs', programId);
            const unsubProgram = onSnapshot(programDocRef, async (programDoc) => {
              if (programDoc.exists()) {
                  const programData = programDoc.data() as Omit<Program, 'id'>;
                  const catDoc = await getDoc(doc(db, 'programCategories', programData.categoryId));
                  const categoryName = catDoc.exists() ? catDoc.data().name : "Unknown";
                  setProgram({ ...programData, id: programDoc.id, categoryName });
              } else {
                  toast({ title: 'Error', description: 'Program not found.', variant: 'destructive' });
                  setLoading(false);
              }
            });
            unsubscribeAll.push(unsubProgram);


            const assignmentsQuery = query(collection(db, 'assignments'), where('programId', '==', programId));
            const assignmentsUnsubscribe = onSnapshot(assignmentsQuery, async (assignmentsSnapshot) => {
                const assignments = assignmentsSnapshot.docs
                    .map(d => ({id: d.id, ...d.data()}) as Assignment)
                    .filter(a => a.codeLetter);

                const scoresQuery = query(collection(db, 'scores'), where('programId', '==', programId), where('judgeId', '==', judge.id));
                const scoresUnsubscribe = onSnapshot(scoresQuery, (scoresSnapshot) => {
                    const scoresMap = new Map(scoresSnapshot.docs.map(s => [s.data().assignmentId, {id: s.id, ...s.data()}]));
                    
                    const formScores = assignments
                        .sort((a, b) => a.codeLetter.localeCompare(b.codeLetter))
                        .map(assignment => {
                            const existingScore = scoresMap.get(assignment.id);
                            return {
                                assignmentId: assignment.id,
                                scoreId: existingScore?.id,
                                codeLetter: assignment.codeLetter,
                                score: existingScore?.score ?? null,
                                review: existingScore?.review ?? '',
                                status: assignment.status ?? null,
                            };
                        });
                    
                    replace(formScores);
                    setLoading(false);
                });
                unsubscribeAll.push(scoresUnsubscribe);

            }, (error) => {
                console.error("Error fetching assignments:", error);
                toast({ title: 'Error', description: 'Could not load real-time assignment data.', variant: 'destructive' });
                setLoading(false);
            });
            unsubscribeAll.push(assignmentsUnsubscribe);

        } catch (e) {
            console.error(e);
            toast({ title: 'Error', description: 'Failed to load program details.', variant: 'destructive' });
            setLoading(false);
        }
    };

    fetchAndListen();

    return () => {
        unsubscribeAll.forEach(unsub => unsub());
    };
  }, [judge, programId, replace]);

  useEffect(() => {
    if (isTimerRunning && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prevTime) => prevTime - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsTimerRunning(false);
      setIsTimeUp(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning, timeLeft]);


  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    if (!judge || !programId || isJudgingClosed) return;
    setIsSubmitting(true);

    try {
        const scoresToSave = data.scores.filter(item => 
            item.status !== 'cancelled' && 
            item.score !== null && 
            item.score !== undefined && 
            !isNaN(item.score)
        );

        if(scoresToSave.length === 0){
             toast({
                title: "No scores to save",
                description: "Please enter at least one score before saving.",
                variant: 'destructive'
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
            title: "Scores Submitted",
            description: "Your scores have been saved.",
        });
        router.push('/judges/judging-point');

    } catch (error) {
        console.error("Error submitting scores:", error);
        toast({
            title: "Error",
            description: "Failed to submit scores.",
            variant: "destructive",
        });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const handleTimerStartPause = () => {
    setIsTimerRunning(!isTimerRunning);
  };

  const handleTimerReset = () => {
    setIsTimerRunning(false);
    setTimeLeft(duration * 60);
  };
  
  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newDuration = Number(e.target.value);
      if (newDuration > 0) {
          setDuration(newDuration);
          if (!isTimerRunning) {
              setTimeLeft(newDuration * 60);
          }
      }
  };
  
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="mr-2 h-8 w-8 animate-spin" />
        <span>Loading Participants...</span>
      </div>
    );
  }

  if (!program) {
    return <div>Program not found.</div>;
  }

  return (
    <div className="space-y-6">
       <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-4 border-b -mt-6 -mx-6 px-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="icon" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-xl md:text-2xl font-bold font-headline">{program.name}</h1>
                <p className="text-sm text-muted-foreground">{program.categoryName}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <Timer className="h-5 w-5 text-muted-foreground" />
                  <Input 
                      type="number"
                      value={duration}
                      onChange={handleDurationChange}
                      className="w-20 h-9"
                      disabled={isTimerRunning || isJudgingClosed}
                  />
                </div>
                <div className="text-2xl font-mono font-bold text-center w-28">{formatTime(timeLeft)}</div>
                <div className="flex items-center gap-2">
                    <Button onClick={handleTimerStartPause} variant="outline" size="icon" className="h-9 w-9" disabled={isJudgingClosed}>
                        {isTimerRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button onClick={handleTimerReset} variant="outline" size="icon" className="h-9 w-9" disabled={isJudgingClosed}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </div>
          </div>
       </div>

        {isJudgingClosed && (
            <div className="p-4 bg-yellow-100 dark:bg-yellow-900/50 border border-yellow-300 dark:border-yellow-700 rounded-md flex items-center gap-3">
                <Lock className="h-5 w-5 text-yellow-700 dark:text-yellow-300"/>
                <div className="text-yellow-800 dark:text-yellow-200">
                    <h3 className="font-bold">Judging Closed</h3>
                    <p className="text-sm">This program has been closed by an admin. Scores can no longer be edited.</p>
                </div>
            </div>
        )}

        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                 {fields.length === 0 ? (
                    <Card>
                        <CardContent className="pt-6">
                            <p className="text-center text-muted-foreground py-10">No participants have reported for this program yet.</p>
                        </CardContent>
                    </Card>
                 ) : (
                    <Accordion type="single" collapsible className="w-full space-y-2">
                        {fields.map((field, index) => {
                            const currentScore = watchedScores[index]?.score;
                            const scoreInfo = getGrade(currentScore);
                             return (
                                <AccordionItem value={`item-${index}`} key={field.id} className="border-b-0 rounded-lg border overflow-hidden">
                                     <div className={cn("relative", field.status === 'cancelled' && "bg-muted/60")}>
                                        <AccordionTrigger className="hover:no-underline px-4 py-3 text-base">
                                            <div className="flex justify-between items-center w-full">
                                                <div className="flex items-center gap-4">
                                                    <span className="font-semibold w-24 text-left">Code: {field.codeLetter}</span>
                                                    <span className="text-sm text-muted-foreground font-mono w-28">
                                                        Score: {currentScore === null || currentScore === undefined || isNaN(currentScore) ? '___' : currentScore}
                                                    </span>
                                                </div>
                                                {field.status === 'cancelled' ? (
                                                    <Badge variant="destructive" className="text-lg flex items-center gap-2"><Ban/> CANCELLED</Badge>
                                                ) : (
                                                    <Badge variant={scoreInfo.isScored ? "default" : "outline"} className={cn("text-base w-28 justify-center", scoreInfo.className)}>
                                                        {scoreInfo.grade || 'Not Scored'}
                                                    </Badge>
                                                )}
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <div className="p-4 bg-muted/50 border-t">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <FormField
                                                        control={form.control}
                                                        name={`scores.${index}.score`}
                                                        render={({ field: formField }) => (
                                                        <FormItem>
                                                            <FormLabel>Score (0-100)</FormLabel>
                                                            <FormControl>
                                                                <Input 
                                                                type="number" 
                                                                min="0" 
                                                                max="100" 
                                                                placeholder="Enter score..."
                                                                {...formField} 
                                                                disabled={field.status === 'cancelled' || isJudgingClosed}
                                                                onChange={(e) => formField.onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
                                                                value={formField.value === null || formField.value === undefined || isNaN(formField.value) ? '' : formField.value}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={form.control}
                                                        name={`scores.${index}.review`}
                                                        render={({ field: formField }) => (
                                                        <FormItem>
                                                            <FormLabel>Review (Optional)</FormLabel>
                                                            <FormControl>
                                                                <Textarea placeholder="Optional comments..." {...formField} disabled={field.status === 'cancelled' || isJudgingClosed} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                        )}
                                                    />
                                                </div>
                                            </div>
                                        </AccordionContent>
                                        {field.status === 'cancelled' && <div className="absolute inset-0 bg-white/50 dark:bg-black/50 cursor-not-allowed"></div>}
                                     </div>
                                </AccordionItem>
                            )
                        })}
                    </Accordion>
                 )}

                {fields.length > 0 && !isJudgingClosed && (
                    <div className="flex justify-end sticky bottom-6">
                        <Button type="submit" size="lg" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Save All Scores
                        </Button>
                    </div>
                )}
            </form>
        </Form>

         <AlertDialog open={isTimeUp} onOpenChange={setIsTimeUp}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Time's Up!</AlertDialogTitle>
                <AlertDialogDescription>
                  The timer you set has finished. You can continue working or start a new timer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction onClick={() => setIsTimeUp(false)}>Close</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
  );
}
