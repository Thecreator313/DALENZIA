'use client';

import { useState, useMemo } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { db } from '@/lib/firebase';
import { useSharedCollection } from '@/context/firestore-cache';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import {
  MoreHorizontal,
  PlusCircle,
  Trash2,
  Edit,
  Tv,
  User,
  Loader2,
  Link as LinkIcon,
  Search,
  Radio,
  Clock,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  ExternalLink,
  Users,
  Layers,
  Sparkles,
  ArrowUp,
  ArrowDown,
  X,
  ListOrdered,
  Eye,
  SlidersHorizontal,
  Calendar,
  Check,
} from 'lucide-react';
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
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import type { User as StageControllerUser } from '@/app/admin/access-central/page';
import type { Program } from '@/app/admin/programs/page';
import type { Category } from '@/app/admin/categories/page';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

const stageSchema = z.object({
  name: z.string().min(1, 'Stage name is required'),
  controllerId: z.string().min(1, 'Stage controller is required'),
  location: z.string().optional(),
});

type Assignment = {
  id: string;
  programId: string;
  studentId: string;
  teamId: string;
  codeLetter?: string;
  status?: 'cancelled';
};

type Score = {
  programId: string;
  assignmentId: string;
  judgeId: string;
  score: number;
};

export type ProgramStatusKey = 'not_started' | 'reporting' | 'ready' | 'judging' | 'completed';

export type ProgramWithStatus = Program & {
  status: {
    key: ProgramStatusKey;
    text: string;
    badgeClass: string;
    dotClass: string;
    reportedCount: number;
    totalParticipants: number;
  };
};

export type Stage = z.infer<typeof stageSchema> & {
  id: string;
  controllerName?: string;
  programIds?: string[];
  programs?: ProgramWithStatus[];
};

export type StageLiveState = 'judging' | 'ready' | 'reporting' | 'completed' | 'idle' | 'empty';

const getProgramStatus = (
  program: Program,
  allAssignments: Assignment[],
  allScores: Score[]
): ProgramWithStatus['status'] => {
  const programAssignments = allAssignments.filter(
    (a) => a.programId === program.id && a.status !== 'cancelled'
  );
  const reportedAssignments = programAssignments.filter((a) => !!a.codeLetter);
  const reportedAssignmentIds = reportedAssignments.map((a) => a.id);
  const programScores = allScores.filter((s) => reportedAssignmentIds.includes(s.assignmentId));

  const totalParticipants = programAssignments.length;
  const reportedCount = reportedAssignments.length;
  const expectedScores = reportedCount * (program.judges?.length || 1);
  const actualScores = programScores.length;

  if (reportedCount === 0) {
    return {
      key: 'not_started',
      text: 'Not Started',
      badgeClass: 'bg-muted text-muted-foreground border-border/50',
      dotClass: 'bg-muted-foreground',
      reportedCount,
      totalParticipants,
    };
  }
  if (reportedCount < totalParticipants) {
    return {
      key: 'reporting',
      text: 'Reporting in Progress',
      badgeClass: 'bg-orange-500/10 text-orange-500 border-orange-500/30',
      dotClass: 'bg-orange-500 animate-pulse',
      reportedCount,
      totalParticipants,
    };
  }
  // All participants reported
  if (actualScores === 0) {
    return {
      key: 'ready',
      text: 'Ready for Judging',
      badgeClass: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
      dotClass: 'bg-blue-500',
      reportedCount,
      totalParticipants,
    };
  }
  if (actualScores < expectedScores) {
    return {
      key: 'judging',
      text: 'Judging Live',
      badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/30 font-bold',
      dotClass: 'bg-amber-500 animate-ping',
      reportedCount,
      totalParticipants,
    };
  }
  return {
    key: 'completed',
    text: 'Completed',
    badgeClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    dotClass: 'bg-emerald-500',
    reportedCount,
    totalParticipants,
  };
};

