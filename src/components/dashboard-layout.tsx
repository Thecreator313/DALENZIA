
'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Trophy, LogOut, Loader2 } from 'lucide-react';
import { doc, getFirestore, onSnapshot } from 'firebase/firestore';
import { app } from '@/lib/firebase';

import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import type { NavItem } from '@/lib/nav-links';
import { adminNavItems, judgeNavItems, stageControlNavItems, teamNavItems } from '@/lib/nav-links';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from './theme-toggle';
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
import type { User } from '@/app/admin/access-central/page';
import type { AppSettings } from '@/app/admin/settings/page';


const db = getFirestore(app);

interface DashboardLayoutProps {
  children: React.ReactNode;
  panel: 'admin' | 'teams' | 'judges' | 'stage-control';
}

const navItemsMap = {
  admin: adminNavItems,
  teams: teamNavItems,
  judges: judgeNavItems,
  'stage-control': stageControlNavItems,
}

function SidebarNav({ navItems }: { navItems: NavItem[] }) {
  const pathname = usePathname();

  return (
    <SidebarMenu>
      {navItems.map((item) => (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton
            asChild
            isActive={pathname.startsWith(item.href)}
            className="justify-start"
            tooltip={item.label}
          >
            <Link href={item.href}>
              <item.icon />
              <span>{item.label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

export function DashboardLayout({ children, panel }: DashboardLayoutProps) {
  const router = useRouter();
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [festName, setFestName] = React.useState('Fest Central');
  
  const currentSection = panel === 'stage-control' ? 'Stage Control' : panel;
  const navItems = navItemsMap[panel];
  const [isLogoutAlertOpen, setIsLogoutAlertOpen] = React.useState(false);

  React.useEffect(() => {
    const settingsDocRef = doc(db, 'settings', 'global');
    const unsubscribe = onSnapshot(settingsDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const settings = docSnap.data() as AppSettings;
        if (settings.festName) {
          setFestName(settings.festName);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  React.useEffect(() => {
    const storedUser = localStorage.getItem('fest-central-user');
    if (storedUser) {
        try {
            const userData: User = JSON.parse(storedUser);
            // Map 'team' role to 'teams' panel for comparison
            const userPanel = userData.role === 'team' ? 'teams' : (userData.role === 'stagecontroller' ? 'stage-control' : userData.role);
            if (userPanel === panel) {
                setUser(userData);
            } else {
                router.push('/login');
            }
        } catch (error) {
            console.error("Failed to parse user data:", error);
            router.push('/login');
        }
    } else {
      router.push('/login');
    }
    setLoading(false);
  }, [panel, router]);


  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('fest-central-user');
    }
    router.push('/login');
  };

  if (loading || !user) {
    return (
        <div className="flex h-screen items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="ml-2">Verifying access...</p>
        </div>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 cursor-default">
            <Trophy className="w-6 h-6 text-primary" />
            <span className="font-semibold text-lg font-headline group-data-[collapsible=icon]:hidden">
              {festName}
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarNav navItems={navItems} />
        </SidebarContent>
        <SidebarFooter>
           <SidebarMenu>
             <SidebarMenuItem>
                <AlertDialog open={isLogoutAlertOpen} onOpenChange={setIsLogoutAlertOpen}>
                  <AlertDialogTrigger asChild>
                     <SidebarMenuButton className="justify-start text-destructive hover:text-destructive hover:bg-destructive/10">
                        <LogOut />
                        <span>Logout</span>
                     </SidebarMenuButton>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure you want to logout?</AlertDialogTitle>
                      <AlertDialogDescription>
                        You will be returned to the login page.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleLogout}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        Logout
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
             </SidebarMenuItem>
           </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-4 border-b bg-card px-4 sm:px-6 sticky top-0 bg-opacity-80 backdrop-blur-sm z-10">
          <SidebarTrigger className="md:hidden" />
          <h1 className="text-xl font-semibold capitalize font-headline">
            {currentSection}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
             <Button variant="outline" asChild>
                <Link href="/"><Trophy className="mr-2 h-4 w-4"/> Results</Link>
            </Button>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
