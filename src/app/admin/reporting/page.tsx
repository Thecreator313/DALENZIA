
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection,
  query,
  where,
  getFirestore,
  onSnapshot,
  getDocs,
  writeBatch,
  runTransaction,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { app } from '@/lib/firebase';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Users, SlidersHorizontal, PackageOpen, Award, Check, Search, Filter, MoreVertical, Edit, Trash, Ban, RotateCcw } from 'lucide-react';
import type { Program } from '@/app/admin/programs/page';
import type { Participant } from '@/app/teams/add-participants/page';
import type { Team } from '@/app/admin/teams/page';
import type { Category } from '@/app/admin/categories/page';
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
  DialogClose
} from '@/components/ui/dialog';
import { ScratchCard } from '@/components/scratch-card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const db = getFirestore(app);

type Assignment = {
  id: string;
  programId: string;
  studentId: string;
  teamId: string;
  codeLetter?: string;
  status?: 'cancelled';
};

type ParticipantWithAssignment = Participant & {
  assignmentId: string;
  codeLetter?: string;
  teamName: string;
  status?: 'cancelled';
};

type ProgramWithDetails = Program & {
  assignments: {
    teamId: string;
    teamName: string;
    participants: ParticipantWithAssignment[];
  }[];
  allParticipants: ParticipantWithAssignment[];
};

const getReportingStatus = (program: ProgramWithDetails) => {
    const activeParticipants = program.allParticipants.filter(p => p.status !== 'cancelled');
    const totalParticipants = activeParticipants.length;
    if (totalParticipants === 0) {
      return { text: 'No Participants', className: 'bg-gray-400', key: 'no_participants' };
    }
    const reportedCount = activeParticipants.filter(p => p.codeLetter).length;

    if (reportedCount === 0) {
      return { text: 'Not Started', className: 'bg-red-500 hover:bg-red-500/80', key: 'not_started' };
    }
    if (reportedCount === totalParticipants) {
      return { text: 'Completed', className: 'bg-green-500 hover:bg-green-500/80', key: 'completed' };
    }
    return { text: 'In Progress', className: 'bg-yellow-500 hover:bg-yellow-500/80', key: 'in_progress' };
};

