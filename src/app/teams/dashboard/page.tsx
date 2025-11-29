'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, getFirestore, onSnapshot, getDocs, Query, DocumentData } from 'firebase/firestore';
import { app } from '@/lib/firebase';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { UserPlus, UserCheck, Users, ClipboardCheck, ClipboardX, Star, CheckCircle2, XCircle, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import type { User } from '@/app/admin/access-central/page';
import type { Team } from '@/app/admin/teams/page';
import type { Participant } from '@/app/teams/add-participants/page';
import type { Program } from '@/app/admin/programs/page';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';

const db = getFirestore(app);

type Assignment = {
  programId: string;
  studentId: string;
};

type ProgramWithParticipants = Program & {
  participantNames: string[];
};

const StatCard = ({ title, value, icon: Icon, color, delay }: { title: string, value: number, icon: any, color: string, delay: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.5 }}
  >
    <Card className="border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden relative group hover:shadow-lg transition-all duration-300">
      <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-[0.03] group-hover:opacity-[0.08] transition-opacity`} />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`p-2 rounded-lg ${color} bg-opacity-10 text-opacity-100`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  </motion.div>
);

export default function TeamDashboard() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    participants: 0,
    fullyAssigned: 0,
    partiallyAssigned: 0,
    notAssigned: 0,
  });
  const [recentAssignments, setRecentAssignments] = useState<ProgramWithParticipants[]>([]);

  useEffect(() => {
    const storedUser = localStorage.getItem('fest-central-user');
    if (storedUser) {
      const userData: User = JSON.parse(storedUser);
      setCurrentUser(userData);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    setLoading(true);
    const q = query(collection(db, 'teams'), where('leaderId', '==', currentUser.id));

    const unsubscribeTeam = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const teamDoc = snapshot.docs[0];
        const teamData = { id: teamDoc.id, ...teamDoc.data() } as Team;
        setTeam(teamData);
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribeTeam();

  }, [currentUser]);


  useEffect(() => {
    if (!team) return;

    const participantsQuery = query(collection(db, 'students'), where('teamId', '==', team.id));
    const unsubscribeParticipants = onSnapshot(participantsQuery, (snapshot) => {
      setStats(prev => ({ ...prev, participants: snapshot.size }));
    });

    let programsUnsubscribe: () => void;
    let assignmentsUnsubscribe: () => void;

    const programsQuery = collection(db, 'programs');
    const assignmentsQuery = query(collection(db, 'assignments'), where('teamId', '==', team.id));

    const studentsQuery = query(collection(db, 'students'), where('teamId', '==', team.id));

    const fetchData = async () => {
      const programsSnapshot = await getDocs(programsQuery);
      const programsData = programsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }) as Program);

      assignmentsUnsubscribe = onSnapshot(assignmentsQuery, async (assignmentsSnapshot) => {
        const assignmentList = assignmentsSnapshot.docs.map(doc => doc.data() as Assignment);

        let fullyAssigned = 0;
        let partiallyAssigned = 0;

        programsData.forEach(program => {
          const assignedCount = assignmentList.filter(a => a.programId === program.id).length;
          if (assignedCount === 0) {
            // Not assigned (by this team)
          } else if (assignedCount >= program.participantsCount) {
            fullyAssigned++;
          } else {
            partiallyAssigned++;
          }
        });

        // To get not assigned, we need to know which programs this team *could* participate in.
        // For simplicity, we'll count programs this team has *zero* assignments in.
        const programsWithAssignments = new Set(assignmentList.map(a => a.programId));
        const notAssigned = programsData.length - programsWithAssignments.size;

        setStats(prev => ({ ...prev, fullyAssigned, partiallyAssigned, notAssigned }));

        // Recent assignments
        const uniqueProgramIds = [...new Set(assignmentList.map(a => a.programId))].slice(0, 5);
        if (uniqueProgramIds.length > 0) {
          const studentsSnapshot = await getDocs(studentsQuery);
          const studentsData = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Participant);

          const recentProgramsData = programsData.filter(p => uniqueProgramIds.includes(p.id));

          const assignmentsWithNames = recentProgramsData.map(program => {
            const programAssignments = assignmentList.filter(a => a.programId === program.id);
            const participantNames = programAssignments.map(pa => {
              return studentsData.find(s => s.id === pa.studentId)?.name || 'Unknown';
            });
            return { ...program, participantNames };
          });
          setRecentAssignments(assignmentsWithNames);
        }


        setLoading(false);
      });
    }

    fetchData();


    return () => {
      unsubscribeParticipants();
      if (assignmentsUnsubscribe) assignmentsUnsubscribe();
    }
  }, [team]);


  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)]">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
          <Loader2 className="h-12 w-12 animate-spin text-primary relative z-10" />
        </div>
        <p className="text-muted-foreground animate-pulse mt-4">Loading dashboard...</p>
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
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/5 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold font-headline tracking-tight">Team Dashboard</h1>
          <p className="text-lg text-muted-foreground">Welcome back, <span className="font-semibold text-foreground">{team.name}</span>!</p>
        </div>
        <div className="flex gap-3">
          <Button asChild className="shadow-lg shadow-primary/20">
            <Link href="/teams/add-participants"><UserPlus className="mr-2 h-4 w-4" /> Add Participants</Link>
          </Button>
          <Button asChild variant="secondary" className="bg-secondary/50 hover:bg-secondary/70 backdrop-blur-sm border border-white/10">
            <Link href="/teams/assign-students"><UserCheck className="mr-2 h-4 w-4" /> Assign Participants</Link>
          </Button>
        </div>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Participants" value={stats.participants} icon={Users} color="bg-blue-500 text-blue-500" delay={0.1} />
        <StatCard title="Fully Assigned" value={stats.fullyAssigned} icon={CheckCircle2} color="bg-green-500 text-green-500" delay={0.2} />
        <StatCard title="Partially Assigned" value={stats.partiallyAssigned} icon={AlertCircle} color="bg-yellow-500 text-yellow-500" delay={0.3} />
        <StatCard title="Not Assigned" value={stats.notAssigned} icon={XCircle} color="bg-red-500 text-red-500" delay={0.4} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card className="border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
          <CardHeader className="border-b border-white/5 bg-muted/20">
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-primary" />
              Recent Program Assignments
            </CardTitle>
            <CardDescription>An overview of the latest programs your team has been assigned to.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-white/5 border-white/5">
                  <TableHead>Program Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Participants</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {recentAssignments.length > 0 ? recentAssignments.map((program, index) => (
                    <motion.tr
                      key={program.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <TableCell className="font-medium">{program.name}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize bg-muted/50 border-white/10">{program.type}</Badge></TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {program.participantNames.map((name, index) => (
                            <Badge key={index} variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20">{name}</Badge>
                          ))}
                        </div>
                      </TableCell>
                    </motion.tr>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                        No assignments have been made yet.
                      </TableCell>
                    </TableRow>
                  )}
                </AnimatePresence>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
