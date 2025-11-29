
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
  getDoc,
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
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { Category } from '@/app/admin/categories/page';
import type { User } from '@/app/admin/access-central/page';
import type { Team } from '@/app/admin/teams/page.tsx';
import { Loader2, UserPlus, Search, MoreHorizontal, Edit, Trash } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
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
                setParticipants(participantList.sort((a,b) => a.chestNumber - b.chestNumber));
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
    return <div>Loading...</div>;
  }
  
  if (!team) {
      return (
          <Card>
              <CardHeader><CardTitle>No Team Assigned</CardTitle></CardHeader>
              <CardContent><p>You are not assigned as a leader for any team.</p></CardContent>
          </Card>
      )
  }

  return (
    <div className="space-y-6">
       <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-headline">Manage Participants for {team?.name}</h1>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
                <Button onClick={openAddForm}>
                    <UserPlus className="mr-2 h-4 w-4" /> Add Participant
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{editingParticipant ? 'Edit Participant' : 'Add New Participant'}</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField control={form.control} name="name" render={({ field }) => (
                            <FormItem>
                            <FormLabel>Participant Name</FormLabel>
                            <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                            <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="categoryId" render={({ field }) => (
                            <FormItem>
                            <FormLabel>Category</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
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
                            <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {editingParticipant ? 'Save Changes' : 'Add Participant'}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
      </div>
      
       <Card>
        <CardHeader>
            <CardTitle>Participant List ({filteredParticipants.length})</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="flex items-center gap-4 mb-4">
                <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search by name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
                </SelectContent>
                </Select>
            </div>
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead>Chest No.</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {filteredParticipants.map((participant) => (
                    <TableRow key={participant.id}>
                        <TableCell>{participant.chestNumber}</TableCell>
                        <TableCell className="font-medium">{participant.name}</TableCell>
                        <TableCell>{categories.find(c => c.id === participant.categoryId)?.name || 'Unknown'}</TableCell>
                        <TableCell className="text-right">
                            <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
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
                                    className="text-destructive"
                                >
                                    <Trash className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                    </TableRow>
                ))}
                </TableBody>
            </Table>
        </CardContent>
        </Card>

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the participant.
                    The chest number will not be reused.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive hover:bg-destructive/90"
                    >
                    Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
  );
}
