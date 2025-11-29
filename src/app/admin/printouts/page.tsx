
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection,
  getFirestore,
  onSnapshot,
  doc,
  getDocs,
} from 'firebase/firestore';
import { app } from '@/lib/firebase';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Users, List, Trophy, Star, Search, Award } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

import type { Program as BaseProgram } from '@/app/admin/programs/page';
import type { Participant as BaseParticipant } from '@/app/teams/add-participants/page';
import type { Team as BaseTeam } from '@/app/admin/teams/page';
import type { Category } from '@/app/admin/categories/page';
import type { AppSettings } from '@/app/admin/settings/page';


const db = getFirestore(app);

// Data types
type Program = BaseProgram & { categoryName?: string };
type Participant = BaseParticipant & { categoryName: string, teamName: string };
type Team = BaseTeam & { leaderName?: string };
type Assignment = { id: string; programId: string; studentId: string; teamId: string; status?: 'cancelled' };
type Score = { programId: string; assignmentId: string; judgeId: string; score: number };
type PointsSettings = {
  normalGradePoints: Record<string, number>;
  specialGradePoints: Record<string, Record<string, number>>;
  rankPoints: Record<string, number>;
};
type PublishedStandings = {
  results: {
    teamId: string;
    teamName: string;
    leaderName: string;
    totalPoints: number;
  }[];
  publishedAtResultCount: number;
  publishedAt: {
    seconds: number;
    nanoseconds: number;
  };
}

const getGrade = (score: number) => {
  if (score >= 90) return 'A+';
  if (score >= 70) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  return 'No Grade';
};

type ProgramFilter = 'all' | 'individual' | 'group' | 'specific' | 'individual-specific' | 'group-specific';

