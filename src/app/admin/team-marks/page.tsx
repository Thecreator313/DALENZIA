
'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  getFirestore,
  onSnapshot,
  getDocs,
  doc,
  setDoc,
} from 'firebase/firestore';
import { app } from '@/lib/firebase';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, ArrowRight, Trophy, Megaphone, CheckSquare, Crown, Medal } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { Program } from '@/app/admin/programs/page';
import type { Participant as BaseParticipant } from '@/app/teams/add-participants/page';
import type { Team as BaseTeam } from '@/app/admin/teams/page';
import Link from 'next/link';
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
import { motion, AnimatePresence } from 'framer-motion';

const db = getFirestore(app);

// Data types
type Team = BaseTeam & { leaderName?: string };
type Assignment = { id: string; programId: string; studentId: string; teamId: string; status?: 'cancelled' };
type Score = { programId: string; assignmentId: string; judgeId: string; score: number };
type PointsSettings = {
  normalGradePoints: Record<string, number>;
  specialGradePoints: Record<string, Record<string, number>>;
  rankPoints: Record<string, number>;
};

type TeamResult = {
  teamId: string;
  teamName: string;
  leaderName: string;
  totalPoints: number;
};

type PublishedStandings = {
  results: TeamResult[];
  publishedAtResultCount: number;
  publishedAt: Date;
}

const getGrade = (score: number) => {
  if (score >= 90) return 'A+';
  if (score >= 70) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  return 'No Grade';
};

