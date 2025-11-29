'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, getFirestore, getDoc, getDocs, doc } from 'firebase/firestore';
import Link from 'next/link';
import { app } from '@/lib/firebase';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, Search, Crown, ArrowRight, Filter, Medal } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from '@/hooks/use-toast';
import type { Program as BaseProgram } from '@/app/admin/programs/page';
import type { Participant as BaseParticipant } from '@/app/teams/add-participants/page';
import type { Team } from '@/app/admin/teams/page';
import type { Category } from '@/app/admin/categories/page';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { motion, AnimatePresence } from 'framer-motion';

const db = getFirestore(app);

// Data types
type Participant = BaseParticipant & { categoryName: string };
type Program = BaseProgram & { isGeneral?: boolean; isPublished?: boolean; };
type Assignment = { id: string; programId: string; studentId: string; teamId: string; status?: 'cancelled' };
type Score = { programId: string; assignmentId: string; judgeId: string; score: number };
type PointsSettings = {
  normalGradePoints: Record<string, number>;
  specialGradePoints: Record<string, Record<string, number>>;
  rankPoints: Record<string, number>;
};

type ParticipantResult = {
  participantId: string;
  name: string;
  chestNumber: number;
  teamName: string;
  categoryId: string;
  categoryName: string;
  totalPoints: number;
};

type ProgramFilter =
  | 'all'
  | 'individual'
  | 'group'
  | 'specific'
  | 'individual-specific'
  | 'group-specific';


const getGrade = (score: number) => {
  if (score >= 90) return 'A+';
  if (score >= 70) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  return 'No Grade';
};

