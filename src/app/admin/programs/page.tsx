
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
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
import { ProgramsStageCanvas } from '@/components/programs-stage-canvas';
import { AnimatedCounter } from '@/components/animated-counter';
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
  Trash,
  Edit,
  Search,
  UserCheck,
  Users,
  ListFilter,
  Sparkles,
  Mic2,
  Layers,
  Award,
  LayoutGrid,
  List as ListIcon,
  X,
  User as UserIcon,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import type { Category } from '@/app/admin/categories/page';
import type { User as JudgeUser } from '@/app/admin/access-central/page';
import type { Participant } from '@/app/teams/add-participants/page';
import type { Team } from '@/app/admin/teams/page';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';


const programSchema = z.object({
  name: z.string().min(1, 'Program name is required'),
  categoryId: z.string().min(1, 'Category is required'),
  type: z.enum(['individual', 'group']),
  mode: z.enum(['on-stage', 'off-stage']),
  markType: z.enum(['normal', 'special-mark']),
  participantsCount: z.coerce.number().min(1, 'Number of participants is required'),
  groupMembers: z.coerce.number().optional(),
  judges: z.array(z.string()).optional(),
  judgingStatus: z.enum(['open', 'closed']).default('open'),
}).refine(data => {
  if (data.type === 'group') {
    return data.groupMembers !== undefined && data.groupMembers > 0;
  }
  return true;
}, {
  message: "Number of group members is required for group programs",
  path: ["groupMembers"],
});


export type Program = z.infer<typeof programSchema> & {
  id: string;
  categoryName?: string;
  judgesDetails?: JudgeUser[];
  assignedParticipants?: (Participant & { teamName: string })[];
  isPublished?: boolean;
};