export default function AdminReportingPage() {
  const [programs, setPrograms] = useState<ProgramWithDetails[]>([]);
  const [programCategories, setProgramCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProgram, setSelectedProgram] = useState<ProgramWithDetails | null>(null);
  const [isReportingModalOpen, setIsReportingModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    setLoading(true);

    const programQuery = query(collection(db, 'programs'));
    const categoriesQuery = query(collection(db, 'programCategories'));
    
    const unsubscribeCategories = onSnapshot(categoriesQuery, (snapshot) => {
        setProgramCategories(snapshot.docs.map(d => ({id: d.id, ...d.data()}) as Category));
    });

    const unsubscribePrograms = onSnapshot(programQuery, async (programSnapshot) => {
      try {
        const [
          teamsSnapshot,
          studentsSnapshot,
          assignmentsSnapshot
        ] = await Promise.all([
          getDocs(collection(db, 'teams')),
          getDocs(collection(db, 'students')),
          getDocs(collection(db, 'assignments')),
        ]);

        const teams = teamsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team));
        const students = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Participant));
        const assignments = assignmentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assignment));
        
        const categoryDocs = await getDocs(collection(db, 'programCategories'));
        const categories = categoryDocs.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));

        const categoryMap = new Map(categories.map(c => [c.id, c.name]));
        const teamMap = new Map(teams.map(t => [t.id, t.name]));

        const programsWithDetails = programSnapshot.docs.map(programDoc => {
          const programData = programDoc.data();
          const programId = programDoc.id;

          const assignmentsForProgram = assignments.filter(a => a.programId === programId);

          const participantsWithDetails = assignmentsForProgram.map(assignment => {
            const student = students.find(s => s.id === assignment.studentId);
            const team = teams.find(t => t.id === assignment.teamId);
            return student ? {
              ...student,
              assignmentId: assignment.id,
              codeLetter: assignment.codeLetter,
              teamName: team?.name || "Unknown Team",
              status: assignment.status,
            } : null;
          }).filter(Boolean) as ParticipantWithAssignment[];

          const assignmentsByTeam = participantsWithDetails.reduce((acc, participant) => {
            const teamId = participant.teamId;
            if (!acc[teamId]) {
              acc[teamId] = [];
            }
            acc[teamId].push(participant);
            return acc;
          }, {} as Record<string, ParticipantWithAssignment[]>);

          const programAssignments = Object.entries(assignmentsByTeam).map(([teamId, teamParticipants]) => {
            return {
              teamId,
              teamName: teamMap.get(teamId) || 'Unknown Team',
              participants: teamParticipants.sort((a, b) => a.chestNumber - b.chestNumber),
            };
          });

          return {
            id: programId,
            ...programData,
            categoryName: categoryMap.get(programData.categoryId) || 'Unknown Category',
            assignments: programAssignments,
            allParticipants: participantsWithDetails,
          } as ProgramWithDetails;
        });

        setPrograms(programsWithDetails);
      } catch (error) {
        console.error("Error fetching program data for reporting:", error);
        toast({
          title: 'Error',
          description: 'Failed to load program data.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    });

    return () => {
        unsubscribePrograms();
        unsubscribeCategories();
    };
  }, []);

  const filteredPrograms = useMemo(() => {
    return programs
    .filter(p => categoryFilter === 'all' || p.categoryId === categoryFilter)
    .filter(p => searchTerm === '' || p.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .filter(p => statusFilter === 'all' || getReportingStatus(p).key === statusFilter);
  }, [programs, searchTerm, categoryFilter, statusFilter]);


  const openReportingModal = (program: ProgramWithDetails) => {
    setSelectedProgram(program);
    setIsReportingModalOpen(true);
  };
  
  const onMutation = (programId: string, assignmentId: string, mutation: { newLetter?: string | null; newStatus?: 'cancelled' | null }) => {
    const updateParticipants = (pList: ParticipantWithAssignment[]) => pList.map(participant => {
        if (participant.assignmentId === assignmentId) {
            const updatedParticipant = { ...participant };
             if (mutation.newLetter !== undefined) {
              updatedParticipant.codeLetter = mutation.newLetter === null ? undefined : mutation.newLetter;
            }
            if (mutation.newStatus !== undefined) {
               updatedParticipant.status = mutation.newStatus === null ? undefined : mutation.newStatus;
            }
            return updatedParticipant;
        }
        return participant;
    });

    setPrograms(prevPrograms => prevPrograms.map(p => {
         if (p.id === programId) {
            const updatedAllParticipants = updateParticipants(p.allParticipants);
            const updatedAssignments = p.assignments.map(teamAssignment => ({
              ...teamAssignment,
              participants: updateParticipants(teamAssignment.participants)
            }));

            const updatedProgram = { 
                ...p, 
                allParticipants: updatedAllParticipants, 
                assignments: updatedAssignments 
            };
            
            if(selectedProgram && selectedProgram.id === programId) {
                setSelectedProgram(updatedProgram);
            }

            return updatedProgram;
        }
        return p;
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="mr-2 h-8 w-8 animate-spin" />
        <span>Loading Program Data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold font-headline">Participant Reporting</h1>
      
      <Card>
        <CardHeader>
            <CardTitle>Filter Programs</CardTitle>
            <CardDescription>
                Showing {filteredPrograms.length} of {programs.length} programs.
            </CardDescription>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
                 <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by program name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger>
                        <SelectValue placeholder="Filter by category" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {programCategories.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                        <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="not_started">Not Started</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </CardHeader>
        <CardContent>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredPrograms.length > 0 ? filteredPrograms.map((program) => {
                    const status = getReportingStatus(program);
                    return (
                        <Card key={program.id} className="flex flex-col">
                            <CardHeader>
                            <CardTitle>{program.name}</CardTitle>
                            <CardDescription>{program.categoryName}</CardDescription>
                            </CardHeader>
                            <CardContent className="flex-grow">
                            <div className="flex items-center text-muted-foreground text-sm">
                                <Users className="mr-2 h-4 w-4" />
                                <span>{program.allParticipants.length} Participants</span>
                            </div>
                            </CardContent>
                            <CardFooter className="flex flex-col items-start gap-2 pt-4">
                               <Badge className={cn("w-full justify-center text-white", status.className)}>{status.text}</Badge>
                               <Button className="w-full" onClick={() => openReportingModal(program)} disabled={program.allParticipants.length === 0}>
                                <SlidersHorizontal className="mr-2 h-4 w-4" /> Manage Reporting
                               </Button>
                            </CardFooter>
                        </Card>
                    );
                }) : (
                    <div className="col-span-full text-center text-muted-foreground py-20">
                        <PackageOpen className="mx-auto h-16 w-16" />
                        <p className="mt-4 font-semibold text-lg">No Programs Found</p>
                        <p className="text-sm mt-1">Try adjusting your filter criteria.</p>
                    </div>
                )}
            </div>
        </CardContent>
      </Card>
      
      {selectedProgram && (
        <ReportingModal
            isOpen={isReportingModalOpen}
            onOpenChange={setIsReportingModalOpen}
            program={selectedProgram}
            onMutated={onMutation}
        />
      )}
    </div>
  );
}

interface ReportingModalProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    program: ProgramWithDetails;
    onMutated: (programId: string, assignmentId: string, mutation: { newLetter?: string | null, newStatus?: 'cancelled' | null }) => void;
}

function ReportingModal({ isOpen, onOpenChange, program, onMutated }: ReportingModalProps) {
    
    const [participantToEdit, setParticipantToEdit] = useState<ParticipantWithAssignment | null>(null);
    const [participantToDelete, setParticipantToDelete] = useState<ParticipantWithAssignment | null>(null);
    const [participantToCancel, setParticipantToCancel] = useState<ParticipantWithAssignment | null>(null);
    const [participantToReEnable, setParticipantToReEnable] = useState<ParticipantWithAssignment | null>(null);


    const sortedParticipants = useMemo(() => {
        return [...program.allParticipants].sort((a, b) => {
            if (a.codeLetter && !b.codeLetter) return -1;
            if (!a.codeLetter && b.codeLetter) return 1;
            if (a.codeLetter && b.codeLetter) return a.codeLetter.localeCompare(b.codeLetter);
            return a.chestNumber - b.chestNumber;
        });
    }, [program.allParticipants]);

    const handleReport = async (participant: ParticipantWithAssignment) => {
        if (participant.codeLetter) {
            toast({ title: 'Already Reported', description: `${participant.name} has already been assigned a code.`});
            return;
        }

        try {
            const programAssignmentsQuery = query(collection(db, 'assignments'), where('programId', '==', program.id));
            const programAssignmentsSnapshot = await getDocs(programAssignmentsQuery);
            const existingCodes = programAssignmentsSnapshot.docs
                .map(d => d.data().codeLetter)
                .filter(Boolean);
            
            const participantCount = program.allParticipants.length;
            const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
            const codeLetterPool = alphabet.slice(0, participantCount);

            const availableLetters = codeLetterPool.filter(l => !existingCodes.includes(l));
            
            if (availableLetters.length === 0) throw new Error("No available code letters left for this program.");
            
            const randomIndex = Math.floor(Math.random() * availableLetters.length);
            const newCodeLetter = availableLetters[randomIndex];
            
            const assignmentDocRef = doc(db, 'assignments', participant.assignmentId);
            await updateDoc(assignmentDocRef, { codeLetter: newCodeLetter, status: null });
            
            onMutated(program.id, participant.assignmentId, { newLetter: newCodeLetter, newStatus: null });
            
            toast({ title: "Success", description: `${participant.name} has been assigned code letter ${newCodeLetter}.`});

        } catch (error) {
            console.error("Failed to assign code letter:", error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            toast({ title: 'Error', description: `Failed to assign code. ${errorMessage}`, variant: 'destructive' });
        }
    };
    
    const handleDeleteCode = async () => {
        if (!participantToDelete) return;
        try {
            const assignmentRef = doc(db, 'assignments', participantToDelete.assignmentId);
            await updateDoc(assignmentRef, { codeLetter: null });
            toast({ title: "Success", description: `Code letter for ${participantToDelete.name} has been removed.` });
            onMutated(program.id, participantToDelete.assignmentId, { newLetter: null });
            setParticipantToDelete(null);
        } catch (error) {
             toast({ title: "Error", description: "Failed to delete code letter.", variant: "destructive" });
        }
    };

    const handleCancelParticipant = async () => {
        if(!participantToCancel) return;
        try {
            const assignmentRef = doc(db, 'assignments', participantToCancel.assignmentId);
            await updateDoc(assignmentRef, { status: 'cancelled' });
            toast({ title: "Success", description: `${participantToCancel.name} has been marked as cancelled.` });
            onMutated(program.id, participantToCancel.assignmentId, { newStatus: 'cancelled' });
            setParticipantToCancel(null);
        } catch (error) {
            toast({ title: "Error", description: "Failed to cancel participant.", variant: "destructive" });
        }
    };

    const handleReEnableParticipant = async () => {
        if (!participantToReEnable) return;
        try {
            const assignmentRef = doc(db, 'assignments', participantToReEnable.assignmentId);
            await updateDoc(assignmentRef, { status: null });
            toast({ title: "Success", description: `${participantToReEnable.name} has been re-enabled.` });
            onMutated(program.id, participantToReEnable.assignmentId, { newStatus: null });
            setParticipantToReEnable(null);
        } catch (error) {
            toast({ title: "Error", description: "Failed to re-enable participant.", variant: "destructive" });
        }
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Reporting for: {program.name}</DialogTitle>
                        <DialogDescription>
                            Assign code letters to participants as they report to the stage.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[60vh] overflow-y-auto p-1">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Participant</TableHead>
                                    <TableHead>Team</TableHead>
                                    <TableHead className="text-center">Code Letter</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedParticipants.map(participant => (
                                    <TableRow key={participant.id} className={cn(participant.status === 'cancelled' && 'opacity-50 bg-muted/50')}>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <Avatar>
                                                    <AvatarFallback>{participant.name.charAt(0).toUpperCase()}</AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <p className="font-semibold">{participant.name}</p>
                                                    <p className="text-sm text-muted-foreground">Chest: {participant.chestNumber}</p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>{participant.teamName}</TableCell>
                                        <TableCell className="text-center">
                                             {participant.status === 'cancelled' ? (
                                                <Badge variant="destructive">CANCELLED</Badge>
                                             ) : (
                                                <div className="w-24 h-16 mx-auto flex items-center justify-center text-2xl font-bold border rounded-md bg-background">
                                                    <ScratchCard
                                                        key={participant.assignmentId}
                                                        isRevealed={!!participant.codeLetter}
                                                        revealedContent={<span>{participant.codeLetter}</span>}
                                                    />
                                                </div>
                                             )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {participant.status !== 'cancelled' ? (
                                                    <Button 
                                                        size="sm"
                                                        onClick={() => handleReport(participant)}
                                                        disabled={!!participant.codeLetter}
                                                    >
                                                        {participant.codeLetter ? <Check className="mr-2 h-4 w-4" /> : <Award className="mr-2 h-4 w-4" />}
                                                        {participant.codeLetter ? 'Reported' : 'Report'}
                                                    </Button>
                                                ) : (
                                                     <Button 
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => setParticipantToReEnable(participant)}
                                                    >
                                                        <RotateCcw className="mr-2 h-4 w-4" /> Re-enable
                                                    </Button>
                                                )}
                                                
                                                {participant.codeLetter && participant.status !== 'cancelled' && (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent>
                                                            <DropdownMenuItem onClick={() => setParticipantToEdit(participant)}>
                                                                <Edit className="mr-2 h-4 w-4" /> Edit Code
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => setParticipantToDelete(participant)} className="text-destructive">
                                                                <Trash className="mr-2 h-4 w-4" /> Delete Code
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem onClick={() => setParticipantToCancel(participant)} className="text-destructive">
                                                                <Ban className="mr-2 h-4 w-4" /> Cancel Participant
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">Close</Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {participantToEdit && (
                <EditCodeDialog 
                    participant={participantToEdit}
                    programId={program.id}
                    allParticipants={program.allParticipants}
                    onOpenChange={(isOpen) => !isOpen && setParticipantToEdit(null)}
                    onMutated={onMutated}
                />
            )}
             {participantToDelete && (
                 <AlertDialog open={!!participantToDelete} onOpenChange={(isOpen) => !isOpen && setParticipantToDelete(null)}>
                     <AlertDialogContent>
                         <AlertDialogHeader>
                             <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                             <AlertDialogDescription>
                                 This will remove the code letter for <span className="font-bold">{participantToDelete.name}</span>. The letter will become available for other participants in this program.
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
              {participantToCancel && (
                 <AlertDialog open={!!participantToCancel} onOpenChange={(isOpen) => !isOpen && setParticipantToCancel(null)}>
                     <AlertDialogContent>
                         <AlertDialogHeader>
                             <AlertDialogTitle>Cancel Participant?</AlertDialogTitle>
                             <AlertDialogDescription>
                                 Are you sure you want to cancel <span className="font-bold">{participantToCancel.name}</span>? They will not be able to be scored by judges. This action can be reversed.
                             </AlertDialogDescription>
                         </AlertDialogHeader>
                         <AlertDialogFooter>
                             <AlertDialogCancel>Close</AlertDialogCancel>
                             <AlertDialogAction onClick={handleCancelParticipant} className="bg-destructive hover:bg-destructive/90">
                                 Yes, Cancel
                             </AlertDialogAction>
                         </AlertDialogFooter>
                     </AlertDialogContent>
                 </AlertDialog>
             )}
            {participantToReEnable && (
                 <AlertDialog open={!!participantToReEnable} onOpenChange={(isOpen) => !isOpen && setParticipantToReEnable(null)}>
                     <AlertDialogContent>
                         <AlertDialogHeader>
                             <AlertDialogTitle>Re-enable Participant?</AlertDialogTitle>
                             <AlertDialogDescription>
                                 This will make <span className="font-bold">{participantToReEnable.name}</span> available for judging again.
                             </AlertDialogDescription>
                         </AlertDialogHeader>
                         <AlertDialogFooter>
                             <AlertDialogCancel>Close</AlertDialogCancel>
                             <AlertDialogAction onClick={handleReEnableParticipant}>
                                 Yes, Re-enable
                             </AlertDialogAction>
                         </AlertDialogFooter>
                     </AlertDialogContent>
                 </AlertDialog>
             )}
        </>
    );
}

interface EditCodeDialogProps {
    participant: ParticipantWithAssignment;
    programId: string;
    allParticipants: ParticipantWithAssignment[];
    onOpenChange: (isOpen: boolean) => void;
    onMutated: (programId: string, assignmentId: string, mutation: { newLetter?: string; newStatus?: 'cancelled' | null }) => void;
}

function EditCodeDialog({ participant, programId, allParticipants, onOpenChange, onMutated }: EditCodeDialogProps) {
    const [newCode, setNewCode] = useState(participant.codeLetter || '');
    const [error, setError] = useState('');

    const handleSave = async () => {
        setError('');
        const newCodeUpper = newCode.trim().toUpperCase();

        if (!newCodeUpper) {
             setError(`Code letter cannot be empty.`);
            return;
        }

        const participantCount = allParticipants.length;
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        const codeLetterPool = alphabet.slice(0, participantCount);

        if (!codeLetterPool.includes(newCodeUpper)) {
            setError(`Please enter a single letter from A to ${codeLetterPool[codeLetterPool.length - 1]}.`);
            return;
        }
        
        const isUsed = allParticipants.some(p => p.id !== participant.id && p.codeLetter === newCodeUpper);
        if (isUsed) {
            setError(`The letter ${newCodeUpper} is already in use for this program.`);
            return;
        }

        try {
            const assignmentRef = doc(db, 'assignments', participant.assignmentId);
            await updateDoc(assignmentRef, { codeLetter: newCodeUpper });
            toast({ title: "Success", description: "Code letter updated successfully." });
            onMutated(programId, participant.assignmentId, { newLetter: newCodeUpper, newStatus: null });
            onOpenChange(false);
        } catch (e) {
            toast({ title: "Error", description: "Failed to update code letter.", variant: "destructive" });
        }
    };

    return (
        <Dialog open={true} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Code for {participant.name}</DialogTitle>
                    <DialogDescription>Enter a new unique code letter for this participant.</DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Input 
                        value={newCode}
                        onChange={(e) => setNewCode(e.target.value)}
                        maxLength={1}
                        className="text-2xl text-center font-bold h-16"
                    />
                    {error && <p className="text-destructive text-sm mt-2">{error}</p>}
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button onClick={handleSave}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

    
    

    

    

    

    