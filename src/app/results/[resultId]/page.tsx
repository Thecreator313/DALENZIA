
'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { collection, onSnapshot, query, where, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAppSettings } from '@/context/firestore-cache';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Trophy, ArrowLeft, Crown, Medal, Share2, Sparkles, Search, Loader2, Maximize2, FileImage } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { ThemeToggle } from '@/components/theme-toggle';
import { toast } from '@/hooks/use-toast';
import {
    normalizePosterCatalog,
    type PosterTemplateCatalog,
} from '@/lib/poster-template';
import {
    ResultPosterCanvas,
    type ResultPosterCanvasHandle,
} from '@/components/result-poster-canvas';
import { PosterShareActions } from '@/components/poster-share-actions';
import { PosterTemplateSelector } from '@/components/poster-template-selector';

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
    const posterRef = useRef<ResultPosterCanvasHandle | null>(null);
    const { settings: appSettings } = useAppSettings();
    const festName = appSettings.festName || 'Fest Central';
    const [posterCatalog, setPosterCatalog] = useState<PosterTemplateCatalog>(() =>
        normalizePosterCatalog(null)
    );
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('tpl-default');

    useEffect(() => {
        const docRef = doc(db, 'settings', 'posterTemplate');
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            const normalized = normalizePosterCatalog(docSnap.exists() ? docSnap.data() : null);
            const visible = normalized.templates.filter((t) => t.isActive);
            const pool = visible.length > 0 ? visible : normalized.templates;
            setPosterCatalog(normalized);
            setSelectedTemplateId((prev) => {
                if (pool.some((t) => t.id === prev)) return prev;
                const defaultVisible = pool.find((t) => t.id === normalized.defaultTemplateId);
                return defaultVisible ? defaultVisible.id : pool[0].id;
            });
        }, (error) => {
            console.error("Error listening to poster settings:", error);
        });
        return () => unsubscribe();
    }, []);

    const publicTemplates = useMemo(() => {
        const visible = posterCatalog.templates.filter((t) => t.isActive);
        return visible.length > 0 ? visible : posterCatalog.templates;
    }, [posterCatalog.templates]);

    const activeTemplate = useMemo(
        () =>
            publicTemplates.find((t) => t.id === selectedTemplateId) ||
            publicTemplates.find((t) => t.id === posterCatalog.defaultTemplateId) ||
            publicTemplates[0],
        [posterCatalog.defaultTemplateId, publicTemplates, selectedTemplateId]
    );
    const posterSettings = activeTemplate.settings;

    const handleShareLink = async () => {
        const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
        const title = result ? `Result #${result.resultNumber} - ${result.programName}` : festName;

        try {
            if (typeof navigator !== 'undefined' && navigator.share) {
                await navigator.share({
                    title,
                    text: result ? `${festName}: ${result.programName} (${result.categoryName}) official result` : title,
                    url: shareUrl,
                });
                return;
            }
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && shareUrl) {
                await navigator.clipboard.writeText(shareUrl);
                toast({
                    title: 'Result Link Copied',
                    description: 'Result page link copied to clipboard.',
                });
            }
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') return;
            console.error('Failed to share link:', err);
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
                <div className="absolute inset-0 bg-[radial-gradient(#ffffff16_1px,transparent_1px)] [background-size:24px_24px] [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />
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
                    <ThemeToggle />
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

                        {/* Official Auto-Generated Result Poster Showcase */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.7 }}
                        >
                            <Card className="border-white/10 bg-card/50 backdrop-blur-sm overflow-hidden shadow-xl">
                                <CardHeader className="border-b border-white/5 bg-muted/20">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div>
                                            <CardTitle className="text-lg flex items-center gap-2">
                                                <FileImage className="h-5 w-5 text-primary" />
                                                Official Result Poster
                                                <Badge variant="secondary" className="font-mono text-xs font-normal">
                                                    {posterSettings.canvasWidth}×{posterSettings.canvasHeight}
                                                </Badge>
                                            </CardTitle>
                                            <CardDescription>
                                                Download high-resolution poster PNG or share directly to WhatsApp.
                                            </CardDescription>
                                        </div>
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button variant="outline" size="sm" className="gap-2 self-start sm:self-auto">
                                                    <Maximize2 className="h-4 w-4" />
                                                    Full Preview
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto bg-background/95 backdrop-blur-xl border-white/10">
                                                <DialogHeader>
                                                    <DialogTitle>
                                                        {result.programName} — Official Result Poster
                                                    </DialogTitle>
                                                    <DialogDescription>
                                                        {result.categoryName} • Result #{result.resultNumber} ({posterSettings.canvasWidth}×{posterSettings.canvasHeight}px)
                                                    </DialogDescription>
                                                </DialogHeader>
                                                <div className="space-y-4">
                                                    <PosterTemplateSelector
                                                        templates={publicTemplates}
                                                        selectedId={activeTemplate.id}
                                                        onSelect={setSelectedTemplateId}
                                                    />
                                                    <div className="rounded-xl border border-white/10 bg-black/50 p-3 flex justify-center overflow-hidden">
                                                        <ResultPosterCanvas
                                                            settings={posterSettings}
                                                            result={result}
                                                            festName={festName}
                                                            className={
                                                                posterSettings.canvasHeight > posterSettings.canvasWidth
                                                                    ? "w-full max-w-[440px]"
                                                                    : "w-full max-w-[700px]"
                                                            }
                                                        />
                                                    </div>
                                                    <PosterShareActions
                                                        posterRef={posterRef}
                                                        result={result}
                                                        festName={festName}
                                                        templateName={activeTemplate.name}
                                                        compact
                                                    />
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 sm:p-6 space-y-5">
                                    <PosterTemplateSelector
                                        templates={publicTemplates}
                                        selectedId={activeTemplate.id}
                                        onSelect={setSelectedTemplateId}
                                    />
                                    <div className="rounded-xl border border-white/10 bg-black/30 p-3 sm:p-5 flex justify-center">
                                        <ResultPosterCanvas
                                            ref={posterRef}
                                            settings={posterSettings}
                                            result={result}
                                            festName={festName}
                                            className={
                                                posterSettings.canvasHeight > posterSettings.canvasWidth
                                                    ? "w-full max-w-[520px]"
                                                    : "w-full max-w-[760px]"
                                            }
                                        />
                                    </div>
                                    <PosterShareActions
                                        posterRef={posterRef}
                                        result={result}
                                        festName={festName}
                                        templateName={activeTemplate.name}
                                    />
                                </CardContent>
                            </Card>
                        </motion.div>

                        {/* Other Winners / Details Card */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.85 }}
                        >
                            <Card className="border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
                                <CardHeader className="border-b border-white/5 bg-muted/20">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <CardTitle className="text-lg">Full Result Details</CardTitle>
                                        <div className="flex items-center gap-2">
                                            <Button variant="outline" size="sm" className="gap-2" onClick={handleShareLink}>
                                                <Share2 className="h-4 w-4" />
                                                Share Link
                                            </Button>
                                        </div>
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
