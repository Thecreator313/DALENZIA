
'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import gsap from 'gsap';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { db } from '@/lib/firebase';
import { useSharedCollection, useAppSettings } from '@/context/firestore-cache';
import { AccessShieldCanvas } from '@/components/access-shield-canvas';
import { AnimatedCounter } from '@/components/animated-counter';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { toast } from '@/hooks/use-toast';
import {
  MoreHorizontal,
  PlusCircle,
  Trash,
  Edit,
  Search,
  Shield,
  UserCog,
  Users,
  Gavel,
  Mic2,
  Loader2,
  Eye,
  EyeOff,
  Copy,
  Check,
  X,
  KeyRound,
  LayoutGrid,
  List as ListIcon,
  Wand2,
  Share2,
  ExternalLink,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const userSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  role: z.enum(['admin', 'judges', 'team', 'stagecontroller']),
  userId: z.string().min(1, 'User ID is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export type User = z.infer<typeof userSchema> & { id: string };

const ROLE_META = {
  admin: {
    label: 'Admin',
    badgeClass: 'bg-red-500/10 text-red-500 border-red-500/25',
    avatarRing: 'from-red-500 to-rose-500',
    stripClass: 'from-red-500 via-rose-500 to-orange-500',
    icon: Shield,
  },
  judges: {
    label: 'Judge',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25',
    avatarRing: 'from-amber-400 to-orange-500',
    stripClass: 'from-amber-400 via-yellow-500 to-orange-500',
    icon: Gavel,
  },
  team: {
    label: 'Team',
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25',
    avatarRing: 'from-blue-500 to-cyan-500',
    stripClass: 'from-sky-400 via-blue-500 to-indigo-500',
    icon: Users,
  },
  stagecontroller: {
    label: 'Stage Control',
    badgeClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25',
    avatarRing: 'from-purple-500 to-fuchsia-500',
    stripClass: 'from-purple-400 via-fuchsia-500 to-pink-500',
    icon: Mic2,
  },
} as const;

const RoleBadge = ({ role }: { role: string }) => {
  const meta = ROLE_META[role as keyof typeof ROLE_META];
  const Icon = meta?.icon || UserCog;

  return (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 font-medium',
        meta?.badgeClass || 'bg-gray-500/10 text-gray-500 border-gray-500/20'
      )}
    >
      <Icon className="w-3 h-3" />
      <span>{meta?.label || role}</span>
    </Badge>
  );
};

const WhatsAppIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2ZM12.05 20.16C10.57 20.16 9.12 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.8 13.47 3.8 11.91C3.8 7.37 7.5 3.67 12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.43 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.16 12.05 20.16ZM16.57 14.39C16.32 14.27 15.1 13.67 14.87 13.58C14.65 13.5 14.48 13.46 14.32 13.71C14.15 13.96 13.68 14.51 13.54 14.68C13.39 14.84 13.25 14.86 13 14.74C12.75 14.61 11.95 14.35 11 13.5C10.26 12.84 9.76 12.03 9.61 11.78C9.47 11.53 9.6 11.4 9.72 11.27C9.83 11.16 9.97 10.98 10.1 10.83C10.22 10.68 10.27 10.57 10.35 10.41C10.43 10.24 10.39 10.1 10.33 9.97C10.27 9.85 9.78 8.65 9.58 8.15C9.38 7.67 9.18 7.73 9.03 7.72C8.89 7.72 8.72 7.71 8.56 7.71C8.39 7.71 8.12 7.77 7.89 8.02C7.66 8.27 7.02 8.87 7.02 10.09C7.02 11.31 7.91 12.49 8.03 12.65C8.16 12.82 9.78 15.31 12.26 16.38C12.85 16.64 13.31 16.79 13.67 16.91C14.26 17.09 14.8 17.07 15.22 17C15.69 16.93 16.67 16.41 16.87 15.83C17.08 15.26 17.08 14.77 17.02 14.67C16.96 14.56 16.82 14.51 16.57 14.39Z" />
  </svg>
);

