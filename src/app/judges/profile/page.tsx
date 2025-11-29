
'use client';

import { useState, useEffect } from 'react';
import { getFirestore } from 'firebase/firestore';
import { app } from '@/lib/firebase';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Loader2, User as UserIcon } from 'lucide-react';
import type { User } from '@/app/admin/access-central/page';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

const db = getFirestore(app);

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('fest-central-user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="mr-2 h-8 w-8 animate-spin" /><span>Loading Profile...</span></div>;
  }
  
  if (!user) {
    return <div>Could not load user profile. Please try logging in again.</div>;
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold font-headline">My Profile</h1>
      
      <Card className="overflow-hidden">
        <CardHeader className="bg-muted/30 p-6">
            <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                    <AvatarFallback className="text-2xl">{user.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                    <CardTitle className="text-2xl">{user.name}</CardTitle>
                    <CardDescription>Your personal information for the event.</CardDescription>
                </div>
            </div>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground font-medium">User ID</span>
            <span className="font-mono text-sm bg-muted px-2 py-1 rounded">{user.userId}</span>
          </div>
          <Separator />
           <div className="flex justify-between items-center">
            <span className="text-muted-foreground font-medium">Role</span>
            <Badge variant="outline" className="capitalize">{user.role}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
