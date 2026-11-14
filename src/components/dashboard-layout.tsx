'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Trophy,
  LogOut,
  Loader2,
  Search,
  X,
  ExternalLink,
  Shield,
  Users,
  Presentation,
  Award,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { FirestoreCacheProvider, useAppSettings } from '@/context/firestore-cache';

import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  SidebarRail,
} from '@/components/ui/sidebar';
import type { NavItem, NavGroup } from '@/lib/nav-links';
import {
  adminNavGroups,
  teamNavGroups,
  judgeNavGroups,
  stageControlNavGroups,
} from '@/lib/nav-links';
import {
  LayoutDashboard,
  List,
  Megaphone,
  UserCheck,
  UserPlus,
  BarChart,
  Medal,
  UserCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

const navGroupsMap: Record<string, NavGroup[]> = {
  admin: adminNavGroups,
  teams: teamNavGroups,
  judges: judgeNavGroups,
  'stage-control': stageControlNavGroups,
};

const PANEL_META: Record<
  string,
  { label: string; badge: string; badgeClass: string; icon: React.ComponentType<{ className?: string }> }
> = {
  admin: {
    label: 'Admin Console',
    badge: 'Administrator',
    badgeClass: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
    icon: Shield,
  },
  teams: {
    label: 'House Command',
    badge: 'House Portal',
    badgeClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    icon: Users,
  },
  judges: {
    label: 'Judges Desk',
    badge: 'Evaluator',
    badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    icon: Trophy,
  },
  'stage-control': {
    label: 'Stage Control',
    badge: 'Announcer Desk',
    badgeClass: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
    icon: Presentation,
  },
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

function SidebarNavigation({
  groups,
  searchQuery,
}: {
  groups: NavGroup[];
  searchQuery: string;
}) {
  const pathname = usePathname();

  // Filter groups and items when searching
  const filteredGroups = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;

    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.href.toLowerCase().includes(q) ||
            (item.badge && item.badge.toLowerCase().includes(q))
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, searchQuery]);

  if (filteredGroups.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
        <p className="font-semibold">No pages found</p>
        <p className="mt-1 text-[11px] opacity-70">
          Try a different keyword or clear search.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 py-1">
      {filteredGroups.map((group, gIdx) => (
        <SidebarGroup key={group.title || gIdx} className="p-0 px-2">
          {group.title && (
            <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 px-2 h-7">
              {group.title}
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {group.items.map((item) => {
                const isActive =
                  item.href === '/'
                    ? pathname === '/'
                    : item.href.endsWith('/dashboard')
                    ? pathname === item.href
                    : pathname.startsWith(item.href);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.label}
                      className={cn(
                        'relative h-9 rounded-xl font-medium text-xs transition-all duration-150 justify-start',
                        isActive
                          ? 'bg-primary/10 text-primary font-semibold shadow-xs before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r-full before:bg-primary'
                          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground'
                      )}
                    >
                      <Link href={item.href} className="flex items-center gap-2.5 w-full">
                        <item.icon
                          className={cn(
                            'h-4 w-4 shrink-0 transition-transform duration-150',
                            isActive
                              ? 'text-primary scale-110'
                              : 'text-muted-foreground group-hover:text-foreground'
                          )}
                        />
                        <span className="truncate flex-1">{item.label}</span>
                        {item.badge && (
                          <span
                            className={cn(
                              'ml-auto text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md border shrink-0 group-data-[collapsible=icon]:hidden',
                              item.badgeColor === 'rose'
                                ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                : item.badgeColor === 'amber'
                                ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                : item.badgeColor === 'emerald'
                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                : item.badgeColor === 'cyan'
                                ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20'
                                : 'bg-muted text-muted-foreground border-border/40'
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </div>
  );
}

export function DashboardLayout({ children, panel }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');
  const { settings } = useAppSettings();
  const festName = settings?.festName || 'DALENZIA';

  const panelMeta = PANEL_META[panel] || {
    label: panel,
    badge: panel,
    badgeClass: 'bg-primary/10 text-primary border-primary/20',
    icon: Trophy,
  };

  const currentSection = panel === 'stage-control' ? 'Stage Control' : panel;
  const navGroups = navGroupsMap[panel] || [];
  const bottomNavItems = bottomNavMap[panel];
  const [isLogoutAlertOpen, setIsLogoutAlertOpen] = React.useState(false);

  React.useEffect(() => {
    const storedUser = localStorage.getItem('fest-central-user');
    if (storedUser) {
      try {
        const userData: User = JSON.parse(storedUser);
        const userPanel =
          userData.role === 'team'
            ? 'teams'
            : userData.role === 'stagecontroller'
            ? 'stage-control'
            : userData.role;
        if (userPanel === panel) {
          setUser(userData);
        } else {
          router.push('/login');
        }
      } catch (error) {
        console.error('Failed to parse user data:', error);
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
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
            <Loader2 className="h-8 w-8 animate-spin text-primary relative z-10" />
          </div>
          <p className="text-xs text-muted-foreground font-medium animate-pulse">
            Verifying credentials...
          </p>
        </div>
      </div>
    );
  }

  const roleDisplay =
    user.role === 'admin'
      ? 'Administrator'
      : user.role === 'team'
      ? 'House In-Charge'
      : user.role === 'judges'
      ? 'Evaluating Judge'
      : 'Stage Controller';

  return (
    <SidebarProvider>
      <Sidebar
        collapsible="icon"
        className="border-r border-sidebar-border/70 bg-sidebar/95 backdrop-blur-xl"
      >
        {/* SIDEBAR BRAND HEADER */}
        <SidebarHeader className="border-b border-sidebar-border/60 p-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 via-orange-500/15 to-primary/20 border border-amber-500/30 text-amber-500 shadow-xs">
              <Trophy className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <h2 className="font-extrabold text-sm tracking-tight font-headline truncate text-sidebar-foreground">
                {festName}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider truncate">
                  {panelMeta.label}
                </span>
              </div>
            </div>
          </div>
        </SidebarHeader>

        {/* SIDEBAR SEARCH & NAVIGATION CONTENT */}
        <SidebarContent className="gap-0 py-2">
          {/* Quick Search (visible on admin or larger lists) */}
          {(panel === 'admin' || navGroups.flatMap((g) => g.items).length > 5) && (
            <div className="px-3 pt-1 pb-2 group-data-[collapsible=icon]:hidden">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Quick find page..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 pr-7 text-xs bg-sidebar-accent/50 border-sidebar-border/50 rounded-xl focus:bg-sidebar-accent transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Navigation Items */}
          <SidebarNavigation groups={navGroups} searchQuery={searchQuery} />
        </SidebarContent>

        {/* SIDEBAR USER PROFILE FOOTER */}
        <SidebarFooter className="border-t border-sidebar-border/60 p-2.5">
          {/* Expanded State: Full User Card */}
          <div className="flex items-center justify-between gap-2 p-1.5 rounded-xl bg-sidebar-accent/40 border border-sidebar-border/40 group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <Avatar className="h-8 w-8 border border-border/60">
                  <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                    {user.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border-2 border-sidebar" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold truncate text-sidebar-foreground">{user.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{roleDisplay}</p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                      className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg"
                    >
                      <Link href="/" target="_blank">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Public Portal</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsLogoutAlertOpen(true)}
                      className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Logout</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Collapsed State: Icon with Dropdown Menu */}
          <div className="hidden group-data-[collapsible=icon]:flex flex-col items-center justify-center py-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-sidebar-accent/50 hover:bg-sidebar-accent transition-colors">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                      {user.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border-2 border-sidebar" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" className="w-52 p-1.5">
                <DropdownMenuLabel className="font-normal px-2 py-1.5">
                  <div className="flex flex-col space-y-0.5">
                    <p className="text-xs font-bold leading-none">{user.name}</p>
                    <p className="text-[10px] text-muted-foreground">{roleDisplay}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/" target="_blank" className="cursor-pointer text-xs">
                    <ExternalLink className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                    <span>Public Portal</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setIsLogoutAlertOpen(true)}
                  className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer text-xs"
                >
                  <LogOut className="mr-2 h-3.5 w-3.5" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SidebarFooter>

        {/* Sidebar Rail for Desktop Resizing & Quick Click */}
        <SidebarRail />
      </Sidebar>

      {/* MAIN VIEW AREA */}
      <SidebarInset>
        {/* Top Header */}
        <header className="flex h-14 items-center gap-2.5 sm:gap-4 border-b bg-card/90 px-3 sm:px-6 sticky top-0 backdrop-blur-md z-30">
          {/* Universal Sidebar Trigger for both Desktop & Mobile */}
          <SidebarTrigger className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0 rounded-lg hover:bg-muted transition-colors" />

          {/* Section Breadcrumb & Role Badge */}
          <div className="flex items-center gap-2.5 min-w-0">
            <h1 className="text-base sm:text-lg font-bold capitalize font-headline truncate">
              {currentSection}
            </h1>
            <Badge
              variant="outline"
              className={cn('hidden sm:inline-flex text-[10px] font-semibold px-2 py-0.5', panelMeta.badgeClass)}
            >
              {panelMeta.badge}
            </Badge>
          </div>

          {/* Header Controls */}
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              asChild
              className="h-8 px-2.5 sm:px-3 text-xs sm:text-sm rounded-xl border-border/60 hover:bg-muted/60 shadow-xs"
            >
              <Link href="/">
                <Trophy className="h-3.5 w-3.5 text-amber-500 sm:mr-1.5 shrink-0" />
                <span className="hidden sm:inline font-medium">Public Results</span>
              </Link>
            </Button>
          </div>
        </header>

        {/* Main Body */}
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

      {/* LOGOUT CONFIRMATION DIALOG */}
      <AlertDialog open={isLogoutAlertOpen} onOpenChange={setIsLogoutAlertOpen}>
        <AlertDialogContent className="bg-background/95 backdrop-blur-xl border-border/50 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold">Confirm Sign Out</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to log out? Your session will end and you will be redirected to the login portal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-2">
            <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              className="bg-destructive hover:bg-destructive/90 text-white text-xs font-semibold"
            >
              Log Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
