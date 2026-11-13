'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, addDoc, getDocs, orderBy, serverTimestamp, deleteDoc, doc, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCachedCollection, useAppSettings } from '@/context/firestore-cache';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  Megaphone,
  Radio,
  Send,
  Sparkles,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Volume2,
  Tv,
  RotateCcw,
  Trash2,
  Copy,
  Loader2,
  Check,
  BellRing,
} from 'lucide-react';
import type { User } from '@/app/admin/access-central/page';
import type { Stage } from '@/app/admin/stage-central/page';
import { cn } from '@/lib/utils';

type Priority = 'normal' | 'high' | 'urgent';

interface StageAnnouncement {
  id: string;
  stageId: string;
  stageName: string;
  message: string;
  priority: Priority;
  authorName: string;
  authorId: string;
  createdAt?: any;
}

const PRESET_TEMPLATES = [
  {
    title: '5 Min Call',
    icon: Clock,
    priority: 'high' as Priority,
    text: 'Next program starts in 5 minutes. All contestants please be in position backstage.',
  },
  {
    title: 'Report Backstage',
    icon: BellRing,
    priority: 'urgent' as Priority,
    text: 'Urgent: Remaining contestants for the ongoing program must report backstage immediately.',
  },
  {
    title: 'Judges Scoring',
    icon: Sparkles,
    priority: 'normal' as Priority,
    text: 'Judges are evaluating performances. Please maintain silence around the stage area.',
  },
  {
    title: 'Stage Ready',
    icon: CheckCircle2,
    priority: 'normal' as Priority,
    text: 'Stage is clear and ready for the next scheduled item. Sound check completed.',
  },
];

