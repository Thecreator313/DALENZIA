
'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, getFirestore, onSnapshot, query, orderBy, doc } from 'firebase/firestore';
import { app } from '@/lib/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Trophy, LogIn, Search, Sparkles, Activity, Calendar, ArrowRight, Crown, Medal } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCountUp } from '@/hooks/use-count-up';
import type { AppSettings } from '@/app/admin/settings/page';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';

const db = getFirestore(app);

type PublishedResult = {
    id: string;
    resultNumber: number;
    programName: string;
    categoryName: string;
    winners: Record<string, { name: string, teamName: string }[]>;
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

const TeamStandingsRow = ({ team, index }: { team: PublishedStandings['results'][0], index: number }) => {
    const animatedPoints = useCountUp(team.totalPoints);

    return (
        <motion.tr
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="group relative overflow-hidden transition-colors hover:bg-muted/30"
        >
            <TableCell className="font-bold text-lg relative z-10">
                <div className="flex items-center gap-4">
                    {index < 3 ? (
                        <div className={`
                            relative flex items-center justify-center w-10 h-10 rounded-full shadow-sm
                            ${index === 0 ? 'bg-gradient-to-br from-yellow-300 to-yellow-600 text-white ring-2 ring-yellow-200/50' :
                                index === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-500 text-white ring-2 ring-slate-200/50' :
                                    'bg-gradient-to-br from-amber-600 to-amber-800 text-white ring-2 ring-amber-500/50'}
                        `}>
                            {index === 0 ? <Crown className="h-5 w-5" /> : <Medal className="h-5 w-5" />}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted text-muted-foreground font-mono text-sm">
                            #{index + 1}
                        </div>
                    )}
                </div>
            </TableCell>
            <TableCell className="font-medium text-base relative z-10">
                <span className="group-hover:text-primary transition-colors duration-300">{team.teamName}</span>
            </TableCell>
            <TableCell className="text-right font-mono font-bold text-xl relative z-10">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-600">
                    {animatedPoints.toFixed(2)}
                </span>
            </TableCell>
        </motion.tr>
    );
};

export default function PublicResultsPage() {
    const [results, setResults] = useState<PublishedResult[]>([]);
    const [teamStandings, setTeamStandings] = useState<PublishedStandings | null>(null);
    const [loading, setLoading] = useState(true);
    const [festName, setFestName] = useState('Fest Central');
    const [searchTerm, setSearchTerm] = useState('');
    const router = useRouter();

    useEffect(() => {
        setLoading(true);

        const settingsDocRef = doc(db, 'settings', 'global');
        const unsubscribeSettings = onSnapshot(settingsDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const settings = docSnap.data() as AppSettings;
                if (settings.festName) {
                    setFestName(settings.festName);
                }
            }
        });

        const resultsQuery = query(collection(db, 'publishedResults'), orderBy('resultNumber', 'desc'));
        const unsubscribeResults = onSnapshot(resultsQuery, (snapshot) => {
            const resultsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PublishedResult));
            setResults(resultsList);
        }, (error) => {
            console.error("Error fetching published results: ", error);
            setLoading(false);
        });

        const unsubscribeStandings = onSnapshot(doc(db, 'standings', 'team_marks'), (snap) => {
            if (snap.exists()) {
                setTeamStandings(snap.data() as PublishedStandings);
            } else {
                setTeamStandings(null);
            }
            setLoading(false);
        });

        return () => {
            unsubscribeSettings();
            unsubscribeResults();
            unsubscribeStandings();
        };
    }, []);

    const filteredResults = useMemo(() => {
        if (!searchTerm) return results;
        return results.filter(result =>
            result.programName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            result.categoryName.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [results, searchTerm]);

    const navigateToResult = (resultNumber: number) => {
        router.push(`/results/${resultNumber}`);
    }

    return (
        <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 overflow-x-hidden relative">
            {/* Advanced Dynamic Background */}
            <div className="fixed inset-0 -z-10 h-full w-full bg-background overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/10 blur-[120px] animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
                <div className="absolute top-[40%] left-[50%] -translate-x-1/2 w-[50%] h-[50%] rounded-full bg-primary/5 blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
                <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />
            </div>

            <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
                <div className="container flex h-16 items-center justify-between px-4 md:px-6">
                    <Link href="/" className="flex items-center gap-3 group">
                        <div className="relative">
                            <div className="absolute inset-0 bg-primary/20 blur-lg rounded-full group-hover:bg-primary/40 transition-colors" />
                            <div className="relative p-2 rounded-xl bg-background/50 border border-white/10 group-hover:border-primary/20 transition-colors">
                                <Trophy className="w-5 h-5 text-primary" />
                            </div>
                        </div>
                        <span className="text-xl font-bold font-headline tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                            {festName}
                        </span>
                    </Link>
                    <nav className="flex items-center gap-4">
                        <Button variant="ghost" size="sm" asChild className="hidden md:flex hover:bg-primary/5 hover:text-primary">
                            <Link href="/login">
                                <LogIn className="mr-2 h-4 w-4" />
                                Official Login
                            </Link>
                        </Button>
                    </nav>
                </div>
            </header>

            <main className="container px-4 py-12 md:px-6">
                {loading ? (
                    <div className="flex flex-col justify-center items-center h-[60vh] gap-6">
                        <div className="relative">
                            <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-ping" />
                            <div className="relative bg-background p-4 rounded-full border border-primary/20 shadow-xl">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        </div>
                        <p className="text-muted-foreground animate-pulse font-medium">Fetching latest updates...</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-16">
                        {/* Hero Section */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className="text-center space-y-8 py-12 relative"
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.2 }}
                                className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary backdrop-blur-sm shadow-sm hover:bg-primary/10 transition-colors cursor-default"
                            >
                                <span className="relative flex h-2 w-2 mr-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                                </span>
                                Live Updates
                            </motion.div>

                            <div className="space-y-4">
                                <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight">
                                    <span className="bg-clip-text text-transparent bg-gradient-to-b from-foreground via-foreground/80 to-foreground/40">
                                        {festName}
                                    </span>
                                </h1>
                                <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed font-light">
                                    Experience the thrill of competition. <br className="hidden md:block" />
                                    Real-time results, standings, and updates.
                                </p>
                            </div>
                        </motion.div>

                        <div className="grid gap-8 lg:grid-cols-12">
                            {/* Standings Column */}
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.3 }}
                                className="lg:col-span-4 space-y-6"
                            >
                                <div className="flex items-center gap-3 mb-4 px-1">
                                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                        <Activity className="h-5 w-5" />
                                    </div>
                                    <h2 className="text-2xl font-bold tracking-tight">Leaderboard</h2>
                                </div>

                                {teamStandings ? (
                                    <Card className="border-primary/10 shadow-2xl shadow-primary/5 bg-card/40 backdrop-blur-md overflow-hidden ring-1 ring-white/5">
                                        <CardHeader className="bg-muted/30 pb-6 border-b border-white/5">
                                            <CardTitle className="text-lg flex items-center gap-2">
                                                Overall Standings
                                            </CardTitle>
                                            <CardDescription>
                                                Updated after Result #{teamStandings.publishedAtResultCount}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="p-0">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="hover:bg-transparent border-white/5">
                                                        <TableHead className="w-[80px] pl-6">Rank</TableHead>
                                                        <TableHead>Team</TableHead>
                                                        <TableHead className="text-right pr-6">Points</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {teamStandings.results.slice(0, 10).map((team, index) => (
                                                        <TeamStandingsRow key={team.teamId} team={team} index={index} />
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </CardContent>
                                    </Card>
                                ) : (
                                    <Card className="border-dashed border-2 bg-transparent">
                                        <CardContent className="pt-6">
                                            <p className="text-center text-muted-foreground py-10">Standings coming soon.</p>
                                        </CardContent>
                                    </Card>
                                )}
                            </motion.div>

                            {/* Results Column */}
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.4 }}
                                className="lg:col-span-8 space-y-6"
                            >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 px-1">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                                            <Calendar className="h-5 w-5" />
                                        </div>
                                        <h2 className="text-2xl font-bold tracking-tight">Latest Results</h2>
                                    </div>
                                    <div className="relative w-full sm:max-w-xs group">
                                        <div className="absolute inset-0 bg-primary/20 blur-md rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                                        <Input
                                            placeholder="Search programs..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="pl-10 bg-background/80 backdrop-blur-sm border-primary/10 focus:border-primary/50 transition-all relative z-10 shadow-sm"
                                        />
                                    </div>
                                </div>

                                {filteredResults.length === 0 ? (
                                    <Card className="border-dashed border-2 bg-transparent">
                                        <CardContent className="pt-6">
                                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                                <div className="p-6 rounded-full bg-muted/50 mb-6">
                                                    <Search className="h-10 w-10 text-muted-foreground" />
                                                </div>
                                                <h3 className="text-xl font-semibold mb-2">No results found</h3>
                                                <p className="text-muted-foreground max-w-sm mx-auto">
                                                    {results.length === 0 ? "Results will be published here soon. Stay tuned!" : "We couldn't find any results matching your search."}
                                                </p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ) : (
                                    <div className="grid gap-5 sm:grid-cols-2">
                                        <AnimatePresence mode="popLayout">
                                            {filteredResults.map((result, i) => (
                                                <motion.div
                                                    key={result.id}
                                                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.95 }}
                                                    transition={{ delay: i * 0.05, duration: 0.3 }}
                                                    layout
                                                >
                                                    <Card
                                                        className="group cursor-pointer h-full flex flex-col overflow-hidden border-white/10 bg-card/40 backdrop-blur-sm hover:bg-card/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/5 ring-1 ring-transparent hover:ring-primary/20"
                                                        onClick={() => navigateToResult(result.resultNumber)}
                                                    >
                                                        <CardHeader className="pb-4 relative overflow-hidden">
                                                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                                                <Trophy className="w-24 h-24 -rotate-12" />
                                                            </div>
                                                            <div className="flex justify-between items-start gap-4 relative z-10">
                                                                <div className="space-y-1">
                                                                    <Badge variant="outline" className="mb-2 bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary">
                                                                        #{result.resultNumber}
                                                                    </Badge>
                                                                    <CardTitle className="text-xl leading-tight group-hover:text-primary transition-colors line-clamp-2">
                                                                        {result.programName}
                                                                    </CardTitle>
                                                                    <CardDescription className="line-clamp-1 font-medium">
                                                                        {result.categoryName}
                                                                    </CardDescription>
                                                                </div>
                                                            </div>
                                                        </CardHeader>
                                                        <CardContent className="flex-grow pt-0 relative z-10">
                                                            <div className="space-y-3">
                                                                {Object.entries(result.winners).slice(0, 1).map(([rank, holders]) => (
                                                                    holders.length > 0 && (
                                                                        <div key={rank} className="p-3 rounded-xl bg-muted/40 border border-white/5 group-hover:border-primary/10 transition-colors">
                                                                            <div className="flex items-center gap-3 mb-2">
                                                                                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-600 shrink-0">
                                                                                    <Crown className="h-3.5 w-3.5" />
                                                                                </div>
                                                                                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Winner</span>
                                                                            </div>
                                                                            <div className="flex flex-col min-w-0 pl-9">
                                                                                <span className="font-semibold truncate text-foreground/90">{holders[0].name}</span>
                                                                                <span className="text-sm text-muted-foreground truncate">{holders[0].teamName}</span>
                                                                            </div>
                                                                            {holders.length > 1 && (
                                                                                <div className="mt-2 pl-9">
                                                                                    <Badge variant="secondary" className="text-[10px] h-5">+{holders.length - 1} others</Badge>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )
                                                                ))}
                                                                <div className="flex items-center justify-end text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors pt-2">
                                                                    <span>View Full Result</span>
                                                                    <ArrowRight className="ml-1 h-3 w-3 group-hover:translate-x-1 transition-transform" />
                                                                </div>
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    </div>
                                )}
                            </motion.div>
                        </div>
                    </div>
                )}
            </main>

            <footer className="py-8 border-t border-white/10 bg-muted/20 backdrop-blur-sm mt-auto">
                <div className="container flex flex-col items-center justify-between gap-4 md:flex-row px-4 md:px-6">
                    <p className="text-sm text-center text-muted-foreground md:text-left">
                        © {new Date().getFullYear()} {festName}. All rights reserved.
                    </p>
                    <p className="text-sm text-center text-muted-foreground md:text-right">
                        Developed by <a href="https://wa.me/9744460317" target="_blank" rel="noopener noreferrer" className="font-medium hover:text-primary transition-colors">Habeeb Rahman</a>
                    </p>
                </div>
            </footer>
        </div>
    );
}
