
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection,
  getFirestore,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  query,
  where,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { app } from '@/lib/firebase';
import type { Program } from '@/app/admin/programs/page';
import type { Participant } from '@/app/teams/add-participants/page';
import type { Team } from '@/app/admin/teams/page';
import type { Category } from '@/app/admin/categories/page';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, PackageOpen, Users, Upload, Download } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

const db = getFirestore(app);

type Assignment = {
  programId: string;
  studentId: string;
  teamId: string;
};

type ProgramWithAssignments = Program & {
  assignments: {
    teamId: string;
    teamName: string;
    participants: Participant[];
  }[];
};

export default function ProgramCoordinationPage() {
  const [programs, setPrograms] = useState<ProgramWithAssignments[]>([]);
  const [allParticipants, setAllParticipants] = useState<Participant[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [programCategories, setProgramCategories] = useState<Category[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    setLoading(true);

    const unsubscribes: (() => void)[] = [];

    const fetchData = async () => {
        try {
            const [
                programsSnapshot,
                categoriesSnapshot,
                teamsSnapshot,
                studentsSnapshot,
                assignmentsSnapshot
            ] = await Promise.all([
                getDocs(collection(db, 'programs')),
                getDocs(collection(db, 'programCategories')),
                getDocs(collection(db, 'teams')),
                getDocs(collection(db, 'students')),
                getDocs(collection(db, 'assignments')),
            ]);

            const categories = categoriesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
            setProgramCategories(categories);

            const teams = teamsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team));
            const students = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Participant));
            const assignments = assignmentsSnapshot.docs.map(doc => doc.data() as Assignment);
            
            setAllTeams(teams);
            setAllParticipants(students);

            const categoryMap = new Map(categories.map(c => [c.id, c.name]));
            const teamMap = new Map(teams.map(t => [t.id, t.name]));
            
            const programsWithDetails = programsSnapshot.docs.map(programDoc => {
                const programData = programDoc.data();
                const programId = programDoc.id;

                const assignmentsForProgram = assignments.filter(a => a.programId === programId);
                
                const assignmentsByTeam = assignmentsForProgram.reduce((acc, assignment) => {
                    const teamId = assignment.teamId;
                    if (!acc[teamId]) {
                        acc[teamId] = [];
                    }
                    acc[teamId].push(assignment.studentId);
                    return acc;
                }, {} as Record<string, string[]>);

                const programAssignments = Object.entries(assignmentsByTeam).map(([teamId, studentIds]) => {
                    const participants = studentIds.map(studentId => students.find(s => s.id === studentId)).filter(Boolean) as Participant[];
                    return {
                        teamId,
                        teamName: teamMap.get(teamId) || 'Unknown Team',
                        participants: participants.sort((a, b) => a.chestNumber - b.chestNumber),
                    };
                });


                return {
                    id: programId,
                    ...programData,
                    categoryName: categoryMap.get(programData.categoryId) || 'Unknown Category',
                    assignments: programAssignments,
                } as ProgramWithAssignments;
            });
            
            setPrograms(programsWithDetails);

        } catch (error) {
            console.error("Error fetching program coordination data:", error);
        } finally {
            setLoading(false);
        }
    };

    fetchData();

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, []);

  const filteredPrograms = useMemo(() => {
    return programs
      .filter(program => categoryFilter === 'all' || program.categoryId === categoryFilter)
      .filter(program => program.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [programs, searchTerm, categoryFilter]);
  
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet) as { 'Program Name': string; 'Chest Number': number }[];

        const programsMap = new Map(programs.map(p => [p.name.toLowerCase(), p.id]));
        const participantsMap = new Map(allParticipants.map(p => [p.chestNumber, { id: p.id, teamId: p.teamId }]));

        const batch = writeBatch(db);

        // First, clear all existing assignments
        const assignmentsSnapshot = await getDocs(collection(db, 'assignments'));
        assignmentsSnapshot.forEach(doc => {
          batch.delete(doc.ref);
        });
        
        // Add new assignments from Excel
        for (const row of json) {
          const programName = row['Program Name'];
          const chestNumber = row['Chest Number'];
          
          if (!programName || !chestNumber) continue;

          const programId = programsMap.get(programName.toLowerCase());
          const participantInfo = participantsMap.get(chestNumber);

          if (programId && participantInfo) {
            const assignmentRef = doc(collection(db, 'assignments'));
            batch.set(assignmentRef, {
              programId: programId,
              studentId: participantInfo.id,
              teamId: participantInfo.teamId
            });
          }
        }
        
        await batch.commit();
        toast({ title: "Success", description: "Assignments updated successfully from Excel file." });
        // Trigger a re-fetch or page reload to show new data
        window.location.reload();

      } catch (error) {
        console.error("Error processing Excel file:", error);
        toast({ title: "Error", description: "Failed to process Excel file.", variant: 'destructive' });
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };
  
  const handleDownload = () => {
    const dataToExport = [];
    for (const program of programs) {
        for (const assignment of program.assignments) {
            for (const participant of assignment.participants) {
                dataToExport.push({
                    'Program Name': program.name,
                    'Program Category': program.categoryName,
                    'Program Type': program.type,
                    'Team Name': assignment.teamName,
                    'Participant Name': participant.name,
                    'Chest Number': participant.chestNumber,
                });
            }
        }
    }

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Assignments");
    XLSX.writeFile(workbook, "program_assignments.xlsx");
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
            <h1 className="text-3xl font-bold font-headline">Program Coordination</h1>
            <p className="text-muted-foreground">
                View all programs and their assigned participants by team.
            </p>
        </div>
        <div className="flex gap-2 mt-4 sm:mt-0">
            <Button onClick={handleDownload} variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Download as XLSX
            </Button>
            <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Upload className="mr-2 h-4 w-4" />}
                Upload XLSX
            </Button>
            <Input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileUpload}
                accept=".xlsx, .xls"
            />
        </div>
      </div>
      
      <Card>
        <CardHeader>
            <CardTitle>Filter Programs</CardTitle>
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
                 <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by program name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-full sm:w-[240px]">
                        <SelectValue placeholder="Filter by category" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {programCategories.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </CardHeader>
        <CardContent>
            <Accordion type="multiple" className="w-full">
                {filteredPrograms.length > 0 ? filteredPrograms.map(program => {
                    const totalParticipants = program.assignments.reduce((sum, team) => sum + team.participants.length, 0);

                    return (
                        <AccordionItem value={program.id} key={program.id}>
                            <AccordionTrigger className="hover:bg-muted p-4 rounded-md">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full text-left gap-4">
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-lg">{program.name}</h3>
                                        <p className="text-sm text-muted-foreground">{program.categoryName}</p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <Badge variant="secondary" className="flex items-center gap-1.5">
                                            <Users className="h-3.5 w-3.5" />
                                            {totalParticipants} Participant{totalParticipants === 1 ? '' : 's'}
                                        </Badge>
                                        <Badge variant="outline">{program.assignments.length} Team{program.assignments.length === 1 ? '' : 's'}</Badge>
                                    </div>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="p-4 border-t">
                               {program.assignments.length > 0 ? (
                                    <div className="space-y-4">
                                        {program.assignments.map(assignment => (
                                            <Card key={assignment.teamId}>
                                                <CardHeader>
                                                    <CardTitle className="text-base">{assignment.teamName}</CardTitle>
                                                    <CardDescription>
                                                        {assignment.participants.length} {assignment.participants.length === 1 ? 'participant' : 'participants'} assigned.
                                                    </CardDescription>
                                                </CardHeader>
                                                <CardContent>
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>Chest Number</TableHead>
                                                                <TableHead>Participant Name</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {assignment.participants.map(p => (
                                                                <TableRow key={p.id}>
                                                                    <TableCell>{p.chestNumber}</TableCell>
                                                                    <TableCell className="font-medium">{p.name}</TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                               ) : (
                                    <div className="text-center text-muted-foreground py-10">
                                        <PackageOpen className="mx-auto h-12 w-12" />
                                        <p className="mt-4 font-semibold">No Participants Assigned</p>
                                        <p className="text-sm mt-1">No teams have assigned participants to this program yet.</p>
                                    </div>
                               )}
                            </AccordionContent>
                        </AccordionItem>
                    )
                }) : (
                     <div className="text-center text-muted-foreground py-20">
                        <PackageOpen className="mx-auto h-16 w-16" />
                        <p className="mt-4 font-semibold text-lg">No Programs Found</p>
                        <p className="text-sm mt-1">Try adjusting your search or filter criteria.</p>
                    </div>
                )}
            </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
