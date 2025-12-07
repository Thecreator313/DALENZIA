
'use client';

import { useState, useEffect } from 'react';
import { collection, getFirestore, onSnapshot, query, where } from 'firebase/firestore';
import { app } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Trophy, ArrowLeft, Crown, Medal, Share2, Sparkles, Search, Loader2 } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import html2canvas from 'html2canvas';
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";
import { Download, FileImage } from "lucide-react";
import { useRef } from 'react';

const db = getFirestore(app);

type PublishedResult = {
    id: string;
    resultNumber: number;
    programName: string;
    categoryName: string;
    winners: Record<string, { name: string, teamName: string }[]>;
};

const PodiumStep = ({ rank, winners, delay }: { rank: string, winners: { name: string, teamName: string }[], delay: number }) => {
    const isFirst = rank === '1';
    const isSecond = rank === '2';
    const isThird = rank === '3';

    const heightClass = isFirst ? 'h-48 md:h-64' : isSecond ? 'h-32 md:h-48' : 'h-24 md:h-36';
    const colorClass = isFirst ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-500' :
        isSecond ? 'bg-slate-400/20 border-slate-400/50 text-slate-400' :
            'bg-amber-700/20 border-amber-700/50 text-amber-700';

    return (
        <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.5, type: "spring" }}
            className={`flex flex-col items-center justify-end ${isFirst ? 'order-2' : isSecond ? 'order-1' : 'order-3'}`}
        >
            <div className="flex flex-col items-center mb-4 space-y-2">
                <div className={`p-3 rounded-full border-2 ${colorClass} bg-background backdrop-blur-md shadow-lg`}>
                    {isFirst ? <Crown className="w-6 h-6 md:w-8 md:h-8" /> : <Medal className="w-5 h-5 md:w-6 md:h-6" />}
                </div>
                <div className="flex flex-col items-center text-center gap-1">
                    {winners.map((winner, idx) => (
                        <div key={idx} className="bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/10 shadow-sm">
                            <p className="font-bold text-sm md:text-base whitespace-nowrap">{winner.name}</p>
                            <p className="text-xs text-muted-foreground">{winner.teamName}</p>
                        </div>
                    ))}
                </div>
            </div>
            <div className={`w-full ${heightClass} ${colorClass} rounded-t-lg border-t border-x flex items-start justify-center pt-4 relative overflow-hidden`}>
                <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
                <span className="text-4xl md:text-6xl font-black opacity-20">{rank}</span>
            </div>
        </motion.div>
    );
};

