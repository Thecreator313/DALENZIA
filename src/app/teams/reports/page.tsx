
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection,
  getFirestore,
  onSnapshot,
  query,
  where,
  getDocs,
  doc,
} from 'firebase/firestore';
import { app } from '@/lib/firebase';
import type { User } from '@/app/admin/access-central/page';
import type { Program } from '@/app/admin/programs/page';
import type { Participant } from '@/app/teams/add-participants/page';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Category } from '@/app/admin/categories/page';
import type { AppSettings } from '@/app/admin/settings/page';


const db = getFirestore(app);

type Assignment = {
  id: string;
  programId: string;
  studentId: string;
  teamId: string;
};

export default function ReportsPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [team, setTeam] = useState<{id: string, name: string} | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [participants, setParticipants] = useState<(Participant & {categoryName: string})[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [programCategories, setProgramCategories] = useState<Category[]>([]);
  const [memberCategories, setMemberCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const [loading, setLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  const [participantSearch, setParticipantSearch] = useState('');
  const [programSearch, setProgramSearch] = useState('');
  const [participantCategoryFilter, setParticipantCategoryFilter] = useState('all');
  const [programCategoryFilter, setProgramCategoryFilter] = useState('all');

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
        }
    });
    return () => unsubscribeSettings();
  }, []);
  
  useEffect(() => {
    const fetchCats = async () => {
        const progCatQuery = collection(db, 'programCategories');
        const memCatQuery = collection(db, 'memberCategories');
        const [progSnap, memSnap] = await Promise.all([getDocs(progCatQuery), getDocs(memCatQuery)]);
        setProgramCategories(progSnap.docs.map(d => ({id: d.id, ...d.data()}) as Category));
        setMemberCategories(memSnap.docs.map(d => ({id: d.id, ...d.data()}) as Category));
    };
    fetchCats();
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const q = query(collection(db, 'teams'), where('leaderId', '==', currentUser.id));
    const unsubscribeTeam = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const teamDoc = snapshot.docs[0];
        setTeam({id: teamDoc.id, name: teamDoc.data().name});
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribeTeam();
  }, [currentUser]);

  useEffect(() => {
    if (!team?.id || memberCategories.length === 0) return;

    setLoading(true);

    const participantsQuery = query(collection(db, 'students'), where('teamId', '==', team.id));
    const unsubscribeParticipants = onSnapshot(participantsQuery, (snapshot) => {
       const participantList = snapshot.docs.map(p => {
           const data = p.data();
           const categoryName = memberCategories.find(c => c.id === data.categoryId)?.name || 'N/A';
           return { id: p.id, ...data, categoryName } as Participant & {categoryName: string};
       });
      setParticipants(participantList);
    });

    const programsQuery = collection(db, 'programs');
    const unsubscribePrograms = onSnapshot(programsQuery, (snapshot) => {
        const programList = snapshot.docs.map(doc => {
            const data = doc.data();
            const categoryName = programCategories.find(c => c.id === data.categoryId)?.name || 'N/A';
            return { id: doc.id, ...data, categoryName } as Program & {categoryName: string};
        });
      setPrograms(programList);
    });

    const assignmentsQuery = query(collection(db, 'assignments'), where('teamId', '==', team.id));
    const unsubscribeAssignments = onSnapshot(assignmentsQuery, (snapshot) => {
      setAssignments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assignment)));
      setLoading(false);
    });

    return () => {
      unsubscribeParticipants();
      unsubscribePrograms();
      unsubscribeAssignments();
    };
  }, [team, memberCategories, programCategories]);

  const participantReportData = useMemo(() => {
    return participants
    .filter(p => participantSearch === '' || p.name.toLowerCase().includes(participantSearch.toLowerCase()))
    .filter(p => participantCategoryFilter === 'all' || p.categoryId === participantCategoryFilter)
    .map(participant => {
      const participantAssignments = assignments.filter(a => a.studentId === participant.id);
      const assignedPrograms = participantAssignments.map(pa => {
        return programs.find(p => p.id === pa.programId);
      }).filter((p): p is Program => !!p);
      return { ...participant, programs: assignedPrograms };
    });
  }, [participants, assignments, programs, participantSearch, participantCategoryFilter]);

  const programReportData = useMemo(() => {
    return programs
      .map(program => {
        const programAssignments = assignments.filter(a => a.programId === program.id);
        const assignedParticipants = programAssignments.map(pa => {
            return participants.find(p => p.id === pa.studentId);
        }).filter((p): p is Participant => !!p);
        return { ...program, participants: assignedParticipants };
      })
      .filter(p => p.participants.length > 0)
      .filter(p => programSearch === '' || p.name.toLowerCase().includes(programSearch.toLowerCase()))
      .filter(p => programCategoryFilter === 'all' || p.categoryId === programCategoryFilter);
  }, [programs, assignments, participants, programSearch, programCategoryFilter]);


  const handleDownloadPDF = async (reportType: 'participant' | 'program') => {
    setIsDownloading(true);

    try {
        const doc = new jsPDF({
            orientation: 'p',
            unit: 'mm',
            format: 'a4'
        });
        
        const festName = settings?.festName || 'Fest Central';
        const reportTitle = `${festName} - ${reportType === 'participant' ? 'Participant Report' : 'Program Report'}`;
        const primaryColor = [59, 130, 246]; // A nice blue color

        const addHeaderAndFooter = () => {
            const pageCount = (doc as any).internal.getNumberOfPages();
            for(let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(16);
                doc.setTextColor(40);
                doc.text(reportTitle, 14, 15);
                doc.setFontSize(12);
                doc.text(`Team: ${team?.name || 'N/A'}`, 14, 22);
                doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
                doc.line(14, 25, 200, 25);
                
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(`Page ${i} of ${pageCount}`, 14, 287);
                doc.text(`Generated: ${new Date().toLocaleString()}`, 200, 287, {align: 'right'});
            }
        };
        
        let finalY = 30;

        if(reportType === 'participant') {
            participantReportData.forEach(participant => {
                const participantHeader = [
                    [{ content: `Participant: ${participant.name} (Chest No: ${participant.chestNumber}) - Category: ${participant.categoryName}`, colSpan: 4, styles: { fontStyle: 'bold', fillColor: [230, 247, 255], textColor: [40, 40, 40] } }]
                ];
                autoTable(doc, {
                    body: participantHeader,
                    startY: finalY,
                    theme: 'grid',
                    didDrawPage: (data) => { finalY = data.cursor?.y || 30 },
                });
                
                if (participant.programs.length > 0) {
                    autoTable(doc, {
                        head: [['Program Name', 'Program Category', 'Type', 'Mode']],
                        body: participant.programs.map(p => [p.name, p.categoryName || 'N/A', p.type, p.mode]),
                        startY: (doc as any).lastAutoTable.finalY,
                        theme: 'grid',
                        headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
                        didDrawPage: (data) => { finalY = data.cursor?.y || 30 },
                    });
                } else {
                     autoTable(doc, {
                        body: [['Not assigned to any programs.']],
                        startY: (doc as any).lastAutoTable.finalY,
                        theme: 'grid',
                        didDrawPage: (data) => { finalY = data.cursor?.y || 30 },
                    });
                }
                finalY = (doc as any).lastAutoTable.finalY + 10;
            });
        }

        if(reportType === 'program') {
            programReportData.forEach(program => {
                const programHeader = [
                     [{ content: `Program: ${program.name} - Category: ${program.categoryName}`, colSpan: 3, styles: { fontStyle: 'bold', fillColor: [230, 247, 255], textColor: [40, 40, 40] } }]
                ];
                 autoTable(doc, {
                    body: programHeader,
                    startY: finalY,
                    theme: 'grid',
                    didDrawPage: (data) => { finalY = data.cursor?.y || 30 },
                });

                if (program.participants.length > 0) {
                     autoTable(doc, {
                        head: [['Participant Name', 'Chest Number', 'Participant Category']],
                        body: program.participants.map(p => [p.name, p.chestNumber, (p as any).categoryName]),
                         startY: (doc as any).lastAutoTable.finalY,
                         theme: 'grid',
                         headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
                         didDrawPage: (data) => { finalY = data.cursor?.y || 30 },
                    });
                } else {
                    autoTable(doc, {
                        body: [['No participants assigned from your team.']],
                        startY: (doc as any).lastAutoTable.finalY,
                        theme: 'grid',
                        didDrawPage: (data) => { finalY = data.cursor?.y || 30 },
                    });
                }

                finalY = (doc as any).lastAutoTable.finalY + 10;
            });
        }
        
        addHeaderAndFooter();

        doc.save(`fest-central-report-${reportType}-${new Date().toISOString().split('T')[0]}.pdf`);

    } catch (error) {
        console.error("Error generating PDF:", error);
    } finally {
        setIsDownloading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin" /> Loading Reports...</div>;
  }

  if (!team?.id) {
    return (
      <Card>
        <CardHeader><CardTitle>No Team Assigned</CardTitle></CardHeader>
        <CardContent><p>You are not assigned as a leader for any team.</p></CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
        <h1 className="text-3xl font-bold font-headline">Team Reports</h1>
      
      <Tabs defaultValue="participant" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="participant">Participant-Based</TabsTrigger>
          <TabsTrigger value="program">Program-Based</TabsTrigger>
        </TabsList>
        <TabsContent value="participant">
          <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Participant-Based Report</CardTitle>
                        <CardDescription>View programs assigned to each participant.</CardDescription>
                    </div>
                     <Button onClick={() => handleDownloadPDF('participant')} disabled={isDownloading}>
                        {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Download PDF
                    </Button>
                </div>
                <div className="mt-4 flex gap-4">
                    <div className="relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search participants..." value={participantSearch} onChange={e => setParticipantSearch(e.target.value)} className="pl-10" />
                    </div>
                    <Select value={participantCategoryFilter} onValueChange={setParticipantCategoryFilter}>
                        <SelectTrigger className="w-[240px]"><SelectValue placeholder="Filter by category..." /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Categories</SelectItem>
                            {memberCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {participantReportData.map(participant => (
                    <div key={participant.id} className="p-4 border rounded-lg">
                    <h3 className="font-bold text-lg mb-2">{participant.name} (Chest No: {participant.chestNumber})</h3>
                    <p className="text-sm text-muted-foreground mb-3">Category: {participant.categoryName}</p>
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead>Program Name</TableHead>
                            <TableHead>Program Category</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Mode</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {participant.programs.length > 0 ? participant.programs.map(program => (
                            <TableRow key={program.id}>
                            <TableCell>{program.name}</TableCell>
                            <TableCell>{program.categoryName}</TableCell>
                            <TableCell className="capitalize">{program.type}</TableCell>
                            <TableCell className="capitalize">{program.mode}</TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center text-muted-foreground h-24">Not assigned to any programs.</TableCell>
                            </TableRow>
                        )}
                        </TableBody>
                    </Table>
                    </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="program">
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Program-Based Report</CardTitle>
                        <CardDescription>View participants assigned to each program.</CardDescription>
                    </div>
                    <Button onClick={() => handleDownloadPDF('program')} disabled={isDownloading}>
                        {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Download PDF
                    </Button>
                </div>
                <div className="mt-4 flex gap-4">
                    <div className="relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search programs..." value={programSearch} onChange={e => setProgramSearch(e.target.value)} className="pl-10" />
                    </div>
                    <Select value={programCategoryFilter} onValueChange={setProgramCategoryFilter}>
                        <SelectTrigger className="w-[240px]"><SelectValue placeholder="Filter by category..." /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Categories</SelectItem>
                            {programCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {programReportData.map(program => (
                    <div key={program.id} className="p-4 border rounded-lg">
                    <h3 className="font-bold text-lg mb-2">{program.name}</h3>
                     <p className="text-sm text-muted-foreground mb-3">Category: {program.categoryName}</p>
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead>Participant Name</TableHead>
                            <TableHead>Chest Number</TableHead>
                            <TableHead>Participant Category</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {program.participants.length > 0 ? program.participants.map(participant => (
                            <TableRow key={participant.id}>
                                <TableCell>{participant.name}</TableCell>
                                <TableCell>{participant.chestNumber}</TableCell>
                                <TableCell>{(participant as any).categoryName}</TableCell>
                            </TableRow>
                        )) : (
                             <TableRow>
                                <TableCell colSpan={3} className="text-center text-muted-foreground h-24">No participants assigned from your team.</TableCell>
                            </TableRow>
                        )}
                        </TableBody>
                    </Table>
                    </div>
                ))}
                </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
