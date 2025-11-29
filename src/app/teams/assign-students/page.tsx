'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  updateDoc,
  where,
  deleteDoc,
  addDoc,
} from 'firebase/firestore';
import { app } from '@/lib/firebase';
import type { User } from '@/app/admin/access-central/page';
import type { Program as BaseProgram } from '@/app/admin/programs/page';
import type { Participant as BaseParticipant } from '@/app/teams/add-participants/page';
import type { Category } from '@/app/admin/categories/page';
import type { AppSettings } from '@/app/admin/settings/page';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Users, Search, Filter, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const db = getFirestore(app);

// Extend types to include categoryName
type Participant = BaseParticipant & { categoryName?: string };
type Program = BaseProgram & { isGeneral?: boolean };


export default function AssignParticipantsPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [programCategories, setProgramCategories] = useState<Category[]>([]);
  const [memberCategories, setMemberCategories] = useState<Category[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    const storedUser = localStorage.getItem('fest-central-user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    } else {
      setLoading(false);
    }

    const settingsDocRef = doc(db, 'settings', 'global');
    const unsubscribeSettings = onSnapshot(settingsDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data() as AppSettings);
      } else {
        setSettings({ allowTeamAssignment: true, festName: 'Fest Central' });
      }
    });

    return () => unsubscribeSettings();
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const q = query(collection(db, 'teams'), where('leaderId', '==', currentUser.id));
    const unsubscribeTeam = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const teamDoc = snapshot.docs[0];
        setTeamId(teamDoc.id);
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribeTeam();
  }, [currentUser]);

  useEffect(() => {
    const fetchCategories = async () => {
      const progCatQuery = collection(db, 'programCategories');
      const memCatQuery = collection(db, 'memberCategories');

      const [progCatSnapshot, memCatSnapshot] = await Promise.all([
        getDocs(progCatQuery),
        getDocs(memCatQuery)
      ]);

      const progCats = progCatSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
      const memCats = memCatSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
      setProgramCategories(progCats);
      setMemberCategories(memCats);
    }
    fetchCategories();
  }, []);

  useEffect(() => {
    if (!teamId || memberCategories.length === 0 || programCategories.length === 0) return;

    setLoading(true);

    const participantsQuery = query(collection(db, 'students'), where('teamId', '==', teamId));
    const unsubscribeParticipants = onSnapshot(participantsQuery, (snapshot) => {
      const participantList = snapshot.docs.map(doc => {
        const participantData = doc.data();
        const category = memberCategories.find(c => c.id === participantData.categoryId);
        return { id: doc.id, ...participantData, categoryName: category?.name } as Participant;
      });
      setParticipants(participantList);
    });

    const programsQuery = collection(db, 'programs');
    const unsubscribePrograms = onSnapshot(programsQuery, async (snapshot) => {
      const programList = snapshot.docs.map((programDoc) => {
        const programData = programDoc.data();
        const programCategory = programCategories.find(c => c.id === programData.categoryId);
        const categoryName = programCategory?.name || 'Unknown';
        return {
          id: programDoc.id,
          ...programData,
          categoryName,
          isGeneral: programCategory?.isGeneral
        } as Program;
      });
      setPrograms(programList);
    });

    const assignmentsQuery = query(collection(db, 'assignments'), where('teamId', '==', teamId));
    const unsubscribeAssignments = onSnapshot(assignmentsQuery, (snapshot) => {
      const newAssignments: Record<string, string[]> = {};
      snapshot.docs.forEach(doc => {
        const { programId, studentId } = doc.data();
        if (!newAssignments[programId]) {
          newAssignments[programId] = [];
        }
        newAssignments[programId].push(studentId);
      });
      setAssignments(newAssignments);
      setLoading(false);
    });

    return () => {
      unsubscribeParticipants();
      unsubscribePrograms();
      unsubscribeAssignments();
    };
  }, [teamId, memberCategories, programCategories]);


  const getAssignmentStatus = (program: Program) => {
    const assignedCount = assignments[program.id]?.length || 0;
    const participantsCount = program.participantsCount;

    if (assignedCount === 0) {
      return { text: "Not Assigned", className: "bg-red-500/10 text-red-500 border-red-500/20", key: "not", icon: XCircle };
    }
    if (assignedCount >= participantsCount) {
      return { text: "Fully Assigned", className: "bg-green-500/10 text-green-500 border-green-500/20", key: "full", icon: CheckCircle2 };
    }
    return { text: "Partially Assigned", className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20", key: "partial", icon: AlertCircle };
  };

  const filteredPrograms = useMemo(() => {
    return programs
      .filter(p => searchTerm ? p.name.toLowerCase().includes(searchTerm.toLowerCase()) : true)
      .filter(p => typeFilter === 'all' ? true : p.type === typeFilter)
      .filter(p => statusFilter === 'all' ? true : getAssignmentStatus(p).key === statusFilter)
      .filter(p => categoryFilter === 'all' ? true : p.categoryId === categoryFilter);
  }, [programs, searchTerm, typeFilter, statusFilter, categoryFilter, assignments]);


  const handleAssignClick = (program: Program) => {
    setSelectedProgram(program);
    setIsAssignDialogOpen(true);
  };


  if (loading || settings === null) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)]">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
          <Loader2 className="h-12 w-12 animate-spin text-primary relative z-10" />
        </div>
        <p className="text-muted-foreground animate-pulse mt-4">Loading Programs...</p>
      </div>
    );
  }

  if (!teamId) {
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
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/5 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold font-headline tracking-tight">Assign Participants</h1>
          <p className="text-lg text-muted-foreground">Manage program assignments for your team.</p>
        </div>
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
                  <Filter className="w-5 h-5 text-primary" />
                  Filter Programs
                </CardTitle>
                <CardDescription>Find and manage your program assignments.</CardDescription>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full md:w-auto">
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search programs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-background/50 border-white/10 focus:bg-background transition-colors"
                  />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="bg-background/50 border-white/10"><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="group">Group</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-background/50 border-white/10"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="not">Not Assigned</SelectItem>
                    <SelectItem value="partial">Partially Assigned</SelectItem>
                    <SelectItem value="full">Fully Assigned</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="bg-background/50 border-white/10"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {programCategories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <AnimatePresence>
                {filteredPrograms.map((program, index) => {
                  const status = getAssignmentStatus(program);
                  const StatusIcon = status.icon;
                  return (
                    <motion.div
                      key={program.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Card className="flex flex-col h-full border-white/10 bg-card/60 hover:bg-card/80 transition-all duration-300 hover:shadow-lg group">
                        <CardHeader className="pb-3">
                          <div className="flex justify-between items-start gap-2">
                            <div className="space-y-1">
                              <CardTitle className="text-lg leading-tight">{program.name}</CardTitle>
                              <CardDescription>{program.categoryName}</CardDescription>
                            </div>
                            <Badge variant={program.type === 'group' ? 'default' : 'secondary'} className="capitalize shrink-0 bg-primary/20 text-primary border-primary/20 hover:bg-primary/30">
                              {program.type}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="flex-grow space-y-4">
                          <div className="flex items-center justify-between text-sm border-t border-white/5 pt-3">
                            <span className="text-muted-foreground">Participants:</span>
                            <Badge variant="outline" className="font-mono">{assignments[program.id]?.length || 0} / {program.participantsCount}</Badge>
                          </div>
                          {program.type === 'group' && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Group Size:</span>
                              <Badge variant="outline" className="font-mono">{program.groupMembers}</Badge>
                            </div>
                          )}
                        </CardContent>
                        <CardFooter className="flex flex-col gap-3 pt-4 border-t border-white/5 bg-muted/10">
                          <Badge className={cn("w-full justify-center py-1.5 border", status.className)}>
                            <StatusIcon className="w-3 h-3 mr-1.5" />
                            {status.text}
                          </Badge>
                          {settings?.allowTeamAssignment && (
                            <Button className="w-full shadow-sm" onClick={() => handleAssignClick(program)}>
                              Assign Participants
                            </Button>
                          )}
                        </CardFooter>
                      </Card>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
              {filteredPrograms.length === 0 && (
                <div className="col-span-full text-center text-muted-foreground py-12 flex flex-col items-center justify-center border border-dashed border-white/10 rounded-xl bg-muted/5">
                  <div className="p-4 rounded-full bg-muted/10 mb-4">
                    <Filter className="h-8 w-8 opacity-50" />
                  </div>
                  <p className="font-semibold text-lg">No Programs Found</p>
                  <p className="text-sm mt-1">Try adjusting your search or filter criteria.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {selectedProgram && (
        <AssignParticipantDialog
          isOpen={isAssignDialogOpen}
          onOpenChange={setIsAssignDialogOpen}
          program={selectedProgram}
          participants={participants}
          teamId={teamId}
          programCategories={programCategories}
          memberCategories={memberCategories}
          existingAssignments={assignments[selectedProgram.id] || []}
        />
      )}
    </div>
  );
}


interface AssignParticipantDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  program: Program;
  participants: Participant[];
  teamId: string;
  programCategories: Category[];
  memberCategories: Category[];
  existingAssignments: string[];
}

function AssignParticipantDialog({
  isOpen,
  onOpenChange,
  program,
  participants,
  teamId,
  programCategories,
  memberCategories,
  existingAssignments,
}: AssignParticipantDialogProps) {
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSelectedParticipants(existingAssignments);
      setSearchTerm('');
    }
  }, [existingAssignments, isOpen]);

  const programCategory = useMemo(() => {
    return programCategories.find(c => c.id === program.categoryId)
  }, [program.categoryId, programCategories]);


  const eligibleParticipants = useMemo(() => {
    let filteredParticipants: Participant[] = [];
    if (programCategory?.isGeneral) {
      filteredParticipants = participants;
    } else {
      filteredParticipants = participants.filter(participant => participant.categoryName === programCategory?.name);
    }

    if (searchTerm) {
      return filteredParticipants.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return filteredParticipants;
  }, [participants, programCategory, searchTerm]);

  const handleCheckboxChange = (participantId: string, checked: boolean) => {
    const limit = program.participantsCount;
    if (checked && selectedParticipants.length >= limit) {
      toast({
        title: 'Limit Reached',
        description: `You can only assign up to ${limit} participant(s) for this program.`,
        variant: 'destructive',
      });
      return;
    }
    setSelectedParticipants(prev =>
      checked ? [...prev, participantId] : prev.filter(id => id !== participantId)
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const assignmentsRef = collection(db, 'assignments');

      const currentAssignments = existingAssignments;
      const newAssignments = selectedParticipants;

      const toDelete = currentAssignments.filter(id => !newAssignments.includes(id));
      const toAdd = newAssignments.filter(id => !currentAssignments.includes(id));

      // Delete assignments
      if (toDelete.length > 0) {
        // Fetch all assignments for this team to avoid complex index requirements
        const assignmentsQuery = query(
          assignmentsRef,
          where('teamId', '==', teamId)
        );

        const snapshot = await getDocs(assignmentsQuery);

        // Filter for the specific program and students to delete
        const docsToDelete = snapshot.docs.filter(doc => {
          const data = doc.data();
          return data.programId === program.id && toDelete.includes(data.studentId);
        });

        const deletePromises = docsToDelete.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
      }

      // Add new assignments
      const addPromises = toAdd.map(participantId => {
        return addDoc(assignmentsRef, {
          programId: program.id,
          studentId: participantId,
          teamId: teamId,
        });
      });

      await Promise.all(addPromises);

      toast({ title: 'Success', description: 'Assignments updated successfully.' });
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving assignments:', error);
      toast({ title: 'Error', description: 'Failed to save assignments.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-background/95 backdrop-blur-xl border-white/10">
        <DialogHeader>
          <DialogTitle>Assign Participants to "{program.name}"</DialogTitle>
          <DialogDescription>
            Select up to {program.participantsCount} participant(s).
            <br />
            <span className={cn("font-semibold", selectedParticipants.length === program.participantsCount ? "text-green-500" : "text-muted-foreground")}>
              Selected: {selectedParticipants.length} / {program.participantsCount}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search eligible participants..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-muted/50 border-white/10"
            />
          </div>
          <ScrollArea className="h-72 border border-white/10 rounded-md bg-muted/20 p-2">
            <div className="space-y-2">
              {eligibleParticipants.length > 0 ? (
                eligibleParticipants.map((participant) => {
                  const isSelected = selectedParticipants.includes(participant.id);
                  return (
                    <div
                      key={participant.id}
                      className={cn(
                        "flex items-center justify-between rounded-lg p-3 transition-colors cursor-pointer border border-transparent",
                        isSelected ? "bg-primary/10 border-primary/20" : "hover:bg-white/5"
                      )}
                      onClick={() => handleCheckboxChange(participant.id, !isSelected)}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border border-white/10">
                          <AvatarFallback className="bg-primary/20 text-primary text-xs">{participant.name.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm leading-none">{participant.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">Chest No: <span className="font-mono">{participant.chestNumber}</span></p>
                        </div>
                      </div>
                      <Checkbox
                        id={`participant-${participant.id}`}
                        checked={isSelected}
                        onCheckedChange={(checked) => handleCheckboxChange(participant.id, !!checked)}
                        className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                    </div>
                  );
                })
              ) : (
                <div className="text-center text-muted-foreground py-10 flex flex-col items-center">
                  <Users className="h-10 w-10 opacity-30 mb-3" />
                  <p className="font-semibold text-sm">No Eligible Participants</p>
                  <p className="text-xs mt-1 max-w-[200px]">
                    {searchTerm
                      ? "No participants match your search."
                      : "There are no participants in your team eligible for this program's category."
                    }
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Assignments
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
