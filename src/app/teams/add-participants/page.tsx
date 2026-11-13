'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import {
    collection,
    query,
    where,
    getDocs,
    doc,
    runTransaction,
    updateDoc,
    deleteDoc,
} from 'firebase/firestore';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { db } from '@/lib/firebase';
import { useCachedCollection, useSharedCollection } from '@/context/firestore-cache';
import { TeamOrbitCanvas } from '@/components/team-orbit-canvas';
import { AnimatedCounter } from '@/components/animated-counter';
import { Button } from '@/components/ui/button';
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
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Category } from '@/app/admin/categories/page';
import type { User } from '@/app/admin/access-central/page';
import {
    Loader2,
    UserPlus,
    Search,
    MoreHorizontal,
    Edit,
    Trash,
    Users,
    Hash,
    X,
    LayoutGrid,
    List as ListIcon,
    Sparkles,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
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
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const participantSchema = z.object({
    name: z.string().min(1, 'Participant name is required'),
    categoryId: z.string().min(1, 'Category is required'),
    chestNumber: z.coerce
        .number({ invalid_type_error: 'Chest number must be a valid number' })
        .int('Chest number must be a whole number')
        .min(1, 'Chest number must be at least 1'),
});

export type Participant = z.infer<typeof participantSchema> & {
    id: string,
    chestNumber: number,
    teamId: string,
    teamName: string,
    mark: number
};


export default function AddParticipantsPage() {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [userChecked, setUserChecked] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [participantToDelete, setParticipantToDelete] = useState<Participant | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

    const pageRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const heroAnimatedRef = useRef(false);

    useEffect(() => {
        const storedUser = localStorage.getItem('fest-central-user');
        if (storedUser) {
            const userData: User = JSON.parse(storedUser);
            setCurrentUser(userData);
        }
        setUserChecked(true);
    }, []);

    const { data: userTeams, loading: teamLoading } = useCachedCollection<{
        id: string;
        name: string;
        leaderId: string;
        startingChestNumber: number;
        mark: number;
    }>(
        currentUser ? `query:team:${currentUser.id}` : 'query:team:none',
        () => query(collection(db, 'teams'), where('leaderId', '==', currentUser!.id)),
        { enabled: !!currentUser }
    );
    const team = userTeams[0] ?? null;

    const { data: rawParticipants, loading: studentsLoading } = useCachedCollection<Participant>(
        team ? `query:students:${team.id}` : 'query:students:none',
        () => query(collection(db, 'students'), where('teamId', '==', team!.id)),
        { enabled: !!team }
    );

    const { data: categories, loading: catsLoading } = useSharedCollection<Category>('memberCategories');

    const participants = useMemo(
        () => [...rawParticipants].sort((a, b) => a.chestNumber - b.chestNumber),
        [rawParticipants]
    );

    const loading =
        !userChecked ||
        (!!currentUser && (teamLoading || (!!team && studentsLoading))) ||
        catsLoading;

    const form = useForm<z.infer<typeof participantSchema>>({
        resolver: zodResolver(participantSchema),
        defaultValues: { name: '', categoryId: '', chestNumber: 1 },
    });

    const nextChestNumber = useMemo(() => {
        if (!team) return 1;
        const maxExisting = participants.reduce(
            (max, p) => Math.max(max, Number(p.chestNumber) || 0),
            (team.startingChestNumber || 1) - 1
        );
        return Math.max(maxExisting + 1, (team.startingChestNumber || 1) + participants.length);
    }, [team, participants]);

    const categoryMap = useMemo(
        () => new Map(categories.map((c) => [c.id, c.name])),
        [categories]
    );

    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const p of participants) {
            counts[p.categoryId] = (counts[p.categoryId] || 0) + 1;
        }
        return counts;
    }, [participants]);

    const filteredParticipants = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return participants
            .filter((participant) =>
                categoryFilter === 'all' ? true : participant.categoryId === categoryFilter
            )
            .filter((participant) =>
                !q
                    ? true
                    : participant.name.toLowerCase().includes(q) ||
                      String(participant.chestNumber).includes(q)
            );
    }, [participants, searchTerm, categoryFilter]);

    const hasActiveFilters = searchTerm !== '' || categoryFilter !== 'all';

    const resetFilters = () => {
        setSearchTerm('');
        setCategoryFilter('all');
    };

    useEffect(() => {
        if (loading || !team || heroAnimatedRef.current || !pageRef.current) return;
        heroAnimatedRef.current = true;

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) return;

        const ctx = gsap.context(() => {
            gsap.from('.roster-hero-stagger', {
                y: 22,
                opacity: 0,
                duration: 0.65,
                stagger: 0.08,
                ease: 'power3.out',
                clearProps: 'transform,opacity',
            });
            gsap.from('.roster-kpi-pill', {
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
    }, [loading, team]);

    useEffect(() => {
        if (loading || !team || !gridRef.current) return;
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) return;

        const ctx = gsap.context(() => {
            const items = gsap.utils.toArray<HTMLElement>('.roster-anim-item');
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
    }, [loading, team, categoryFilter, viewMode]);

    const onSubmit = async (values: z.infer<typeof participantSchema>) => {
        setIsSubmitting(true);
        if (editingParticipant) {
            try {
                if (values.chestNumber !== editingParticipant.chestNumber) {
                    const duplicateQuery = query(
                        collection(db, 'students'),
                        where('chestNumber', '==', values.chestNumber)
                    );
                    const duplicateSnap = await getDocs(duplicateQuery);
                    const conflictDoc = duplicateSnap.docs.find((d) => d.id !== editingParticipant.id);
                    if (conflictDoc) {
                        const conflictData = conflictDoc.data();
                        form.setError('chestNumber', {
                            type: 'manual',
                            message: `Chest #${values.chestNumber} is already assigned to ${conflictData.name || 'another participant'}.`,
                        });
                        toast({
                            title: 'Duplicate Chest Number',
                            description: `Chest #${values.chestNumber} is already used by ${conflictData.name || 'another participant'}.`,
                            variant: 'destructive',
                        });
                        setIsSubmitting(false);
                        return;
                    }
                }

                const participantDoc = doc(db, 'students', editingParticipant.id);
                await updateDoc(participantDoc, {
                    name: values.name.trim(),
                    categoryId: values.categoryId,
                    chestNumber: values.chestNumber,
                });
                toast({ title: 'Success', description: 'Participant updated successfully.' });
                setEditingParticipant(null);
                setIsFormOpen(false);
            } catch (error) {
                console.error('Error updating participant:', error);
                toast({ title: 'Error', description: 'Failed to update participant.', variant: 'destructive' });
            }
        } else {
            if (!team) {
                toast({ title: 'Error', description: 'Could not find your team.', variant: 'destructive' });
                setIsSubmitting(false);
                return;
            }
            try {
                const teamRef = doc(db, 'teams', team.id);
                let createdChestNumber = nextChestNumber;
                await runTransaction(db, async (transaction) => {
                    const teamDoc = await transaction.get(teamRef);
                    if (!teamDoc.exists()) throw "Team document does not exist!";

                    const participantCountQuery = query(collection(db, 'students'), where('teamId', '==', team.id));
                    const participantDocs = await getDocs(participantCountQuery);
                    const starting = Number(teamDoc.data().startingChestNumber) || 1;
                    const existingMax = participantDocs.docs.reduce(
                        (max, d) => Math.max(max, Number(d.data().chestNumber) || 0),
                        starting - 1
                    );
                    const newChestNumber = Math.max(existingMax + 1, starting + participantDocs.size);
                    createdChestNumber = newChestNumber;

                    const participantData = {
                        name: values.name.trim(),
                        categoryId: values.categoryId,
                        chestNumber: newChestNumber,
                        teamId: team.id,
                        teamName: team.name,
                        mark: 0,
                    };
                    transaction.set(doc(collection(db, 'students')), participantData);
                });
                toast({ title: 'Success', description: `Participant added with Chest #${createdChestNumber}.` });
                form.reset({ name: '', categoryId: '', chestNumber: createdChestNumber + 1 });
            } catch (error) {
                console.error('Error adding participant:', error);
                toast({ title: 'Error', description: 'Failed to add participant.', variant: 'destructive' });
            }
        }
        setIsSubmitting(false);
    };

    const handleEdit = (participant: Participant) => {
        setEditingParticipant(participant);
        form.reset({
            name: participant.name,
            categoryId: participant.categoryId,
            chestNumber: participant.chestNumber,
        });
        setIsFormOpen(true);
    };

    const handleDelete = async () => {
        if (!participantToDelete) return;
        try {
            await deleteDoc(doc(db, 'students', participantToDelete.id));
            toast({ title: 'Success', description: 'Participant deleted successfully.' });
            setParticipantToDelete(null);
            setIsDeleteDialogOpen(false);
        } catch (error) {
            console.error('Error deleting participant:', error);
            toast({ title: 'Error', description: 'Failed to delete participant.', variant: 'destructive' });
        }
    };

    const openDeleteDialog = (participant: Participant) => {
        setParticipantToDelete(participant);
        setIsDeleteDialogOpen(true);
    };

    const openAddForm = () => {
        setEditingParticipant(null);
        form.reset({ name: '', categoryId: '', chestNumber: nextChestNumber });
        setIsFormOpen(true);
    };


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
                <p className="text-muted-foreground animate-pulse font-medium">Loading Team Roster...</p>
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

    return (
        <div ref={pageRef} className="space-y-6 sm:space-y-8 relative min-h-screen pb-8">
            {/* Ambient Background */}
            <div className="fixed inset-0 -z-10 h-full w-full overflow-hidden pointer-events-none">
                <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-cyan-500/10 blur-[120px]" />
                <div className="absolute top-1/3 -right-24 w-96 h-96 rounded-full bg-blue-500/10 blur-[120px]" />
                <div className="absolute -bottom-24 left-1/3 w-80 h-80 rounded-full bg-emerald-500/10 blur-[120px]" />
            </div>

            {/* Hero Roster Banner with Three.js Sculpture */}
            <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card/85 via-card/65 to-cyan-500/10 backdrop-blur-xl shadow-xl">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,0.16),transparent_55%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.12),transparent_50%)] pointer-events-none" />
                <div className="grid lg:grid-cols-[1.45fr_1fr] items-center gap-5 sm:gap-6 p-4 sm:p-8 relative z-10">
                    <div className="space-y-5 sm:space-y-6">
                        <div className="space-y-2.5 sm:space-y-3">
                            <div className="roster-hero-stagger inline-flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-600 dark:text-cyan-400">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
                                    </span>
                                    Team Roster • {team.name}
                                </span>
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                                    <Hash className="h-3 w-3 text-primary" />
                                    Next Chest #{nextChestNumber}
                                </span>
                            </div>

                            <div className="roster-hero-stagger">
                                <h1 className="text-2xl sm:text-4xl font-bold font-headline tracking-tight bg-gradient-to-r from-foreground via-foreground to-cyan-500 bg-clip-text text-transparent">
                                    Manage Participants
                                </h1>
                                <p className="text-muted-foreground mt-1 max-w-xl text-xs sm:text-base">
                                    Register team members with automatic chest numbering and organize them across member categories.
                                </p>
                            </div>
                        </div>

                        <div className="roster-hero-stagger flex flex-wrap items-center gap-3">
                            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                                <DialogTrigger asChild>
                                    <Button
                                        onClick={openAddForm}
                                        size="lg"
                                        className="w-full sm:w-auto rounded-xl shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/35 hover:-translate-y-0.5 transition-all duration-200 bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 text-white border-0"
                                    >
                                        <UserPlus className="mr-2 h-4 w-4" /> Add Participant
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-md w-[92vw] max-h-[90vh] overflow-y-auto rounded-2xl bg-background/95 backdrop-blur-xl border-border/60 p-4 sm:p-6">
                                    <DialogHeader>
                                        <DialogTitle className="text-xl font-headline">
                                            {editingParticipant ? 'Edit Participant' : 'Register New Participant'}
                                        </DialogTitle>
                                        <DialogDescription>
                                            {editingParticipant
                                                ? `Updating participant #${editingParticipant.chestNumber}.`
                                                : `Chest number #${nextChestNumber} will be assigned automatically.`}
                                        </DialogDescription>
                                    </DialogHeader>
                                    <Form {...form}>
                                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                            <FormField control={form.control} name="name" render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Participant Name</FormLabel>
                                                    <FormControl><Input placeholder="John Doe" {...field} className="bg-muted/40 border-border/60" /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )} />
                                            <FormField control={form.control} name="categoryId" render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Category</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger className="bg-muted/40 border-border/60"><SelectValue placeholder="Select a category" /></SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {categories.map((cat) => (
                                                                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )} />
                                            {editingParticipant && (
                                                <FormField control={form.control} name="chestNumber" render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Chest Number</FormLabel>
                                                        <FormControl>
                                                            <div className="relative">
                                                                <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                                                <Input
                                                                    type="number"
                                                                    min={1}
                                                                    step={1}
                                                                    placeholder="e.g., 101"
                                                                    {...field}
                                                                    value={field.value ?? ''}
                                                                    className="bg-muted/40 border-border/60 pl-9 font-mono"
                                                                />
                                                            </div>
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )} />
                                            )}
                                            <DialogFooter className="gap-2 sm:gap-0 pt-2">
                                                <DialogClose asChild><Button type="button" variant="outline" className="w-full sm:w-auto">Cancel</Button></DialogClose>
                                                <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                    {editingParticipant ? 'Save Changes' : 'Add Participant'}
                                                </Button>
                                            </DialogFooter>
                                        </form>
                                    </Form>
                                </DialogContent>
                            </Dialog>
                        </div>

                        {/* Interactive Category KPI Strip */}
                        <div className="flex flex-wrap gap-2 sm:gap-2.5 pt-1">
                            <button
                                type="button"
                                onClick={() => setCategoryFilter('all')}
                                className={cn(
                                    'roster-kpi-pill flex-1 min-w-[95px] sm:min-w-[120px] text-left rounded-2xl border backdrop-blur-md p-2.5 sm:p-3 transition-all duration-200 hover:-translate-y-0.5',
                                    categoryFilter === 'all'
                                        ? 'border-primary/50 bg-primary/10 shadow-md ring-1 ring-primary/25'
                                        : 'border-border/60 bg-background/60 hover:border-primary/30'
                                )}
                            >
                                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                                    All Members
                                </span>
                                <div className="text-lg sm:text-xl font-bold font-headline mt-0.5">
                                    <AnimatedCounter value={participants.length} />
                                </div>
                            </button>

                            {categories.map((cat) => {
                                const isActive = categoryFilter === cat.id;
                                return (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => setCategoryFilter(cat.id)}
                                        className={cn(
                                            'roster-kpi-pill flex-1 min-w-[95px] sm:min-w-[120px] text-left rounded-2xl border backdrop-blur-md p-2.5 sm:p-3 transition-all duration-200 hover:-translate-y-0.5',
                                            isActive
                                                ? 'border-cyan-500/50 bg-cyan-500/10 shadow-md ring-1 ring-cyan-500/25'
                                                : 'border-border/60 bg-background/60 hover:border-cyan-500/30'
                                        )}
                                    >
                                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block truncate max-w-[120px] sm:max-w-[140px]">
                                            {cat.name}
                                        </span>
                                        <div className="text-lg sm:text-xl font-bold font-headline mt-0.5">
                                            <AnimatedCounter value={categoryCounts[cat.id] || 0} />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Interactive Three.js Crest */}
                    <div className="relative h-56 sm:h-72 lg:h-80 w-full rounded-2xl border border-border/40 bg-gradient-to-b from-cyan-500/5 via-transparent to-emerald-500/5 overflow-hidden">
                        <TeamOrbitCanvas variant="participants" pulseKey={participants.length} />
                        <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-background/75 backdrop-blur-md border border-border/50 px-2.5 py-1">
                                <Users className="h-3 w-3 text-cyan-500" />
                                {participants.length} Registered
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-background/75 backdrop-blur-md border border-border/50 px-2.5 py-1">
                                <Sparkles className="h-3 w-3 text-emerald-500" />
                                Start #{team.startingChestNumber}
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Roster Card */}
            <Card className="border-border/60 bg-card/55 backdrop-blur-xl shadow-lg overflow-hidden">
                <CardHeader className="border-b border-border/50 bg-muted/20 p-4 sm:p-6 space-y-3 sm:space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                                <Users className="w-5 h-5 text-primary" />
                                Participant Roster
                                <Badge variant="secondary" className="rounded-full font-mono text-xs">
                                    {filteredParticipants.length} / {participants.length}
                                </Badge>
                            </CardTitle>
                            <CardDescription className="text-xs sm:text-sm">Search by name or chest number, or switch between Cards and Table view.</CardDescription>
                        </div>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search name or chest #..."
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
                                <SelectTrigger className="w-full sm:w-[190px] bg-background/70 border-border/60 rounded-xl text-sm">
                                    <SelectValue placeholder="Filter by category" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Categories</SelectItem>
                                    {categories.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
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
                                    <LayoutGrid className="h-3.5 w-3.5" /> Cards
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('table')}
                                    className={cn(
                                        'flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                                        viewMode === 'table'
                                            ? 'bg-primary text-primary-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    <ListIcon className="h-3.5 w-3.5" /> Table
                                </button>
                            </div>
                        </div>
                    </div>

                    {hasActiveFilters && (
                        <div className="flex justify-end">
                            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-7 text-xs text-muted-foreground hover:text-foreground">
                                <X className="mr-1 h-3.5 w-3.5" /> Reset Filters
                            </Button>
                        </div>
                    )}
                </CardHeader>

                <CardContent className={viewMode === 'table' ? 'p-0' : 'p-3.5 sm:p-6'}>
                    <div ref={gridRef}>
                        {viewMode === 'table' ? (
                            <>
                                {/* Mobile Card List (< md) */}
                                <div className="block md:hidden divide-y divide-border/40 p-2 sm:p-3 space-y-2">
                                    {filteredParticipants.map((participant) => {
                                        const categoryName = categoryMap.get(participant.categoryId) || 'Unknown';
                                        return (
                                            <div
                                                key={participant.id}
                                                className="roster-anim-item flex items-center justify-between p-3 rounded-xl bg-card/60 border border-border/40 backdrop-blur-sm"
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <Avatar className="h-9 w-9 border border-border/60 shrink-0">
                                                        <AvatarFallback className="text-xs font-bold bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
                                                            {participant.name.charAt(0).toUpperCase()}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold text-sm truncate text-foreground">{participant.name}</span>
                                                            <Badge variant="outline" className="font-mono text-[10px] font-bold text-primary border-primary/25 bg-primary/10 px-1.5 py-0">
                                                                #{participant.chestNumber}
                                                            </Badge>
                                                        </div>
                                                        <Badge variant="secondary" className="mt-1 text-[10px] px-1.5 py-0">
                                                            {categoryName}
                                                        </Badge>
                                                    </div>
                                                </div>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0 rounded-lg shrink-0">
                                                            <span className="sr-only">Open menu</span>
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => handleEdit(participant)}>
                                                            <Edit className="mr-2 h-4 w-4" /> Edit
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => openDeleteDialog(participant)}
                                                            className="text-destructive focus:text-destructive"
                                                        >
                                                            <Trash className="mr-2 h-4 w-4" /> Delete
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        );
                                    })}
                                    {filteredParticipants.length === 0 && (
                                        <div className="text-center text-muted-foreground py-8 text-sm">
                                            No participants found.
                                        </div>
                                    )}
                                </div>

                                {/* Desktop Table (>= md) */}
                                <div className="hidden md:block">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="hover:bg-transparent border-border/50">
                                                <TableHead>Chest No.</TableHead>
                                                <TableHead>Participant</TableHead>
                                                <TableHead>Category</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredParticipants.map((participant) => {
                                                const categoryName = categoryMap.get(participant.categoryId) || 'Unknown';
                                                return (
                                                    <TableRow
                                                        key={participant.id}
                                                        className="roster-anim-item border-b border-border/40 hover:bg-muted/30 transition-colors"
                                                    >
                                                        <TableCell>
                                                            <Badge variant="outline" className="font-mono font-bold text-primary border-primary/25 bg-primary/10">
                                                                #{participant.chestNumber}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center gap-3">
                                                                <Avatar className="h-8 w-8 border border-border/60">
                                                                    <AvatarFallback className="text-xs font-bold bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
                                                                        {participant.name.charAt(0).toUpperCase()}
                                                                    </AvatarFallback>
                                                                </Avatar>
                                                                <span className="font-medium">{participant.name}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="secondary">{categoryName}</Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button variant="ghost" className="h-8 w-8 p-0 rounded-lg">
                                                                        <span className="sr-only">Open menu</span>
                                                                        <MoreHorizontal className="h-4 w-4" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuItem onClick={() => handleEdit(participant)}>
                                                                        <Edit className="mr-2 h-4 w-4" /> Edit
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem
                                                                        onClick={() => openDeleteDialog(participant)}
                                                                        className="text-destructive focus:text-destructive"
                                                                    >
                                                                        <Trash className="mr-2 h-4 w-4" /> Delete
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                            {filteredParticipants.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={4} className="h-28 text-center text-muted-foreground">
                                                        No participants found.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </>
                        ) : (
                            <div className="grid gap-3 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {filteredParticipants.map((participant) => {
                                    const categoryName = categoryMap.get(participant.categoryId) || 'Unknown';
                                    return (
                                        <Card
                                            key={participant.id}
                                            onMouseMove={handleCardPointerMove}
                                            className="roster-anim-item group relative flex flex-col overflow-hidden rounded-2xl border-border/60 bg-background/70 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/40 hover:shadow-xl"
                                        >
                                            <div className="h-1.5 w-full bg-gradient-to-r from-cyan-400 via-blue-500 to-emerald-400" />
                                            <div
                                                className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                                style={{
                                                    background:
                                                        'radial-gradient(300px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(6,182,212,0.12), transparent 60%)',
                                                }}
                                            />
                                            <CardHeader className="relative z-10 pb-3">
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <Avatar className="h-10 w-10 border border-border/60 shrink-0">
                                                            <AvatarFallback className="text-sm font-bold bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
                                                                {participant.name.charAt(0).toUpperCase()}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div className="min-w-0">
                                                            <CardTitle className="text-base font-semibold truncate group-hover:text-primary transition-colors">
                                                                {participant.name}
                                                            </CardTitle>
                                                            <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400 mt-0.5">
                                                                #{participant.chestNumber}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0 shrink-0 rounded-lg">
                                                                <span className="sr-only">Open menu</span>
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={() => handleEdit(participant)}>
                                                                <Edit className="mr-2 h-4 w-4" /> Edit
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onClick={() => openDeleteDialog(participant)}
                                                                className="text-destructive focus:text-destructive"
                                                            >
                                                                <Trash className="mr-2 h-4 w-4" /> Delete
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="relative z-10 pt-0 flex items-center justify-between">
                                                <Badge variant="secondary" className="bg-secondary/60">
                                                    {categoryName}
                                                </Badge>
                                                <span className="text-[11px] text-muted-foreground font-mono">
                                                    Chest {participant.chestNumber}
                                                </span>
                                            </CardContent>
                                        </Card>
                                    );
                                })}

                                {filteredParticipants.length === 0 && (
                                    <div className="col-span-full text-center text-muted-foreground py-14 flex flex-col items-center justify-center border border-dashed border-border/60 rounded-2xl bg-muted/10">
                                        <div className="p-4 rounded-full bg-muted/30 mb-3">
                                            <Users className="h-8 w-8 opacity-50" />
                                        </div>
                                        <p className="font-semibold text-base text-foreground">No Participants Found</p>
                                        <p className="text-sm mt-1 max-w-xs mx-auto">
                                            {hasActiveFilters
                                                ? 'Try adjusting or clearing your search and category filter.'
                                                : 'Register your first team participant to get started.'}
                                        </p>
                                        <Button variant="outline" size="sm" onClick={hasActiveFilters ? resetFilters : openAddForm} className="mt-4 rounded-xl">
                                            {hasActiveFilters ? 'Reset Filters' : 'Add New Participant'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent className="bg-background/95 backdrop-blur-xl border-border/60">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the participant <span className="font-bold text-foreground">{participantToDelete?.name}</span>.
                            The chest number will not be reused.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            Delete Participant
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
