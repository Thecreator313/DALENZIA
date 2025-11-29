
'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  getDoc,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { app } from '@/lib/firebase';
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
import { MoreHorizontal, PlusCircle, Trash, Edit, Search, UserCheck, Users, ListFilter } from 'lucide-react';
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


const db = getFirestore(app);

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
  const [programs, setPrograms] = useState<Program[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [judges, setJudges] = useState<JudgeUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [programToDelete, setProgramToDelete] = useState<Program | null>(null);
  const [isJudgesDialogOpen, setIsJudgesDialogOpen] = useState(false);
  const [programToAssignJudges, setProgramToAssignJudges] = useState<Program | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    setLoading(true);

    const categoriesCollection = collection(db, 'programCategories');
    const unsubscribeCategories = onSnapshot(categoriesCollection, (snapshot) => {
      const catList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
      setCategories(catList);
    });

    const usersCollection = collection(db, 'users');
    const unsubscribeJudges = onSnapshot(usersCollection, (snapshot) => {
      const userList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as JudgeUser));
      setJudges(userList.filter(u => u.role === 'judges'));
    });

    const programsCollection = collection(db, 'programs');
    const unsubscribePrograms = onSnapshot(programsCollection, async (snapshot) => {
      const studentDocs = await getDocs(collection(db, 'students'));
      const students = studentDocs.docs.map(doc => ({ id: doc.id, ...doc.data() } as Participant));

      const teamDocs = await getDocs(collection(db, 'teams'));
      const teams = teamDocs.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team));
      const teamNameMap = new Map(teams.map(t => [t.id, t.name]));

      const assignmentDocs = await getDocs(collection(db, 'assignments'));
      const assignments = assignmentDocs.docs.map(doc => doc.data());

      const programListPromises = snapshot.docs.map(async (programDoc) => {
        const programData = programDoc.data();
        let categoryName = 'Unknown';
        if (programData.categoryId) {
          const catDoc = await getDoc(doc(db, 'programCategories', programData.categoryId));
          if (catDoc.exists()) categoryName = catDoc.data().name;
        }

        let judgesDetails: JudgeUser[] = [];
        if (programData.judges && programData.judges.length > 0) {
          const judgePromises = programData.judges.map((judgeId: string) => getDoc(doc(db, 'users', judgeId)));
          const judgeDocs = await Promise.all(judgePromises);
          judgesDetails = judgeDocs.filter(doc => doc.exists()).map(doc => ({ id: doc.id, ...doc.data() } as JudgeUser));
        }

        const assignedParticipants = assignments
          .filter(a => a.programId === programDoc.id)
          .map(a => {
            const student = students.find(s => s.id === a.studentId);
            const teamName = teamNameMap.get(a.teamId) || 'Unknown Team';
            return student ? { ...student, teamName } : null;
          })
          .filter(Boolean) as (Participant & { teamName: string })[];

        return { id: programDoc.id, ...programData, categoryName, judgesDetails, assignedParticipants } as Program;
      });
      const programList = await Promise.all(programListPromises);
      setPrograms(programList);
      setLoading(false);
    });

    return () => {
      unsubscribeCategories();
      unsubscribeJudges();
      unsubscribePrograms();
    };
  }, []);

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
      .filter(program =>
        program.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (program.categoryName && program.categoryName.toLowerCase().includes(searchTerm.toLowerCase()))
      );
  }, [programs, searchTerm, categoryFilter]);

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

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-headline">Manage Programs</h1>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAddForm}>
              <PlusCircle className="mr-2 h-4 w-4" /> Add Program
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingProgram ? 'Edit Program' : 'Add Program'}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Program Name</FormLabel><FormControl><Input placeholder="e.g., Classical Dance Solo" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="categoryId" render={({ field }) => (
                  <FormItem><FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger></FormControl>
                      <SelectContent>{categories.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="type" render={({ field }) => (
                    <FormItem><FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent><SelectItem value="individual">Individual</SelectItem><SelectItem value="group">Group</SelectItem></SelectContent>
                      </Select>
                      <FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="mode" render={({ field }) => (
                    <FormItem><FormLabel>Mode</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent><SelectItem value="on-stage">On-Stage</SelectItem><SelectItem value="off-stage">Off-Stage</SelectItem></SelectContent>
                      </Select>
                      <FormMessage /></FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="markType" render={({ field }) => (
                    <FormItem><FormLabel>Mark Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                  <Button type="submit">{editingProgram ? 'Save Changes' : 'Create Program'}</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Program List</CardTitle>
              <CardDescription>
                Found {filteredPrograms.length} {filteredPrograms.length === 1 ? 'program' : 'programs'}.
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by program or category..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[200px]">
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
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredPrograms.map((program) => (
              <Card key={program.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <CardTitle className="text-lg">{program.name}</CardTitle>
                      <CardDescription>{program.categoryName}</CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0 shrink-0"><span className="sr-only">Open menu</span><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(program)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openJudgesDialog(program)}><UserCheck className="mr-2 h-4 w-4" /> Assign Judges</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openDeleteDialog(program)} className="text-destructive"><Trash className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 flex-grow">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={program.type === 'group' ? 'default' : 'secondary'} className="capitalize">{program.type}</Badge>
                    <Badge variant={program.mode === 'on-stage' ? 'outline' : 'destructive'} className="capitalize">{program.mode}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-2 border-t pt-3">
                    <div className="flex justify-between"><span>Participants:</span> <strong>{program.assignedParticipants?.length || 0} / {program.participantsCount}</strong></div>
                    {program.type === 'group' && <div className="flex justify-between"><span>Group Members:</span> <strong>{program.groupMembers}</strong></div>}
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col items-start gap-2 border-t pt-4">
                  <h4 className="text-sm font-semibold">Assigned Judges</h4>
                  <div className="flex flex-wrap gap-1">
                    {program.judgesDetails && program.judgesDetails.length > 0
                      ? program.judgesDetails.map(j => <Badge key={j.id} variant="secondary">{j.name}</Badge>)
                      : <Badge variant="outline">None Assigned</Badge>
                    }
                  </div>
                </CardFooter>
              </Card>
            ))}
            {filteredPrograms.length === 0 && (
              <div className="col-span-full text-center text-muted-foreground py-10">
                <ListFilter className="mx-auto h-12 w-12" />
                <p className="mt-4 font-semibold">No Programs Found</p>
                <p className="text-sm mt-1">Try adjusting your search or filter criteria.</p>
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
