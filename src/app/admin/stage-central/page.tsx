
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
  query,
  where,
  getDoc,
  arrayUnion,
  arrayRemove,
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
import { MoreHorizontal, PlusCircle, Trash, Edit, Tv, User, Loader2, Link as LinkIcon, Search } from 'lucide-react';
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
import type { User as StageControllerUser } from '@/app/admin/access-central/page';
import type { Program } from '@/app/admin/programs/page';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";


const db = getFirestore(app);

const stageSchema = z.object({
  name: z.string().min(1, 'Stage name is required'),
  controllerId: z.string().min(1, 'Stage controller is required'),
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
}

type ProgramWithStatus = Program & {
    status: {
        key: 'not_started' | 'reporting' | 'ready' | 'judging' | 'completed';
        text: string;
        className: string;
    }
}

export type Stage = z.infer<typeof stageSchema> & {
    id: string; 
    controllerName?: string;
    programIds?: string[];
    programs?: ProgramWithStatus[];
};


const getProgramStatus = (program: Program, allAssignments: Assignment[], allScores: Score[]) => {
    const programAssignments = allAssignments.filter(a => a.programId === program.id && a.status !== 'cancelled');
    const reportedAssignments = programAssignments.filter(a => a.codeLetter);
    const reportedAssignmentIds = reportedAssignments.map(a => a.id);
    const programScores = allScores.filter(s => reportedAssignmentIds.includes(s.assignmentId));

    const totalParticipants = programAssignments.length;
    const reportedCount = reportedAssignments.length;
    const expectedScores = reportedCount * (program.judges?.length || 1);
    const actualScores = programScores.length;

    if (reportedCount === 0) {
        return { key: 'not_started', text: 'Not Started', className: 'bg-gray-400' };
    }
    if (reportedCount < totalParticipants) {
        return { key: 'reporting', text: 'Reporting', className: 'bg-orange-400' };
    }
    // Reporting is complete
    if (actualScores === 0) {
        return { key: 'ready', text: 'Ready for Judging', className: 'bg-blue-500' };
    }
    if (actualScores < expectedScores) {
        return { key: 'judging', text: 'Judging in Progress', className: 'bg-yellow-400' };
    }
    return { key: 'completed', text: 'Completed', className: 'bg-green-500' };
};


export default function StageCentralPage() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [controllers, setControllers] = useState<StageControllerUser[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [allAssignments, setAllAssignments] = useState<Assignment[]>([]);
  const [allScores, setAllScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [stageToDelete, setStageToDelete] = useState<Stage | null>(null);
  
  const [stageToAssign, setStageToAssign] = useState<Stage | null>(null);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);


  useEffect(() => {
    setLoading(true);

    const usersQuery = query(collection(db, 'users'), where('role', '==', 'stagecontroller'));
    const unsubscribeControllers = onSnapshot(usersQuery, (snapshot) => {
        setControllers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StageControllerUser)));
    });

    const programsQuery = collection(db, 'programs');
    const unsubscribePrograms = onSnapshot(programsQuery, async (snapshot) => {
        const programListPromises = snapshot.docs.map(async (p) => {
            const programData = p.data();
             let categoryName = 'Unknown';
            if (programData.categoryId) {
                const catDoc = await getDoc(doc(db, 'programCategories', programData.categoryId));
                if (catDoc.exists()) categoryName = catDoc.data().name;
            }
            let judgesDetails: StageControllerUser[] = [];
            if (programData.judges && programData.judges.length > 0) {
                const judgePromises = programData.judges.map((judgeId: string) => getDoc(doc(db, 'users', judgeId)));
                const judgeDocs = await Promise.all(judgePromises);
                judgesDetails = judgeDocs.filter(doc => doc.exists()).map(doc => ({ id: doc.id, ...doc.data() } as StageControllerUser));
            }
            return { id: p.id, ...programData, categoryName, judgesDetails } as Program;
        });
        Promise.all(programListPromises).then(setPrograms);
    });
    
    const unsubscribeAssignments = onSnapshot(collection(db, 'assignments'), (snapshot) => {
        setAllAssignments(snapshot.docs.map(d => ({id: d.id, ...d.data()}) as Assignment));
    });

    const unsubscribeScores = onSnapshot(collection(db, 'scores'), (snapshot) => {
        setAllScores(snapshot.docs.map(d => d.data() as Score));
    });

    const stagesQuery = collection(db, 'stages');
    const unsubscribeStages = onSnapshot(stagesQuery, async (snapshot) => {
        const stageListPromises = snapshot.docs.map(async (stageDoc) => {
            const stageData = stageDoc.data() as Omit<Stage, 'id'|'programs'>;
            let controllerName = 'Unknown';
            if(stageData.controllerId) {
                const controllerDoc = await getDoc(doc(db, 'users', stageData.controllerId));
                if(controllerDoc.exists()) controllerName = controllerDoc.data().name;
            }
            return { id: stageDoc.id, ...stageData, controllerName } as Stage;
        });
        const stageList = await Promise.all(stageListPromises);
        setStages(stageList);
        setLoading(false);
    });

    return () => {
        unsubscribeControllers();
        unsubscribePrograms();
        unsubscribeStages();
        unsubscribeAssignments();
        unsubscribeScores();
    };

  }, []);
  
  const stagesWithProgramDetails = useMemo(() => {
    return stages.map(stage => {
      if (!stage.programIds) return { ...stage, programs: [] };

      const stagePrograms = programs
        .filter(p => stage.programIds?.includes(p.id))
        .map(p => ({
          ...p,
          status: getProgramStatus(p, allAssignments, allScores)
        }));
        
      return { ...stage, programs: stagePrograms };
    });
  }, [stages, programs, allAssignments, allScores]);
  
  const form = useForm<z.infer<typeof stageSchema>>({
    resolver: zodResolver(stageSchema),
    defaultValues: { name: '', controllerId: '' },
  });

  const onSubmit = async (values: z.infer<typeof stageSchema>) => {
    try {
      if (editingStage) {
        const stageDoc = doc(db, 'stages', editingStage.id);
        await updateDoc(stageDoc, values);
        toast({ title: 'Success', description: 'Stage updated successfully.' });
      } else {
        await addDoc(collection(db, 'stages'), { ...values, programIds: [] });
        toast({ title: 'Success', description: 'Stage added successfully.' });
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
    form.reset(stage);
    setIsFormOpen(true);
  };

  const handleDelete = async () => {
    if (!stageToDelete) return;
    try {
      await deleteDoc(doc(db, 'stages', stageToDelete.id));
      toast({ title: 'Success', description: 'Stage deleted successfully.' });
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
    form.reset({ name: '', controllerId: '' });
    setIsFormOpen(true);
  };

  const openAssignDialog = (stage: Stage) => {
    setStageToAssign(stage);
    setIsAssignDialogOpen(true);
  }

  const handleAssignPrograms = async (programIds: string[]) => {
      if(!stageToAssign) return;

      try {
          const stageDoc = doc(db, 'stages', stageToAssign.id);
          const currentProgramIds = stageToAssign.programIds || [];
          
          const toAdd = programIds.filter(id => !currentProgramIds.includes(id));
          const toRemove = currentProgramIds.filter(id => !programIds.includes(id));

          if (toAdd.length > 0) {
            await updateDoc(stageDoc, { programIds: arrayUnion(...toAdd) });
          }
          if (toRemove.length > 0) {
            await updateDoc(stageDoc, { programIds: arrayRemove(...toRemove) });
          }

          toast({ title: 'Success', description: 'Program assignments updated successfully.' });
          setIsAssignDialogOpen(false);
          setStageToAssign(null);
      } catch (error) {
          console.error("Error assigning programs:", error);
          toast({ title: 'Error', description: 'Failed to assign programs.', variant: 'destructive' });
      }
  };
  

  if (loading) {
    return (
        <div className="flex items-center justify-center h-full">
            <Loader2 className="mr-2 h-8 w-8 animate-spin" />
            <span>Loading Stages...</span>
        </div>
    );
  }


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-headline">Stage Central</h1>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAddForm}>
              <PlusCircle className="mr-2 h-4 w-4" /> Add Stage
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingStage ? 'Edit Stage' : 'Add New Stage'}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Stage Name</FormLabel><FormControl><Input placeholder="e.g., Main Stage" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="controllerId" render={({ field }) => (
                  <FormItem><FormLabel>Stage Controller</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select a controller" /></SelectTrigger></FormControl>
                      <SelectContent>{controllers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  <FormMessage /></FormItem>
                )} />
                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                  <Button type="submit">{editingStage ? 'Save Changes' : 'Create Stage'}</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {stagesWithProgramDetails.map((stage) => (
              <Card key={stage.id} className="flex flex-col">
                  <CardHeader>
                      <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="flex items-center gap-2"><Tv /> {stage.name}</CardTitle>
                            <CardDescription className="flex items-center gap-2 mt-2"><User className="h-4 w-4" /> {stage.controllerName}</CardDescription>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0"><span className="sr-only">Open menu</span><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem onClick={() => handleEdit(stage)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openDeleteDialog(stage)} className="text-destructive"><Trash className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                           </DropdownMenu>
                      </div>
                  </CardHeader>
                  <CardContent className="flex-grow">
                      <h4 className="font-semibold text-sm mb-2">Assigned Programs ({stage.programs?.length || 0})</h4>
                      <ScrollArea className="h-40">
                          <div className="space-y-2 pr-4">
                              {stage.programs && stage.programs.length > 0 ? (
                                  stage.programs.map(p => (
                                    <div key={p.id} className="flex items-center gap-2 text-sm">
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger>
                                                    <div className={cn("h-2.5 w-2.5 rounded-full", p.status.className)}></div>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>{p.status.text}</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                        <p className="truncate flex-1">{p.name}</p>
                                    </div>
                                  ))
                              ) : (
                                  <p className="text-xs text-muted-foreground">No programs assigned.</p>
                              )}
                          </div>
                      </ScrollArea>
                  </CardContent>
                  <CardFooter>
                      <Button className="w-full" onClick={() => openAssignDialog(stage)}>
                          <LinkIcon className="mr-2 h-4 w-4" />
                          Assign Programs
                      </Button>
                  </CardFooter>
              </Card>
          ))}
      </div>
      
       {stageToAssign && (
        <AssignProgramsDialog
          isOpen={isAssignDialogOpen}
          onOpenChange={setIsAssignDialogOpen}
          stage={stageToAssign}
          allPrograms={programs}
          onAssign={handleAssignPrograms}
        />
      )}

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. This will permanently delete the stage.</AlertDialogDescription>
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


interface AssignProgramsDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    stage: Stage;
    allPrograms: Program[];
    onAssign: (selectedProgramIds: string[]) => Promise<void>;
}

function AssignProgramsDialog({ isOpen, onOpenChange, stage, allPrograms, onAssign }: AssignProgramsDialogProps) {
    const [selectedIds, setSelectedIds] = useState<string[]>(stage.programIds || []);
    const [isSaving, setIsSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if(isOpen) {
            setSelectedIds(stage.programIds || []);
            setSearchTerm('');
        }
    }, [isOpen, stage.programIds]);

    const handleCheckboxChange = (programId: string, checked: boolean) => {
        setSelectedIds(prev => 
            checked ? [...prev, programId] : prev.filter(id => id !== programId)
        );
    };

    const handleSubmit = async () => {
        setIsSaving(true);
        await onAssign(selectedIds);
        setIsSaving(false);
    };

    const filteredPrograms = useMemo(() => {
        return allPrograms.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [allPrograms, searchTerm]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Assign Programs to {stage.name}</DialogTitle>
                    <DialogDescription>
                        Select the programs that will be performed on this stage.
                    </DialogDescription>
                </DialogHeader>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search programs..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>
                 <ScrollArea className="h-80">
                    <div className="space-y-2 p-4">
                        {filteredPrograms.map(program => (
                            <div key={program.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted">
                                <div>
                                    <p className="font-medium">{program.name}</p>
                                    <p className="text-sm text-muted-foreground">{program.categoryName}</p>
                                </div>
                                <Checkbox
                                    checked={selectedIds.includes(program.id)}
                                    onCheckedChange={(checked) => handleCheckboxChange(program.id, !!checked)}
                                />
                            </div>
                        ))}
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button onClick={handleSubmit} disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                        Save Assignments
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

    