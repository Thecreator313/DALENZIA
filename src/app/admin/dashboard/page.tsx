
'use client';

import { useState, useEffect } from 'react';
import { collection, getFirestore, onSnapshot, query, orderBy, limit, where } from 'firebase/firestore';
import { app } from '@/lib/firebase';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, Users, List, UserCheck, Trophy, BarChart, PlusCircle, Activity, Sparkles } from 'lucide-react';
import type { Program } from '@/app/admin/programs/page';
import { motion } from 'framer-motion';

const db = getFirestore(app);

type StatCardProps = {
  title: string;
  value: number;
  icon: React.ElementType;
  color: string;
  delay: number;
};

const StatCard = ({ title, value, icon: Icon, color, delay }: StatCardProps) => (
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
        <p className="text-xs text-muted-foreground mt-1">
          +0% from last month
        </p>
      </CardContent>
    </Card>
  </motion.div>
);

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    teams: 0,
    programs: 0,
    judges: 0,
    participants: 0,
  });
  const [recentPrograms, setRecentPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let loadedCount = 0;
    const totalQueries = 5;

    const checkLoading = () => {
      loadedCount++;
      if (loadedCount === totalQueries) {
        setLoading(false);
      }
    };

    const unsubscribes = [
      onSnapshot(collection(db, 'teams'), snapshot => {
        setStats(prev => ({ ...prev, teams: snapshot.size }));
        checkLoading();
      }),
      onSnapshot(collection(db, 'programs'), snapshot => {
        setStats(prev => ({ ...prev, programs: snapshot.size }));
        checkLoading();
      }),
      onSnapshot(query(collection(db, 'users'), where('role', '==', 'judges')), snapshot => {
        setStats(prev => ({ ...prev, judges: snapshot.size }));
        checkLoading();
      }),
      onSnapshot(collection(db, 'students'), snapshot => {
        setStats(prev => ({ ...prev, participants: snapshot.size }));
        checkLoading();
      }),
      onSnapshot(query(collection(db, 'programs'), orderBy('name', 'desc'), limit(5)), (snapshot) => {
        setRecentPrograms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Program)));
        checkLoading();
      }),
    ];

    return () => unsubscribes.forEach(unsub => unsub());
  }, []);

  return (
    <div className="space-y-8 relative min-h-screen p-1">
      {/* Dynamic Background */}
      <div className="fixed inset-0 -z-10 h-full w-full bg-background overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-[120px]" />
      </div>

      <div className="flex items-center justify-between">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-1"
        >
          <h1 className="text-3xl font-bold font-headline tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your fest management system.</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <Button className="shadow-lg shadow-primary/20">
            <PlusCircle className="mr-2 h-4 w-4" />
            New Program
          </Button>
        </motion.div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Teams"
          value={stats.teams}
          icon={Users}
          color="bg-blue-500 text-blue-500"
          delay={0.1}
        />
        <StatCard
          title="Total Programs"
          value={stats.programs}
          icon={List}
          color="bg-purple-500 text-purple-500"
          delay={0.2}
        />
        <StatCard
          title="Participants"
          value={stats.participants}
          icon={UserCheck}
          color="bg-pink-500 text-pink-500"
          delay={0.3}
        />
        <StatCard
          title="Judges"
          value={stats.judges}
          icon={Trophy}
          color="bg-yellow-500 text-yellow-500"
          delay={0.4}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-2"
        >
          <Card className="border-white/10 bg-card/40 backdrop-blur-sm h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recently Added Programs</CardTitle>
                  <CardDescription>Latest additions to the event schedule.</CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/admin/programs">View All</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentPrograms.length > 0 ? recentPrograms.map((program, i) => (
                  <motion.div
                    key={program.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + (i * 0.1) }}
                    className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors border border-transparent hover:border-white/5 group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                        <Activity className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium">{program.name}</p>
                        <p className="text-xs text-muted-foreground">{program.categoryName || 'Uncategorized'}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" asChild>
                      <Link href={`/admin/programs/${program.id}`}>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </motion.div>
                )) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                    <Sparkles className="h-8 w-8 mb-2 opacity-20" />
                    <p>No programs added yet.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card className="border-white/10 bg-card/40 backdrop-blur-sm h-full">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Manage your fest efficiently.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: 'Manage Teams', icon: Users, href: '/admin/teams', color: 'text-blue-500' },
                { label: 'Manage Programs', icon: List, href: '/admin/programs', color: 'text-purple-500' },
                { label: 'View Results', icon: Trophy, href: '/admin/results', color: 'text-yellow-500' },
                { label: 'Reporting', icon: BarChart, href: '/admin/reporting', color: 'text-green-500' },
              ].map((action, i) => (
                <Button
                  key={action.label}
                  variant="outline"
                  className="w-full justify-start h-12 hover:bg-muted/50 border-white/5 hover:border-primary/20 group relative overflow-hidden"
                  asChild
                >
                  <Link href={action.href}>
                    <div className={`p-1.5 rounded-md bg-muted mr-3 group-hover:scale-110 transition-transform ${action.color}`}>
                      <action.icon className="h-4 w-4" />
                    </div>
                    <span className="font-medium">{action.label}</span>
                    <ArrowRight className="ml-auto h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0" />
                  </Link>
                </Button>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