export default function ProgramsPage() {
  const { data: categories, loading: catsLoading } = useSharedCollection<Category>('programCategories');
  const { data: allUsers, loading: usersLoading } = useSharedCollection<JudgeUser>('users');
  const { data: rawPrograms, loading: progsLoading } = useSharedCollection<Program>('programs');
  const { data: students, loading: studentsLoading } = useSharedCollection<Participant>('students');
  const { data: teams, loading: teamsLoading } = useSharedCollection<Team>('teams');
  const { data: assignments, loading: assignmentsLoading } = useSharedCollection<{
    id: string;
    programId: string;
    studentId: string;
    teamId: string;
  }>('assignments');

  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [programToDelete, setProgramToDelete] = useState<Program | null>(null);
  const [isJudgesDialogOpen, setIsJudgesDialogOpen] = useState(false);
  const [programToAssignJudges, setProgramToAssignJudges] = useState<Program | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState<'all' | 'on-stage' | 'off-stage'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'individual' | 'group'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const pageRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const heroAnimatedRef = useRef(false);

  const judges = useMemo(
    () => allUsers.filter((u) => u.role === 'judges'),
    [allUsers]
  );

  const programs = useMemo(() => {
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const studentMap = new Map(students.map((s) => [s.id, s]));
    const teamNameMap = new Map(teams.map((t) => [t.id, t.name]));

    const assignmentsByProgram = new Map<string, typeof assignments>();
    for (const a of assignments) {
      const list = assignmentsByProgram.get(a.programId);
      if (list) list.push(a);
      else assignmentsByProgram.set(a.programId, [a]);
    }

    return rawPrograms.map((programData) => {
      const categoryName = (programData.categoryId && categoryMap.get(programData.categoryId)) || 'Unknown';
      const judgesDetails = (programData.judges || [])
        .map((id) => userMap.get(id))
        .filter(Boolean) as JudgeUser[];

      const progAssignments = assignmentsByProgram.get(programData.id) || [];
      const assignedParticipants = progAssignments
        .map((a) => {
          const student = studentMap.get(a.studentId);
          const teamName = teamNameMap.get(a.teamId) || 'Unknown Team';
          return student ? { ...student, teamName } : null;
        })
        .filter(Boolean) as (Participant & { teamName: string })[];

      return {
        ...programData,
        categoryName,
        judgesDetails,
        assignedParticipants,
      } as Program;
    });
  }, [rawPrograms, categories, allUsers, students, teams, assignments]);

  const loading =
    catsLoading || usersLoading || progsLoading || studentsLoading || teamsLoading || assignmentsLoading;

  const form = useForm<z.infer<typeof programSchema>>({
    resolver: zodResolver(programSchema),
    defaultValues: {
      name: '',
      categoryId: '',
      type: 'individual',
      mode: 'on-stage',
      markType: 'normal',
      participantsCount: 1,
      groupMembers: 0,
      judges: [],
      judgingStatus: 'open',
    },
  });

  const typeValue = form.watch("type");

  const filteredPrograms = useMemo(() => {
    return programs
      .filter(program => categoryFilter === 'all' || program.categoryId === categoryFilter)
      .filter(program => modeFilter === 'all' || program.mode === modeFilter)
      .filter(program => typeFilter === 'all' || program.type === typeFilter)
      .filter(program =>
        program.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (program.categoryName && program.categoryName.toLowerCase().includes(searchTerm.toLowerCase()))
      );
  }, [programs, searchTerm, categoryFilter, modeFilter, typeFilter]);

  const stats = useMemo(() => {
    let onStage = 0;
    let offStage = 0;
    let withJudges = 0;
    let totalEntries = 0;

    for (const p of programs) {
      if (p.mode === 'on-stage') onStage++;
      else offStage++;
      if (p.judges && p.judges.length > 0) withJudges++;
      totalEntries += p.assignedParticipants?.length || 0;
    }

    return {
      total: programs.length,
      onStage,
      offStage,
      withJudges,
      totalEntries,
    };
  }, [programs]);

  const hasActiveFilters =
    searchTerm !== '' ||
    categoryFilter !== 'all' ||
    modeFilter !== 'all' ||
    typeFilter !== 'all';

  const resetFilters = () => {
    setSearchTerm('');
    setCategoryFilter('all');
    setModeFilter('all');
    setTypeFilter('all');
  };

  // GSAP choreographed hero entrance (once after initial load)
  useEffect(() => {
    if (loading || heroAnimatedRef.current || !pageRef.current) return;
    heroAnimatedRef.current = true;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      gsap.from('.hero-stagger', {
        y: 22,
        opacity: 0,
        duration: 0.65,
        stagger: 0.08,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      });
      gsap.from('.kpi-pill', {
        scale: 0.94,
        y: 16,
        opacity: 0,
        duration: 0.55,
        stagger: 0.07,
        delay: 0.15,
        ease: 'back.out(1.4)',
        clearProps: 'transform,opacity',
      });
    }, pageRef);

    return () => ctx.revert();
  }, [loading]);

  // GSAP card grid stagger on initial load or filter/view changes
  useEffect(() => {
    if (loading || !gridRef.current) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      const items = gsap.utils.toArray<HTMLElement>('.program-anim-item');
      if (items.length === 0) return;
      gsap.fromTo(
        items,
        { y: 18, opacity: 0, scale: 0.98 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.42,
          stagger: { amount: Math.min(items.length * 0.035, 0.45) },
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        }
      );
    }, gridRef);

    return () => ctx.revert();
  }, [loading, categoryFilter, modeFilter, typeFilter, viewMode]);

  const onSubmit = async (values: z.infer<typeof programSchema>) => {
    try {
      const submissionData = { ...values };
      if (submissionData.type === 'individual') {
        delete submissionData.groupMembers;
      }

      if (editingProgram) {
        const programDoc = doc(db, 'programs', editingProgram.id);
        await updateDoc(programDoc, submissionData);
        toast({ title: 'Success', description: 'Program updated successfully.' });
      } else {
        await addDoc(collection(db, 'programs'), submissionData);
        toast({ title: 'Success', description: 'Program added successfully.' });
      }
      form.reset();
      setEditingProgram(null);
      setIsFormOpen(false);
    } catch (error) {
      console.error('Error saving program:', error);
      toast({ title: 'Error', description: 'Failed to save program.', variant: 'destructive' });
    }
  };

  const handleEdit = (program: Program) => {
    setEditingProgram(program);
    form.reset({
      ...program,
      groupMembers: program.groupMembers || 0,
    });
    setIsFormOpen(true);
  };

  const handleDelete = async () => {
    if (!programToDelete) return;
    try {
      await deleteDoc(doc(db, 'programs', programToDelete.id));
      toast({ title: 'Success', description: 'Program deleted successfully.' });
      setProgramToDelete(null);
      setIsDeleteDialogOpen(false);
    } catch (error) {
      console.error('Error deleting program:', error);
      toast({ title: 'Error', description: 'Failed to delete program.', variant: 'destructive' });
    }
  };

  const openDeleteDialog = (program: Program) => {
    setProgramToDelete(program);
    setIsDeleteDialogOpen(true);
  };

  const openAddForm = () => {
    setEditingProgram(null);
    form.reset({
      name: '',
      categoryId: '',
      type: 'individual',
      mode: 'on-stage',
      markType: 'normal',
      participantsCount: 1,
      groupMembers: 0,
      judges: [],
      judgingStatus: 'open',
    });
    setIsFormOpen(true);
  };

  const openJudgesDialog = (program: Program) => {
    setProgramToAssignJudges(program);
    setIsJudgesDialogOpen(true);
  }

  const handleAssignJudges = async (selectedJudges: string[]) => {
    if (!programToAssignJudges) return;
    try {
      const programDoc = doc(db, 'programs', programToAssignJudges.id);
      await updateDoc(programDoc, { judges: selectedJudges });
      toast({ title: 'Success', description: 'Judges assigned successfully.' });
      setIsJudgesDialogOpen(false);
      setProgramToAssignJudges(null);
    } catch (error) {
      console.error('Error assigning judges:', error);
      toast({ title: 'Error', description: 'Failed to assign judges.', variant: 'destructive' });
    }
  }

  const handleCardPointerMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-6rem)] gap-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/25 blur-xl animate-pulse" />
          <Loader2 className="h-12 w-12 animate-spin text-primary relative z-10" />
        </div>
        <p className="text-muted-foreground animate-pulse font-medium">Loading Program Studio...</p>
      </div>
    );
  }

  return (
    <div ref={pageRef} className="space-y-8 relative min-h-screen pb-8">
      {/* Ambient Background Glows */}
      <div className="fixed inset-0 -z-10 h-full w-full overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-blue-500/10 blur-[120px]" />
        <div className="absolute top-1/3 -right-24 w-96 h-96 rounded-full bg-purple-500/10 blur-[120px]" />
        <div className="absolute -bottom-24 left-1/3 w-80 h-80 rounded-full bg-cyan-500/10 blur-[120px]" />
      </div>

      {/* Hero Stage Banner with Interactive Three.js Sculpture */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card/85 via-card/65 to-primary/10 backdrop-blur-xl shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_55%),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.12),transparent_50%)] pointer-events-none" />
        <div className="grid lg:grid-cols-[1.45fr_1fr] items-center gap-6 p-6 sm:p-8 relative z-10">
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="hero-stagger inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                Program Studio • Live Sync
              </div>
              <div className="hero-stagger flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold font-headline tracking-tight bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent">
                    Manage Programs
                  </h1>
                  <p className="text-muted-foreground mt-1.5 max-w-xl text-sm sm:text-base">
                    Orchestrate stage events, participant slots, special mark rules, and judging panels in real time.
                  </p>
                </div>
              </div>
            </div>

            <div className="hero-stagger flex flex-wrap items-center gap-3">
              <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <DialogTrigger asChild>
                  <Button
                    onClick={openAddForm}
                    size="lg"
                    className="rounded-xl shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all duration-200 bg-gradient-to-r from-blue-600 via-primary to-indigo-600 text-white border-0"
                  >
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Program
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg border-border/60 bg-background/95 backdrop-blur-xl">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-headline">
                      {editingProgram ? 'Edit Program' : 'Create New Program'}
                    </DialogTitle>
                    <DialogDescription>
                      Configure event rules, stage mode, and participant capacity.
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <FormField control={form.control} name="name" render={({ field }) => (
                        <FormItem><FormLabel>Program Name</FormLabel><FormControl><Input placeholder="e.g., Classical Dance Solo" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="categoryId" render={({ field }) => (
                        <FormItem><FormLabel>Category</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger></FormControl>
                            <SelectContent>{categories.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}</SelectContent>
                          </Select>
                          <FormMessage /></FormItem>
                      )} />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="type" render={({ field }) => (
                          <FormItem><FormLabel>Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent><SelectItem value="individual">Individual</SelectItem><SelectItem value="group">Group</SelectItem></SelectContent>
                            </Select>
                            <FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="mode" render={({ field }) => (
                          <FormItem><FormLabel>Mode</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent><SelectItem value="on-stage">On-Stage</SelectItem><SelectItem value="off-stage">Off-Stage</SelectItem></SelectContent>
                            </Select>
                            <FormMessage /></FormItem>
                        )} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="markType" render={({ field }) => (
                          <FormItem><FormLabel>Mark Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent><SelectItem value="normal">Normal</SelectItem><SelectItem value="special-mark">Special Mark</SelectItem></SelectContent>
                            </Select>
                            <FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="participantsCount" render={({ field }) => (
                          <FormItem><FormLabel>Participants</FormLabel>
                            <FormControl><Input type="number" {...field} /></FormControl>
                            <FormMessage /></FormItem>
                        )} />
                      </div>
                      {typeValue === 'group' && (
                        <FormField control={form.control} name="groupMembers" render={({ field }) => (
                          <FormItem><FormLabel>Group Members</FormLabel>
                            <FormControl><Input type="number" placeholder="Number of members in group" {...field} /></FormControl>
                            <FormMessage /></FormItem>
                        )} />
                      )}
                      <DialogFooter className="pt-2">
                        <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                        <Button type="submit">{editingProgram ? 'Save Changes' : 'Create Program'}</Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>

              <div className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background/50 px-3.5 py-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span><strong className="text-foreground">{stats.totalEntries}</strong> total team entries</span>
              </div>
            </div>

            {/* GSAP Animated KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              {[
                { label: 'Total Programs', val: stats.total, icon: Layers, accent: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
                { label: 'On-Stage', val: stats.onStage, icon: Mic2, accent: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20' },
                { label: 'Off-Stage', val: stats.offStage, icon: Sparkles, accent: 'text-purple-500 bg-purple-500/10 border-purple-500/20' },
                { label: 'Judges Ready', val: stats.withJudges, icon: UserCheck, accent: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="kpi-pill rounded-2xl border border-border/60 bg-background/60 backdrop-blur-md p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{item.label}</span>
                    <span className={cn('p-1.5 rounded-lg border', item.accent)}>
                      <item.icon className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <div className="text-2xl font-bold font-headline tracking-tight">
                    <AnimatedCounter value={item.val} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive 3D Three.js Stage */}
          <div className="relative h-60 sm:h-72 lg:h-80 w-full rounded-2xl border border-border/40 bg-gradient-to-b from-primary/5 via-transparent to-purple-500/5 overflow-hidden">
            <ProgramsStageCanvas
              programCount={stats.total}
              onStageCount={stats.onStage}
              offStageCount={stats.offStage}
            />
            <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-background/75 backdrop-blur-md border border-border/50 px-2.5 py-1">
                <span className="h-2 w-2 rounded-full bg-sky-400" />
                On-Stage ({stats.onStage})
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-background/75 backdrop-blur-md border border-border/50 px-2.5 py-1">
                <span className="h-2 w-2 rounded-full bg-purple-400" />
                Off-Stage ({stats.offStage})
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Glassmorphic Filter Toolbar & Program Showcase */}
      <Card className="border-border/60 bg-card/55 backdrop-blur-xl shadow-lg overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  Program Directory
                  <Badge variant="secondary" className="rounded-full font-mono text-xs">
                    {filteredPrograms.length} / {programs.length}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Hover any card to inspect details or manage judges and rules.
                </CardDescription>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search program or category..."
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
                <SelectTrigger className="w-full sm:w-[200px] bg-background/70 border-border/60 rounded-xl">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
                </SelectContent>
              </Select>

              <div className="inline-flex rounded-xl border border-border/60 bg-background/70 p-1 self-start sm:self-auto">
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
                  <LayoutGrid className="h-3.5 w-3.5" /> Grid
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all',
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

          {/* Quick Segmented Filter Pills */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-border/60 bg-background/60 p-1">
                {(['all', 'on-stage', 'off-stage'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setModeFilter(mode)}
                    className={cn(
                      'rounded-lg px-3 py-1 text-xs font-medium capitalize transition-all',
                      modeFilter === mode
                        ? 'bg-primary/15 text-primary border border-primary/25 shadow-sm'
                        : 'text-muted-foreground hover:text-foreground border border-transparent'
                    )}
                  >
                    {mode === 'all' ? 'All Modes' : mode}
                  </button>
                ))}
              </div>

              <div className="inline-flex rounded-xl border border-border/60 bg-background/60 p-1">
                {(['all', 'individual', 'group'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTypeFilter(type)}
                    className={cn(
                      'rounded-lg px-3 py-1 text-xs font-medium capitalize transition-all',
                      typeFilter === type
                        ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25 shadow-sm'
                        : 'text-muted-foreground hover:text-foreground border border-transparent'
                    )}
                  >
                    {type === 'all' ? 'All Types' : type}
                  </button>
                ))}
              </div>
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-xs text-muted-foreground hover:text-foreground">
                <X className="mr-1.5 h-3.5 w-3.5" /> Reset Filters
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <div
            ref={gridRef}
            className={cn(
              viewMode === 'grid'
                ? 'grid gap-5 md:grid-cols-2 xl:grid-cols-3'
                : 'flex flex-col gap-3'
            )}
          >
            {filteredPrograms.map((program) => {
              const assignedCount = program.assignedParticipants?.length || 0;
              const targetCount = Math.max(program.participantsCount || 1, 1);
              const fillPercent = Math.min(100, Math.round((assignedCount / targetCount) * 100));
              const isOnStage = program.mode === 'on-stage';
              const isGroup = program.type === 'group';
              const assignedJudges = program.judgesDetails || [];

              if (viewMode === 'list') {
                return (
                  <div
                    key={program.id}
                    onMouseMove={handleCardPointerMove}
                    className="program-anim-item group relative overflow-hidden rounded-2xl border border-border/60 bg-background/70 backdrop-blur-md p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
                  >
                    <div
                      className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      style={{
                        background:
                          'radial-gradient(420px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(59,130,246,0.12), transparent 60%)',
                      }}
                    />
                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                        <div
                          className={cn(
                            'h-10 w-10 shrink-0 rounded-xl flex items-center justify-center border',
                            isOnStage
                              ? 'bg-sky-500/10 text-sky-500 border-sky-500/20'
                              : 'bg-purple-500/10 text-purple-500 border-purple-500/20'
                          )}
                        >
                          {isOnStage ? <Mic2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-base truncate">{program.name}</h3>
                            {program.markType === 'special-mark' && (
                              <Badge variant="outline" className="text-[10px] border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                <Award className="mr-1 h-3 w-3" /> Special
                              </Badge>
                            )}
                            {program.isPublished && (
                              <Badge variant="outline" className="text-[10px] border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                Published
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {program.categoryName} • <span className="capitalize">{program.type}</span>
                            {isGroup && program.groupMembers ? ` (${program.groupMembers} members)` : ''} • <span className="capitalize">{program.mode}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 md:gap-5">
                        <div className="w-32">
                          <div className="flex justify-between text-[11px] mb-1">
                            <span className="text-muted-foreground">Entries</span>
                            <span className="font-semibold">{assignedCount}/{program.participantsCount}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all duration-500',
                                isOnStage ? 'bg-gradient-to-r from-sky-500 to-blue-600' : 'bg-gradient-to-r from-purple-500 to-pink-500'
                              )}
                              style={{ width: `${fillPercent}%` }}
                            />
                          </div>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openJudgesDialog(program)}
                          className="h-8 rounded-lg text-xs"
                        >
                          <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                          {assignedJudges.length > 0 ? `${assignedJudges.length} Judge${assignedJudges.length > 1 ? 's' : ''}` : 'Assign Judges'}
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0 shrink-0 rounded-lg">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(program)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openJudgesDialog(program)}><UserCheck className="mr-2 h-4 w-4" /> Assign Judges</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openDeleteDialog(program)} className="text-destructive"><Trash className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <Card
                  key={program.id}
                  onMouseMove={handleCardPointerMove}
                  className="program-anim-item group relative flex flex-col overflow-hidden rounded-2xl border-border/60 bg-background/70 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5"
                >
                  {/* Top Accent Gradient Strip */}
                  <div
                    className={cn(
                      'h-1.5 w-full',
                      isOnStage
                        ? 'bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500'
                        : 'bg-gradient-to-r from-purple-400 via-fuchsia-500 to-pink-500'
                    )}
                  />
                  {/* Pointer Spotlight */}
                  <div
                    className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                      background:
                        'radial-gradient(360px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(59,130,246,0.12), transparent 60%)',
                    }}
                  />

                  <CardHeader className="relative z-10 pb-3">
                    <div className="flex justify-between items-start gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-md bg-muted/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {program.categoryName}
                          </span>
                          {program.isPublished && (
                            <Badge variant="outline" className="text-[10px] border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              Published
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-lg leading-snug group-hover:text-primary transition-colors">
                          {program.name}
                        </CardTitle>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0 shrink-0 rounded-lg hover:bg-muted">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(program)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openJudgesDialog(program)}><UserCheck className="mr-2 h-4 w-4" /> Assign Judges</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openDeleteDialog(program)} className="text-destructive"><Trash className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>

                  <CardContent className="relative z-10 space-y-4 flex-grow pb-4">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          'capitalize text-xs font-medium',
                          isOnStage
                            ? 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400'
                            : 'border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400'
                        )}
                      >
                        {isOnStage ? <Mic2 className="mr-1 h-3 w-3" /> : <Sparkles className="mr-1 h-3 w-3" />}
                        {program.mode}
                      </Badge>

                      <Badge variant="secondary" className="capitalize text-xs font-medium">
                        {isGroup ? <Users className="mr-1 h-3 w-3" /> : <UserIcon className="mr-1 h-3 w-3" />}
                        {program.type}
                        {isGroup && program.groupMembers ? ` (${program.groupMembers})` : ''}
                      </Badge>

                      {program.markType === 'special-mark' && (
                        <Badge
                          variant="outline"
                          className="text-xs font-medium border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        >
                          <Award className="mr-1 h-3 w-3" /> Special Mark
                        </Badge>
                      )}
                    </div>

                    {/* Participation Capacity Progress */}
                    <div className="rounded-xl border border-border/50 bg-muted/30 p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground font-medium">Participant Entries</span>
                        <span className="font-mono font-semibold text-foreground">
                          {assignedCount} / {program.participantsCount}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500',
                            isOnStage
                              ? 'bg-gradient-to-r from-sky-500 to-blue-600'
                              : 'bg-gradient-to-r from-purple-500 to-pink-500'
                          )}
                          style={{ width: `${fillPercent}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>

                  <CardFooter className="relative z-10 flex items-center justify-between gap-2 border-t border-border/50 bg-muted/15 px-5 py-3.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {assignedJudges.length > 0 ? (
                        <>
                          <div className="flex -space-x-2">
                            {assignedJudges.slice(0, 3).map((j) => (
                              <Avatar key={j.id} className="h-7 w-7 border-2 border-background">
                                <AvatarFallback className="text-[10px] font-semibold bg-primary/15 text-primary">
                                  {j.name.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground truncate">
                            {assignedJudges.length === 1
                              ? assignedJudges[0].name
                              : `${assignedJudges.length} Judges`}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No judges assigned</span>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openJudgesDialog(program)}
                      className="h-8 px-2.5 text-xs font-medium rounded-lg hover:bg-primary/10 hover:text-primary shrink-0"
                    >
                      <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                      {assignedJudges.length > 0 ? 'Manage' : 'Assign'}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}

            {filteredPrograms.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center text-center text-muted-foreground py-16 rounded-2xl border border-dashed border-border/60 bg-muted/10">
                <div className="p-4 rounded-full bg-muted/40 mb-3">
                  <ListFilter className="h-8 w-8 opacity-60" />
                </div>
                <p className="font-semibold text-base text-foreground">No Programs Found</p>
                <p className="text-sm mt-1 max-w-sm">
                  {hasActiveFilters
                    ? 'Try adjusting or resetting your active search and filter criteria.'
                    : 'Get started by creating your first festival program.'}
                </p>
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

      {programToAssignJudges && (
        <AssignJudgesDialog
          isOpen={isJudgesDialogOpen}
          onOpenChange={setIsJudgesDialogOpen}
          program={programToAssignJudges}
          judges={judges}
          onAssign={handleAssignJudges}
        />
      )}

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. This will permanently delete the program.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


interface AssignJudgesDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  program: Program;
  judges: JudgeUser[];
  onAssign: (selectedJudges: string[]) => void;
}

function AssignJudgesDialog({ isOpen, onOpenChange, program, judges, onAssign }: AssignJudgesDialogProps) {
  const [selectedJudges, setSelectedJudges] = useState<string[]>(program.judges || []);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSelectedJudges(program.judges || []);
    }
  }, [isOpen, program.judges]);

  const handleCheckboxChange = (judgeId: string, checked: boolean) => {
    setSelectedJudges(prev =>
      checked ? [...prev, judgeId] : prev.filter(id => id !== judgeId)
    );
  };

  const handleSubmit = () => {
    onAssign(selectedJudges);
  };

  const filteredJudges = useMemo(() => {
    return judges.filter(judge => judge.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [judges, searchTerm]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Assign Judges to "{program.name}"</DialogTitle>
          <DialogDescription>
            Select the judges who will be scoring this program.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search judges..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <ScrollArea className="h-72">
            <div className="space-y-4 p-4">
              {filteredJudges.length > 0 ? (
                filteredJudges.map(judge => (
                  <div key={judge.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>{judge.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{judge.name}</p>
                        <p className="text-sm text-muted-foreground">{judge.userId}</p>
                      </div>
                    </div>
                    <Checkbox
                      id={`judge-${judge.id}`}
                      checked={selectedJudges.includes(judge.id)}
                      onCheckedChange={(checked) => handleCheckboxChange(judge.id, !!checked)}
                    />
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground py-10">
                  <Users className="mx-auto h-12 w-12" />
                  <p className="mt-4">No judges found.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
