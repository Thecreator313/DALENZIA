import {
  Award,
  BarChart,
  CreditCard,
  FileCode,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  List,
  Megaphone,
  Medal,
  Presentation,
  Printer,
  Settings,
  Star,
  Trophy,
  UserCheck,
  UserCircle,
  UserPlus,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  badgeColor?: 'default' | 'amber' | 'emerald' | 'rose' | 'indigo' | 'cyan';
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
}

export const adminNavGroups: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
      { label: 'Top Candidates', href: '/admin/top-candidates', icon: Star, badge: 'Top', badgeColor: 'amber' },
    ],
  },
  {
    title: 'Scoring & Standings',
    items: [
      { label: 'Results', href: '/admin/results', icon: Medal },
      { label: 'Team Marks', href: '/admin/team-marks', icon: Award, badge: 'Standings', badgeColor: 'amber' },
      { label: 'Program Points', href: '/admin/program-points', icon: GraduationCap },
    ],
  },
  {
    title: 'Festival Structure',
    items: [
      { label: 'Teams', href: '/admin/teams', icon: Users },
      { label: 'Categories', href: '/admin/categories', icon: LayoutGrid },
      { label: 'Programs', href: '/admin/programs', icon: List },
      { label: 'Program Coordination', href: '/admin/program-coordination', icon: UserCheck },
    ],
  },
  {
    title: 'Stage & Operations',
    items: [
      { label: 'Stage Central', href: '/admin/stage-central', icon: Presentation, badge: 'Live', badgeColor: 'rose' },
      { label: 'Reporting', href: '/admin/reporting', icon: BarChart },
    ],
  },
  {
    title: 'Publishing & Media',
    items: [
      { label: 'Printouts', href: '/admin/printouts', icon: Printer },
      { label: 'ID Card Setup', href: '/admin/id-card-setup', icon: CreditCard },
      { label: 'Poster Template', href: '/admin/poster-template', icon: FileCode },
    ],
  },
  {
    title: 'System & Security',
    items: [
      { label: 'Access Central', href: '/admin/access-central', icon: KeyRound },
      { label: 'Settings', href: '/admin/settings', icon: Settings },
    ],
  },
];

export const teamNavGroups: NavGroup[] = [
  {
    title: 'House Portal',
    items: [
      { label: 'Dashboard', href: '/teams/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Contenders',
    items: [
      { label: 'Add Participants', href: '/teams/add-participants', icon: UserPlus },
      { label: 'Assign Participants', href: '/teams/assign-students', icon: UserCheck },
    ],
  },
  {
    title: 'Performance',
    items: [
      { label: 'House Reports', href: '/teams/reports', icon: BarChart },
    ],
  },
];

export const judgeNavGroups: NavGroup[] = [
  {
    title: 'Judging Point',
    items: [
      { label: 'Dashboard', href: '/judges/dashboard', icon: LayoutDashboard },
      { label: 'Judging Point', href: '/judges/judging-point', icon: Trophy, badge: 'Active', badgeColor: 'amber' },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Judge Profile', href: '/judges/profile', icon: UserCircle },
    ],
  },
];

export const stageControlNavGroups: NavGroup[] = [
  {
    title: 'Stage Command',
    items: [
      { label: 'Dashboard', href: '/stage-control/dashboard', icon: LayoutDashboard },
      { label: 'Programs', href: '/stage-control/programs', icon: List },
      { label: 'Inform / Call', href: '/stage-control/inform', icon: Megaphone, badge: 'Live', badgeColor: 'rose' },
    ],
  },
];

// Flat arrays for backwards compatibility
export const adminNavItems: NavItem[] = adminNavGroups.flatMap((g) => g.items);
export const teamNavItems: NavItem[] = teamNavGroups.flatMap((g) => g.items);
export const judgeNavItems: NavItem[] = judgeNavGroups.flatMap((g) => g.items);
export const stageControlNavItems: NavItem[] = stageControlNavGroups.flatMap((g) => g.items);