export default function TopCandidatesPage() {
  const [loading, setLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [programFilter, setProgramFilter] = useState<ProgramFilter>('all');

  // Raw Data from Firestore
  const [programs, setPrograms] = useState<Program[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [pointsSettings, setPointsSettings] = useState<PointsSettings | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [memberCategories, setMemberCategories] = useState<Category[]>([]);
  const [programCategories, setProgramCategories] = useState<Category[]>([]);


  useEffect(() => {
    setLoading(true);

    // One-time fetch for all data
    const fetchAllData = async () => {
      try {
        const [
          programsSnap,
          participantsSnap,
          assignmentsSnap,
          scoresSnap,
          pointsSnap,
          teamsSnap,
          memberCategoriesSnap,
          programCategoriesSnap,
        ] = await Promise.all([
          getDocs(collection(db, 'programs')),
          getDocs(collection(db, 'students')),
          getDocs(collection(db, 'assignments')),
          getDocs(collection(db, 'scores')),
          getDoc(doc(db, 'points', 'gradeAndRankPoints')),
          getDocs(collection(db, 'teams')),
          getDocs(collection(db, 'memberCategories')),
          getDocs(collection(db, 'programCategories')),
        ]);

        setPrograms(programsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Program)));
        setParticipants(participantsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Participant)));
        setAssignments(assignmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assignment)));
        setScores(scoresSnap.docs.map(doc => doc.data() as Score));
        setPointsSettings(pointsSnap.data() as PointsSettings);
        setTeams(teamsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team)));
        setMemberCategories(memberCategoriesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
        setProgramCategories(programCategoriesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
      } catch (error) {
        console.error("Error fetching data for top candidates:", error);
        toast({ title: 'Error', description: 'Failed to load necessary data.', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();

  }, []);

  const results = useMemo(() => {
    if (!pointsSettings || loading) return [];

    const generalCategoryIds = programCategories.filter(pc => pc.isGeneral).map(pc => pc.id);

    const publishedPrograms = programs.filter(p => p.isPublished);

    let filteredPrograms = publishedPrograms;
    if (programFilter !== 'all') {
      filteredPrograms = publishedPrograms.filter(p => {
        const isSpecific = !generalCategoryIds.includes(p.categoryId);
        switch (programFilter) {
          case 'individual': return p.type === 'individual';
          case 'group': return p.type === 'group';
          case 'specific': return isSpecific;
          case 'individual-specific': return p.type === 'individual' && isSpecific;
          case 'group-specific': return p.type === 'group' && isSpecific;
          default: return true;
        }
      });
    }

    const programScoresCache: Record<string, { assignmentId: string; averageScore: number }[]> = {};
    for (const program of filteredPrograms) {
      const programAssignments = assignments.filter(a => a.programId === program.id && a.status !== 'cancelled');
      const scoresList = programAssignments.map(pa => {
        const assignmentScores = scores.filter(s => s.assignmentId === pa.id);
        if (assignmentScores.length === 0) return null;
        const totalScore = assignmentScores.reduce((sum, s) => sum + s.score, 0);
        return { assignmentId: pa.id, averageScore: totalScore / assignmentScores.length };
      }).filter(Boolean) as { assignmentId: string; averageScore: number }[];

      scoresList.sort((a, b) => b.averageScore - a.averageScore);
      programScoresCache[program.id] = scoresList;
    }

    const teamMap = new Map(teams.map(t => [t.id, t.name]));
    const categoryMap = new Map(memberCategories.map(c => [c.id, c.name]));

    const participantResults = participants.map(participant => {
      let totalPoints = 0;
      const participantAssignments = assignments.filter(a => a.studentId === participant.id && a.status !== 'cancelled');

      for (const assignment of participantAssignments) {
        const program = filteredPrograms.find(p => p.id === assignment.programId);
        if (!program) continue;

        const scoresForProgram = programScoresCache[program.id];
        if (!scoresForProgram) continue;

        const participantScoreData = scoresForProgram.find(s => s.assignmentId === assignment.id);
        if (participantScoreData) {
          const { averageScore } = participantScoreData;
          const grade = getGrade(averageScore);

          const gradePoints = program.markType === 'special-mark'
            ? pointsSettings.specialGradePoints?.[program.id]?.[grade] || 0
            : pointsSettings.normalGradePoints?.[grade] || 0;

          let rank = 0;
          let lastScore = -1;
          for (let i = 0; i < scoresForProgram.length; i++) {
            if (scoresForProgram[i].averageScore !== lastScore) {
              rank = i + 1;
              lastScore = scoresForProgram[i].averageScore;
            }
            if (scoresForProgram[i].assignmentId === assignment.id) {
              break;
            }
          }

          let rankPoints = 0;
          if (rank > 0) {
            if (rank === 1) rankPoints = pointsSettings.rankPoints?.first || 0;
            else if (rank === 2) rankPoints = pointsSettings.rankPoints?.second || 0;
            else if (rank === 3) rankPoints = pointsSettings.rankPoints?.third || 0;
          }

          totalPoints += gradePoints + rankPoints;
        }
      }

      return {
        participantId: participant.id,
        name: participant.name,
        chestNumber: participant.chestNumber,
        teamName: teamMap.get(participant.teamId) || 'Unknown Team',
        categoryId: participant.categoryId,
        categoryName: categoryMap.get(participant.categoryId) || 'Unknown',
        totalPoints,
      };
    });

    participantResults.sort((a, b) => b.totalPoints - a.totalPoints);
    return participantResults;
  }, [programFilter, programs, participants, assignments, scores, pointsSettings, teams, memberCategories, programCategories, loading]);


  const filteredResults = useMemo(() => {
    return results
      .filter(r => teamFilter === 'all' || r.teamName === teamFilter)
      .filter(r => categoryFilter === 'all' || r.categoryId === categoryFilter)
      .filter(r => searchTerm === '' || r.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [results, teamFilter, categoryFilter, searchTerm]);

  const handleDownloadPDF = () => {
    setIsDownloading(true);
    const doc = new jsPDF();

    doc.text("Top Candidates Report", 14, 15);
    autoTable(doc, {
      startY: 20,
      head: [['Rank', 'Name', 'Chest No.', 'Team', 'Category', 'Total Points']],
      body: filteredResults.map((r, i) => [
        i + 1,
        r.name,
        r.chestNumber,
        r.teamName,
        r.categoryName,
        r.totalPoints.toFixed(2),
      ]),
      headStyles: { fillColor: [22, 163, 74] }
    });

    doc.save(`top-candidates-${new Date().toISOString().split('T')[0]}.pdf`);
    setIsDownloading(false);
  };


  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)]">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
          <Loader2 className="h-12 w-12 animate-spin text-primary relative z-10" />
        </div>
        <p className="text-muted-foreground animate-pulse mt-4">Loading Real-time Data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 relative min-h-screen p-1">
      {/* Dynamic Background */}
      <div className="fixed inset-0 -z-10 h-full w-full bg-background overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-green-500/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold font-headline tracking-tight">Top Candidates</h1>
          <p className="text-lg text-muted-foreground">Individual performance and rankings.</p>
        </div>
        <Button onClick={handleDownloadPDF} disabled={isDownloading} className="shadow-lg shadow-primary/20">
          {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Download PDF
        </Button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
          <CardHeader className="border-b border-white/5 bg-muted/20">
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-primary" />
              Filters
            </CardTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-background/50 border-white/10 focus:bg-background transition-colors"
                />
              </div>
              <Select value={teamFilter} onValueChange={setTeamFilter}>
                <SelectTrigger className="bg-background/50 border-white/10"><SelectValue placeholder="Filter by team" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teams</SelectItem>
                  {teams.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="bg-background/50 border-white/10"><SelectValue placeholder="Filter by category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Member Categories</SelectItem>
                  {memberCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={programFilter} onValueChange={(value) => setProgramFilter(value as ProgramFilter)}>
                <SelectTrigger className="bg-background/50 border-white/10"><SelectValue placeholder="Filter by program type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Programs</SelectItem>
                  <SelectItem value="individual">All Individual Programs</SelectItem>
                  <SelectItem value="group">All Group Programs</SelectItem>
                  <SelectItem value="specific">All Specific Category Programs</SelectItem>
                  <SelectItem value="individual-specific">Individual Programs (Specific)</SelectItem>
                  <SelectItem value="group-specific">Group Programs (Specific)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-white/5 border-white/5">
                  <TableHead className="w-[80px]">Rank</TableHead>
                  <TableHead>Participant</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Total Points</TableHead>
                  <TableHead className="w-[120px] text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {filteredResults.map((result, index) => (
                    <motion.tr
                      key={result.participantId}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors group"
                    >
                      <TableCell className="font-bold text-lg">
                        <div className="flex items-center gap-2">
                          {index === 0 && <Crown className="h-5 w-5 text-yellow-500 fill-yellow-500/20" />}
                          {index === 1 && <Medal className="h-5 w-5 text-gray-400 fill-gray-400/20" />}
                          {index === 2 && <Medal className="h-5 w-5 text-amber-700 fill-amber-700/20" />}
                          <span className={index < 3 ? "text-foreground" : "text-muted-foreground"}>#{index + 1}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="border border-white/10">
                            <AvatarFallback className="bg-primary/10 text-primary">{result.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{result.name}</p>
                            <p className="text-xs text-muted-foreground">Chest: {result.chestNumber}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{result.teamName}</TableCell>
                      <TableCell>{result.categoryName}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-lg text-primary">{result.totalPoints.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/admin/top-candidates/${result.participantId}`}>
                            View Report <ArrowRight className="ml-2 h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
                {filteredResults.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No results match your criteria.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}