export default function AccessCentralPage() {
  const { data: users, loading } = useSharedCollection<User>('users');
  const { settings } = useAppSettings();
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showDetailPassword, setShowDetailPassword] = useState(false);
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);
  const [copiedDetailField, setCopiedDetailField] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  const pageRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const heroAnimatedRef = useRef(false);

  const form = useForm<z.infer<typeof userSchema>>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: '',
      role: 'team',
      userId: '',
      password: '',
    },
  });

  const filteredUsers = useMemo(() => {
    return users
      .filter((user) => (roleFilter === 'all' ? true : user.role === roleFilter))
      .filter(
        (user) =>
          user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.userId.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [users, searchTerm, roleFilter]);

  const roleCounts = useMemo(() => {
    const counts = { total: users.length, admin: 0, judges: 0, team: 0, stagecontroller: 0 };
    for (const u of users) {
      if (u.role in counts) {
        counts[u.role as keyof typeof counts]++;
      }
    }
    return counts;
  }, [users]);

  const hasActiveFilters = searchTerm !== '' || roleFilter !== 'all';

  const resetFilters = () => {
    setSearchTerm('');
    setRoleFilter('all');
  };

  useEffect(() => {
    if (loading || heroAnimatedRef.current || !pageRef.current) return;
    heroAnimatedRef.current = true;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      gsap.from('.access-hero-stagger', {
        y: 22,
        opacity: 0,
        duration: 0.65,
        stagger: 0.08,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      });
      gsap.from('.access-kpi-pill', {
        scale: 0.94,
        y: 16,
        opacity: 0,
        duration: 0.55,
        stagger: 0.06,
        delay: 0.15,
        ease: 'back.out(1.4)',
        clearProps: 'transform,opacity',
      });
    }, pageRef);

    return () => ctx.revert();
  }, [loading]);

  useEffect(() => {
    if (loading || !listRef.current) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      const items = gsap.utils.toArray<HTMLElement>('.access-anim-item');
      if (items.length === 0) return;
      gsap.fromTo(
        items,
        { y: 14, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.36,
          stagger: { amount: Math.min(items.length * 0.03, 0.35) },
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        }
      );
    }, listRef);

    return () => ctx.revert();
  }, [loading, roleFilter, viewMode]);

  const handleDialogOpenChange = (open: boolean) => {
    setIsFormOpen(open);
    if (!open) {
      setShowPassword(false);
    }
  };

  const onSubmit = async (values: z.infer<typeof userSchema>) => {
    try {
      if (editingUser) {
        const userDoc = doc(db, 'users', editingUser.id);
        await updateDoc(userDoc, values);
        toast({ title: 'Success', description: 'User updated successfully.' });
      } else {
        await addDoc(collection(db, 'users'), values);
        toast({ title: 'Success', description: 'User added successfully.' });
      }
      form.reset();
      setEditingUser(null);
      setShowPassword(false);
      setIsFormOpen(false);
    } catch (error) {
      console.error('Error saving user:', error);
      toast({
        title: 'Error',
        description: 'Failed to save user.',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setShowPassword(false);
    form.reset(user);
    setIsFormOpen(true);
  };

  const handleDelete = async () => {
    if (!userToDelete) return;
    try {
      await deleteDoc(doc(db, 'users', userToDelete.id));
      toast({ title: 'Success', description: 'User deleted successfully.' });
      setUserToDelete(null);
      setIsDeleteDialogOpen(false);
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete user.',
        variant: 'destructive',
      });
    }
  };

  const openDeleteDialog = (user: User) => {
    setUserToDelete(user);
    setIsDeleteDialogOpen(true);
  };

  const openAddForm = () => {
    setEditingUser(null);
    setShowPassword(false);
    form.reset({
      name: '',
      role: 'team',
      userId: '',
      password: '',
    });
    setIsFormOpen(true);
  };

  const handleGeneratePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let generated = '';
    for (let i = 0; i < 8; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    form.setValue('password', generated, { shouldValidate: true, shouldDirty: true });
    setShowPassword(true);
  };

  const toggleRowPassword = (id: string) => {
    setRevealedPasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyUserId = async (id: string, userIdValue: string) => {
    try {
      await navigator.clipboard.writeText(userIdValue);
      setCopiedUserId(id);
      toast({ title: 'Copied', description: `User ID "${userIdValue}" copied to clipboard.` });
      setTimeout(() => setCopiedUserId((cur) => (cur === id ? null : cur)), 1600);
    } catch {
      toast({ title: 'Copy failed', description: 'Could not copy to clipboard.', variant: 'destructive' });
    }
  };

  const generateWhatsAppText = (user: User) => {
    const festTitle = settings?.festName ? settings.festName.trim() : 'Fest Portal';
    const roleTitle = ROLE_META[user.role as keyof typeof ROLE_META]?.label || user.role;
    const loginUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login';

    return `✨ *${festTitle.toUpperCase()} — LOGIN CREDENTIALS* ✨

Dear *${user.name}*,
Here are your login details to access the *${festTitle}* portal:

━━━━━━━━━━━━━━━━━━━━
👤 *Name:* ${user.name}
🏷️ *Role:* ${roleTitle}
🔑 *User ID:* \`${user.userId}\`
🔒 *Password:* \`${user.password}\`
━━━━━━━━━━━━━━━━━━━━

🌐 *Login Portal:*
${loginUrl}

📌 *How to Login:*
1. Click the login link above.
2. Enter your *User ID* and *Password*.
3. Click *Sign In* to access your designated dashboard.

_Please keep your login credentials secure and confidential._`;
  };

  const handleCopyWhatsAppText = async (user: User) => {
    const text = generateWhatsAppText(user);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedWhatsApp(true);
      toast({
        title: 'WhatsApp Message Copied!',
        description: `Credentials for ${user.name} are ready to paste into WhatsApp.`,
      });
      setTimeout(() => setCopiedWhatsApp(false), 2000);
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Could not copy to clipboard.',
        variant: 'destructive',
      });
    }
  };

  const handleOpenWhatsApp = (user: User) => {
    const text = generateWhatsAppText(user);
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCopyDetailField = async (fieldKey: string, value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedDetailField(fieldKey);
      toast({
        title: 'Copied',
        description: `${label} copied to clipboard.`,
      });
      setTimeout(() => setCopiedDetailField((cur) => (cur === fieldKey ? null : cur)), 1600);
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Could not copy to clipboard.',
        variant: 'destructive',
      });
    }
  };

  const handleCardPointerMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-6rem)] gap-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/25 blur-xl animate-pulse" />
          <Loader2 className="h-12 w-12 animate-spin text-primary relative z-10" />
        </div>
        <p className="text-muted-foreground animate-pulse font-medium">Loading Access Central...</p>
      </div>
    );
  }

  return (
    <div ref={pageRef} className="space-y-6 sm:space-y-8 relative min-h-screen pb-8">
      {/* Ambient Glows */}
      <div className="fixed inset-0 -z-10 h-full w-full overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-red-500/10 blur-[120px]" />
        <div className="absolute top-1/3 -right-24 w-96 h-96 rounded-full bg-blue-500/10 blur-[120px]" />
        <div className="absolute -bottom-24 left-1/3 w-80 h-80 rounded-full bg-purple-500/10 blur-[120px]" />
      </div>

      {/* Hero Banner with Three.js 3D Role Vault */}
      <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-border/60 bg-gradient-to-br from-card/85 via-card/65 to-primary/10 backdrop-blur-xl shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_55%),radial-gradient(circle_at_bottom_left,rgba(239,68,68,0.1),transparent_50%)] pointer-events-none" />
        <div className="grid lg:grid-cols-[1.45fr_1fr] items-center gap-5 sm:gap-6 p-4 sm:p-6 lg:p-8 relative z-10">
          <div className="space-y-4 sm:space-y-6">
            <div className="space-y-2 sm:space-y-3">
              <div className="access-hero-stagger inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-0.5 sm:py-1 text-[11px] sm:text-xs font-semibold text-primary">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                Access Central • Identity & Roles
              </div>
              <div className="access-hero-stagger">
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold font-headline tracking-tight bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent">
                  Access Central
                </h1>
                <p className="text-muted-foreground mt-1 max-w-xl text-xs sm:text-sm lg:text-base">
                  Manage credentials, role-based access, and instant account updates across Admin, Judges, Teams, and Stage Control.
                </p>
              </div>
            </div>

            <div className="access-hero-stagger flex flex-col xs:flex-row items-stretch xs:items-center gap-2.5 sm:gap-3">
              <Dialog open={isFormOpen} onOpenChange={handleDialogOpenChange}>
                <DialogTrigger asChild>
                  <Button
                    onClick={openAddForm}
                    size="lg"
                    className="w-full xs:w-auto rounded-xl shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all duration-200 bg-gradient-to-r from-blue-600 via-primary to-indigo-600 text-white border-0 h-10 sm:h-11 text-sm font-semibold"
                  >
                    <PlusCircle className="mr-2 h-4 w-4" /> Add User
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[94vw] sm:max-w-[440px] max-h-[90vh] overflow-y-auto bg-background/95 backdrop-blur-xl border-border/60 p-4 sm:p-6 rounded-2xl">
                  <DialogHeader>
                    <DialogTitle className="text-lg sm:text-xl font-headline flex items-center gap-2">
                      <KeyRound className="h-5 w-5 text-primary" />
                      {editingUser ? 'Edit User Account' : 'Create User Account'}
                    </DialogTitle>
                    <DialogDescription className="text-xs sm:text-sm">
                      {editingUser
                        ? 'Update account details, role assignment, or password.'
                        : 'Add a new portal user and configure login credentials.'}
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                              <Input placeholder="John Doe" {...field} className="bg-muted/40 border-border/60" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="role"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Role</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger className="bg-muted/40 border-border/60">
                                  <SelectValue placeholder="Select a role" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="judges">Judge</SelectItem>
                                <SelectItem value="team">Team</SelectItem>
                                <SelectItem value="stagecontroller">Stage Controller</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="userId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>User ID</FormLabel>
                            <FormControl>
                              <Input placeholder="john.doe" {...field} className="bg-muted/40 border-border/60 font-mono" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Password</FormLabel>
                              <button
                                type="button"
                                onClick={handleGeneratePassword}
                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                              >
                                <Wand2 className="h-3 w-3" /> Generate
                              </button>
                            </div>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type={showPassword ? 'text' : 'password'}
                                  placeholder="••••••••"
                                  {...field}
                                  className="bg-muted/40 border-border/60 pr-10 font-mono"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowPassword((prev) => !prev)}
                                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                                  title={showPassword ? 'Hide password' : 'Show password'}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                                >
                                  {showPassword ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <DialogFooter className="pt-4 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                        <DialogClose asChild>
                          <Button type="button" variant="outline" className="w-full sm:w-auto">
                            Cancel
                          </Button>
                        </DialogClose>
                        <Button type="submit" className="w-full sm:w-auto">
                          {editingUser ? 'Save Changes' : 'Create User'}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>

            {/* Interactive Role KPI Filter Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-2.5 pt-1">
              {[
                { key: 'all', label: 'All Users', val: roleCounts.total, icon: UserCog, accent: 'text-primary bg-primary/10 border-primary/20' },
                { key: 'admin', label: 'Admins', val: roleCounts.admin, icon: Shield, accent: 'text-red-500 bg-red-500/10 border-red-500/20' },
                { key: 'judges', label: 'Judges', val: roleCounts.judges, icon: Gavel, accent: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
                { key: 'team', label: 'Teams', val: roleCounts.team, icon: Users, accent: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
                { key: 'stagecontroller', label: 'Stage Ctrl', val: roleCounts.stagecontroller, icon: Mic2, accent: 'text-purple-500 bg-purple-500/10 border-purple-500/20' },
              ].map((item, index) => {
                const isActive = roleFilter === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setRoleFilter(item.key)}
                    className={cn(
                      'access-kpi-pill text-left rounded-2xl border backdrop-blur-md p-2.5 sm:p-3 transition-all duration-200 hover:-translate-y-0.5',
                      index === 0 ? 'col-span-2 sm:col-span-1' : '',
                      isActive
                        ? 'border-primary/50 bg-primary/10 shadow-md ring-1 ring-primary/25'
                        : 'border-border/60 bg-background/60 hover:border-primary/30'
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                        {item.label}
                      </span>
                      <span className={cn('p-1 rounded-md border', item.accent)}>
                        <item.icon className="h-3 w-3" />
                      </span>
                    </div>
                    <div className="text-lg sm:text-xl font-bold font-headline tracking-tight">
                      <AnimatedCounter value={item.val} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive 3D Three.js Role Vault */}
          <div className="relative h-44 sm:h-56 lg:h-80 w-full rounded-2xl border border-border/40 bg-gradient-to-b from-primary/5 via-transparent to-purple-500/5 overflow-hidden">
            <AccessShieldCanvas userCount={users.length} activeRole={roleFilter} />
            <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
              {[
                { label: 'Admin', dot: 'bg-red-500' },
                { label: 'Judge', dot: 'bg-amber-400' },
                { label: 'Team', dot: 'bg-blue-500' },
                { label: 'Stage', dot: 'bg-purple-500' },
              ].map((dotItem) => (
                <span
                  key={dotItem.label}
                  className="inline-flex items-center gap-1.5 rounded-full bg-background/75 backdrop-blur-md border border-border/50 px-2.5 py-0.5"
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', dotItem.dot)} />
                  {dotItem.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Users Directory Card */}
      <Card className="border-border/60 bg-card/55 backdrop-blur-xl shadow-lg overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20 p-4 sm:p-6 space-y-3 sm:space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <UserCog className="w-5 h-5 text-primary" />
                User Directory
                <Badge variant="secondary" className="rounded-full font-mono text-xs">
                  {filteredUsers.length} / {users.length}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm mt-1">
                Click any user row to view credentials and copy a WhatsApp-ready sharing message.
              </CardDescription>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search name or user ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-8 bg-background/70 border-border/60 rounded-xl h-10 text-xs sm:text-sm"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-[1fr_auto] sm:flex sm:items-center gap-2 sm:gap-3">
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-full sm:w-[165px] bg-background/70 border-border/60 rounded-xl h-10 text-xs sm:text-sm">
                    <SelectValue placeholder="Filter by role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="judges">Judge</SelectItem>
                    <SelectItem value="team">Team</SelectItem>
                    <SelectItem value="stagecontroller">Stage Control</SelectItem>
                  </SelectContent>
                </Select>

                <div className="inline-flex rounded-xl border border-border/60 bg-background/70 p-1 shrink-0 h-10 items-center">
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    aria-label="Table view"
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all h-full',
                      viewMode === 'table'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <ListIcon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Table</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    aria-label="Cards view"
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all h-full',
                      viewMode === 'grid'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Cards</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="flex justify-end pt-1">
              <Button variant="ghost" size="sm" onClick={resetFilters} className="h-7 text-xs text-muted-foreground hover:text-foreground">
                <X className="mr-1 h-3.5 w-3.5" /> Clear Active Filters
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent className={viewMode === 'table' ? 'p-0' : 'p-3.5 sm:p-6'}>
          <div ref={listRef}>
            {viewMode === 'table' ? (
              <div className="overflow-x-auto w-full">
                <div className="sm:hidden px-3.5 py-2 bg-muted/20 border-b border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>💡 Tap any row to view & share</span>
                  <span className="text-[10px] font-mono opacity-70">Scroll ↔</span>
                </div>
                <Table className="min-w-[580px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border/50">
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>User ID</TableHead>
                      <TableHead>Password</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                  {filteredUsers.map((user) => {
                    const meta = ROLE_META[user.role as keyof typeof ROLE_META];
                    const isRevealed = !!revealedPasswords[user.id];
                    const isCopied = copiedUserId === user.id;

                    return (
                      <TableRow
                        key={user.id}
                        onClick={() => {
                          setSelectedUser(user);
                          setShowDetailPassword(false);
                          setCopiedWhatsApp(false);
                        }}
                        className="access-anim-item border-b border-border/40 hover:bg-muted/40 cursor-pointer transition-colors"
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8 border border-border/60">
                              <AvatarFallback
                                className={cn(
                                  'text-xs font-bold text-white bg-gradient-to-br',
                                  meta?.avatarRing || 'from-slate-500 to-slate-600'
                                )}
                              >
                                {user.name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{user.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <RoleBadge role={user.role} />
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyUserId(user.id, user.userId);
                            }}
                            title="Copy User ID"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/40 px-2.5 py-1 font-mono text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                          >
                            <span>{user.userId}</span>
                            {isCopied ? (
                              <Check className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <Copy className="h-3 w-3 opacity-60" />
                            )}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                            <span>{isRevealed ? user.password : '••••••••'}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRowPassword(user.id);
                              }}
                              aria-label={isRevealed ? 'Hide password' : 'Show password'}
                              className="rounded-md p-1 hover:bg-muted hover:text-foreground transition-colors"
                            >
                              {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                className="h-8 w-8 p-0 rounded-lg hover:bg-muted"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedUser(user);
                                  setShowDetailPassword(false);
                                  setCopiedWhatsApp(false);
                                }}
                              >
                                <Share2 className="mr-2 h-4 w-4 text-emerald-500" /> View & Share
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(user);
                                }}
                              >
                                <Edit className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDeleteDialog(user);
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">
                        No users found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredUsers.map((user) => {
                const meta = ROLE_META[user.role as keyof typeof ROLE_META];
                const isRevealed = !!revealedPasswords[user.id];
                const isCopied = copiedUserId === user.id;

                return (
                  <Card
                    key={user.id}
                    onClick={() => {
                      setSelectedUser(user);
                      setShowDetailPassword(false);
                      setCopiedWhatsApp(false);
                    }}
                    onMouseMove={handleCardPointerMove}
                    className="access-anim-item group relative overflow-hidden rounded-2xl border-border/60 bg-background/70 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl cursor-pointer"
                  >
                    <div
                      className={cn(
                        'h-1.5 w-full bg-gradient-to-r',
                        meta?.stripClass || 'from-slate-400 to-slate-600'
                      )}
                    />
                    <div
                      className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      style={{
                        background:
                          'radial-gradient(320px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(59,130,246,0.12), transparent 60%)',
                      }}
                    />
                    <CardContent className="relative z-10 p-4 sm:p-5 space-y-3 sm:space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-10 w-10 border border-border/60 shrink-0">
                            <AvatarFallback
                              className={cn(
                                'text-sm font-bold text-white bg-gradient-to-br',
                                meta?.avatarRing || 'from-slate-500 to-slate-600'
                              )}
                            >
                              {user.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{user.name}</p>
                            <div className="mt-1">
                              <RoleBadge role={user.role} />
                            </div>
                          </div>
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              className="h-8 w-8 p-0 shrink-0 rounded-lg hover:bg-muted"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedUser(user);
                                setShowDetailPassword(false);
                                setCopiedWhatsApp(false);
                              }}
                            >
                              <Share2 className="mr-2 h-4 w-4 text-emerald-500" /> View & Share
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(user);
                              }}
                            >
                              <Edit className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                openDeleteDialog(user);
                              }}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="rounded-xl border border-border/50 bg-muted/30 p-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">User ID</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyUserId(user.id, user.userId);
                            }}
                            className="inline-flex items-center gap-1.5 font-mono font-medium hover:text-primary transition-colors"
                          >
                            <span>{user.userId}</span>
                            {isCopied ? (
                              <Check className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <Copy className="h-3 w-3 opacity-60" />
                            )}
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2">
                          <span className="text-muted-foreground">Password</span>
                          <div className="inline-flex items-center gap-1.5 font-mono font-medium">
                            <span>{isRevealed ? user.password : '••••••••'}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRowPassword(user.id);
                              }}
                              aria-label={isRevealed ? 'Hide password' : 'Show password'}
                              className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-border/40 text-xs">
                        <span className="text-[11px] text-muted-foreground">
                          Tap to view details
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyWhatsAppText(user);
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline p-1 -mr-1"
                        >
                          <WhatsAppIcon className="h-3.5 w-3.5 fill-emerald-600 dark:fill-emerald-400" />
                          <span>Copy WhatsApp</span>
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
                {filteredUsers.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center text-center text-muted-foreground py-12 rounded-2xl border border-dashed border-border/60">
                    <UserCog className="h-10 w-10 opacity-40 mb-2" />
                    <p className="font-medium text-foreground">No users found</p>
                    <p className="text-xs mt-1">Try adjusting your search or role filter.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* User Details & WhatsApp Share Dialog */}
      <Dialog
        open={!!selectedUser}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedUser(null);
            setShowDetailPassword(false);
            setCopiedWhatsApp(false);
            setCopiedDetailField(null);
          }
        }}
      >
        <DialogContent className="w-[94vw] sm:max-w-[540px] max-h-[92vh] overflow-y-auto bg-background/95 backdrop-blur-xl border-border/60 p-4 sm:p-6 rounded-2xl sm:rounded-3xl">
          {selectedUser && (
            <>
              <DialogHeader className="space-y-3 pb-3 border-b border-border/50 text-left">
                <div className="flex items-center gap-3 sm:gap-3.5">
                  <Avatar className="h-10 w-10 sm:h-12 sm:w-12 border border-border/60 shrink-0">
                    <AvatarFallback
                      className={cn(
                        'text-sm sm:text-base font-bold text-white bg-gradient-to-br',
                        ROLE_META[selectedUser.role as keyof typeof ROLE_META]?.avatarRing || 'from-slate-500 to-slate-600'
                      )}
                    >
                      {selectedUser.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-lg sm:text-xl font-headline font-bold truncate">
                      {selectedUser.name}
                    </DialogTitle>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <RoleBadge role={selectedUser.role} />
                      <span className="text-xs text-muted-foreground font-mono">
                        ID: {selectedUser.userId}
                      </span>
                    </div>
                  </div>
                </div>
                <DialogDescription className="text-xs text-muted-foreground">
                  View credentials and copy or share login details directly to WhatsApp.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 sm:space-y-4 py-2">
                {/* Credentials Quick Info */}
                <div className="rounded-2xl border border-border/60 bg-muted/25 p-3.5 sm:p-4 space-y-2.5 sm:space-y-3">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Account Credentials
                  </span>

                  {/* User ID */}
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-background/80 border border-border/40">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-muted-foreground">User ID</p>
                      <p className="font-mono text-xs sm:text-sm font-semibold truncate">{selectedUser.userId}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyDetailField('userId', selectedUser.userId, 'User ID')}
                      className="h-8 gap-1.5 text-xs rounded-lg shrink-0"
                    >
                      {copiedDetailField === 'userId' ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Password */}
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-background/80 border border-border/40">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-muted-foreground">Password</p>
                      <p className="font-mono text-xs sm:text-sm font-semibold tracking-wider truncate">
                        {showDetailPassword ? selectedUser.password : '••••••••••••'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDetailPassword((prev) => !prev)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground rounded-lg"
                        title={showDetailPassword ? 'Hide password' : 'Show password'}
                      >
                        {showDetailPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyDetailField('password', selectedUser.password, 'Password')}
                        className="h-8 gap-1.5 text-xs rounded-lg"
                      >
                        {copiedDetailField === 'password' ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Login Link */}
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-background/80 border border-border/40">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-muted-foreground">Login Portal URL</p>
                      <p className="font-mono text-[11px] sm:text-xs text-primary truncate">
                        {typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        asChild
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground rounded-lg"
                        title="Open login page in new tab"
                      >
                        <a
                          href={typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login'}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handleCopyDetailField(
                            'loginUrl',
                            typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login',
                            'Login URL'
                          )
                        }
                        className="h-8 gap-1.5 text-xs rounded-lg"
                      >
                        {copiedDetailField === 'loginUrl' ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* WhatsApp Share Card */}
                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-3.5 sm:p-4 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <WhatsAppIcon className="h-4 w-4 fill-emerald-600 dark:fill-emerald-400" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-semibold text-foreground">WhatsApp Sharing</h4>
                      <p className="text-[10px] sm:text-[11px] text-muted-foreground">
                        Formatted message with credentials and login link
                      </p>
                    </div>
                  </div>

                  {/* Preview container */}
                  <div className="relative rounded-xl border border-border/50 bg-background/90 p-3 max-h-36 sm:max-h-44 overflow-y-auto">
                    <pre className="font-sans text-[11px] sm:text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed select-all">
                      {generateWhatsAppText(selectedUser)}
                    </pre>
                  </div>

                  {/* WhatsApp Action Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <Button
                      type="button"
                      onClick={() => handleCopyWhatsAppText(selectedUser)}
                      className={cn(
                        'w-full rounded-xl transition-all h-10 text-xs sm:text-sm',
                        copiedWhatsApp
                          ? 'bg-emerald-600 hover:bg-emerald-600 text-white'
                          : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-500/20'
                      )}
                    >
                      {copiedWhatsApp ? (
                        <>
                          <Check className="mr-2 h-4 w-4" /> Message Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="mr-2 h-4 w-4" /> Copy for WhatsApp
                        </>
                      )}
                    </Button>

                    <Button
                      type="button"
                      onClick={() => handleOpenWhatsApp(selectedUser)}
                      variant="outline"
                      className="w-full rounded-xl border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50 h-10 text-xs sm:text-sm"
                    >
                      <WhatsAppIcon className="mr-2 h-4 w-4 fill-emerald-600 dark:fill-emerald-400" />
                      Send via WhatsApp
                    </Button>
                  </div>
                </div>
              </div>

              <DialogFooter className="flex flex-row items-center justify-between sm:justify-between gap-2 pt-3 border-t border-border/50">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const u = selectedUser;
                    setSelectedUser(null);
                    handleEdit(u);
                  }}
                  className="rounded-xl gap-1.5 text-xs"
                >
                  <Edit className="h-3.5 w-3.5" /> Edit Account
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedUser(null)}
                  className="rounded-xl text-xs"
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent className="w-[94vw] sm:max-w-[440px] bg-background/95 backdrop-blur-xl border-border/60 p-4 sm:p-6 rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg sm:text-xl">Are you sure?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm">
              This action cannot be undone. This will permanently delete the
              user account for <span className="font-semibold text-foreground">{userToDelete?.name}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <AlertDialogCancel className="w-full sm:w-auto mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="w-full sm:w-auto bg-destructive hover:bg-destructive/90"
            >
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
