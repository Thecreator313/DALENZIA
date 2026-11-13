'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, User as UserIcon, Trophy, ShieldCheck, LogOut, ArrowRight, Sparkles } from 'lucide-react';
import type { User } from '@/app/admin/access-central/page';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAppSettings } from '@/context/firestore-cache';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { settings } = useAppSettings();

  useEffect(() => {
    const storedUser = localStorage.getItem('fest-central-user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('fest-central-user');
    }
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-5rem)] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <span className="text-sm text-muted-foreground animate-pulse">Loading Profile...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-[calc(100vh-6rem)] items-center justify-center">
        <Card className="max-w-md w-full border-border/60 bg-card/80 p-6 text-center">
          <p className="text-sm text-muted-foreground">Could not load user profile. Please log in again.</p>
          <Button asChild className="mt-4" size="sm">
            <Link href="/login">Go to Login</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen space-y-5 sm:space-y-6 max-w-2xl mx-auto pb-10">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 -z-10 h-full w-full overflow-hidden">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-indigo-500/10 blur-[130px]" />
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-amber-500/10 blur-[130px]" />
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold font-headline">Judge Profile</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Official credentials and access privileges for {settings.festName || 'Fest Central'}.
        </p>
      </div>

      <Card className="overflow-hidden rounded-2xl border-border/60 bg-card/75 shadow-lg backdrop-blur-xl">
        <CardHeader className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white p-5 sm:p-7">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.25),transparent_50%)]" />

          <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
            <Avatar className="h-16 w-16 sm:h-20 sm:w-20 border-2 border-white/20 shadow-md">
              <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-2xl font-bold font-headline">
                {user.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <Badge className="bg-indigo-500/25 border-indigo-400/30 text-indigo-200 text-xs font-semibold px-2.5 py-0.5">
                  <ShieldCheck className="mr-1 h-3.5 w-3.5 text-emerald-400" /> Verified Evaluator
                </Badge>
                <Badge className="bg-white/10 border-white/15 text-slate-200 text-xs px-2.5 py-0.5">
                  {settings.festName || 'Fest Central'}
                </Badge>
              </div>
              <CardTitle className="text-xl sm:text-2xl font-extrabold text-white mt-1">
                {user.name}
              </CardTitle>
              <CardDescription className="text-slate-300 text-xs sm:text-sm">
                Authorized festival adjudicator
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="flex justify-between items-center text-xs sm:text-sm">
            <span className="text-muted-foreground font-medium">User ID</span>
            <span className="font-mono text-xs sm:text-sm bg-muted/80 px-2.5 py-1 rounded-lg border border-border/50">
              {user.userId}
            </span>
          </div>

          <Separator className="border-border/50" />

          <div className="flex justify-between items-center text-xs sm:text-sm">
            <span className="text-muted-foreground font-medium">Role Access</span>
            <Badge variant="outline" className="capitalize text-xs font-semibold px-2.5 py-0.5 rounded-md border-indigo-500/30 bg-indigo-500/10 text-indigo-500">
              {user.role}
            </Badge>
          </div>

          <Separator className="border-border/50" />

          <div className="flex justify-between items-center text-xs sm:text-sm">
            <span className="text-muted-foreground font-medium">Scoring Privacy</span>
            <span className="text-xs text-muted-foreground font-mono">
              Anonymous Code Letters
            </span>
          </div>

          <div className="pt-3 space-y-2.5">
            <Button asChild className="w-full rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 text-white shadow-md shadow-indigo-500/20 h-11 text-xs sm:text-sm font-semibold">
              <Link href="/judges/judging-point">
                <Trophy className="mr-2 h-4 w-4" /> Go to Judging Point <ArrowRight className="ml-auto h-4 w-4" />
              </Link>
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="w-full rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20 h-10 text-xs sm:text-sm">
                  <LogOut className="mr-2 h-4 w-4" /> Sign Out
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure you want to sign out?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You will be redirected back to the festival login page.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleLogout} className="rounded-xl bg-destructive hover:bg-destructive/90">
                    Sign Out
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
