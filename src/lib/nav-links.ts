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
}

export const adminNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Access Central', href: '/admin/access-central', icon: KeyRound },
  { label: 'Teams', href: '/admin/teams', icon: Users },
  { label: 'Categories', href: '/admin/categories', icon: LayoutGrid },
  { label: 'Programs', href: '/admin/programs', icon: List },
  { label: 'Program Coordination', href: '/admin/program-coordination', icon: UserCheck },
  { label: 'Reporting', href: '/admin/reporting', icon: BarChart },
  { label: 'Stage Central', href: '/admin/stage-central', icon: Presentation },
  { label: 'Results', href: '/admin/results', icon: Medal },
  { label: 'Team Marks', href: '/admin/team-marks', icon: Award },
  { label: 'Program Points', href: '/admin/program-points', icon: GraduationCap },
  { label: 'ID Card Setup', href: '/admin/id-card-setup', icon: CreditCard },
  { label: 'Printouts', href: '/admin/printouts', icon: Printer },
  { label: 'Poster Template', href: '/admin/poster-template', icon: FileCode },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
  { label: 'Top Candidates', href: '/admin/top-candidates', icon: Star },
];

export const teamNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/teams/dashboard', icon: LayoutDashboard },
  { label: 'Add Participants', href: '/teams/add-participants', icon: UserPlus },
  { label: 'Assign Participants', href: '/teams/assign-students', icon: UserCheck },
  { label: 'Reports', href: '/teams/reports', icon: BarChart },
];

export const judgeNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/judges/dashboard', icon: LayoutDashboard },
  { label: 'Judging Point', href: '/judges/judging-point', icon: Trophy },
  { label: 'Profile', href: '/judges/profile', icon: UserCircle },
];

export const stageControlNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/stage-control/dashboard', icon: LayoutDashboard },
  { label: 'Programs', href: '/stage-control/programs', icon: List },
  { label: 'Inform', href: '/stage-control/inform', icon: Megaphone },
];