export default function InformPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userChecked, setUserChecked] = useState(false);
  const { settings } = useAppSettings();

  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [broadcasting, setBroadcasting] = useState(false);
  const [announcements, setAnnouncements] = useState<StageAnnouncement[]>([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('fest-central-user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
    setUserChecked(true);
  }, []);

  const { data: stages, loading: stageLoading } = useCachedCollection<Stage>(
    currentUser ? `query:stage:${currentUser.id}` : 'query:stage:none',
    () => query(collection(db, 'stages'), where('controllerId', '==', currentUser!.id)),
    { enabled: !!currentUser, keepAlive: true }
  );

  const stage = stages[0] ?? null;

  const loadAnnouncements = async () => {
    if (!stage) return;
    try {
      setLoadingAnnouncements(true);
      const q = query(
        collection(db, 'stage_announcements'),
        where('stageId', '==', stage.id),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
      const snap = await getDocs(q);
      const list: StageAnnouncement[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<StageAnnouncement, 'id'>),
      }));
      setAnnouncements(list);
    } catch {
      // In case index not created yet, fallback without orderBy
      try {
        const fallbackQ = query(
          collection(db, 'stage_announcements'),
          where('stageId', '==', stage.id),
          limit(20)
        );
        const snap = await getDocs(fallbackQ);
        const list: StageAnnouncement[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<StageAnnouncement, 'id'>),
        }));
        setAnnouncements(list);
      } catch (err) {
        console.error('Failed to load stage announcements', err);
      }
    } finally {
      setLoadingAnnouncements(false);
    }
  };

  useEffect(() => {
    if (stage) {
      loadAnnouncements();
    }
  }, [stage]);

  const handleBroadcast = async (customText?: string, customPriority?: Priority) => {
    const textToSend = (customText ?? message).trim();
    const prioToSend = customPriority ?? priority;

    if (!textToSend) {
      toast({
        title: 'Empty Announcement',
        description: 'Please write a message before broadcasting.',
        variant: 'destructive',
      });
      return;
    }

    if (!stage || !currentUser) return;

    setBroadcasting(true);
    try {
      const docRef = await addDoc(collection(db, 'stage_announcements'), {
        stageId: stage.id,
        stageName: stage.name,
        message: textToSend,
        priority: prioToSend,
        authorName: currentUser.name || 'Stage Controller',
        authorId: currentUser.id,
        createdAt: serverTimestamp(),
      });

      const newEntry: StageAnnouncement = {
        id: docRef.id,
        stageId: stage.id,
        stageName: stage.name,
        message: textToSend,
        priority: prioToSend,
        authorName: currentUser.name || 'Stage Controller',
        authorId: currentUser.id,
        createdAt: new Date(),
      };

      setAnnouncements((prev) => [newEntry, ...prev]);
      if (!customText) setMessage('');

      toast({
        title: 'Announcement Broadcasted',
        description: `Stage alert sent live for ${stage.name}.`,
      });
    } catch (error) {
      console.error('Error broadcasting announcement:', error);
      toast({
        title: 'Broadcast Failed',
        description: 'Could not send stage alert. Please check connection.',
        variant: 'destructive',
      });
    } finally {
      setBroadcasting(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'stage_announcements', id));
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
      toast({
        title: 'Broadcast Dismissed',
        description: 'The announcement was removed.',
      });
    } catch (err) {
      console.error('Error removing announcement:', err);
    }
  };

  const handleCopy = (item: StageAnnouncement) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(item.message);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
      toast({
        title: 'Copied to Clipboard',
        description: 'Announcement message copied.',
      });
    }
  };

  if (!userChecked || stageLoading) {
    return (
      <div className="flex h-[calc(100vh-5rem)] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-cyan-500" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading Stage Inform...</p>
      </div>
    );
  }

  if (!stage) {
    return (
      <div className="flex h-[calc(100vh-6rem)] items-center justify-center">
        <Card className="w-full max-w-md border-border/60 bg-card/75 shadow-lg backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-center font-headline text-xl">No Stage Assigned</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-sm text-muted-foreground">
              You have not been assigned to control any stage. Please contact the administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen space-y-5 sm:space-y-6 pb-10">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 -z-10 h-full w-full overflow-hidden">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-amber-500/10 blur-[130px]" />
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-cyan-500/10 blur-[130px]" />
      </div>

      {/* Header Banner */}
      <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white shadow-xl p-4 sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.18),transparent_50%)]" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-amber-400/30 bg-amber-500/15 px-3 py-1 text-[11px] sm:text-xs font-semibold text-amber-200">
                <Radio className="mr-1.5 h-3.5 w-3.5 animate-pulse text-amber-400" />
                Live Broadcast Studio
              </Badge>
              <Badge className="border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                <Tv className="mr-1.5 h-3 w-3 text-cyan-300" />
                {stage.name}
              </Badge>
            </div>
            <h1 className="font-headline text-2xl sm:text-3xl font-extrabold tracking-tight">
              Stage Announcements &amp; Inform
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
              Broadcast direct reminders, timing alerts, and backstage calls for {stage.name}.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={loadAnnouncements}
              disabled={loadingAnnouncements}
              className="rounded-xl border-white/20 bg-white/10 text-white backdrop-blur-md hover:bg-white/20 hover:text-white h-9 text-xs"
            >
              <RotateCcw className={cn('mr-1.5 h-3.5 w-3.5', loadingAnnouncements && 'animate-spin')} />
              Refresh Feed
            </Button>
          </div>
        </div>
      </section>

      {/* 1-Tap Quick Presets */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-amber-500" /> Quick Broadcast Presets
          </h2>
          <span className="text-[11px] text-muted-foreground">Tap to send immediately</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {PRESET_TEMPLATES.map((tmpl) => {
            const Icon = tmpl.icon;
            return (
              <button
                key={tmpl.title}
                type="button"
                onClick={() => handleBroadcast(tmpl.text, tmpl.priority)}
                disabled={broadcasting}
                className="group relative flex flex-col justify-between rounded-xl sm:rounded-2xl border border-border/60 bg-card/75 p-3 sm:p-4 text-left backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-500/40 hover:bg-muted/30 hover:shadow-md active:scale-95"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="rounded-lg sm:rounded-xl border border-amber-500/25 bg-amber-500/10 p-2 text-amber-500">
                    <Icon className="h-4 w-4" />
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-md',
                      tmpl.priority === 'urgent'
                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-500'
                        : tmpl.priority === 'high'
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                        : 'border-border text-muted-foreground'
                    )}
                  >
                    {tmpl.priority}
                  </Badge>
                </div>
                <div>
                  <p className="font-semibold text-xs sm:text-sm text-foreground group-hover:text-amber-500 transition-colors">
                    {tmpl.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1">
                    {tmpl.text}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Custom Broadcast Composer & Recent Broadcasts */}
      <section className="grid gap-5 sm:gap-6 lg:grid-cols-12">
        {/* Custom Broadcast Box */}
        <Card className="rounded-xl sm:rounded-2xl border-border/60 bg-card/75 shadow-lg backdrop-blur-xl lg:col-span-5">
          <CardHeader className="border-b border-border/50 bg-muted/20 p-4 sm:p-5">
            <CardTitle className="font-headline text-lg sm:text-xl flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-amber-500" />
              Compose Broadcast
            </CardTitle>
            <CardDescription className="text-xs">
              Transmit custom alerts to stage display and backstage coordinators.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Urgency Level</label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'normal', label: 'Normal', color: 'border-border hover:bg-muted' },
                    { id: 'high', label: 'High', color: 'border-amber-500/40 text-amber-500 hover:bg-amber-500/10' },
                    { id: 'urgent', label: 'Urgent', color: 'border-rose-500/40 text-rose-500 hover:bg-rose-500/10' },
                  ] as const
                ).map((lvl) => (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => setPriority(lvl.id)}
                    className={cn(
                      'rounded-xl border py-2 text-xs font-semibold transition-all active:scale-95',
                      priority === lvl.id
                        ? lvl.id === 'urgent'
                          ? 'border-rose-500 bg-rose-500 text-white shadow-sm'
                          : lvl.id === 'high'
                          ? 'border-amber-500 bg-amber-500 text-white shadow-sm'
                          : 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : lvl.color
                    )}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-medium text-foreground">Announcement Message</label>
                <span className="text-muted-foreground font-mono">{message.length}/280</span>
              </div>
              <Textarea
                rows={4}
                maxLength={280}
                placeholder="Type your stage announcement here..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="resize-none rounded-xl border-border/60 bg-background/60 text-sm focus:border-amber-500 focus:ring-amber-500/20"
              />
            </div>

            <Button
              type="button"
              onClick={() => handleBroadcast()}
              disabled={broadcasting || !message.trim()}
              className="w-full rounded-xl border-0 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white shadow-md shadow-amber-500/20 transition-all hover:opacity-95 h-11 text-xs sm:text-sm font-semibold"
            >
              {broadcasting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Broadcasting...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" /> Transmit Announcement
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Recent Announcements Feed */}
        <Card className="rounded-xl sm:rounded-2xl border-border/60 bg-card/75 shadow-lg backdrop-blur-xl lg:col-span-7">
          <CardHeader className="border-b border-border/50 bg-muted/20 p-4 sm:p-5 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="font-headline text-lg sm:text-xl flex items-center gap-2">
                <Volume2 className="h-5 w-5 text-cyan-500" />
                Live Broadcast History
              </CardTitle>
              <CardDescription className="text-xs">
                Announcements published for {stage.name}.
              </CardDescription>
            </div>
            <Badge variant="outline" className="rounded-md font-mono text-[11px]">
              {announcements.length} Sent
            </Badge>
          </CardHeader>

          <CardContent className="p-4 sm:p-5">
            {loadingAnnouncements ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                <p className="text-xs">Loading feed...</p>
              </div>
            ) : announcements.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/15 py-12 text-center">
                <Megaphone className="h-8 w-8 text-muted-foreground/35 mb-2" />
                <p className="text-sm font-medium">No Announcements Sent Yet</p>
                <p className="text-xs text-muted-foreground max-w-xs mt-1">
                  Use the composer or 1-tap presets above to broadcast your first stage alert.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {announcements.map((item) => (
                  <div
                    key={item.id}
                    className="group relative rounded-xl sm:rounded-2xl border border-border/50 bg-background/60 p-3.5 sm:p-4 transition-all duration-200 hover:border-border hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md',
                            item.priority === 'urgent'
                              ? 'border-rose-500/30 bg-rose-500/10 text-rose-500'
                              : item.priority === 'high'
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                              : 'border-border text-muted-foreground'
                          )}
                        >
                          {item.priority}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {item.authorName}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleCopy(item)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          title="Copy text"
                        >
                          {copiedId === item.id ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAnnouncement(item.id)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Dismiss"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="mt-2 text-xs sm:text-sm text-foreground font-medium leading-relaxed">
                      {item.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