export default function PrintoutsPage() {
  const [loading, setLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  // Raw Data States
  const [programs, setPrograms] = useState<Program[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [memberCategories, setMemberCategories] = useState<Category[]>([]);
  const [programCategories, setProgramCategories] = useState<Category[]>([]);
  const [pointsSettings, setPointsSettings] = useState<PointsSettings | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [publishedStandings, setPublishedStandings] = useState<PublishedStandings | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // Filter States
  const [topCandidatesProgramFilter, setTopCandidatesProgramFilter] = useState<ProgramFilter>('all');
  const [programResultsRankOnly, setProgramResultsRankOnly] = useState(false);

  useEffect(() => {
    let loadedCount = 0;
    const totalCollections = 9; // Updated to include settings
  
    const handleInitialLoad = () => {
      loadedCount++;
      if (loadedCount === totalCollections) {
        setLoading(false);
      }
    };
  
    const unsubscribes = [
      onSnapshot(collection(db, 'programCategories'), (snap) => {
        setProgramCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
        handleInitialLoad();
      }),
      onSnapshot(collection(db, 'programs'), (snap) => {
        setPrograms(snap.docs.map(d => ({ id: d.id, ...d.data() } as Program)));
        handleInitialLoad();
      }),
      onSnapshot(collection(db, 'students'), (snap) => {
        setParticipants(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Participant));
        handleInitialLoad();
      }),
      onSnapshot(collection(db, 'teams'), (snap) => {
        setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() } as Team)));
        handleInitialLoad();
      }),
      onSnapshot(collection(db, 'memberCategories'), (snap) => {
        setMemberCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
        handleInitialLoad();
      }),
      onSnapshot(collection(db, 'assignments'), (snap) => {
        setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)));
        handleInitialLoad();
      }),
      onSnapshot(collection(db, 'scores'), (snap) => {
        setScores(snap.docs.map(d => d.data() as Score));
        handleInitialLoad();
      }),
      onSnapshot(doc(db, 'points', 'gradeAndRankPoints'), (snap) => {
        setPointsSettings(snap.data() as PointsSettings);
        handleInitialLoad();
      }),
       onSnapshot(doc(db, 'settings', 'global'), (snap) => {
        setSettings(snap.data() as AppSettings);
        handleInitialLoad();
      }),
      onSnapshot(doc(db, 'standings', 'team_marks'), (snap) => {
        setPublishedStandings(snap.exists() ? snap.data() as PublishedStandings : null);
      }),
    ];
  
    return () => unsubscribes.forEach(unsub => unsub && unsub());
  }, []);
  
  const enrichedPrograms = useMemo(() => {
    if (programCategories.length === 0) return programs;
    const categoryMap = new Map(programCategories.map(c => [c.id, c.name]));
    return programs.map(p => ({
        ...p,
        categoryName: categoryMap.get(p.categoryId) || "N/A"
    }));
  }, [programs, programCategories]);


  const calculateTopCandidates = useCallback((programSet: Program[]) => {
    if (!pointsSettings || loading) return [];

    const generalCategoryIds = programCategories.filter(pc => pc.isGeneral).map(pc => pc.id);

    let filteredPrograms = programSet;
    if (topCandidatesProgramFilter !== 'all') {
        filteredPrograms = programSet.filter(p => {
            const isSpecific = !generalCategoryIds.includes(p.categoryId);
            switch (topCandidatesProgramFilter) {
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
        
        scoresList.sort((a,b) => b.averageScore - a.averageScore);
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
        name: participant.name,
        chestNumber: participant.chestNumber,
        teamName: teamMap.get(participant.teamId) || 'Unknown Team',
        categoryName: categoryMap.get(participant.categoryId) || 'Unknown',
        totalPoints,
      };
    });
    
    participantResults.sort((a, b) => b.totalPoints - a.totalPoints);
    return participantResults;
  }, [topCandidatesProgramFilter, enrichedPrograms, participants, assignments, scores, pointsSettings, teams, memberCategories, programCategories, loading]);

  const calculateTeamStandings = useCallback((programSet: Program[]) => {
    if (loading || !pointsSettings) return [];
  
    const teamPoints: Record<string, number> = {};
    teams.forEach(t => teamPoints[t.id] = 0);
  
    const programScoresCache: Record<string, { assignmentId: string; averageScore: number }[]> = {};
  
    programSet.forEach(program => {
        const programAssignments = assignments.filter(a => a.programId === program.id && a.status !== 'cancelled');
        const scoresList = programAssignments.map(pa => {
            const assignmentScores = scores.filter(s => s.assignmentId === pa.id);
            if (assignmentScores.length === 0) return null;
            const totalScore = assignmentScores.reduce((sum, s) => sum + s.score, 0);
            return { assignmentId: pa.id, averageScore: totalScore / assignmentScores.length };
        }).filter(Boolean) as { assignmentId: string; averageScore: number }[];
        scoresList.sort((a, b) => b.averageScore - a.averageScore);
        programScoresCache[program.id] = scoresList;
    });
    
    const programSetIds = new Set(programSet.map(p => p.id));
  
    participants.forEach(p => {
        let participantTotalPoints = 0;
        const participantAssignments = assignments.filter(a => 
            a.studentId === p.id && 
            a.status !== 'cancelled' &&
            programSetIds.has(a.programId)
        );
  
        participantAssignments.forEach(assign => {
            const program = programSet.find(pr => pr.id === assign.programId);
            if (!program) return;
  
            const scoresForProgram = programScoresCache[program.id];
            if (!scoresForProgram) return;

            const participantScoreData = scoresForProgram.find(s => s.assignmentId === assign.id);

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
                    if (scoresForProgram[i].assignmentId === assign.id) {
                        break;
                    }
                }

                let rankPoints = 0;
                if (rank > 0) {
                    if (rank === 1) rankPoints = pointsSettings.rankPoints?.first || 0;
                    else if (rank === 2) rankPoints = pointsSettings.rankPoints?.second || 0;
                    else if (rank === 3) rankPoints = pointsSettings.rankPoints?.third || 0;
                }
                
                participantTotalPoints += gradePoints + rankPoints;
            }
        });
        
        if(teamPoints[p.teamId] !== undefined) {
            teamPoints[p.teamId] += participantTotalPoints;
        }
    });
  
    return teams
      .map(t => ({...t, totalPoints: teamPoints[t.id] || 0, teamName: t.name}))
      .sort((a,b) => b.totalPoints - a.totalPoints);
  }, [loading, pointsSettings, teams, participants, assignments, scores]);

  const liveTeamStandings = useMemo(() => calculateTeamStandings(enrichedPrograms), [calculateTeamStandings, enrichedPrograms]);
  const publishedTeamStandings = useMemo(() => calculateTeamStandings(enrichedPrograms.filter(p => p.isPublished)), [calculateTeamStandings, enrichedPrograms]);
  
  const liveTopCandidates = useMemo(() => calculateTopCandidates(enrichedPrograms), [calculateTopCandidates, enrichedPrograms]);
  const publishedTopCandidates = useMemo(() => calculateTopCandidates(enrichedPrograms.filter(p => p.isPublished)), [calculateTopCandidates, enrichedPrograms]);


  const generatePdf = (reportType: string, options?: { standingsType?: 'live' | 'published', candidatesType?: 'live' | 'published'}) => {
    setIsDownloading(reportType);
    try {
      const doc = new jsPDF();
      const primaryColor = [29, 113, 222]; 
      const festName = settings?.festName || 'Fest Central';

      const addHeaderAndFooter = (doc: jsPDF, title: string, isFirstPage: boolean) => {
          if (isFirstPage) {
              doc.setFontSize(16);
              doc.setTextColor(40);
              doc.text(`${festName} - ${title} Report`, 14, 15);
              doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
              doc.line(14, 25, 196, 25);
          }
          const pageCount = (doc as any).internal.getNumberOfPages();
          doc.setFontSize(8);
          doc.setTextColor(150);
          doc.text(`Page ${doc.internal.pages.length - 1} of ${pageCount}`, 14, 287, {baseline: "bottom"});
          doc.text(`Generated: ${new Date().toLocaleString()}`, 196, 287, { align: 'right', baseline: "bottom" });
      };

      let headData: any[] = [];
      let bodyData: any[] = [];
      let reportTitle = reportType;
      
      switch(reportType) {
        case 'Team Standings':
           const standingsData = options?.standingsType === 'live' ? liveTeamStandings : publishedTeamStandings;
           if (!standingsData || standingsData.length === 0) {
             toast({ title: "No Data", description: `No ${options?.standingsType} standings data available to print.`, variant: "destructive" });
             setIsDownloading(null);
             return;
           }
           const type = options?.standingsType === 'live' ? 'Live' : 'Published';
           reportTitle = `Team Standings (${type})`;
           headData = [['Rank', 'Team Name', 'Total Points']];
           bodyData = standingsData.map((t, index) => [index + 1, t.teamName, t.totalPoints.toFixed(2)]);
           break;
            
        case 'Top Candidates':
             const candidatesData = options?.candidatesType === 'live' ? liveTopCandidates : publishedTopCandidates;
             if (!candidatesData || candidatesData.length === 0) {
               toast({ title: "No Data", description: `No ${options?.candidatesType} top candidates data available to print.`, variant: "destructive" });
               setIsDownloading(null);
               return;
             }
             const candidatesType = options?.candidatesType === 'live' ? 'Live' : 'Published';
             reportTitle = `Top Candidates (${candidatesType})`;
             headData = [['Rank', 'Name', 'Chest No.', 'Team', 'Category', 'Total Points']];
             bodyData = candidatesData.map((p, index) => [index + 1, p.name, p.chestNumber, p.teamName, p.categoryName, p.totalPoints.toFixed(2)]);
            break;

        case 'Program Schedule':
            headData = [['Program Name', 'Category', 'Type', 'Mode']];
            bodyData = enrichedPrograms.map(p => {
                return [p.name, p.categoryName || 'N/A', p.type, p.mode];
            });
            break;
        case 'Participant List':
            headData = [['Chest No.', 'Name', 'Team', 'Category']];
            bodyData = participants.map(p => {
                const team = teams.find(t => t.id === p.teamId);
                const category = memberCategories.find(c => c.id === p.categoryId);
                return [p.chestNumber, p.name, team?.name || 'N/A', category?.name || 'N/A'];
            }).sort((a, b) => (a[0] as number) - (b[0] as number));
            break;
        
        case 'Program Results':
            const sortedPrograms = [...enrichedPrograms].sort((a, b) => a.name.localeCompare(b.name));
            let finalY = 30;
            
            addHeaderAndFooter(doc, 'Program Results', true);

            sortedPrograms.forEach(program => {
                const programAssignments = assignments.filter(a => a.programId === program.id && a.status !== 'cancelled');
                
                const participantScores = programAssignments.map(assign => {
                    const participant = participants.find(p => p.id === assign.studentId);
                    const assignmentScores = scores.filter(s => s.assignmentId === assign.id);
                    const avgScore = assignmentScores.length > 0 ? assignmentScores.reduce((sum, s) => sum + s.score, 0) / assignmentScores.length : 0;
                    return { participant, avgScore, assign };
                }).sort((a, b) => b.avgScore - a.avgScore);

                let participantDetails: any[] = [];
                let currentRank = 0;
                let lastScore = -1;

                participantScores.forEach((pScore, index) => {
                    if (pScore.avgScore !== lastScore) {
                        currentRank = index + 1;
                        lastScore = pScore.avgScore;
                    }
                    if (!pScore.participant) return;

                    const grade = getGrade(pScore.avgScore);
                    const gradePoints = program.markType === 'special-mark'
                        ? pointsSettings?.specialGradePoints?.[program.id]?.[grade] || 0
                        : pointsSettings?.normalGradePoints?.[grade] || 0;
                    
                    participantDetails.push({
                        rank: currentRank,
                        name: pScore.participant.name,
                        chestNumber: pScore.participant.chestNumber,
                        teamName: teams.find(t => t.id === pScore.participant?.teamId)?.name || 'N/A',
                        grade,
                        points: gradePoints,
                    })
                });

                if (programResultsRankOnly) {
                    participantDetails = participantDetails.filter(p => p.rank <= 3);
                }

                if (participantDetails.length === 0) return;

                const head = [['Rank', 'Name', 'Chest No', 'Team', 'Grade', 'Points']];
                const programTitle = `${program.name} (${program.categoryName})`;
                
                const tableBody = participantDetails.map((p) => [p.rank, p.name, p.chestNumber, p.teamName, p.grade, p.points.toFixed(2)]);
                
                autoTable(doc, {
                    head: [[{ content: programTitle, colSpan: 6, styles: { fontStyle: 'bold', fillColor: [29, 113, 222], textColor: 255 } }]],
                    body: tableBody,
                    tableWidth: 'auto',
                    startY: finalY,
                    theme: 'grid',
                    didDrawPage: (data) => {
                      addHeaderAndFooter(doc, 'Program Results', false);
                      finalY = 30; // Reset Y for new page
                    }
                });
                finalY = (doc as any).lastAutoTable.finalY + 10;
            });
            doc.save(`program-results-report.pdf`);
            setIsDownloading(null);
            return; // Exit as this report type has custom handling

        default:
            toast({ title: 'Error', description: 'Unknown report type.', variant: 'destructive'});
            setIsDownloading(null);
            return;
      }
      
      autoTable(doc, {
        head: headData,
        body: bodyData,
        startY: 30,
        theme: 'grid',
        headStyles: { fillColor: primaryColor },
        didDrawPage: (data) => addHeaderAndFooter(doc, reportTitle, data.pageNumber === 1),
      });

      doc.save(`${reportTitle.toLowerCase().replace(/ /g, '-')}-report.pdf`);

    } catch(e) {
        console.error(e);
        toast({ title: 'Error', description: 'Failed to generate PDF.', variant: 'destructive'});
    } finally {
        setIsDownloading(null);
    }
  };


  if (loading) {
    return (
        <div className="flex h-full items-center justify-center">
            <Loader2 className="mr-2 h-8 w-8 animate-spin" />
            <span>Loading Report Data...</span>
        </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold font-headline">Print Center</h1>
      <p className="text-muted-foreground">
        Download and print comprehensive reports for various aspects of the event.
      </p>

      <Tabs defaultValue="team">
        <TabsList>
            <TabsTrigger value="team">Team & Participant Reports</TabsTrigger>
            <TabsTrigger value="general">General Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="team" className="mt-4">
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Trophy className="h-6 w-6" /> Team Standings</CardTitle>
                        <CardDescription>Overall team performance ranked by total points. Choose between the latest published data or the live, real-time standings.</CardDescription>
                    </CardHeader>
                    <CardFooter className="gap-4">
                        <Button onClick={() => generatePdf('Team Standings', { standingsType: 'published' })} disabled={!!isDownloading}>
                            {isDownloading === 'Team Standings-published' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            Download Published
                        </Button>
                        <Button onClick={() => generatePdf('Team Standings', { standingsType: 'live' })} disabled={!!isDownloading} variant="secondary">
                            {isDownloading === 'Team Standings-live' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            Download Live
                        </Button>
                    </CardFooter>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Star className="h-6 w-6" /> Top Candidates</CardTitle>
                        <CardDescription>All participants ranked by their total accumulated points. Use the filter below to generate a report for a specific subset of programs.</CardDescription>
                    </CardHeader>
                    <CardContent>
                       <Select value={topCandidatesProgramFilter} onValueChange={(value) => setTopCandidatesProgramFilter(value as ProgramFilter)}>
                            <SelectTrigger className="w-full sm:w-[300px]"><SelectValue placeholder="Filter by program type" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Programs</SelectItem>
                                <SelectItem value="individual">All Individual Programs</SelectItem>
                                <SelectItem value="group">All Group Programs</SelectItem>
                                <SelectItem value="specific">All Specific Category Programs</SelectItem>
                                <SelectItem value="individual-specific">Individual Programs (Specific)</SelectItem>
                                <SelectItem value="group-specific">Group Programs (Specific)</SelectItem>
                            </SelectContent>
                        </Select>
                    </CardContent>
                    <CardFooter className="gap-4">
                        <Button onClick={() => generatePdf('Top Candidates', { candidatesType: 'published' })} disabled={!!isDownloading}>
                            {isDownloading === 'Top Candidates-published' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            Download Published PDF
                        </Button>
                        <Button onClick={() => generatePdf('Top Candidates', { candidatesType: 'live' })} disabled={!!isDownloading} variant="secondary">
                            {isDownloading === 'Top Candidates-live' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            Download Live PDF
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </TabsContent>
        <TabsContent value="general" className="mt-4">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><List className="h-6 w-6" /> Program Schedule</CardTitle>
                        <CardDescription>A complete list of all programs, their categories, and types.</CardDescription>
                    </CardHeader>
                    <CardFooter>
                        <Button onClick={() => generatePdf('Program Schedule')} disabled={!!isDownloading}>
                            {isDownloading === 'Program Schedule' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            Download PDF
                        </Button>
                    </CardFooter>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Users className="h-6 w-6" /> Participant List</CardTitle>
                        <CardDescription>A master list of all registered participants with their details.</CardDescription>
                    </CardHeader>
                    <CardFooter>
                         <Button onClick={() => generatePdf('Participant List')} disabled={!!isDownloading}>
                            {isDownloading === 'Participant List' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            Download PDF
                        </Button>
                    </CardFooter>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Award className="h-6 w-6" /> Program Results</CardTitle>
                        <CardDescription>A detailed breakdown of results for every program.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center space-x-2">
                           <Checkbox
                                id="rank-only"
                                checked={programResultsRankOnly}
                                onCheckedChange={(checked) => setProgramResultsRankOnly(Boolean(checked))}
                            />
                            <Label htmlFor="rank-only" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                Show Rank Holders Only
                            </Label>
                        </div>
                    </CardContent>
                    <CardFooter>
                         <Button onClick={() => generatePdf('Program Results')} disabled={!!isDownloading}>
                            {isDownloading === 'Program Results' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            Download PDF
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