export default function TeamMarksPage() {
  const [teamResults, setTeamResults] = useState<TeamResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [publishedResultsCount, setPublishedResultsCount] = useState(0);
  const [lastPublishedStandings, setLastPublishedStandings] = useState<PublishedStandings | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);


  useEffect(() => {
    setLoading(true);

    const calculateAllTeamPoints = async () => {
      try {
        const [
          programsSnap,
          participantsSnap,
          assignmentsSnap,
          scoresSnap,
          pointsSnap,
          teamsSnap,
          usersSnap,
        ] = await Promise.all([
          getDocs(collection(db, 'programs')),
          getDocs(collection(db, 'students')),
          getDocs(collection(db, 'assignments')),
          getDocs(collection(db, 'scores')),
          getDocs(collection(db, 'points')),
          getDocs(collection(db, 'teams')),
          getDocs(collection(db, 'users')),
        ]);

        const allPrograms = programsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Program);
        const publishedPrograms = allPrograms.filter(p => p.isPublished);

        const participants = participantsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as BaseParticipant);
        const assignments = assignmentsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Assignment);
        const scores = scoresSnap.docs.map(d => d.data() as Score);
        const teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Team);
        const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }) as { id: string; name: string });

        const userMap = new Map(users.map(u => [u.id, u.name]));

        const pointsSettingsDoc = pointsSnap.docs.find(d => d.id === 'gradeAndRankPoints');
        const pointsSettings: PointsSettings = pointsSettingsDoc?.data() as PointsSettings || {
          normalGradePoints: {}, specialGradePoints: {}, rankPoints: {},
        };

        const programScores: Record<string, { assignmentId: string, averageScore: number }[]> = {};
        for (const program of publishedPrograms) {
          const programAssignments = assignments.filter(a => a.programId === program.id && a.status !== 'cancelled');
          const programScoresList = [];

          for (const assignment of programAssignments) {
            const assignmentScores = scores.filter(s => s.assignmentId === assignment.id);
            if (assignmentScores.length > 0) {
              const totalScore = assignmentScores.reduce((sum, s) => sum + s.score, 0);
              const averageScore = totalScore / assignmentScores.length;
              programScoresList.push({ assignmentId: assignment.id, averageScore });
            }
          }
          programScoresList.sort((a, b) => b.averageScore - a.averageScore);
          programScores[program.id] = programScoresList;
        }

        const participantPoints: Record<string, number> = {};
        for (const participant of participants) {
          let totalPoints = 0;
          const participantAssignments = assignments.filter(a => a.studentId === participant.id && a.status !== 'cancelled');

          for (const assignment of participantAssignments) {
            const program = publishedPrograms.find(p => p.id === assignment.programId);
            if (!program) continue;

            const scoresForProgram = programScores[program.id];
            const participantScoreData = scoresForProgram?.find(s => s.assignmentId === assignment.id);

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
                if (rank === 1) rankPoints = pointsSettings.rankPoints?.['first'] || 0;
                else if (rank === 2) rankPoints = pointsSettings.rankPoints?.['second'] || 0;
                else if (rank === 3) rankPoints = pointsSettings.rankPoints?.['third'] || 0;
              }

              totalPoints += gradePoints + rankPoints;
            }
          }
          participantPoints[participant.id] = totalPoints;
        }

        const resultsByTeam = teams.map(team => {
          let teamTotalPoints = 0;
          const teamParticipants = participants.filter(p => p.teamId === team.id);
          teamParticipants.forEach(p => {
            teamTotalPoints += participantPoints[p.id] || 0;
          });
          return {
            teamId: team.id,
            teamName: team.name,
            leaderName: userMap.get(team.leaderId) || 'N/A',
            totalPoints: teamTotalPoints,
          };
        });

        resultsByTeam.sort((a, b) => b.totalPoints - a.totalPoints);
        setTeamResults(resultsByTeam);

      } catch (error) {
        console.error("Error calculating team marks:", error);
        toast({ title: "Error", description: "Could not calculate team marks.", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };

    calculateAllTeamPoints();

    const unsubResults = onSnapshot(collection(db, 'publishedResults'), (snap) => {
      setPublishedResultsCount(snap.size);
    });

    const unsubStandings = onSnapshot(doc(db, 'standings', 'team_marks'), (snap) => {
      if (snap.exists()) {
        setLastPublishedStandings(snap.data() as PublishedStandings);
      } else {
        setLastPublishedStandings(null);
      }
    });

    return () => {
      unsubResults();
      unsubStandings();
    };
  }, []);

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      const standingsData: PublishedStandings = {
        results: teamResults,
        publishedAtResultCount: publishedResultsCount,
        publishedAt: new Date()
      };
      await setDoc(doc(db, 'standings', 'team_marks'), standingsData);
      toast({
        title: "Success!",
        description: "Team standings have been published to the homepage."
      });
    } catch (e) {
      console.error(e);
      toast({
        title: "Error",
        description: "Failed to publish team standings.",
        variant: "destructive"
      });
    } finally {
      setIsPublishing(false);
      setIsAlertOpen(false);
    }
  }

  const filteredResults = useMemo(() => {
    return teamResults.filter(r =>
      searchTerm === '' ||
      r.teamName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.leaderName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [teamResults, searchTerm]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)]">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
          <Loader2 className="h-12 w-12 animate-spin text-primary relative z-10" />
        </div>
        <p className="text-muted-foreground animate-pulse mt-4">Calculating Team Standings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 relative min-h-screen p-1">
      {/* Dynamic Background */}
      <div className="fixed inset-0 -z-10 h-full w-full bg-background overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-yellow-500/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-orange-500/5 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold font-headline tracking-tight">Team Marks</h1>
          <p className="text-lg text-muted-foreground">Overall team performance and standings.</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-primary" />
              Publish Standings
            </CardTitle>
            <CardDescription>Make the current team standings public on the homepage.</CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <div className="p-4 border border-white/10 rounded-xl bg-muted/20 flex items-center justify-between hover:bg-muted/30 transition-colors">
              <div>
                <p className="text-sm text-muted-foreground">Total Published Results</p>
                <p className="text-3xl font-bold mt-1">{publishedResultsCount}</p>
              </div>
              <div className="p-3 rounded-full bg-blue-500/10 text-blue-500">
                <CheckSquare className="w-6 h-6" />
              </div>
            </div>
            <div className="p-4 border border-white/10 rounded-xl bg-muted/20 flex items-center justify-between hover:bg-muted/30 transition-colors">
              <div>
                <p className="text-sm text-muted-foreground">Last Published at Result #</p>
                <p className="text-3xl font-bold mt-1">{lastPublishedStandings?.publishedAtResultCount ?? 'N/A'}</p>
              </div>
              <div className="p-3 rounded-full bg-purple-500/10 text-purple-500">
                <Megaphone className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/20 border-t border-white/5">
            <Button onClick={() => setIsAlertOpen(true)} disabled={isPublishing} className="w-full sm:w-auto shadow-lg shadow-primary/20">
              {isPublishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Megaphone className="mr-2 h-4 w-4" />}
              Publish Current Standings
            </Button>
          </CardFooter>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
          <CardHeader className="border-b border-white/5 bg-muted/20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-500" />
                  Live Team Standings
                </CardTitle>
                <CardDescription>Overall team performance based on all completed programs so far.</CardDescription>
              </div>
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by team or leader..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-background/50 border-white/10 focus:bg-background transition-colors"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-white/5 border-white/5">
                  <TableHead className="w-[80px]">Rank</TableHead>
                  <TableHead>Team Name</TableHead>
                  <TableHead>Team Leader</TableHead>
                  <TableHead className="text-right">Total Points</TableHead>
                  <TableHead className="w-[120px] text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {filteredResults.map((result, index) => (
                    <motion.tr
                      key={result.teamId}
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
                      <TableCell className="font-medium text-base">{result.teamName}</TableCell>
                      <TableCell className="text-muted-foreground">{result.leaderName}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-lg text-primary">{result.totalPoints.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/admin/team-marks/${result.teamId}`}>
                            View Report <ArrowRight className="ml-2 h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
                {filteredResults.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No teams found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </motion.div>

      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent className="bg-background/95 backdrop-blur-xl border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the current public team standings with the live data you see now. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePublish} className="bg-primary hover:bg-primary/90">
              Yes, Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