export default function PublicResultDetailPage() {
    const [result, setResult] = useState<PublishedResult | null>(null);
    const [loading, setLoading] = useState(true);
    const params = useParams();
    const router = useRouter();
    const resultId = params.resultId as string;
    const posterRef = useRef<HTMLDivElement>(null);

    const handleDownloadPoster = async () => {
        if (!posterRef.current) return;

        try {
            const canvas = await html2canvas(posterRef.current, {
                scale: 2,
                backgroundColor: null,
                useCORS: true,
            });

            const image = canvas.toDataURL("image/png");
            const link = document.createElement("a");
            link.href = image;
            link.download = `result-${result?.programName || 'poster'}.png`;
            link.click();
        } catch (error) {
            console.error("Error generating poster:", error);
        }
    };

    useEffect(() => {
        if (!resultId) return;

        setLoading(true);
        const resultNumber = parseInt(resultId, 10);

        if (isNaN(resultNumber)) {
            setLoading(false);
            return;
        }

        const resultsQuery = query(collection(db, 'publishedResults'), where('resultNumber', '==', resultNumber));
        const unsubscribe = onSnapshot(resultsQuery, (snapshot) => {
            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                setResult({ id: doc.id, ...doc.data() } as PublishedResult);
            } else {
                setResult(null);
            }
            setLoading(false);
        }, (error) => {
            console.error("Error fetching result: ", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [resultId]);

    if (loading) {
        return (
            <div className="flex flex-col h-screen items-center justify-center gap-4 bg-background">
                <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
                    <Loader2 className="h-12 w-12 animate-spin text-primary relative z-10" />
                </div>
                <p className="text-muted-foreground animate-pulse">Loading Result Details...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 overflow-x-hidden relative">
            {/* Dynamic Background */}
            <div className="fixed inset-0 -z-10 h-full w-full bg-background overflow-hidden">
                <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[120px] animate-pulse" />
                <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-500/10 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
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
                            Fest Central
                        </span>
                    </Link>
                </div>
            </header>

            <main className="container px-4 py-8 md:px-6">
                <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="mb-8"
                >
                    <Button variant="ghost" onClick={() => router.push('/')} className="group hover:bg-primary/10 hover:text-primary">
                        <ArrowLeft className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                        Back to All Results
                    </Button>
                </motion.div>

                {!result ? (
                    <Card className="border-dashed border-2 bg-transparent">
                        <CardContent className="pt-6">
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <div className="p-6 rounded-full bg-muted/50 mb-6">
                                    <Search className="h-10 w-10 text-muted-foreground" />
                                </div>
                                <h3 className="text-xl font-semibold mb-2">Result Not Found</h3>
                                <p className="text-muted-foreground max-w-sm mx-auto">
                                    The result you are looking for could not be found or has been removed.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="max-w-4xl mx-auto space-y-12">
                        {/* Result Header */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-center space-y-4"
                        >
                            <Badge variant="outline" className="px-4 py-1 text-base border-primary/20 bg-primary/5 text-primary mb-2">
                                Result #{result.resultNumber}
                            </Badge>
                            <h1 className="text-3xl md:text-5xl font-bold tracking-tight">{result.programName}</h1>
                            <p className="text-xl text-muted-foreground">{result.categoryName}</p>
                        </motion.div>

                        {/* Podium Section */}
                        <div className="relative py-10 px-4">
                            {/* Confetti/Sparkles Background Effect */}
                            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                                <div className="absolute top-1/4 left-1/4 text-yellow-500/20 animate-bounce delay-700"><Sparkles className="w-8 h-8" /></div>
                                <div className="absolute top-1/3 right-1/4 text-purple-500/20 animate-bounce delay-1000"><Sparkles className="w-6 h-6" /></div>
                            </div>

                            <div className="flex items-end justify-center gap-4 md:gap-8 min-h-[400px]">
                                {result.winners['2'] && result.winners['2'].length > 0 && (
                                    <PodiumStep rank="2" winners={result.winners['2']} delay={0.2} />
                                )}
                                {result.winners['1'] && result.winners['1'].length > 0 && (
                                    <PodiumStep rank="1" winners={result.winners['1']} delay={0.4} />
                                )}
                                {result.winners['3'] && result.winners['3'].length > 0 && (
                                    <PodiumStep rank="3" winners={result.winners['3']} delay={0.6} />
                                )}
                            </div>
                        </div>

                        {/* Other Winners / Details Card */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.8 }}
                        >
                            <Card className="border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
                                <CardHeader className="border-b border-white/5 bg-muted/20">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-lg">Full Result Details</CardTitle>
                                        <Button variant="outline" size="sm" className="gap-2">
                                            <Share2 className="h-4 w-4" />
                                            Share
                                        </Button>
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button variant="default" size="sm" className="gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-0">
                                                    <FileImage className="h-4 w-4" />
                                                    View Poster
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="max-w-3xl bg-background/95 backdrop-blur-xl border-white/10">
                                                <DialogTitle className="sr-only">Result Poster</DialogTitle>
                                                <div className="flex flex-col gap-6">
                                                    <div className="flex items-center justify-between">
                                                        <h2 className="text-xl font-semibold">Result Poster</h2>
                                                        <Button onClick={handleDownloadPoster} className="gap-2">
                                                            <Download className="h-4 w-4" />
                                                            Download PNG
                                                        </Button>
                                                    </div>

                                                    {/* Poster Preview Area */}
                                                    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/50 p-4 flex justify-center">
                                                        <div
                                                            ref={posterRef}
                                                            className="w-[600px] min-h-[800px] bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-8 relative overflow-hidden flex flex-col"
                                                        >
                                                            {/* Background Elements */}
                                                            <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                                                            <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
                                                            <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-20" />

                                                            {/* Header */}
                                                            <div className="relative z-10 text-center space-y-2 mb-12">
                                                                <div className="flex justify-center mb-4">
                                                                    <div className="p-3 rounded-xl bg-white/10 backdrop-blur-md border border-white/20">
                                                                        <Trophy className="w-8 h-8 text-yellow-400" />
                                                                    </div>
                                                                </div>
                                                                <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/80">
                                                                    Fest Central
                                                                </h1>
                                                                <div className="h-1 w-20 bg-gradient-to-r from-transparent via-white/30 to-transparent mx-auto" />
                                                            </div>

                                                            {/* Program Details */}
                                                            <div className="relative z-10 text-center mb-12 space-y-2">
                                                                <Badge variant="outline" className="px-4 py-1 border-white/20 bg-white/5 text-white/90 mb-2">
                                                                    Official Result
                                                                </Badge>
                                                                <h2 className="text-4xl font-black tracking-tight text-white mb-2">
                                                                    {result.programName}
                                                                </h2>
                                                                <p className="text-xl text-white/70 font-light">
                                                                    {result.categoryName}
                                                                </p>
                                                            </div>

                                                            {/* Winners */}
                                                            <div className="relative z-10 flex-1 flex flex-col justify-center gap-6">
                                                                {/* 1st Place */}
                                                                {result.winners['1']?.map((winner, idx) => (
                                                                    <div key={`1-${idx}`} className="bg-gradient-to-r from-yellow-500/20 to-transparent border-l-4 border-yellow-500 p-4 rounded-r-lg backdrop-blur-sm">
                                                                        <div className="flex items-center gap-4">
                                                                            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-yellow-500/20 text-yellow-400 font-bold text-xl border border-yellow-500/50">
                                                                                1
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-2xl font-bold text-white">{winner.name}</p>
                                                                                <p className="text-yellow-200/80">{winner.teamName}</p>
                                                                            </div>
                                                                            <Crown className="w-8 h-8 text-yellow-400 ml-auto opacity-50" />
                                                                        </div>
                                                                    </div>
                                                                ))}

                                                                {/* 2nd Place */}
                                                                {result.winners['2']?.map((winner, idx) => (
                                                                    <div key={`2-${idx}`} className="bg-gradient-to-r from-slate-400/20 to-transparent border-l-4 border-slate-400 p-4 rounded-r-lg backdrop-blur-sm">
                                                                        <div className="flex items-center gap-4">
                                                                            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-400/20 text-slate-300 font-bold text-lg border border-slate-400/50">
                                                                                2
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-xl font-bold text-white/90">{winner.name}</p>
                                                                                <p className="text-slate-300/80">{winner.teamName}</p>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}

                                                                {/* 3rd Place */}
                                                                {result.winners['3']?.map((winner, idx) => (
                                                                    <div key={`3-${idx}`} className="bg-gradient-to-r from-amber-700/20 to-transparent border-l-4 border-amber-700 p-4 rounded-r-lg backdrop-blur-sm">
                                                                        <div className="flex items-center gap-4">
                                                                            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-700/20 text-amber-500 font-bold text-lg border border-amber-700/50">
                                                                                3
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-xl font-bold text-white/90">{winner.name}</p>
                                                                                <p className="text-amber-500/80">{winner.teamName}</p>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>

                                                            {/* Footer */}
                                                            <div className="relative z-10 mt-auto pt-8 text-center">
                                                                <p className="text-white/40 text-sm">Generated by Fest Central</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="divide-y divide-white/5">
                                        {['1', '2', '3'].map((rank) => {
                                            const winners = result.winners[rank];
                                            if (!winners || winners.length === 0) return null;

                                            return (
                                                <div key={rank} className="p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors">
                                                    <div className={`
                                                        flex items-center justify-center w-10 h-10 rounded-full font-bold text-lg shrink-0
                                                        ${rank === '1' ? 'bg-yellow-500/10 text-yellow-500' :
                                                            rank === '2' ? 'bg-slate-400/10 text-slate-400' :
                                                                'bg-amber-700/10 text-amber-700'}
                                                    `}>
                                                        {rank}
                                                    </div>
                                                    <div className="flex-1 space-y-2">
                                                        {winners.map((winner, idx) => (
                                                            <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4">
                                                                <span className="font-medium">{winner.name}</span>
                                                                <span className="text-sm text-muted-foreground">{winner.teamName}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    </div>
                )}
            </main>
        </div>
    );
}
