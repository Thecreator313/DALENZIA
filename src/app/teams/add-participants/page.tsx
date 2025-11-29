'use client';

import { useState, useEffect, useMemo } from 'react';
import {
    collection,
    addDoc,
    getFirestore,
    onSnapshot,
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
import { app } from '@/lib/firebase';
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
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@/components/ui/card';
import type { Category } from '@/app/admin/categories/page';
import type { User } from '@/app/admin/access-central/page';
import type { Team } from '@/app/admin/teams/page';
import { Loader2, UserPlus, Search, MoreHorizontal, Edit, Trash, Users, Filter } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
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
import { motion, AnimatePresence } from 'framer-motion';

const db = getFirestore(app);

const participantSchema = z.object({
    name: z.string().min(1, 'Participant name is required'),
    categoryId: z.string().min(1, 'Category is required'),
});

export type Participant = z.infer<typeof participantSchema> & {
    id: string,
    chestNumber: number,
    teamId: string,
    teamName: string,
    mark: number
};


export default function AddParticipantsPage() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [team, setTeam] = useState<Team | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [participantToDelete, setParticipantToDelete] = useState<Participant | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');

    useEffect(() => {
        const storedUser = localStorage.getItem('fest-central-user');
        if (storedUser) {
            const userData: User = JSON.parse(storedUser);
            setCurrentUser(userData);
        }
    }, []);

    useEffect(() => {
        if (!currentUser) return;
        setLoading(true);

        const q = query(collection(db, 'teams'), where('leaderId', '==', currentUser.id));
        const unsubscribeTeam = onSnapshot(q, (querySnapshot) => {
            if (!querySnapshot.empty) {
                const teamDoc = querySnapshot.docs[0];
                const teamData = { id: teamDoc.id, ...teamDoc.data() } as Team;
                setTeam(teamData);

                // Now fetch participants for this team
                const participantsQuery = query(collection(db, 'students'), where('teamId', '==', teamData.id));
                const unsubscribeParticipants = onSnapshot(participantsQuery, (snapshot) => {
                    const participantList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Participant));
                    setParticipants(participantList.sort((a, b) => a.chestNumber - b.chestNumber));
                });

                return () => unsubscribeParticipants();
            }
            setLoading(false);
        });

        const categoriesCollection = collection(db, 'memberCategories');
        const unsubscribeCategories = onSnapshot(categoriesCollection, (snapshot) => {
            const catList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
            setCategories(catList);
            setLoading(false);
        });

        return () => {
            unsubscribeTeam();
            unsubscribeCategories();
        };
    }, [currentUser]);

    const form = useForm<z.infer<typeof participantSchema>>({
        resolver: zodResolver(participantSchema),
        defaultValues: { name: '', categoryId: '' },
    });

    const filteredParticipants = useMemo(() => {
        return participants
            .filter((participant) =>
                categoryFilter === 'all' ? true : participant.categoryId === categoryFilter
            )
            .filter((participant) =>
                participant.name.toLowerCase().includes(searchTerm.toLowerCase())
            );
    }, [participants, searchTerm, categoryFilter]);

    const onSubmit = async (values: z.infer<typeof participantSchema>) => {
        setIsSubmitting(true);
        if (editingParticipant) {
            try {
                const participantDoc = doc(db, 'students', editingParticipant.id);
                await updateDoc(participantDoc, values);
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
                await runTransaction(db, async (transaction) => {
                    const teamDoc = await transaction.get(teamRef);
                    if (!teamDoc.exists()) throw "Team document does not exist!";

                    const participantCountQuery = query(collection(db, 'students'), where('teamId', '==', team.id));
                    const participantDocs = await getDocs(participantCountQuery);
                    const newChestNumber = teamDoc.data().startingChestNumber + participantDocs.size;

                    const participantData = { ...values, chestNumber: newChestNumber, teamId: team.id, teamName: team.name, mark: 0 };
                    transaction.set(doc(collection(db, 'students')), participantData);
                });
                toast({ title: 'Success', description: 'Participant added successfully.' });
                form.reset({ name: '', categoryId: '' });
            } catch (error) {
                console.error('Error adding participant:', error);
                toast({ title: 'Error', description: 'Failed to add participant.', variant: 'destructive' });
            }
        }
        setIsSubmitting(false);
    };

    const handleEdit = (participant: Participant) => {
        setEditingParticipant(participant);
        form.reset(participant);
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
        form.reset({ name: '', categoryId: '' });
        setIsFormOpen(true);
    };


    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)]">
                <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
                    <Loader2 className="h-12 w-12 animate-spin text-primary relative z-10" />
                </div>
                <p className="text-muted-foreground animate-pulse mt-4">Loading Participants...</p>
            </div>
        );
    }

    if (!team) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
                <Card className="max-w-md w-full border-white/10 bg-card/40 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="text-center text-xl">No Team Assigned</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-center text-muted-foreground">You are not assigned as a leader for any team. Please contact the administrator.</p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="space-y-8 relative min-h-screen p-1">
            {/* Dynamic Background */}
            <div className="fixed inset-0 -z-10 h-full w-full bg-background overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-cyan-500/5 blur-[120px]" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
                <div>
                    <h1 className="text-3xl font-bold font-headline tracking-tight">Manage Participants</h1>
                    <p className="text-lg text-muted-foreground">Team: <span className="font-semibold text-foreground">{team?.name}</span></p>
                </div>
                <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={openAddForm} className="shadow-lg shadow-primary/20">
                            <UserPlus className="mr-2 h-4 w-4" /> Add Participant
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-background/95 backdrop-blur-xl border-white/10">
                        <DialogHeader>
                            <DialogTitle>{editingParticipant ? 'Edit Participant' : 'Add New Participant'}</DialogTitle>
                        </DialogHeader>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                <FormField control={form.control} name="name" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Participant Name</FormLabel>
                                        <FormControl><Input placeholder="John Doe" {...field} className="bg-muted/50 border-white/10" /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                                <FormField control={form.control} name="categoryId" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Category</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="bg-muted/50 border-white/10"><SelectValue placeholder="Select a category" /></SelectTrigger>
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
                                <DialogFooter>
                                    <DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
                                    <Button type="submit" disabled={isSubmitting}>
                                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        {editingParticipant ? 'Save Changes' : 'Add Participant'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </DialogContent>
                </Dialog>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
            >
                <Card className="border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
                    <CardHeader className="border-b border-white/5 bg-muted/20">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Users className="w-5 h-5 text-primary" />
                                    Participant List <Badge variant="secondary" className="ml-2">{filteredParticipants.length}</Badge>
                                </CardTitle>
                                <CardDescription>Manage and view all participants in your team.</CardDescription>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <div className="relative w-full sm:w-64">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search by name..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-10 bg-background/50 border-white/10 focus:bg-background transition-colors"
                                    />
                                </div>
                                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                    <SelectTrigger className="w-full sm:w-[180px] bg-background/50 border-white/10">
                                        <SelectValue placeholder="Filter by category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Categories</SelectItem>
                                        {categories.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            <AnimatePresence>
                                {filteredParticipants.map((participant, index) => (
                                    <motion.div
                                        key={participant.id}
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ delay: index * 0.05 }}
                                    >
                                        <Card className="flex flex-col h-full border-white/10 bg-card/60 hover:bg-card/80 transition-all duration-300 hover:shadow-lg group">
                                            <CardHeader className="pb-2">
                                                <div className="flex justify-between items-start">
                                                    <div className="space-y-1">
                                                        <CardTitle className="text-lg font-semibold leading-none">{participant.name}</CardTitle>
                                                        <p className="text-xs text-muted-foreground">Chest No: <span className="font-mono font-bold text-primary">{participant.chestNumber}</span></p>
                                                    </div>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
                                            <CardContent className="flex-grow pt-0">
                                                <Badge variant="secondary" className="mt-2 bg-secondary/50 hover:bg-secondary/70">
                                                    {categories.find(c => c.id === participant.categoryId)?.name || 'Unknown'}
                                                </Badge>
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            {filteredParticipants.length === 0 && (
                                <div className="col-span-full text-center text-muted-foreground py-12 flex flex-col items-center justify-center border border-dashed border-white/10 rounded-xl bg-muted/5">
                                    <div className="p-4 rounded-full bg-muted/10 mb-4">
                                        <Users className="h-8 w-8 opacity-50" />
                                    </div>
                                    <p className="font-semibold text-lg">No Participants Found</p>
                                    <p className="text-sm mt-1 max-w-xs mx-auto">Try adjusting your search or filter criteria, or add a new participant.</p>
                                    <Button variant="link" onClick={openAddForm} className="mt-2 text-primary">
                                        Add New Participant
                                    </Button>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent className="bg-background/95 backdrop-blur-xl border-white/10">
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