export default function StageCentralPage() {
  const { data: allUsers, loading: usersLoading } = useSharedCollection<StageControllerUser>('users');
  const { data: rawPrograms, loading: progsLoading } = useSharedCollection<Program>('programs');
  const { data: categories, loading: catsLoading } = useSharedCollection<Category>('programCategories');
  const { data: allAssignments, loading: assignmentsLoading } = useSharedCollection<Assignment>('assignments');
  const { data: allScores, loading: scoresLoading } = useSharedCollection<Score & { id: string }>('scores');
  const { data: rawStages, loading: stagesLoading } = useSharedCollection<Stage>('stages');

  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [stageToDelete, setStageToDelete] = useState<Stage | null>(null);

  const [stageToAssign, setStageToAssign] = useState<Stage | null>(null);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);

  // Search & Filtering
  const [stageSearch, setStageSearch] = useState('');
  const [stageStatusFilter, setStageStatusFilter] = useState<'all' | 'active' | 'completed' | 'idle'>('all');

  const controllers = useMemo(
    () => allUsers.filter((u) => u.role === 'stagecontroller'),
    [allUsers]
  );

  const programs = useMemo(() => {
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    return rawPrograms.map((p) => ({
      ...p,
      categoryName: (p.categoryId && categoryMap.get(p.categoryId)) || 'General',
      judgesDetails: (p.judges || [])
        .map((id) => userMap.get(id))
        .filter(Boolean) as StageControllerUser[],
    })) as Program[];
  }, [rawPrograms, categories, allUsers]);

  const stages = useMemo(() => {
    const userMap = new Map(allUsers.map((u) => [u.id, u.name]));
    return rawStages.map((s) => ({
      ...s,
      controllerName: s.controllerId ? userMap.get(s.controllerId) || 'Unassigned' : 'Unassigned',
    }));
  }, [rawStages, allUsers]);

  const loading =
    usersLoading || progsLoading || catsLoading || assignmentsLoading || scoresLoading || stagesLoading;

  // Compute stages with program status & overall live stage state
  const stagesWithDetails = useMemo(() => {
    return stages.map((stage) => {
      const pIds = stage.programIds || [];
      const programMap = new Map(programs.map((p) => [p.id, p]));

      // Maintain exact ordering specified in programIds
      const stagePrograms: ProgramWithStatus[] = pIds
        .map((id) => programMap.get(id))
        .filter(Boolean)
        .map((p) => ({
          ...p!,
          status: getProgramStatus(p!, allAssignments, allScores),
        }));

      // Calculate stage metrics
      const totalCount = stagePrograms.length;
      const completedCount = stagePrograms.filter((p) => p.status.key === 'completed').length;
      const judgingProgram = stagePrograms.find((p) => p.status.key === 'judging');
      const readyProgram = stagePrograms.find((p) => p.status.key === 'ready');
      const reportingProgram = stagePrograms.find((p) => p.status.key === 'reporting');

      let liveState: StageLiveState = 'idle';
      if (totalCount === 0) {
        liveState = 'empty';
      } else if (judgingProgram) {
        liveState = 'judging';
      } else if (readyProgram) {
        liveState = 'ready';
      } else if (reportingProgram) {
        liveState = 'reporting';
      } else if (completedCount === totalCount) {
        liveState = 'completed';
      } else {
        liveState = 'idle';
      }

      const activeProgram = judgingProgram || readyProgram || reportingProgram || null;
      const completionPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

      return {
        ...stage,
        programs: stagePrograms,
        liveState,
        activeProgram,
        totalCount,
        completedCount,
        completionPercentage,
      };
    });
  }, [stages, programs, allAssignments, allScores]);

  // Map of which stage owns which program
  const programToStageMap = useMemo(() => {
    const map = new Map<string, { stageId: string; stageName: string }>();
    stages.forEach((s) => {
      (s.programIds || []).forEach((pId) => {
        map.set(pId, { stageId: s.id, stageName: s.name });
      });
    });
    return map;
  }, [stages]);

  // On-stage programs that are not assigned to ANY stage yet
  const unassignedOnStagePrograms = useMemo(() => {
    return programs.filter(
      (p) => p.mode === 'on-stage' && !programToStageMap.has(p.id)
    );
  }, [programs, programToStageMap]);

  // Overall festival stage metrics
  const telemetry = useMemo(() => {
    const totalStages = stagesWithDetails.length;
    const activeStages = stagesWithDetails.filter((s) =>
      ['judging', 'ready', 'reporting'].includes(s.liveState)
    ).length;

    const onStagePrograms = programs.filter((p) => p.mode === 'on-stage');
    const totalOnStageCount = onStagePrograms.length;
    const assignedOnStageCount = onStagePrograms.filter((p) => programToStageMap.has(p.id)).length;
    const coveragePercentage = totalOnStageCount > 0 ? Math.round((assignedOnStageCount / totalOnStageCount) * 100) : 100;

    const allAssignedPrograms = stagesWithDetails.flatMap((s) => s.programs || []);
    const completedAssignedCount = allAssignedPrograms.filter((p) => p.status.key === 'completed').length;
    const totalAssignedCount = allAssignedPrograms.length;

    return {
      totalStages,
      activeStages,
      totalOnStageCount,
      assignedOnStageCount,
      coveragePercentage,
      completedAssignedCount,
      totalAssignedCount,
    };
  }, [stagesWithDetails, programs, programToStageMap]);

  // Filtered stages for view
  const filteredStages = useMemo(() => {
    return stagesWithDetails.filter((s) => {
      const matchesSearch =
        stageSearch === '' ||
        s.name.toLowerCase().includes(stageSearch.toLowerCase()) ||
        (s.controllerName && s.controllerName.toLowerCase().includes(stageSearch.toLowerCase())) ||
        (s.location && s.location.toLowerCase().includes(stageSearch.toLowerCase()));

      if (!matchesSearch) return false;

      if (stageStatusFilter === 'active') {
        return ['judging', 'ready', 'reporting'].includes(s.liveState);
      }
      if (stageStatusFilter === 'completed') {
        return s.liveState === 'completed';
      }
      if (stageStatusFilter === 'idle') {
        return s.liveState === 'idle' || s.liveState === 'empty';
      }

      return true;
    });
  }, [stagesWithDetails, stageSearch, stageStatusFilter]);

  const form = useForm<z.infer<typeof stageSchema>>({
    resolver: zodResolver(stageSchema),
    defaultValues: { name: '', controllerId: '', location: '' },
  });

  const onSubmit = async (values: z.infer<typeof stageSchema>) => {
    try {
      if (editingStage) {
        const stageDoc = doc(db, 'stages', editingStage.id);
        await updateDoc(stageDoc, values);
        toast({ title: 'Stage Updated', description: `${values.name} has been updated successfully.` });
      } else {
        await addDoc(collection(db, 'stages'), { ...values, programIds: [] });
        toast({ title: 'Stage Created', description: `${values.name} is now available in Stage Central.` });
      }
      form.reset();
      setEditingStage(null);
      setIsFormOpen(false);
    } catch (error) {
      console.error('Error saving stage:', error);
      toast({ title: 'Error', description: 'Failed to save stage.', variant: 'destructive' });
    }
  };

  const handleEdit = (stage: Stage) => {
    setEditingStage(stage);
    form.reset({
      name: stage.name,
      controllerId: stage.controllerId,
      location: stage.location || '',
    });
    setIsFormOpen(true);
  };

  const handleDelete = async () => {
    if (!stageToDelete) return;
    try {
      await deleteDoc(doc(db, 'stages', stageToDelete.id));
      toast({ title: 'Stage Deleted', description: `${stageToDelete.name} has been removed.` });
      setStageToDelete(null);
      setIsDeleteDialogOpen(false);
    } catch (error) {
      console.error('Error deleting stage:', error);
      toast({ title: 'Error', description: 'Failed to delete stage.', variant: 'destructive' });
    }
  };

  const openDeleteDialog = (stage: Stage) => {
    setStageToDelete(stage);
    setIsDeleteDialogOpen(true);
  };

  const openAddForm = () => {
    setEditingStage(null);
    form.reset({ name: '', controllerId: '', location: '' });
    setIsFormOpen(true);
  };

  const openAssignDialog = (stage: Stage) => {
    setStageToAssign(stage);
    setIsAssignDialogOpen(true);
  };

  // Assign updated programs array
  const handleAssignPrograms = async (programIds: string[]) => {
    if (!stageToAssign) return;

    try {
      const stageDoc = doc(db, 'stages', stageToAssign.id);
      await updateDoc(stageDoc, { programIds });

      toast({
        title: 'Assignments Updated',
        description: `Updated program schedule for ${stageToAssign.name} (${programIds.length} programs).`,
      });
      setIsAssignDialogOpen(false);
      setStageToAssign(null);
    } catch (error) {
      console.error('Error assigning programs:', error);
      toast({ title: 'Error', description: 'Failed to assign programs.', variant: 'destructive' });
    }
  };

  // Reorder program within stage
  const handleMoveProgram = async (stage: Stage, fromIndex: number, toIndex: number) => {
    const list = [...(stage.programIds || [])];
    if (toIndex < 0 || toIndex >= list.length) return;

    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);

    try {
      await updateDoc(doc(db, 'stages', stage.id), { programIds: list });
    } catch (err) {
      console.error('Failed to reorder program:', err);
    }
  };

  // Quick remove program directly from stage card
  const handleQuickRemove = async (stageId: string, programId: string) => {
    const targetStage = stages.find((s) => s.id === stageId);
    if (!targetStage) return;

    const updated = (targetStage.programIds || []).filter((id) => id !== programId);
    try {
      await updateDoc(doc(db, 'stages', stageId), { programIds: updated });
      toast({ title: 'Program Removed', description: 'Program removed from stage schedule.' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Could not remove program.', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[65vh]">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-cyan-500/20 blur-xl animate-pulse" />
          <Loader2 className="h-10 w-10 animate-spin text-cyan-500 relative z-10" />
        </div>
        <p className="text-muted-foreground animate-pulse mt-4 text-sm font-medium">
          Loading Stage Central Console...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 relative min-h-screen p-1 pb-16">
      {/* Background Ambient Glows */}
      <div className="fixed inset-0 -z-10 h-full w-full bg-background overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-cyan-500/5 blur-[130px]" />
        <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-[130px]" />
        <div className="absolute bottom-[-10%] left-[20%] w-[40%] h-[40%] rounded-full bg-indigo-500/5 blur-[140px]" />
      </div>

      {/* Top Header & Quick Action Buttons */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-extrabold tracking-tight font-headline">Stage Central</h1>
            <Badge variant="outline" className="bg-cyan-500/10 text-cyan-500 border-cyan-500/25 text-xs font-semibold px-2.5 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse mr-1.5 inline-block" />
              Live Stage Hub
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Control festival stage venues, assign coordinators, and monitor live performance schedules.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="border-border/60 hover:bg-muted text-xs rounded-xl"
          >
            <Link href="/stage-control/dashboard" target="_blank">
              <Radio className="mr-1.5 h-3.5 w-3.5 text-cyan-500" />
              Stage Control Portal <ExternalLink className="ml-1 h-3 w-3 opacity-60" />
            </Link>
          </Button>

          <Button
            onClick={openAddForm}
            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-semibold shadow-md shadow-cyan-500/20 text-xs sm:text-sm rounded-xl"
          >
            <PlusCircle className="mr-1.5 h-4 w-4" />
            Add Stage
          </Button>
        </div>
      </motion.div>

      {/* KPI Telemetry Stat Cards */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {/* Configured Stages */}
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm relative overflow-hidden group hover:border-cyan-500/40 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-xl group-hover:bg-cyan-500/20 transition-all pointer-events-none" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium">Configured Venues</CardDescription>
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500">
                <Tv className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black font-mono mt-1">
              {telemetry.totalStages}{' '}
              <span className="text-xs font-normal text-muted-foreground font-sans">Stages</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground font-mono">{controllers.length}</span> stage coordinators active
            </p>
          </CardContent>
        </Card>

        {/* Live Active Stages */}
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm relative overflow-hidden group hover:border-amber-500/40 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-all pointer-events-none" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium">Live Performing</CardDescription>
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                <Radio className="h-4 w-4 animate-pulse" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black font-mono mt-1 text-amber-500">
              {telemetry.activeStages}{' '}
              <span className="text-xs font-normal text-muted-foreground font-sans">Active</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              Stages currently judging or reporting
            </p>
          </CardContent>
        </Card>

        {/* Stage Program Allocation Coverage */}
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm relative overflow-hidden group hover:border-blue-500/40 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-xl group-hover:bg-blue-500/20 transition-all pointer-events-none" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium">On-Stage Coverage</CardDescription>
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                <Layers className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black font-mono mt-1">
              {telemetry.assignedOnStageCount}{' '}
              <span className="text-sm font-normal text-muted-foreground font-sans">
                / {telemetry.totalOnStageCount}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>Allocated</span>
              <span className="font-semibold text-foreground font-mono">{telemetry.coveragePercentage}%</span>
            </div>
            <Progress value={telemetry.coveragePercentage} className="h-1.5" />
          </CardContent>
        </Card>

        {/* Overall Stage Programs Completed */}
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm relative overflow-hidden group hover:border-emerald-500/40 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-all pointer-events-none" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium">Stage Completions</CardDescription>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black font-mono mt-1">
              {telemetry.completedAssignedCount}{' '}
              <span className="text-sm font-normal text-muted-foreground font-sans">
                / {telemetry.totalAssignedCount}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              Completed programs across all stages
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* UNASSIGNED ON-STAGE PROGRAMS RADAR ALERT */}
      {unassignedOnStagePrograms.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-amber-500/30 bg-amber-500/10 overflow-hidden">
            <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start md:items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-500 shrink-0">
                  <AlertTriangle className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm">
                      {unassignedOnStagePrograms.length} On-Stage Program(s) Not Assigned to Any Stage
                    </h3>
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20">
                      Action Required
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    These programs have mode marked as &quot;On-Stage&quot; but have not yet been assigned to a venue.
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {unassignedOnStagePrograms.slice(0, 5).map((p) => (
                      <span
                        key={p.id}
                        className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-background/80 border border-border/50 text-foreground"
                      >
                        {p.name} <span className="text-[10px] text-muted-foreground">({p.categoryName})</span>
                      </span>
                    ))}
                    {unassignedOnStagePrograms.length > 5 && (
                      <span className="text-[11px] text-muted-foreground px-1 py-0.5">
                        +{unassignedOnStagePrograms.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {stages.length > 0 && (
                <Button
                  size="sm"
                  onClick={() => openAssignDialog(stages[0])}
                  className="bg-amber-500 hover:bg-amber-600 text-white font-semibold shrink-0 text-xs rounded-xl"
                >
                  <LinkIcon className="mr-1.5 h-3.5 w-3.5" />
                  Assign to {stages[0].name}
                </Button>
              )}
            </div>
          </Card>
        </motion.div>
      )}

      {/* FILTER & SEARCH TOOLBAR */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search stage, controller, or room..."
              value={stageSearch}
              onChange={(e) => setStageSearch(e.target.value)}
              className="pl-9 h-9 text-xs bg-card/60 border-border/50 focus:bg-card rounded-xl"
            />
          </div>

          <Select value={stageStatusFilter} onValueChange={(val: any) => setStageStatusFilter(val)}>
            <SelectTrigger className="w-[140px] h-9 text-xs rounded-xl bg-card/60 border-border/50">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              <SelectItem value="active">Active Now</SelectItem>
              <SelectItem value="completed">All Completed</SelectItem>
              <SelectItem value="idle">Idle / Standby</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <span>Showing {filteredStages.length} of {stages.length} venues</span>
        </div>
      </motion.div>

      {/* STAGE CONSOLE GRID */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence>
          {filteredStages.map((stage, idx) => {
            const isJudging = stage.liveState === 'judging';
            const isReady = stage.liveState === 'ready';
            const isReporting = stage.liveState === 'reporting';
            const isCompleted = stage.liveState === 'completed';

            return (
              <motion.div
                key={stage.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Card
                  className={`flex flex-col border transition-all duration-300 relative overflow-hidden group hover:shadow-lg ${
                    isJudging
                      ? 'border-amber-500/50 bg-gradient-to-b from-amber-500/10 via-card to-card shadow-amber-500/5'
                      : isReporting
                      ? 'border-orange-500/40 bg-gradient-to-b from-orange-500/10 via-card to-card'
                      : isReady
                      ? 'border-blue-500/40 bg-gradient-to-b from-blue-500/10 via-card to-card'
                      : isCompleted
                      ? 'border-emerald-500/30 bg-card/40'
                      : 'border-border/50 bg-card/40'
                  }`}
                >
                  {/* Top Live Status Ribbon */}
                  <div className="px-5 pt-4 pb-3 border-b border-border/40 flex items-center justify-between bg-muted/20">
                    <div className="flex items-center gap-2">
                      {isJudging ? (
                        <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 py-0.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
                          Judging Live
                        </Badge>
                      ) : isReady ? (
                        <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/25 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 py-0.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                          Ready for Judging
                        </Badge>
                      ) : isReporting ? (
                        <Badge className="bg-orange-500/15 text-orange-500 border-orange-500/25 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 py-0.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
                          Reporting Active
                        </Badge>
                      ) : isCompleted ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider">
                          All Finished
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                          Standby
                        </Badge>
                      )}

                      {stage.location && (
                        <span className="text-[11px] text-muted-foreground truncate max-w-[130px]">
                          • {stage.location}
                        </span>
                      )}
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground rounded-lg"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => openAssignDialog(stage)}>
                          <LinkIcon className="mr-2 h-4 w-4 text-cyan-500" />
                          <span>Assign Programs</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEdit(stage)}>
                          <Edit className="mr-2 h-4 w-4 text-blue-500" />
                          <span>Edit Venue</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => openDeleteDialog(stage)}
                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          <span>Delete Stage</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <CardHeader className="pb-3 pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg font-bold flex items-center gap-2 group-hover:text-cyan-500 transition-colors">
                          <Tv className="h-5 w-5 text-cyan-500 shrink-0" />
                          <span>{stage.name}</span>
                        </CardTitle>
                        <CardDescription className="flex items-center gap-1.5 mt-1.5 text-xs">
                          <Avatar className="h-4 w-4 border border-border">
                            <AvatarFallback className="text-[9px] bg-muted">
                              {stage.controllerName?.charAt(0) || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <span>Coordinator: <strong className="text-foreground">{stage.controllerName}</strong></span>
                        </CardDescription>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono text-base font-bold text-foreground">
                          {stage.completedCount} / {stage.totalCount}
                        </span>
                        <div className="text-[10px] text-muted-foreground">Finished</div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                        <span>Stage Schedule</span>
                        <span className="font-mono font-semibold">{stage.completionPercentage}%</span>
                      </div>
                      <Progress value={stage.completionPercentage} className="h-1.5" />
                    </div>
                  </CardHeader>

                  <CardContent className="flex-grow space-y-3 pb-4">
                    {/* Active Spotlight Card */}
                    {stage.activeProgram && (
                      <div className="p-3 rounded-xl border border-cyan-500/25 bg-cyan-500/5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-500 flex items-center gap-1">
                            <PlayCircle className="h-3 w-3" />
                            Current Spotlight
                          </span>
                          <span className={cn('text-[10px] px-1.5 py-0.2 rounded border font-medium', stage.activeProgram.status.badgeClass)}>
                            {stage.activeProgram.status.text}
                          </span>
                        </div>
                        <p className="font-bold text-sm truncate text-foreground">
                          {stage.activeProgram.name}
                        </p>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{stage.activeProgram.categoryName}</span>
                          <span className="font-mono">
                            {stage.activeProgram.status.reportedCount} / {stage.activeProgram.status.totalParticipants} Reported
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Assigned Programs List with Order Controls */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                          Program Sequence ({stage.programs?.length || 0})
                        </h4>
                        <span className="text-[10px] text-muted-foreground">Order of execution</span>
                      </div>

                      <div className="max-h-44 overflow-y-auto rounded-xl border border-border/40 bg-muted/20 p-2 overscroll-contain">
                        <div className="space-y-1.5 pr-1">
                          {stage.programs && stage.programs.length > 0 ? (
                            stage.programs.map((p, pIndex) => (
                              <div
                                key={p.id}
                                className="group/item flex items-center justify-between gap-2 p-2 rounded-lg bg-background/60 hover:bg-muted/60 border border-border/30 transition-colors text-xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-mono font-bold text-muted-foreground">
                                    #{pIndex + 1}
                                  </span>
                                  <div className={cn('h-2 w-2 rounded-full shrink-0', p.status.dotClass)} />
                                  <div className="min-w-0">
                                    <p className="font-medium truncate text-foreground text-xs leading-tight">
                                      {p.name}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground truncate">
                                      {p.categoryName}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  {/* Quick status pill */}
                                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded border hidden sm:inline-block', p.status.badgeClass)}>
                                    {p.status.text}
                                  </span>

                                  {/* Reorder Buttons */}
                                  <div className="opacity-0 group-hover/item:opacity-100 flex items-center transition-opacity">
                                    {pIndex > 0 && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                              onClick={() => handleMoveProgram(stage, pIndex, pIndex - 1)}
                                            >
                                              <ArrowUp className="h-3 w-3" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent side="top">Move Up</TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}

                                    {pIndex < stage.programs.length - 1 && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                              onClick={() => handleMoveProgram(stage, pIndex, pIndex + 1)}
                                            >
                                              <ArrowDown className="h-3 w-3" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent side="top">Move Down</TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}

                                    {/* Quick Remove */}
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                            onClick={() => handleQuickRemove(stage.id, p.id)}
                                          >
                                            <X className="h-3 w-3" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">Remove from Stage</TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="h-36 flex flex-col items-center justify-center text-center p-4">
                              <Tv className="h-7 w-7 text-muted-foreground/30 mb-1.5" />
                              <p className="text-xs font-medium text-muted-foreground">No programs scheduled</p>
                              <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                                Click &quot;Assign Programs&quot; below to add events to this stage.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>

                  <CardFooter className="pt-2 pb-4 border-t border-border/40 bg-muted/10 gap-2">
                    <Button
                      className="w-full text-xs font-semibold rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white shadow-xs"
                      onClick={() => openAssignDialog(stage)}
                    >
                      <LinkIcon className="mr-1.5 h-3.5 w-3.5" />
                      Assign / Order Programs
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredStages.length === 0 && (
          <div className="col-span-full py-16 text-center border rounded-2xl border-dashed border-border/60 bg-muted/10">
            <Tv className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
            <h3 className="font-bold text-base">No stages found</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              {stageSearch
                ? `No stages match "${stageSearch}". Try clearing your search or status filter.`
                : 'Click "Add Stage" above to configure your first festival venue.'}
            </p>
          </div>
        )}
      </div>

      {/* ADD / EDIT STAGE DIALOG */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-md bg-background/95 backdrop-blur-xl border-border/50">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Tv className="h-5 w-5 text-cyan-500" />
              {editingStage ? 'Edit Stage Venue' : 'Create New Stage'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure venue name, location, and assign a dedicated stage controller.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Stage Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Main Auditorium, Stage 1, Open Stage"
                        className="rounded-xl bg-muted/30"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Venue / Location (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Ground Floor, Block B, Main Hall"
                        className="rounded-xl bg-muted/30"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="controllerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Stage Coordinator / Controller</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl bg-muted/30">
                          <SelectValue placeholder="Select a coordinator" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {controllers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <div className="flex items-center gap-2">
                              <span>{c.name}</span>
                              <span className="text-[10px] text-muted-foreground font-mono">({c.userId})</span>
                            </div>
                          </SelectItem>
                        ))}
                        {controllers.length === 0 && (
                          <div className="p-2 text-xs text-muted-foreground text-center">
                            No users with role &apos;stagecontroller&apos; found. Please create one in Access Central.
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="pt-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline" className="text-xs rounded-xl">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-semibold text-xs rounded-xl"
                >
                  {editingStage ? 'Save Changes' : 'Create Stage'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ASSIGN PROGRAMS DIALOG */}
      {stageToAssign && (
        <AssignProgramsDialog
          isOpen={isAssignDialogOpen}
          onOpenChange={setIsAssignDialogOpen}
          stage={stageToAssign}
          allPrograms={programs}
          programToStageMap={programToStageMap}
          onAssign={handleAssignPrograms}
        />
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-background/95 backdrop-blur-xl border-border/50 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Delete Stage?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to permanently delete <strong>{stageToDelete?.name}</strong>?
              Programs assigned to this stage will be freed and can be rescheduled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90 text-white font-semibold text-xs rounded-xl"
            >
              Yes, Delete Stage
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ADVANCED ASSIGN PROGRAMS MODAL WITH FILTERING, CATEGORY TABS & ASSIGNMENT DETECTOR
interface AssignProgramsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  stage: Stage;
  allPrograms: Program[];
  programToStageMap: Map<string, { stageId: string; stageName: string }>;
  onAssign: (selectedProgramIds: string[]) => Promise<void>;
}

function AssignProgramsDialog({
  isOpen,
  onOpenChange,
  stage,
  allPrograms,
  programToStageMap,
  onAssign,
}: AssignProgramsDialogProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(stage.programIds || []);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [modeFilter, setModeFilter] = useState<'on-stage' | 'all' | 'selected' | 'unassigned'>('on-stage');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Categories list
  const categoryNames = useMemo(() => {
    const set = new Set<string>();
    allPrograms.forEach((p) => {
      if (p.categoryName) set.add(p.categoryName);
    });
    return Array.from(set).sort();
  }, [allPrograms]);

  // Keep state synchronized with dialog open
  const handleOpenReset = () => {
    setSelectedIds(stage.programIds || []);
    setSearchTerm('');
    setModeFilter('on-stage');
    setCategoryFilter('all');
  };

  const handleCheckboxToggle = (programId: string) => {
    setSelectedIds((prev) =>
      prev.includes(programId) ? prev.filter((id) => id !== programId) : [...prev, programId]
    );
  };

  const handleSelectAllFiltered = (filtered: Program[]) => {
    const toAdd = filtered.map((p) => p.id);
    setSelectedIds((prev) => Array.from(new Set([...prev, ...toAdd])));
  };

  const handleClearAll = () => {
    setSelectedIds([]);
  };

  const handleSubmit = async () => {
    setIsSaving(true);
    await onAssign(selectedIds);
    setIsSaving(false);
  };

  // Filter programs based on search, mode tab, and category
  const filteredPrograms = useMemo(() => {
    return allPrograms.filter((p) => {
      const matchesSearch =
        searchTerm === '' ||
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.categoryName && p.categoryName.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchesSearch) return false;

      if (categoryFilter !== 'all' && p.categoryName !== categoryFilter) {
        return false;
      }

      if (modeFilter === 'on-stage') {
        return p.mode === 'on-stage';
      }
      if (modeFilter === 'selected') {
        return selectedIds.includes(p.id);
      }
      if (modeFilter === 'unassigned') {
        return !programToStageMap.has(p.id);
      }

      return true;
    });
  }, [allPrograms, searchTerm, categoryFilter, modeFilter, selectedIds, programToStageMap]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (open) handleOpenReset();
        onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[88vh] flex flex-col p-0 overflow-hidden bg-background/95 backdrop-blur-xl border-border/50 gap-0">
        {/* Header - Fixed */}
        <div className="p-5 pb-3 border-b border-border/40 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <LinkIcon className="h-5 w-5 text-cyan-500" />
                Assign Programs to {stage.name}
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Select events to be performed on this stage. Sequence order can be adjusted on the stage card.
              </DialogDescription>
            </div>
            <Badge variant="outline" className="font-mono text-xs px-2.5 py-1 shrink-0">
              {selectedIds.length} Selected
            </Badge>
          </div>
        </div>

        {/* Filter Controls Bar - Fixed */}
        <div className="p-4 border-b border-border/40 bg-muted/20 space-y-2.5 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search program by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-8 text-xs bg-background/70 border-border/50 rounded-xl"
              />
            </div>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-44 h-8 text-xs rounded-xl bg-background/70 border-border/50">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categoryNames.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quick Mode Filters */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-0.5">
            <Tabs
              value={modeFilter}
              onValueChange={(val: any) => setModeFilter(val)}
              className="w-auto"
            >
              <TabsList className="bg-muted/40 p-0.5 h-8">
                <TabsTrigger value="on-stage" className="text-xs px-3 h-7">
                  On-Stage ({allPrograms.filter((p) => p.mode === 'on-stage').length})
                </TabsTrigger>
                <TabsTrigger value="all" className="text-xs px-3 h-7">
                  All ({allPrograms.length})
                </TabsTrigger>
                <TabsTrigger value="unassigned" className="text-xs px-3 h-7">
                  Unassigned ({allPrograms.filter((p) => !programToStageMap.has(p.id)).length})
                </TabsTrigger>
                <TabsTrigger value="selected" className="text-xs px-3 h-7">
                  Selected ({selectedIds.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => handleSelectAllFiltered(filteredPrograms)}
              >
                Select Filtered ({filteredPrograms.length})
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10"
                onClick={handleClearAll}
              >
                Clear
              </Button>
            </div>
          </div>
        </div>

        {/* Scrollable Programs List - Guaranteed Smooth Scrolling */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2 overscroll-contain">
          {filteredPrograms.map((program) => {
            const isSelected = selectedIds.includes(program.id);
            const assignedInfo = programToStageMap.get(program.id);
            const isAssignedHere = assignedInfo?.stageId === stage.id;
            const isAssignedElsewhere = assignedInfo && assignedInfo.stageId !== stage.id;

            return (
              <div
                key={program.id}
                onClick={() => handleCheckboxToggle(program.id)}
                className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                  isSelected
                    ? 'border-cyan-500/50 bg-cyan-500/10'
                    : 'border-border/40 bg-card/60 hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCheckboxToggle(program.id);
                    }}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => {}}
                      className="rounded-md shrink-0 pointer-events-none"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-xs sm:text-sm truncate text-foreground">
                        {program.name}
                      </p>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[9px] px-1.5 py-0 font-medium',
                          program.mode === 'on-stage'
                            ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {program.mode === 'on-stage' ? 'On-Stage' : 'Off-Stage'}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                      <span>{program.categoryName}</span>
                      <span>•</span>
                      <span className="capitalize">{program.type}</span>

                      {isAssignedElsewhere && (
                        <>
                          <span>•</span>
                          <span className="text-amber-500 font-medium">
                            (Currently on: {assignedInfo.stageName})
                          </span>
                        </>
                      )}
                      {isAssignedHere && !isSelected && (
                        <>
                          <span>•</span>
                          <span className="text-muted-foreground italic">
                            (Previously saved here)
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="shrink-0">
                  {isSelected && (
                    <span className="h-6 w-6 rounded-full bg-cyan-500/20 text-cyan-500 flex items-center justify-center">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {filteredPrograms.length === 0 && (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No programs match the selected search or filters.
            </div>
          )}
        </div>

        {/* Footer - Fixed */}
        <div className="p-4 px-6 border-t border-border/40 bg-muted/20 flex items-center justify-between shrink-0">
          <div className="text-xs text-muted-foreground">
            Total Selected: <strong className="text-foreground font-mono">{selectedIds.length}</strong> programs
          </div>

          <div className="flex items-center gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="text-xs rounded-xl">
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={handleSubmit}
              disabled={isSaving}
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-semibold text-xs rounded-xl shadow-sm"
            >
              {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save Assignments
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
