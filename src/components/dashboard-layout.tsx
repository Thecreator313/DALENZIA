
'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Trophy, LogOut, Loader2 } from 'lucide-react';
import { FirestoreCacheProvider, useAppSettings } from '@/context/firestore-cache';

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
import {
  adminNavItems,
  judgeNavItems,
  stageControlNavItems,
  teamNavItems,
} from '@/lib/nav-links';
import {
  LayoutDashboard,
  List,
  Megaphone,
  Users,
  UserCheck,
  UserPlus,
  BarChart,
  Medal,
  UserCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from './theme-toggle';
import { cn } from '@/lib/utils';
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

interface DashboardLayoutProps {
  children: React.ReactNode;
  panel: 'admin' | 'teams' | 'judges' | 'stage-control';
}

const navItemsMap = {
  admin: adminNavItems,
  teams: teamNavItems,
  judges: judgeNavItems,
  'stage-control': stageControlNavItems,
};

type BottomNavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

const bottomNavMap: Record<string, BottomNavItem[]> = {
  'stage-control': [
    { label: 'Dashboard', href: '/stage-control/dashboard', icon: LayoutDashboard },
    { label: 'Programs', href: '/stage-control/programs', icon: List },
    { label: 'Inform', href: '/stage-control/inform', icon: Megaphone },
    { label: 'Results', href: '/', icon: Trophy },
  ],
  judges: [
    { label: 'Dashboard', href: '/judges/dashboard', icon: LayoutDashboard },
    { label: 'Judging Point', href: '/judges/judging-point', icon: Trophy },
    { label: 'Profile', href: '/judges/profile', icon: UserCircle },
    { label: 'Results', href: '/', icon: Medal },
  ],
  teams: [
    { label: 'Dashboard', href: '/teams/dashboard', icon: LayoutDashboard },
    { label: 'Add', href: '/teams/add-participants', icon: UserPlus },
    { label: 'Assign', href: '/teams/assign-students', icon: UserCheck },
    { label: 'Reports', href: '/teams/reports', icon: BarChart },
  ],
};

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
  const pathname = usePathname();
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);
  const { settings } = useAppSettings();
  const festName = settings.festName || 'Fest Central';
  
  const currentSection = panel === 'stage-control' ? 'Stage Control' : panel;
  const navItems = navItemsMap[panel];
  const bottomNavItems = bottomNavMap[panel];
  const [isLogoutAlertOpen, setIsLogoutAlertOpen] = React.useState(false);

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
        <header className="flex h-14 items-center gap-2.5 sm:gap-4 border-b bg-card/90 px-3 sm:px-6 sticky top-0 backdrop-blur-md z-30">
          <SidebarTrigger className="md:hidden shrink-0" />
          <h1 className="text-base sm:text-xl font-semibold capitalize font-headline truncate">
            {currentSection}
          </h1>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            <Button variant="outline" size="sm" asChild className="h-8 px-2 sm:px-3 text-xs sm:text-sm">
              <Link href="/">
                <Trophy className="h-3.5 w-3.5 sm:mr-1.5 shrink-0 text-amber-500" />
                <span className="hidden sm:inline">Results</span>
              </Link>
            </Button>
          </div>
        </header>
        <main
          className={cn(
            'flex-1 p-3 sm:p-6',
            bottomNavItems ? 'pb-24 md:pb-6' : 'pb-6'
          )}
        >
          <FirestoreCacheProvider key={`${panel}:${user.id}`}>
            {children}
          </FirestoreCacheProvider>
        </main>

        {/* Mobile Bottom Navigation Bar */}
        {bottomNavItems && (
          <nav
            aria-label="Mobile Bottom Navigation"
            className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/70 bg-card/90 backdrop-blur-xl shadow-[0_-8px_25px_rgba(0,0,0,0.12)] pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-1.5 px-2"
          >
            <div className="grid grid-flow-col auto-cols-fr items-center justify-around gap-1">
              {bottomNavItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === '/'
                    ? pathname === '/'
                    : item.href.endsWith('/dashboard')
                    ? pathname === item.href
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all select-none active:scale-95 text-center',
                      isActive
                        ? 'bg-primary/15 text-primary font-semibold shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    )}
                  >
                    <div className="relative flex items-center justify-center">
                      <Icon
                        className={cn(
                          'h-5 w-5 transition-transform duration-200',
                          isActive ? 'scale-110 text-primary' : 'group-hover:scale-105'
                        )}
                      />
                      {isActive && (
                        <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                      )}
                    </div>
                    <span
                      className={cn(
                        'mt-1 text-[11px] leading-tight truncate max-w-[72px]',
                        isActive ? 'text-primary font-semibold' : 'text-muted-foreground font-medium'
                      )}
                    >
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
